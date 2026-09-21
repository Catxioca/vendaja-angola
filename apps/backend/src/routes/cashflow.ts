import { Router } from "express";
import { requireAuth, requireModuleAccess } from "../middleware/auth.js";
import { cashflowReport, type CashflowFilters } from "../services/cashflow-service.js";

export const cashflowRouter = Router();
cashflowRouter.use(requireAuth, requireModuleAccess("ACCOUNTING"));

cashflowRouter.get("/", async (req, res) => {
  const date = (value: unknown, end = false) => {
    if (typeof value !== "string") return undefined;
    const parsed = new Date(end && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999` : value);
    return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
  };
  const direction = req.query.direction === "IN" || req.query.direction === "OUT" ? req.query.direction : undefined;
  const filters: CashflowFilters = {
    from: date(req.query.from),
    to: date(req.query.to, true),
    direction,
    origin: typeof req.query.origin === "string" ? req.query.origin : undefined,
    paymentMethod: typeof req.query.paymentMethod === "string" ? req.query.paymentMethod : undefined,
  };
  res.json(await cashflowReport(filters));
});
