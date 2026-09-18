import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET ?? "development-only-change-me";

export function issueAuthorizationGrant(adminId: string, action: string, entityId?: string) {
  return jwt.sign({ type: "ADMIN_GRANT", adminId, action, entityId }, secret, { expiresIn: "2m" });
}

export function verifyAuthorizationGrant(token: string, action: string, entityId?: string) {
  const grant = jwt.verify(token, secret) as { type?: string; adminId?: string; action?: string; entityId?: string };
  if (grant.type !== "ADMIN_GRANT" || grant.action !== action || (grant.entityId && grant.entityId !== entityId)) {
    throw new Error("invalid_admin_grant");
  }
  return grant;
}
