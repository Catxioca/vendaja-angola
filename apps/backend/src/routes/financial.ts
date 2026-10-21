import { Router, type Request, type Response } from "express";
import {
  BankReconciliationService,
  TreasuryService,
  CashForecastService,
  ReceivablesService,
  PayablesService,
  FixedAssetsService,
  BudgetService,
  FinancialClosingService,
  CostCenterService,
  MultiCompanyService,
  FinancialMetricsService,
} from "../services/enterprise/index.js";
import { companyContext, requireAuth, requireCompanyContext, requireModuleAccess } from "../middleware/auth.js";

export const financialRouter = Router();

// Enforce standard authentication and tenant scoping
financialRouter.use(requireAuth, requireCompanyContext, requireModuleAccess("ACCOUNTING"));

// ==========================================
// 1. EXECUTIVE CFO DASHBOARD
// ==========================================
financialRouter.get("/dashboard", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const data = await FinancialMetricsService.getExecutiveDashboard(tenant.companyId || undefined);
  res.json(data);
});

// ==========================================
// 2. BANK RECONCILIATION
// ==========================================
financialRouter.post("/reconciliation/import", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { bankAccountId, filename, fileFormat, rawContent } = req.body;

  if (!bankAccountId || !fileFormat || !rawContent) {
    res.status(400).json({ error: "missing_fields", message: "bankAccountId, fileFormat e rawContent são obrigatórios." });
    return;
  }

  const statement = await BankReconciliationService.importStatement(
    bankAccountId,
    filename || "extrato.ofx",
    fileFormat,
    rawContent,
    tenant.companyId || undefined
  );
  res.status(201).json({ message: "Extrato importado com sucesso", statement });
});

financialRouter.post("/reconciliation/:id/auto-match", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const result = await BankReconciliationService.autoReconcile(String(req.params.id), tenant.companyId || undefined);
  res.json(result);
});

financialRouter.get("/reconciliation/:id/report", async (req: Request, res: Response) => {
  const report = await BankReconciliationService.getReconciliationReport(String(req.params.id));
  res.json(report);
});

// ==========================================
// 3. TREASURY MANAGEMENT
// ==========================================
financialRouter.get("/treasury/accounts", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const accounts = await TreasuryService.listAccounts(tenant.companyId || undefined);
  res.json({ data: accounts });
});

financialRouter.post("/treasury/accounts", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { name, type, currency, openingBalanceCents, accountId } = req.body;

  if (!name || !type) {
    res.status(400).json({ error: "missing_fields", message: "name e type são obrigatórios." });
    return;
  }

  const account = await TreasuryService.createAccount({
    companyId: tenant.companyId || undefined,
    branchId: tenant.branchId ?? undefined,
    name,
    type,
    currency,
    openingBalanceCents,
    accountId,
  });

  res.status(201).json({ message: "Conta de tesouraria criada", data: account });
});

financialRouter.post("/treasury/movements", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { treasuryAccountId, direction, amountCents, type, description, reference, category } = req.body;

  if (!treasuryAccountId || !direction || !amountCents || !description) {
    res.status(400).json({ error: "missing_fields", message: "Parâmetros obrigatórios ausentes." });
    return;
  }

  const result = await TreasuryService.recordMovement({
    treasuryAccountId,
    companyId: tenant.companyId || undefined,
    branchId: tenant.branchId ?? undefined,
    direction,
    amountCents,
    type: type || "ADJUSTMENT",
    description,
    reference,
    category,
    operatorId: (req as any).user?.id,
  });

  res.status(201).json(result);
});

financialRouter.post("/treasury/transfers", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { sourceAccountId, targetAccountId, amountCents, reason } = req.body;

  if (!sourceAccountId || !targetAccountId || !amountCents || !reason) {
    res.status(400).json({ error: "missing_fields", message: "sourceAccountId, targetAccountId, amountCents e reason são obrigatórios." });
    return;
  }

  const transfer = await TreasuryService.transferFunds(
    sourceAccountId,
    targetAccountId,
    amountCents,
    reason,
    (req as any).user?.id,
    tenant.companyId || undefined
  );

  res.status(201).json({ message: "Transferência de tesouraria executada com sucesso", data: transfer });
});

financialRouter.get("/treasury/flow", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const flow = await TreasuryService.getTreasuryFlow(tenant.companyId || undefined, from, to);
  res.json(flow);
});

// ==========================================
// 4. CASH FORECAST (3 SCENARIOS)
// ==========================================
financialRouter.get("/forecast", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const horizon = req.query.days ? parseInt(String(req.query.days), 10) : 30;
  const forecast = await CashForecastService.calculateForecast(tenant.companyId || undefined, horizon);
  res.json(forecast);
});

// ==========================================
// 5. ACCOUNTS RECEIVABLE (AR) & AGING
// ==========================================
financialRouter.get("/receivables/aging", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const report = await ReceivablesService.getAgingReport(tenant.companyId || undefined);
  res.json(report);
});

financialRouter.post("/receivables/credit-check", async (req: Request, res: Response) => {
  const { customerId, requestedAmountCents } = req.body;
  if (!customerId || requestedAmountCents === undefined) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }

  const check = await ReceivablesService.checkCustomerCredit(customerId, Number(requestedAmountCents));
  res.json(check);
});

financialRouter.post("/receivables/block-toggle", async (req: Request, res: Response) => {
  const { customerId, active, reason } = req.body;
  const updated = await ReceivablesService.toggleCustomerBlock(
    customerId,
    Boolean(active),
    reason,
    (req as any).user?.id
  );
  res.json({ message: `Cliente ${active ? "desbloqueado" : "bloqueado"} com sucesso`, data: updated });
});

// ==========================================
// 6. ACCOUNTS PAYABLE (AP) & CALENDAR
// ==========================================
financialRouter.get("/payables", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const report = await PayablesService.getPayablesReport(tenant.companyId || undefined);
  res.json(report);
});

financialRouter.get("/payables/calendar", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const calendar = await PayablesService.getPaymentCalendar(tenant.companyId || undefined, from, to);
  res.json({ calendar });
});

// ==========================================
// 7. FIXED ASSETS & DEPRECIATION
// ==========================================
financialRouter.get("/assets", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const category = req.query.category as string;
  const status = req.query.status as string;
  const assets = await FixedAssetsService.listAssets(tenant.companyId || undefined, category, status);
  res.json({ data: assets });
});

financialRouter.post("/assets", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { code, name, category, acquisitionDate, acquisitionCostCents, usefulLifeMonths, residualValueCents, location, assignedTo } = req.body;

  if (!code || !name || !category || !acquisitionCostCents) {
    res.status(400).json({ error: "missing_fields", message: "code, name, category e acquisitionCostCents são obrigatórios." });
    return;
  }

  const asset = await FixedAssetsService.createAsset({
    companyId: tenant.companyId || undefined,
    branchId: tenant.branchId ?? undefined,
    code,
    name,
    category,
    acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : new Date(),
    acquisitionCostCents: Number(acquisitionCostCents),
    usefulLifeMonths: usefulLifeMonths ? Number(usefulLifeMonths) : undefined,
    residualValueCents: residualValueCents ? Number(residualValueCents) : undefined,
    location,
    assignedTo,
  });

  res.status(201).json({ message: "Ativo fixo cadastrado com sucesso", data: asset });
});

financialRouter.post("/assets/depreciate-batch", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { year, month } = req.body;
  const result = await FixedAssetsService.runBatchMonthlyDepreciation(tenant.companyId || undefined, year, month);
  res.json(result);
});

// ==========================================
// 8. BUDGETING & CONTROLLING
// ==========================================
financialRouter.get("/budgets", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
  const budgets = await BudgetService.listBudgets(tenant.companyId || undefined, year);
  res.json({ data: budgets });
});

financialRouter.post("/budgets", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { name, year, type, alertThresholdPercent, lines } = req.body;

  if (!name || !year || !lines || !Array.isArray(lines)) {
    res.status(400).json({ error: "missing_fields", message: "name, year e array de lines são obrigatórios." });
    return;
  }

  const budget = await BudgetService.createBudget({
    companyId: tenant.companyId || undefined,
    branchId: tenant.branchId ?? undefined,
    name,
    year: Number(year),
    type,
    alertThresholdPercent,
    lines,
  });

  res.status(201).json({ message: "Orçamento criado com sucesso", data: budget });
});

financialRouter.get("/budgets/:id/variance", async (req: Request, res: Response) => {
  const report = await BudgetService.getVarianceReport(String(req.params.id));
  res.json(report);
});

// ==========================================
// 9. FINANCIAL CLOSING & STATEMENTS
// ==========================================
financialRouter.post("/closing/period/:id/close", async (req: Request, res: Response) => {
  const { notes } = req.body;
  const closed = await FinancialClosingService.closePeriod(String(req.params.id), (req as any).user?.id, notes);
  res.json({ message: "Período contabilístico encerrado com sucesso", data: closed });
});

financialRouter.post("/closing/period/:id/reopen", async (req: Request, res: Response) => {
  const { reason } = req.body;
  if (!reason) {
    res.status(400).json({ error: "missing_reason", message: "Justificação obrigatória para reabertura de período." });
    return;
  }
  const reopened = await FinancialClosingService.reopenPeriod(String(req.params.id), (req as any).user?.id || "admin", reason);
  res.json({ message: "Período contabilístico reaberto com sucesso", data: reopened });
});

financialRouter.get("/statements/balance-sheet", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const asOf = req.query.date ? new Date(String(req.query.date)) : undefined;
  const sheet = await FinancialClosingService.getBalanceSheet(tenant.companyId || undefined, asOf);
  res.json(sheet);
});

financialRouter.get("/statements/income-statement", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const income = await FinancialClosingService.getIncomeStatement(tenant.companyId || undefined, from, to);
  res.json(income);
});

// ==========================================
// 10. COST CENTERS & ANALYTICAL ACCOUNTING
// ==========================================
financialRouter.get("/cost-centers", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const list = await CostCenterService.listCostCenters(tenant.companyId || undefined);
  res.json({ data: list });
});

financialRouter.post("/cost-centers", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const { code, name, type, parentCode, managerName } = req.body;

  if (!code || !name) {
    res.status(400).json({ error: "missing_fields", message: "code e name são obrigatórios." });
    return;
  }

  const costCenter = await CostCenterService.createCostCenter({
    companyId: tenant.companyId || undefined,
    branchId: tenant.branchId ?? undefined,
    code,
    name,
    type,
    parentCode,
    managerName,
  });

  res.status(201).json({ message: "Centro de custo criado", data: costCenter });
});

financialRouter.get("/cost-centers/:id/report", async (req: Request, res: Response) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const report = await CostCenterService.getCostCenterReport(String(req.params.id), from, to);
  res.json(report);
});

// ==========================================
// 11. MULTI-COMPANY & CONSOLIDATION
// ==========================================
financialRouter.get("/consolidation", async (req: Request, res: Response) => {
  const asOf = req.query.date ? new Date(String(req.query.date)) : undefined;
  const data = await MultiCompanyService.getConsolidatedFinancials(asOf);
  res.json(data);
});
