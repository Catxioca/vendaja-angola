import { Router } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";

export const stockRouter = Router();
stockRouter.use(requireAuth);
stockRouter.get("/movements", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(await prisma.stockMovement.findMany({ include: { product: true, operator: { select: { id: true, username: true, displayName: true } } }, orderBy: { occurredAt: "desc" }, take: limit }));
});
const entry = z.object({ productId: z.string(), quantity: z.number().int().positive(), type: z.enum(["ENTRY", "ADJUSTMENT"]), supplierId: z.string().optional(), note: z.string().max(500).optional(), occurredAt: z.string().datetime().optional() });
stockRouter.post("/entries", requireRole("ADMIN"), async (req, res) => {
  const parsed = entry.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_stock_entry" }); return; }
  const actor = (req as AuthRequest).user;
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id: parsed.data.productId }, data: { stock: { increment: parsed.data.quantity } } });
    const movement = await tx.stockMovement.create({ data: { ...parsed.data, occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined, operatorId: actor?.id } });
    return { product, movement };
  });
  const adjustment = z.object({ productId: z.string(), quantity: z.number().int().refine((value) => value !== 0), note: z.string().max(500).optional() });
  stockRouter.post("/adjustments", requireRole("ADMIN"), async (req, res) => {
    const parsed = adjustment.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_stock_adjustment" }); return; }
    const actor = (req as AuthRequest).user;
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: parsed.data.productId } });
      if (!product || product.stock + parsed.data.quantity < 0) throw new Error("insufficient_stock");
      const updated = await tx.product.update({ where: { id: product.id }, data: { stock: { increment: parsed.data.quantity } } });
      const movement = await tx.stockMovement.create({ data: { productId: product.id, quantity: parsed.data.quantity, type: parsed.data.quantity > 0 ? "ENTRY" : "ADJUSTMENT", note: parsed.data.note, operatorId: actor?.id } });
      return { product: updated, movement };
    });
    await audit("STOCK_ADJUSTED", actor?.id, "PRODUCT", parsed.data.productId, { quantity: parsed.data.quantity });
    res.status(201).json(result);
  });
  await audit("STOCK_ENTRY", actor?.id, "PRODUCT", parsed.data.productId, { quantity: parsed.data.quantity });
  res.status(201).json(result);
});
