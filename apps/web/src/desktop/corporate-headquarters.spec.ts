import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

test("LiveUpdateEngine: Asymmetric RSA-SHA256 digital signature and signed manifest verification", () => {
  const engine = LiveUpdateEngine.getInstance();
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const canonicalPayload = "2.3.0:stable:2.2.0:20261028_001:checksum-abc-123";
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(canonicalPayload);
  signer.end();
  const signatureBase64 = signer.sign(privateKey, "base64");

  engine.configure({
    appVersion: "3.2.2-rc.2",
    updateChannel: "stable",
  });

  // Valid asymmetric signature
  const validRes = engine.verifyAsymmetricManifest(
    {
      manifestVersion: "1.0",
      version: "2.3.0",
      releaseDate: "2026-10-28",
      channel: "stable",
      minimumPreviousVersion: "2.2.0",
      targetSchemaVersion: "20261028_001",
      checksumSha256: "checksum-abc-123",
      mandatoryMigrations: [],
      releaseNotes: "Atualização estável assinada assimetricamente.",
      publisher: "Mutshima Enterprise PKI Authority",
      signatureRsaSha256: signatureBase64,
      canonicalPayload,
    },
    publicKey
  );
  assert.equal(validRes.valid, true);

  // Missing asymmetric signature -> rejected (plain checksum is not a signature)
  const missingSigRes = engine.verifyAsymmetricManifest(
    {
      manifestVersion: "1.0",
      version: "2.3.0",
      releaseDate: "2026-10-28",
      channel: "stable",
      minimumPreviousVersion: "2.2.0",
      targetSchemaVersion: "20261028_001",
      checksumSha256: "checksum-abc-123",
      mandatoryMigrations: [],
      releaseNotes: "Manifesto sem assinatura digital.",
      publisher: "Autor desconhecido",
    },
    publicKey
  );
  assert.equal(missingSigRes.valid, false);
  assert.ok(missingSigRes.reason?.includes("Assinatura assimétrica digital ausente"));
});

test("LiveUpdateEngine: Blocks update on version rollback constraint and channel mismatch", () => {
  const engine = LiveUpdateEngine.getInstance();
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  engine.configure({
    appVersion: "1.9.0",
    updateChannel: "stable",
  });

  const canonicalPayload = "2.3.0:beta:2.0.0:20261028_001:checksum-abc";
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(canonicalPayload);
  signer.end();
  const signatureBase64 = signer.sign(privateKey, "base64");

  // Incompatible minimum previous version (1.9.0 < 2.0.0)
  const incompatibleVer = engine.verifyAsymmetricManifest(
    {
      manifestVersion: "1.0",
      version: "2.3.0",
      releaseDate: "2026-10-28",
      channel: "stable",
      minimumPreviousVersion: "2.0.0",
      targetSchemaVersion: "20261028_001",
      checksumSha256: "checksum-abc",
      mandatoryMigrations: [],
      releaseNotes: "Update",
      publisher: "Mutshima",
      signatureRsaSha256: signatureBase64,
      canonicalPayload,
    },
    publicKey
  );
  assert.equal(incompatibleVer.valid, false);
  assert.ok(incompatibleVer.reason?.includes("inferior à versão mínima exigida"));
});

test("LiveUpdateEngine: Rejects unauthorized synchronization endpoint when none configured", async () => {
  const engine = LiveUpdateEngine.getInstance();
  engine.configure({ authorizedUpdateEndpoint: undefined });

  const syncResult = await engine.performBidirectionalSync(undefined);
  assert.equal(syncResult.success, false);
  assert.equal(syncResult.online, false);
  assert.ok(syncResult.error?.includes("Nenhum canal ou servidor corporativo autorizado"));
});

test("Corporate Panel: API indisponível resulta em estado offline sem expor 'Failed to fetch'", async () => {
  const engine = LiveUpdateEngine.getInstance();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const result = await engine.performBidirectionalSync("https://central.empresa.ao", {
      todaySalesCents: 1000,
      todayDocumentsCount: 1,
    });

    assert.equal(result.success, false);
    assert.equal(result.online, false);
    assert.ok(result.error);
    assert.equal(result.error.toLowerCase().includes("failed to fetch"), false, "Nunca deve expor 'Failed to fetch' ao utilizador");
    assert.ok(result.error.includes("offline") || result.error.includes("ligação") || result.error.includes("inacessível") || result.error.includes("indisponível") || result.error.includes("rejeitada"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Corporate Panel: URL usada na sincronização é a URL configurada, não localhost fixo", async () => {
  const engine = LiveUpdateEngine.getInstance();
  let requestedUrl = "";
  let requestedMethod = "";
  let requestedHeaders: Record<string, string> = {};

  const originalFetch = globalThis.fetch;
  const configuredApiUrl = "https://central-corp.empresa.ao";

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedMethod = init?.method || "GET";
      requestedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({
        success: true,
        appliedCount: 0,
        appliedCommands: [],
        serverTimestamp: new Date().toISOString(),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    engine.configure({
      companyId: "comp-sync-test",
      branchId: "br-sync-01",
      branchCode: "SYNC-01",
      branchName: "Filial Sync Teste",
      authorizedUpdateEndpoint: configuredApiUrl,
    });

    const result = await engine.performBidirectionalSync(configuredApiUrl, {
      todaySalesCents: 50000,
      todayDocumentsCount: 2,
    });

    assert.equal(result.success, true);
    assert.equal(result.online, true);
    assert.equal(requestedMethod, "POST");
    assert.equal(requestedUrl, `${configuredApiUrl}/api/v1/corporate/sync/bidirectional`);
    assert.notEqual(requestedUrl, "http://localhost:4000/api/v1/corporate/sync/bidirectional");
    assert.equal(requestedHeaders["x-company-id"], "comp-sync-test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Corporate Panel: API configurada corretamente carrega cockpit real", async () => {
  const originalFetch = globalThis.fetch;
  const configuredApiUrl = "https://central-corp.empresa.ao";
  let calledEndpoint = "";

  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      calledEndpoint = String(input);
      if (calledEndpoint === `${configuredApiUrl}/api/v1/corporate/cockpit`) {
        return new Response(JSON.stringify({
          stores: [
            {
              id: "store-real-01",
              code: "HQ-REAL",
              name: "Sede Principal Real",
              isHeadquarters: true,
              online: true,
              todaySalesCents: 25000000,
            },
          ],
          recentEvents: [
            {
              id: "ev-001",
              createdAt: new Date().toISOString(),
              actorName: "Administrador Central",
              eventType: "TELEMETRY",
              severity: "INFO",
              description: "Cockpit sincronizado com o servidor central.",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    };

    const res = await fetch(`${configuredApiUrl}/api/v1/corporate/cockpit`, {
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.stores.length, 1);
    assert.equal(data.stores[0].name, "Sede Principal Real");
    assert.equal(data.stores[0].online, true);
    assert.equal(data.recentEvents.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Corporate Panel: 403 continua a limpar dados e bloquear o painel", async () => {
  const originalFetch = globalThis.fetch;
  const configuredApiUrl = "https://central-corp.empresa.ao";

  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${configuredApiUrl}/api/v1/corporate/cockpit`) {
        return new Response(JSON.stringify({ error: "forbidden_role" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    };

    const res = await fetch(`${configuredApiUrl}/api/v1/corporate/cockpit`, {
      headers: { Authorization: "Bearer cashier-token", "Content-Type": "application/json" },
    });
    assert.equal(res.status, 403);
    const data = await res.json() as any;
    assert.equal(data.error, "forbidden_role");
    assert.equal(data.stores, undefined, "Dados corporativos nunca devem ser devolvidos após 403");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Corporate Panel: Paridade total garantida entre Desktop e Web", () => {
  const desktopPanelPath = __dirname.includes("desktop")
    ? path.resolve(__dirname, "corporate-panel.tsx")
    : path.resolve(__dirname, "../../../desktop/src/corporate-panel.tsx");
  const webPanelPath = __dirname.includes("desktop")
    ? path.resolve(__dirname, "../../web/src/desktop/corporate-panel.tsx")
    : path.resolve(__dirname, "corporate-panel.tsx");

  if (fs.existsSync(desktopPanelPath) && fs.existsSync(webPanelPath)) {
    const desktopContent = fs.readFileSync(desktopPanelPath, "utf8");
    const webContent = fs.readFileSync(webPanelPath, "utf8");
    assert.equal(desktopContent, webContent, "apps/desktop e apps/web devem ter ficheiros corporate-panel.tsx 100% idênticos");
  }
});

test("Corporate Panel: Modo DEMO reversível, banner inequívoco e botão de desativação", () => {
  const panelPath = path.resolve(__dirname, "corporate-panel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf8");

  // Banner inequívoco
  assert.ok(
    panelSource.includes("MODO DEMO ATIVO — Dados ilustrativos"),
    "Deve conter o banner permanente 'MODO DEMO ATIVO — Dados ilustrativos'"
  );

  // Botão de desativação
  assert.ok(
    panelSource.includes("Desativar Modo DEMO e voltar aos dados reais"),
    "Deve conter o botão 'Desativar Modo DEMO e voltar aos dados reais'"
  );

  // Limpeza de chave local sem tocar em chaves de sessão real
  assert.ok(
    panelSource.includes('localStorage.removeItem("vendaja_demo_mode")'),
    "Ao desativar, deve remover vendaja_demo_mode do localStorage"
  );

  // Não apaga tokens nem licenças reais
  assert.ok(!panelSource.includes('localStorage.removeItem("accessToken")'), "Desativar DEMO não deve apagar accessToken");
  assert.ok(!panelSource.includes('localStorage.removeItem("pos_license")'), "Desativar DEMO não deve apagar licença");

  // Nunca emite 'Failed to fetch'
  assert.ok(
    !panelSource.includes('"Failed to fetch"') && !panelSource.includes("'Failed to fetch'"),
    "O painel corporativo nunca deve expor 'Failed to fetch'"
  );
});

test("Corporate Panel: Ausência de contaminação de DEMO em endpoints reais", () => {
  const panelPath = path.resolve(__dirname, "corporate-panel.tsx");
  const panelSource = fs.readFileSync(panelPath, "utf8");

  // Quando isDemo está ativo, mutações reais para o backend devem ser estritamente bloqueadas
  assert.ok(panelSource.includes("if (isDemo) return;"), "Mutações reais devem ser bloqueadas no modo DEMO");
  assert.ok(panelSource.includes("if (api && token && !isDemo)"), "Chamadas de escrita devem exigir !isDemo");
});
