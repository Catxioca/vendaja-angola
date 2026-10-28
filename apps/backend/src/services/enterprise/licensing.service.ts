import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger.service.js";

export type CanonicalLicenseState =
  | "VALID"
  | "EXPIRED"
  | "REVOKED"
  | "INCOMPATIBLE"
  | "NO_CONNECTIVITY"
  | "OFFLINE_GRACE_PERIOD";

export interface LicensePayload {
  version: number;
  licenseId: string;
  nif: string;
  hardwareId: string;
  startsAt: string;
  expiresAt: string;
  modules: string[];
  gracePeriodDays?: number;
  requiresHeartbeat?: boolean;
}

export interface LicenseStatusResult {
  valid: boolean;
  state?: CanonicalLicenseState;
  reason?: string;
  hardwareId?: string;
  expiresAt?: string;
  nif?: string;
  modules?: string[];
  gracePeriodDaysRemaining?: number;
}

export const REVOKED_LICENSE_IDS = new Set<string>([
  "DEV-QA-RSA2048-20260917",
  "009341302LN046",
  "VJ-REVOKED-001",
  "VJ-TEST-REVOKED",
  "cliente",
  "abdulaye",
]);

export const AUTHORITATIVE_RSA4096_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAhtvOY/xNo4oQBgOZ80M3
hYnc0REOKBkYAI9pKdngWNwIE0YJsbwX7c1v8/hjeR6zQTIaf2NCkw7LwKKMcqOt
24SPun0EXwuuv9qQfe5oRUDmjmeGAKzRgYdltKpKZhuM1LCZBDqSQIU2YUSLl5aa
U9yCLG9dJE7FKruzjI1/Gf8W3j+NFk/KJ468o+XZaWNIN+lcaiXAXqq+qlLct6Fu
xiBD7bHhqGtkr1secvOiA078+5rNpkAGibIkw089yqWDUIdGJfI2qoCNhEq+C29Q
Ahf0E1BeWQT3ytz1+7yy+iNPMFMWH3gCg08UGYiU4IWP0bf8uQy8uTo9B/bjvcdN
YkSihPlhXjt7nbDEGq6h+2BcOaT39ltRbWFxTetyMF/H8iTFA3UyTsY7rsLanZps
CSEPS0xSCam17ZxT4L8RqlgsP3c5xTvep9Vo9OF22vGLvsAekemGaRCvIyZ6oGO/
OgGJR5mcfSD7EL7FdWathJ7T/wzK8SqQqiw4NQiq0xbKHc8ZC00wbz2QrzCiFoTS
H5PxgxAzsWWjvHvmpWroZAbEFDb4947r4FzjMtToYLOgcVa1CdTaW7r5J7V07FIe
N7679uR7FkkfnhHW/XcMZD3VltnVaTC0YdttvMmLf5znuR0Z7ENNeZKRI88xPDS8
RjTvXwbWSbtnESPzPkSRbyECAwEAAQ==
-----END PUBLIC KEY-----`;

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

    this.cachedPublicKey = AUTHORITATIVE_RSA4096_PUBLIC_KEY;
    return AUTHORITATIVE_RSA4096_PUBLIC_KEY;
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
        return { valid: false, state: "INCOMPATIBLE", reason: "invalid_signature", hardwareId: payload.hardwareId };
      }

      if (payload.licenseId && REVOKED_LICENSE_IDS.has(payload.licenseId)) {
        return { valid: false, state: "REVOKED", reason: "revoked", hardwareId: payload.hardwareId };
      }

      if (expectedHardwareId && payload.hardwareId !== expectedHardwareId) {
        return { valid: false, state: "INCOMPATIBLE", reason: "hardware_mismatch", hardwareId: payload.hardwareId };
      }

      const now = Date.now();
      if (now < Date.parse(payload.startsAt)) {
        return { valid: false, state: "INCOMPATIBLE", reason: "not_started", hardwareId: payload.hardwareId };
      }

      const expiresAtMs = Date.parse(payload.expiresAt);
      if (now >= expiresAtMs) {
        const graceDays = typeof payload.gracePeriodDays === "number" ? payload.gracePeriodDays : 0;
        const gracePeriodMs = graceDays * 86_400_000;
        if (graceDays > 0 && now < expiresAtMs + gracePeriodMs) {
          const remainingGrace = Math.ceil((expiresAtMs + gracePeriodMs - now) / 86_400_000);
          return {
            valid: true,
            state: "OFFLINE_GRACE_PERIOD",
            hardwareId: payload.hardwareId,
            expiresAt: payload.expiresAt,
            nif: payload.nif,
            modules: payload.modules,
            gracePeriodDaysRemaining: remainingGrace,
          };
        }
        return { valid: false, state: "EXPIRED", reason: "expired", hardwareId: payload.hardwareId, expiresAt: payload.expiresAt };
      }

      return {
        valid: true,
        state: "VALID",
        hardwareId: payload.hardwareId,
        expiresAt: payload.expiresAt,
        nif: payload.nif,
        modules: payload.modules,
      };
    } catch (error) {
      logger.error("LICENSING", "VALIDATION_FAILED", "Falha na validação de licença", error);
      return {
        valid: false,
        state: "INCOMPATIBLE",
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
