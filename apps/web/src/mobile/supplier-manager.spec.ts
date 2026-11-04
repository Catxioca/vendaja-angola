import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileSupplierManager, MobileSupplier, PurchaseOrder } from "./supplier-manager";
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

const mockTenant: TenantContext = {
  companyId: "emp-alfa",
  branchId: "branch-1",
  companyName: "Empresa Alfa Lda",
  branchName: "Sede",
  membershipId: "mem-1",
  role: "ADMIN",
  terminalId: "01",
  modules: ["STOCK"],
};

const mockSuppliers: MobileSupplier[] = [
  {
    id: "sup-1",
    name: "Distribuidora Nacional de Bebidas Lda",
    nif: "5401122334",
    phone: "+244923999888",
    active: true,
    code: "SUP-DNB",
  },
];

const mockPurchases: PurchaseOrder[] = [
  {
    id: "purch-1",
    number: "PO-2026-001",
    supplierId: "sup-1",
    status: "CONFIRMED",
    paymentMethod: "TRANSFER",
    subtotalCents: 5000000,
    totalCents: 5700000,
    purchasedAt: new Date().toISOString(),
    supplier: mockSuppliers[0]!,
    lines: [
      {
        id: "pline-1",
        productId: "prod-item-1",
        quantity: 100,
        unitCostCents: 50000,
        taxRate: 0.14,
        totalCents: 5700000,
        product: {
          id: "prod-item-1",
          sku: "BEB-CUCA",
          name: "Cerveja Cuca 33cl",
        },
      },
    ],
  },
];

describe("MobileSupplierManager", () => {
  let supplierMgr: MobileSupplierManager;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    supplierMgr = new MobileSupplierManager();
    globalThis.localStorage.setItem(
      "vendaja_suppliers_emp-alfa_branch-1",
      JSON.stringify(mockSuppliers)
    );
    globalThis.localStorage.setItem(
      "vendaja_purchases_emp-alfa_branch-1",
      JSON.stringify(mockPurchases)
    );
  });

  it("deve carregar fornecedores e compras da cache com isolamento por empresa", () => {
    const suppliers = supplierMgr.loadCachedSuppliers("emp-alfa", "branch-1");
    assert.equal(suppliers.length, 1);
    assert.equal(suppliers[0]?.name, "Distribuidora Nacional de Bebidas Lda");

    const purchases = supplierMgr.loadCachedPurchases("emp-alfa", "branch-1");
    assert.equal(purchases.length, 1);
    assert.equal(purchases[0]?.number, "PO-2026-001");
    assert.equal(purchases[0]?.lines[0]?.quantity, 100);

    const cross = supplierMgr.loadCachedSuppliers("emp-beta", "branch-99");
    assert.equal(cross.length, 0);
  });

  it("deve efetuar receção parcial de mercadorias com conferência física", async () => {
    const receiptResult = {
      id: "rec-1",
      reference: "GR-001",
      lines: [{ productId: "prod-item-1", quantity: 60 }],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 201,
        json: async () => receiptResult,
      } as unknown as Response);

    try {
      const res = await supplierMgr.receivePurchase(
        "http://localhost:3000",
        "tok",
        mockTenant,
        "purch-1",
        {
          reference: "GR-001",
          locationId: "loc-1",
          lines: [{ productId: "prod-item-1", quantity: 60, lotNumber: "LOTE-2026A" }],
        }
      );

      assert.equal(res.id, "rec-1");
      assert.equal(res.lines[0]?.quantity, 60);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve tratar erro 409 quando a quantidade recebida excede a encomendada", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 409,
        json: async () => ({ error: "receipt_exceeds_ordered" }),
      } as unknown as Response);

    try {
      await assert.rejects(
        async () => {
          await supplierMgr.receivePurchase(
            "http://localhost:3000",
            "tok",
            mockTenant,
            "purch-1",
            {
              reference: "GR-FAIL",
              locationId: "loc-1",
              lines: [{ productId: "prod-item-1", quantity: 500 }],
            }
          );
        },
        { message: /excede a quantidade pendente/i }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
