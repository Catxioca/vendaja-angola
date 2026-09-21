import { Router } from "express";
import { requireAuth, requireModuleAccess } from "../middleware/auth.js";
import { dashboardSummary, expensesReport, financialSummary, payablesReport, productsReport, purchasesReport, receivablesReport, salesReport, stockReport, type ReportFilters } from "../services/report-service.js";
import { cashflowReport } from "../services/cashflow-service.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireModuleAccess("DASHBOARD"));
function parseFilters(query: Record<string, unknown>): ReportFilters {
  const date = (value: unknown, end = false) => {
    if (typeof value !== "string") return undefined;
    const normalized = end && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999` : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
  };
  return { from: date(query.from), to: date(query.to, true), productId: typeof query.productId === "string" ? query.productId : undefined, categoryId: typeof query.categoryId === "string" ? query.categoryId : undefined, customerId: typeof query.customerId === "string" ? query.customerId : undefined, operatorId: typeof query.operatorId === "string" ? query.operatorId : undefined, supplierId: typeof query.supplierId === "string" ? query.supplierId : undefined, paymentMethod: typeof query.paymentMethod === "string" ? query.paymentMethod : undefined, status: typeof query.status === "string" ? query.status : undefined };
}
const handlers = { sales: salesReport, products: productsReport, stock: stockReport, purchases: purchasesReport, expenses: expensesReport, receivables: receivablesReport, payables: payablesReport, summary: financialSummary, cashflow: cashflowReport };
reportsRouter.get("/dashboard/summary", async (req, res) => {
  res.json(await dashboardSummary(parseFilters(req.query as Record<string, unknown>)));
});
reportsRouter.get("/:type/export", async (req, res) => {
  const handler = handlers[req.params.type as keyof typeof handlers];
  if (!handler) { res.status(404).json({ error: "report_not_found" }); return; }
  const result = await handler(parseFilters(req.query as Record<string, unknown>)) as { rows?: Array<Record<string, unknown>> };
  const rows = result.rows ?? [];
  const keys = rows.length ? Object.keys(rows[0] ?? {}) : ["message"];
  const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
  res.type("text/csv").set("Content-Disposition", `attachment; filename="${req.params.type}-report.csv"`).send(csv);
});
reportsRouter.get("/:type", async (req, res) => {
  const handler = handlers[req.params.type as keyof typeof handlers];
  if (!handler) { res.status(404).json({ error: "report_not_found" }); return; }
  res.json(await handler(parseFilters(req.query as Record<string, unknown>)));
});
