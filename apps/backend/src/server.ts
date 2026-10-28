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
import { healthRouter } from "./routes/health.js";
import { securityGovernanceRouter } from "./routes/security-governance.js";
import { automationWorkflowRouter } from "./routes/automation-workflow.js";
import { crmDocumentsRouter } from "./routes/crm-documents.js";
import { apiV1PublicRouter } from "./routes/api-v1-public.js";
import { integrationsRouter } from "./routes/integrations.js";
import { financialRouter } from "./routes/financial.js";
import { businessIntelligenceRouter } from "./routes/business-intelligence.js";
import { cloudSaasRouter } from "./routes/cloud-saas.js";
import { portalsRouter } from "./routes/portals.js";
import { aiCopilotRouter } from "./routes/ai-copilot.js";
import { biometricsAccessRouter } from "./routes/biometrics-access.js";
import { corporateHeadquartersRouter } from "./routes/corporate-headquarters.js";
import { licenseRouter } from "./routes/license.js";
import { logger } from "./services/enterprise/logger.service.js";
import { correlationId, countMetric, logJson, metricsSnapshot } from "./services/observability.js";
import { getEnv } from "./config/env.js";
import jwt from "jsonwebtoken";

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
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // HSTS (HTTP Strict Transport Security): enforces HTTPS for all connections when SSL/TLS is active
  if (req.secure || req.header("x-forwarded-proto") === "https" || config.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  next();
});
import { isAllowedOrigin, isLoopbackOrLocalOrigin, isAllowedDomainOrigin } from "./services/cors-policy.js";
export { isAllowedOrigin, isLoopbackOrLocalOrigin, isAllowedDomainOrigin };

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Origin",
    "X-Requested-With",
    "x-admin-authorization",
    "x-correlation-id",
    "x-company-id",
    "x-branch-id",
    "x-api-key",
    "x-vendaja-signature",
    "x-client-id",
    "x-client-secret",
  ],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use("/health", healthRouter);
app.use("/api/health", healthRouter);
app.use("/api/v1/health", healthRouter);
app.get("/ready", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ready", service: "backend" }); }
  catch { res.status(503).json({ status: "not_ready" }); }
});
app.get("/metrics", (req, res) => {
  const isLoopback = req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1";
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token && !isLoopback) {
    res.status(401).json({ error: "unauthorized", message: "Autenticação requerida para métricas." });
    return;
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, getEnv().JWT_SECRET) as { id?: string; role?: string };
      if (decoded?.role !== "ROLE_ADMIN" && decoded?.role !== "ADMIN") {
        res.status(403).json({ error: "forbidden", message: "Acesso restrito a administradores." });
        return;
      }
    } catch {
      res.status(401).json({ error: "invalid_token", message: "Sessão inválida ou expirada." });
      return;
    }
  }
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
app.use("/api/v1/security", securityGovernanceRouter);
app.use("/api/v1/automation", automationWorkflowRouter);
app.use("/api/v1/crm", crmDocumentsRouter);
app.use("/api/v1/integrations", integrationsRouter);
app.use("/api/v1/financial", financialRouter);
app.use("/api/v1/bi", businessIntelligenceRouter);
app.use("/api/v1/saas", cloudSaasRouter);
app.use("/api/v1/portals", portalsRouter);
app.use("/api/v1/ai", aiCopilotRouter);
app.use("/api/ai", aiCopilotRouter);
app.use("/api/v1/biometrics", biometricsAccessRouter);
app.use("/api/v1/access-control", biometricsAccessRouter);
app.use("/api/v1/corporate", corporateHeadquartersRouter);
app.use("/api/corporate", corporateHeadquartersRouter);
app.use("/api/v1/license", licenseRouter);
app.use("/api/license", licenseRouter);
app.use("/api/v1", apiV1PublicRouter);
app.use("/api/v1", openapiRouter);
app.use("/api", openapiRouter);
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const id = res.getHeader("x-correlation-id");
  logJson("error", "http_error", { correlationId: id, path: req.path, message: err.message });
  res.status(500).json({ error: "internal_error", correlationId: id });
});
const port = config.PORT;
if (process.env.NODE_ENV !== "test") {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "isHeadquarters" BOOLEAN NOT NULL DEFAULT false;`);
    console.log("[server] Schema auto-heal: Branch.isHeadquarters verified.");
  } catch (err) {
    console.warn("[server] Schema auto-heal notice:", err);
  }
  app.listen(port, () => console.log(`API listening on ${port}`));
}
export default app;
