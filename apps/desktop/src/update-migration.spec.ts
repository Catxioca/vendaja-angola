import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  EnterpriseUpdateMigrationEngine,
  type OperationalDatabaseAdapter,
  type UpdateManifest,
  KNOWN_DEMO_SKUS,
} from "./update-migration-engine.js";
import { type LicenseStatus } from "./license.js";
import { defaultLicensedModules } from "./modules.js";

describe("Enterprise Update, Migration & Data Integrity Suite", () => {
  let tempUserDataDir: string;
  let updateEngine: EnterpriseUpdateMigrationEngine;

  before(async () => {
    tempUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "vendaja-update-test-"));
    updateEngine = new EnterpriseUpdateMigrationEngine(tempUserDataDir, "2.2.2");
  });

  after(async () => {
    try {
      await fs.rm(tempUserDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Mock database adapter simulating operational data
  const createMockDb = (initialSales: number, products: Array<{ sku?: string; name: string }> = []): OperationalDatabaseAdapter => {
    let salesCount = initialSales;
    const migrationsApplied: string[] = [];

    return {
      getSalesCount: async () => salesCount,
      getAllProducts: async () => products,
      getSchemaVersion: async () => "20261020_001",
      applyMigration: async (migrationName: string) => {
        migrationsApplied.push(migrationName);
        return { applied: true, details: `Applied ${migrationName} successfully` };
      },
      getOperationalTables: async () => ["Company", "Branch", "User", "Product", "Sale", "SaleLine", "Invoice"],
    };
  };

  const sampleManifest: UpdateManifest = {
    version: "2.2.4",
    releaseDate: "2026-10-21",
    minimumPreviousVersion: "2.0.0",
    channel: "stable",
    targetSchemaVersion: "20261021_002",
    checksumSha256: "abcdef1234567890",
    mandatoryMigrations: [
      "20261021_001_add_invoice_contingency_fields",
      "20261021_002_add_pos_terminal_sync_indexes",
    ],
    releaseNotes: "Atualização Enterprise v2.2.4 com integridade fiscal e licenciamento modular.",
  };

  it("ensures defaultLicensedModules strictly defaults to SETTINGS and never all 16 modules", () => {
    assert.deepEqual(defaultLicensedModules, ["SETTINGS"]);
  });

  // =========================================================================
  // SCENARIO 1: POS + Stocks licensed in V1 -> Update to V2 -> POS + Stocks remain active
  // =========================================================================
  it("Scenario 1: Version 1 with POS + Stocks preserves POS + Stocks active after update", async () => {
    const v1License: LicenseStatus = {
      valid: true,
      hardwareId: "HWID-TEST-001",
      plan: "CUSTOM",
      modules: ["POS", "STOCK"],
      daysRemaining: 180,
      expiryTier: "valid",
      company: "Comercial Kinaxixi Lda",
      nif: "5401234567",
      expiresAt: new Date(Date.now() + 180 * 86400000).toISOString(),
    };

    // Save initial license in test folder
    await fs.writeFile(
      path.join(tempUserDataDir, "license-state.json"),
      JSON.stringify({ token: "canonical.sig", lastExecutedAt: new Date().toISOString() }),
      "utf8"
    );

    const mockDb = createMockDb(150, [
      { sku: "REAL-PRD-01", name: "Produto Real do Cliente A" },
      { sku: "REAL-PRD-02", name: "Produto Real do Cliente B" },
    ]);

    const report = await updateEngine.executeUpdate({
      targetVersion: "2.2.4",
      manifest: sampleManifest,
      dbAdapter: mockDb,
      currentLicenseStatus: v1License,
      isDemoEnv: false,
    });

    assert.equal(report.success, true);
    assert.equal(report.fromVersion, "2.2.2");
    assert.equal(report.toVersion, "2.2.4");
    assert.equal(report.licensePreserved, true);

    // Modules must include POS, STOCK, and SETTINGS (diagnostics)
    assert.ok(report.licensedModules.includes("POS"), "POS must be active");
    assert.ok(report.licensedModules.includes("STOCK"), "STOCK must be active");
    assert.ok(report.licensedModules.includes("SETTINGS"), "SETTINGS must be active");
    assert.equal(report.licensedModules.length, 3, "Only POS, STOCK and SETTINGS should be licensed");
  });

  // =========================================================================
  // SCENARIO 2: HR, CRM, BI locked in V1 -> Update to V2 -> HR, CRM, BI remain strictly locked
  // =========================================================================
  it("Scenario 2: Version 1 with HR/CRM/BI locked keeps HR/CRM/BI locked after update", async () => {
    const v1License: LicenseStatus = {
      valid: true,
      hardwareId: "HWID-TEST-002",
      plan: "CUSTOM",
      modules: ["POS", "STOCK"],
      daysRemaining: 120,
      expiryTier: "valid",
      company: "Mercearia Alvalade",
      nif: "5409876543",
    };

    const mockDb = createMockDb(320);

    const report = await updateEngine.executeUpdate({
      targetVersion: "2.2.4",
      manifest: sampleManifest,
      dbAdapter: mockDb,
      currentLicenseStatus: v1License,
      isDemoEnv: false,
    });

    assert.equal(report.success, true);
    assert.equal(report.blockedModulesPreserved, true);

    // Verify blocked modules
    assert.ok(report.blockedModules.includes("HR"), "HR must remain locked");
    assert.ok(report.blockedModules.includes("CRM"), "CRM must remain locked");
    assert.ok(report.blockedModules.includes("BI"), "BI must remain locked");
    assert.ok(report.blockedModules.includes("TREASURY"), "TREASURY must remain locked");
    assert.ok(report.blockedModules.includes("ACCOUNTING"), "ACCOUNTING must remain locked");

    // They must NOT be in the licensed list
    assert.equal(report.licensedModules.includes("HR"), false);
    assert.equal(report.licensedModules.includes("CRM"), false);
    assert.equal(report.licensedModules.includes("BI"), false);
  });

  // =========================================================================
  // SCENARIO 3: Real sales in DB -> Execute system update -> Zero sales lost
  // =========================================================================
  it("Scenario 3: Database with real sales preserves 100% of sales with zero data loss", async () => {
    const initialSalesCount = 5_420; // 5,420 real client sales
    const mockDb = createMockDb(initialSalesCount, [
      { sku: "PRD-REAL-101", name: "Cimento Secil 50Kg" },
      { sku: "PRD-REAL-102", name: "Varão de Aço 12mm" },
    ]);

    const activeLicense: LicenseStatus = {
      valid: true,
      hardwareId: "HWID-TEST-003",
      plan: "ENTERPRISE",
      modules: ["POS", "STOCK", "TREASURY", "ACCOUNTING"],
      daysRemaining: 365,
      expiryTier: "valid",
    };

    const report = await updateEngine.executeUpdate({
      targetVersion: "2.2.4",
      manifest: sampleManifest,
      dbAdapter: mockDb,
      currentLicenseStatus: activeLicense,
      isDemoEnv: false,
    });

    assert.equal(report.success, true);
    assert.equal(report.backupCreated, true);
    assert.ok(report.backupId, "Backup ID must be generated");
    assert.equal(report.salesPreserved, true);
    assert.equal(report.salesCountBefore, initialSalesCount);
    assert.equal(report.salesCountAfter, initialSalesCount);
    assert.equal(report.salesCountAfter - report.salesCountBefore, 0, "Zero sales lost");
    assert.deepEqual(report.schemaMigrationsApplied, sampleManifest.mandatoryMigrations);
  });

  // =========================================================================
  // SCENARIO 4: Active license with future validity -> Reinstall ERP -> License maintained
  // =========================================================================
  it("Scenario 4: Valid license survives reinstallation without manual reactivation", async () => {
    const futureExpiry = new Date(Date.now() + 240 * 86400000).toISOString();
    const tokenPayload = {
      token: "eyJhbGciOiJSU0EtU0hBMjU2In0.reinstall-test-token",
      lastExecutedAt: new Date().toISOString(),
    };

    // Simulate persistent %APPDATA%/ao.commerce.desktop/license-state.json surviving reinstall
    const statePath = updateEngine.getLicenseStatePath();
    await fs.writeFile(statePath, JSON.stringify(tokenPayload), "utf8");

    // Reinstantiated engine simulating freshly launched v2 after reinstallation
    const reinstalledEngine = new EnterpriseUpdateMigrationEngine(tempUserDataDir, "2.2.4");

    const activeLicense: LicenseStatus = {
      valid: true,
      hardwareId: "HWID-SURVIVING-004",
      plan: "PROFESSIONAL",
      modules: ["POS", "STOCK", "TREASURY", "PURCHASES"],
      daysRemaining: 240,
      expiryTier: "valid",
      expiresAt: futureExpiry,
      company: "Armazéns do Golfe SA",
      nif: "5411223344",
    };

    const licenseState = await reinstalledEngine.preserveLicenseState(activeLicense);

    assert.equal(licenseState.preserved, true);
    assert.ok(licenseState.licensedModules.includes("POS"));
    assert.ok(licenseState.licensedModules.includes("STOCK"));
    assert.ok(licenseState.licensedModules.includes("TREASURY"));
    assert.ok(licenseState.licensedModules.includes("PURCHASES"));
    assert.ok(licenseState.licensedModules.includes("SETTINGS"));

    // Modules outside Professional remain strictly locked
    assert.ok(licenseState.blockedModules.includes("HR"));
    assert.ok(licenseState.blockedModules.includes("CRM"));
    assert.ok(licenseState.blockedModules.includes("BI"));
  });

  // =========================================================================
  // ZERO DEMO DATA VERIFICATION
  // =========================================================================
  it("detects and flags mock/demo products if accidentally present in production", async () => {
    const cleanCatalog = [
      { sku: "CLEAN-01", name: "Óleo de Palma 1L" },
      { sku: "CLEAN-02", name: "Fuba de Milho Nacional 5Kg" },
    ];
    const cleanCheck = await updateEngine.verifyZeroDemoData(cleanCatalog);
    assert.equal(cleanCheck.clean, true);
    assert.equal(cleanCheck.violatingSkus.length, 0);

    const contaminatedCatalog = [
      { sku: "CLEAN-01", name: "Óleo de Palma 1L" },
      { sku: "CAF-001", name: "Café Angola (Mock Seed)" },
      { sku: "AGU-001", name: "Água Mineral (Mock Seed)" },
    ];
    const contaminatedCheck = await updateEngine.verifyZeroDemoData(contaminatedCatalog);
    assert.equal(contaminatedCheck.clean, false);
    assert.deepEqual(contaminatedCheck.violatingSkus, ["CAF-001", "AGU-001"]);
  });

  // =========================================================================
  // MULTI-PC TERMINAL SYNCHRONIZATION
  // =========================================================================
  it("detects multi-terminal version synchronization status correctly", () => {
    // 1. In sync
    const inSync = updateEngine.checkTerminalServerSync("2.2.4", "2.2.4");
    assert.equal(inSync.status, "IN_SYNC");

    // 2. Terminal update required
    const termLag = updateEngine.checkTerminalServerSync("2.2.2", "2.2.4");
    assert.equal(termLag.status, "TERMINAL_UPDATE_REQUIRED");

    // 3. Server update required
    const srvLag = updateEngine.checkTerminalServerSync("2.2.4", "2.2.2");
    assert.equal(srvLag.status, "SERVER_UPDATE_REQUIRED");

    // 4. Incompatible major version
    const majorMismatch = updateEngine.checkTerminalServerSync("1.9.0", "2.2.4");
    assert.equal(majorMismatch.status, "INCOMPATIBLE_MAJOR_VERSION");
  });

  // =========================================================================
  // AUTOMATIC ROLLBACK TEST
  // =========================================================================
  it("executes automated rollback if migration fails during update", async () => {
    const failingDb: OperationalDatabaseAdapter = {
      getSalesCount: async () => 100,
      getAllProducts: async () => [],
      getSchemaVersion: async () => "20261020_001",
      applyMigration: async () => {
        throw new Error("Lock timeout: table Invoices locked by concurrent transaction");
      },
      getOperationalTables: async () => ["Sale"],
    };

    const report = await updateEngine.executeUpdate({
      targetVersion: "2.2.5-failed",
      manifest: sampleManifest,
      dbAdapter: failingDb,
      currentLicenseStatus: null,
      isDemoEnv: false,
    });

    assert.equal(report.success, false);
    assert.equal(report.backupCreated, true);
    assert.equal(report.rollbackExecuted, true);
    assert.ok(report.details.some((d) => d.includes("Lock timeout")));
  });
});
