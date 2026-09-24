import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db.js";
export { prisma };
import { loadEnv } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { productRouter } from "./routes/products.js";
import { saleRouter } from "./routes/sales.js";
import { syncRouter } from "./routes/sync.js";
import { fiscalRouter } from "./routes/fiscal.js";
import { stockRouter } from "./routes/stock.js";
import { hrRouter } from "./routes/hr.js";
import { accountingRouter } from "./routes/accounting.js";
import { customerRouter, receivableRouter } from "./routes/customers.js";
import { localCashRouter } from "./routes/fiscal.js";
import { payableRouter, supplierRouter, purchaseRouter } from "./routes/purchases.js";
import { expenseRouter } from "./routes/expenses.js";
import { reportsRouter } from "./routes/reports.js";
import { cashflowRouter } from "./routes/cashflow.js";
import { commercialDocumentRouter } from "./routes/commercial-documents.js";
import { procurementRouter } from "./routes/procurement.js";
import { assertImmutableFiscalMutation } from "./services/fiscal-integrity.js";
import { platformRouter } from "./routes/platform.js";
import { openapiRouter } from "./routes/openapi.js";
import { correlationId, countMetric, logJson, metricsSnapshot } from "./services/observability.js";

const config = loadEnv();
prisma.$use(async (params, next) => {
  assertImmutableFiscalMutation(params.model, params.action, params.args?.data, params.args?.where);
  return next(params.args);
});
const app = express();
app.set("trust proxy", config.TRUST_PROXY);
app.disable("x-powered-by");
app.use((req, res, next) => {
  const id = correlationId(req.header("x-correlation-id"));
  res.setHeader("x-correlation-id", id);
  const started = Date.now();
  res.on("finish", () => {
    countMetric(`http_requests_total{method="${req.method}",path="${req.path}",status="${res.statusCode}"}`);
    logJson(res.statusCode >= 500 ? "error" : "info", "http_request", { correlationId: id, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started });
  });
  next();
});
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
const allowedOrigins = (config.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 && config.NODE_ENV !== "production") return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-authorization", "x-correlation-id", "x-company-id", "x-branch-id"],
}));
app.use(express.json({ limit: "1mb" }));
app.get("/health", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ok", service: "backend" }); }
  catch { res.status(503).json({ status: "unavailable" }); }
});
app.get("/api/health", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ok", service: "backend" }); }
  catch { res.status(503).json({ status: "unavailable" }); }
});
app.get("/ready", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ready", service: "backend" }); }
  catch { res.status(503).json({ status: "not_ready" }); }
});
app.get("/metrics", (_req, res) => {
  res.type("application/json").json(metricsSnapshot());
});
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/sales", saleRouter);
app.use("/api/v1/sync", syncRouter);
app.use("/api/v1/fiscal", fiscalRouter);
app.use("/api/v1/cashier", localCashRouter);
app.use("/api/v1/stock", stockRouter);
app.use("/api/v1/hr", hrRouter);
app.use("/api/v1/accounting", accountingRouter);
app.use("/api/v1/customers", customerRouter);
app.use("/api/v1/receivables", receivableRouter);
app.use("/api/v1/suppliers", supplierRouter);
app.use("/api/v1/purchases", purchaseRouter);
app.use("/api/v1/payables", payableRouter);
app.use("/api/v1/expenses", expenseRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/cashflow", cashflowRouter);
app.use("/api/v1/commercial-documents", commercialDocumentRouter);
app.use("/api/v1/procurement", procurementRouter);
app.use("/api/v1/platform", platformRouter);
app.use("/api/v1", openapiRouter);
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const id = res.getHeader("x-correlation-id");
  logJson("error", "http_error", { correlationId: id, path: req.path, message: err.message });
  res.status(500).json({ error: "internal_error", correlationId: id });
});
const port = config.PORT;
if (process.env.NODE_ENV !== "test") app.listen(port, () => console.log(`API listening on ${port}`));
export default app;
