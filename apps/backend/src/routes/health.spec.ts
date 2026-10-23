import assert from "node:assert/strict";
import test from "node:test";
import {
  EnterpriseLogger,
  EnterpriseAuthService,
  EnterpriseLicensingService,
  EnterpriseNotificationService,
} from "../services/enterprise/index.js";

test("EnterpriseLogger: logs events and filters by severity", () => {
  const correlationId = "test-corr-123";
  EnterpriseLogger.info("HealthCheck", "CHECK", "System test healthy", { correlationId });
  EnterpriseLogger.warn("Security", "AUTH_FAIL", "Failed attempt detected", { correlationId });
  EnterpriseLogger.error("Storage", "DISK_CHECK", "Simulated disk check", new Error("Disk full"), { correlationId });

  const allLogs = EnterpriseLogger.getLogs({ limit: 10 });
  assert.ok(allLogs.length >= 3);

  const errorLogs = EnterpriseLogger.getLogs({ severity: "ERROR" });
  assert.ok(errorLogs.some((l) => l.module === "Storage" && l.message.includes("Simulated disk check")));

  const moduleLogs = EnterpriseLogger.getLogs({ module: "HealthCheck" });
  assert.ok(moduleLogs.some((l) => l.correlationId === correlationId));
});

test("EnterpriseAuthService: password hashing and brute force tracking", () => {
  const hash1 = EnterpriseAuthService.hashCredential("AdminPass123!");
  const hash2 = EnterpriseAuthService.hashCredential("AdminPass123!");
  const hash3 = EnterpriseAuthService.hashCredential("DifferentPass!");

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 64); // SHA-256 hex length

  const testKey = `test-ip-${Date.now()}`;
  assert.equal(EnterpriseAuthService.isLocked(testKey).locked, false);

  // 4 failed attempts should not lock
  for (let i = 0; i < 4; i++) {
    EnterpriseAuthService.recordFailedAttempt(testKey);
    assert.equal(EnterpriseAuthService.isLocked(testKey).locked, false);
  }

  // 5th attempt locks the key
  EnterpriseAuthService.recordFailedAttempt(testKey);
  assert.equal(EnterpriseAuthService.isLocked(testKey).locked, true);

  // Reset clears lockout
  EnterpriseAuthService.resetFailedAttempts(testKey);
  assert.equal(EnterpriseAuthService.isLocked(testKey).locked, false);
});

test("EnterpriseLicensingService: module access validation", () => {
  const validModules = ["POS", "STOCK", "ACCOUNTING", "HR", "DASHBOARD", "SETTINGS"];
  for (const mod of validModules) {
    assert.equal(EnterpriseLicensingService.isModuleAllowed(mod, validModules), true);
  }

  assert.equal(EnterpriseLicensingService.isModuleAllowed("UNKNOWN_MODULE", validModules), false);
  assert.equal(EnterpriseLicensingService.isModuleAllowed("CRM", validModules), false);
});

test("EnterpriseNotificationService: creates and manages notifications", () => {
  const tenantCompany = `comp-${Date.now()}`;
  const notif = EnterpriseNotificationService.create({
    companyId: tenantCompany,
    title: "Backup diário concluído",
    message: "O backup automático das 02:00 foi concluído com sucesso.",
    type: "SUCCESS",
  });

  assert.ok(notif.id);
  assert.equal(notif.read, false);
  assert.equal(notif.companyId, tenantCompany);

  const list = EnterpriseNotificationService.list({ companyId: tenantCompany });
  assert.ok(list.length >= 1);
  assert.equal(list[0]?.id, notif.id);

  const marked = EnterpriseNotificationService.markAsRead(notif.id);
  assert.equal(marked, true);

  const listAfterRead = EnterpriseNotificationService.list({ companyId: tenantCompany, unreadOnly: true });
  assert.equal(listAfterRead.some((n) => n.id === notif.id), false);
});

test("Enterprise Health Check Probes: database, automation, integrations, license, storage", async () => {
  const {
    checkDatabase,
    checkAutomation,
    checkIntegrations,
    checkLicense,
    checkStorage,
    checkSync,
  } = await import("./health.js");

  // 1. Database probe (returns status ok or fallback down with latency)
  const dbHealth = await checkDatabase();
  assert.ok(dbHealth);
  assert.ok(["ok", "down"].includes(dbHealth.status));
  assert.ok(dbHealth.latencyMs >= 0);
  assert.ok(dbHealth.engine);

  // 2. Automation probe (evaluates workflow definitions, queue, tasks, rules)
  const autoHealth = await checkAutomation();
  assert.ok(autoHealth);
  assert.ok(["ok", "degraded"].includes(autoHealth.status));
  assert.ok(autoHealth.latencyMs >= 0);
  assert.ok(autoHealth.workflowsActive >= 0);
  assert.ok(autoHealth.pendingTasks >= 0);
  assert.ok(autoHealth.rulesLoaded >= 0);
  assert.ok(["idle", "processing", "offline"].includes(autoHealth.queueStatus));

  // 3. Integrations probe (webhooks, API keys, connectors)
  const intHealth = await checkIntegrations();
  assert.ok(intHealth);
  assert.ok(["ok", "degraded"].includes(intHealth.status));
  assert.ok(intHealth.latencyMs >= 0);
  assert.ok(intHealth.webhooksCount >= 0);
  assert.equal(intHealth.connectors.agtFiscalAuthority, "ready");
  assert.equal(intHealth.connectors.multicaixaExpress, "ready");
  assert.equal(intHealth.connectors.primaveraSapBridge, "ready");

  // 4. Storage probe (filesystem I/O)
  const storageHealth = await checkStorage();
  assert.ok(storageHealth);
  assert.equal(storageHealth.status, "ok");
  assert.equal(storageHealth.writable, true);

  // 5. License probe
  const licenseHealth = await checkLicense();
  assert.ok(licenseHealth);
  assert.ok(["ok", "down"].includes(licenseHealth.status));

  // 6. Sync probe (offline-first sync queue & protocols)
  const syncHealth = await checkSync();
  assert.ok(syncHealth);
  assert.equal(syncHealth.status, "ok");
  assert.ok(syncHealth.protocols.includes("HTTP_IDEMPOTENT_BATCH"));
});
