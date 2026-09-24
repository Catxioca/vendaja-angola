import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { normalizeRole, requireAuth, type AuthRequest } from "../middleware/auth.js";
import { issueAuthorizationGrant } from "../services/grants.js";
import { audit, getLoginRateLimitState, hashPassword, issueTokens, persistRefreshToken, registerFailedLogin, registerSuccessfulLogin, tokenHash, verifyPassword } from "../services/security.js";
import { distributedRateLimit } from "../middleware/rate-limit.js";
export const authRouter = Router();
authRouter.use(distributedRateLimit({ name: "auth", limit: 30, windowMs: 60_000 }));
authRouter.post("/verify-admin-pin", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  const parsed = z.object({ credential: z.string().min(1), mode: z.enum(["password", "pin"]).default("pin") }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_admin_credential", message: "Introduza a senha ou PIN mestre do Administrador." }); return; }
  try {
    const administrators = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "admin", "ROLE_ADMIN"] } } });
    const valid = (await Promise.all(administrators.map((user) => parsed.data.mode === "pin"
      ? user.pinHash ? verifyPassword(parsed.data.credential, user.pinHash) : false
      : verifyPassword(parsed.data.credential, user.passwordHash)))).some(Boolean);
    if (!valid) { await audit("ADMIN_SETTINGS_AUTH_FAILED", actor?.id, "AUTHORIZATION", undefined, { mode: parsed.data.mode }); res.status(403).json({ error: "invalid_admin_credential", message: "Senha ou PIN mestre do Administrador inválido." }); return; }
    await audit("ADMIN_SETTINGS_AUTHORIZED", actor?.id, "AUTHORIZATION", undefined, { mode: parsed.data.mode });
    res.json({ authorized: true });
  } catch (error) { console.error("[auth/verify-admin-pin] failed", error); res.status(500).json({ error: "admin_auth_failed", message: "Não foi possível validar a credencial do Administrador." }); }
});
const managedRole = z.enum(["ROLE_ADMIN", "ROLE_CASHIER", "ROLE_HR", "ROLE_ACCOUNTANT"]);
const managedUserInput = z.object({
  username: z.string().min(2).max(80),
  email: z.string().email(),
  displayName: z.string().min(2).max(160),
  role: managedRole,
  pin: z.string().regex(/^\d{4,6}$/).optional(),
});
const requireUserManagement = (req: Express.Request, res: import("express").Response): boolean => {
  if (normalizeRole((req as AuthRequest).user?.role) !== "ROLE_ADMIN") {
    res.status(403).json({ error: "forbidden", message: "A gestão de utilizadores é exclusiva do Administrador." });
    return false;
  }
  return true;
};
authRouter.get("/users", requireAuth, async (req, res) => {
  if (!requireUserManagement(req, res)) return;
  const users = await prisma.user.findMany({ select: { id: true, username: true, email: true, displayName: true, role: true, nif: true, phone: true, createdAt: true }, orderBy: { displayName: "asc" } });
  res.json(users);
});
authRouter.post("/users", requireAuth, async (req, res) => {
  if (!requireUserManagement(req, res)) return;
  const parsed = managedUserInput.safeParse(req.body);
  if (!parsed.success || (parsed.data.pin && !/^\d{4,6}$/.test(parsed.data.pin))) { res.status(400).json({ error: "invalid_user", message: "Dados do utilizador ou PIN inválidos." }); return; }
  try {
    const user = await prisma.user.create({
      data: { username: parsed.data.username, email: parsed.data.email.toLowerCase(), displayName: parsed.data.displayName, role: parsed.data.role, passwordHash: await hashPassword(`${crypto.randomUUID()}-managed`), ...(parsed.data.pin ? { pinHash: await hashPassword(parsed.data.pin) } : {}) },
      select: { id: true, username: true, email: true, displayName: true, role: true, nif: true, phone: true, createdAt: true },
    });
    await audit("USER_CREATED", (req as AuthRequest).user?.id, "USER", user.id, { role: user.role });
    res.status(201).json(user);
  } catch (error) { console.error("[users] create failed", error); res.status(409).json({ error: "user_create_failed", message: "Não foi possível criar o utilizador." }); }
});
authRouter.patch("/users/:id", requireAuth, async (req, res) => {
  if (!requireUserManagement(req, res)) return;
  const parsed = managedUserInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_user", message: "Dados do utilizador inválidos." }); return; }
  try {
    const { pin, ...fields } = parsed.data;
    const user = await prisma.user.update({ where: { id: String(req.params.id) }, data: { ...fields, ...(fields.email ? { email: fields.email.toLowerCase() } : {}), ...(pin ? { pinHash: await hashPassword(pin) } : {}) }, select: { id: true, username: true, email: true, displayName: true, role: true, nif: true, phone: true, createdAt: true } });
    await audit("USER_UPDATED", (req as AuthRequest).user?.id, "USER", user.id, { role: user.role });
    res.json(user);
  } catch (error) { console.error("[users] update failed", error); res.status(409).json({ error: "user_update_failed", message: "Não foi possível atualizar o utilizador." }); }
});
authRouter.get("/attendants", requireAuth, async (req, res) => {
  if (!["ROLE_ADMIN", "ROLE_HR"].includes(normalizeRole((req as AuthRequest).user?.role))) { res.status(403).json({ error: "forbidden" }); return; }
  const users = await prisma.user.findMany({ where: { role: { notIn: ["ADMIN", "ROLE_ADMIN"] } }, select: { id: true, username: true, displayName: true, nif: true, phone: true, role: true, createdAt: true }, orderBy: { displayName: "asc" } });
  res.json(users);
});
authRouter.post("/attendants", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  if (!["ROLE_ADMIN", "ROLE_HR"].includes(normalizeRole(actor?.role))) { res.status(403).json({ error: "forbidden" }); return; }
  const parsed = z.object({ displayName: z.string().min(2), nif: z.string().min(5), phone: z.string().min(7), pin: z.string().regex(/^\d{4,6}$/), username: z.string().min(2).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_attendant", message: "Nome, NIF, telefone e PIN de 4 a 6 dígitos são obrigatórios." }); return; }
  try {
    const administrators = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "admin", "ROLE_ADMIN"] }, pinHash: { not: null } }, select: { pinHash: true } });
    if ((await Promise.all(administrators.map((administrator) => administrator.pinHash ? verifyPassword(parsed.data.pin, administrator.pinHash) : false))).some(Boolean)) { res.status(409).json({ error: "attendant_pin_conflict", message: "O PIN individual deve ser diferente do PIN mestre do Administrador." }); return; }
    const username = parsed.data.username ?? `atendedor-${Date.now()}`;
    const user = await prisma.user.create({ data: { username, email: `${username}@local.vendaja`, displayName: parsed.data.displayName, nif: parsed.data.nif, phone: parsed.data.phone, pinHash: await hashPassword(parsed.data.pin), passwordHash: await hashPassword(`${crypto.randomUUID()}-disabled`), role: "ROLE_CASHIER" }, select: { id: true, username: true, displayName: true, nif: true, phone: true, role: true } });
    await audit("ATTENDANT_CREATED", actor?.id, "USER", user.id, { username });
    res.status(201).json(user);
  } catch (error) { console.error("[attendants] create failed", error); res.status(409).json({ error: "attendant_create_failed", message: "Não foi possível cadastrar o atendedor." }); }
});
authRouter.patch("/attendants/:id", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  if (!["ROLE_ADMIN", "ROLE_HR"].includes(normalizeRole(actor?.role))) { res.status(403).json({ error: "forbidden" }); return; }
  const parsed = z.object({ displayName: z.string().min(2), nif: z.string().min(5), phone: z.string().min(7), pin: z.string().regex(/^\d{4,6}$/).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_attendant", message: "Dados do atendedor inválidos." }); return; }
  const user = await prisma.user.update({ where: { id: String(req.params.id) }, data: { displayName: parsed.data.displayName, nif: parsed.data.nif, phone: parsed.data.phone, ...(parsed.data.pin ? { pinHash: await hashPassword(parsed.data.pin) } : {}) }, select: { id: true, username: true, displayName: true, nif: true, phone: true, role: true } });
  await audit("ATTENDANT_UPDATED", actor?.id, "USER", user.id);
  res.json(user);
});
const credentials = z.object({ identifier: z.string().min(1).optional(), email: z.string().email().optional(), password: z.string().min(4), mode: z.enum(["password", "pin"]).default("password") }).refine((v) => v.identifier || v.email, "identifier required");
authRouter.post("/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "invalid_credentials" }); return; }
  const identifier = (parsed.data.identifier ?? parsed.data.email!).trim();
  const normalizedIdentifier = identifier.toLowerCase();
  const key = `login:${normalizedIdentifier}`;
  const rateLimit = getLoginRateLimitState(key);
  if (rateLimit.blocked) {
    await audit("LOGIN_BLOCKED", undefined, "USER", undefined, { identifier: normalizedIdentifier, reason: "rate_limit" });
    res.status(429).json({ error: "too_many_attempts", retryAfterMs: rateLimit.remaining });
    return;
  }
  const user = await prisma.user.findFirst({ where: { OR: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }] } });
  const validCredential = user && parsed.data.mode === "pin"
    ? !!user.pinHash && parsed.data.password.length === 6 && await verifyPassword(parsed.data.password, user.pinHash)
    : !!user && await verifyPassword(parsed.data.password, user.passwordHash);
  if (!user || !validCredential) {
    const result = registerFailedLogin(key);
    await audit("LOGIN_FAILED", user?.id, "USER", user?.id, { identifier: normalizedIdentifier, mode: parsed.data.mode, attempts: result.attempts, rateLimited: result.blocked });
    if (result.blocked) {
      res.status(429).json({ error: "too_many_attempts", retryAfterMs: result.remainingMs });
      return;
    }
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  registerSuccessfulLogin(key);
  const tokens = issueTokens(user); await persistRefreshToken(user.id, tokens.refreshToken); await audit("LOGIN", user.id);
  res.json({
    ...tokens,
    token: tokens.accessToken,
    user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName, role: user.role, authMethod: parsed.data.mode },
  });
});
authRouter.post("/logout", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  const refreshToken = z.object({ refreshToken: z.string().optional() }).safeParse(req.body).data?.refreshToken;
  if (refreshToken) await prisma.refreshToken.updateMany({ where: { tokenHash: tokenHash(refreshToken), userId: actor?.id }, data: { revokedAt: new Date() } });
  else if (actor) await prisma.refreshToken.updateMany({ where: { userId: actor.id, revokedAt: null }, data: { revokedAt: new Date() } });
  res.json({ loggedOut: true });
});
authRouter.post("/refresh", async (req, res) => {
  const parsed = z.object({ refreshToken: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_refresh_token" }); return; }
  const hash = tokenHash(parsed.data.refreshToken);
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) {
    await audit("REFRESH_TOKEN_REJECTED", undefined, "REFRESH_TOKEN", undefined, { reason: row ? "expired_or_revoked" : "missing" });
    res.status(401).json({ error: "invalid_refresh_token" });
    return;
  }
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  const tokens = issueTokens(row.user); await persistRefreshToken(row.userId, tokens.refreshToken); res.json(tokens);
});
authRouter.post("/authorize", requireAuth, async (req, res) => {
  const parsed = z.object({
    password: z.string().min(1).optional(),
    credential: z.string().min(1).optional(),
    mode: z.enum(["password", "pin", "auto"]).default("auto"),
    action: z.string().min(1),
    entityId: z.string().optional(),
  }).refine((value) => Boolean(value.password ?? value.credential), "credential required").safeParse(req.body);
  const actor = (req as AuthRequest).user;
  const action = parsed.success ? parsed.data.action : "invalid";
  const credential = parsed.success ? parsed.data.credential ?? parsed.data.password ?? "" : "";
  if (!parsed.success) {
    console.warn("[authorization] rejected request", { actorId: actor?.id, stage: "AUTHENTICATION", action });
    await audit("AUTHORIZATION_FAILED", actor?.id, "AUTHORIZATION", undefined, { action, stage: "AUTHENTICATION", reason: "invalid_request" });
    res.status(400).json({ error: "invalid_authorization_request", stage: "AUTHENTICATION", details: parsed.error.flatten() });
    return;
  }

  const supervisors = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "admin", "ROLE_ADMIN", "SUPERVISOR", "supervisor"] } },
  });
  let authorizedUser: typeof supervisors[number] | undefined;
  let credentialMode: "password" | "pin" = parsed.data.mode === "pin" ? "pin" : "password";
  for (const supervisor of supervisors) {
    if (parsed.data.mode === "pin" || (parsed.data.mode === "auto" && /^\d{6}$/.test(credential))) {
      if (supervisor.pinHash && await verifyPassword(credential, supervisor.pinHash)) {
        authorizedUser = supervisor;
        credentialMode = "pin";
        break;
      }
    }
    if (parsed.data.mode !== "pin" && await verifyPassword(credential, supervisor.passwordHash)) {
      authorizedUser = supervisor;
      credentialMode = "password";
      break;
    }
  }

  if (!authorizedUser) {
    console.warn("[authorization] supervisor credential mismatch", { actorId: actor?.id, stage: "AUTHENTICATION", action, mode: credentialMode });
    await audit("AUTHORIZATION_FAILED", actor?.id, "AUTHORIZATION", undefined, {
      action,
      stage: "AUTHENTICATION",
      mode: credentialMode,
      reason: "supervisor_credential_mismatch",
    });
    res.status(403).json({ error: "authorization_required", stage: "AUTHENTICATION", details: "supervisor_credential_mismatch" });
    return;
  }

  await audit("AUTHORIZATION_GRANTED", actor?.id, "AUTHORIZATION", undefined, {
    action,
    stage: "AUTHENTICATION",
    mode: credentialMode,
    supervisorId: authorizedUser.id,
  });
  console.info("[authorization] granted", { actorId: actor?.id, supervisorId: authorizedUser.id, action, mode: credentialMode });
  res.json({
    authorized: true,
    adminId: authorizedUser.id,
    authorizationToken: issueAuthorizationGrant(authorizedUser.id, action, parsed.data.entityId),
  });
});
authRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = z.object({ username: z.string().min(2).max(80), displayName: z.string().min(1).max(120), currentPassword: z.string().optional(), currentPin: z.string().regex(/^\d{6}$/).optional(), newPassword: z.string().min(8).optional(), newPin: z.string().regex(/^\d{6}$/).optional() }).safeParse(req.body);
  const actor = (req as AuthRequest).user;
  if (!parsed.success || !actor) { res.status(400).json({ error: "invalid_profile" }); return; }
  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user) { res.status(403).json({ error: "invalid_password" }); return; }
  const currentCredential = parsed.data.currentPassword || parsed.data.currentPin;
  const validCurrent = currentCredential && (parsed.data.currentPin
    ? !!user.pinHash && await verifyPassword(currentCredential, user.pinHash)
    : await verifyPassword(currentCredential, user.passwordHash));
  if (!validCurrent) { res.status(403).json({ error: parsed.data.currentPin ? "invalid_pin" : "invalid_password" }); return; }
  if (!parsed.data.newPassword && !parsed.data.newPin) { res.status(400).json({ error: "no_changes" }); return; }
  const passwordHash = parsed.data.newPassword ? await hashPassword(parsed.data.newPassword) : user.passwordHash;
  const pinHash = parsed.data.newPin ? await hashPassword(parsed.data.newPin) : user.pinHash;
  await prisma.user.update({ where: { id: user.id }, data: { username: parsed.data.username, displayName: parsed.data.displayName, passwordHash, pinHash } });
  await audit("PROFILE_UPDATED", user.id, "USER", user.id);
  res.json({ updated: true });
});
