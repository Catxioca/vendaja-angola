import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileCustomerManager, MobileCustomer } from "./customer-manager";
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
  role: "OPERATOR",
  terminalId: "01",
  modules: ["POS", "STOCK"],
};

const mockCustomers: MobileCustomer[] = [
  {
    id: "cust-1",
    name: "Comercial do Bengo Lda",
    nif: "5412345678",
    phone: "+244923000111",
    email: "contato@bengo.ao",
    active: true,
    creditLimitCents: 5000000, // 50.000,00 Kz
    outstandingDebtCents: 1500000, // 15.000,00 Kz
    status: "PARCIAL",
  },
  {
    id: "cust-2",
    name: "Padaria Luanda Central",
    nif: "5498765432",
    phone: "+244923000222",
    active: true,
    creditLimitCents: 10000000,
    outstandingDebtCents: 0,
    status: "REGULAR",
  },
];

describe("MobileCustomerManager", () => {
  let customerMgr: MobileCustomerManager;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    customerMgr = new MobileCustomerManager();
    globalThis.localStorage.setItem(
      "vendaja_customers_emp-alfa_branch-1",
      JSON.stringify(mockCustomers)
    );
  });

  it("deve carregar clientes da cache com isolamento por tenant", () => {
    const loaded = customerMgr.loadCachedCustomers("emp-alfa", "branch-1");
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0]?.name, "Comercial do Bengo Lda");
    assert.equal(loaded[0]?.outstandingDebtCents, 1500000);

    const cross = customerMgr.loadCachedCustomers("emp-outro", "branch-99");
    assert.equal(cross.length, 0);
  });

  it("deve criar novo cliente com sucesso online", async () => {
    const newCust: MobileCustomer = {
      id: "cust-novo-3",
      name: "Restaurante Ilha de Luanda",
      nif: "5400011223",
      active: true,
      creditLimitCents: 2000000,
      outstandingDebtCents: 0,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 201,
        json: async () => newCust,
      } as unknown as Response);

    try {
      const created = await customerMgr.createCustomer("http://localhost:3000", "tok", mockTenant, {
        name: "Restaurante Ilha de Luanda",
        nif: "5400011223",
        creditLimitCents: 2000000,
      });

      assert.equal(created.id, "cust-novo-3");
      assert.equal(created.name, "Restaurante Ilha de Luanda");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve liquidar pagamento de conta corrente com validação de montante", async () => {
    const paymentResult = {
      id: "pay-1",
      amountCents: 500000, // 5.000 Kz
      paymentMethod: "CASH",
      idempotencyKey: "idem-pay-1",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 201,
        json: async () => paymentResult,
      } as unknown as Response);

    try {
      const res = await customerMgr.recordCustomerPayment(
        "http://localhost:3000",
        "tok",
        mockTenant,
        "cust-1",
        {
          amountCents: 500000,
          paymentMethod: "CASH",
          idempotencyKey: "idem-pay-1",
        }
      );

      assert.equal(res.id, "pay-1");
      assert.equal(res.amountCents, 500000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve rejeitar pagamento com valor zero ou negativo", async () => {
    await assert.rejects(
      async () => {
        await customerMgr.recordCustomerPayment(
          "http://localhost:3000",
          "tok",
          mockTenant,
          "cust-1",
          {
            amountCents: 0,
            paymentMethod: "CASH",
            idempotencyKey: "idem-fail",
          }
        );
      },
      { message: /superior a zero/i }
    );
  });
});
