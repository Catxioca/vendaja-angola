import test from "node:test";
import assert from "node:assert/strict";
import {
  EnterpriseCorporateHeadquartersService,
  EnterpriseRbacService,
  SYSTEM_PERMISSIONS,
} from "./enterprise/index.js";

test("Corporate Headquarters: SYSTEM_PERMISSIONS contains canonical Corporate permission suite (96 total)", () => {
  assert.equal(SYSTEM_PERMISSIONS.length, 96, "Total de permissões do sistema deve ser exatamente 96");

  const corpPerms = SYSTEM_PERMISSIONS.filter((p) => p.module === "CORPORATE");
  assert.equal(corpPerms.length, 7, "Módulo CORPORATE deve possuir exatamente 7 permissões canónicas");

  const codes = corpPerms.map((p) => p.code);
  assert.ok(codes.includes("Corporate.View"), "Deve conter Corporate.View");
  assert.ok(codes.includes("Corporate.Manage"), "Deve conter Corporate.Manage");
  assert.ok(codes.includes("Corporate.Users"), "Deve conter Corporate.Users");
  assert.ok(codes.includes("Corporate.Modules"), "Deve conter Corporate.Modules");
  assert.ok(codes.includes("Corporate.Licenses"), "Deve conter Corporate.Licenses");
  assert.ok(codes.includes("Corporate.LiveUpdate"), "Deve conter Corporate.LiveUpdate");
  assert.ok(codes.includes("Corporate.Broadcast"), "Deve conter Corporate.Broadcast");
});

test("Corporate Headquarters: Register Store Hierarchy (Loja Mãe & Filiais)", async () => {
  const companyId = `comp-corp-${Date.now()}`;

  // 1. Register Headquarters (Loja Mãe)
  const hq = await EnterpriseCorporateHeadquartersService.registerOrUpdateStore(
    companyId,
    {
      code: "SEDE-01",
      name: "Sede Central Kinaxixi (Loja Mãe)",
      isHeadquarters: true,
      active: true,
    },
    "Administrador do Grupo"
  );
  assert.equal(hq.code, "SEDE-01");
  assert.equal(hq.isHeadquarters, true);

  // 2. Register Branch (Filial 1)
  const branch1 = await EnterpriseCorporateHeadquartersService.registerOrUpdateStore(
    companyId,
    {
      code: "FILIAL-TALATONA",
      name: "Filial Talatona Shopping",
      isHeadquarters: false,
      active: true,
    },
    "Administrador do Grupo"
  );
  assert.equal(branch1.code, "FILIAL-TALATONA");
  assert.equal(branch1.isHeadquarters, false);
});

test("Corporate Headquarters: Telemetry Heartbeat and Consolidated Cockpit Aggregation", async () => {
  const companyId = `comp-corp-cockpit-${Date.now()}`;

  // Register stores
  const hq = await EnterpriseCorporateHeadquartersService.registerOrUpdateStore(companyId, {
    code: "HQ-01",
    name: "Loja Mãe",
    isHeadquarters: true,
  });
  const b1 = await EnterpriseCorporateHeadquartersService.registerOrUpdateStore(companyId, {
    code: "BR-01",
    name: "Filial Viana",
    isHeadquarters: false,
  });

  // Send telemetry
  await EnterpriseCorporateHeadquartersService.heartbeatStoreStatus(companyId, {
    branchId: hq.id,
    branchCode: "HQ-01",
    branchName: "Loja Mãe",
    isHeadquarters: true,
    todaySalesCents: 5000000, // 50.000 Kz
    todayDocumentsCount: 20,
    cashDrawerCents: 1500000,
    activeUsersCount: 3,
    activeModules: ["POS", "STOCK", "CORPORATE"],
  });

  await EnterpriseCorporateHeadquartersService.heartbeatStoreStatus(companyId, {
    branchId: b1.id,
    branchCode: "BR-01",
    branchName: "Filial Viana",
    isHeadquarters: false,
    todaySalesCents: 3000000, // 30.000 Kz
    todayDocumentsCount: 12,
    cashDrawerCents: 800000,
    activeUsersCount: 2,
    activeModules: ["POS", "STOCK"],
  });

  // Evaluate Cockpit
  const cockpit = await EnterpriseCorporateHeadquartersService.getHeadquartersCockpit(companyId);
  assert.ok(cockpit);
  assert.equal(cockpit.networkSummary.totalStores >= 2, true);
  assert.ok(cockpit.networkSummary.totalTodaySalesCents >= 8000000);
  assert.ok(cockpit.networkSummary.totalTodayDocuments >= 32);
  assert.ok(cockpit.networkSummary.totalCashInDrawersCents >= 2300000);
  assert.ok(cockpit.networkSummary.totalActiveUsers >= 5);
});

test("Corporate Headquarters: Centralized User Creation and Instant Remote Suspension", async () => {
  const companyId = `comp-corp-users-${Date.now()}`;
  const hq = await EnterpriseCorporateHeadquartersService.registerOrUpdateStore(companyId, {
    code: "HQ-USER",
    name: "Sede Usuários",
    isHeadquarters: true,
  });

  // 1. Create User from Headquarters
  const newUser = await EnterpriseCorporateHeadquartersService.createCorporateUser(
    companyId,
    {
      email: `op-${Date.now()}@vendaja.ao`,
      username: `op_${Date.now()}`,
      displayName: "Operador de Caixa Viana",
      role: "CASHIER",
      branchId: hq.id,
      department: "Operações",
    },
    "Super Administrador"
  );
  assert.ok(newUser.id);
  assert.equal(newUser.role, "CASHIER");
  assert.equal(newUser.branchId, hq.id);

  // 2. Suspend User Remotely
  const suspResult = await EnterpriseCorporateHeadquartersService.suspendCorporateUser(
    companyId,
    newUser.id,
    "Irregularidade disciplinar detetada na auditoria central",
    "Super Administrador"
  );
  assert.equal(suspResult.suspended, true);
  assert.equal(suspResult.userId, newUser.id);

  // 3. Reassign store and role
  const reassign = await EnterpriseCorporateHeadquartersService.assignStoreAndRole(
    companyId,
    newUser.id,
    {
      role: "SUPERVISOR",
      branchId: hq.id,
      modules: ["POS", "STOCK", "AI"],
    },
    "Diretor Geral"
  );
  assert.equal(reassign.role, "SUPERVISOR");
});

test("Corporate Headquarters: Local Admin Authority Boundary Enforcement", () => {
  const localAdminBranchId = "branch-viana-10";
  const otherBranchId = "branch-talatona-20";

  // Super Admin can manage any branch
  assert.doesNotThrow(() => {
    EnterpriseCorporateHeadquartersService.validateLocalAdminAuthority("ROLE_SUPER_ADMIN", null, otherBranchId);
  });

  // Local Admin can manage their own branch
  assert.doesNotThrow(() => {
    EnterpriseCorporateHeadquartersService.validateLocalAdminAuthority(
      "ROLE_LOCAL_ADMIN",
      localAdminBranchId,
      localAdminBranchId
    );
  });

  // Local Admin is BLOCKED from managing another branch
  assert.throws(
    () => {
      EnterpriseCorporateHeadquartersService.validateLocalAdminAuthority(
        "ROLE_LOCAL_ADMIN",
        localAdminBranchId,
        otherBranchId
      );
    },
    /Acesso Recusado: O Administrador Local tem autoridade restrita/,
    "Deve impedir que o Administrador Local aceda a outra filial"
  );
});

test("LiveUpdateService: Publish Live Hot-Patch and Verify Cryptographic Signature", async () => {
  const companyId = `comp-live-update-${Date.now()}`;

  // 1. Publish dynamic patch without installer
  const patch = await EnterpriseCorporateHeadquartersService.publishLivePatch(
    companyId,
    {
      patchVersion: "2.2.4-patch.01",
      title: "Atualização de Regras Fiscais AGT 2026 e Módulo Biometria",
      description: "Distribuição dinâmica de novos drivers de torniquete e validação fiscal automática.",
      category: "FISCAL_LEGAL",
      targetModules: ["BIOMETRICS", "POS"],
      targetBranches: ["ALL"],
      payloadJson: JSON.stringify({
        taxRulesUpdate: { ivaStandard: 0.14, exemptThresholdAOA: 25000000 },
        biometricsDriver: { zktecoTcpPort: 4370, autoOpenPulseMs: 3000 },
      }),
      isCritical: true,
    },
    "Equipa de Engenharia Sede"
  );

  assert.ok(patch.id);
  assert.equal(patch.patchVersion, "2.2.4-patch.01");
  assert.equal(patch.status, "PUBLISHED");
  assert.equal(patch.sha256Signature.length, 64, "Assinatura criptográfica SHA-256 deve ter 64 caracteres");

  // 2. Filial checks pending patches
  const pending = await EnterpriseCorporateHeadquartersService.checkPendingPatches(
    companyId,
    "branch-filial-01",
    "2.2.3"
  );
  assert.ok(pending.length >= 1);
  const found = pending.find((p) => p.patchVersion === "2.2.4-patch.01");
  assert.ok(found);
  assert.equal(found?.title, "Atualização de Regras Fiscais AGT 2026 e Módulo Biometria");
  assert.equal(found?.isCritical, true);
});

test("Corporate Headquarters: Remote Module Control per Branch", async () => {
  const companyId = `comp-remote-modules-${Date.now()}`;
  const branchId = "branch-remote-01";

  // Activate BIOMETRICS on branch remotely
  const actResult = await EnterpriseCorporateHeadquartersService.setStoreModuleStatus(
    companyId,
    branchId,
    "BIOMETRICS",
    "ACTIVATE",
    "Sede Central"
  );
  assert.equal(actResult.moduleCode, "BIOMETRICS");
  assert.equal(actResult.status, "ACTIVATE");

  // Deactivate BIOMETRICS
  const deactResult = await EnterpriseCorporateHeadquartersService.setStoreModuleStatus(
    companyId,
    branchId,
    "BIOMETRICS",
    "DEACTIVATE",
    "Sede Central"
  );
  assert.equal(deactResult.status, "DEACTIVATE");
});

test("Corporate Headquarters: Internal Broadcast and Event Stream Audit Trail", async () => {
  const companyId = `comp-corp-broadcast-${Date.now()}`;

  // 1. Send corporate circular
  const broadcast = await EnterpriseCorporateHeadquartersService.sendBroadcast(
    companyId,
    {
      title: "Instrução de Fecho de Mês Fiscal - Outubro 2026",
      content: "Todas as filiais devem fechar as sessões de caixa impreterivelmente até às 21h00.",
      priority: "URGENT",
      senderUserId: "cfo-user-hq",
    },
    "Diretor Financeiro"
  );
  assert.ok(broadcast.id);
  assert.equal(broadcast.title, "Instrução de Fecho de Mês Fiscal - Outubro 2026");

  // 2. Verify Corporate Event Stream
  const events = await EnterpriseCorporateHeadquartersService.getEventStream(companyId, 10);
  assert.ok(Array.isArray(events));
  assert.ok(events.length >= 1);
  const broadcastEvent = events.find((e) => e.eventType === "BROADCAST_SENT");
  assert.ok(broadcastEvent, "O evento BROADCAST_SENT deve ser auditado no stream");
});

test("Corporate Headquarters: Remote User Permissions Update and Command Dispatch", async () => {
  const companyId = `comp-corp-perm-${Date.now()}`;
  const hq = await EnterpriseCorporateHeadquartersService.registerOrUpdateStore(companyId, {
    code: "HQ-PERM",
    name: "Sede Permissões",
    isHeadquarters: true,
  });

  // Create user
  const user = await EnterpriseCorporateHeadquartersService.createCorporateUser(
    companyId,
    {
      email: `op-${Date.now()}@vendaja.ao`,
      username: `op_perm_${Date.now()}`,
      displayName: "Operador de Caixa Talatona",
      role: "CASHIER",
      branchId: hq.id,
    },
    "Super Administrador"
  );

  // Update permissions remotely
  const updateRes = await EnterpriseCorporateHeadquartersService.updateCorporateUserPermissions(
    companyId,
    user.id,
    {
      role: "SUPERVISOR",
      permissions: ["Sales.Create", "Sales.Void", "Inventory.View"],
      modules: ["POS", "STOCK", "BIOMETRICS"],
      branchId: hq.id,
    },
    "Super Administrador"
  );

  assert.equal(updateRes.success, true);
  assert.equal(updateRes.role, "SUPERVISOR");
  assert.deepEqual(updateRes.modules, ["POS", "STOCK", "BIOMETRICS"]);

  // Verify command was queued for branch
  const pendingCommands = await EnterpriseCorporateHeadquartersService.getPendingBranchCommands(
    companyId,
    hq.id
  );
  const permCmd = pendingCommands.find(
    (c) => c.commandType === "UPDATE_PERMISSIONS" && c.payload.userId === user.id
  );
  assert.ok(permCmd, "Comando UPDATE_PERMISSIONS deve estar pendente na fila para a filial");
  assert.equal(permCmd.payload.role, "SUPERVISOR");
});

test("Corporate Headquarters: Remote License Revocation and Restoration", async () => {
  const companyId = `comp-corp-lic-${Date.now()}`;
  const branchId = `BRANCH-${Date.now()}`;
  const terminalId = `TERM-${Date.now()}`;

  // Initially active
  const initialStatus = await EnterpriseCorporateHeadquartersService.getStoreLicenseStatus(
    companyId,
    branchId,
    terminalId
  );
  assert.equal(initialStatus.status, "ACTIVE");

  // Revoke license remotely
  const revokeRes = await EnterpriseCorporateHeadquartersService.revokeStoreLicense(
    companyId,
    branchId,
    terminalId,
    "Inadimplência de mensalidade e auditoria fiscal irregular",
    "Diretor de Operações"
  );
  assert.equal(revokeRes.status, "REVOKED");
  assert.equal(revokeRes.terminalId, terminalId);

  // Check status
  const revokedStatus = await EnterpriseCorporateHeadquartersService.getStoreLicenseStatus(
    companyId,
    branchId,
    terminalId
  );
  assert.equal(revokedStatus.status, "REVOKED");
  assert.ok(revokedStatus.reason?.includes("Inadimplência"));

  // Restore license remotely
  const restoreRes = await EnterpriseCorporateHeadquartersService.restoreStoreLicense(
    companyId,
    branchId,
    terminalId,
    "Diretor de Operações"
  );
  assert.equal(restoreRes.status, "ACTIVE");

  const restoredStatus = await EnterpriseCorporateHeadquartersService.getStoreLicenseStatus(
    companyId,
    branchId,
    terminalId
  );
  assert.equal(restoredStatus.status, "ACTIVE");
});

test("Corporate Headquarters: Bidirectional Synchronization (Loja <-> Cloud <-> Sede)", async () => {
  const companyId = `comp-corp-sync-${Date.now()}`;
  const terminalId = `TERM-SYNC-${Date.now()}`;
  const branchId = `branch-sync-${Date.now()}`;

  // Sede dispatches a corporate broadcast command
  await EnterpriseCorporateHeadquartersService.dispatchCorporateCommand(
    companyId,
    branchId,
    "BROADCAST",
    { message: "Fecho do sistema para manutenção preventiva às 22h." },
    "Sede Central"
  );

  // Filial syncs with Cloud Hub (sending telemetry + offline outbox items)
  const syncResult = await EnterpriseCorporateHeadquartersService.syncBidirectionalStore(
    companyId,
    branchId,
    {
      telemetry: {
        branchCode: "FILIAL-01",
        branchName: "Filial Talatona",
        terminalId,
        todaySalesCents: 12500000,
        todayDocumentsCount: 45,
        cashDrawerCents: 3200000,
        activeUsersCount: 3,
      },
      outboxEntries: [
        {
          id: `outbox-${Date.now()}-1`,
          type: "SALE_DOCUMENT",
          payload: { invoiceNo: "FT 2026/001", totalCents: 45000 },
          queuedAt: new Date().toISOString(),
        },
        {
          id: `outbox-${Date.now()}-2`,
          type: "DRAWER_MOVEMENT",
          payload: { type: "CASH_IN", amountCents: 10000 },
          queuedAt: new Date().toISOString(),
        },
      ],
    }
  );

  assert.equal(syncResult.success, true);
  assert.equal(syncResult.processedOutboxCount, 2);
  assert.equal(syncResult.licenseStatus, "ACTIVE");
  assert.ok(Array.isArray(syncResult.pendingCommands));
  assert.ok(syncResult.pendingCommands.length >= 1);

  const broadcastCmd = syncResult.pendingCommands.find((c) => c.commandType === "BROADCAST");
  assert.ok(broadcastCmd, "Comando pendente deve ser entregue durante a sincronização bidirecional");

  // Filial acknowledges receipt/execution of command
  const ackRes = await EnterpriseCorporateHeadquartersService.acknowledgeBranchCommand(
    companyId,
    branchId,
    broadcastCmd.id
  );
  assert.equal(ackRes.acknowledged, true);

  // Subsequent check reveals command is no longer pending
  const remainingPending = await EnterpriseCorporateHeadquartersService.getPendingBranchCommands(
    companyId,
    branchId
  );
  const stillPending = remainingPending.find((c) => c.id === broadcastCmd.id);
  assert.equal(stillPending, undefined, "Comando confirmado não deve mais constar como pendente");
});
