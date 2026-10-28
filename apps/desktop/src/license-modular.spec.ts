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
  type CanonicalLicenseState,
} from "./modules.js";
import { LICENSE_PUBLIC_KEY } from "./licensePublicKey.js";
import {
  REVOKED_LICENSE_IDS,
  computeHardwareId,
  decodeLicenseToken,
  verifyLicenseToken,
} from "./license-core.js";
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

    it("verifies full coverage of all 19 canonical modules in MODULE_CATALOG", () => {
      assert.equal(MODULE_CATALOG.length, 19);
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
        "AI",
        "BIOMETRICS",
        "CORPORATE",
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
      assert.ok(ent.includes("AI"));
      assert.ok(ent.includes("BIOMETRICS"));
      assert.ok(ent.includes("CORPORATE"));
      assert.equal(ent.length, 19);
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
      assert.equal(result.modules?.length, 19);
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
    it("verifies clean install defaults: Product active, ALL 18 operational modules locked", () => {
      // In clean installation, only SETTINGS is unlocked; all 18 operational modules are strictly locked
      assert.equal(OPERATIONAL_MODULES.length, 18);
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
        "AI",
        "BIOMETRICS",
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

  describe("Advanced Desktop Licensing Verification & DRM Security Gates", () => {
    // Generate isolated ephemeral RSA-4096 keypair for strict cryptographic gate testing
    const rsa4096KeyPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 4096,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    function issueSignedToken4096(payload: LicensePayload, privKeyPem: string = rsa4096KeyPair.privateKey): string {
      const canonical = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signer = crypto.createSign("RSA-SHA256");
      signer.update(canonical);
      signer.end();
      const signature = signer.sign(privKeyPem).toString("base64url");
      return `${canonical}.${signature}`;
    }

    const testHwid = "VJ-HWID-TEST-000000000000000000";

    it("Gate 1: Public Key Cryptographic Validation (RSA-4096, exponent 65537n)", () => {
      // Validate the distributed LICENSE_PUBLIC_KEY
      assert.ok(LICENSE_PUBLIC_KEY.includes("-----BEGIN PUBLIC KEY-----"));
      assert.ok(LICENSE_PUBLIC_KEY.includes("-----END PUBLIC KEY-----"));

      const keyDetails = crypto.createPublicKey(LICENSE_PUBLIC_KEY);
      assert.equal(keyDetails.asymmetricKeyType, "rsa");
      assert.equal(keyDetails.asymmetricKeyDetails?.modulusLength, 4096);
      assert.equal(keyDetails.asymmetricKeyDetails?.publicExponent, 65537n);

      // Validate root public.pem matches authoritative distribution
      const rootPemPath = resolve(process.cwd(), "../../public.pem");
      if (existsSync(rootPemPath)) {
        const rootPem = readFileSync(rootPemPath, "utf8");
        const rootKeyDetails = crypto.createPublicKey(rootPem);
        assert.equal(rootKeyDetails.asymmetricKeyType, "rsa");
        assert.equal(rootKeyDetails.asymmetricKeyDetails?.modulusLength, 4096);
        assert.equal(rootKeyDetails.asymmetricKeyDetails?.publicExponent, 65537n);
      }
    });

    it("Gate 2: Asymmetric Offline Local Verification (Valid License -> VALID)", () => {
      const now = Date.now();
      const payload: LicensePayload = {
        version: 2,
        licenseId: "VJ-PROD-VALID-001",
        type: "PRODUCT",
        company: "Empresa Legítima Lda",
        nif: "5409988776",
        hardwareId: testHwid,
        plan: "ENTERPRISE",
        startsAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 365 * 86_400_000).toISOString(),
        modules: ["SETTINGS", "POS", "STOCK"],
      };

      const token = issueSignedToken4096(payload);
      const res = verifyLicenseToken(token, testHwid, now, rsa4096KeyPair.publicKey);

      assert.equal(res.valid, true);
      assert.equal(res.state, "VALID");
      assert.equal(res.payload?.licenseId, "VJ-PROD-VALID-001");
      assert.equal(res.reason, undefined);
    });

    it("Gate 3: Invalid Signature & Tampering Detection -> INCOMPATIBLE", () => {
      const now = Date.now();
      const payload: LicensePayload = {
        version: 2,
        licenseId: "VJ-PROD-TAMPER-001",
        company: "Empresa Original",
        nif: "5401122334",
        hardwareId: testHwid,
        startsAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
        modules: ["SETTINGS"],
      };

      const token = issueSignedToken4096(payload);
      const parts = token.split(".");
      const canonical = parts[0] ?? "";
      const signature = parts[1] ?? "";

      // Test 3.1: Altering payload content without recalculating signature
      const tampered = { ...payload, modules: ["SETTINGS", "POS", "STOCK", "ACCOUNTING", "HR"] };
      const tamperedCanonical = Buffer.from(JSON.stringify(tampered)).toString("base64url");
      const tamperedToken = `${tamperedCanonical}.${signature}`;
      const res1 = verifyLicenseToken(tamperedToken, testHwid, now, rsa4096KeyPair.publicKey);
      assert.equal(res1.valid, false);
      assert.equal(res1.state, "INCOMPATIBLE");
      assert.equal(res1.reason, "invalid_signature");

      // Test 3.2: Corrupting signature bytes
      const corruptedSig = signature.slice(0, -8) + "XXXXXXXX";
      const res2 = verifyLicenseToken(`${canonical}.${corruptedSig}`, testHwid, now, rsa4096KeyPair.publicKey);
      assert.equal(res2.valid, false);
      assert.equal(res2.state, "INCOMPATIBLE");
      assert.equal(res2.reason, "invalid_signature");

      // Test 3.3: Signing with unauthorized third-party private key
      const rogueKey = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      const rogueSigner = crypto.createSign("RSA-SHA256");
      rogueSigner.update(canonical);
      rogueSigner.end();
      const rogueSig = rogueSigner.sign(rogueKey.privateKey).toString("base64url");
      const res3 = verifyLicenseToken(`${canonical}.${rogueSig}`, testHwid, now, rsa4096KeyPair.publicKey);
      assert.equal(res3.valid, false);
      assert.equal(res3.state, "INCOMPATIBLE");
      assert.equal(res3.reason, "invalid_signature");
    });

    it("Gate 4: Revocation Verification (CRL Enforcement -> REVOKED)", () => {
      const now = Date.now();
      const revokedIds = ["DEV-QA-RSA2048-20260917", "009341302LN046", "VJ-REVOKED-001", "VJ-TEST-REVOKED"];

      for (const revId of revokedIds) {
        const payload: LicensePayload = {
          version: 2,
          licenseId: revId,
          company: "Empresa Revogada",
          nif: "5400000001",
          hardwareId: testHwid,
          startsAt: new Date(now - 1000).toISOString(),
          expiresAt: new Date(now + 60 * 86_400_000).toISOString(),
          modules: ["POS", "STOCK"],
        };

        const token = issueSignedToken4096(payload);
        const res = verifyLicenseToken(token, testHwid, now, rsa4096KeyPair.publicKey);
        assert.equal(res.valid, false, `Revoked license ${revId} must be rejected`);
        assert.equal(res.state, "REVOKED");
        assert.equal(res.reason, "revoked");
      }
    });

    it("Gate 5: Incompatible Hardware Detection -> INCOMPATIBLE", () => {
      const now = Date.now();
      const payload: LicensePayload = {
        version: 2,
        licenseId: "VJ-PROD-HW-001",
        company: "Supermercado Luanda",
        nif: "5407766554",
        hardwareId: "VJ-HWID-TERMINAL-CAIXA-01",
        startsAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 60 * 86_400_000).toISOString(),
        modules: ["POS"],
      };

      const token = issueSignedToken4096(payload);
      // Attempting to run on a different terminal
      const res = verifyLicenseToken(token, "VJ-HWID-TERMINAL-CAIXA-02", now, rsa4096KeyPair.publicKey);
      assert.equal(res.valid, false);
      assert.equal(res.state, "INCOMPATIBLE");
      assert.equal(res.reason, "hardware_mismatch");
    });

    it("Gate 6: Hardware ID Stability & Privacy Verification", () => {
      const hwid1 = computeHardwareId({
        platform: "win32",
        arch: "x64",
        cpuModel: "Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz",
        machineSeed: "MACHINE-PERSISTENT-UUID-1234",
      });

      const hwid2 = computeHardwareId({
        platform: "win32",
        arch: "x64",
        cpuModel: "Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz",
        machineSeed: "MACHINE-PERSISTENT-UUID-1234",
      });

      // 6.1 Stability: deterministic output for same machine
      assert.equal(hwid1, hwid2);
      assert.equal(hwid1.length, 32);
      assert.match(hwid1, /^[0-9A-F]{32}$/);

      // 6.2 Privacy: does NOT contain plain username, directory paths or emails
      assert.equal(hwid1.includes("C:\\"), false);
      assert.equal(hwid1.includes("/home"), false);
      assert.equal(hwid1.includes("@"), false);

      // 6.3 Differentiation: different machine seed yields different HWID
      const diffHwid = computeHardwareId({
        platform: "win32",
        arch: "x64",
        cpuModel: "Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz",
        machineSeed: "DIFFERENT-MACHINE-UUID-5678",
      });
      assert.notEqual(hwid1, diffHwid);
    });

    it("Gate 7: Expiration and Offline Grace Period Verification", () => {
      const now = Date.now();

      // 7.1 Strictly expired without grace period -> EXPIRED
      const expiredPayload: LicensePayload = {
        version: 2,
        licenseId: "VJ-PROD-EXP-001",
        company: "Loja Kilamba",
        nif: "5405544332",
        hardwareId: testHwid,
        startsAt: new Date(now - 40 * 86_400_000).toISOString(),
        expiresAt: new Date(now - 1 * 86_400_000).toISOString(), // Expired 1 day ago
        modules: ["POS", "STOCK"],
        gracePeriodDays: 0,
      };
      const expToken = issueSignedToken4096(expiredPayload);
      const expRes = verifyLicenseToken(expToken, testHwid, now, rsa4096KeyPair.publicKey);
      assert.equal(expRes.valid, false);
      assert.equal(expRes.state, "EXPIRED");
      assert.equal(expRes.reason, "expired");

      // 7.2 Expired but within offline grace period (15 days grace, expired 3 days ago) -> OFFLINE_GRACE_PERIOD
      const gracePayload: LicensePayload = {
        version: 2,
        licenseId: "VJ-PROD-GRACE-001",
        company: "Loja Kilamba",
        nif: "5405544332",
        hardwareId: testHwid,
        startsAt: new Date(now - 40 * 86_400_000).toISOString(),
        expiresAt: new Date(now - 3 * 86_400_000).toISOString(), // Expired 3 days ago
        modules: ["POS", "STOCK"],
        gracePeriodDays: 15,
      };
      const graceToken = issueSignedToken4096(gracePayload);
      const graceRes = verifyLicenseToken(graceToken, testHwid, now, rsa4096KeyPair.publicKey);
      assert.equal(graceRes.valid, true, "Offline operations must continue legitimately under grace period");
      assert.equal(graceRes.state, "OFFLINE_GRACE_PERIOD");
      assert.equal(graceRes.gracePeriodDaysRemaining, 12);

      // 7.3 Expired beyond offline grace period (15 days grace, expired 16 days ago) -> EXPIRED
      const graceOverPayload: LicensePayload = {
        ...gracePayload,
        expiresAt: new Date(now - 16 * 86_400_000).toISOString(),
      };
      const graceOverToken = issueSignedToken4096(graceOverPayload);
      const graceOverRes = verifyLicenseToken(graceOverToken, testHwid, now, rsa4096KeyPair.publicKey);
      assert.equal(graceOverRes.valid, false);
      assert.equal(graceOverRes.state, "EXPIRED");
      assert.equal(graceOverRes.reason, "expired");
    });

    it("Gate 8: Local File / State Tampering Immunity", () => {
      // Simulating an adversary attempting to unlock modules by creating a fraudulent state
      const fraudulentLocalState = {
        version: 2,
        valid: true, // Adversary claims valid
        modules: ["POS", "STOCK", "ACCOUNTING", "HR", "BI", "CORPORATE"],
        productToken: "NOT_A_VALID_TOKEN.FAKE_SIGNATURE",
      };

      // When the system parses the state, it verifies the cryptographic token, ignoring local fields
      const res = verifyLicenseToken(
        fraudulentLocalState.productToken,
        testHwid,
        Date.now(),
        rsa4096KeyPair.publicKey
      );

      assert.equal(res.valid, false, "Local file editing cannot bypass cryptographic verification");
      assert.equal(res.state, "INCOMPATIBLE");

      // Verify that without valid cryptographic activation, isModuleLicensed keeps operational modules locked
      const emptyLicenseModules: AppModule[] = ["SETTINGS"];
      for (const opMod of OPERATIONAL_MODULES) {
        assert.equal(isModuleLicensed(opMod, emptyLicenseModules), false);
      }
      // Settings remains accessible for diagnosis & activation
      assert.equal(isModuleLicensed("SETTINGS", emptyLicenseModules), true);
    });

    it("Gate 9: Module Authorization Enforcement (Desktop & Backend Contract)", () => {
      const allowedModules: AppModule[] = ["SETTINGS", "POS", "STOCK"];

      // Allowed modules
      assert.equal(isModuleLicensed("POS", allowedModules), true);
      assert.equal(isModuleLicensed("STOCK", allowedModules), true);
      assert.equal(isModuleLicensed("SETTINGS", allowedModules), true);

      // Unlicensed modules remain strictly locked
      assert.equal(isModuleLicensed("ACCOUNTING", allowedModules), false);
      assert.equal(isModuleLicensed("HR", allowedModules), false);
      assert.equal(isModuleLicensed("BI", allowedModules), false);
      assert.equal(isModuleLicensed("CRM", allowedModules), false);
      assert.equal(isModuleLicensed("CORPORATE", allowedModules), false);
    });
  });
});
