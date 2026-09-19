import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireModuleAccess, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";

export const stockRouter = Router();
stockRouter.use(requireAuth);
stockRouter.use(requireModuleAccess("STOCK"));

stockRouter.get("/movements", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(await prisma.stockMovement.findMany({ include: { product: true, operator: { select: { id: true, username: true, displayName: true } }, }, orderBy: { occurredAt: "desc" }, take: limit }));
});

const entry = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  type: z.enum(["ENTRY", "ADJUSTMENT"]),
  supplierId: z.string().optional(),
  note: z.string().max(500).optional(),
  occurredAt: z.string().datetime().optional(),
});

const adjustment = z.object({
  productId: z.string(),
  quantity: z.number().int().refine((value) => value !== 0),
  note: z.string().max(500).optional(),
});

function movementReference(type: string, id: string) {
  return `${type}:${id}`;
}

stockRouter.post("/entries", requireRole("ADMIN"), async (req, res) => {
  const parsed = entry.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_stock_entry" }); return; }
  const actor = (req as AuthRequest).user;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: { id: parsed.data.productId, active: true },
        data: { stock: { increment: parsed.data.quantity } },
      });
      if (updated.count !== 1) throw new Error("product_not_found");
      const movementId = randomUUID();
      const product = await tx.product.findUniqueOrThrow({ where: { id: parsed.data.productId } });
      const movement = await tx.stockMovement.create({
        data: {
          id: movementId,
          productId: parsed.data.productId,
          quantity: parsed.data.quantity,
          type: parsed.data.type,
          supplierId: parsed.data.supplierId,
          note: parsed.data.note,
          occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
          operatorId: actor?.id,
          reference: movementReference("STOCK_ENTRY", movementId),
        },
      });
      return { product, movement };
    });
    await audit("STOCK_ENTRY", actor?.id, "PRODUCT", parsed.data.productId, { quantity: parsed.data.quantity });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error && error.message === "product_not_found" ? "product_not_found" : "stock_entry_failed" });
  }
});

stockRouter.post("/adjustments", requireRole("ADMIN"), async (req, res) => {
  const parsed = adjustment.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_stock_adjustment" }); return; }
  const actor = (req as AuthRequest).user;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: {
          id: parsed.data.productId,
          active: true,
          ...(parsed.data.quantity < 0 ? { stock: { gte: Math.abs(parsed.data.quantity) } } : {}),
        },
        data: { stock: { increment: parsed.data.quantity } },
      });
      if (updated.count !== 1) throw new Error(parsed.data.quantity < 0 ? "insufficient_stock" : "product_not_found");
      const movementId = randomUUID();
      const product = await tx.product.findUniqueOrThrow({ where: { id: parsed.data.productId } });
      const movement = await tx.stockMovement.create({
        data: {
          id: movementId,
          productId: parsed.data.productId,
          quantity: parsed.data.quantity,
          type: parsed.data.quantity > 0 ? "ENTRY" : "ADJUSTMENT",
          note: parsed.data.note,
          operatorId: actor?.id,
          reference: movementReference("STOCK_ADJUSTMENT", movementId),
        },
      });
      return { product, movement };
    });
    await audit("STOCK_ADJUSTED", actor?.id, "PRODUCT", parsed.data.productId, { quantity: parsed.data.quantity });
    res.status(201).json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "stock_adjustment_failed";
    res.status(reason === "insufficient_stock" ? 409 : 400).json({ error: reason });
  }
});
