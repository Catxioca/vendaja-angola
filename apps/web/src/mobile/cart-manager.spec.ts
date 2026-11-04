import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileCartManager } from "./cart-manager";
import type { Product } from "@angola/shared";

const mockProductA: Product = {
  id: "prod-a",
  sku: "SKU-A",
  name: "Produto Geral 14%",
  priceCents: 100000, // 1.000,00 Kz
  stock: 50,
  taxRate: 0.14,
  active: true,
};

const mockProductB: Product = {
  id: "prod-b",
  sku: "SKU-B",
  name: "Produto Isento M02",
  priceCents: 200000, // 2.000,00 Kz
  stock: 20,
  taxRate: 0,
  exemptionCode: "M02",
  active: true,
};

const mockProductNoTax: Product = {
  id: "prod-c",
  sku: "SKU-C",
  name: "Produto Sem Politica Definida",
  priceCents: 300000, // 3.000,00 Kz
  stock: 15,
  taxRate: undefined as any, // Sem taxa sincronizada
  active: true,
};

const mockProductReducedTax: Product = {
  id: "prod-d",
  sku: "SKU-D",
  name: "Produto Taxa Reduzida 5%",
  priceCents: 100000, // 1.000,00 Kz
  stock: 40,
  taxRate: 0.05,
  active: true,
};

describe("MobileCartManager", () => {
  let cart: MobileCartManager;

  beforeEach(() => {
    cart = new MobileCartManager();
  });

  it("deve adicionar produtos e calcular totais indicativos", () => {
    cart.addProduct(mockProductA, 2); // 2 x 1.000 = 2.000 Kz
    cart.addProduct(mockProductB, 1); // 1 x 2.000 = 2.000 Kz

    const totals = cart.calculateTotals();
    assert.equal(totals.itemCount, 3);
    assert.equal(totals.subtotalCents, 400000); // 4.000,00 Kz
    // Prod A: 2.000 * 0.14 = 280 Kz. Prod B: isento = 0.
    assert.equal(totals.taxCents, 28000); // 280,00 Kz
    assert.equal(totals.totalCents, 428000); // 4.280,00 Kz
    assert.equal(totals.hasTaxPolicy, true);
  });

  it("apresenta 'impostos sujeitos a validação central' e 'Total provisório sujeito a validação central' quando a política fiscal não estiver disponível offline", () => {
    cart.addProduct(mockProductNoTax, 1);

    const totals = cart.calculateTotals();
    assert.equal(totals.hasTaxPolicy, false);
    assert.match(totals.taxNotice || "", /impostos sujeitos a validação central/i);
    assert.match(totals.taxNotice || "", /taxCents=0 não é imposto final/i);
    assert.equal(totals.totalNotice, "Total provisório sujeito a validação central");
    // Não inventa taxa nem assume 14%; taxCents=0 é apenas provisório
    assert.equal(totals.taxCents, 0);
    assert.equal(totals.totalCents, 300000);

    const plan = cart.buildPaymentPlan({
      paymentMethod: "CASH",
      tenderedCents: 300000,
    });
    assert.equal(plan.hasTaxPolicy, false);
    assert.equal(plan.totalNotice, "Total provisório sujeito a validação central");
    assert.match(plan.taxNotice || "", /taxCents=0 não é imposto final/i);
  });

  it("aplica taxas configuráveis sincronizadas por produto (ex: taxa reduzida 5% e isenção 0%)", () => {
    cart.addProduct(mockProductReducedTax, 2); // 2 x 1.000 = 2.000 Kz * 0.05 = 100 Kz
    cart.addProduct(mockProductB, 1); // Isento = 0 Kz

    const totals = cart.calculateTotals();
    assert.equal(totals.subtotalCents, 400000);
    assert.equal(totals.taxCents, 10000); // 100,00 Kz
    assert.equal(totals.totalCents, 410000); // 4.100,00 Kz
    assert.equal(totals.hasTaxPolicy, true);
  });

  it("cria e preserva a mesma chave de idempotência estável desde a abertura da venda", () => {
    const key1 = cart.getOrCreateSaleIdempotencyKey("TERM-01");
    assert.ok(key1.startsWith("sale-mob-TERM-01-"));

    cart.addProduct(mockProductA, 1);

    // Mesma chave deve ser mantida
    const key2 = cart.getOrCreateSaleIdempotencyKey("TERM-01");
    assert.equal(key1, key2);

    const plan = cart.buildPaymentPlan({
      paymentMethod: "CASH",
      tenderedCents: 200000,
    });

    assert.equal(plan.idempotencyKey, key1);

    // Após limpeza do carrinho, uma nova chave será gerada para a próxima venda
    cart.clear();
    const key3 = cart.getOrCreateSaleIdempotencyKey("TERM-01");
    assert.notEqual(key1, key3);
  });

  it("deve incrementar quantidade ao adicionar o mesmo produto", () => {
    cart.addProduct(mockProductA, 1);
    cart.addProduct(mockProductA, 3);

    const lines = cart.getLines();
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.quantity, 4);
    assert.equal(lines[0]?.lineTotalCents, 400000);
  });

  it("deve atualizar quantidade e remover item se quantidade for zero", () => {
    cart.addProduct(mockProductA, 2);
    cart.updateLineQuantity("prod-a", 5);
    assert.equal(cart.getLines()[0]?.quantity, 5);

    cart.updateLineQuantity("prod-a", 0);
    assert.equal(cart.getLines().length, 0);
  });

  it("deve calcular troco corretamente para pagamento em dinheiro (CASH)", () => {
    cart.addProduct(mockProductA, 1); // Total com IVA = 1.140,00 Kz (114000 cents)
    const totals = cart.calculateTotals();

    const plan = cart.buildPaymentPlan({
      paymentMethod: "CASH",
      tenderedCents: 200000, // Entregou 2.000,00 Kz
      cashSessionId: "session-123",
    });

    assert.equal(plan.paymentMethod, "CASH");
    assert.equal(plan.tenderedCents, 200000);
    assert.equal(plan.totalCents, totals.totalCents);
    assert.equal(plan.changeCents, 200000 - totals.totalCents);
    assert.equal(plan.fiscalType, "INVOICE_RECEIPT");
  });

  it("deve validar requisitos estritos de venda a crédito (CREDIT)", () => {
    cart.addProduct(mockProductA, 1);

    // Sem cliente associado deve lançar erro
    assert.throws(
      () => {
        cart.buildPaymentPlan({
          paymentMethod: "CREDIT",
          dueDate: "2026-12-31",
        });
      },
      { message: /cliente registado/i }
    );

    // Com cliente mas sem data de vencimento deve lançar erro
    cart.setCustomer({
      id: "cust-1",
      name: "Empresa Cliente Lda",
      nif: "5001234567",
    });

    assert.throws(
      () => {
        cart.buildPaymentPlan({
          paymentMethod: "CREDIT",
          dueDate: null,
        });
      },
      { message: /data de vencimento/i }
    );

    // Com cliente e data futura deve gerar plano com FT (INVOICE)
    const validPlan = cart.buildPaymentPlan({
      paymentMethod: "CREDIT",
      dueDate: "2026-12-31",
    });

    assert.equal(validPlan.fiscalType, "INVOICE");
    assert.equal(validPlan.customer?.name, "Empresa Cliente Lda");
  });

  it("deve limpar carrinho com segurança", () => {
    cart.addProduct(mockProductA, 2);
    cart.setCustomer({ id: "c1", name: "Cliente" });
    cart.clear();

    assert.equal(cart.getLines().length, 0);
    assert.equal(cart.getCustomer(), null);
    assert.equal(cart.calculateTotals().totalCents, 0);
  });
});
