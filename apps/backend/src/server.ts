import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { productRouter } from "./routes/products.js";
import { saleRouter } from "./routes/sales.js";
import { syncRouter } from "./routes/sync.js";
import { fiscalRouter } from "./routes/fiscal.js";
import { stockRouter } from "./routes/stock.js";
import { hrRouter } from "./routes/hr.js";
import { accountingRouter } from "./routes/accounting.js";
import { localCashRouter } from "./routes/fiscal.js";
import { assertImmutableFiscalMutation } from "./services/fiscal-integrity.js";

const config = loadEnv();
export const prisma = new PrismaClient();
prisma.$use(async (params, next) => {
  assertImmutableFiscalMutation(params.model, params.action, params.args?.data, params.args?.where);
  return next(params.args);
});
const app = express();
const allowedOrigins = (config.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-authorization", "x-correlation-id"],
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
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/sales", saleRouter);
app.use("/api/v1/sync", syncRouter);
app.use("/api/v1/fiscal", fiscalRouter);
app.use("/api/v1/cashier", localCashRouter);
app.use("/api/v1/stock", stockRouter);
app.use("/api/v1/hr", hrRouter);
app.use("/api/v1/accounting", accountingRouter);
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[http] internal error", { path: req.path, message: err.message });
  res.status(500).json({ error: "internal_error" });
});
const port = config.PORT;
if (process.env.NODE_ENV !== "test") app.listen(port, () => console.log(`API listening on ${port}`));
export default app;
