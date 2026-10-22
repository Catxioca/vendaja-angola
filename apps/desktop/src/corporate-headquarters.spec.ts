import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  MODULE_CATALOG,
  PLAN_METADATA,
  normalizeModuleCode,
  type AppModule,
} from "./modules.js";
import {
  LiveUpdateEngine,
  LivePatchPayload,
} from "./live-update-engine.js";

test("Desktop Corporate: MODULE_CATALOG contains CORPORATE canonical module", () => {
  const corporateMod = MODULE_CATALOG.find((m) => m.code === "CORPORATE");
  assert.ok(corporateMod, "O catálogo de módulos deve conter o módulo CORPORATE");
  assert.equal(corporateMod.name, "Centro Corporativo");
  assert.equal(corporateMod.category, "Administração & Sede");
  assert.equal(corporateMod.minimumPlan, "ENTERPRISE");

  const normalized = normalizeModuleCode("corporate");
  assert.equal(normalized, "CORPORATE");
});

test("Desktop Corporate: Enterprise Plan includes CORPORATE module", () => {
  const enterprisePlan = PLAN_METADATA.ENTERPRISE;
  assert.ok(enterprisePlan.modules.includes("CORPORATE"));
  assert.ok(enterprisePlan.modules.includes("BIOMETRICS"));
  assert.ok(enterprisePlan.modules.includes("AI"));
});

test("LiveUpdateEngine: Ingests configuration and generates client telemetry", () => {
  const engine = LiveUpdateEngine.getInstance();
  engine.configure({
    companyId: "comp-enterprise-ao",
    branchId: "br-kinaxixi-hq",
    branchCode: "HQ-01",
    branchName: "Sede Kinaxixi",
    isHeadquarters: true,
    appVersion: "2.2.4",
    hardwareId: "HWID-TEST-001",
    terminalId: "TERM-01",
  });

  const telemetry = engine.getTelemetryPayload({
    todaySalesCents: 5200000,
    todayDocumentsCount: 30,
    cashDrawerCents: 1800000,
    activeUsersCount: 3,
    pendingSyncCount: 0,
  });

  assert.equal(telemetry.companyId, "comp-enterprise-ao");
  assert.equal(telemetry.branchCode, "HQ-01");
  assert.equal(telemetry.isHeadquarters, true);
  assert.equal(telemetry.todaySalesCents, 5200000);
  assert.equal(telemetry.todayDocumentsCount, 30);
  assert.equal(telemetry.cashDrawerCents, 1800000);
  assert.equal(telemetry.hardwareId, "HWID-TEST-001");
});

test("LiveUpdateEngine: Cryptographic verification of SHA-256 digital signature", async () => {
  const engine = LiveUpdateEngine.getInstance();
  const companyId = "comp-enterprise-ao";
  const patchVersion = "2.2.4-patch.01";
  const category = "MODULE_RELEASE";
  const payloadJson = JSON.stringify({ modules: ["BIOMETRICS", "CORPORATE"] });

  // Calculate genuine signature
  const canonicalString = `${companyId}:${patchVersion}:${category}:${payloadJson}`;
  const validSignature = crypto.createHash("sha256").update(canonicalString).digest("hex");

  // Verify valid signature
  const isValid = await engine.verifyPatchSignature({
    companyId,
    patchVersion,
    category,
    payloadJson,
    sha256Signature: validSignature,
  });
  assert.equal(isValid, true, "A assinatura SHA-256 válida deve ser aprovada");

  // Verify tampered signature
  const isInvalid = await engine.verifyPatchSignature({
    companyId,
    patchVersion,
    category,
    payloadJson,
    sha256Signature: "0000000000000000000000000000000000000000000000000000000000000000",
  });
  assert.equal(isInvalid, false, "A assinatura SHA-256 adulterada deve ser sumariamente rejeitada");
});

test("LiveUpdateEngine: Dynamic Hot-Patch application enables modules without reinstallation", async () => {
  const engine = LiveUpdateEngine.getInstance();
  const companyId = "comp-enterprise-ao";
  const patchVersion = "2.2.4-patch.02";
  const category = "MODULE_RELEASE";
  const payloadJson = JSON.stringify({ modules: ["BIOMETRICS", "CORPORATE"] });
  const canonicalString = `${companyId}:${patchVersion}:${category}:${payloadJson}`;
  const sha256Signature = crypto.createHash("sha256").update(canonicalString).digest("hex");

  const patch: LivePatchPayload = {
    patchId: "patch-dynamic-02",
    patchVersion,
    category,
    title: "Ativação Dinâmica do Módulo Biometria e Centro Corporativo",
    description: "Distribuição remota sem novo instalador .exe",
    payloadJson,
    sha256Signature,
    isCritical: true,
  };

  const applyResult = await engine.applyLivePatch(patch);
  assert.equal(applyResult.success, true);
  assert.ok(applyResult.activatedModules?.includes("BIOMETRICS"));
  assert.ok(applyResult.activatedModules?.includes("CORPORATE"));

  const activeDyn = engine.getDynamicallyActivatedModules();
  assert.ok(activeDyn.includes("BIOMETRICS"));
  assert.ok(activeDyn.includes("CORPORATE"));

  const isLocallyActive = engine.isModuleActiveLocally("CORPORATE", ["POS", "STOCK"]);
  assert.equal(isLocallyActive, true);
});

test("LiveUpdateEngine: Receives and buffers Sede Broadcast announcements", () => {
  const engine = LiveUpdateEngine.getInstance();
  engine.receiveBroadcast({
    id: "bc-fecho-mes",
    title: "Fecho do Mês Fiscal - Outubro 2026",
    content: "Favor reconciliar e emitir mapa diário até às 21:00.",
    priority: "URGENT",
    senderName: "Sede Central (Kinaxixi)",
  });

  const broadcasts = engine.getBroadcasts();
  assert.ok(broadcasts.length >= 1);
  const found = broadcasts.find((b) => b.id === "bc-fecho-mes");
  assert.ok(found);
  assert.equal(found?.priority, "URGENT");
  assert.equal(found?.read, false);

  engine.markBroadcastRead("bc-fecho-mes");
  const readBroadcast = engine.getBroadcasts().find((b) => b.id === "bc-fecho-mes");
  assert.equal(readBroadcast?.read, true);
});
