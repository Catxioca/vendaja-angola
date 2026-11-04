import type { TenantContext } from "./types";

export interface MobileSupplier {
  id: string;
  name: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  contactName?: string | null;
  active: boolean;
  code?: string | null;
  _count?: {
    purchases: number;
  };
}

export interface PurchaseLine {
  id: string;
  productId: string;
  quantity: number;
  unitCostCents: number;
  taxRate: number;
  totalCents: number;
  product?: {
    id: string;
    sku: string;
    name: string;
  };
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  status: "DRAFT" | "CONFIRMED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  paymentMethod: string;
  subtotalCents: number;
  totalCents: number;
  purchasedAt: string;
  notes?: string | null;
  documentNumber?: string | null;
  supplier: MobileSupplier;
  lines: PurchaseLine[];
}

export interface ReceiptLineInput {
  productId: string;
  quantity: number;
  lotNumber?: string;
  serialNumber?: string;
  expiresAt?: string;
}

export interface PurchaseReceiptInput {
  reference: string;
  locationId: string;
  lines: ReceiptLineInput[];
}

export class MobileSupplierManager {
  private suppliers: MobileSupplier[] = [];
  private purchases: PurchaseOrder[] = [];

  private getStorageKey(prefix: string, companyId: string, branchId?: string | null): string {
    return `vendaja_${prefix}_${companyId}_${branchId || "all"}`;
  }

  public getSuppliers(): MobileSupplier[] {
    return [...this.suppliers];
  }

  public getPurchases(): PurchaseOrder[] {
    return [...this.purchases];
  }

  /**
   * Sincroniza fornecedores da API.
   */
  public async syncSuppliers(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null,
    query?: string
  ): Promise<MobileSupplier[]> {
    const q = query ? `?q=${encodeURIComponent(query)}` : "";
    const res = await fetch(`${apiUrl}/api/v1/suppliers${q}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao obter fornecedores (HTTP ${res.status}).`);
    }

    const data: MobileSupplier[] = await res.json();
    this.suppliers = data;

    if (typeof localStorage !== "undefined" && !query) {
      localStorage.setItem(this.getStorageKey("suppliers", companyId, branchId), JSON.stringify(data));
    }
    return data;
  }

  /**
   * Sincroniza compras / encomendas a fornecedor.
   */
  public async syncPurchases(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null,
    supplierId?: string
  ): Promise<PurchaseOrder[]> {
    const q = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : "";
    const res = await fetch(`${apiUrl}/api/v1/purchases${q}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao carregar compras e encomendas (HTTP ${res.status}).`);
    }

    const data: PurchaseOrder[] = await res.json();
    this.purchases = data;

    if (typeof localStorage !== "undefined" && !supplierId) {
      localStorage.setItem(this.getStorageKey("purchases", companyId, branchId), JSON.stringify(data));
    }
    return data;
  }

  /**
   * Carrega fornecedores da cache local.
   */
  public loadCachedSuppliers(companyId: string, branchId?: string | null): MobileSupplier[] {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(this.getStorageKey("suppliers", companyId, branchId));
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          this.suppliers = parsed;
          return parsed;
        } catch {
          // ignore corrupted data
        }
      }
    }
    this.suppliers = [];
    return [];
  }

  /**
   * Carrega compras da cache local.
   */
  public loadCachedPurchases(companyId: string, branchId?: string | null): PurchaseOrder[] {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(this.getStorageKey("purchases", companyId, branchId));
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          this.purchases = parsed;
          return parsed;
        } catch {
          // ignore corrupted data
        }
      }
    }
    this.purchases = [];
    return [];
  }

  /**
   * Regista receção touch de mercadorias no armazém com conferência de quantidades.
   */
  public async receivePurchase(
    apiUrl: string,
    token: string,
    tenant: TenantContext,
    purchaseId: string,
    receipt: PurchaseReceiptInput
  ): Promise<any> {
    if (receipt.lines.length === 0) {
      throw new Error("A receção requer pelo menos um item com quantidade conferida.");
    }

    const res = await fetch(`${apiUrl}/api/v1/purchases/${purchaseId}/receipts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": tenant.companyId,
        ...(tenant.branchId ? { "x-branch-id": tenant.branchId } : {}),
      },
      body: JSON.stringify(receipt),
    });

    if (res.status === 409) {
      throw new Error("A quantidade indicada excede a quantidade pendente da encomenda.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
    }

    return await res.json();
  }
}
