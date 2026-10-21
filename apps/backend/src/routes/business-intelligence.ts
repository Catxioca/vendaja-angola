import { Router, type Request, type Response } from "express";
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
} from "../services/enterprise/index.js";
import { companyContext, requireAuth, requireCompanyContext, requireModuleAccess } from "../middleware/auth.js";

export const businessIntelligenceRouter = Router();

// ==========================================
// PUBLIC / DESKTOP CONNECTOR ENDPOINTS
// (Power BI Desktop pbids and OData/REST feeds can be accessed with API Key / Token)
// ==========================================
businessIntelligenceRouter.get("/powerbi/connector.pbids", async (req: Request, res: Response) => {
  const companyId = String(req.query.companyId || "default-company");
  const protocol = req.protocol;
  const host = req.get("host") || "localhost:4000";
  const apiBaseUrl = `${protocol}://${host}`;

  const pbidsContent = EnterprisePowerBiService.generatePbidsFile(apiBaseUrl, companyId);
  res.setHeader("Content-Disposition", `attachment; filename="VendaJa_BI_${companyId}.pbids"`);
  res.setHeader("Content-Type", "application/json");
  res.send(pbidsContent);
});

businessIntelligenceRouter.get("/powerbi/metadata", async (req: Request, res: Response) => {
  const protocol = req.protocol;
  const host = req.get("host") || "localhost:4000";
  const apiBaseUrl = `${protocol}://${host}`;
  const metadata = EnterprisePowerBiService.getSemanticModelMetadata(apiBaseUrl);
  res.json(metadata);
});

businessIntelligenceRouter.get("/powerbi/datasets/sales", async (req: Request, res: Response) => {
  const companyId = String(req.query.companyId || req.header("x-company-id") || "default-company");
  const data = await EnterprisePowerBiService.getTabularSales(companyId);
  res.json({
    dataset: "FactSales",
    recordsCount: data.length,
    value: data,
  });
});

businessIntelligenceRouter.get("/powerbi/datasets/customers", async (req: Request, res: Response) => {
  const companyId = String(req.query.companyId || req.header("x-company-id") || "default-company");
  const data = await EnterprisePowerBiService.getCustomerDataset(companyId);
  res.json({
    dataset: "DimCustomer",
    recordsCount: data.length,
    value: data,
  });
});

// Enforce standard enterprise authentication and tenant scoping for internal BI views
businessIntelligenceRouter.use(requireAuth, requireCompanyContext, requireModuleAccess("DASHBOARD"));

// ==========================================
// 1. ETL & DATA WAREHOUSE CACHE SYNC
// ==========================================
businessIntelligenceRouter.post("/etl/sync", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const cube = await EnterpriseDataWarehouseService.refreshCube(tenant.companyId);
  res.json({
    message: "Data Warehouse analítico sincronizado com sucesso",
    companyId: tenant.companyId,
    extractedAt: cube.lastRefreshedAt,
    salesCount: cube.sales.length,
    purchasesCount: cube.purchases.length,
    financialCount: cube.financial.length,
    inventoryValuationCents: cube.inventoryValuationCents,
  });
});

// ==========================================
// 2. CENTRAL ENTERPRISE KPIS
// ==========================================
businessIntelligenceRouter.get("/kpis", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const kpis = await EnterpriseKpiService.computeAllKpis(tenant.companyId, {
    companyId: tenant.companyId,
    branchId: tenant.branchId,
    from,
    to,
  });
  res.json(kpis);
});

// ==========================================
// 3. DEPARTMENTAL EXECUTIVE COCKPITS
// ==========================================
businessIntelligenceRouter.get("/dashboards/:department", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const dept = String(req.params.department).toLowerCase();
  const filters = {
    companyId: tenant.companyId,
    branchId: tenant.branchId,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  };

  switch (dept) {
    case "executive":
    case "ceo": {
      const data = await EnterpriseBiDashboardService.getExecutiveCockpit(tenant.companyId, filters);
      res.json(data);
      return;
    }
    case "financial":
    case "cfo": {
      const data = await EnterpriseBiDashboardService.getFinancialDashboard(tenant.companyId, filters);
      res.json(data);
      return;
    }
    case "commercial":
    case "crm": {
      const data = await EnterpriseBiDashboardService.getCommercialDashboard(tenant.companyId, filters);
      res.json(data);
      return;
    }
    case "procurement":
    case "purchases": {
      const data = await EnterpriseBiDashboardService.getProcurementDashboard(tenant.companyId, filters);
      res.json(data);
      return;
    }
    case "stock":
    case "inventory": {
      const data = await EnterpriseBiDashboardService.getStockDashboard(tenant.companyId, filters);
      res.json(data);
      return;
    }
    case "hr":
    case "people": {
      const data = await EnterpriseBiDashboardService.getHrDashboard(tenant.companyId, filters);
      res.json(data);
      return;
    }
    default:
      res.status(404).json({
        error: "dashboard_not_found",
        message: `Dashboard '${dept}' não suportado. Opções: executive, financial, commercial, procurement, stock, hr.`,
      });
  }
});

// ==========================================
// 4. HIERARCHICAL DRILL-DOWN ENGINE
// ==========================================
businessIntelligenceRouter.get("/analytics/drill-down", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const level = (req.query.level as any) || "TOTAL";
  const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
  const category = req.query.category ? String(req.query.category) : undefined;
  const productId = req.query.productId ? String(req.query.productId) : undefined;
  const documentNumber = req.query.documentNumber ? String(req.query.documentNumber) : undefined;

  const result = await EnterpriseBiAnalyticsService.executeDrillDown(tenant.companyId, {
    level,
    branchId,
    category,
    productId,
    documentNumber,
  });

  res.json(result);
});

// ==========================================
// 5. PROFITABILITY MATRIX & RANKINGS
// ==========================================
businessIntelligenceRouter.get("/analytics/profitability", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const dimension = (req.query.dimension as any) || "PRODUCT";
  const matrix = await EnterpriseBiAnalyticsService.getProfitabilityMatrix(tenant.companyId, dimension);
  res.json(matrix);
});

businessIntelligenceRouter.get("/analytics/rankings", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const rankings = await EnterpriseBiAnalyticsService.getRankings(tenant.companyId);
  res.json(rankings);
});

// ==========================================
// 6. TIME INTELLIGENCE (YoY, MoM, QoQ)
// ==========================================
businessIntelligenceRouter.get("/time-intelligence/compare", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const granularity = (req.query.granularity as any) || "MONTHLY";
  const mode = (req.query.mode as any) || "YEAR_OVER_YEAR";

  const comparison = await EnterpriseBiTimeIntelligenceService.comparePeriods(
    tenant.companyId,
    granularity,
    mode
  );
  res.json(comparison);
});

// ==========================================
// 7. PREDICTIVE FORECASTING (3 SCENARIOS)
// ==========================================
businessIntelligenceRouter.get("/forecast", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const monthsAhead = req.query.monthsAhead ? Number(req.query.monthsAhead) : 6;
  const forecast = await EnterpriseBiForecastService.generateMultiScenarioForecast(
    tenant.companyId,
    monthsAhead
  );
  res.json(forecast);
});

// ==========================================
// 8. EXECUTIVE THRESHOLD ALERTS
// ==========================================
businessIntelligenceRouter.get("/alerts", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const alerts = await EnterpriseBiAlertsService.evaluateAndGetAlerts(tenant.companyId);
  res.json({
    companyId: tenant.companyId,
    activeAlertsCount: alerts.length,
    alerts,
  });
});

businessIntelligenceRouter.post("/alerts/:id/acknowledge", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const alertId = String(req.params.id);
  const success = await EnterpriseBiAlertsService.acknowledgeAlert(tenant.companyId, alertId);
  res.json({ success, message: "Alerta executivo reconhecido com sucesso" });
});

// ==========================================
// 9. HOLDING MULTI-COMPANY CONSOLIDATION
// ==========================================
businessIntelligenceRouter.get("/consolidation/holding", async (req: Request, res: Response) => {
  const groupId = req.query.groupId ? String(req.query.groupId) : undefined;
  const eliminateIntercompany = req.query.eliminate !== "false";
  const currency = req.query.currency ? String(req.query.currency) : "AOA";
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const report = await BiConsolidationService.getConsolidatedBiReport({
    groupId,
    from,
    to,
    eliminateIntercompany,
    targetCurrency: currency,
  });

  res.json(report);
});

// ==========================================
// 10. CUSTOM DASHBOARDS (CRUD)
// ==========================================
businessIntelligenceRouter.get("/custom-dashboards", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const department = req.query.department ? String(req.query.department) : undefined;
  const dashboards = await EnterpriseBiDashboardService.listUserDashboards(tenant.companyId, department);
  res.json(dashboards);
});

businessIntelligenceRouter.post("/custom-dashboards", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { id, name, description, department, isDefault, layoutJson, widgetsJson } = req.body;

  if (!name || !widgetsJson) {
    res.status(400).json({ error: "missing_fields", message: "name e widgetsJson são obrigatórios." });
    return;
  }

  const saved = await EnterpriseBiDashboardService.saveUserDashboard(tenant.companyId, {
    id,
    name,
    description,
    department,
    isDefault,
    layoutJson,
    widgetsJson: typeof widgetsJson === "string" ? widgetsJson : JSON.stringify(widgetsJson),
  });

  res.status(201).json(saved);
});

businessIntelligenceRouter.delete("/custom-dashboards/:id", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  await EnterpriseBiDashboardService.deleteUserDashboard(tenant.companyId, String(req.params.id));
  res.json({ success: true, message: "Dashboard removido com sucesso" });
});
