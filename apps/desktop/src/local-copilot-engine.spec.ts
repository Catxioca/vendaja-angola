import test from "node:test";
import assert from "node:assert/strict";
import {
  EnterpriseLocalCopilotEngine,
  type LocalCopilotContext,
} from "./local-copilot-engine.js";
import { createPosStorage, type LocalPosStorage, type Sale, type CashEntry, type Product } from "@angola/shared";
import type { LicenseStatus } from "./license.js";

test("Local Copilot Engine: Rejects query when AI module is not licensed", async () => {
  const licenseWithoutAi: LicenseStatus = {
    valid: true,
    hardwareId: "TEST-HW-1",
    modules: ["SETTINGS", "POS", "STOCK"],
    daysRemaining: 180,
    expiryTier: "valid",
  };

  const result = await EnterpriseLocalCopilotEngine.query("Quanto vendi hoje?", {
    licenseStatus: licenseWithoutAi,
  });

  assert.equal(result.authorized, false);
  assert.equal(result.intent, "LICENSE_BLOCKED");
  assert.ok(result.textAnswer.includes("Módulo IA não licenciado"));
  assert.equal(result.source, "LICENSE_GATE");
});

test("Local Copilot Engine: Accepts query when AI module is licensed in Enterprise plan", async () => {
  const licenseWithAi: LicenseStatus = {
    valid: true,
    hardwareId: "TEST-HW-1",
    modules: ["SETTINGS", "POS", "AI", "BIOMETRICS"],
    daysRemaining: 365,
    expiryTier: "valid",
  };

  const result = await EnterpriseLocalCopilotEngine.query("Quanto vendi hoje?", {
    licenseStatus: licenseWithAi,
  });

  assert.equal(result.authorized, true);
  assert.equal(result.intent, "SALES_TODAY");
  assert.equal(result.source, "OFFLINE_LOCAL_DB");
  assert.ok(result.textAnswer.length > 0);
});

test("Local Copilot Engine: 'Quanto vendi hoje?' returns zero on clean install without fake data", async () => {
  const storage = createPosStorage(`test-pos-copilot-clean-${Date.now()}`);
  const result = await EnterpriseLocalCopilotEngine.query("Quanto vendi hoje?", {
    storage,
  });

  assert.equal(result.intent, "SALES_TODAY");
  assert.equal(result.domain, "SALES");
  assert.ok(result.textAnswer.includes("0,00 Kz"));
  assert.ok(result.textAnswer.includes("0 documentos"));
  assert.equal(result.metrics[0]?.value, "0,00 Kz");
  assert.equal(result.metrics[1]?.value, "0 faturas");
});

test("Local Copilot Engine: 'Quanto vendi hoje?' accurately computes real local sales", async () => {
  const storage = createPosStorage(`test-pos-copilot-sales-${Date.now()}`);
  const now = new Date().toISOString();

  // Insert two real sales today
  const sale1: Sale = {
    id: "sale-01",
    number: "FR 2026/01",
    currency: "AOA",
    subtotalCents: 1000000, // 10.000 Kz
    taxCents: 140000,
    totalCents: 1140000, // 11.400 Kz
    paymentMethod: "CASH",
    lines: [{ productId: "prod-1", quantity: 2, unitPriceCents: 500000, taxRate: 0.14 }],
    createdAt: now,
  };

  const sale2: Sale = {
    id: "sale-02",
    number: "FR 2026/02",
    currency: "AOA",
    subtotalCents: 500000, // 5.000 Kz
    taxCents: 70000,
    totalCents: 570000, // 5.700 Kz
    paymentMethod: "CARD",
    lines: [{ productId: "prod-2", quantity: 1, unitPriceCents: 500000, taxRate: 0.14 }],
    createdAt: now,
  };

  await storage.saveSale(sale1);
  await storage.saveSale(sale2);

  const result = await EnterpriseLocalCopilotEngine.query("Quanto vendi hoje?", { storage });

  assert.equal(result.intent, "SALES_TODAY");
  // Total = 11.400 + 5.700 = 17.100 Kz
  assert.ok(result.textAnswer.includes("17.100,00 Kz"));
  assert.ok(result.textAnswer.includes("2 documento(s)"));
  assert.equal(result.metrics[0]?.value, "17.100,00 Kz");
  assert.equal(result.metrics[1]?.value, "2 faturas");
  assert.ok(result.table);
  assert.equal(result.table.rows.length, 2);
});

test("Local Copilot Engine: 'Qual o saldo atual de caixa?' calculates real drawer movements", async () => {
  const storage = createPosStorage(`test-pos-copilot-cash-${Date.now()}`);
  const now = new Date().toISOString();

  // Cash float of 20.000 Kz
  const customCashSession = { openingFloatCents: 2000000 };

  // Sale in cash of 5.000 Kz
  const cashSale: Sale = {
    id: "sale-cash",
    number: "FR 2026/03",
    currency: "AOA",
    subtotalCents: 500000,
    taxCents: 0,
    totalCents: 500000,
    paymentMethod: "CASH",
    cashCents: 500000,
    lines: [],
    createdAt: now,
  };
  await storage.saveSale(cashSale);

  // Cash entry IN of 3.000 Kz, OUT of 1.000 Kz
  const entryIn: CashEntry = {
    id: "cash-in-1",
    type: "IN",
    amountCents: 300000,
    note: "Suprimento de trocos",
    createdAt: now,
  };
  const entryOut: CashEntry = {
    id: "cash-out-1",
    type: "OUT",
    amountCents: 100000,
    note: "Despesa café",
    createdAt: now,
  };
  await storage.saveCashEntry(entryIn);
  await storage.saveCashEntry(entryOut);

  // Expected balance = 20.000 + 5.000 + 3.000 - 1.000 = 27.000 Kz
  const result = await EnterpriseLocalCopilotEngine.query("Qual o saldo atual de caixa?", {
    storage,
    customCashSession,
  });

  assert.equal(result.intent, "FINANCE_CASH_BALANCE");
  assert.ok(result.textAnswer.includes("27.000,00 Kz"));
  assert.equal(result.metrics[0]?.value, "27.000,00 Kz");
  assert.equal(result.metrics[1]?.value, "20.000,00 Kz");
  assert.equal(result.metrics[2]?.value, "5.000,00 Kz");
});

test("Local Copilot Engine: 'Quais produtos estão com stock crítico?' identifies <= 5 units", async () => {
  const customProducts: Product[] = [
    { id: "p1", sku: "SKU-001", name: "Arroz 1kg", priceCents: 120000, stock: 2, taxRate: 0.14, active: true },
    { id: "p2", sku: "SKU-002", name: "Óleo 1L", priceCents: 180000, stock: 4, taxRate: 0.14, active: true },
    { id: "p3", sku: "SKU-003", name: "Açúcar 1kg", priceCents: 90000, stock: 50, taxRate: 0.14, active: true },
  ];

  const result = await EnterpriseLocalCopilotEngine.query("Quais produtos estão com stock crítico?", {
    customProducts,
  });

  assert.equal(result.intent, "STOCK_CRITICAL");
  assert.equal(result.domain, "STOCK");
  assert.ok(result.textAnswer.includes("2 produto(s)"));
  assert.ok(result.textAnswer.includes("Arroz 1kg"));
  assert.ok(result.textAnswer.includes("Óleo 1L"));
  assert.ok(!result.textAnswer.includes("Açúcar 1kg"));
  assert.equal(result.metrics[0]?.value, "2 produto(s)");
  assert.equal(result.metrics[1]?.value, "3 artigos");
});

test("Local Copilot Engine: 'Quais clientes estão em dívida?' detects credit sales accurately", async () => {
  const storage = createPosStorage(`test-pos-copilot-debtors-${Date.now()}`);
  const now = new Date().toISOString();

  const creditSale: Sale = {
    id: "sale-cred-1",
    number: "FT 2026/01",
    currency: "AOA",
    subtotalCents: 4500000, // 45.000 Kz
    taxCents: 0,
    totalCents: 4500000,
    paymentMethod: "CREDIT",
    customerName: "Construções Luanda Lda",
    customerNif: "5401234567",
    lines: [],
    createdAt: now,
  };
  await storage.saveSale(creditSale);

  const result = await EnterpriseLocalCopilotEngine.query("Quais clientes estão em dívida?", {
    storage,
  });

  assert.equal(result.intent, "DEBTOR_CUSTOMERS");
  assert.ok(result.textAnswer.includes("1 cliente(s)"));
  assert.ok(result.textAnswer.includes("45.000,00 Kz"));
  assert.ok(result.textAnswer.includes("Construções Luanda Lda"));
  assert.equal(result.metrics[0]?.value, "1");
  assert.equal(result.metrics[1]?.value, "45.000,00 Kz");
});

test("Local Copilot Engine: Error classification eliminates generic 'Failed to fetch'", () => {
  const fetchErr = new TypeError("Failed to fetch");
  const classifiedFetch = EnterpriseLocalCopilotEngine.classifyError(fetchErr, "http://localhost:4000");
  assert.equal(classifiedFetch.isOffline, true);
  assert.equal(classifiedFetch.code, "SERVICE_UNREACHABLE");
  assert.ok(!classifiedFetch.userMessage.includes("Failed to fetch"));
  assert.ok(classifiedFetch.userMessage.includes("Serviço central de IA parado"));

  const timeoutErr = new Error("The operation was aborted due to timeout");
  const classifiedTimeout = EnterpriseLocalCopilotEngine.classifyError(timeoutErr);
  assert.equal(classifiedTimeout.code, "TIMEOUT");
  assert.ok(classifiedTimeout.userMessage.includes("Timeout do serviço IA"));

  const forbiddenErr = new Error("HTTP 403: Forbidden - permissao em falta");
  const classifiedForbidden = EnterpriseLocalCopilotEngine.classifyError(forbiddenErr);
  assert.equal(classifiedForbidden.code, "PERMISSION_DENIED");
  assert.ok(classifiedForbidden.userMessage.includes("Permissão AI.Chat em falta"));
});
