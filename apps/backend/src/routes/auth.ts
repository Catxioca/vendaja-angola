import { Router } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { issueAuthorizationGrant } from "../services/grants.js";
import { audit, hashPassword, issueTokens, persistRefreshToken, tokenHash, verifyPassword } from "../services/security.js";
export const authRouter = Router();
const credentials = z.object({ identifier: z.string().min(1).optional(), email: z.string().email().optional(), password: z.string().min(4), mode: z.enum(["password", "pin"]).default("password") }).refine((v) => v.identifier || v.email, "identifier required");
authRouter.post("/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "invalid_credentials" }); return; }
  const identifier = (parsed.data.identifier ?? parsed.data.email!).trim();
  const normalizedIdentifier = identifier.toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }] } });
  const validCredential = user && parsed.data.mode === "pin"
    ? !!user.pinHash && parsed.data.password.length === 6 && await verifyPassword(parsed.data.password, user.pinHash)
    : !!user && await verifyPassword(parsed.data.password, user.passwordHash);
  if (!user || !validCredential) { await audit("LOGIN_FAILED", user?.id); res.status(401).json({ error: "invalid_credentials" }); return; }
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
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: tokenHash(parsed.data.refreshToken) }, include: { user: true } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) { res.status(401).json({ error: "invalid_refresh_token" }); return; }
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
    where: { role: { in: ["ADMIN", "admin", "SUPERVISOR", "supervisor"] } },
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
