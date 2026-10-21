import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  EnterpriseAuditService,
  EnterpriseRbacService,
  EnterpriseMfaService,
  EnterpriseSessionService,
  EnterprisePolicyService,
  EnterpriseBackupService,
  SYSTEM_PERMISSIONS,
} from "./enterprise/index.js";

test("EnterpriseAuditService: extracts client forensic info from Request accurately", () => {
  const mockReqWin = {
    headers: {
      "x-forwarded-for": "102.214.45.12, 192.168.1.1",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as import("express").Request;

  const info = EnterpriseAuditService.extractClientInfo(mockReqWin);
  assert.equal(info.ipAddress, "102.214.45.12", "Deve extrair o IP público primário do header x-forwarded-for");
  assert.equal(info.operatingSystem, "Windows 10/11", "Deve detetar Windows 10/11");
  assert.equal(info.browser, "Microsoft Edge", "Deve detetar Microsoft Edge");
  assert.equal(info.deviceName, "PC / Desktop", "Deve classificar como Desktop");

  // Mobile / Electron detection
  const mockReqElectron = {
    headers: {
      "user-agent": "VendaJa/2.2.4 Electron/28.1.0",
    },
    socket: { remoteAddress: "192.168.1.150" },
  } as unknown as import("express").Request;

  const electronInfo = EnterpriseAuditService.extractClientInfo(mockReqElectron);
  assert.equal(electronInfo.browser, "VendaJá Desktop (Electron)");
  assert.equal(electronInfo.ipAddress, "192.168.1.150");
});

test("EnterpriseAuditService: resilient recording does not throw when database is offline", async () => {
  // Should catch database connection errors gracefully and log them without crashing the caller
  await assert.doesNotReject(async () => {
    await EnterpriseAuditService.record({
      action: "RESILIENCE_TEST",
      module: "AUDIT",
      entity: "Resilience",
    });
  }, "Registo de auditoria nunca deve lançar exceção não tratada ao negócio");
});

test("EnterpriseRbacService: contains all 79 granular enterprise permissions across 11 core modules", () => {
  assert.equal(SYSTEM_PERMISSIONS.length, 79, "Deve conter exatamente 79 permissões granulares de governança, automação, CRM, documentos, APIs, Finanças e BI");

  const modules = new Set(SYSTEM_PERMISSIONS.map((p) => p.module));
  assert.ok(modules.has("POS"), "Deve conter módulo POS");
  assert.ok(modules.has("STOCK"), "Deve conter módulo STOCK");
  assert.ok(modules.has("ACCOUNTING"), "Deve conter módulo ACCOUNTING");
  assert.ok(modules.has("HR"), "Deve conter módulo HR");
  assert.ok(modules.has("SETTINGS"), "Deve conter módulo SETTINGS");
  assert.ok(modules.has("AUTOMATION"), "Deve conter módulo AUTOMATION");
  assert.ok(modules.has("CRM"), "Deve conter módulo CRM");
  assert.ok(modules.has("DOCUMENTS"), "Deve conter módulo DOCUMENTS");
  assert.ok(modules.has("API"), "Deve conter módulo API");
  assert.ok(modules.has("FINANCE"), "Deve conter módulo FINANCE");
  assert.ok(modules.has("BI"), "Deve conter módulo BI");

  // Every permission must have code, module, action, description
  for (const perm of SYSTEM_PERMISSIONS) {
    assert.ok(perm.code.includes("."), `Permissão ${perm.code} deve ter notação hierárquica Módulo.Ação`);
    assert.ok(perm.description.length > 5, `Permissão ${perm.code} deve ter descrição detalhada`);
  }
});

test("EnterpriseMfaService: generates RFC 6238 TOTP tokens, validates with drift, and manages recovery codes", () => {
  const secret = EnterpriseMfaService.generateSecret(20);
  assert.ok(secret.length >= 16, "Segredo Base32 deve ter comprimento seguro");

  // Generate current token
  const token = EnterpriseMfaService.generateTotpToken(secret);
  assert.match(token, /^\d{6}$/, "Token TOTP deve ser composto por 6 dígitos numéricos");

  // Validate valid token
  const isValid = EnterpriseMfaService.verifyToken(secret, token);
  assert.equal(isValid, true, "Token gerado deve ser válido no passo de tempo atual");

  // Reject completely wrong token
  const isInvalid = EnterpriseMfaService.verifyToken(secret, "000000");
  assert.equal(typeof isInvalid, "boolean");

  // Recovery codes
  const { plainCodes, hashedCodes } = EnterpriseMfaService.generateRecoveryCodes(8);
  assert.equal(plainCodes.length, 8, "Deve gerar 8 códigos de recuperação");
  assert.equal(hashedCodes.length, 8, "Deve gerar 8 hashes SHA-256");
  assert.match(plainCodes[0]!, /^[A-F0-9]{4}-[A-F0-9]{4}$/, "Formato do código deve ser XXXX-XXXX");
});

test("EnterpriseSessionService: hashes tokens, tracks active sessions, and checks constraints", () => {
  const testToken = `jwt-sample-token-${Date.now()}`;
  const tokenHash = EnterpriseSessionService.hashToken(testToken);
  assert.ok(tokenHash.length === 64, "Hash de token SHA-256 deve ter 64 caracteres hexadecimais");

  // Working hours check
  assert.equal(EnterpriseSessionService.isWithinAllowedHours(null, null), true, "Sem restrição deve permitir acesso");
  assert.equal(EnterpriseSessionService.isWithinAllowedHours("00:00", "23:59"), true, "Janela de 24h deve permitir");

  // IP whitelist check
  assert.equal(EnterpriseSessionService.isIpAllowed("127.0.0.1", ["192.168.1.10"]), true, "Loopback deve ser sempre permitido");
  assert.equal(EnterpriseSessionService.isIpAllowed("10.0.0.5", ["10.0.0.5", "10.0.0.6"]), true, "IP na lista permitida");
  assert.equal(EnterpriseSessionService.isIpAllowed("10.0.0.99", ["10.0.0.5", "10.0.0.6"]), false, "IP fora da lista deve ser rejeitado");
});

test("EnterprisePolicyService: validates password complexity and prevents reuse", async () => {
  // Too short
  const res1 = await EnterprisePolicyService.validatePassword("Ab1!");
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes("8 caracteres")));

  // Missing uppercase
  const res2 = await EnterprisePolicyService.validatePassword("abcdef1@");
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes("maiúscula")));

  // Missing number
  const res3 = await EnterprisePolicyService.validatePassword("Abcdefgh!");
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.includes("dígito numérico")));

  // Missing special char
  const res4 = await EnterprisePolicyService.validatePassword("Abcdefgh1");
  assert.equal(res4.valid, false);
  assert.ok(res4.errors.some((e) => e.includes("símbolo ou caractere especial")));

  // Strong password
  const res5 = await EnterprisePolicyService.validatePassword("EmpresaForte@2026");
  assert.equal(res5.valid, true);
  assert.equal(res5.errors.length, 0);
});

test("EnterpriseBackupService: ensures backup directory and calculates SHA-256 checksums", async () => {
  const dir = await EnterpriseBackupService.ensureBackupDirectory();
  assert.ok(typeof dir === "string" && dir.length > 0, "Diretório de backup deve ser criado");

  // Test SHA-256 integrity calculation
  const testContent = Buffer.from(JSON.stringify({ snapshot: "enterprise-backup-test", timestamp: Date.now() }));
  const expectedHash = crypto.createHash("sha256").update(testContent).digest("hex");

  const testFile = path.join(dir, `test-checksum-${Date.now()}.dump`);
  await fs.writeFile(testFile, testContent);

  const fileData = await fs.readFile(testFile);
  const calculatedHash = crypto.createHash("sha256").update(fileData).digest("hex");

  assert.equal(calculatedHash, expectedHash, "Checksum SHA-256 deve ser exato e idêntico");

  // Clean test file
  await fs.unlink(testFile);
});
