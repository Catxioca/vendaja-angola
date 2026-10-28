import crypto from "node:crypto";
import os from "node:os";
import { LICENSE_PUBLIC_KEY } from "./licensePublicKey.js";
import {
  OPERATIONAL_MODULES,
  MODULE_CATALOG,
  normalizeModuleCode,
  isModuleLicensed,
  type AppModule,
  type CommercialPlan,
  type CanonicalLicenseState,
} from "./modules.js";
import type {
  LicensePayload,
  LicenseStatus,
  LicenseTierType,
  ModuleLicenseDetail,
  ProductLicenseInfo,
  ModularLicenseInfo,
  LicenseAuditLogEntry,
} from "./license.js";

/**
 * Certificate Revocation List (CRL) for compromised or superseded licenses.
 * Any license matching an entry in this ledger is immediately rejected with REVOKED state.
 */
export const REVOKED_LICENSE_IDS = new Set<string>([
  "DEV-QA-RSA2048-20260917",
  "009341302LN046",
  "VJ-REVOKED-001",
  "VJ-TEST-REVOKED",
  "cliente",
  "abdulaye",
]);

/**
 * Generates an anonymous, machine-bound Hardware Identifier (HWID).
 *
 * Stability & Privacy:
 * - Does NOT expose personal data (no usernames, user home directories, or private emails).
 * - Utilizes platform, CPU architecture, system model and an optional machine-level persistent UUID.
 * - Remains stable across ERP updates, reboots, and Windows user account switches.
 *
 * Hardware Change Recovery Process:
 * - When physical hardware components (motherboard, CPU) are replaced, a new HWID is computed.
 * - The customer presents the new HWID and their active subscription NIF to VendaJá Support.
 * - VendaJá revokes the prior license in the CRL ledger and issues a replacement license for the new HWID.
 */
export function computeHardwareId(options?: {
  platform?: string;
  arch?: string;
  cpuModel?: string;
  machineSeed?: string;
}): string {
  const platform = options?.platform || os.platform();
  const arch = options?.arch || os.arch();
  const cpuModel = options?.cpuModel || os.cpus()[0]?.model || "GENERIC_CPU";
  const seed = options?.machineSeed || "STABLE-MACHINE-DEFAULT-SEED";
  const rawFingerprint = `VENDAJA|${platform}|${arch}|${cpuModel}|${seed}`;
  return crypto.createHash("sha256").update(rawFingerprint).digest("hex").slice(0, 32).toUpperCase();
}

/**
 * Decodes and unpacks an asymmetric digital license token (canonicalBase64Url.signatureBase64Url).
 */
export function decodeLicenseToken(token: string): { payload: LicensePayload; signature: string; canonical: string } {
  const [canonical, signature] = token.trim().split(".");
  if (!canonical || !signature) {
    throw new Error("Formato de token de licença inválido.");
  }
  const payload = JSON.parse(Buffer.from(canonical, "base64url").toString("utf8")) as LicensePayload;
  return { payload, signature, canonical };
}

export interface VerificationResult {
  valid: boolean;
  state: CanonicalLicenseState;
  reason?: string;
  payload?: LicensePayload;
  gracePeriodDaysRemaining?: number;
}

/**
 * Cryptographically verifies a digital license token using RSA-SHA256 asymmetric verification.
 * Evaluates digital signature against authoritative public key, CRL revocation list, hardware binding,
 * expiration dates, and offline grace periods.
 */
export function verifyLicenseToken(
  token: string,
  targetHardwareId: string,
  nowMs: number = Date.now(),
  publicKeyPem: string = LICENSE_PUBLIC_KEY
): VerificationResult {
  try {
    const decoded = decodeLicenseToken(token);
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(decoded.canonical);
    verifier.end();

    const signatureValid = verifier.verify(publicKeyPem, Buffer.from(decoded.signature, "base64url"));
    if (!signatureValid) {
      return { valid: false, state: "INCOMPATIBLE", reason: "invalid_signature", payload: decoded.payload };
    }

    if (decoded.payload.licenseId && REVOKED_LICENSE_IDS.has(decoded.payload.licenseId)) {
      return { valid: false, state: "REVOKED", reason: "revoked", payload: decoded.payload };
    }

    if (decoded.payload.hardwareId !== targetHardwareId) {
      return { valid: false, state: "INCOMPATIBLE", reason: "hardware_mismatch", payload: decoded.payload };
    }

    const startsAtMs = Date.parse(decoded.payload.startsAt);
    const expiresAtMs = Date.parse(decoded.payload.expiresAt);
    if (nowMs < startsAtMs) {
      return { valid: false, state: "INCOMPATIBLE", reason: "not_started", payload: decoded.payload };
    }

    if (nowMs >= expiresAtMs) {
      const graceDays = typeof decoded.payload.gracePeriodDays === "number" ? decoded.payload.gracePeriodDays : 0;
      const gracePeriodMs = graceDays * 86_400_000;
      if (graceDays > 0 && nowMs < expiresAtMs + gracePeriodMs) {
        const remainingGrace = Math.ceil((expiresAtMs + gracePeriodMs - nowMs) / 86_400_000);
        return {
          valid: true,
          state: "OFFLINE_GRACE_PERIOD",
          payload: decoded.payload,
          gracePeriodDaysRemaining: remainingGrace,
        };
      }
      return { valid: false, state: "EXPIRED", reason: "expired", payload: decoded.payload };
    }

    return { valid: true, state: "VALID", payload: decoded.payload };
  } catch (err) {
    return {
      valid: false,
      state: "INCOMPATIBLE",
      reason: err instanceof Error ? err.message : "invalid_license",
    };
  }
}
