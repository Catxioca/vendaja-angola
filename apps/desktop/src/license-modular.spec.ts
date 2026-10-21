import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeModuleCode,
  isModuleLicensed,
  PLAN_METADATA,
  MODULE_CATALOG,
  defaultLicensedModules,
  OPERATIONAL_MODULES,
  PRODUCT_CORE_MODULES,
  type AppModule,
  type CommercialPlan,
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

describe("Enterprise Modular Licensing & DRM Suite", () => {
  describe("Module Normalization & Hierarchy", () => {
    it("normalizes legacy and colloquial module codes to canonical identifiers", () => {
      assert.equal(normalizeModuleCode("pdv"), "POS");
      assert.equal(normalizeModuleCode("cash"), "POS");
      assert.equal(normalizeModuleCode("vendas"), "POS");
      assert.equal(normalizeModuleCode("products"), "STOCK");
      assert.equal(normalizeModuleCode("inventory"), "STOCK");
      assert.equal(normalizeModuleCode("compras"), "PURCHASES");
      assert.equal(normalizeModuleCode("operations"), "PURCHASES");
      assert.equal(normalizeModuleCode("fluxo"), null);
      assert.equal(normalizeModuleCode("cashflow"), "TREASURY");
      assert.equal(normalizeModuleCode("tesouraria"), "TREASURY");
      assert.equal(normalizeModuleCode("pgca"), "ACCOUNTING");
      assert.equal(normalizeModuleCode("contabilidade"), "ACCOUNTING");
      assert.equal(normalizeModuleCode("rh"), "HR");
      assert.equal(normalizeModuleCode("crm"), "CRM");
      assert.equal(normalizeModuleCode("pipeline"), "CRM");
      assert.equal(normalizeModuleCode("ged"), "DOCUMENTS");
      assert.equal(normalizeModuleCode("bi"), "BI");
      assert.equal(normalizeModuleCode("saft"), "REPORTS");
      assert.equal(normalizeModuleCode("workflows"), "AUTOMATION");
      assert.equal(normalizeModuleCode("governanca"), "GOVERNANCE");
      assert.equal(normalizeModuleCode("api"), "INTEGRATIONS");
      assert.equal(normalizeModuleCode("saas"), "CLOUD");
      assert.equal(normalizeModuleCode("fiscal"), "SETTINGS");
    });

    it("ensures SETTINGS module is always accessible for system diagnostics", () => {
      const emptyLicense: AppModule[] = [];
      assert.equal(isModuleLicensed("SETTINGS", emptyLicense), true);
      assert.equal(isModuleLicensed("POS", emptyLicense), false);
      assert.equal(isModuleLicensed("STOCK", emptyLicense), false);
    });

    it("verifies full coverage of all 16 canonical modules in MODULE_CATALOG", () => {
      assert.equal(MODULE_CATALOG.length, 16);
      const codes = MODULE_CATALOG.map((m) => m.code);
      const expectedCodes: AppModule[] = [
        "DASHBOARD",
        "POS",
        "STOCK",
        "REPORTS",
        "SETTINGS",
        "PURCHASES",
        "TREASURY",
        "HR",
        "CRM",
        "DOCUMENTS",
        "ACCOUNTING",
        "BI",
        "AUTOMATION",
        "GOVERNANCE",
        "INTEGRATIONS",
        "CLOUD",
      ];
      for (const expected of expectedCodes) {
        assert.ok(codes.includes(expected), `Module ${expected} missing from catalog`);
      }
    });
  });

  describe("Commercial Plans Tier Progression", () => {
    it("verifies proper inclusion hierarchy: STARTER ⊂ PROFESSIONAL ⊂ BUSINESS ⊂ ENTERPRISE", () => {
      const starter = PLAN_METADATA.STARTER.modules;
      const pro = PLAN_METADATA.PROFESSIONAL.modules;
      const biz = PLAN_METADATA.BUSINESS.modules;
      const ent = PLAN_METADATA.ENTERPRISE.modules;

      // STARTER has core retail: POS, STOCK, DASHBOARD, REPORTS, SETTINGS
      assert.deepEqual(starter.sort(), ["DASHBOARD", "POS", "REPORTS", "SETTINGS", "STOCK"].sort());

      // PROFESSIONAL contains all of STARTER plus PURCHASES and TREASURY
      for (const mod of starter) {
        assert.ok(pro.includes(mod), `Professional must include Starter module ${mod}`);
      }
      assert.ok(pro.includes("PURCHASES"));
      assert.ok(pro.includes("TREASURY"));

      // BUSINESS contains all of PROFESSIONAL plus HR, CRM, DOCUMENTS
      for (const mod of pro) {
        assert.ok(biz.includes(mod), `Business must include Professional module ${mod}`);
      }
      assert.ok(biz.includes("HR"));
      assert.ok(biz.includes("CRM"));
      assert.ok(biz.includes("DOCUMENTS"));

      // ENTERPRISE contains all of BUSINESS plus ACCOUNTING, BI, AUTOMATION, GOVERNANCE, INTEGRATIONS, CLOUD
      for (const mod of biz) {
        assert.ok(ent.includes(mod), `Enterprise must include Business module ${mod}`);
      }
      assert.ok(ent.includes("ACCOUNTING"));
      assert.ok(ent.includes("BI"));
      assert.ok(ent.includes("AUTOMATION"));
      assert.ok(ent.includes("GOVERNANCE"));
      assert.ok(ent.includes("INTEGRATIONS"));
      assert.ok(ent.includes("CLOUD"));
      assert.equal(ent.length, 16);
    });
  });

  describe("RSA-SHA256 Cryptographic DRM & Signature Verification", () => {
    const testHardwareId = "TEST-HWID-ANGOLA-1234567890ABCDEF";

    // Generate ephemeral RSA keypair for hermetic DRM tests
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    function issueSignedToken(payload: LicensePayload): string {
      const canonical = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signer = crypto.createSign("RSA-SHA256");
      signer.update(canonical);
      signer.end();
      const signature = signer.sign(crypto.createPrivateKey(privateKey)).toString("base64url");
      return `${canonical}.${signature}`;
    }

    function verifyTestLicense(token: string, currentHardwareId: string, nowMs = Date.now()): LicenseStatus {
      try {
        const [canonical, signature] = token.trim().split(".");
        if (!canonical || !signature) throw new Error("Formato de licença inválido.");
        const payload = JSON.parse(Buffer.from(canonical, "base64url").toString("utf8")) as LicensePayload;

        const verifier = crypto.createVerify("RSA-SHA256");
        verifier.update(canonical);
        verifier.end();
        if (!verifier.verify(publicKey, Buffer.from(signature, "base64url"))) {
          throw new Error("invalid_signature");
        }
        if (payload.hardwareId !== currentHardwareId) {
          throw new Error("hardware_mismatch");
        }
        const startsAtMs = Date.parse(payload.startsAt);
        const expiresAtMs = Date.parse(payload.expiresAt);
        if (nowMs < startsAtMs) throw new Error("not_started");
        if (nowMs >= expiresAtMs) throw new Error("expired");

        const daysRemaining = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 86_400_000));
        let expiryTier: LicenseStatus["expiryTier"] = "valid";
        if (daysRemaining <= 15) expiryTier = "urgent";
        else if (daysRemaining <= 30) expiryTier = "critical";
        else if (daysRemaining <= 90) expiryTier = "expiring_soon";

        return {
          valid: true,
          hardwareId: currentHardwareId,
          company: payload.company,
          nif: payload.nif,
          plan: payload.plan,
          startsAt: payload.startsAt,
          expiresAt: payload.expiresAt,
          modules: payload.modules,
          daysRemaining,
          expiryTier,
        };
      } catch (err) {
        return {
          valid: false,
          reason: err instanceof Error ? err.message : "invalid_license",
          hardwareId: currentHardwareId,
        };
      }
    }

    it("validates a genuine signed license token successfully", () => {
      const now = new Date();
      const nextYear = new Date(now);
      nextYear.setFullYear(now.getFullYear() + 1);

      const payload: LicensePayload = {
        version: 2,
        licenseId: "VJ-TEST-001",
        company: "Sonangol Distribuição SA",
        nif: "5401234567",
        hardwareId: testHardwareId,
        plan: "ENTERPRISE",
        startsAt: now.toISOString(),
        expiresAt: nextYear.toISOString(),
        modules: PLAN_METADATA.ENTERPRISE.modules,
        limits: { maxTerminals: 10, maxUsers: 50 },
      };

      const token = issueSignedToken(payload);
      const result = verifyTestLicense(token, testHardwareId, now.getTime() + 1000);

      assert.equal(result.valid, true);
      assert.equal(result.company, "Sonangol Distribuição SA");
      assert.equal(result.plan, "ENTERPRISE");
      assert.equal(result.expiryTier, "valid");
      assert.ok(result.daysRemaining! > 300);
      assert.equal(result.modules?.length, 16);
    });

    it("rejects token when hardwareId does not match the current machine", () => {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 86_400_000);
      const payload: LicensePayload = {
        version: 2,
        licenseId: "VJ-TEST-002",
        company: "Kero Hipermercados",
        nif: "5409876543",
        hardwareId: "DIFFERENT-MACHINE-HWID-9999",
        plan: "PROFESSIONAL",
        startsAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        modules: PLAN_METADATA.PROFESSIONAL.modules,
      };

      const token = issueSignedToken(payload);
      const result = verifyTestLicense(token, testHardwareId, now.getTime());

      assert.equal(result.valid, false);
      assert.equal(result.reason, "hardware_mismatch");
    });

    it("rejects token with corrupted or tampered payload", () => {
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 86_400_000);
      const payload: LicensePayload = {
        version: 2,
        licenseId: "VJ-TEST-003",
        company: "Farmácias de Angola",
        nif: "5401112223",
        hardwareId: testHardwareId,
        plan: "STARTER",
        startsAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        modules: PLAN_METADATA.STARTER.modules,
      };

      const token = issueSignedToken(payload);
      const [canonical, signature] = token.split(".");
      assert.ok(canonical && signature, "Token should contain canonical and signature parts");
      
      // Tamper 1: modify payload content without valid private key signature
      const tamperedPayload = { ...payload, company: "Empresa Adulterada Sem Autorização" };
      const tamperedCanonical = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
      const tamperedToken = `${tamperedCanonical}.${signature}`;

      const result1 = verifyTestLicense(tamperedToken, testHardwareId, now.getTime());
      assert.equal(result1.valid, false);
      assert.equal(result1.reason, "invalid_signature");

      // Tamper 2: corrupt signature bytes
      const corruptedSignature = signature.slice(0, -6) + "XXXXXX";
      const corruptedSigToken = `${canonical}.${corruptedSignature}`;
      const result2 = verifyTestLicense(corruptedSigToken, testHardwareId, now.getTime());
      assert.equal(result2.valid, false);
      assert.equal(result2.reason, "invalid_signature");
    });

    it("calculates accurate warning tiers based on expiration countdown schedule", () => {
      const now = Date.now();
      const mkToken = (daysAhead: number) => {
        const payload: LicensePayload = {
          version: 2,
          licenseId: `VJ-TIER-${daysAhead}`,
          nif: "5400000000",
          hardwareId: testHardwareId,
          plan: "BUSINESS",
          startsAt: new Date(now - 86_400_000).toISOString(),
          expiresAt: new Date(now + daysAhead * 86_400_000).toISOString(),
          modules: PLAN_METADATA.BUSINESS.modules,
        };
        return issueSignedToken(payload);
      };

      // > 90 days: "valid"
      const res120 = verifyTestLicense(mkToken(120), testHardwareId, now);
      assert.equal(res120.valid, true);
      assert.equal(res120.expiryTier, "valid");

      // 45 days: "expiring_soon"
      const res45 = verifyTestLicense(mkToken(45), testHardwareId, now);
      assert.equal(res45.valid, true);
      assert.equal(res45.expiryTier, "expiring_soon");

      // 25 days: "critical"
      const res25 = verifyTestLicense(mkToken(25), testHardwareId, now);
      assert.equal(res25.valid, true);
      assert.equal(res25.expiryTier, "critical");

      // 10 days: "urgent"
      const res10 = verifyTestLicense(mkToken(10), testHardwareId, now);
      assert.equal(res10.valid, true);
      assert.equal(res10.expiryTier, "urgent");

      // Expired: "expired"
      const resExpired = verifyTestLicense(mkToken(-1), testHardwareId, now);
      assert.equal(resExpired.valid, false);
      assert.equal(resExpired.reason, "expired");
    });
  });

  describe("Two-Tier Licensing & Modular Isolation Engine", () => {
    it("verifies clean install defaults: Product active, ALL 15 operational modules locked", () => {
      // In clean installation, only SETTINGS is unlocked; all 15 operational modules are strictly locked
      assert.equal(OPERATIONAL_MODULES.length, 15);
      assert.deepEqual(defaultLicensedModules, ["SETTINGS"]);
      assert.deepEqual(PRODUCT_CORE_MODULES, ["SETTINGS"]);

      for (const opMod of OPERATIONAL_MODULES) {
        assert.equal(
          isModuleLicensed(opMod, defaultLicensedModules),
          false,
          `Operational module ${opMod} MUST be locked by default on clean installation`
        );
      }
      assert.equal(isModuleLicensed("SETTINGS", defaultLicensedModules), true);
    });

    it("ensures product license alone authorizes platform execution without unlocking operational modules", () => {
      const now = new Date();
      const nextYear = new Date(now);
      nextYear.setFullYear(now.getFullYear() + 1);

      // Issue genuine Product License (type: PRODUCT)
      const productPayload: LicensePayload = {
        version: 2,
        licenseId: "VJ-PROD-20261021-001",
        type: "PRODUCT",
        company: "BFA - Banco de Fomento Angola",
        nif: "5401122334",
        hardwareId: "TEST-HWID-ANGOLA-1234567890ABCDEF",
        plan: "ENTERPRISE",
        startsAt: now.toISOString(),
        expiresAt: nextYear.toISOString(),
        modules: ["SETTINGS"], // Product license grants strictly platform core, ZERO operational modules
        limits: { maxTerminals: 10, maxUsers: 50 },
      };

      assert.equal(productPayload.type, "PRODUCT");
      // Even with plan ENTERPRISE, operational modules are NOT in product license
      for (const opMod of OPERATIONAL_MODULES) {
        assert.equal(
          isModuleLicensed(opMod, productPayload.modules as AppModule[]),
          false,
          `Product license must NEVER automatically unlock operational module ${opMod}`
        );
      }
    });

    it("verifies granular modular license activation unlocks strictly requested modules", () => {
      const now = new Date();
      const nextYear = new Date(now);
      nextYear.setFullYear(now.getFullYear() + 1);

      // Customer purchases only POS & Catálogo de Stocks
      const modularPayload: LicensePayload = {
        version: 2,
        licenseId: "VJ-MOD-20261021-POS-STOCK",
        type: "MODULAR",
        nif: "5401122334",
        hardwareId: "TEST-HWID-ANGOLA-1234567890ABCDEF",
        startsAt: now.toISOString(),
        expiresAt: nextYear.toISOString(),
        modules: ["POS", "STOCK"],
      };

      const unlockedModules: AppModule[] = ["SETTINGS", ...(modularPayload.modules as AppModule[])];

      // POS and STOCK must be unlocked
      assert.equal(isModuleLicensed("POS", unlockedModules), true);
      assert.equal(isModuleLicensed("STOCK", unlockedModules), true);
      assert.equal(isModuleLicensed("SETTINGS", unlockedModules), true);

      // The remaining 13 operational modules MUST remain strictly locked
      const remainingLocked: AppModule[] = [
        "DASHBOARD",
        "PURCHASES",
        "TREASURY",
        "ACCOUNTING",
        "HR",
        "CRM",
        "DOCUMENTS",
        "BI",
        "REPORTS",
        "AUTOMATION",
        "GOVERNANCE",
        "INTEGRATIONS",
        "CLOUD",
      ];

      for (const lockedMod of remainingLocked) {
        assert.equal(
          isModuleLicensed(lockedMod, unlockedModules),
          false,
          `Module ${lockedMod} must remain locked when only POS and STOCK are licensed`
        );
      }
    });

    it("simulates full two-tier modular evaluation and audit log trail", () => {
      // 1. Initial State: clean install
      const auditTrail: LicenseAuditLogEntry[] = [];
      const logAudit = (event: LicenseAuditLogEntry["event"], details: string) => {
        auditTrail.push({
          id: `audit-${auditTrail.length + 1}`,
          timestamp: new Date().toISOString(),
          event,
          details,
          actor: "Administrador Local",
        });
      };

      // 2. Activate Product License
      logAudit("PRODUCT_ACTIVATED", "Licença do Produto ativada para Unitel SA (NIF: 5410987654)");
      assert.equal(auditTrail.length, 1);
      assert.equal(auditTrail[0]?.event, "PRODUCT_ACTIVATED");

      // 3. User attempts to access locked module (e.g., ACCOUNTING)
      logAudit("MODULE_BLOCKED_ATTEMPT", "Tentativa de acesso ao módulo bloqueado: ACCOUNTING (accounting)");
      assert.equal(auditTrail.length, 2);
      assert.equal(auditTrail[1]?.event, "MODULE_BLOCKED_ATTEMPT");

      // 4. Partner issues modular license for POS and STOCK
      logAudit("MODULE_ACTIVATED", "Módulos ativados (POS, STOCK) via licença VJ-MOD-001");
      assert.equal(auditTrail.length, 3);
      assert.equal(auditTrail[2]?.event, "MODULE_ACTIVATED");

      // 5. User attempts invalid license key
      logAudit("LICENSE_INVALID", "Tentativa de ativação com chave inválida ou assinatura corrompida");
      assert.equal(auditTrail.length, 4);
      assert.equal(auditTrail[3]?.event, "LICENSE_INVALID");

      // 6. Verify audit trail immutability and contents
      const eventTypes = auditTrail.map((e) => e.event);
      assert.deepEqual(eventTypes, [
        "PRODUCT_ACTIVATED",
        "MODULE_BLOCKED_ATTEMPT",
        "MODULE_ACTIVATED",
        "LICENSE_INVALID",
      ]);
    });
  });
});
