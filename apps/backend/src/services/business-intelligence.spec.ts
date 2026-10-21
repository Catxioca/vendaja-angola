import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EnterpriseDataWarehouseService,
  EnterpriseKpiService,
  EnterpriseBiDashboardService,
  EnterpriseBiAnalyticsService,
  EnterpriseBiTimeIntelligenceService,
  EnterpriseBiForecastService,
  EnterpriseBiAlertsService,
  EnterprisePowerBiService,
  BiConsolidationService,
} from "./enterprise/index.js";

describe("Phase 7: Enterprise Business Intelligence, Analytics & Executive Forecasting Test Suite", () => {
  const testCompanyId = "comp-bi-spec-01";

  // ==========================================
  // 1. DATA WAREHOUSE & ANALYTICAL CUBE
  // ==========================================
  describe("Enterprise Data Warehouse & OLAP Cube Service", () => {
    test("extracts resilient in-memory star schema cube with facts and dimensions", async () => {
      const cube = await EnterpriseDataWarehouseService.getAnalyticalCube(testCompanyId);
      assert.ok(cube);
      assert.equal(cube.companyId, testCompanyId);
      assert.ok(Array.isArray(cube.sales));
      assert.ok(Array.isArray(cube.purchases));
      assert.ok(Array.isArray(cube.financial));
      assert.ok(cube.inventoryValuationCents > 0);
      assert.ok(cube.sales.length > 0, "Cube should contain sales fact rows");

      const sale = cube.sales[0]!;
      assert.ok(sale.saleId);
      assert.ok(sale.revenueCents > 0);
      assert.ok(sale.costCents > 0);
      assert.ok(sale.grossMarginCents !== undefined);
      assert.ok(sale.grossMarginPercent > 0);
      assert.ok(sale.paymentMethod);
    });

    test("filters analytical cube by date range and granularity", async () => {
      const cube = await EnterpriseDataWarehouseService.getAnalyticalCube(testCompanyId);
      const now = new Date();
      const past30Days = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      const filtered = EnterpriseDataWarehouseService.filterCube(cube, {
        companyId: testCompanyId,
        from: past30Days,
        to: now,
      });

      assert.ok(filtered);
      assert.ok(Array.isArray(filtered.sales));
      assert.ok(Array.isArray(filtered.purchases));
      assert.ok(Array.isArray(filtered.financial));
    });

    test("refreshes analytical cube and updates cache timestamp", async () => {
      const cube1 = await EnterpriseDataWarehouseService.getAnalyticalCube(testCompanyId);
      const cube2 = await EnterpriseDataWarehouseService.refreshCube(testCompanyId);

      assert.ok(cube2.lastRefreshedAt.getTime() >= cube1.lastRefreshedAt.getTime());
      assert.equal(cube2.companyId, testCompanyId);
    });
  });

  // ==========================================
  // 2. CENTRAL ENTERPRISE KPI ENGINE
  // ==========================================
  describe("Central Enterprise KPI Engine", () => {
    test("computes all 5 pillars of enterprise KPIs", async () => {
      const kpis = await EnterpriseKpiService.computeAllKpis(testCompanyId);

      assert.ok(kpis);
      assert.equal(kpis.companyId, testCompanyId);

      // Financial KPIs
      assert.ok(kpis.financial.totalRevenueCents > 0, "Total revenue must be positive");
      assert.ok(kpis.financial.cogsCents > 0, "COGS must be positive");
      assert.ok(kpis.financial.grossMarginCents > 0, "Gross margin must be positive");
      assert.ok(kpis.financial.grossMarginPercent > 0, "Gross margin % must be positive");
      assert.ok(kpis.financial.ebitdaCents > 0, "EBITDA must be positive");
      assert.ok(kpis.financial.netProfitCents > 0, "Net profit must be positive");
      assert.ok(kpis.financial.currentRatio > 0, "Current ratio must be calculated");

      // Commercial KPIs
      assert.ok(kpis.commercial.periodSalesCount > 0);
      assert.ok(kpis.commercial.averageTicketCents > 0);
      assert.ok(kpis.commercial.crmConversionRatePercent >= 0);

      // Procurement KPIs
      assert.ok(kpis.procurement.totalPurchasesCents > 0);
      assert.ok(kpis.procurement.activeSuppliersCount > 0);
      assert.ok(kpis.procurement.averageLeadTimeDays > 0);

      // Stock KPIs
      assert.ok(kpis.stock.inventoryValuationCents > 0);
      assert.ok(kpis.stock.inventoryTurnoverRate > 0);
      assert.ok(kpis.stock.daysSalesOfInventory > 0);

      // HR KPIs
      assert.ok(kpis.hr.headcount > 0);
      assert.ok(kpis.hr.revenuePerEmployeeCents > 0);
    });
  });

  // ==========================================
  // 3. DEPARTMENTAL EXECUTIVE COCKPITS
  // ==========================================
  describe("Departmental Executive Cockpits", () => {
    test("generates CEO Executive Cockpit with health score and trends", async () => {
      const cockpit = await EnterpriseBiDashboardService.getExecutiveCockpit(testCompanyId);

      assert.ok(cockpit);
      assert.ok(cockpit.executiveHealthScore >= 0 && cockpit.executiveHealthScore <= 100);
      assert.ok(cockpit.revenueTarget);
      assert.ok(cockpit.revenueTarget.achievementPercent > 0);
      assert.ok(cockpit.monthlyTrend.length >= 6, "Must provide 6-month historical trend");
      assert.ok(cockpit.categoryDistribution.length > 0);
      assert.ok(cockpit.paymentMethods.length > 0);
    });

    test("generates CFO Financial Dashboard with aging and projected cashflow", async () => {
      const financial = await EnterpriseBiDashboardService.getFinancialDashboard(testCompanyId);

      assert.ok(financial);
      assert.ok(financial.financialKpis);
      assert.ok(financial.bankBalances.length > 0);
      assert.ok(financial.projectedCashflow.length > 0);
      assert.ok(financial.agingReceivables.length > 0);
      assert.ok(financial.agingPayables.length > 0);
    });

    test("generates Commercial & CRM Dashboard with funnel stages", async () => {
      const commercial = await EnterpriseBiDashboardService.getCommercialDashboard(testCompanyId);

      assert.ok(commercial);
      assert.ok(commercial.commercialKpis);
      assert.ok(commercial.crmFunnel.length >= 5, "CRM funnel must include all 5+ stages");
      assert.ok(commercial.crmFunnel[0]!.count >= commercial.crmFunnel[commercial.crmFunnel.length - 1]!.count);
      assert.ok(commercial.salesByBranch.length > 0);
      assert.ok(commercial.topPerformers.length > 0);
    });

    test("generates Stock & Logistics Dashboard with Pareto ABC classification", async () => {
      const stockDash = await EnterpriseBiDashboardService.getStockDashboard(testCompanyId);

      assert.ok(stockDash);
      assert.ok(stockDash.stockKpis);
      assert.ok(stockDash.abcClassification.classA);
      assert.ok(stockDash.abcClassification.classB);
      assert.ok(stockDash.abcClassification.classC);
      assert.ok(stockDash.abcClassification.classA.revenuePercent > 60, "Class A must represent majority of revenue");
      assert.ok(stockDash.stockVelocity.length > 0);
      assert.ok(stockDash.criticalItemsList.length > 0);
    });

    test("generates Procurement Dashboard with supplier metrics", async () => {
      const procurement = await EnterpriseBiDashboardService.getProcurementDashboard(testCompanyId);

      assert.ok(procurement);
      assert.ok(procurement.procurementKpis);
      assert.ok(procurement.topSuppliers.length > 0);
      assert.ok(procurement.leadTimeAnalysis.length > 0);
    });

    test("generates HR & People Analytics Dashboard", async () => {
      const hrDash = await EnterpriseBiDashboardService.getHrDashboard(testCompanyId);

      assert.ok(hrDash);
      assert.ok(hrDash.hrKpis);
      assert.ok(hrDash.departmentBreakdown.length > 0);
      assert.ok(hrDash.turnoverTrend.length > 0);
    });
  });

  // ==========================================
  // 4. HIERARCHICAL DRILL-DOWN ENGINE
  // ==========================================
  describe("Hierarchical Drill-Down Engine", () => {
    test("navigates down from TOTAL to BRANCH to CATEGORY to PRODUCT", async () => {
      // Level 1: TOTAL (gives branches)
      const resTotal = await EnterpriseBiAnalyticsService.executeDrillDown(testCompanyId, { level: "TOTAL" });
      assert.equal(resTotal.currentLevel, "TOTAL");
      assert.ok(resTotal.nodes.length > 0);
      assert.ok(resTotal.breadcrumbs.length === 1);

      const firstBranch = resTotal.nodes[0]!;
      assert.ok(firstBranch.id);

      // Level 2: BRANCH (gives categories)
      const resBranch = await EnterpriseBiAnalyticsService.executeDrillDown(testCompanyId, {
        level: "BRANCH",
        branchId: firstBranch.id,
      });
      assert.equal(resBranch.currentLevel, "BRANCH");
      assert.ok(resBranch.nodes.length > 0);
      assert.ok(resBranch.breadcrumbs.length === 2);

      const firstCategory = resBranch.nodes[0]!;

      // Level 3: CATEGORY (gives products)
      const resCat = await EnterpriseBiAnalyticsService.executeDrillDown(testCompanyId, {
        level: "CATEGORY",
        branchId: firstBranch.id,
        category: firstCategory.id,
      });
      assert.equal(resCat.currentLevel, "CATEGORY");
      assert.ok(resCat.nodes.length > 0);
      assert.ok(resCat.breadcrumbs.length === 3);
    });
  });

  // ==========================================
  // 5. PROFITABILITY MATRIX & RANKINGS
  // ==========================================
  describe("Multidimensional Profitability Matrix", () => {
    test("computes product profitability matrix and classifies items", async () => {
      const matrix = await EnterpriseBiAnalyticsService.getProfitabilityMatrix(testCompanyId, "PRODUCT");

      assert.ok(matrix);
      assert.equal(matrix.dimension, "PRODUCT");
      assert.ok(matrix.totalRevenueCents > 0);
      assert.ok(matrix.averageMarginPercent > 0);
      assert.ok(matrix.items.length > 0);

      const item = matrix.items[0]!;
      assert.ok(item.id);
      assert.ok(item.name);
      assert.ok(item.revenueCents > 0);
      assert.ok(item.grossMarginPercent > 0);
      assert.ok(["STAR", "CASH_COW", "QUESTION_MARK", "DOG", "PERFORMER"].includes(item.classification));
    });

    test("computes top and bottom rankings across products and customers", async () => {
      const rankings = await EnterpriseBiAnalyticsService.getRankings(testCompanyId);

      assert.ok(rankings);
      assert.ok(rankings.topProductsByRevenue.length > 0);
      assert.ok(rankings.topProductsByMargin.length > 0);
      assert.ok(rankings.topCustomersBySpend.length > 0);
      assert.ok(rankings.bottomProductsByMargin.length >= 0);
    });
  });

  // ==========================================
  // 6. TIME INTELLIGENCE (YoY, MoM)
  // ==========================================
  describe("Time Intelligence Engine", () => {
    test("computes Year-over-Year (YoY) comparative metrics with trend tags", async () => {
      const comp = await EnterpriseBiTimeIntelligenceService.comparePeriods(
        testCompanyId,
        "MONTHLY",
        "YEAR_OVER_YEAR"
      );

      assert.ok(comp);
      assert.equal(comp.mode, "YEAR_OVER_YEAR");
      assert.ok(comp.metrics.length > 0);

      const revMetric = comp.metrics.find((m) => m.metricId === "TOTAL_REVENUE");
      assert.ok(revMetric);
      assert.ok(revMetric.currentValue > 0);
      assert.ok(revMetric.priorValue > 0);
      assert.ok(typeof revMetric.growthPercent === "number");
      assert.ok(["GROWTH_STRONG", "GROWTH_MODERATE", "STABLE", "DECLINE_MODERATE", "DECLINE_CRITICAL"].includes(revMetric.trend));
    });
  });

  // ==========================================
  // 7. PREDICTIVE FORECASTING ENGINE
  // ==========================================
  describe("Predictive Forecasting Engine", () => {
    test("generates 6-month forecast under Conservative, Realistic, and Optimistic scenarios", async () => {
      const forecast = await EnterpriseBiForecastService.generateMultiScenarioForecast(testCompanyId, 6);

      assert.ok(forecast);
      assert.equal(forecast.projectionWindowMonths, 6);
      assert.ok(forecast.monthlyProjections.length === 6);

      const totals = forecast.projectedTotals;
      assert.ok(totals.conservative.revenueCents > 0);
      assert.ok(totals.realistic.revenueCents > totals.conservative.revenueCents, "Realistic must exceed Conservative");
      assert.ok(totals.optimistic.revenueCents > totals.realistic.revenueCents, "Optimistic must exceed Realistic");

      // Verify each monthly projection holds the scenario hierarchy
      for (const m of forecast.monthlyProjections) {
        assert.ok(m.month);
        assert.ok(m.conservativeCents <= m.realisticCents);
        assert.ok(m.realisticCents <= m.optimisticCents);
      }
    });
  });

  // ==========================================
  // 8. EXECUTIVE ALERTING SYSTEM
  // ==========================================
  describe("Executive Alerts & Threshold Evaluator", () => {
    test("evaluates operational rules and detects threshold breaches", async () => {
      const alerts = await EnterpriseBiAlertsService.evaluateAndGetAlerts(testCompanyId);

      assert.ok(Array.isArray(alerts));
      assert.ok(alerts.length > 0, "Should generate executive threshold evaluations");

      const alert = alerts[0]!;
      assert.ok(alert.id);
      assert.ok(alert.metric);
      assert.ok(["INFO", "WARNING", "CRITICAL"].includes(alert.severity));
      assert.ok(alert.message);
    });

    test("acknowledges active alert correctly", async () => {
      const alerts = await EnterpriseBiAlertsService.evaluateAndGetAlerts(testCompanyId);
      const target = alerts[0]!;

      const acknowledged = await EnterpriseBiAlertsService.acknowledgeAlert(testCompanyId, target.id);
      assert.equal(acknowledged, true);
    });
  });

  // ==========================================
  // 9. MICROSOFT POWER BI INTEGRATION
  // ==========================================
  describe("Microsoft Power BI Native Integration", () => {
    test("generates semantic model metadata and pre-built DAX measures", () => {
      const metadata = EnterprisePowerBiService.getSemanticModelMetadata("http://localhost:4000");

      assert.ok(metadata);
      assert.equal(metadata.compatibilityLevel, 1560);
      assert.ok(metadata.tables.length >= 3, "Must include FactSales, DimProduct, DimCustomer, etc.");
      assert.ok(metadata.daxMeasures.length >= 6, "Must provide core DAX measures");

      const totalVendasDax = metadata.daxMeasures.find((m) => m.name === "Total Vendas (AOA)");
      assert.ok(totalVendasDax);
      assert.ok(totalVendasDax.expression.includes("SUM"));
    });

    test("generates valid Power BI Desktop connector .pbids file", () => {
      const pbidsString = EnterprisePowerBiService.generatePbidsFile("http://localhost:4000", testCompanyId);

      assert.ok(pbidsString);
      const parsed = JSON.parse(pbidsString);
      assert.equal(parsed.version, "0.1");
      assert.ok(parsed.connections.length > 0);
      assert.equal(parsed.connections[0].mode, "DirectQuery");
      assert.ok(parsed.connections[0].details.address.url.includes("http://localhost:4000"));
    });

    test("provides tabular datasets for Power BI import", async () => {
      const salesData = await EnterprisePowerBiService.getTabularSales(testCompanyId);
      assert.ok(Array.isArray(salesData));
      assert.ok(salesData.length > 0);

      const customerData = await EnterprisePowerBiService.getCustomerDataset(testCompanyId);
      assert.ok(Array.isArray(customerData));
      assert.ok(customerData.length > 0);
    });
  });

  // ==========================================
  // 10. HOLDING MULTI-COMPANY CONSOLIDATION
  // ==========================================
  describe("Holding Multi-Company Consolidation", () => {
    test("consolidates subsidiaries and eliminates intercompany sales", async () => {
      const report = await BiConsolidationService.getConsolidatedBiReport({
        eliminateIntercompany: true,
        targetCurrency: "AOA",
      });

      assert.ok(report);
      assert.ok(report.groupName);
      assert.equal(report.consolidationCurrency, "AOA");
      assert.equal(report.eliminationsApplied, true);
      assert.ok(report.subsidiariesCount >= 1);

      const fin = report.consolidatedFinancials;
      assert.ok(fin.grossRevenueCents > 0);
      assert.ok(fin.netConsolidatedRevenueCents <= fin.grossRevenueCents, "Consolidated revenue must exclude intercompany eliminations");
      assert.ok(fin.ebitdaCents > 0);
      assert.ok(fin.netProfitCents > 0);
      assert.ok(report.subsidiaryContributions.length > 0);

      const firstSub = report.subsidiaryContributions[0]!;
      assert.ok(firstSub.companyName);
      assert.ok(firstSub.shareOfGroupRevenuePercent > 0);
      assert.ok(firstSub.healthScore >= 0);
      assert.ok(["LEADER", "PERFORMER", "WATCHLIST", "DISTRESSED"].includes(firstSub.status));
    });
  });

  // ==========================================
  // 11. CUSTOM DASHBOARDS (CRUD)
  // ==========================================
  describe("Custom User Dashboard Service", () => {
    test("creates, lists, and manages custom dashboards", async () => {
      const saved = await EnterpriseBiDashboardService.saveUserDashboard(testCompanyId, {
        name: "Cockpit Direção de Operações 2026",
        department: "EXECUTIVE",
        description: "Painel personalizado para Diretor de Operações",
        widgetsJson: JSON.stringify([{ id: "w1", type: "KPI_GRID" }, { id: "w2", type: "FORECAST_CHART" }]),
      });

      assert.ok(saved);
      assert.ok(saved.id);
      assert.equal(saved.name, "Cockpit Direção de Operações 2026");

      const list = await EnterpriseBiDashboardService.listUserDashboards(testCompanyId);
      assert.ok(Array.isArray(list));
      assert.ok(list.length > 0);

      const deleted = await EnterpriseBiDashboardService.deleteUserDashboard(testCompanyId, saved.id);
      assert.equal(deleted, true);
    });
  });
});
