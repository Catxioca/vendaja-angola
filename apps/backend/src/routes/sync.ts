import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../server.js";
export const syncRouter = Router();
syncRouter.use(requireAuth);
const mutation = z.object({ id: z.string(), operation: z.enum(["CREATE", "UPDATE"]), entity: z.enum(["SALE", "PRODUCT"]), payload: z.unknown(), occurredAt: z.string().datetime() });
syncRouter.post("/", async (req, res) => {
  const parsed = z.object({ deviceId: z.string().min(1), mutations: z.array(mutation), lastCursor: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_sync", details: parsed.error.flatten() }); return; }
  const accepted: string[] = [], rejected: { id: string; reason: string }[] = [];
  for (const item of parsed.data.mutations) {
    if (item.entity !== "SALE" || item.operation !== "CREATE") { rejected.push({ id: item.id, reason: "unsupported_mutation" }); continue; }
    try {
      const saleSchema = z.object({
        id: z.string().uuid(),
        number: z.string().min(1),
        subtotalCents: z.number().int().nonnegative(),
        taxCents: z.number().int().nonnegative(),
        totalCents: z.number().int().nonnegative(),
        lines: z.array(z.object({
          productId: z.string(),
          quantity: z.number().int().positive(),
          unitPriceCents: z.number().int().nonnegative(),
          taxRate: z.number().min(0).max(1),
        })).min(1),
      });
      const saleResult = saleSchema.safeParse(item.payload);
      if (!saleResult.success) { rejected.push({ id: item.id, reason: "invalid_sale" }); continue; }
      const sale = saleResult.data;
      await prisma.$transaction(async (tx) => {
        const existing = await tx.syncMutation.findUnique({ where: { id: item.id } });
        if (existing) return;
        const existingSale = await tx.sale.findUnique({ where: { id: sale.id } });
        if (existingSale) {
          await tx.syncMutation.create({ data: { id: item.id, deviceId: parsed.data.deviceId, entity: item.entity, operation: item.operation, occurredAt: new Date(item.occurredAt), saleId: sale.id } });
          return;
        }
        for (const line of sale.lines) {
          const updated = await tx.product.updateMany({ where: { id: line.productId, stock: { gte: line.quantity }, active: true }, data: { stock: { decrement: line.quantity } } });
          if (updated.count !== 1) throw new Error("insufficient_stock");
          await tx.stockMovement.create({ data: { productId: line.productId, quantity: -line.quantity, type: "SALE", reference: sale.id, operatorId: (req as import("../middleware/auth.js").AuthRequest).user?.id } });
        }
        await tx.sale.upsert({
          where: { id: sale.id },
          create: { id: sale.id, number: sale.number, subtotalCents: sale.subtotalCents, taxCents: sale.taxCents, totalCents: sale.totalCents, operatorId: (req as import("../middleware/auth.js").AuthRequest).user?.id, lines: { create: sale.lines } },
          update: {},
        });
        await tx.syncMutation.create({
          data: { id: item.id, deviceId: parsed.data.deviceId, entity: item.entity, operation: item.operation, occurredAt: new Date(item.occurredAt), saleId: sale.id },
        });
      });
      accepted.push(item.id);
    } catch (error) {
      console.error("sync mutation rejected", { mutationId: item.id, error });
      rejected.push({ id: item.id, reason: "rejected" });
    }
  }
  res.json({ accepted, rejected, cursor: new Date().toISOString() });
});
