import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../server.js";
import { getEnv } from "../config/env.js";
export { issueAuthorizationGrant, verifyAuthorizationGrant } from "./grants.js";

export const hashPassword = (value: string) => bcrypt.hash(value, 12);
export const verifyPassword = (value: string, hash: string) => bcrypt.compare(value, hash);
export function issueTokens(user: { id: string; role: string }) {
  const accessToken = jwt.sign({ id: user.id, role: user.role }, getEnv().JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  return { accessToken, refreshToken };
}
export async function persistRefreshToken(userId: string, token: string) {
  await prisma.refreshToken.create({ data: { userId, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 30 * 86400000) } });
}
export const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export async function audit(action: string, userId?: string, entity?: string, entityId?: string, metadata?: unknown) {
  return prisma.auditLog.create({ data: { action, userId, entity, entityId, metadata: metadata as object | undefined } });
}
