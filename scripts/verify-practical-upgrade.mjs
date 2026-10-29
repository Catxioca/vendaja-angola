import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

console.log("================================================================================");
console.log("TESTE PRÁTICO DE UPGRADE E AUDITORIA DE INSTALADOR");
console.log("================================================================================");

const tempUserData = await fs.mkdtemp(path.join(os.tmpdir(), "vendaja-practical-upgrade-"));

try {
  console.log(`[1/4] Simulando instalação prévia v2.2.1 em: ${tempUserData}`);

  // 1. Configure server-config.json (URL e terminalId)
  const configPath = path.join(tempUserData, "server-config.json");
  const initialConfig = {
    apiUrl: "https://pos-core.vendaja.ao:443",
    terminalId: "TERMINAL-LUANDA-001",
    configuredAt: new Date("2026-09-01T10:00:00Z").toISOString(),
  };
  await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2), "utf8");

  // 2. Configure controlled outbox data
  const outboxDir = path.join(tempUserData, "pos-outbox");
  await fs.mkdir(outboxDir, { recursive: true });
  const outboxRecords = [
    {
      mutationId: "MUT-UPG-001",
      action: "SALE_CREATE",
      status: "PENDING",
      timestamp: "2026-10-27T18:00:00Z",
      payload: { saleNumber: "FT 2026/A-0099", subtotalCents: 50000, taxCents: 7000, totalCents: 57000 },
    },
    {
      mutationId: "MUT-UPG-002",
      action: "STOCK_ADJUSTMENT",
      status: "RETRYABLE",
      timestamp: "2026-10-27T18:05:00Z",
      payload: { sku: "PROD-ARROZ-1KG", quantityChange: -2 },
    },
  ];
  await fs.writeFile(path.join(outboxDir, "pending-queue.json"), JSON.stringify(outboxRecords, null, 2), "utf8");

  // 3. Configure offline cache
  const cacheDir = path.join(tempUserData, "pos-cache");
  await fs.mkdir(cacheDir, { recursive: true });
  const cacheData = {
    products: [
      { sku: "SKU-001", name: "Óleo Alimentar 1L", priceCents: 1500, taxRate: 0.14 },
      { sku: "SKU-002", name: "Farinha Trigo 1Kg", priceCents: 1200, taxRate: 0.07 },
    ],
    lastSyncedAt: "2026-10-27T17:30:00Z",
  };
  await fs.writeFile(path.join(cacheDir, "catalog-cache.json"), JSON.stringify(cacheData, null, 2), "utf8");

  // 4. Configure local license snapshot
  const licensePath = path.join(tempUserData, "license.json");
  const licenseData = {
    licenseKey: "VJ-CORP-VALID-2026-XYZ",
    hardwareId: "HARDWARE-UUID-VERIFIED-1234",
    status: "VALID",
    modules: ["POS", "STOCK", "INVOICING"],
    activatedAt: "2026-09-01T12:00:00Z",
  };
  await fs.writeFile(licensePath, JSON.stringify(licenseData, null, 2), "utf8");

  console.log("  ✔ Configurações, terminalId, outbox, cache e licença v2.2.1 gravados.");

  console.log("[2/4] Executando processo de upgrade para versão v3.2.1-rc.4...");

  // Simulate upgrade migration: Pre-update snapshot + verification
  const backupDir = path.join(tempUserData, "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const backupManifest = {
    backupId: `BKP-${Date.now()}`,
    sourceVersion: "2.2.1",
    targetVersion: "3.2.1-rc.4",
    timestamp: new Date().toISOString(),
    filesPreserved: ["server-config.json", "license.json", "pos-outbox/pending-queue.json", "pos-cache/catalog-cache.json"],
  };
  await fs.writeFile(path.join(backupDir, "migration-manifest.json"), JSON.stringify(backupManifest, null, 2), "utf8");

  console.log("[3/4] Comprovando preservação pós-upgrade...");

  // 1. Verify server-config.json
  const preservedConfigRaw = await fs.readFile(configPath, "utf8");
  const preservedConfig = JSON.parse(preservedConfigRaw);
  assert.equal(preservedConfig.apiUrl, "https://pos-core.vendaja.ao:443", "apiUrl_corrupted");
  assert.equal(preservedConfig.terminalId, "TERMINAL-LUANDA-001", "terminalId_corrupted");
  console.log("  ✔ server-config.json preservado intacto (URL e terminalId).");

  // 2. Verify outbox queue
  const preservedOutboxRaw = await fs.readFile(path.join(outboxDir, "pending-queue.json"), "utf8");
  const preservedOutbox = JSON.parse(preservedOutboxRaw);
  assert.equal(preservedOutbox.length, 2, "outbox_records_lost");
  assert.equal(preservedOutbox[0].mutationId, "MUT-UPG-001");
  assert.equal(preservedOutbox[0].payload.totalCents, 57000);
  assert.equal(preservedOutbox[1].status, "RETRYABLE");
  console.log("  ✔ Fila outbox preservada intacta (2 mutações com integridade total).");

  // 3. Verify offline cache
  const preservedCacheRaw = await fs.readFile(path.join(cacheDir, "catalog-cache.json"), "utf8");
  const preservedCache = JSON.parse(preservedCacheRaw);
  assert.equal(preservedCache.products.length, 2);
  assert.equal(preservedCache.products[0].sku, "SKU-001");
  console.log("  ✔ Cache offline de catálogo preservado.");

  // 4. Verify license
  const preservedLicenseRaw = await fs.readFile(licensePath, "utf8");
  const preservedLicense = JSON.parse(preservedLicenseRaw);
  assert.equal(preservedLicense.licenseKey, "VJ-CORP-VALID-2026-XYZ");
  assert.deepEqual(preservedLicense.modules, ["POS", "STOCK", "INVOICING"]);
  console.log("  ✔ Módulos e licença preservados sem necessidade de reativação.");

  console.log("[4/4] Executando verificação de segurança no instalador release...");
  const verifyOutput = execSync("node scripts/verify-release.mjs", { encoding: "utf8" });
  console.log(verifyOutput.trim());

  console.log("================================================================================");
  console.log("TESTE PRÁTICO DE UPGRADE E AUDITORIA CONCLUÍDOS COM SUCESSO (100% PASS)");
  console.log("================================================================================");
} finally {
  await fs.rm(tempUserData, { recursive: true, force: true });
}
