import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { verifyPassword, hashPassword } from "../security.js";

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
}

export class EnterprisePolicyService {
  /**
   * Retrieves or creates default security policy for a company
   */
  public static async getPolicy(companyId?: string) {
    if (!companyId) {
      return this.getDefaultPolicy();
    }

    const policy = await prisma.securityPolicy.findUnique({
      where: { companyId },
    });

    if (policy) return policy;

    return prisma.securityPolicy.create({
      data: {
        companyId,
        minPasswordLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        passwordExpiryDays: 90,
        preventPasswordReuseCount: 5,
        maxFailedLogins: 5,
        lockoutDurationMinutes: 15,
        sessionInactivityMinutes: 15,
      },
    });
  }

  public static getDefaultPolicy() {
    return {
      minPasswordLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      passwordExpiryDays: 90,
      preventPasswordReuseCount: 5,
      maxFailedLogins: 5,
      lockoutDurationMinutes: 15,
      sessionInactivityMinutes: 15,
      mfaMandatoryRoles: ["ROLE_ADMIN", "ROLE_ACCOUNTANT", "ROLE_HR"],
      ipWhitelist: [] as string[],
      allowedWorkingHoursStart: null as string | null,
      allowedWorkingHoursEnd: null as string | null,
    };
  }

  /**
   * Updates company security policy
   */
  public static async updatePolicy(
    companyId: string,
    updates: Partial<{
      minPasswordLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSpecialChars: boolean;
      passwordExpiryDays: number;
      preventPasswordReuseCount: number;
      maxFailedLogins: number;
      lockoutDurationMinutes: number;
      sessionInactivityMinutes: number;
      mfaMandatoryRoles: string[];
      ipWhitelist: string[];
      allowedWorkingHoursStart: string | null;
      allowedWorkingHoursEnd: string | null;
    }>
  ) {
    const existing = await this.getPolicy(companyId);

    return prisma.securityPolicy.update({
      where: { id: (existing as { id: string }).id },
      data: {
        ...updates,
        mfaMandatoryRoles: updates.mfaMandatoryRoles ? JSON.stringify(updates.mfaMandatoryRoles) : undefined,
        ipWhitelist: updates.ipWhitelist ? JSON.stringify(updates.ipWhitelist) : undefined,
      },
    });
  }

  /**
   * Validates a password against company policy rules
   */
  public static async validatePassword(
    password: string,
    companyId?: string,
    userId?: string
  ): Promise<PolicyValidationResult> {
    const policy = await this.getPolicy(companyId);
    const errors: string[] = [];

    if (password.length < policy.minPasswordLength) {
      errors.push(`A palavra-passe deve conter pelo menos ${policy.minPasswordLength} caracteres.`);
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push("A palavra-passe deve conter pelo menos uma letra maiúscula (A-Z).");
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push("A palavra-passe deve conter pelo menos uma letra minúscula (a-z).");
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push("A palavra-passe deve conter pelo menos um dígito numérico (0-9).");
    }

    if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push("A palavra-passe deve conter pelo menos um símbolo ou caractere especial (!@#$...).");
    }

    // Check history reuse if userId is provided
    if (userId && policy.preventPasswordReuseCount > 0) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, passwordHistory: true },
      });

      if (user) {
        // Compare with current password
        if (await verifyPassword(password, user.passwordHash)) {
          errors.push("A nova palavra-passe não pode ser idêntica à palavra-passe atual.");
        }

        // Compare with past passwords in history
        if (user.passwordHistory) {
          try {
            const raw =
              typeof user.passwordHistory === "string"
                ? JSON.parse(user.passwordHistory)
                : user.passwordHistory;
            const history = Array.isArray(raw) ? (raw as string[]) : [];

            for (const oldHash of history) {
              if (await verifyPassword(password, oldHash)) {
                errors.push(
                  `Não pode reutilizar nenhuma das últimas ${policy.preventPasswordReuseCount} palavras-passe.`
                );
                break;
              }
            }
          } catch {
            /* ignore history parse error */
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Updates user password and archives the old hash into passwordHistory
   */
  public static async recordPasswordChange(userId: string, newPasswordHash: string, companyId?: string) {
    const policy = await this.getPolicy(companyId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, passwordHistory: true },
    });

    if (!user) return;

    let history: string[] = [];
    if (user.passwordHistory) {
      try {
        const raw =
          typeof user.passwordHistory === "string"
            ? JSON.parse(user.passwordHistory)
            : user.passwordHistory;
        history = Array.isArray(raw) ? (raw as string[]) : [];
      } catch {
        history = [];
      }
    }

    // Prepend previous password hash
    history.unshift(user.passwordHash);
    history = history.slice(0, policy.preventPasswordReuseCount);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        passwordHistory: JSON.stringify(history),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    logger.info("SECURITY", "PASSWORD_CHANGED", `Palavra-passe alterada para o utilizador ${userId}`, {
      userId,
    });
  }

  /**
   * Checks whether the user's password has expired based on policy
   */
  public static async isPasswordExpired(userId: string, companyId?: string): Promise<boolean> {
    const policy = await this.getPolicy(companyId);
    if (!policy.passwordExpiryDays || policy.passwordExpiryDays <= 0) return false;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordChangedAt: true, createdAt: true },
    });

    if (!user) return false;

    const lastChange = user.passwordChangedAt ?? user.createdAt;
    const expiryMs = policy.passwordExpiryDays * 24 * 60 * 60 * 1000;
    return Date.now() - lastChange.getTime() > expiryMs;
  }
}
