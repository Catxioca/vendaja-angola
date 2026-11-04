import type { Product } from "@angola/shared";
import type { SecureStorageAdapter } from "./secure-storage";

export interface CatalogFilter {
  query?: string;
  category?: string;
  onlyActive?: boolean;
}

export class MobileCatalogManager {
  private inMemoryProducts: Product[] = [];

  constructor(private storage: SecureStorageAdapter) {}

  private getCatalogStorageKey(companyId: string, branchId?: string | null): string {
    return `vendaja_catalog_${companyId}_${branchId || "all"}`;
  }

  /**
   * Carrega o catálogo real da API do backend e atualiza a cache local segura.
   */
  public async syncCatalog(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<Product[]> {
    const res = await fetch(`${apiUrl}/api/v1/products`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao obter catálogo do servidor (HTTP ${res.status}).`);
    }

    const products: Product[] = await res.json();
    this.inMemoryProducts = products;

    // Persiste no armazenamento local segregado por tenant
    if (typeof localStorage !== "undefined") {
      const key = this.getCatalogStorageKey(companyId, branchId);
      localStorage.setItem(key, JSON.stringify(products));
    }

    return products;
  }

  /**
   * Obtém o catálogo da cache local para funcionamento offline.
   */
  public loadFromCache(companyId: string, branchId?: string | null): Product[] {
    if (this.inMemoryProducts.length > 0) {
      return this.inMemoryProducts;
    }

    if (typeof localStorage !== "undefined") {
      const key = this.getCatalogStorageKey(companyId, branchId);
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const cached = JSON.parse(raw);
          this.inMemoryProducts = cached;
          return cached;
        } catch {
          // ignore corrupted cache
        }
      }
    }
    return [];
  }

  public loadCachedCatalog(companyId: string, branchId?: string | null): Product[] {
    return this.loadFromCache(companyId, branchId);
  }

  /**
   * Filtra os produtos por texto (nome, SKU, código de barras) e categoria.
   */
  public filterProducts(filter: CatalogFilter): Product[] {
    const q = filter.query?.trim().toLowerCase() || "";
    const cat = filter.category;
    const onlyActive = filter.onlyActive !== false;

    return this.inMemoryProducts.filter((product) => {
      if (onlyActive && !product.active) return false;

      if (cat && cat !== "ALL" && product.categoryId !== cat) {
        return false;
      }

      if (q) {
        const matchName = product.name.toLowerCase().includes(q);
        const matchSku = product.sku.toLowerCase().includes(q);
        const matchBarcode = product.barcode ? product.barcode.toLowerCase().includes(q) : false;
        return matchName || matchSku || matchBarcode;
      }

      return true;
    });
  }

  /**
   * Localiza produto exato por SKU ou Código de Barras (para leitor de scanner).
   */
  public findByBarcodeOrSku(code: string): Product | undefined {
    const cleaned = code.trim().toLowerCase();
    return this.inMemoryProducts.find((p) => {
      if (!p.active) return false;
      if (p.sku.toLowerCase() === cleaned) return true;
      if (p.barcode && p.barcode.toLowerCase() === cleaned) return true;
      return false;
    });
  }

  public findProductByBarcode(code: string): Product | undefined {
    return this.findByBarcodeOrSku(code);
  }

  /**
   * Extrai categorias únicas presentes nos produtos para os botões de filtro rápido.
   */
  public getCategories(): string[] {
    const set = new Set<string>();
    for (const p of this.inMemoryProducts) {
      if (p.categoryId) set.add(p.categoryId);
    }
    return Array.from(set).sort();
  }

  /**
   * Paginação e lazy loading do catálogo para otimização de renderização móvel.
   */
  public getPage(
    page: number = 1,
    pageSize: number = 24,
    filter: CatalogFilter = {}
  ): {
    items: Product[];
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
  } {
    const filtered = this.filterProducts(filter);
    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const offset = (safePage - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize);

    return {
      items,
      total,
      totalPages,
      page: safePage,
      pageSize,
    };
  }

  /**
   * Mede o desempenho de busca no catálogo (benchmark de performance).
   */
  public benchmarkSearch(
    filter: CatalogFilter,
    iterations: number = 100
  ): {
    totalDurationMs: number;
    averageMs: number;
    matchedCount: number;
    iterations: number;
  } {
    const start = performance.now();
    let count = 0;
    for (let i = 0; i < iterations; i++) {
      const res = this.filterProducts(filter);
      count = res.length;
    }
    const end = performance.now();
    const totalDurationMs = Math.round((end - start) * 100) / 100;
    const averageMs = Math.round((totalDurationMs / iterations) * 1000) / 1000;

    return {
      totalDurationMs,
      averageMs,
      matchedCount: count,
      iterations,
    };
  }
}
