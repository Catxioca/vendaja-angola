import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger.service.js";

export interface LicensePayload {
  version: number;
  licenseId: string;
  nif: string;
  hardwareId: string;
  startsAt: string;
  expiresAt: string;
  modules: string[];
}

export interface LicenseStatusResult {
  valid: boolean;
  reason?: string;
  hardwareId?: string;
  expiresAt?: string;
  nif?: string;
  modules?: string[];
}

export class EnterpriseLicensingService {
  private static cachedPublicKey: string | null = null;

  /**
   * Resolves and caches the RSA-SHA256 public key
   */
  public static async getPublicKey(): Promise<string> {
    if (this.cachedPublicKey) return this.cachedPublicKey;

    const candidatePaths = [
      path.resolve(process.cwd(), "public.pem"),
      path.resolve(process.cwd(), "../../public.pem"),
      path.resolve(process.cwd(), "dist/public.pem"),
    ];

    for (const keyPath of candidatePaths) {
      try {
        const content = await fs.readFile(keyPath, "utf8");
        if (content.includes("-----BEGIN PUBLIC KEY-----")) {
          this.cachedPublicKey = content;
          return content;
        }
      } catch {
        /* try next candidate */
      }
    }

    throw new Error("Chave pública de licenciamento (public.pem) não encontrada.");
  }

  /**
   * Decodes a digital license token (canonical.signature)
   */
  public static decodeToken(token: string): { payload: LicensePayload; signature: string; canonical: string } {
    const [canonical, signature] = token.trim().split(".");
    if (!canonical || !signature) {
      throw new Error("Formato de token de licença inválido.");
    }
    const payload = JSON.parse(Buffer.from(canonical, "base64url").toString("utf8")) as LicensePayload;
    return { payload, signature, canonical };
  }

  /**
   * Validates a license token cryptographically using RSA-SHA256
   */
  public static async validateToken(token: string, expectedHardwareId?: string): Promise<LicenseStatusResult> {
    try {
      const publicKey = await this.getPublicKey();
      const { payload, signature, canonical } = this.decodeToken(token);

      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(canonical);
      verifier.end();

      const signatureValid = verifier.verify(publicKey, Buffer.from(signature, "base64url"));
      if (!signatureValid) {
        return { valid: false, reason: "invalid_signature", hardwareId: payload.hardwareId };
      }

      if (expectedHardwareId && payload.hardwareId !== expectedHardwareId) {
        return { valid: false, reason: "hardware_mismatch", hardwareId: payload.hardwareId };
      }

      const now = Date.now();
      if (now < Date.parse(payload.startsAt)) {
        return { valid: false, reason: "not_started", hardwareId: payload.hardwareId };
      }

      if (now >= Date.parse(payload.expiresAt)) {
        return { valid: false, reason: "expired", hardwareId: payload.hardwareId, expiresAt: payload.expiresAt };
      }

      return {
        valid: true,
        hardwareId: payload.hardwareId,
        expiresAt: payload.expiresAt,
        nif: payload.nif,
        modules: payload.modules,
      };
    } catch (error) {
      logger.error("LICENSING", "VALIDATION_FAILED", "Falha na validação de licença", error);
      return {
        valid: false,
        reason: error instanceof Error ? error.message : "validation_error",
      };
    }
  }

  /**
   * Checks if a specific module is allowed based on licensed modules list
   */
  public static isModuleAllowed(module: string, licensedModules: string[]): boolean {
    return licensedModules.map((m) => m.toUpperCase()).includes(module.toUpperCase());
  }
}
