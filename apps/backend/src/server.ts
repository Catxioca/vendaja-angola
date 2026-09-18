import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { authRouter } from "./routes/auth.js";
import { productRouter } from "./routes/products.js";
import { saleRouter } from "./routes/sales.js";
import { syncRouter } from "./routes/sync.js";
import { fiscalRouter } from "./routes/fiscal.js";
import { stockRouter } from "./routes/stock.js";
import { hrRouter } from "./routes/hr.js";
import { accountingRouter } from "./routes/accounting.js";

export const prisma = new PrismaClient();
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
app.use(express.json({ limit: "1mb" }));
app.get("/health", async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: "ok", service: "backend" }); }
  catch { res.status(503).json({ status: "unavailable" }); }
});
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/sales", saleRouter);
app.use("/api/v1/sync", syncRouter);
app.use("/api/v1/fiscal", fiscalRouter);
app.use("/api/v1/stock", stockRouter);
app.use("/api/v1/hr", hrRouter);
app.use("/api/v1/accounting", accountingRouter);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err); res.status(500).json({ error: "internal_error" });
});
const port = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== "test") app.listen(port, () => console.log(`API listening on ${port}`));
export default app;
