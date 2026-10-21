import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "vendaja-enterprise-oauth-secret-2026";

export interface OAuthTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  jti: string;
}

export class EnterpriseOAuthService {
  private static blacklistedTokens = new Set<string>();
  private static rateLimiterBuckets = new Map<string, { tokens: number; lastRefill: number }>();

  /**
   * Generates an OAuth2 access token for client credentials grant
   */
  public static async issueClientCredentialsToken(params: {
    clientId: string;
    clientSecret: string;
    scope?: string;
    companyId?: string;
    expiresInSeconds?: number;
  }): Promise<{ success: boolean; token?: OAuthTokenResponse; error?: string }> {
    // In production, clientId and clientSecret are validated against registered integration clients.
    // Here we validate minimal length and format.
    if (!params.clientId || !params.clientSecret || params.clientSecret.length < 8) {
      return { success: false, error: "invalid_client" };
    }

    if (params.clientId === "client_vj_enterprise" && params.clientSecret !== "sec_vj_enterprise_secret_2026") {
      return { success: false, error: "invalid_credentials" };
    }

    const jti = crypto.randomUUID();
    const expiresIn = params.expiresInSeconds ?? 3600; // 1 hour default
    const grantedScope = params.scope || "API.Read API.Write";

    const payload = {
      sub: params.clientId,
      iss: "vendaja-enterprise-oauth",
      aud: "vendaja-api",
      jti,
      scope: grantedScope,
      companyId: params.companyId || "default",
      type: "oauth_m2m",
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn,
    });

    return {
      success: true,
      token: {
        access_token: token,
        token_type: "Bearer",
        expires_in: expiresIn,
        scope: grantedScope,
        jti,
      },
    };
  }

  /**
   * Introspects an active token and verifies whether it has been revoked
   */
  public static async introspectToken(token: string): Promise<{
    active: boolean;
    client_id?: string;
    sub?: string;
    scope?: string;
    exp?: number;
    jti?: string;
    companyId?: string;
  }> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
      const jti = decoded.jti;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      // Check in-memory blacklist
      if (jti && this.blacklistedTokens.has(jti)) {
        return { active: false };
      }
      if (this.blacklistedTokens.has(tokenHash)) {
        return { active: false };
      }

      // Check database blacklist
      try {
        const revoked = await prisma.tokenRevocation.findFirst({
          where: { OR: [{ tokenHash }, ...(jti ? [{ tokenHash: jti }] : [])] },
        });
        if (revoked) {
          if (jti) this.blacklistedTokens.add(jti);
          this.blacklistedTokens.add(tokenHash);
          return { active: false };
        }
      } catch {
        // use in-memory state
      }

      return {
        active: true,
        client_id: decoded.sub,
        sub: decoded.sub,
        scope: decoded.scope,
        exp: decoded.exp,
        jti: decoded.jti,
        companyId: decoded.companyId,
      };
    } catch {
      return { active: false };
    }
  }

  /**
   * Revokes a token and adds its hash and jti to the blacklist
   */
  public static async revokeToken(token: string, reason = "user_revoked"): Promise<boolean> {
    try {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      this.blacklistedTokens.add(tokenHash);

      let jti: string | undefined;
      let expDate = new Date(Date.now() + 86_400_000 * 7); // 7 days retention

      try {
        const decoded = jwt.decode(token) as jwt.JwtPayload;
        if (decoded?.jti) {
          jti = decoded.jti;
          this.blacklistedTokens.add(jti);
        }
        if (decoded?.exp) {
          expDate = new Date(decoded.exp * 1000);
        }
      } catch {
        // continue
      }

      await prisma.tokenRevocation.create({
        data: {
          id: crypto.randomUUID(),
          tokenHash,
          reason,
          expiresAt: expDate,
        },
      });

      return true;
    } catch (err) {
      logger.warn("OAUTH", "REVOKE_DB_FAILED", "Token blacklisted in-memory", { metadata: { error: String(err) } });
      return true;
    }
  }

  /**
   * Rate limiting token bucket check per client IP / Client ID
   * returns true if allowed, false if throttled
   */
  public static checkRateLimit(clientId: string, maxPerMinute = 120): { allowed: boolean; remaining: number } {
    const now = Date.now();
    let bucket = this.rateLimiterBuckets.get(clientId);

    if (!bucket) {
      bucket = { tokens: maxPerMinute, lastRefill: now };
      this.rateLimiterBuckets.set(clientId, bucket);
    }

    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((elapsedMs / 60_000) * maxPerMinute);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(maxPerMinute, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return { allowed: true, remaining: bucket.tokens };
    }

    return { allowed: false, remaining: 0 };
  }

  public static async generateClientCredentialsToken(
    clientId: string,
    clientSecret: string,
    scope?: string,
    companyId?: string
  ): Promise<{ success: boolean; accessToken?: string; expiresIn?: number; error?: string }> {
    const res = await this.issueClientCredentialsToken({
      clientId,
      clientSecret,
      scope,
      companyId,
    });
    if (!res.success || !res.token) {
      return { success: false, error: res.error || "invalid_credentials" };
    }
    return {
      success: true,
      accessToken: res.token.access_token,
      expiresIn: res.token.expires_in,
    };
  }
}

export { EnterpriseOAuthService as OAuthService };
