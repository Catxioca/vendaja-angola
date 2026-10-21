import test from "node:test";
import assert from "node:assert/strict";
import {
  EnterpriseAiCopilotService,
  EnterpriseRbacService,
  EnterpriseCloudUpdateService,
  SYSTEM_PERMISSIONS,
} from "./enterprise/index.js";

test("VendaJá Copilot: SYSTEM_PERMISSIONS contains canonical AI permission suite (84 total)", () => {
  assert.equal(SYSTEM_PERMISSIONS.length, 84, "Total de permissões do sistema deve ser 84");
  
  const aiPerms = SYSTEM_PERMISSIONS.filter((p) => p.module === "AI");
  assert.equal(aiPerms.length, 5, "Módulo de IA deve possuir exatamente 5 permissões canónicas");
  
  const codes = aiPerms.map((p) => p.code);
  assert.ok(codes.includes("AI.View"), "Deve conter AI.View");
  assert.ok(codes.includes("AI.Chat"), "Deve conter AI.Chat");
  assert.ok(codes.includes("AI.Forecast"), "Deve conter AI.Forecast");
  assert.ok(codes.includes("AI.Analytics"), "Deve conter AI.Analytics");
  assert.ok(codes.includes("AI.Admin"), "Deve conter AI.Admin");
});

test("VendaJá Copilot: NLU intent classification correctly classifies multi-domain queries", async () => {
  const companyId = "test-comp-1";
  const adminUserId = "admin-user";

  // Mock Rbac to always grant permissions for this admin user
  const originalHasPermission = EnterpriseRbacService.hasPermission;
  EnterpriseRbacService.hasPermission = async () => true;

  try {
    // 1. Sales query
    const resSales = await EnterpriseAiCopilotService.query({
      query: "Quanto vendi hoje?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resSales.intent, "SALES_TODAY");
    assert.equal(resSales.domain, "SALES");
    assert.equal(resSales.authorized, true);
    assert.ok(resSales.textAnswer.length > 0);
    assert.ok(resSales.metrics.length >= 2);

    // 2. Top product query
    const resTop = await EnterpriseAiCopilotService.query({
      query: "Qual foi o produto mais vendido este mês?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resTop.intent, "TOP_PRODUCT_MONTH");
    assert.equal(resTop.domain, "SALES");
    assert.equal(resTop.authorized, true);
    assert.ok(resTop.textAnswer.length > 0);

    // 3. Weekly invoices query
    const resInvoices = await EnterpriseAiCopilotService.query({
      query: "Quantas faturas foram emitidas esta semana?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resInvoices.intent, "INVOICES_WEEK");
    assert.equal(resInvoices.domain, "SALES");
    assert.equal(resInvoices.authorized, true);
    assert.ok(resInvoices.textAnswer.length > 0);

    // 4. Debtor customers query
    const resDebtors = await EnterpriseAiCopilotService.query({
      query: "Quais clientes estão em dívida?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resDebtors.intent, "DEBTOR_CUSTOMERS");
    assert.equal(resDebtors.domain, "SALES");
    assert.equal(resDebtors.authorized, true);
    assert.ok(resDebtors.textAnswer.length > 0);

    // 5. Top suppliers query
    const resSuppliers = await EnterpriseAiCopilotService.query({
      query: "Qual fornecedor teve mais compras?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resSuppliers.intent, "TOP_SUPPLIERS");
    assert.equal(resSuppliers.domain, "SALES");
    assert.equal(resSuppliers.authorized, true);
    assert.ok(resSuppliers.textAnswer.length > 0);

    // 6. Cash balance query
    const resCash = await EnterpriseAiCopilotService.query({
      query: "Qual o saldo atual de caixa?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resCash.intent, "FINANCE_CASH_BALANCE");
    assert.equal(resCash.domain, "FINANCE");
    assert.equal(resCash.authorized, true);
    assert.ok(resCash.textAnswer.length > 0);

    // 7. Stock critical query
    const resStock = await EnterpriseAiCopilotService.query({
      query: "Quais produtos têm stock crítico?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resStock.intent, "STOCK_CRITICAL");
    assert.equal(resStock.domain, "STOCK");
    assert.equal(resStock.authorized, true);
    assert.ok(resStock.textAnswer.length > 0);

    // 8. Predictive sales query
    const resForecast = await EnterpriseAiCopilotService.query({
      query: "Qual a previsão de vendas para os próximos meses?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resForecast.intent, "PREDICTIVE_SALES");
    assert.equal(resForecast.domain, "FORECAST");
    assert.equal(resForecast.authorized, true);
    assert.ok(resForecast.textAnswer.length > 0);

    // 9. HR Vacation query
    const resHr = await EnterpriseAiCopilotService.query({
      query: "Quem está de férias?",
      companyId,
      userId: adminUserId,
    });
    assert.equal(resHr.intent, "HR_ON_VACATION");
    assert.equal(resHr.domain, "HR");
    assert.equal(resHr.authorized, true);
    assert.ok(resHr.textAnswer.length > 0);
  } finally {
    EnterpriseRbacService.hasPermission = originalHasPermission;
  }
});

test("VendaJá Copilot: RBAC security gatekeeper strictly rejects unauthorized users", async () => {
  const companyId = "test-comp-1";
  const restrictedUserId = "cashier-1";

  // Mock Rbac to reject HR and Forecast permissions for this user
  const originalHasPermission = EnterpriseRbacService.hasPermission;
  EnterpriseRbacService.hasPermission = async (userId, perm) => {
    if (perm === "HR.Salary.View" || perm === "AI.Forecast") return false;
    return true;
  };

  try {
    // Attempt HR payroll query without HR.Salary.View
    const resHr = await EnterpriseAiCopilotService.query({
      query: "Qual o custo da folha de pagamento?",
      companyId,
      userId: restrictedUserId,
    });
    assert.equal(resHr.authorized, false, "Deve rejeitar acesso ao custo salarial");
    assert.equal(resHr.requiredPermission, "HR.Salary.View");
    assert.ok(resHr.textAnswer.includes("Acesso Não Autorizado"));

    // Attempt Predictive sales query without AI.Forecast
    const resForecast = await EnterpriseAiCopilotService.query({
      query: "Previsão de vendas para o próximo período",
      companyId,
      userId: restrictedUserId,
    });
    assert.equal(resForecast.authorized, false, "Deve rejeitar previsão sem AI.Forecast");
    assert.equal(resForecast.requiredPermission, "AI.Forecast");
    assert.ok(resForecast.textAnswer.includes("Acesso Não Autorizado"));
  } finally {
    EnterpriseRbacService.hasPermission = originalHasPermission;
  }
});

test("VendaJá Copilot: Proactive insights engine returns non-empty structured alerts", async () => {
  const result = await EnterpriseAiCopilotService.getProactiveInsights("test-comp-1");
  assert.ok(result && typeof result.headline === "string", "Deve retornar headline de insights");
  assert.ok(Array.isArray(result.insights), "result.insights deve ser um array");
  assert.ok(result.insights.length >= 1, "Deve gerar insights proativos");

  const sample = result.insights[0];
  assert.ok(sample.id);
  assert.ok(sample.category);
  assert.ok(sample.message);
  assert.ok(sample.severity);
});

test("VendaJá Copilot: Anomaly detection engine flags irregular operations", async () => {
  const anomalies = await EnterpriseAiCopilotService.detectAnomalies("test-comp-1");
  assert.ok(Array.isArray(anomalies));
  assert.ok(anomalies.length >= 1, "Deve identificar anomalias ou alertas operacionais");

  for (const anom of anomalies) {
    assert.ok(["INFO", "WARN", "CRITICAL"].includes(anom.severity));
    assert.ok(anom.type);
    assert.ok(anom.title);
    assert.ok(typeof anom.deviationPercent === "number");
  }
});

test("VendaJá Copilot: Strategic recommendations engine produces actionable steps with Kwanza impact", async () => {
  const recommendations = await EnterpriseAiCopilotService.getRecommendations("test-comp-1");
  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.length >= 2, "Deve retornar recomendações estratégicas");

  for (const rec of recommendations) {
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(rec.priority));
    assert.ok(rec.title);
    assert.ok(rec.rationale);
    assert.ok(typeof rec.impactKz === "number");
    assert.ok(rec.impactKz > 0, "O impacto financeiro estimado deve ser positivo");
    assert.ok(rec.actionableStep);
  }
});

test("Live Hot-Sync: EnterpriseCloudUpdateService provides dynamic live config without installer re-execution", () => {
  const config = EnterpriseCloudUpdateService.getLiveConfig();
  assert.ok(config);
  assert.equal(typeof config.minVersion, "string");
  assert.ok(Array.isArray(config.activeModules));
  assert.ok(config.activeModules.includes("AI"), "Módulos dinâmicos devem incluir AI");
  assert.ok(config.activeModules.includes("POS"), "Módulos dinâmicos devem incluir POS");
  assert.ok(config.activeModules.includes("STOCK"), "Módulos dinâmicos devem incluir STOCK");
  assert.ok(config.activeModules.includes("TREASURY"), "Módulos dinâmicos devem incluir TREASURY");
  assert.equal(config.hotReloadAllowed, true, "Hot-reload deve estar habilitado para evitar reinstaladores");
  assert.ok(config.syncTimestamp);
});
