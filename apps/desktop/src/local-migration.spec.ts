import test from "node:test";
import assert from "node:assert/strict";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  ensureDesktopDataMigration,
  resolveMachineSeed,
  sanitizeNetworkError,
  computeFileSha256,
  transactionalMigrateFile,
  transactionalMigrateDirectory,
  cleanLeftoverStaging,
  AUTHORIZED_MIGRATION_ENTRIES,
  LEGACY_DIR_NAMES,
  type MigrationResult,
} from "./local-migration.js";
import { computeHardwareId } from "./license-core.js";
import { EnterpriseLocalCopilotEngine } from "./local-copilot-engine.js";
import {
  MutshimaClient,
  MutshimaClientConfig,
  MutshimaApiError,
  VendaJaClient,
  VendaJaClientConfig,
  VendaJaApiError,
} from "@angola/sdk";

function createTempDir(prefix: string): string {
  const tmpBase = os.tmpdir();
  const dir = path.join(tmpBase, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fsSync.mkdirSync(dir, { recursive: true });
  return dir;
}

test("Migration: Legacy system machine-id is preserved and synced to Mutshima without mutating legacy file", () => {
  const tmpDir = createTempDir("test-machine-seed-legacy");
  const programDataDir = path.join(tmpDir, "ProgramData");
  const legacyDir = path.join(programDataDir, "VendaJa");
  const mutshimaDir = path.join(programDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });
  const fixedLegacySeed = "LEGACY-STABLE-HWID-SEED-1234567890";
  fsSync.writeFileSync(path.join(legacyDir, "machine-id"), fixedLegacySeed, "utf8");

  const result = resolveMachineSeed({ programDataDir });

  assert.equal(result.seed, fixedLegacySeed);
  assert.equal(result.source, "legacy-system");

  // Legacy file remains intact and unchanged
  assert.equal(fsSync.readFileSync(path.join(legacyDir, "machine-id"), "utf8"), fixedLegacySeed);

  // Mutshima path is synced for future operations
  assert.ok(fsSync.existsSync(path.join(mutshimaDir, "machine-id")));
  assert.equal(fsSync.readFileSync(path.join(mutshimaDir, "machine-id"), "utf8"), fixedLegacySeed);

  // Compute HWID and ensure it matches the legacy seed
  const hwid = computeHardwareId({ machineSeed: result.seed });
  assert.ok(hwid.length > 10);
  assert.equal(hwid, computeHardwareId({ machineSeed: fixedLegacySeed }));

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Migration: Clean install generates fresh UUID in Mutshima path when no legacy data exists", () => {
  const tmpDir = createTempDir("test-machine-seed-clean");
  const programDataDir = path.join(tmpDir, "ProgramData");
  const targetUserDataDir = path.join(tmpDir, "UserData");

  const result = resolveMachineSeed({ programDataDir, targetUserDataDir });

  assert.equal(result.source, "fresh-generated");
  assert.ok(result.seed.length >= 16);

  // Sincronizado no caminho de sistema Mutshima
  const mutshimaSystemFile = path.join(programDataDir, "Mutshima", "machine-id");
  assert.ok(fsSync.existsSync(mutshimaSystemFile));
  assert.equal(fsSync.readFileSync(mutshimaSystemFile, "utf8"), result.seed);

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Migration: Operational files in legacy userData are migrated atomically to Mutshima with version marker", () => {
  const tmpDir = createTempDir("test-userdata-migration");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacyDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });

  // Simulate existing operational data from VendaJá
  const serverConfig = JSON.stringify({ apiUrl: "https://api.empresa.ao", terminalId: "pos-01" });
  const licenseState = JSON.stringify({ version: 2, token: "JWT-TEST-LICENSE-123" });
  const outboxData = JSON.stringify([{ id: "sale-01", totalCents: 50000 }]);

  fsSync.writeFileSync(path.join(legacyDir, "server-config.json"), serverConfig, "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "license-state.json"), licenseState, "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "outbox.json"), outboxData, "utf8");

  // Subdirectory
  const cacheDir = path.join(legacyDir, "cache");
  fsSync.mkdirSync(cacheDir, { recursive: true });
  fsSync.writeFileSync(path.join(cacheDir, "catalog.json"), '{"products":[]}', "utf8");

  const res: MigrationResult = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
    targetDirName: "Mutshima",
  });

  assert.equal(res.legacyFound, true);
  assert.equal(res.migrated, true);
  assert.ok(res.migratedFiles.includes("server-config.json"));
  assert.ok(res.migratedFiles.includes("license-state.json"));
  assert.ok(res.migratedFiles.includes("outbox.json"));
  assert.ok(res.migratedFiles.includes("cache/"));

  // Target directory contains exact migrated content
  assert.equal(fsSync.readFileSync(path.join(targetDir, "server-config.json"), "utf8"), serverConfig);
  assert.equal(fsSync.readFileSync(path.join(targetDir, "license-state.json"), "utf8"), licenseState);
  assert.equal(fsSync.readFileSync(path.join(targetDir, "outbox.json"), "utf8"), outboxData);
  assert.equal(fsSync.readFileSync(path.join(targetDir, "cache", "catalog.json"), "utf8"), '{"products":[]}');

  // Legacy files were NOT deleted or mutated
  assert.equal(fsSync.readFileSync(path.join(legacyDir, "server-config.json"), "utf8"), serverConfig);
  assert.equal(fsSync.readFileSync(path.join(legacyDir, "license-state.json"), "utf8"), licenseState);

  // Version marker exists in target
  const markerPath = path.join(targetDir, ".rebranding-migration.json");
  assert.ok(fsSync.existsSync(markerPath));
  const marker = JSON.parse(fsSync.readFileSync(markerPath, "utf8"));
  assert.equal(marker.version, 1);
  assert.equal(marker.status, "COMPLETED");

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Migration: Existing Mutshima data takes strict precedence (never overwritten by legacy data)", () => {
  const tmpDir = createTempDir("test-userdata-no-overwrite");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacyDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });
  fsSync.mkdirSync(targetDir, { recursive: true });

  const legacyConfig = JSON.stringify({ apiUrl: "https://legacy-venda-ja.ao", terminalId: "old-01" });
  const modernConfig = JSON.stringify({ apiUrl: "https://modern-mutshima.ao", terminalId: "new-01" });

  fsSync.writeFileSync(path.join(legacyDir, "server-config.json"), legacyConfig, "utf8");
  fsSync.writeFileSync(path.join(targetDir, "server-config.json"), modernConfig, "utf8");

  const res = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
    targetDirName: "Mutshima",
  });

  assert.equal(res.legacyFound, true);
  assert.ok(res.skippedFiles.includes("server-config.json"));

  // Mutshima configuration remains untouched
  assert.equal(fsSync.readFileSync(path.join(targetDir, "server-config.json"), "utf8"), modernConfig);

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Migration: Idempotency - running migration multiple times does not corrupt or duplicate data", () => {
  const tmpDir = createTempDir("test-userdata-idempotent");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacyDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });
  fsSync.writeFileSync(path.join(legacyDir, "license-state.json"), '{"valid":true}', "utf8");

  const firstRun = ensureDesktopDataMigration({ appDataDir, targetUserDataDir: targetDir });
  assert.equal(firstRun.migrated, true);

  const secondRun = ensureDesktopDataMigration({ appDataDir, targetUserDataDir: targetDir });
  assert.equal(secondRun.migrated, false);
  assert.ok(secondRun.skippedFiles.includes("license-state.json"));

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Phase 11.2 Scenario 1: Mid-copy failure leaves no corrupted/partial files in target and records PARTIAL status", () => {
  const tmpDir = createTempDir("test-phase-11-2-failure");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacyDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });

  const serverConfig = JSON.stringify({ apiUrl: "https://erp.empresa.ao", terminalId: "caixa-01" });
  const licenseState = JSON.stringify({ token: "JWT-SECRET-TOKEN", valid: true });

  fsSync.writeFileSync(path.join(legacyDir, "server-config.json"), serverConfig, "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "license-state.json"), licenseState, "utf8");

  // Simula falha na cópia do item license-state.json
  const res = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
    targetDirName: "Mutshima",
    _simulateFailureOnItem: "license-state.json",
  });

  // Estado é PARTIAL, nunca COMPLETED
  assert.equal(res.status, "PARTIAL");
  assert.ok(res.migratedFiles.includes("server-config.json"));
  assert.equal(res.failedFiles.length, 1);
  assert.equal(res.failedFiles[0]?.item, "license-state.json");

  // server-config.json foi promovido com sucesso
  assert.ok(fsSync.existsSync(path.join(targetDir, "server-config.json")));
  assert.equal(fsSync.readFileSync(path.join(targetDir, "server-config.json"), "utf8"), serverConfig);

  // license-state.json NÃO existe no destino final
  assert.equal(fsSync.existsSync(path.join(targetDir, "license-state.json")), false);

  // Ausência absoluta de ficheiros de staging parciais (.tmp-*) no destino
  const remainingTargetFiles = fsSync.readdirSync(targetDir);
  for (const f of remainingTargetFiles) {
    assert.ok(!f.startsWith(".tmp-"), `Ficheiro temporário residual detetado: ${f}`);
  }

  // O ficheiro de origem legada permanece totalmente intacto
  assert.equal(fsSync.readFileSync(path.join(legacyDir, "license-state.json"), "utf8"), licenseState);

  // Marcador gravado com status PARTIAL
  const markerPath = path.join(targetDir, ".rebranding-migration.json");
  assert.ok(fsSync.existsSync(markerPath));
  const marker = JSON.parse(fsSync.readFileSync(markerPath, "utf8"));
  assert.equal(marker.status, "PARTIAL");
  assert.ok(marker.failedFiles.some((f: any) => f.item === "license-state.json"));

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Phase 11.2 Scenario 2: Resumption after PARTIAL migrates missing items and advances to COMPLETED", () => {
  const tmpDir = createTempDir("test-phase-11-2-resumption");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacyDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });

  const serverConfig = JSON.stringify({ apiUrl: "https://erp.empresa.ao", terminalId: "caixa-01" });
  const licenseState = JSON.stringify({ token: "JWT-SECRET-TOKEN", valid: true });

  fsSync.writeFileSync(path.join(legacyDir, "server-config.json"), serverConfig, "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "license-state.json"), licenseState, "utf8");

  // 1ª Execução: falha controlada em license-state.json
  const firstRun = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
    _simulateFailureOnItem: "license-state.json",
  });
  assert.equal(firstRun.status, "PARTIAL");

  // 2ª Execução: retoma normal sem falhas
  const secondRun = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
  });

  assert.equal(secondRun.status, "COMPLETED");
  assert.ok(secondRun.migratedFiles.includes("license-state.json"));
  assert.ok(secondRun.skippedFiles.includes("server-config.json")); // Já existia, foi ignorado/preservado
  assert.equal(secondRun.failedFiles.length, 0);

  // Ambos os ficheiros agora existem no destino
  assert.ok(fsSync.existsSync(path.join(targetDir, "server-config.json")));
  assert.ok(fsSync.existsSync(path.join(targetDir, "license-state.json")));
  assert.equal(fsSync.readFileSync(path.join(targetDir, "license-state.json"), "utf8"), licenseState);

  // Marcador atualizado para COMPLETED
  const markerPath = path.join(targetDir, ".rebranding-migration.json");
  const marker = JSON.parse(fsSync.readFileSync(markerPath, "utf8"));
  assert.equal(marker.status, "COMPLETED");
  assert.equal(marker.failedFiles.length, 0);

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Phase 11.2 Scenario 3: Unauthorized files in legacy directory (*.tmp, *.dmp, *.log, *.exe, secret.key) are strictly ignored", () => {
  const tmpDir = createTempDir("test-phase-11-2-allowlist");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacyDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });

  // Ficheiro autorizado
  fsSync.writeFileSync(path.join(legacyDir, "server-config.json"), '{"apiUrl":"https://empresa.ao"}', "utf8");

  // Ficheiros NÃO autorizados que possam existir em instalações legadas
  fsSync.writeFileSync(path.join(legacyDir, "secret.key"), "SUPER-SECRET-PRIVATE-KEY", "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "crash.dmp"), "CORE DUMP BINARY DATA", "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "electron-debug.log"), "2026-11-13 LOG", "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "setup-update.exe"), "EXE_BYTES", "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "temporary-cache.tmp"), "TMP_DATA", "utf8");

  const res = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
  });

  assert.equal(res.status, "COMPLETED");
  assert.deepEqual(res.migratedFiles, ["server-config.json"]);

  // Apenas o ficheiro autorizado foi migrado
  assert.ok(fsSync.existsSync(path.join(targetDir, "server-config.json")));

  // Nenhum ficheiro não autorizado foi migrado
  assert.equal(fsSync.existsSync(path.join(targetDir, "secret.key")), false);
  assert.equal(fsSync.existsSync(path.join(targetDir, "crash.dmp")), false);
  assert.equal(fsSync.existsSync(path.join(targetDir, "electron-debug.log")), false);
  assert.equal(fsSync.existsSync(path.join(targetDir, "setup-update.exe")), false);
  assert.equal(fsSync.existsSync(path.join(targetDir, "temporary-cache.tmp")), false);

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Phase 11.2 Scenario 4: Integrity verification - byte-by-byte SHA-256 comparison between source and destination", () => {
  const tmpDir = createTempDir("test-phase-11-2-integrity");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacyDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });

  const filesToCreate = [
    { name: "license-state.json", content: crypto.randomBytes(1024).toString("hex") },
    { name: "server-config.json", content: crypto.randomBytes(512).toString("hex") },
    { name: "outbox.json", content: crypto.randomBytes(2048).toString("hex") },
  ];

  for (const item of filesToCreate) {
    fsSync.writeFileSync(path.join(legacyDir, item.name), item.content, "utf8");
  }

  // Subpasta com múltiplos ficheiros
  const cacheSubdir = path.join(legacyDir, "cache");
  fsSync.mkdirSync(cacheSubdir, { recursive: true });
  const cacheFiles = [
    { name: "products.json", content: JSON.stringify({ p: 1, hash: crypto.randomUUID() }) },
    { name: "customers.json", content: JSON.stringify({ c: 2, hash: crypto.randomUUID() }) },
  ];
  for (const cf of cacheFiles) {
    fsSync.writeFileSync(path.join(cacheSubdir, cf.name), cf.content, "utf8");
  }

  const res = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
  });

  assert.equal(res.status, "COMPLETED");

  // Validação SHA-256 byte a byte de cada ficheiro
  for (const item of filesToCreate) {
    const srcFile = path.join(legacyDir, item.name);
    const dstFile = path.join(targetDir, item.name);
    const srcMeta = computeFileSha256(srcFile);
    const dstMeta = computeFileSha256(dstFile);

    assert.equal(dstMeta.size, srcMeta.size, `Tamanho divergente para ${item.name}`);
    assert.equal(dstMeta.sha256, srcMeta.sha256, `SHA-256 divergente para ${item.name}`);
  }

  for (const cf of cacheFiles) {
    const srcFile = path.join(cacheSubdir, cf.name);
    const dstFile = path.join(targetDir, "cache", cf.name);
    const srcMeta = computeFileSha256(srcFile);
    const dstMeta = computeFileSha256(dstFile);

    assert.equal(dstMeta.size, srcMeta.size, `Tamanho divergente na subpasta para ${cf.name}`);
    assert.equal(dstMeta.sha256, srcMeta.sha256, `SHA-256 divergente na subpasta para ${cf.name}`);
  }

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Phase 11.2 Scenario 5: Precedence - existing Mutshima file is never overwritten or altered", () => {
  const tmpDir = createTempDir("test-phase-11-2-precedence");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacyDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacyDir, { recursive: true });
  fsSync.mkdirSync(targetDir, { recursive: true });

  const modernContent = JSON.stringify({ apiUrl: "https://mutshima.empresa.ao", version: "modern-2.0" });
  const legacyContent = JSON.stringify({ apiUrl: "https://vendaja.empresa.ao", version: "legacy-1.0" });

  fsSync.writeFileSync(path.join(targetDir, "server-config.json"), modernContent, "utf8");
  fsSync.writeFileSync(path.join(legacyDir, "server-config.json"), legacyContent, "utf8");

  const modernHashBefore = computeFileSha256(path.join(targetDir, "server-config.json")).sha256;

  const res = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
  });

  assert.ok(res.skippedFiles.includes("server-config.json"));

  const modernHashAfter = computeFileSha256(path.join(targetDir, "server-config.json")).sha256;
  assert.equal(modernHashAfter, modernHashBefore);
  assert.equal(fsSync.readFileSync(path.join(targetDir, "server-config.json"), "utf8"), modernContent);

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Phase 11.2 Scenario 6: Copilot AI without configured URL eliminates localhost:4000 and classifies SERVER_UNCONFIGURED", () => {
  const fetchErr = new TypeError("Failed to fetch");

  // Chamada sem targetUrl
  const withoutUrl = EnterpriseLocalCopilotEngine.classifyError(fetchErr);
  assert.equal(withoutUrl.code, "SERVER_UNCONFIGURED");
  assert.equal(withoutUrl.isOffline, true);
  assert.ok(!withoutUrl.userMessage.includes("localhost"), "Mensagem não pode conter 'localhost'");
  assert.ok(!withoutUrl.userMessage.includes("4000"), "Mensagem não pode conter '4000'");
  assert.ok(withoutUrl.userMessage.includes("Servidor central não configurado"));

  // Chamada com targetUrl vazia
  const withEmptyUrl = EnterpriseLocalCopilotEngine.classifyError(fetchErr, "");
  assert.equal(withEmptyUrl.code, "SERVER_UNCONFIGURED");
  assert.ok(!withEmptyUrl.userMessage.includes("localhost"));
  assert.ok(!withEmptyUrl.userMessage.includes("4000"));

  // Sanitizador genérico de erros de rede
  const unconfiguredSanitized = sanitizeNetworkError(new Error("Servidor central não configurado."));
  assert.equal(unconfiguredSanitized, "Servidor central não configurado.");
  assert.ok(!unconfiguredSanitized.includes("localhost"));
  assert.ok(!unconfiguredSanitized.includes("4000"));
});

test("Phase 11.2 Scenario 7: Realistic end-to-end upgrade preserves license, HWID, server config, outbox, and cache", () => {
  const tmpDir = createTempDir("test-phase-11-2-e2e-upgrade");
  const programDataDir = path.join(tmpDir, "ProgramData");
  const appDataDir = path.join(tmpDir, "AppData");
  const legacySystemDir = path.join(programDataDir, "VendaJa");
  const legacyUserDataDir = path.join(appDataDir, "VendaJá Angola");
  const targetDir = path.join(appDataDir, "Mutshima");

  fsSync.mkdirSync(legacySystemDir, { recursive: true });
  fsSync.mkdirSync(legacyUserDataDir, { recursive: true });

  // 1. Identificador estável legado de máquina
  const fixedLegacyMachineSeed = "VENDOR-LEGACY-MACHINE-SEED-987654321";
  fsSync.writeFileSync(path.join(legacySystemDir, "machine-id"), fixedLegacyMachineSeed, "utf8");

  // 2. Dados operacionais legados
  const serverConfig = JSON.stringify({ apiUrl: "https://erp.empresa.ao", terminalId: "CAIXA-01" });
  const licenseState = JSON.stringify({ token: "JWT-OFFLINE-LICENSE", valid: true, expiresAt: "2027-12-31" });
  const outboxData = JSON.stringify([{ id: "sale-offline-01", totalCents: 1500000 }]);

  fsSync.writeFileSync(path.join(legacyUserDataDir, "server-config.json"), serverConfig, "utf8");
  fsSync.writeFileSync(path.join(legacyUserDataDir, "license-state.json"), licenseState, "utf8");
  fsSync.writeFileSync(path.join(legacyUserDataDir, "outbox.json"), outboxData, "utf8");

  const cacheDir = path.join(legacyUserDataDir, "cache");
  fsSync.mkdirSync(cacheDir, { recursive: true });
  fsSync.writeFileSync(path.join(cacheDir, "catalog-v1.json"), '{"items":[{"id":"1","name":"Arroz"}]}', "utf8");

  // PASSO A: Resolução do HWID com preservação estrita da seed legada
  const seedResult = resolveMachineSeed({ programDataDir });
  assert.equal(seedResult.seed, fixedLegacyMachineSeed);
  assert.equal(seedResult.source, "legacy-system");

  const hwidLegacy = computeHardwareId({ machineSeed: fixedLegacyMachineSeed });
  const hwidResolved = computeHardwareId({ machineSeed: seedResult.seed });
  assert.equal(hwidResolved, hwidLegacy);

  // PASSO B: Execução da migração atómica de userData
  const migResult = ensureDesktopDataMigration({
    appDataDir,
    targetUserDataDir: targetDir,
  });

  assert.equal(migResult.status, "COMPLETED");
  assert.equal(migResult.legacyFound, true);
  assert.equal(migResult.migrated, true);

  // PASSO C: Validação de continuidade e integridade operacional dos dados no Mutshima
  assert.equal(fsSync.readFileSync(path.join(targetDir, "server-config.json"), "utf8"), serverConfig);
  assert.equal(fsSync.readFileSync(path.join(targetDir, "license-state.json"), "utf8"), licenseState);
  assert.equal(fsSync.readFileSync(path.join(targetDir, "outbox.json"), "utf8"), outboxData);
  assert.equal(fsSync.readFileSync(path.join(targetDir, "cache", "catalog-v1.json"), "utf8"), '{"items":[{"id":"1","name":"Arroz"}]}');

  // PASSO D: Validação de que a pasta legada original permaneceu estritamente intacta
  assert.equal(fsSync.readFileSync(path.join(legacyUserDataDir, "server-config.json"), "utf8"), serverConfig);
  assert.equal(fsSync.readFileSync(path.join(legacyUserDataDir, "license-state.json"), "utf8"), licenseState);
  assert.equal(fsSync.readFileSync(path.join(legacySystemDir, "machine-id"), "utf8"), fixedLegacyMachineSeed);

  // PASSO E: HWID calculado subsequentemente a partir da pasta Mutshima é byte-idêntico ao original
  const mutshimaSysSeed = fsSync.readFileSync(path.join(programDataDir, "Mutshima", "machine-id"), "utf8");
  assert.equal(mutshimaSysSeed, fixedLegacyMachineSeed);
  assert.equal(computeHardwareId({ machineSeed: mutshimaSysSeed }), hwidLegacy);

  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

test("Error sanitization: Technical network errors are sanitized without exposing ECONNREFUSED or stack traces", () => {
  const econnErr = new Error("connect ECONNREFUSED 127.0.0.1:4000");
  const sanitizedEconn = sanitizeNetworkError(econnErr);
  assert.ok(!sanitizedEconn.includes("ECONNREFUSED"));
  assert.ok(!sanitizedEconn.includes("127.0.0.1"));
  assert.equal(sanitizedEconn, "Não foi possível estabelecer ligação ao servidor central configurado.");

  const fetchErr = new TypeError("Failed to fetch");
  const sanitizedFetch = sanitizeNetworkError(fetchErr);
  assert.ok(!sanitizedFetch.includes("Failed to fetch"));
  assert.equal(sanitizedFetch, "Não foi possível estabelecer ligação ao servidor central configurado.");

  const timeoutErr = new Error("The user aborted a request / timeout");
  const sanitizedTimeout = sanitizeNetworkError(timeoutErr);
  assert.equal(sanitizedTimeout, "Tempo limite de resposta do servidor central excedido.");

  const unconfiguredErr = new Error("Servidor central não configurado.");
  const sanitizedUnconfigured = sanitizeNetworkError(unconfiguredErr);
  assert.equal(sanitizedUnconfigured, "Servidor central não configurado.");
});

test("SDK Backward Compatibility: Exports MutshimaClient and retains VendaJaClient alias", () => {
  assert.equal(typeof MutshimaClient, "function");
  assert.equal(typeof VendaJaClient, "function");
  assert.equal(MutshimaClient, VendaJaClient);

  assert.equal(typeof MutshimaApiError, "function");
  assert.equal(typeof VendaJaApiError, "function");
  assert.equal(MutshimaApiError, VendaJaApiError);

  const client = new MutshimaClient({ baseUrl: "https://api.mutshima.ao", apiKey: "test-key" });
  assert.ok(client instanceof MutshimaClient);
  assert.ok(client instanceof VendaJaClient);

  const legacyClient = new VendaJaClient({ baseUrl: "https://api.mutshima.ao", apiKey: "test-key" });
  assert.ok(legacyClient instanceof MutshimaClient);
  assert.ok(legacyClient instanceof VendaJaClient);
});
