import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileOutboxManager } from "./outbox-manager";
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

describe("MobileOutboxManager", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
  });

  const tenantA: TenantContext = {
    companyId: "comp-aaa-111",
    branchId: "branch-01",
    companyName: "Empresa A Lda",
    membershipId: "mem-01",
    role: "ROLE_CASHIER",
    terminalId: "01",
    modules: ["POS"],
  };

  const tenantB: TenantContext = {
    companyId: "comp-bbb-222",
    branchId: "branch-02",
    companyName: "Empresa B Lda",
    membershipId: "mem-02",
    role: "ROLE_CASHIER",
    terminalId: "02",
    modules: ["POS"],
  };

  it("deve enfileirar mutações com segregação de tenant e estado inicial PENDING", () => {
    const outbox = new MobileOutboxManager();
    const item = outbox.enqueue({
      entity: "SALE",
      operation: "CREATE",
      companyId: tenantA.companyId,
      branchId: tenantA.branchId!,
      userId: "usr-01",
      terminalId: "01",
      payload: { totalCents: 50000 },
    });

    assert.ok(item.id.startsWith("mob-"));
    assert.equal(item.state, "PENDING");
    assert.equal(item.companyId, tenantA.companyId);
    assert.equal(item.attempts, 0);

    const summary = outbox.getSummary(tenantA.companyId);
    assert.equal(summary.total, 1);
    assert.equal(summary.pending, 1);
  });

  it("deve impedir enfileiramento se dados mandatórios de tenant estiverem vazios", () => {
    const outbox = new MobileOutboxManager();
    assert.throws(() => {
      outbox.enqueue({
        entity: "SALE",
        operation: "CREATE",
        companyId: "",
        branchId: "",
        userId: "usr-01",
        terminalId: "01",
        payload: {},
      });
    }, /requerem companyId, userId e terminalId autorizados/);
  });

  it("deve isolar estritamente as mutações entre diferentes empresas", () => {
    const outbox = new MobileOutboxManager();
    outbox.enqueue({
      entity: "SALE",
      operation: "CREATE",
      companyId: tenantA.companyId,
      branchId: tenantA.branchId!,
      userId: "usr-01",
      terminalId: "01",
      payload: { sale: 1 },
    });

    outbox.enqueue({
      entity: "SALE",
      operation: "CREATE",
      companyId: tenantB.companyId,
      branchId: tenantB.branchId!,
      userId: "usr-02",
      terminalId: "02",
      payload: { sale: 2 },
    });

    const itemsA = outbox.getItemsForTenant(tenantA.companyId);
    assert.equal(itemsA.length, 1);
    assert.equal(itemsA[0]?.companyId, tenantA.companyId);

    const itemsB = outbox.getItemsForTenant(tenantB.companyId);
    assert.equal(itemsB.length, 1);
    assert.equal(itemsB[0]?.companyId, tenantB.companyId);
  });

  it("deve reter mutações REJECTED ou CONFLICT e sanitizar mensagens de erro", () => {
    const outbox = new MobileOutboxManager();
    const item = outbox.enqueue({
      entity: "SALE",
      operation: "CREATE",
      companyId: tenantA.companyId,
      branchId: tenantA.branchId!,
      userId: "usr-01",
      terminalId: "01",
      payload: { sale: 1 },
    });

    const rawSensitiveError = "Connection failed to postgresql://admin:secretPass123@db.prod.vendaja.ao with Bearer eyJhbGciOiJIUzI1Ni...";
    outbox.updateState(item.id, "REJECTED", rawSensitiveError);

    const items = outbox.getItemsForTenant(tenantA.companyId);
    assert.equal(items[0]?.state, "REJECTED");
    assert.ok(items[0]?.errorSanitized?.includes("[REDACTED]"), "Credenciais sensíveis devem ser mascaradas");
    assert.ok(!items[0]?.errorSanitized?.includes("secretPass123"), "Passwords não podem constar no log sanitizado");
    assert.ok(!items[0]?.errorSanitized?.includes("eyJhbGciOiJIUzI1Ni"), "Tokens JWT não podem constar em texto limpo");
  });

  it("deve bloquear tentativa de reprocessar mutação se o tenant ativo for diferente", () => {
    const outbox = new MobileOutboxManager();
    const item = outbox.enqueue({
      entity: "SALE",
      operation: "CREATE",
      companyId: tenantA.companyId,
      branchId: tenantA.branchId!,
      userId: "usr-01",
      terminalId: "01",
      payload: { sale: 1 },
    });

    outbox.updateState(item.id, "REJECTED", "Rejeição temporária");

    // Tentativa com tenantB
    const result = outbox.retryMutation(item.id, tenantB);
    assert.equal(result.success, false);
    assert.ok(result.message.includes("Bloqueado: mutação pertence à empresa"));

    // Tentativa válida com tenantA
    const validResult = outbox.retryMutation(item.id, tenantA);
    assert.equal(validResult.success, true);
    assert.equal(outbox.getItemsForTenant(tenantA.companyId)[0]?.state, "PENDING");
  });

  it("deve manter dados intactos após reinício da aplicação (recarregamento do storage)", () => {
    const outbox1 = new MobileOutboxManager();
    outbox1.enqueue({
      entity: "SALE",
      operation: "CREATE",
      companyId: tenantA.companyId,
      branchId: tenantA.branchId!,
      userId: "usr-01",
      terminalId: "01",
      payload: { test: true },
    });

    // Simula reinício da aplicação
    const outbox2 = new MobileOutboxManager();
    const loaded = outbox2.getItemsForTenant(tenantA.companyId);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]?.companyId, tenantA.companyId);
  });
});
