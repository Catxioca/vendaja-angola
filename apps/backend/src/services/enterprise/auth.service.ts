import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../db.js";
import { getEnv } from "../../config/env.js";
import { logger } from "./logger.service.js";

interface FailedAttemptRecord {
  attempts: number;
  lockedUntil?: number;
}

export class EnterpriseAuthService {
  private static failedAttempts = new Map<string, FailedAttemptRecord>();
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * Hashes a password or pin using SHA-256 with salt
   */
  public static hashCredential(value: string, salt = "vendaja-enterprise-salt"): string {
    return crypto.createHash("sha256").update(`${value}:${salt}`).digest("hex");
  }

  /**
   * Verifies if a given identifier/IP is currently locked due to brute force protection
   */
  public static isLocked(identifier: string): { locked: boolean; remainingMinutes?: number } {
    const key = identifier.toLowerCase().trim();
    const record = this.failedAttempts.get(key);
    if (!record || !record.lockedUntil) return { locked: false };

    const now = Date.now();
    if (now >= record.lockedUntil) {
      this.failedAttempts.delete(key);
      return { locked: false };
    }

    const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    return { locked: true, remainingMinutes };
  }

  /**
   * Records a failed login attempt and locks account if threshold is exceeded
   */
  public static recordFailedAttempt(identifier: string, ip?: string): { locked: boolean; remainingAttempts: number; remainingMinutes?: number } {
    const key = identifier.toLowerCase().trim();
    const now = Date.now();
    const record = this.failedAttempts.get(key) ?? { attempts: 0 };

    record.attempts += 1;
    if (record.attempts >= this.MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      this.failedAttempts.set(key, record);
      logger.warn("AUTH", "BRUTE_FORCE_LOCKOUT", `Conta bloqueada temporariamente após ${this.MAX_FAILED_ATTEMPTS} tentativas falhadas: ${key}`, {
        metadata: { identifier: key, ip, lockedUntil: new Date(record.lockedUntil).toISOString() },
      });
      return { locked: true, remainingAttempts: 0, remainingMinutes: 15 };
    }

    this.failedAttempts.set(key, record);
    return { locked: false, remainingAttempts: this.MAX_FAILED_ATTEMPTS - record.attempts };
  }

  /**
   * Resets failed login attempts upon successful authentication
   */
  public static resetFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier.toLowerCase().trim());
  }

  /**
   * Signs a secure JWT access token
   */
  public static signAccessToken(payload: { id: string; role: string; email?: string; companyId?: string }, expiresIn = "12h"): string {
    return jwt.sign(payload, getEnv().JWT_SECRET, { expiresIn } as jwt.SignOptions);
  }

  /**
   * Signs a secure refresh token
   */
  public static signRefreshToken(payload: { id: string }, expiresIn = "7d"): string {
    return jwt.sign(payload, getEnv().JWT_SECRET, { expiresIn } as jwt.SignOptions);
  }

  /**
   * Safe projection of user object omitting secrets
   */
  public static sanitizeUser<T extends { passwordHash?: string | null; pinHash?: string | null }>(user: T): Omit<T, "passwordHash" | "pinHash"> {
    const copy = { ...user };
    delete copy.passwordHash;
    delete copy.pinHash;
    return copy;
  }

  /**
   * Validates admin credential (PIN or password)
   */
  public static async verifyAdminCredential(credential: string, mode: "pin" | "password" = "password", companyId?: string): Promise<{ valid: boolean; user?: { id: string; role: string; displayName?: string } }> {
    const trimmed = credential.trim();
    if (!trimmed) return { valid: false };

    const hashed = this.hashCredential(trimmed);

    // Look for active admin or supervisor users
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "ROLE_ADMIN", "SUPERVISOR", "ROLE_SUPERVISOR"] },
        ...(companyId
          ? {
              memberships: {
                some: { companyId, active: true, role: { in: ["ADMIN", "ROLE_ADMIN", "MANAGER"] } },
              },
            }
          : {}),
      },
    });

    for (const admin of admins) {
      if (mode === "pin" && admin.pinHash && admin.pinHash === hashed) {
        return { valid: true, user: { id: admin.id, role: admin.role, displayName: admin.displayName ?? undefined } };
      }
      if (mode === "password" && admin.passwordHash && admin.passwordHash === hashed) {
        return { valid: true, user: { id: admin.id, role: admin.role, displayName: admin.displayName ?? undefined } };
      }
    }

    return { valid: false };
  }
}
