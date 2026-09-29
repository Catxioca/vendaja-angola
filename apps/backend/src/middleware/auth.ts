import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { verifyAuthorizationGrant } from "../services/grants.js";
import { getEnv } from "../config/env.js";
export interface AuthRequest extends Express.Request { user?: { id: string; role: string }; context?: { companyId: string; branchId: string | null; membershipId: string; role: string } }
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "missing_token", message: "Sessão não encontrada. Por favor, faça login novamente." }); return; }
  try { (req as AuthRequest).user = jwt.verify(token, getEnv().JWT_SECRET) as { id: string; role: string }; next(); }
  catch (error) { console.warn("[auth] rejected bearer token", { path: req.path, reason: error instanceof Error ? error.message : "invalid_token" }); res.status(401).json({ error: "invalid_token", message: "Sessão expirada. Por favor, faça login novamente." }); }
};
export const requireCompanyContext: RequestHandler = async (req, res, next) => {
  const auth = req as AuthRequest;
  const requestedCompanyId = req.header("x-company-id") ?? undefined;
  const requestedBranchId = req.header("x-branch-id") ?? undefined;
  if (!auth.user?.id) { res.status(401).json({ error: "missing_token" }); return; }
  try {
    const { prisma } = await import("../db.js");
    const memberships = await prisma.companyMembership.findMany({
      where: { userId: auth.user.id, active: true, ...(requestedCompanyId ? { companyId: requestedCompanyId } : {}), ...(requestedBranchId ? { branchId: requestedBranchId } : {}) },
      select: { id: true, companyId: true, branchId: true, role: true },
      take: 2,
    });
    if (!memberships.length) { res.status(403).json({ error: "company_context_forbidden" }); return; }
    if (memberships.length > 1) { res.status(400).json({ error: "company_context_required", message: "Selecione explicitamente a empresa e filial ativas." }); return; }
    const membership = memberships[0]!;
    auth.context = { companyId: membership.companyId, branchId: membership.branchId, membershipId: membership.id, role: membership.role };
    next();
  } catch (error) { next(error); }
};

/** Returns the server-authorized tenant scope. Never derive it from request body or URL. */
export function companyContext(req: Express.Request): NonNullable<AuthRequest["context"]> {
  const context = (req as AuthRequest).context;
  if (!context) throw new Error("company_context_required");
  return context;
}
export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
  const role = normalizeRole((req as AuthRequest).user?.role);
  if (!roles.map(normalizeRole).includes(role)) { res.status(403).json({ error: "forbidden", message: "Não tem permissão para esta operação." }); return; }
  next();
};
export type AppModule = "POS" | "STOCK" | "HR" | "ACCOUNTING" | "DASHBOARD" | "SETTINGS";
const moduleRoles: Record<AppModule, string[]> = {
  POS: ["ROLE_ADMIN", "ROLE_CASHIER"],
  STOCK: ["ROLE_ADMIN"],
  HR: ["ROLE_ADMIN", "ROLE_HR"],
  ACCOUNTING: ["ROLE_ADMIN", "ROLE_ACCOUNTANT"],
  DASHBOARD: ["ROLE_ADMIN", "ROLE_CASHIER", "ROLE_HR", "ROLE_ACCOUNTANT"],
  SETTINGS: ["ROLE_ADMIN"],
};
export function normalizeRole(role?: string): string {
  const value = (role ?? "").toUpperCase();
  if (value === "ADMIN") return "ROLE_ADMIN";
  if (value === "OPERATOR" || value === "CASHIER") return "ROLE_CASHIER";
  if (value === "HR") return "ROLE_HR";
  if (value === "ACCOUNTANT" || value === "ACCOUNTING") return "ROLE_ACCOUNTANT";
  return value.startsWith("ROLE_") ? value : `ROLE_${value}`;
}
export const requireModuleAccess = (module: AppModule): RequestHandler => (req, res, next) => {
  const role = normalizeRole((req as AuthRequest).user?.role);
  if (!moduleRoles[module].includes(role)) {
    res.status(403).json({ error: "module_forbidden", module, message: "O seu perfil não tem acesso a este módulo." });
    return;
  }
  next();
};
export const requireAdminOrGrant = (action: string): RequestHandler => (req, res, next) => {
  const user = (req as AuthRequest).user;
  const role = user?.role?.toUpperCase();
  if (role === "ADMIN" || role === "SUPERVISOR") { next(); return; }
  const grant = req.header("x-admin-authorization");
  if (!grant) {
    res.status(403).json({ error: "admin_authorization_required", action, stage: "PERMISSION" });
    return;
  }
  try {
    verifyAuthorizationGrant(grant, action, typeof req.params.id === "string" ? req.params.id : undefined);
    next();
  } catch (error) {
    res.status(403).json({
      error: "invalid_admin_authorization",
      action,
      stage: "PERMISSION",
      details: error instanceof Error ? error.message : "grant_verification_failed",
    });
  }
};
