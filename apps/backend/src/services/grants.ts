import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";

export function issueAuthorizationGrant(adminId: string, action: string, entityId?: string) {
  return jwt.sign({ type: "ADMIN_GRANT", adminId, action, entityId }, getEnv().JWT_SECRET, { expiresIn: "2m" });
}

export function verifyAuthorizationGrant(token: string, action: string, entityId?: string) {
  const grant = jwt.verify(token, getEnv().JWT_SECRET) as { type?: string; adminId?: string; action?: string; entityId?: string };
  if (grant.type !== "ADMIN_GRANT" || grant.action !== action || (grant.entityId && grant.entityId !== entityId)) {
    throw new Error("invalid_admin_grant");
  }
  return grant;
}
