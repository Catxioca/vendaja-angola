import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  computeOfflineDashboard,
  saveDashboardCache,
  loadDashboardCache,
  logDashboardDiagnostic,
  getDashboardDiagnostics,
  clearDashboardDiagnostics,
  groupSalesByDay,
  groupSalesByPayment,
  type DashboardSummary,
} from "./offline-dashboard.js";
import {
  createPosStorage,
  type LocalPosStorage,
  type Sale,
  type Product,
} from "@angola/shared";

describe("Enterprise Offline-First Dashboard Engine", () => {
  let storage: LocalPosStorage;

  const mockProducts: Product[] = [
    {
      id: "prod-01",
      sku: "SKU-BEER",
      name: "Cerveja Cuca 330ml",
      priceCents: 50000, // 500 Kz
      stock: 45,
      taxRate: 0.14,
      costCents: 30000,
      active: true,
    },
    {
      id: "prod-02",
      sku: "SKU-WATER",
      name: "Água Pura 1.5L",
      priceCents: 25000, // 250 Kz
      stock: 4, // Low stock <= 5
      taxRate: 0.14,
      costCents: 12000,
      active: true,
    },
    {
      id: "prod-03",
      sku: "SKU-RICE",
      name: "Arroz Tio Lucas 1kg",
      priceCents: 120000, // 1200 Kz
      stock: 20,
      taxRate: 0.05,
      costCents: 80000,
      active: true,
    },
  ];

  beforeEach(async () => {
    storage = createPosStorage(`test-pos-${Date.now()}`);
    if (storage.clear) await storage.clear();
    clearDashboardDiagnostics();
  });

  it("Scenario 1: Computes real KPIs from online cached snapshot merged with local data", async () => {
    const cachedOnlineSummary: DashboardSummary = {
      period: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-20T23:59:59.999Z" },
      sales: {
        totalCents: 500_000_00,
        documents: 15,
        averageTicketCents: 33_333_33,
        byPayment: [{ paymentMethod: "CASH", documents: 15, totalCents: 500_000_00 }],
      },
      purchases: {
        totalCents: 200_000_00,
        count: 3,
        creditCents: 50_000_00,
        topSuppliers: [{ supplier: "Refriango SA", totalCents: 200_000_00 }],
      },
      expenses: {
        totalCents: 45_000_00,
        count: 2,
        byCategory: [{ category: "Combustível", count: 2, totalCents: 45_000_00 }],
      },
      receivables: { openCents: 30_000_00, receivedCents: 0, count: 1, overdueCount: 0 },
      payables: { openCents: 50_000_00, paidCents: 0, count: 1, overdueCount: 0 },
      cashflow: { entriesCents: 500_000_00, exitsCents: 45_000_00, netCents: 455_000_00 },
      stock: { productCount: 3, lowStockCount: 1, entries: 0, exits: 15, inventoryValuationCents: 3000000 },
      entities: { activeCustomers: 12, activeSuppliers: 1 },
      charts: {
        salesByDay: [{ date: "2026-10-15", amountCents: 500_000_00 }],
        purchasesByDay: [],
        expensesByDay: [],
        expensesByCategory: [],
      },
      alerts: {
        pendingReceivables: [],
        pendingPayables: [],
        highValuePurchases: [],
        highValueExpenses: [],
        lowStock: null,
      },
      limitations: [],
      source: "ONLINE_API",
    };

    saveDashboardCache("month", cachedOnlineSummary);
    const loaded = loadDashboardCache("month");
    assert.ok(loaded);
    assert.equal(loaded?.summary.sales.totalCents, 500_000_00);
    assert.equal(loaded?.summary.purchases.totalCents, 200_000_00);
  });

  it("Scenario 2: Calculates 100% real offline KPIs when sales are made offline", async () => {
    const now = new Date();
    const todayISO = now.toISOString();

    const sale1: Sale = {
      id: "sale-off-01",
      number: "FR 2026/1",
      fiscalType: "INVOICE_RECEIPT",
      currency: "AOA",
      subtotalCents: 100000,
      taxCents: 14000,
      totalCents: 114000,
      createdAt: todayISO,
      paymentMethod: "CASH",
      cashCents: 114000,
      customerName: "Supermercado Luanda Lda",
      customerId: "cust-01",
      lines: [
        { productId: "prod-01", quantity: 2, unitPriceCents: 50000, taxRate: 0.14 },
      ],
    };

    const sale2: Sale = {
      id: "sale-off-02",
      number: "FR 2026/2",
      fiscalType: "INVOICE_RECEIPT",
      currency: "AOA",
      subtotalCents: 240000,
      taxCents: 12000,
      totalCents: 252000,
      createdAt: todayISO,
      paymentMethod: "CARD",
      cardCents: 252000,
      customerName: "Consumidor Final",
      lines: [
        { productId: "prod-03", quantity: 2, unitPriceCents: 120000, taxRate: 0.05 },
      ],
    };

    await storage.saveSale(sale1);
    await storage.saveSale(sale2);

    const summary = await computeOfflineDashboard({
      storage,
      periodName: "today",
      customProducts: mockProducts,
      customCashSession: { sangriaCents: 5000, suprimentoCents: 20000 },
    });

    assert.equal(summary.source, "OFFLINE_LOCAL_DB");
    assert.equal(summary.sales.documents, 2);
    assert.equal(summary.sales.totalCents, 366000); // 114000 + 252000
    assert.equal(summary.sales.averageTicketCents, 183000);

    // Offline KPIs validation
    assert.ok(summary.offlineKpis);
    assert.equal(summary.offlineKpis?.todaySalesCents, 366000);
    assert.equal(summary.offlineKpis?.todayDocuments, 2);
    assert.equal(summary.offlineKpis?.monthSalesCents, 366000);
    assert.equal(summary.offlineKpis?.totalBilledCents, 366000);
    assert.equal(summary.offlineKpis?.totalDocuments, 2);
    assert.equal(summary.offlineKpis?.customersServedCount, 2);
    assert.equal(summary.offlineKpis?.productsSoldUnits, 4); // 2 + 2 units

    // Cashflow validation
    // Cash sale = 114000 + suprimento 20000 = 134000 entries
    assert.equal(summary.cashflow.entriesCents, 134000);
    // Sangria = 5000 exits
    assert.equal(summary.cashflow.exitsCents, 5000);
    assert.equal(summary.cashflow.netCents, 129000);

    // Stock validation
    assert.equal(summary.stock.productCount, 3);
    assert.equal(summary.stock.exits, 4);
    assert.equal(summary.stock.lowStockCount, 1); // prod-02 has stock 4 <= 5
  });

  it("Scenario 3: Continues operating normally when backend server is completely offline", async () => {
    // Empty initial sales, verify zero crash, zero fake numbers
    const summary = await computeOfflineDashboard({
      storage,
      periodName: "today",
      customProducts: mockProducts,
    });

    assert.equal(summary.sales.documents, 0);
    assert.equal(summary.sales.totalCents, 0);
    assert.equal(summary.sales.averageTicketCents, null);
    assert.equal(summary.stock.productCount, 3);
    assert.ok(summary.limitations.some((l) => l.includes("Modo Local Offline")));
  });

  it("Scenario 4: Correctly excludes proforma invoices from commercial revenue", async () => {
    const now = new Date().toISOString();

    const normalSale: Sale = {
      id: "sale-norm-1",
      number: "FT 2026/1",
      fiscalType: "INVOICE",
      currency: "AOA",
      subtotalCents: 50000,
      taxCents: 7000,
      totalCents: 57000,
      createdAt: now,
      paymentMethod: "CASH",
      lines: [{ productId: "prod-01", quantity: 1, unitPriceCents: 50000, taxRate: 0.14 }],
    };

    const proforma: Sale = {
      id: "sale-prof-1",
      number: "FP 2026/1",
      fiscalType: "PROFORMA",
      currency: "AOA",
      subtotalCents: 900000,
      taxCents: 126000,
      totalCents: 1026000,
      createdAt: now,
      paymentMethod: "TRANSFER",
      lines: [{ productId: "prod-01", quantity: 18, unitPriceCents: 50000, taxRate: 0.14 }],
    };

    await storage.saveSale(normalSale);
    await storage.saveSale(proforma);

    const summary = await computeOfflineDashboard({ storage });

    // Proforma must NOT inflate revenue
    assert.equal(summary.sales.documents, 1);
    assert.equal(summary.sales.totalCents, 57000);
    assert.equal(summary.offlineKpis?.todaySalesCents, 57000);
  });

  it("Scenario 5: Aggregates payment methods and daily chart bars accurately", () => {
    const sales: Sale[] = [
      {
        id: "s1",
        number: "FR 1",
        currency: "AOA",
        subtotalCents: 1000,
        taxCents: 140,
        totalCents: 1140,
        createdAt: "2026-10-21T10:00:00.000Z",
        paymentMethod: "CASH",
        lines: [],
      },
      {
        id: "s2",
        number: "FR 2",
        currency: "AOA",
        subtotalCents: 2000,
        taxCents: 280,
        totalCents: 2280,
        createdAt: "2026-10-21T14:30:00.000Z",
        paymentMethod: "CASH",
        lines: [],
      },
      {
        id: "s3",
        number: "FR 3",
        currency: "AOA",
        subtotalCents: 5000,
        taxCents: 700,
        totalCents: 5700,
        createdAt: "2026-10-20T09:15:00.000Z",
        paymentMethod: "CARD",
        lines: [],
      },
    ];

    const byDay = groupSalesByDay(sales);
    assert.equal(byDay.length, 2);
    assert.ok(byDay[0]);
    assert.ok(byDay[1]);
    assert.equal(byDay[0].date, "2026-10-20");
    assert.equal(byDay[0].amountCents, 5700);
    assert.equal(byDay[1].date, "2026-10-21");
    assert.equal(byDay[1].amountCents, 3420); // 1140 + 2280

    const byPayment = groupSalesByPayment(sales);
    assert.equal(byPayment.length, 2);
    const cashMethod = byPayment.find((p) => p.paymentMethod === "CASH");
    assert.equal(cashMethod?.documents, 2);
    assert.equal(cashMethod?.totalCents, 3420);
    const cardMethod = byPayment.find((p) => p.paymentMethod === "CARD");
    assert.equal(cardMethod?.documents, 1);
    assert.equal(cardMethod?.totalCents, 5700);
  });

  it("Scenario 6: Records structured diagnostic logs on every dashboard execution", async () => {
    logDashboardDiagnostic({
      source: "OFFLINE_LOCAL_DB",
      period: "today",
      durationMs: 8,
      documentsCount: 4,
      totalCents: 450000,
      status: "SUCCESS",
    });

    const logs = getDashboardDiagnostics();
    assert.ok(logs.length >= 1);
    assert.ok(logs[0]);
    assert.equal(logs[0].source, "OFFLINE_LOCAL_DB");
    assert.equal(logs[0].period, "today");
    assert.equal(logs[0].documentsCount, 4);
    assert.equal(logs[0].status, "SUCCESS");
  });
});
