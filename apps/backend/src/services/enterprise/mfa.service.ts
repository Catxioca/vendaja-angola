import crypto from "node:crypto";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { verifyPassword } from "../security.js";

// Base32 alphabet for RFC 3548 / 4648
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]!);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export class EnterpriseMfaService {
  /**
   * Generates a cryptographically secure Base32 secret for TOTP
   */
  public static generateSecret(length = 20): string {
    const randomBytes = crypto.randomBytes(length);
    return base32Encode(randomBytes);
  }

  /**
   * Computes TOTP token for a given secret and counter (RFC 6238)
   */
  public static generateTotpToken(secret: string, timestamp = Date.now(), periodSeconds = 30): string {
    const counter = Math.floor(timestamp / 1000 / periodSeconds);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter), 0);

    const key = base32Decode(secret);
    const hmac = crypto.createHmac("sha1", key);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1]! & 0x0f;
    const binary =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);

    const otp = binary % 1_000_000;
    return otp.toString().padStart(6, "0");
  }

  /**
   * Verifies a 6-digit TOTP token allowing ±1 time window drift (±30s)
   */
  public static verifyToken(secret: string, token: string, window = 1): boolean {
    const cleanToken = token.trim().replace(/\D/g, "");
    if (cleanToken.length !== 6) return false;

    const now = Date.now();
    for (let step = -window; step <= window; step++) {
      const calculated = this.generateTotpToken(secret, now + step * 30_000);
      if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(calculated))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generates a batch of 8-character single-use recovery codes
   */
  public static generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
      const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
      plainCodes.push(formatted);
      hashedCodes.push(crypto.createHash("sha256").update(formatted).digest("hex"));
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * Prepares MFA setup for a user: generates secret, recovery codes and QR code image
   */
  public static async setupMfa(userId: string, appName = "VendaJá Angola"): Promise<{
    secret: string;
    otpauthUrl: string;
    qrCodeDataUrl: string;
    recoveryCodes: string[];
  }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("Utilizador não encontrado.");

    const secret = this.generateSecret();
    const accountLabel = encodeURIComponent(user.email || user.username || "utilizador");
    const issuer = encodeURIComponent(appName);
    const otpauthUrl = `otpauth://totp/${issuer}:${accountLabel}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      margin: 2,
      width: 250,
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    const { plainCodes, hashedCodes } = this.generateRecoveryCodes();

    // Staging the setup on the user
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: secret,
        mfaRecoveryCodes: JSON.stringify(hashedCodes),
      },
    });

    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl,
      recoveryCodes: plainCodes,
    };
  }

  /**
   * Confirms setup and activates MFA after validating the user's first 6-digit code
   */
  public static async enableMfa(userId: string, verificationCode: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) throw new Error("Configuração MFA não iniciada.");

    const valid = this.verifyToken(user.mfaSecret, verificationCode);
    if (!valid) {
      throw new Error("Código de verificação incorreto. Tente novamente.");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    logger.info("SECURITY", "MFA_ENABLED", `MFA ativado com sucesso para o utilizador ${user.email}`, {
      userId,
    });

    return true;
  }

  /**
   * Disables MFA for a user, requiring optional password confirmation if not already verified
   */
  public static async disableMfa(userId: string, passwordConfirm?: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("Utilizador não encontrado.");

    if (passwordConfirm) {
      const passwordMatches = await verifyPassword(passwordConfirm, user.passwordHash);
      if (!passwordMatches) throw new Error("Palavra-passe de confirmação incorreta.");
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaRecoveryCodes: Prisma.DbNull,
      },
    });

    logger.warn("SECURITY", "MFA_DISABLED", `MFA desativado para o utilizador ${user.email}`, {
      userId,
    });

    return true;
  }

  /**
   * Validates a single-use recovery code for emergency login/actions
   */
  public static async verifyRecoveryCode(userId: string, recoveryCode: string): Promise<boolean> {
    return this.verifyLoginMfa(userId, recoveryCode);
  }

  /**
   * Verifies MFA during login using either TOTP token or single-use recovery code
   */
  public static async verifyLoginMfa(userId: string, codeOrRecovery: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecret) return false;

    const trimmed = codeOrRecovery.trim();

    // 1. Check TOTP 6-digit token
    if (/^\d{6}$/.test(trimmed)) {
      return this.verifyToken(user.mfaSecret, trimmed);
    }

    // 2. Check Recovery Code
    if (user.mfaRecoveryCodes) {
      try {
        const raw = typeof user.mfaRecoveryCodes === "string" ? JSON.parse(user.mfaRecoveryCodes) : user.mfaRecoveryCodes;
        const hashedCodes = Array.isArray(raw) ? (raw as string[]) : [];
        const candidateHash = crypto.createHash("sha256").update(trimmed.toUpperCase()).digest("hex");

        const matchIndex = hashedCodes.indexOf(candidateHash);
        if (matchIndex !== -1) {
          // Consume recovery code
          hashedCodes.splice(matchIndex, 1);
          await prisma.user.update({
            where: { id: userId },
            data: { mfaRecoveryCodes: JSON.stringify(hashedCodes) },
          });

          logger.warn("SECURITY", "MFA_RECOVERY_CODE_CONSUMED", `Código de recuperação consumido por ${user.email}`, {
            userId,
          });

          return true;
        }
      } catch {
        /* invalid recovery format */
      }
    }

    return false;
  }

  /**
   * Checks whether a role requires mandatory MFA according to enterprise policy
   */
  public static isMfaMandatoryForRole(role: string): boolean {
    const normalized = role.toUpperCase();
    return (
      normalized === "ADMIN" ||
      normalized === "ROLE_ADMIN" ||
      normalized === "ACCOUNTANT" ||
      normalized === "ROLE_ACCOUNTANT" ||
      normalized === "HR" ||
      normalized === "ROLE_HR"
    );
  }
}
