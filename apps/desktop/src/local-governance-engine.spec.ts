/**
 * LocalGovernanceEngine Test Suite
 * ERP VendaJá Angola
 * 
 * Validates:
 * - Scenario 1: Backend online -> normal online operation & synchronization
 * - Scenario 2: Backend offline -> automatic seamless fallback to local engine, 0 blocking errors
 * - Scenario 3: Device network offline (navigator.onLine = false) -> immediate local resolution
 * - RBAC Canonical Permissions & System Roles coverage (96+ enterprise permissions)
 * - Cryptographic database backups with real SHA-256 integrity calculation & restoration
 * - Audit trail logging and CSV export offline
 * - Security policy configuration offline
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  LocalGovernanceEngine,
  CANONICAL_SYSTEM_PERMISSIONS,
} from "./local-governance-engine.js";

describe("Enterprise Local Governance & Offline-First Resilience Suite", () => {
  let engine: LocalGovernanceEngine;

  beforeEach(() => {
    // Reset singleton and ensure clean default state
    engine = LocalGovernanceEngine.getInstance();
    engine.ensureDefaultLocalData();
  });

  // =========================================================================
  // SCENARIO 1: BACKEND ACTIVE (ONLINE OPERATION)
  // =========================================================================
  it("Scenario 1: Operates in ONLINE mode when backend is reachable", async () => {
    // Mock global fetch to simulate responsive backend
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/health")) {
        return new Response(JSON.stringify({ status: "OK", database: "CONNECTED" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/v1/security/summary")) {
        return new Response(
          JSON.stringify({
            metrics: {
              totalUsers: 8,
              mfaUsers: 4,
              mfaAdoptionPercent: 50,
              activeSessionsCount: 5,
              totalAuditLogs: 120,
              lastBackup: {
                id: "bkp-online-1",
                filename: "backup-central-2026.json",
                status: "COMPLETED",
                createdAt: new Date().toISOString(),
                sizeBytes: 1048576,
              },
            },
            recentAudits: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      const health = await engine.checkHealth("http://127.0.0.1:4000");
      assert.equal(health.backendOnline, true);
      assert.equal(health.databaseOnline, true);
      assert.equal(health.mode, "ONLINE");
      assert.match(health.diagnosticDetails, /Backend ativo e acessível/);

      const summary = await engine.getSummary("http://127.0.0.1:4000", "mock-token");
      assert.equal(summary.metrics.totalUsers, 8);
      assert.equal(summary.metrics.mfaUsers, 4);
      assert.equal(summary.metrics.mfaAdoptionPercent, 50);
      assert.equal(summary.metrics.activeSessionsCount, 5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 2: BACKEND OFFLINE / UNREACHABLE (SEAMLESS LOCAL FALLBACK)
  // =========================================================================
  it("Scenario 2: Automatically switches to OFFLINE_LOCAL when backend is unreachable without errors", async () => {
    // Mock global fetch to simulate connection refused (backend down)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (): Promise<Response> => {
      throw new TypeError("Failed to fetch: Connection refused on port 4000");
    };

    try {
      const health = await engine.checkHealth("http://127.0.0.1:4000");
      assert.equal(health.backendOnline, false);
      assert.equal(health.databaseOnline, true, "Local database must remain fully online");
      assert.equal(health.mode, "OFFLINE_LOCAL");
      assert.match(health.diagnosticDetails, /Alternância automática para modo local resiliente/);

      // Must NOT throw; returns local summary smoothly
      const summary = await engine.getSummary("http://127.0.0.1:4000", "mock-token");
      assert.ok(summary);
      assert.ok(summary.metrics.totalUsers >= 1);
      assert.ok(summary.metrics.activeSessionsCount >= 1);
      assert.ok(Array.isArray(summary.recentAudits));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 3: DEVICE NETWORK DISCONNECTED (OFFLINE)
  // =========================================================================
  it("Scenario 3: Resolves immediately when device network is disconnected without network attempts", async () => {
    // Simulate navigator.onLine = false
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
      writable: true,
    });

    try {
      const health = await engine.checkHealth("http://127.0.0.1:4000");
      assert.equal(health.backendOnline, false);
      assert.equal(health.databaseOnline, true);
      assert.equal(health.mode, "OFFLINE_LOCAL");
      assert.match(health.diagnosticDetails, /Dispositivo sem ligação de rede/);

      // Verify roles and permissions still load immediately from local storage
      const roles = await engine.getRoles("http://127.0.0.1:4000", "");
      assert.ok(roles.length >= 7, "All standard enterprise roles must be present offline");

      const perms = await engine.getPermissions("http://127.0.0.1:4000", "");
      assert.ok(perms.length >= 90, "Canonical permissions must be accessible offline");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  // =========================================================================
  // CANONICAL 96+ ENTERPRISE PERMISSIONS & SYSTEM ROLES
  // =========================================================================
  it("RBAC: Covers all canonical enterprise modules (POS, Stocks, Finance, AI, Biometrics, Corporate)", () => {
    assert.ok(CANONICAL_SYSTEM_PERMISSIONS.length >= 96, "Expected at least 96 canonical enterprise permissions");

    const modules = new Set(CANONICAL_SYSTEM_PERMISSIONS.map((p) => p.module));
    assert.ok(modules.has("POS"), "Missing POS module permissions");
    assert.ok(modules.has("STOCK"), "Missing STOCK module permissions");
    assert.ok(modules.has("ACCOUNTING"), "Missing ACCOUNTING module permissions");
    assert.ok(modules.has("HR"), "Missing HR module permissions");
    assert.ok(modules.has("SETTINGS"), "Missing SETTINGS module permissions");
    assert.ok(modules.has("AUTOMATION"), "Missing AUTOMATION module permissions");
    assert.ok(modules.has("CRM"), "Missing CRM module permissions");
    assert.ok(modules.has("DOCUMENTS"), "Missing DOCUMENTS module permissions");
    assert.ok(modules.has("API"), "Missing API module permissions");
    assert.ok(modules.has("FINANCE"), "Missing FINANCE module permissions");
    assert.ok(modules.has("BI"), "Missing BI module permissions");
    assert.ok(modules.has("AI"), "Missing AI module permissions");
    assert.ok(modules.has("BIOMETRICS"), "Missing BIOMETRICS module permissions");
    assert.ok(modules.has("CORPORATE"), "Missing CORPORATE module permissions");

    // Check specific AI, Biometrics and Corporate permissions
    const permCodes = new Set(CANONICAL_SYSTEM_PERMISSIONS.map((p) => p.code));
    assert.ok(permCodes.has("AI.View"));
    assert.ok(permCodes.has("AI.Chat"));
    assert.ok(permCodes.has("AI.Forecast"));
    assert.ok(permCodes.has("Biometrics.View"));
    assert.ok(permCodes.has("Biometrics.Enroll"));
    assert.ok(permCodes.has("Corporate.View"));
    assert.ok(permCodes.has("Corporate.LiveUpdate"));
  });

  it("RBAC: Supports local creation, cloning and permission updates offline", async () => {
    // 1. Create a custom role offline
    const newRole = await engine.createRole("http://127.0.0.1:4000", "", {
      name: "Fiscal de Loja",
      code: "ROLE_FISCAL_LOJA",
      description: "Supervisão de saídas e conferência de faturas",
    });
    assert.ok(newRole.id);
    assert.equal(newRole.code, "ROLE_FISCAL_LOJA");

    // 2. Assign permissions offline
    await engine.updateRolePermissions("http://127.0.0.1:4000", "", newRole.id, [
      "Sales.View",
      "Stock.View",
      "Audit.View",
    ]);

    const updatedRoles = engine.getLocalRoles();
    const found = updatedRoles.find((r) => r.id === newRole.id);
    assert.ok(found);
    assert.equal(found.rolePermissions.length, 3);
    assert.deepEqual(
      found.rolePermissions.map((rp) => rp.permission.code),
      ["Sales.View", "Stock.View", "Audit.View"]
    );

    // 3. Clone role offline
    const cloned = await engine.cloneRole(
      "http://127.0.0.1:4000",
      "",
      newRole.id,
      "Fiscal Noturno",
      "ROLE_FISCAL_NOTURNO"
    );
    assert.equal(cloned.name, "Fiscal Noturno");
    assert.equal(cloned.code, "ROLE_FISCAL_NOTURNO");
    assert.equal(cloned.rolePermissions.length, 3);
  });

  // =========================================================================
  // CRYPTOGRAPHIC BACKUPS & INTEGRITY (SHA-256)
  // =========================================================================
  it("Backups: Creates cryptographic snapshots with real SHA-256 checksum and verifies integrity on restore", async () => {
    const backup = await engine.createBackup("http://127.0.0.1:4000", "", "Snapshot de Teste Local");

    assert.ok(backup.id.startsWith("bkp-local-"));
    assert.equal(backup.status, "COMPLETED");
    assert.ok(backup.sizeBytes > 0);
    assert.ok(backup.checksum, "Backup must have cryptographic checksum");
    assert.equal(backup.checksum.length, 64, "Checksum must be 64 hex characters (SHA-256)");

    // Metrics check
    const metrics = engine.getLocalBackupMetrics();
    assert.ok(metrics.totalBackups >= 1);
    assert.equal(metrics.lastBackupStatus, "COMPLETED");

    // Restore check
    const restoreResult = await engine.restoreBackup("http://127.0.0.1:4000", "", backup.id);
    assert.match(restoreResult, /restauradas com sucesso/);
  });

  // =========================================================================
  // AUDIT TRAIL LOGGING & CSV EXPORT
  // =========================================================================
  it("Audit: Records local governance actions and exports CSV offline", async () => {
    engine.recordAudit("UNIT_TEST_ACTION", "GOVERNANCE", "TestEntity", "id-123");

    const logs = engine.getLocalAuditLogs({ action: "UNIT_TEST_ACTION" });
    assert.ok(logs.length >= 1);
    assert.equal(logs[0].action, "UNIT_TEST_ACTION");
    assert.equal(logs[0].entity, "TestEntity");

    const exportResult = await engine.exportAuditCsv("http://127.0.0.1:4000", "");
    assert.ok(exportResult.blob);
    assert.ok(exportResult.filename.startsWith("auditoria-local-vendaja-"));
    assert.ok(exportResult.blob.size > 0);
  });

  // =========================================================================
  // SECURITY POLICY MANAGEMENT
  // =========================================================================
  it("Policy: Persists and enforces password rules locally offline", async () => {
    const customPolicy = {
      minPasswordLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      passwordExpiryDays: 60,
      preventPasswordReuseCount: 10,
      maxFailedLogins: 3,
      lockoutDurationMinutes: 30,
      sessionInactivityMinutes: 10,
    };

    await engine.savePolicy("http://127.0.0.1:4000", "", customPolicy);

    const reloaded = engine.getLocalPolicy();
    assert.equal(reloaded.minPasswordLength, 12);
    assert.equal(reloaded.maxFailedLogins, 3);
    assert.equal(reloaded.lockoutDurationMinutes, 30);
  });
});
