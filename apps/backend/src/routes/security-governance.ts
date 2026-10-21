import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  normalizeRole,
  type AuthRequest,
} from "../middleware/auth.js";
import {
  EnterpriseAuditService,
  EnterpriseRbacService,
  EnterpriseMfaService,
  EnterpriseSessionService,
  EnterprisePolicyService,
  EnterpriseBackupService,
} from "../services/enterprise/index.js";
import { verifyPassword } from "../services/security.js";

export const securityGovernanceRouter = Router();

// Helper to check if requester has administrative privileges
function requireAdmin(req: Express.Request, res: import("express").Response): boolean {
  const role = normalizeRole((req as AuthRequest).context?.role ?? (req as AuthRequest).user?.role);
  if (role !== "ROLE_ADMIN" && role !== "ROLE_SUPERVISOR") {
    res.status(403).json({
      error: "forbidden",
      message: "Esta operação requer privilégios de Administrador de Governança ou Segurança.",
    });
    return false;
  }
  return true;
}

// Helper to extract companyId from request header or auth context
function resolveCompanyId(req: import("express").Request): string | undefined {
  const auth = req as AuthRequest;
  const headerVal = req.header ? req.header("x-company-id") : (req.headers && req.headers["x-company-id"]);
  return (
    auth.context?.companyId ??
    (typeof headerVal === "string" ? headerVal : undefined)
  );
}

// =========================================================================
// 1. AUDITORIA FORENSE CORPORATIVA
// =========================================================================

securityGovernanceRouter.get("/audit", requireAuth, async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { userId, module, action, entity, startDate, endDate, limit, skip } = req.query;

  const result = await EnterpriseAuditService.query({
    companyId,
    userId: typeof userId === "string" ? userId : undefined,
    module: typeof module === "string" ? module : undefined,
    action: typeof action === "string" ? action : undefined,
    entity: typeof entity === "string" ? entity : undefined,
    startDate: typeof startDate === "string" ? startDate : undefined,
    endDate: typeof endDate === "string" ? endDate : undefined,
    limit: limit ? Number(limit) : 50,
    skip: skip ? Number(skip) : 0,
  });

  res.json(result);
});

securityGovernanceRouter.get("/audit/export", requireAuth, async (req, res) => {
  const companyId = resolveCompanyId(req);
  const actor = (req as AuthRequest).user;
  const { userId, module, action, entity, startDate, endDate, format } = req.query;

  await EnterpriseAuditService.recordFromRequest(req, "AUDIT_EXPORTED", {
    userId: actor?.id,
    companyId,
    module: "AUDIT",
    metadata: { format: format || "csv", filters: req.query },
  });

  if (format === "json") {
    const data = await EnterpriseAuditService.query({
      companyId,
      userId: typeof userId === "string" ? userId : undefined,
      module: typeof module === "string" ? module : undefined,
      action: typeof action === "string" ? action : undefined,
      entity: typeof entity === "string" ? entity : undefined,
      startDate: typeof startDate === "string" ? startDate : undefined,
      endDate: typeof endDate === "string" ? endDate : undefined,
      limit: 1000,
    });
    res.setHeader("Content-Disposition", `attachment; filename="auditoria-${Date.now()}.json"`);
    res.json(data.records);
    return;
  }

  const csv = await EnterpriseAuditService.exportCsv({
    companyId,
    userId: typeof userId === "string" ? userId : undefined,
    module: typeof module === "string" ? module : undefined,
    action: typeof action === "string" ? action : undefined,
    entity: typeof entity === "string" ? entity : undefined,
    startDate: typeof startDate === "string" ? startDate : undefined,
    endDate: typeof endDate === "string" ? endDate : undefined,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="auditoria-vendaja-${Date.now()}.csv"`);
  res.send(csv);
});

// =========================================================================
// 2. CONTROLO DE ACESSO BASEADO EM FUNÇÕES (RBAC)
// =========================================================================

securityGovernanceRouter.get("/roles", requireAuth, async (req, res) => {
  const companyId = resolveCompanyId(req);
  const roles = await EnterpriseRbacService.listRoles(companyId);
  res.json(roles);
});

const createRoleInput = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(50).regex(/^[A-Z0-9_]+$/i),
  description: z.string().max(250).optional(),
  permissionCodes: z.array(z.string()).optional(),
});

securityGovernanceRouter.post("/roles", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = createRoleInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_role_payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const companyId = resolveCompanyId(req);
    const actor = (req as AuthRequest).user;
    const role = await EnterpriseRbacService.createRole({
      companyId,
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description,
      permissionCodes: parsed.data.permissionCodes,
    });

    await EnterpriseAuditService.recordFromRequest(req, "ROLE_CREATED", {
      userId: actor?.id,
      companyId,
      module: "SECURITY",
      entity: "Role",
      entityId: role?.id,
      newValue: { name: role?.name, code: role?.code, permissionsCount: role?.rolePermissions?.length },
    });

    res.status(201).json(role);
  } catch (error) {
    res.status(409).json({
      error: "role_creation_failed",
      message: error instanceof Error ? error.message : "Não foi possível criar o perfil.",
    });
  }
});

securityGovernanceRouter.post("/roles/:id/clone", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(50).regex(/^[A-Z0-9_]+$/i),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_clone_payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const companyId = resolveCompanyId(req);
    const actor = (req as AuthRequest).user;
    const roleId = String(req.params.id);
    const cloned = await EnterpriseRbacService.cloneRole(
      roleId,
      parsed.data.name,
      parsed.data.code,
      companyId
    );

    await EnterpriseAuditService.recordFromRequest(req, "ROLE_CLONED", {
      userId: actor?.id,
      companyId,
      module: "SECURITY",
      entity: "Role",
      entityId: cloned?.id,
      metadata: { sourceRoleId: roleId, newCode: parsed.data.code },
    });

    res.status(201).json(cloned);
  } catch (error) {
    res.status(400).json({
      error: "role_clone_failed",
      message: error instanceof Error ? error.message : "Não foi possível clonar o perfil.",
    });
  }
});

securityGovernanceRouter.put("/roles/:id", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().max(250).optional(),
    permissionCodes: z.array(z.string()).optional(),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_update_payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const companyId = resolveCompanyId(req);
    const actor = (req as AuthRequest).user;
    const roleId = String(req.params.id);
    const updated = await EnterpriseRbacService.updateRole(roleId, {
      name: parsed.data.name,
      description: parsed.data.description,
      permissionCodes: parsed.data.permissionCodes,
    });

    await EnterpriseAuditService.recordFromRequest(req, "ROLE_UPDATED", {
      userId: actor?.id,
      companyId,
      module: "SECURITY",
      entity: "Role",
      entityId: updated?.id,
      newValue: { name: updated?.name, permissionsCount: updated?.rolePermissions?.length },
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: "role_update_failed",
      message: error instanceof Error ? error.message : "Não foi possível atualizar o perfil.",
    });
  }
});

securityGovernanceRouter.delete("/roles/:id", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const companyId = resolveCompanyId(req);
    const actor = (req as AuthRequest).user;
    const roleId = String(req.params.id);
    await EnterpriseRbacService.deleteRole(roleId);

    await EnterpriseAuditService.recordFromRequest(req, "ROLE_DELETED", {
      userId: actor?.id,
      companyId,
      module: "SECURITY",
      entity: "Role",
      entityId: roleId,
    });

    res.json({ deleted: true });
  } catch (error) {
    res.status(400).json({
      error: "role_delete_failed",
      message: error instanceof Error ? error.message : "Não foi possível eliminar o perfil.",
    });
  }
});

securityGovernanceRouter.get("/permissions", requireAuth, async (_req, res) => {
  const perms = await EnterpriseRbacService.listPermissions();
  res.json(perms);
});

securityGovernanceRouter.get("/user-permissions", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  const targetUserId = (req.query.userId as string) || actor?.id;

  if (targetUserId !== actor?.id && !requireAdmin(req, res)) return;

  if (!targetUserId) {
    res.status(400).json({ error: "missing_user_id" });
    return;
  }

  const permissions = await EnterpriseRbacService.getUserPermissions(targetUserId);
  res.json({ userId: targetUserId, permissions });
});

securityGovernanceRouter.post("/user-permissions", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    userId: z.string().min(1),
    permissionCode: z.string().min(1),
    granted: z.boolean(),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_permission_override", details: parsed.error.flatten() });
    return;
  }

  try {
    const actor = (req as AuthRequest).user;
    const companyId = resolveCompanyId(req);
    const result = await EnterpriseRbacService.setUserPermissionOverride(
      parsed.data.userId,
      parsed.data.permissionCode,
      parsed.data.granted
    );

    await EnterpriseAuditService.recordFromRequest(req, "USER_PERMISSION_OVERRIDDEN", {
      userId: actor?.id,
      companyId,
      module: "SECURITY",
      entity: "UserPermission",
      entityId: parsed.data.userId,
      metadata: { permissionCode: parsed.data.permissionCode, granted: parsed.data.granted },
    });

    res.json({ updated: true, result });
  } catch (error) {
    res.status(400).json({
      error: "permission_override_failed",
      message: error instanceof Error ? error.message : "Não foi possível aplicar a permissão.",
    });
  }
});

// =========================================================================
// 3. AUTENTICAÇÃO MULTI-FATOR (MFA / 2FA)
// =========================================================================

securityGovernanceRouter.post("/mfa/setup", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  if (!actor?.id) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const setupData = await EnterpriseMfaService.setupMfa(actor.id);
    res.json(setupData);
  } catch (error) {
    res.status(400).json({
      error: "mfa_setup_failed",
      message: error instanceof Error ? error.message : "Falha ao iniciar configuração do 2FA.",
    });
  }
});

securityGovernanceRouter.post("/mfa/enable", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  if (!actor?.id) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const parsed = z.object({ token: z.string().min(6).max(8) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_token", message: "Código TOTP de 6 dígitos obrigatório." });
    return;
  }

  try {
    const result = await EnterpriseMfaService.enableMfa(actor.id, parsed.data.token);
    const companyId = resolveCompanyId(req);

    await EnterpriseAuditService.recordFromRequest(req, "MFA_ENABLED", {
      userId: actor.id,
      companyId,
      module: "SECURITY",
      entity: "User",
      entityId: actor.id,
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: "mfa_enable_failed",
      message: error instanceof Error ? error.message : "Código de verificação incorreto ou expirado.",
    });
  }
});

securityGovernanceRouter.post("/mfa/disable", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  if (!actor?.id) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const parsed = z.object({ password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "password_required", message: "Confirmação de palavra-passe obrigatória." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(403).json({ error: "invalid_password", message: "Palavra-passe de confirmação inválida." });
    return;
  }

  try {
    await EnterpriseMfaService.disableMfa(actor.id);
    const companyId = resolveCompanyId(req);

    await EnterpriseAuditService.recordFromRequest(req, "MFA_DISABLED", {
      userId: actor.id,
      companyId,
      module: "SECURITY",
      entity: "User",
      entityId: actor.id,
    });

    res.json({ disabled: true });
  } catch (error) {
    res.status(400).json({
      error: "mfa_disable_failed",
      message: error instanceof Error ? error.message : "Não foi possível desativar o 2FA.",
    });
  }
});

securityGovernanceRouter.post("/mfa/verify", async (req, res) => {
  const parsed = z.object({
    userId: z.string().min(1),
    code: z.string().min(6).max(9),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: "Identificador de utilizador e código necessários." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    res.status(400).json({ error: "mfa_not_active" });
    return;
  }

  let valid = EnterpriseMfaService.verifyToken(user.mfaSecret, parsed.data.code);
  let usedRecovery = false;

  if (!valid) {
    valid = await EnterpriseMfaService.verifyRecoveryCode(user.id, parsed.data.code);
    if (valid) usedRecovery = true;
  }

  if (!valid) {
    await EnterpriseAuditService.recordFromRequest(req, "MFA_VERIFICATION_FAILED", {
      userId: user.id,
      module: "SECURITY",
      metadata: { codeLength: parsed.data.code.length },
    });
    res.status(401).json({ error: "invalid_mfa_code", message: "Código de autenticação inválido." });
    return;
  }

  await EnterpriseAuditService.recordFromRequest(req, "MFA_VERIFIED", {
    userId: user.id,
    module: "SECURITY",
    metadata: { usedRecovery },
  });

  res.json({ verified: true, usedRecovery });
});

// =========================================================================
// 4. GESTÃO DE SESSÕES ATIVAS
// =========================================================================

securityGovernanceRouter.get("/sessions", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  const companyId = resolveCompanyId(req);
  const role = normalizeRole((req as AuthRequest).context?.role ?? actor?.role);

  // Admins see all company sessions; standard users see only their own sessions
  const sessions = await EnterpriseSessionService.listActiveSessions(
    role === "ROLE_ADMIN" || role === "ROLE_SUPERVISOR"
      ? { companyId }
      : { userId: actor?.id }
  );

  res.json(sessions);
});

securityGovernanceRouter.delete("/sessions/:id", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  const sessionId = String(req.params.id);
  const success = await EnterpriseSessionService.revokeSession(sessionId, actor?.id);

  if (!success) {
    res.status(404).json({ error: "session_not_found" });
    return;
  }

  res.json({ revoked: true });
});

securityGovernanceRouter.post("/sessions/revoke-others", requireAuth, async (req, res) => {
  const actor = (req as AuthRequest).user;
  const currentToken = req.header("authorization")?.replace(/^Bearer\s+/i, "");

  if (!actor?.id || !currentToken) {
    res.status(400).json({ error: "missing_credentials" });
    return;
  }

  const revokedCount = await EnterpriseSessionService.revokeAllOtherSessions(actor.id, currentToken);
  res.json({ revokedCount });
});

// =========================================================================
// 5. POLÍTICAS DE SEGURANÇA CORPORATIVAS
// =========================================================================

securityGovernanceRouter.get("/policy", requireAuth, async (req, res) => {
  const companyId = resolveCompanyId(req);
  const policy = await EnterprisePolicyService.getPolicy(companyId);
  res.json(policy);
});

securityGovernanceRouter.put("/policy", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const companyId = resolveCompanyId(req);
  if (!companyId) {
    res.status(400).json({ error: "company_context_required", message: "Empresa não identificada no contexto." });
    return;
  }

  const parsed = z.object({
    minPasswordLength: z.number().int().min(6).max(32).optional(),
    requireUppercase: z.boolean().optional(),
    requireLowercase: z.boolean().optional(),
    requireNumbers: z.boolean().optional(),
    requireSpecialChars: z.boolean().optional(),
    passwordExpiryDays: z.number().int().min(0).max(365).optional(),
    preventPasswordReuseCount: z.number().int().min(0).max(24).optional(),
    maxFailedLogins: z.number().int().min(3).max(20).optional(),
    lockoutDurationMinutes: z.number().int().min(1).max(1440).optional(),
    sessionInactivityMinutes: z.number().int().min(5).max(480).optional(),
    mfaMandatoryRoles: z.array(z.string()).optional(),
    ipWhitelist: z.array(z.string()).optional(),
    allowedWorkingHoursStart: z.string().nullable().optional(),
    allowedWorkingHoursEnd: z.string().nullable().optional(),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_policy_payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const actor = (req as AuthRequest).user;
    const updated = await EnterprisePolicyService.updatePolicy(companyId, parsed.data);

    await EnterpriseAuditService.recordFromRequest(req, "SECURITY_POLICY_UPDATED", {
      userId: actor?.id,
      companyId,
      module: "SECURITY",
      entity: "SecurityPolicy",
      entityId: updated.id,
      newValue: parsed.data,
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: "policy_update_failed",
      message: error instanceof Error ? error.message : "Falha ao atualizar políticas de segurança.",
    });
  }
});

// =========================================================================
// 6. CÓPIAS DE SEGURANÇA (ENTERPRISE BACKUPS)
// =========================================================================

securityGovernanceRouter.get("/backup", requireAuth, async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { limit, skip } = req.query;

  const backups = await EnterpriseBackupService.listBackups({
    companyId,
    limit: limit ? Number(limit) : 20,
    skip: skip ? Number(skip) : 0,
  });

  res.json(backups);
});

securityGovernanceRouter.post("/backup", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const companyId = resolveCompanyId(req);
  const actor = (req as AuthRequest).user;
  const parsed = z.object({ description: z.string().max(250).optional() }).safeParse(req.body);

  try {
    const record = await EnterpriseBackupService.createBackup({
      companyId,
      trigger: "MANUAL",
      description: parsed.success ? parsed.data.description : undefined,
    });

    await EnterpriseAuditService.recordFromRequest(req, "BACKUP_CREATED", {
      userId: actor?.id,
      companyId,
      module: "BACKUP",
      entity: "BackupRecord",
      entityId: record.id,
      metadata: { filename: record.filename, sizeBytes: Number(record.sizeBytes) },
    });

    res.status(201).json({
      ...record,
      sizeBytes: Number(record.sizeBytes),
    });
  } catch (error) {
    res.status(500).json({
      error: "backup_failed",
      message: error instanceof Error ? error.message : "Falha ao criar cópia de segurança.",
    });
  }
});

securityGovernanceRouter.post("/backup/:id/restore", requireAuth, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const actor = (req as AuthRequest).user;
  const companyId = resolveCompanyId(req);
  const backupId = String(req.params.id);

  try {
    const result = await EnterpriseBackupService.restoreBackup(backupId);

    await EnterpriseAuditService.recordFromRequest(req, "BACKUP_RESTORED", {
      userId: actor?.id,
      companyId,
      module: "BACKUP",
      entity: "BackupRecord",
      entityId: backupId,
      metadata: result,
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: "restore_failed",
      message: error instanceof Error ? error.message : "Falha ao restaurar cópia de segurança.",
    });
  }
});

securityGovernanceRouter.get("/backup/metrics", requireAuth, async (req, res) => {
  const companyId = resolveCompanyId(req);
  const metrics = await EnterpriseBackupService.getStorageMetrics(companyId);
  res.json(metrics);
});

// =========================================================================
// 7. PAINEL DE GOVERNANÇA (METRICS & SUMMARY)
// =========================================================================

securityGovernanceRouter.get("/summary", requireAuth, async (req, res) => {
  const companyId = resolveCompanyId(req);

  const [
    totalUsers,
    mfaUsers,
    activeSessionsCount,
    totalAuditLogs,
    latestBackups,
    recentAudits,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { mfaEnabled: true } }),
    prisma.activeSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.auditLog.count({ where: companyId ? { companyId } : {} }),
    prisma.backupRecord.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    EnterpriseAuditService.query({
      companyId,
      limit: 8,
    }),
  ]);

  const lastBackup = latestBackups[0];
  const mfaAdoptionPercent = totalUsers > 0 ? Math.round((mfaUsers / totalUsers) * 100) : 0;

  res.json({
    metrics: {
      totalUsers,
      mfaUsers,
      mfaAdoptionPercent,
      activeSessionsCount,
      totalAuditLogs,
      lastBackup: lastBackup
        ? {
            id: lastBackup.id,
            filename: lastBackup.filename,
            status: lastBackup.status,
            createdAt: lastBackup.createdAt.toISOString(),
            sizeBytes: Number(lastBackup.sizeBytes),
          }
        : null,
    },
    recentAudits: recentAudits.records,
  });
});
