import type { TenantContext } from "./types";

export interface StockLocation {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  active: boolean;
  _count?: {
    balances: number;
  };
}

export interface Warehouse {
  id: string;
  companyId: string;
  branchId?: string | null;
  code: string;
  name: string;
  active: boolean;
  locations: StockLocation[];
}

export interface StockBalance {
  id: string;
  locationId: string;
  productId: string;
  quantity: number;
  updatedAt: string;
  product: {
    id: string;
    sku: string;
    name: string;
    priceCents: number;
    stock: number;
    active: boolean;
    barcode?: string | null;
    categoryId?: string | null;
  };
  location: {
    id: string;
    code: string;
    name: string;
    warehouse: {
      id: string;
      code: string;
      name: string;
    };
  };
}

export interface ReorderSuggestion {
  productId: string;
  sku: string;
  name: string;
  currentStock: number;
  minStock: number;
  maxStock?: number | null;
  suggestedQuantity: number;
  locations: Array<{
    id: string;
    locationId: string;
    quantity: number;
  }>;
}

export interface StockTransferPayload {
  sourceLocationId: string;
  destinationLocationId: string;
  reference: string;
  lines: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface InventoryCountPayload {
  locationId: string;
  reference: string;
  lines: Array<{
    productId: string;
    countedQuantity: number;
  }>;
}

export class MobileStockManager {
  private warehouses: Warehouse[] = [];
  private balances: StockBalance[] = [];
  private suggestions: ReorderSuggestion[] = [];

  private getStorageKey(prefix: string, companyId: string, branchId?: string | null): string {
    return `vendaja_${prefix}_${companyId}_${branchId || "all"}`;
  }

  public getWarehouses(): Warehouse[] {
    return [...this.warehouses];
  }

  public getBalances(): StockBalance[] {
    return [...this.balances];
  }

  public getSuggestions(): ReorderSuggestion[] {
    return [...this.suggestions];
  }

  /**
   * Carrega armazéns e localizações da API.
   */
  public async syncWarehouses(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<Warehouse[]> {
    const res = await fetch(`${apiUrl}/api/v1/stock/warehouses`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao carregar armazéns (HTTP ${res.status}).`);
    }

    const data: Warehouse[] = await res.json();
    this.warehouses = data;

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(this.getStorageKey("warehouses", companyId, branchId), JSON.stringify(data));
    }
    return data;
  }

  /**
   * Carrega saldos de stock da API.
   */
  public async syncBalances(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null,
    locationId?: string
  ): Promise<StockBalance[]> {
    const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
    const res = await fetch(`${apiUrl}/api/v1/stock/balances${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao carregar saldos de stock (HTTP ${res.status}).`);
    }

    const data: StockBalance[] = await res.json();
    this.balances = data;

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(this.getStorageKey("stock_balances", companyId, branchId), JSON.stringify(data));
    }
    return data;
  }

  /**
   * Carrega sugestões de reposição da API.
   */
  public async syncReorderSuggestions(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<ReorderSuggestion[]> {
    const res = await fetch(`${apiUrl}/api/v1/stock/reorder-suggestions`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao consultar sugestões de reposição (HTTP ${res.status}).`);
    }

    const data: ReorderSuggestion[] = await res.json();
    this.suggestions = data;
    return data;
  }

  /**
   * Recupera armazéns do armazenamento local seguro.
   */
  public loadCachedWarehouses(companyId: string, branchId?: string | null): Warehouse[] {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(this.getStorageKey("warehouses", companyId, branchId));
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          this.warehouses = parsed;
          return parsed;
        } catch {
          // ignore corrupted data
        }
      }
    }
    this.warehouses = [];
    return [];
  }

  /**
   * Recupera saldos do armazenamento local seguro.
   */
  public loadCachedBalances(companyId: string, branchId?: string | null): StockBalance[] {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(this.getStorageKey("stock_balances", companyId, branchId));
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          this.balances = parsed;
          return parsed;
        } catch {
          // ignore corrupted data
        }
      }
    }
    this.balances = [];
    return [];
  }

  /**
   * Executa transferência entre armazéns autorizados da mesma empresa/filial.
   * Regra estrita: Valida se ambas as localizações pertencem à empresa ativa.
   */
  public async executeTransfer(
    apiUrl: string,
    token: string,
    tenant: TenantContext,
    payload: StockTransferPayload
  ): Promise<any> {
    if (payload.lines.length === 0) {
      throw new Error("A transferência requer pelo menos um produto.");
    }

    if (payload.sourceLocationId === payload.destinationLocationId) {
      throw new Error("A localização de origem não pode ser idêntica à de destino.");
    }

    const res = await fetch(`${apiUrl}/api/v1/stock/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": tenant.companyId,
        ...(tenant.branchId ? { "x-branch-id": tenant.branchId } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      throw new Error("Stock insuficiente na localização de origem.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Submete contagem de inventário físico para o servidor.
   */
  public async submitInventoryCount(
    apiUrl: string,
    token: string,
    tenant: TenantContext,
    payload: InventoryCountPayload
  ): Promise<any> {
    if (payload.lines.length === 0) {
      throw new Error("A contagem de inventário requer pelo menos uma linha de produto.");
    }

    const res = await fetch(`${apiUrl}/api/v1/stock/inventory-counts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": tenant.companyId,
        ...(tenant.branchId ? { "x-branch-id": tenant.branchId } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      throw new Error("Conflito na referência de inventário ou contagem concorrente.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
    }

    return await res.json();
  }
}
