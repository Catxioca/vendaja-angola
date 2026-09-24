import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getEnv } from "../config/env.js";
export { issueAuthorizationGrant, verifyAuthorizationGrant } from "./grants.js";

const loginFailureTracker = new Map<string, { count: number; firstFailureAt: number; blockedUntil?: number }>();

export const hashPassword = (value: string) => bcrypt.hash(value, 12);
export const verifyPassword = (value: string, hash: string) => bcrypt.compare(value, hash);

export function getLoginRateLimitState(key: string) {
  const now = Date.now();
  const state = loginFailureTracker.get(key);
  if (!state) return { blocked: false, remaining: 0 };
  if (state.blockedUntil && state.blockedUntil > now) {
    return { blocked: true, remaining: Math.max(0, state.blockedUntil - now) };
  }
  if (state.blockedUntil && state.blockedUntil <= now) {
    loginFailureTracker.delete(key);
  }
  return { blocked: false, remaining: 0 };
}

export function registerFailedLogin(key: string, maxAttempts = 5, lockoutMs = 15 * 60 * 1000) {
  const now = Date.now();
  const state = loginFailureTracker.get(key) ?? { count: 0, firstFailureAt: now };
  const next = {
    count: state.count + 1,
    firstFailureAt: state.count === 0 ? now : state.firstFailureAt,
    blockedUntil: undefined as number | undefined,
  };
  if (next.count >= maxAttempts) {
    next.blockedUntil = now + lockoutMs;
  }
  loginFailureTracker.set(key, next);
  return {
    blocked: Boolean(next.blockedUntil && next.blockedUntil > now),
    remainingMs: next.blockedUntil ? Math.max(0, next.blockedUntil - now) : 0,
    attempts: next.count,
  };
}

export function registerSuccessfulLogin(key: string) {
  loginFailureTracker.delete(key);
}

export function issueTokens(user: { id: string; role: string }) {
  const accessToken = jwt.sign({ id: user.id, role: user.role }, getEnv().JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  return { accessToken, refreshToken };
}
export async function persistRefreshToken(userId: string, token: string) {
  await prisma.refreshToken.create({ data: { userId, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 30 * 86400000) } });
}
export const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export async function audit(
  action: string,
  userId?: string,
  entity?: string,
  entityId?: string,
  metadata?: unknown,
  client: Pick<Prisma.TransactionClient, "auditLog"> | typeof prisma = prisma,
) {
  return client.auditLog.create({ data: { action, userId, entity, entityId, metadata: metadata as object | undefined } });
}

export async function auditInContext(
  action: string,
  context: { companyId: string; branchId: string | null },
  userId: string,
  entity?: string,
  entityId?: string,
  metadata?: unknown,
  client: Pick<Prisma.TransactionClient, "auditLog"> | typeof prisma = prisma,
) {
  return client.auditLog.create({ data: { action, userId, entity, entityId, companyId: context.companyId, branchId: context.branchId, metadata: metadata as object | undefined } });
}
