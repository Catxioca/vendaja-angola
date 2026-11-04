import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileStockManager, Warehouse, StockBalance } from "./stock-manager";
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

const mockTenantA: TenantContext = {
  companyId: "emp-alfa",
  branchId: "branch-1",
  companyName: "Empresa Alfa Lda",
  branchName: "Sede",
  membershipId: "mem-1",
  role: "ADMIN",
  terminalId: "01",
  modules: ["STOCK"],
};

const mockWarehouses: Warehouse[] = [
  {
    id: "wh-1",
    companyId: "emp-alfa",
    branchId: "branch-1",
    code: "WH-CENTRAL",
    name: "Armazém Central",
    active: true,
    locations: [
      { id: "loc-1", warehouseId: "wh-1", code: "LOC-A1", name: "Corredor A1", active: true },
      { id: "loc-2", warehouseId: "wh-1", code: "LOC-A2", name: "Corredor A2", active: true },
    ],
  },
];

const mockBalances: StockBalance[] = [
  {
    id: "sb-1",
    locationId: "loc-1",
    productId: "prod-101",
    quantity: 45,
    updatedAt: new Date().toISOString(),
    product: {
      id: "prod-101",
      sku: "SKU-FARINHA",
      name: "Farinha de Trigo 1kg",
      priceCents: 120000,
      stock: 45,
      active: true,
    },
    location: {
      id: "loc-1",
      code: "LOC-A1",
      name: "Corredor A1",
      warehouse: {
        id: "wh-1",
        code: "WH-CENTRAL",
        name: "Armazém Central",
      },
    },
  },
];

describe("MobileStockManager", () => {
  let stock: MobileStockManager;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    stock = new MobileStockManager();
    globalThis.localStorage.setItem(
      "vendaja_warehouses_emp-alfa_branch-1",
      JSON.stringify(mockWarehouses)
    );
    globalThis.localStorage.setItem(
      "vendaja_stock_balances_emp-alfa_branch-1",
      JSON.stringify(mockBalances)
    );
  });

  it("deve carregar armazéns e saldos da cache segregada por tenant", () => {
    const warehouses = stock.loadCachedWarehouses("emp-alfa", "branch-1");
    assert.equal(warehouses.length, 1);
    assert.equal(warehouses[0]?.name, "Armazém Central");
    assert.equal(warehouses[0]?.locations.length, 2);

    const balances = stock.loadCachedBalances("emp-alfa", "branch-1");
    assert.equal(balances.length, 1);
    assert.equal(balances[0]?.quantity, 45);
    assert.equal(balances[0]?.product.name, "Farinha de Trigo 1kg");
  });

  it("não deve permitir carregar armazéns de outro tenant (cross-tenant)", () => {
    const warehousesBeta = stock.loadCachedWarehouses("emp-beta", "branch-99");
    assert.equal(warehousesBeta.length, 0);

    const balancesBeta = stock.loadCachedBalances("emp-beta", "branch-99");
    assert.equal(balancesBeta.length, 0);
  });

  it("deve impedir transferência se origem for igual ao destino", async () => {
    await assert.rejects(
      async () => {
        await stock.executeTransfer("http://localhost:3000", "tok", mockTenantA, {
          sourceLocationId: "loc-1",
          destinationLocationId: "loc-1",
          reference: "TRF-001",
          lines: [{ productId: "prod-101", quantity: 5 }],
        });
      },
      { message: /origem não pode ser idêntica/i }
    );
  });

  it("deve validar e submeter contagem de inventário físico", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 201,
        json: async () => ({ id: "inv-count-1", status: "COMPLETED", lines: [] }),
      } as unknown as Response);

    try {
      const res = await stock.submitInventoryCount("http://localhost:3000", "tok", mockTenantA, {
        locationId: "loc-1",
        reference: "INV-20261029-A",
        lines: [{ productId: "prod-101", countedQuantity: 50 }],
      });
      assert.equal(res.id, "inv-count-1");
      assert.equal(res.status, "COMPLETED");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve tratar erro 409 em transferência com stock insuficiente", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 409,
        json: async () => ({ error: "insufficient_stock" }),
      } as unknown as Response);

    try {
      await assert.rejects(
        async () => {
          await stock.executeTransfer("http://localhost:3000", "tok", mockTenantA, {
            sourceLocationId: "loc-1",
            destinationLocationId: "loc-2",
            reference: "TRF-002",
            lines: [{ productId: "prod-101", quantity: 9999 }],
          });
        },
        { message: /Stock insuficiente/i }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
