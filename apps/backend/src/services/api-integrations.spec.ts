import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  ApiKeyService,
  OAuthService,
  EnterpriseWebhookService,
  IntegrationHubService,
  EnterpriseBiService,
  DataExchangeService,
  EnterpriseEmailService,
  EnterpriseWhatsAppService,
  PluginService,
  ApiMonitoringService,
} from "./enterprise/index.js";

describe("Phase 5: Enterprise APIs, Integrations & Ecosystem Test Suite", () => {
  const testCompanyId = "comp-integrations-spec";

  // ==========================================
  // 1. API KEYS
  // ==========================================
  describe("API Key Service", () => {
    let generatedKey: any;

    test("generates valid API key with vj_live_ prefix and SHA-256 hash", async () => {
      generatedKey = await ApiKeyService.generateApiKey(
        testCompanyId,
        "ERP Primavera Connector",
        ["API.Customers.Read", "API.Sales.Read"],
        120
      );

      assert.ok(generatedKey);
      assert.ok(generatedKey.rawKey.startsWith("vj_live_"));
      assert.equal(generatedKey.companyId, testCompanyId);
      assert.equal(generatedKey.name, "ERP Primavera Connector");
      assert.deepEqual(generatedKey.scopes, ["API.Customers.Read", "API.Sales.Read"]);
      assert.equal(generatedKey.rateLimitRpm, 120);
    });

    test("validates active API key and retrieves credentials", async () => {
      const auth = await ApiKeyService.verifyApiKey(generatedKey.rawKey);
      assert.ok(auth);
      assert.equal(auth.companyId, testCompanyId);
      assert.ok(auth.scopes.includes("API.Customers.Read"));
    });

    test("rejects invalid or tampered API keys", async () => {
      const auth = await ApiKeyService.verifyApiKey("vj_live_invalid_signature_999999");
      assert.equal(auth, null);
    });

    test("revokes API key cleanly", async () => {
      const revoked = await ApiKeyService.revokeApiKey(generatedKey.id, testCompanyId);
      assert.equal(revoked, true);

      const authAfterRevocation = await ApiKeyService.verifyApiKey(generatedKey.rawKey);
      assert.equal(authAfterRevocation, null);
    });
  });

  // ==========================================
  // 2. OAUTH2 CLIENT CREDENTIALS & TOKENS
  // ==========================================
  describe("OAuth2 Service", () => {
    let accessToken: string;

    test("issues JWT token for valid client credentials", async () => {
      const result = await OAuthService.generateClientCredentialsToken(
        "client_vj_enterprise",
        "sec_vj_enterprise_secret_2026",
        "api:all"
      );

      assert.equal(result.success, true);
      assert.ok(result.accessToken);
      assert.equal(typeof result.expiresIn, "number");
      accessToken = result.accessToken!;
    });

    test("rejects invalid client credentials", async () => {
      const result = await OAuthService.generateClientCredentialsToken("client_vj_enterprise", "wrong_secret");
      assert.equal(result.success, false);
      assert.equal(result.error, "invalid_credentials");
    });

    test("introspects valid token per RFC 7662", async () => {
      const info = await OAuthService.introspectToken(accessToken);
      assert.equal(info.active, true);
      assert.equal(info.client_id, "client_vj_enterprise");
      assert.equal(info.scope, "api:all");
    });

    test("revokes token and blacklists it per RFC 7009", async () => {
      const revoked = await OAuthService.revokeToken(accessToken, "security_logout");
      assert.equal(revoked, true);

      const infoAfterRevoke = await OAuthService.introspectToken(accessToken);
      assert.equal(infoAfterRevoke.active, false);
    });

    test("sliding window rate limiter tracks token consumption", () => {
      const limiterKey = "spec-rate-limit-client";
      const allowed1 = OAuthService.checkRateLimit(limiterKey, 5);
      const allowed2 = OAuthService.checkRateLimit(limiterKey, 5);
      assert.equal(allowed1.allowed, true);
      assert.equal(allowed2.allowed, true);
      assert.ok(allowed2.remaining <= 4);
    });
  });

  // ==========================================
  // 3. WEBHOOKS & HMAC SIGNATURES
  // ==========================================
  describe("Webhooks Service", () => {
    let webhookSub: any;
    const testSecret = "secret-spec-hmac-sha256";

    test("registers webhook subscription", async () => {
      webhookSub = await EnterpriseWebhookService.registerSubscription({
        companyId: testCompanyId,
        url: "https://partner-erp.angola.ao/api/webhooks",
        events: ["customer.created", "sale.created", "ping.test"],
        secret: testSecret,
      });

      assert.ok(webhookSub.id);
      assert.equal(webhookSub.companyId, testCompanyId);
      assert.deepEqual(webhookSub.events, ["customer.created", "sale.created", "ping.test"]);
    });

    test("computes valid HMAC-SHA256 signature on event dispatch", async () => {
      const payload = { customerId: "cust-spec-123", name: "Sonangol Distribuidora", nif: "5411223344" };
      const deliveries = await EnterpriseWebhookService.dispatch("customer.created", payload, testCompanyId);

      assert.ok(Array.isArray(deliveries));
      assert.ok(deliveries.length >= 1);

      const delivery = deliveries[0]!;
      assert.equal(delivery.event, "customer.created");

      // Verificar assinatura HMAC
      const rawPayload = JSON.stringify(payload);
      const expectedSignature = crypto.createHmac("sha256", testSecret).update(rawPayload).digest("hex");
      assert.equal(delivery.signature, expectedSignature);
    });

    test("lists webhook delivery logs", async () => {
      const logs = await EnterpriseWebhookService.listDeliveries(webhookSub.id);
      assert.ok(Array.isArray(logs));
      assert.ok(logs.length >= 1);
      assert.equal(logs[0]?.event, "customer.created");
    });
  });

  // ==========================================
  // 4. CENTRAL DE INTEGRAÇÕES (CONNECTORS)
  // ==========================================
  describe("Integration Hub Connectors", () => {
    test("lists all standard enterprise connectors", async () => {
      const connectors = await IntegrationHubService.listConnectors();
      assert.ok(Array.isArray(connectors));
      assert.ok(connectors.length >= 6);

      const providers = connectors.map((c) => c.provider);
      assert.ok(providers.includes("AGT_SAFT_AO"));
      assert.ok(providers.includes("MULTICAIXA_EXPRESS"));
      assert.ok(providers.includes("PRIMAVERA_BSS"));
      assert.ok(providers.includes("SAP_BUSINESS_ONE"));
      assert.ok(providers.includes("SHOPIFY"));
      assert.ok(providers.includes("POWER_BI"));
    });

    test("tests connectivity for connectors", async () => {
      const agtTest = await IntegrationHubService.testConnection("AGT_SAFT_AO");
      assert.equal(agtTest.success, true);
      assert.ok(agtTest.latencyMs >= 0);

      const mcxTest = await IntegrationHubService.testConnection("MULTICAIXA_EXPRESS");
      assert.equal(mcxTest.success, true);
    });

    test("triggers manual sync and records sync log", async () => {
      const syncResult = await IntegrationHubService.triggerSync(testCompanyId, "PRIMAVERA_BSS", "incremental");
      assert.equal(syncResult.success, true);
      assert.ok(syncResult.recordsProcessed >= 0);

      const logs = await IntegrationHubService.listSyncLogs("PRIMAVERA_BSS");
      assert.ok(Array.isArray(logs));
      assert.ok(logs.length >= 1);
      assert.equal(logs[0]?.provider, "PRIMAVERA_BSS");
    });
  });

  // ==========================================
  // 5. POWER BI ANALYTICAL DATASETS
  // ==========================================
  describe("Power BI Datasets", () => {
    test("generates sales dataset with required analytical fields", async () => {
      const sales = await EnterpriseBiService.getSalesDataset(testCompanyId);
      assert.ok(Array.isArray(sales));
      assert.ok(sales.length >= 1);
      const first = sales[0]!;
      assert.ok("invoiceId" in first);
      assert.ok("invoiceNumber" in first);
      assert.ok("grossTotalKz" in first);
      assert.ok("netTotalKz" in first);
      assert.ok("taxAmountKz" in first);
      assert.ok("currency" in first);
    });

    test("generates purchases and inventory datasets", async () => {
      const purchases = await EnterpriseBiService.getPurchasesDataset(testCompanyId);
      assert.ok(Array.isArray(purchases));

      const inventory = await EnterpriseBiService.getInventoryDataset(testCompanyId);
      assert.ok(Array.isArray(inventory));
      assert.ok(inventory.length >= 1);
      const invFirst = inventory[0]!;
      assert.ok("stockOnHand" in invFirst);
      assert.ok("stockValuationKz" in invFirst);
    });
  });

  // ==========================================
  // 6. IMPORTAÇÃO & EXPORTAÇÃO UNIVERSAL
  // ==========================================
  describe("Data Exchange Engine", () => {
    test("exports customers in CSV format", async () => {
      const result = await DataExchangeService.exportData("customers", "csv");
      assert.equal(result.success, true);
      assert.equal(result.contentType, "text/csv; charset=utf-8");
      assert.ok(result.content.includes("name,nif,email"));
    });

    test("exports products in JSON and XML format", async () => {
      const jsonRes = await DataExchangeService.exportData("products", "json");
      assert.equal(jsonRes.success, true);
      assert.ok(jsonRes.content.includes("sku"));

      const xmlRes = await DataExchangeService.exportData("products", "xml");
      assert.equal(xmlRes.success, true);
      assert.ok(xmlRes.content.includes("<?xml version=\"1.0\""));
    });

    test("imports customers from JSON content safely", async () => {
      const rawJson = JSON.stringify([
        { name: "Empresa Nova Lda", nif: "5400011223", email: "info@novalda.ao" },
        { name: "Comércio Geral SA", nif: "5400099887", email: "geral@comerciogeral.ao" },
      ]);

      const importResult = await DataExchangeService.importData("customers", "json", rawJson);
      assert.equal(importResult.processed, 2);
      assert.equal(importResult.successCount, 2);
      assert.equal(importResult.errorCount, 0);
    });
  });

  // ==========================================
  // 7. MENSAGENS OMNICANAL (EMAIL & WHATSAPP)
  // ==========================================
  describe("Omnichannel Messaging Engine", () => {
    test("sends templated email and logs into outbox", async () => {
      const result = await EnterpriseEmailService.sendEmail({
        companyId: testCompanyId,
        to: "contabilidade@cliente.ao",
        templateId: "INVOICE_ISSUED",
        templateVariables: {
          customerName: "PetroAngola EP",
          invoiceNumber: "FT A/2026/089",
          totalKz: "1.250.000,00",
          dueDate: "2026-11-30",
          paymentReference: "987 654 321",
        },
      });

      assert.equal(result.success, true);
      assert.ok(result.messageId);

      const logs = await EnterpriseEmailService.listOutbox(testCompanyId);
      assert.ok(logs.length >= 1);
      assert.equal(logs[0]?.recipient, "contabilidade@cliente.ao");
    });

    test("sends templated WhatsApp message and logs into outbox", async () => {
      const result = await EnterpriseWhatsAppService.sendWhatsApp({
        companyId: testCompanyId,
        toPhone: "+244923000111",
        templateId: "PAYMENT_REMINDER",
        templateVariables: {
          customerName: "Dr. Carlos Silva",
          invoiceNumber: "FT A/2026/044",
          totalKz: "450.000,00",
          reference: "123 456 789",
        },
      });

      assert.equal(result.success, true);
      assert.ok(result.messageId);

      const logs = await EnterpriseWhatsAppService.listOutbox(testCompanyId);
      assert.ok(logs.length >= 1);
      assert.equal(logs[0]?.recipient, "+244923000111");
    });
  });

  // ==========================================
  // 8. MARKETPLACE & PLUGINS
  // ==========================================
  describe("Plugins & Extensions Service", () => {
    test("lists available enterprise plugins", async () => {
      const plugins = await PluginService.listPlugins();
      assert.ok(Array.isArray(plugins));
      assert.ok(plugins.length >= 4);

      const pluginIds = plugins.map((p) => p.id);
      assert.ok(pluginIds.includes("ext-multicaixa-gpo"));
      assert.ok(pluginIds.includes("ext-saft-agt-auto"));
      assert.ok(pluginIds.includes("ext-whatsapp-bot"));
    });

    test("toggles plugin enabled status", async () => {
      const toggleRes = await PluginService.togglePlugin("ext-multicaixa-gpo", true);
      assert.equal(toggleRes.success, true);
      assert.equal(toggleRes.plugin.enabled, true);
    });
  });

  // ==========================================
  // 9. TELEMETRIA & MONITORIZAÇÃO DA API
  // ==========================================
  describe("API Monitoring & Telemetry", () => {
    test("records HTTP metrics and produces snapshot with latencies and status codes", () => {
      ApiMonitoringService.recordRequest("/api/v1/customers", 200, 15);
      ApiMonitoringService.recordRequest("/api/v1/customers", 200, 25);
      ApiMonitoringService.recordRequest("/api/v1/products", 200, 30);
      ApiMonitoringService.recordRequest("/api/v1/sales", 500, 45);

      const snapshot = ApiMonitoringService.getTelemetrySnapshot();
      assert.ok(snapshot);
      assert.ok(snapshot.requestsTotal >= 4);
      assert.ok(snapshot.statusCodes["2xx"] >= 3);
      assert.ok(snapshot.statusCodes["5xx"] >= 1);
      assert.ok(snapshot.latency.p50 >= 0);
      assert.ok(snapshot.latency.p95 >= 0);
    });

    test("provides active alerts without crashing", () => {
      const alerts = ApiMonitoringService.getActiveAlerts();
      assert.ok(Array.isArray(alerts));
    });
  });
});
