import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateProvisionalReceiptHtml, ProvisionalReceiptData } from "./provisional-receipt";
import type { TenantContext } from "./types";

const mockTenant: TenantContext = {
  companyId: "comp-123",
  branchId: "branch-456",
  companyName: "Comércio Geral de Luanda Lda",
  branchName: "Loja Kinaxixi",
  membershipId: "mem-1",
  role: "OPERATOR",
  terminalId: "01",
  modules: ["POS", "STOCK"],
};

const mockReceiptData: ProvisionalReceiptData = {
  correlationId: "PROV-TEST-999",
  idempotencyKey: "sale-offline-test-123",
  occurredAt: "2026-10-29T10:00:00.000Z",
  tenant: mockTenant,
  operatorName: "Manuel Gonçalves",
  customerName: "Consumidor Final",
  lines: [
    {
      productId: "prod-1",
      sku: "ALIM-001",
      name: "Arroz Agulha 1kg",
      unitPriceCents: 150000,
      quantity: 2,
      taxRate: 0.14,
      hasTaxPolicy: true,
      lineTotalCents: 300000,
      lineTaxCents: 42000,
    },
  ],
  paymentPlan: {
    idempotencyKey: "sale-offline-test-123",
    paymentMethod: "CASH",
    fiscalType: "INVOICE_RECEIPT",
    totalCents: 342000,
    cashCents: 342000,
    cardCents: 0,
    transferCents: 0,
    tenderedCents: 400000,
    changeCents: 58000,
    customer: null,
    dueDate: null,
    cashSessionId: "session-1",
    hasTaxPolicy: true,
  },
};

describe("Provisional Receipt Generation", () => {
  it("deve conter obrigatoriamente a advertência legal de comprovativo provisório e não fiscal", () => {
    const html = generateProvisionalReceiptHtml(mockReceiptData);

    // Requisito fiscal obrigatório
    assert.ok(html.includes("COMPROVATIVO PROVISÓRIO / NÃO FISCAL"));
    assert.ok(html.includes("AGUARDA VALIDAÇÃO CENTRAL"));
  });

  it("NUNCA deve declarar o comprovativo como documento fiscal homologado ou fatura definitiva", () => {
    const html = generateProvisionalReceiptHtml(mockReceiptData);

    assert.equal(html.includes("FATURA HOMOLOGADA"), false);
    assert.equal(html.includes("AGT-VALIDATED"), false);
    assert.equal(html.includes("HASH OFICIAL"), false);
    assert.equal(html.includes("QR FISCAL AGT"), false);
  });

  it("deve apresentar os dados de cabeçalho, linhas, totais e operador", () => {
    const html = generateProvisionalReceiptHtml(mockReceiptData);

    assert.ok(html.includes("Comércio Geral de Luanda Lda"));
    assert.ok(html.includes("Loja Kinaxixi"));
    assert.ok(html.includes("#01"));
    assert.ok(html.includes("PROV-TEST-999"));
    assert.ok(html.includes("Manuel Gonçalves"));
    assert.ok(html.includes("Arroz Agulha 1kg"));
  });
});
