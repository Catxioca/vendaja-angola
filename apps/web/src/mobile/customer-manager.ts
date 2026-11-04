import type { TenantContext } from "./types";

export interface MobileCustomer {
  id: string;
  name: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  active: boolean;
  creditLimitCents: number;
  outstandingDebtCents: number;
  status?: string;
  totalInvoicedCents?: number;
  totalPaidCents?: number;
}

export interface CustomerCreateInput {
  name: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  creditLimitCents?: number;
}

export interface CustomerPaymentInput {
  amountCents: number;
  paymentMethod: "CASH" | "CARD" | "TRANSFER";
  idempotencyKey: string;
  cashSessionId?: string | null;
  reference?: string | null;
  note?: string | null;
}

export class MobileCustomerManager {
  private customers: MobileCustomer[] = [];
  private receivables: MobileCustomer[] = [];

  private getStorageKey(companyId: string, branchId?: string | null): string {
    return `vendaja_customers_${companyId}_${branchId || "all"}`;
  }

  public getCustomers(): MobileCustomer[] {
    return [...this.customers];
  }

  public getReceivables(): MobileCustomer[] {
    return [...this.receivables];
  }

  /**
   * Sincroniza lista de clientes do backend com pesquisa textual.
   */
  public async syncCustomers(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null,
    searchQuery?: string
  ): Promise<MobileCustomer[]> {
    const q = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
    const res = await fetch(`${apiUrl}/api/v1/customers${q}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao obter clientes do servidor (HTTP ${res.status}).`);
    }

    const data: MobileCustomer[] = await res.json();
    this.customers = data;

    if (typeof localStorage !== "undefined" && !searchQuery) {
      localStorage.setItem(this.getStorageKey(companyId, branchId), JSON.stringify(data));
    }
    return data;
  }

  /**
   * Consulta clientes com saldo devedor e contas correntes abertas.
   */
  public async syncReceivables(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<MobileCustomer[]> {
    const res = await fetch(`${apiUrl}/api/v1/customers/receivables`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao obter contas correntes de clientes (HTTP ${res.status}).`);
    }

    const data: MobileCustomer[] = await res.json();
    this.receivables = data;
    return data;
  }

  /**
   * Carrega clientes da cache local segregada por tenant.
   */
  public loadCachedCustomers(companyId: string, branchId?: string | null): MobileCustomer[] {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(this.getStorageKey(companyId, branchId));
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          this.customers = parsed;
          return parsed;
        } catch {
          // ignore corrupted data
        }
      }
    }
    this.customers = [];
    return [];
  }

  /**
   * Cria novo cliente no servidor online.
   */
  public async createCustomer(
    apiUrl: string,
    token: string,
    tenant: TenantContext,
    input: CustomerCreateInput
  ): Promise<MobileCustomer> {
    if (!input.name.trim()) {
      throw new Error("O nome do cliente é obrigatório.");
    }

    const res = await fetch(`${apiUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": tenant.companyId,
        ...(tenant.branchId ? { "x-branch-id": tenant.branchId } : {}),
      },
      body: JSON.stringify(input),
    });

    if (res.status === 409) {
      throw new Error("Já existe um cliente registado com este NIF.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
    }

    const created: MobileCustomer = await res.json();
    this.customers = [created, ...this.customers];
    return created;
  }

  /**
   * Regista liquidação / pagamento de conta corrente de cliente.
   */
  public async recordCustomerPayment(
    apiUrl: string,
    token: string,
    tenant: TenantContext,
    customerId: string,
    payment: CustomerPaymentInput
  ): Promise<any> {
    if (payment.amountCents <= 0) {
      throw new Error("O valor de pagamento deve ser superior a zero.");
    }

    const res = await fetch(`${apiUrl}/api/v1/customers/${customerId}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": tenant.companyId,
        ...(tenant.branchId ? { "x-branch-id": tenant.branchId } : {}),
      },
      body: JSON.stringify(payment),
    });

    if (res.status === 409) {
      throw new Error("O valor do pagamento excede a dívida pendente do cliente.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
    }

    return await res.json();
  }
}
