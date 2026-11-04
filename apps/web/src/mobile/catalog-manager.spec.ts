import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileCatalogManager } from "./catalog-manager";
import { SecureStorageAdapter } from "./secure-storage";
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

const mockProducts: Product[] = [
  {
    id: "prod-1",
    sku: "ALIM-001",
    name: "Arroz Agulha 1kg",
    priceCents: 150000,
    stock: 50,
    categoryId: "Alimentação",
    taxRate: 0.14,
    active: true,
    barcode: "5601234567890",
  },
  {
    id: "prod-2",
    sku: "BEB-002",
    name: "Água Mineral Cuca 1.5L",
    priceCents: 50000,
    stock: 100,
    categoryId: "Bebidas",
    taxRate: 0.14,
    active: true,
    barcode: "5609876543210",
  },
  {
    id: "prod-3",
    sku: "MED-003",
    name: "Paracetamol 500mg",
    priceCents: 80000,
    stock: 20,
    categoryId: "Saúde",
    taxRate: 0,
    exemptionCode: "M04",
    active: true,
  },
  {
    id: "prod-4",
    sku: "DESAT-004",
    name: "Produto Antigo Desativado",
    priceCents: 20000,
    stock: 0,
    categoryId: "Geral",
    taxRate: 0.14,
    active: false,
  },
];

describe("MobileCatalogManager", () => {
  let storage: SecureStorageAdapter;
  let catalog: MobileCatalogManager;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    storage = new SecureStorageAdapter(true);
    catalog = new MobileCatalogManager(storage);
    globalThis.localStorage.setItem(
      "vendaja_catalog_comp-1_all",
      JSON.stringify(mockProducts)
    );
  });

  it("deve carregar produtos da cache segregada por tenant", () => {
    const loaded = catalog.loadCachedCatalog("comp-1");
    assert.equal(loaded.length, 4);
    assert.equal(loaded[0]?.name, "Arroz Agulha 1kg");
  });

  it("não deve carregar produtos de outro tenant não segregado", () => {
    const loaded = catalog.loadCachedCatalog("comp-999");
    assert.equal(loaded.length, 0);
  });

  it("deve pesquisar produto por nome e SKU (case-insensitive)", () => {
    catalog.loadCachedCatalog("comp-1");

    const byName = catalog.filterProducts({ query: "arroz" });
    assert.equal(byName.length, 1);
    assert.equal(byName[0]?.sku, "ALIM-001");

    const bySku = catalog.filterProducts({ query: "beb-002" });
    assert.equal(bySku.length, 1);
    assert.equal(bySku[0]?.name, "Água Mineral Cuca 1.5L");
  });

  it("deve filtrar produtos por categoria", () => {
    catalog.loadCachedCatalog("comp-1");

    const bebidas = catalog.filterProducts({ category: "Bebidas" });
    assert.equal(bebidas.length, 1);
    assert.equal(bebidas[0]?.name, "Água Mineral Cuca 1.5L");
  });

  it("deve localizar produto por código de barras ou SKU", () => {
    catalog.loadCachedCatalog("comp-1");

    const foundByBarcode = catalog.findProductByBarcode("5601234567890");
    assert.ok(foundByBarcode);
    assert.equal(foundByBarcode?.id, "prod-1");

    const foundBySku = catalog.findProductByBarcode("BEB-002");
    assert.ok(foundBySku);
    assert.equal(foundBySku?.id, "prod-2");

    const notFound = catalog.findProductByBarcode("9999999999999");
    assert.equal(notFound, undefined);
  });
});
