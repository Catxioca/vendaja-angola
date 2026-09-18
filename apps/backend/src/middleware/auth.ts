import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { verifyAuthorizationGrant } from "../services/grants.js";
export interface AuthRequest extends Express.Request { user?: { id: string; role: string } }
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "missing_token", message: "Sessão não encontrada. Por favor, faça login novamente." }); return; }
  try { (req as AuthRequest).user = jwt.verify(token, process.env.JWT_SECRET ?? "development-only-change-me") as { id: string; role: string }; next(); }
  catch (error) { console.warn("[auth] rejected bearer token", { path: req.path, reason: error instanceof Error ? error.message : "invalid_token" }); res.status(401).json({ error: "invalid_token", message: "Sessão expirada. Por favor, faça login novamente." }); }
};
export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
  if (!roles.includes(((req as AuthRequest).user?.role ?? "").toUpperCase())) { res.status(403).json({ error: "forbidden" }); return; }
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
