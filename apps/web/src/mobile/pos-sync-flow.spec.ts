import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileOutboxManager } from "./outbox-manager";
import { MobileCartManager } from "./cart-manager";
import type { TenantContext } from "./types";
import type { Product } from "@angola/shared";

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

const mockTenantA: TenantContext = {
  companyId: "empresa-alfa",
  branchId: "filial-1",
  companyName: "Empresa Alfa Lda",
  branchName: "Balcão Central",
  membershipId: "mem-a",
  role: "OPERATOR",
  terminalId: "TERM-01",
  modules: ["POS", "STOCK"],
};

const mockTenantB: TenantContext = {
  companyId: "empresa-beta",
  branchId: "filial-2",
  companyName: "Empresa Beta SA",
  membershipId: "mem-b",
  role: "OPERATOR",
  terminalId: "TERM-02",
  modules: ["POS"],
};

const mockProduct: Product = {
  id: "prod-item-1",
  sku: "ITEM-01",
  name: "Óleo Alimentar 1L",
  priceCents: 200000, // 2.000,00 Kz
  stock: 100,
  taxRate: 0.14,
  active: true,
};

describe("POS Offline & Sync Flow", () => {
  let outbox: MobileOutboxManager;
  let cart: MobileCartManager;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    outbox = new MobileOutboxManager();
    cart = new MobileCartManager();
  });

  it("deve enfileirar mutação de venda offline com segregação de tenant e idempotência", () => {
    cart.addProduct(mockProduct, 3);
    const plan = cart.buildPaymentPlan({
      paymentMethod: "CASH",
      tenderedCents: 1000000,
      cashSessionId: "session-xyz",
    });

    const idempotencyKey = "sale-idem-abc-123";
    const correlationId = "corr-term-1-999";

    const item = outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      idempotencyKey,
      correlationId,
      payload: {
        lines: cart.getLines(),
        payment: plan,
      },
      tenant: mockTenantA,
      userId: "user-op-1",
    });

    assert.equal(item.idempotencyKey, idempotencyKey);
    assert.equal(item.entity, "SALE");
    assert.equal(item.operation, "CREATE");
    assert.equal(item.state, "PENDING");
    assert.equal(item.companyId, "empresa-alfa");
    assert.equal(item.terminalId, "TERM-01");

    // Confirma que não é visível para Empresa Beta
    const itemsBeta = outbox.getItemsForTenant("empresa-beta");
    assert.equal(itemsBeta.length, 0);

    const itemsAlfa = outbox.getItemsForTenant("empresa-alfa");
    assert.equal(itemsAlfa.length, 1);
  });

  it("deve sincronizar com sucesso mutações pendentes ao conectar ao servidor", async () => {
    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      idempotencyKey: "sale-1",
      payload: { test: true },
      tenant: mockTenantA,
      userId: "user-1",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ id: "sale-1", status: "COMMITTED", fiscalNumber: "FR 2026/101" }],
        }),
      } as unknown as Response);

    try {
      const result = await outbox.syncPending("http://localhost:3000", "token-jwt", mockTenantA);

      assert.equal(result.sent, 1);
      assert.equal(result.failed, 0);

      const summary = outbox.getStatusSummary("empresa-alfa");
      assert.equal(summary.sent, 1);
      assert.equal(summary.pending, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("NUNCA deve eliminar mutações rejeitadas ou em conflito na falha de sincronização", async () => {
    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      idempotencyKey: "sale-reject-1",
      payload: { invalid: true },
      tenant: mockTenantA,
      userId: "user-1",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 422,
        json: async () => ({ error: "customer_inactive" }),
      } as unknown as Response);

    try {
      const result = await outbox.syncPending("http://localhost:3000", "token-jwt", mockTenantA);

      assert.equal(result.sent, 0);
      assert.equal(result.failed, 1);

      const summary = outbox.getStatusSummary("empresa-alfa");
      assert.equal(summary.rejected, 1);
      assert.equal(summary.total, 1); // Item preservado para diagnóstico e auditoria

      // Mutação deve poder ser recolocada na fila de retry
      const all = outbox.getAllDiagnostics("empresa-alfa");
      assert.equal(all[0]?.state, "REJECTED");
      assert.ok(all[0]?.errorSanitized);

      const retryRes = outbox.retryMutation(all[0]!.id, mockTenantA);
      assert.equal(retryRes.success, true);

      const afterRetry = outbox.getStatusSummary("empresa-alfa");
      assert.equal(afterRetry.pending, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve reutilizar exatamente a mesma chave de idempotência em retries e evitar duplicados na outbox", () => {
    const stableKey = "sale-mob-01-stable-uuid-999";

    const item1 = outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      idempotencyKey: stableKey,
      payload: { value: 100 },
      tenant: mockTenantA,
      userId: "user-1",
    });

    // Tentativa duplicada com a mesma chave
    const item2 = outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      idempotencyKey: stableKey,
      payload: { value: 100 },
      tenant: mockTenantA,
      userId: "user-1",
    });

    assert.equal(item1.id, item2.id);
    assert.equal(item1.idempotencyKey, stableKey);
    assert.equal(item2.idempotencyKey, stableKey);

    const queue = outbox.getItemsForTenant("empresa-alfa");
    assert.equal(queue.length, 1);
  });

  it("deve tratar timeout após envio e resposta duplicada (already_processed) confirmando como SENT sem duplicar a venda", async () => {
    const stableKey = "sale-mob-timeout-test";

    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      idempotencyKey: stableKey,
      payload: { saleData: true },
      tenant: mockTenantA,
      userId: "user-1",
    });

    // Simula resposta 409 do backend informando que a chave de idempotência já havia sido processada com sucesso
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 409,
        json: async () => ({
          error: "idempotent_replay",
          message: "Esta transação já foi processada anteriormente com sucesso.",
        }),
      } as unknown as Response);

    try {
      const result = await outbox.syncPending("http://localhost:3000", "token-jwt", mockTenantA);

      // Deve reconhecer que a transação foi consumida pelo backend e transitar para SENT
      assert.equal(result.sent, 1);
      assert.equal(result.failed, 0);

      const items = outbox.getItemsForTenant("empresa-alfa");
      const matched = items.find((i) => i.idempotencyKey === stableKey);
      assert.equal(matched?.state, "SENT");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve persistir e restaurar chave de idempotência e mutações após reinício da aplicação", () => {
    const stableKey = "sale-mob-restart-preserve";

    outbox.enqueueMutation({
      entity: "SALE",
      operation: "CREATE",
      idempotencyKey: stableKey,
      payload: { totalCents: 5000 },
      tenant: mockTenantA,
      userId: "user-1",
    });

    // Simula reinício instanciando um novo outbox manager que carrega do localStorage
    const freshOutbox = new MobileOutboxManager();
    const items = freshOutbox.getItemsForTenant("empresa-alfa");

    assert.equal(items.length, 1);
    assert.equal(items[0]?.idempotencyKey, stableKey);
    assert.equal(items[0]?.state, "PENDING");
  });
});
