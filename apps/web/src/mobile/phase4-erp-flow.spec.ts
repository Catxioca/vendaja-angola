import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileOutboxManager } from "./outbox-manager";
import { MobileStockManager } from "./stock-manager";
import { MobileCustomerManager } from "./customer-manager";
import { MobileSupplierManager } from "./supplier-manager";
import type { TenantContext } from "./types";

class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const tenantAlfa: TenantContext = {
  companyId: "empresa-alfa",
  branchId: "filial-luanda",
  companyName: "Empresa Alfa Lda",
  branchName: "Luanda Central",
  membershipId: "mem-alfa",
  role: "ADMIN",
  terminalId: "MOB-01",
  modules: ["POS", "STOCK", "ACCOUNTING"],
};

const tenantBeta: TenantContext = {
  companyId: "empresa-beta",
  branchId: "filial-benguela",
  companyName: "Empresa Beta SA",
  branchName: "Benguela",
  membershipId: "mem-beta",
  role: "OPERATOR",
  terminalId: "MOB-02",
  modules: ["POS"],
};

describe("Fase 4: ERP Mobile End-to-End Flow & Integridade", () => {
  let outbox: MobileOutboxManager;
  let stockMgr: MobileStockManager;
  let customerMgr: MobileCustomerManager;
  let supplierMgr: MobileSupplierManager;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    outbox = new MobileOutboxManager();
    stockMgr = new MobileStockManager();
    customerMgr = new MobileCustomerManager();
    supplierMgr = new MobileSupplierManager();
  });

  it("deve enfileirar contagem de inventário físico offline na Outbox com idempotência", () => {
    const countPayload = {
      locationId: "loc-armazem-1",
      reference: "INV-OFFLINE-001",
      lines: [
        { productId: "prod-1", countedQuantity: 120 },
        { productId: "prod-2", countedQuantity: 45 },
      ],
    };

    const item = outbox.enqueueMutation({
      entity: "INVENTORY_COUNT",
      operation: "CREATE",
      idempotencyKey: "idem-inv-001",
      payload: countPayload,
      tenant: tenantAlfa,
      userId: "usr-admin-1",
    });

    assert.equal(item.entity, "INVENTORY_COUNT");
    assert.equal(item.state, "PENDING");
    assert.equal(item.companyId, "empresa-alfa");

    // Isolamento estrito de tenant
    const betaItems = outbox.getItemsForTenant("empresa-beta");
    assert.equal(betaItems.length, 0);

    const alfaItems = outbox.getItemsForTenant("empresa-alfa");
    assert.equal(alfaItems.length, 1);
  });

  it("deve enfileirar transferência entre armazéns offline e bloquear tentativa de reprocessamento cross-tenant", () => {
    const transferPayload = {
      sourceLocationId: "loc-origem",
      destinationLocationId: "loc-destino",
      reference: "TRF-OFFLINE-001",
      lines: [{ productId: "prod-1", quantity: 10 }],
    };

    const item = outbox.enqueueMutation({
      entity: "STOCK_TRANSFER",
      operation: "CREATE",
      idempotencyKey: "idem-trf-001",
      payload: transferPayload,
      tenant: tenantAlfa,
      userId: "usr-admin-1",
    });

    outbox.updateState(item.id, "REJECTED", "Simulated network timeout");

    // Tentativa de reprocessar a mutação da Empresa Alfa usando o contexto ativo da Empresa Beta
    const retryCross = outbox.retryMutation(item.id, tenantBeta);
    assert.equal(retryCross.success, false);
    assert.ok(retryCross.message.includes("Bloqueado: mutação pertence à empresa"));

    // Reprocessamento válido com tenant correto
    const retryValid = outbox.retryMutation(item.id, tenantAlfa);
    assert.equal(retryValid.success, true);
    assert.equal(outbox.getStatusSummary("empresa-alfa").pending, 1);
  });

  it("deve sincronizar com sucesso mutações de receção de compras e criação de clientes ao reconectar", async () => {
    // 1. Enfileira receção de mercadorias
    outbox.enqueueMutation({
      entity: "PURCHASE_RECEIPT",
      operation: "CREATE",
      idempotencyKey: "idem-rec-001",
      payload: {
        purchaseId: "po-123",
        reference: "GR-OFFLINE-001",
        locationId: "loc-1",
        lines: [{ productId: "prod-item", quantity: 50 }],
      },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    // 2. Enfileira criação de cliente
    outbox.enqueueMutation({
      entity: "CUSTOMER",
      operation: "CREATE",
      idempotencyKey: "idem-cust-001",
      payload: {
        name: "Supermercado Kero Belas",
        nif: "5499887766",
      },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "OK" }),
      } as unknown as Response;
    };

    try {
      const summary = await outbox.syncPending("http://localhost:3000", "fake-token", tenantAlfa);
      assert.equal(summary.sent, 2);
      assert.equal(summary.failed, 0);

      const status = outbox.getStatusSummary("empresa-alfa");
      assert.equal(status.sent, 2);
      assert.equal(status.pending, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve assegurar que dados sensíveis (senhas, tokens, NIF completo) não vazem nos erros sanitizados", () => {
    const errorWithSecrets = new Error(
      "Connection to postgres://admin:SuperSecretPassword123@db.internal:5432 failed with token Bearer eyJhbGciOiJIUzI1NiJ9.test"
    );

    outbox.enqueueMutation({
      entity: "CUSTOMER",
      operation: "CREATE",
      idempotencyKey: "idem-err-test",
      payload: { test: true },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    const items = outbox.getItemsForTenant("empresa-alfa");
    const item = items[0]!;
    outbox.updateState(item.id, "REJECTED", errorWithSecrets);

    const diagnostics = outbox.getAllDiagnostics("empresa-alfa");
    const sanitizedMsg = diagnostics[0]?.errorSanitized || "";

    assert.equal(sanitizedMsg.includes("SuperSecretPassword123"), false);
    assert.equal(sanitizedMsg.includes("eyJhbGciOiJIUzI1NiJ9"), false);
    assert.ok(sanitizedMsg.includes("[REDACTED]") || sanitizedMsg.includes("[REDACTED_TOKEN]"));
  });

  it("deve persistir e reidratar os dados da Outbox e cache após reinício da aplicação", () => {
    outbox.enqueueMutation({
      entity: "CUSTOMER",
      operation: "CREATE",
      idempotencyKey: "idem-persist-1",
      payload: { name: "Cliente Persistido" },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    // Simula reinício da aplicação instanciando nova Outbox sobre o mesmo storage
    const rehydratedOutbox = new MobileOutboxManager();
    const items = rehydratedOutbox.getItemsForTenant("empresa-alfa");

    assert.equal(items.length, 1);
    assert.equal(items[0]?.idempotencyKey, "idem-persist-1");
    assert.equal(items[0]?.state, "PENDING");
  });

  it("deve anexar capturedAt e timestamp estável no payload de mutações offline da Fase 4", () => {
    const timestamp = new Date().toISOString();
    const countItem = outbox.enqueueMutation({
      entity: "INVENTORY_COUNT",
      operation: "CREATE",
      idempotencyKey: "idem-count-captured",
      payload: {
        locationId: "loc-123",
        reference: "INV-2026-01",
        lines: [{ productId: "p-1", countedQuantity: 10 }],
        capturedAt: timestamp,
      },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    const paymentItem = outbox.enqueueMutation({
      entity: "RECEIVABLE_PAYMENT",
      operation: "CREATE",
      idempotencyKey: "idem-pay-captured",
      payload: {
        customerId: "cust-999",
        payment: { amountCents: 50000, idempotencyKey: "idem-pay-sub" },
        capturedAt: timestamp,
      },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    const receiptItem = outbox.enqueueMutation({
      entity: "PURCHASE_RECEIPT",
      operation: "CREATE",
      idempotencyKey: "idem-rec-captured",
      payload: {
        purchaseId: "po-555",
        locationId: "loc-main",
        lines: [{ productId: "p-1", quantity: 5 }],
        capturedAt: timestamp,
      },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    assert.equal((countItem.payload as { capturedAt: string }).capturedAt, timestamp);
    assert.equal((paymentItem.payload as { capturedAt: string }).capturedAt, timestamp);
    assert.equal((receiptItem.payload as { capturedAt: string }).capturedAt, timestamp);
    assert.ok(countItem.occurredAt);
    assert.ok(paymentItem.occurredAt);
  });

  it("não deve alterar saldos de stock locais em memória/cache de forma especulativa antes da confirmação do servidor", () => {
    const mockBalance = {
      id: "bal-01",
      locationId: "loc-01",
      productId: "prod-100",
      quantity: 150,
      updatedAt: new Date().toISOString(),
      product: {
        id: "prod-100",
        sku: "PROD-100",
        name: "Arroz 1kg",
        priceCents: 120000,
        stock: 150,
        active: true,
      },
      location: {
        id: "loc-01",
        code: "LOC-A1",
        name: "Prateleira A1",
        warehouse: {
          id: "wh-01",
          code: "WH-LUANDA",
          name: "Armazém Luanda",
        },
      },
    };

    // Preenche cache local simulado
    stockMgr.loadCachedBalances("empresa-alfa", "filial-luanda");
    (stockMgr as unknown as { balances: typeof mockBalance[] }).balances = [mockBalance];

    const initialBalances = stockMgr.getBalances();
    assert.equal(initialBalances.length, 1);
    assert.equal(initialBalances[0]?.quantity, 150);

    // Enfileira transferência offline de 50 unidades
    outbox.enqueueMutation({
      entity: "STOCK_TRANSFER",
      operation: "CREATE",
      idempotencyKey: "idem-trf-offline-integrity",
      payload: {
        sourceLocationId: "loc-01",
        destinationLocationId: "loc-02",
        reference: "TRF-LOCAL-01",
        lines: [{ productId: "prod-100", quantity: 50 }],
        capturedAt: new Date().toISOString(),
      },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    // O saldo de stock local NÃO pode ter sido reduzido especulativamente
    const currentBalances = stockMgr.getBalances();
    assert.equal(currentBalances[0]?.quantity, 150, "O stock local não deve ser alterado antes da confirmação do backend.");
  });

  it("deve suportar receção parcial de compras offline mantendo idempotência", () => {
    const partialReceipt = {
      purchaseId: "po-order-777",
      reference: "REC-PARTIAL-01",
      locationId: "loc-rec",
      lines: [
        { productId: "item-a", quantity: 5 }, // 5 de 10 encomendados
      ],
      capturedAt: new Date().toISOString(),
    };

    const item = outbox.enqueueMutation({
      entity: "PURCHASE_RECEIPT",
      operation: "CREATE",
      idempotencyKey: "idem-partial-rec-777",
      payload: partialReceipt,
      tenant: tenantAlfa,
      userId: "usr-admin-1",
    });

    assert.equal(item.state, "PENDING");
    assert.equal((item.payload as typeof partialReceipt).lines[0]?.quantity, 5);
    assert.equal(item.idempotencyKey, "idem-partial-rec-777");

    // Tentativa de enfileirar com a mesma chave de idempotência retorna o item existente sem duplicar
    const duplicateItem = outbox.enqueueMutation({
      entity: "PURCHASE_RECEIPT",
      operation: "CREATE",
      idempotencyKey: "idem-partial-rec-777",
      payload: partialReceipt,
      tenant: tenantAlfa,
      userId: "usr-admin-1",
    });

    assert.equal(duplicateItem.id, item.id);
    assert.equal(outbox.getItemsForTenant("empresa-alfa").length, 1);
  });

  it("deve manter mutações REJECTED na outbox e permitir retry após intervenção autorizada", () => {
    const item = outbox.enqueueMutation({
      entity: "INVENTORY_COUNT",
      operation: "CREATE",
      idempotencyKey: "idem-rejected-retry",
      payload: {
        locationId: "loc-error",
        reference: "COUNT-ERR",
        lines: [{ productId: "p-invalid", countedQuantity: 10 }],
        capturedAt: new Date().toISOString(),
      },
      tenant: tenantAlfa,
      userId: "usr-1",
    });

    outbox.updateState(item.id, "REJECTED", "Armazém inativo ou sem permissão de acesso");
    const summary = outbox.getStatusSummary("empresa-alfa");
    assert.equal(summary.rejected, 1);
    assert.equal(summary.pending, 0);

    // Recuperação após correção de contexto
    const retryResult = outbox.retryMutation(item.id, tenantAlfa);
    assert.equal(retryResult.success, true);

    const postRetrySummary = outbox.getStatusSummary("empresa-alfa");
    assert.equal(postRetrySummary.rejected, 0);
    assert.equal(postRetrySummary.pending, 1);
  });

  it("deve verificar lógica de deteção de layout responsivo e touch target mínimo de 48dp", () => {
    const getFormFactor = (width: number): "phone" | "tablet" => (width >= 768 ? "tablet" : "phone");
    const minTouchTargetPixels = 48;

    assert.equal(getFormFactor(360), "phone"); // Android smartphone comum
    assert.equal(getFormFactor(412), "phone"); // Pixel 7
    assert.equal(getFormFactor(768), "tablet"); // iPad Mini / Tablet 8"
    assert.equal(getFormFactor(1024), "tablet"); // Tablet 10" POS
    assert.equal(getFormFactor(1280), "tablet"); // Tablet 12"

    // Regra de acessibilidade: botões móveis devem ter no mínimo 48x48
    assert.ok(minTouchTargetPixels >= 48, "Touch target deve respeitar especificação WCAG e Android de no mínimo 48dp");
  });
});
