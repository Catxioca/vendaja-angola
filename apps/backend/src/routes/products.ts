import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdminOrGrant, requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
export const productRouter = Router();
productRouter.use(requireAuth);
productRouter.get("/", async (_req, res) => {
  try {
    res.json(await prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }));
  } catch (error) {
    console.error("[products-list] unavailable", error);
    res.json([]);
  }
});
const productInputBase = z.object({ sku: z.string().min(1), barcode: z.string().min(1).optional(), qrCode: z.string().min(1).optional().nullable(), name: z.string().min(1), priceCents: z.number().int().nonnegative(), costCents: z.number().int().nonnegative().default(0), stock: z.number().int().nonnegative().default(0), minStock: z.number().int().nonnegative().default(0), maxStock: z.number().int().positive().optional().nullable(), reorderQuantity: z.number().int().nonnegative().default(0), trackingMode: z.enum(["NONE", "LOT", "SERIAL"]).default("NONE"), taxRate: z.number().min(0).max(1).default(0.14), exemptionCode: z.string().max(20).optional(), categoryId: z.string().optional(), supplierId: z.string().optional(), imageUrl: z.string().max(3_000_000).optional().nullable(), brand: z.string().max(120).optional().nullable(), model: z.string().max(120).optional().nullable(), active: z.boolean().optional() });
const productInput = productInputBase.refine((value) => value.maxStock === null || value.maxStock === undefined || value.maxStock >= value.minStock, "maxStock_below_minStock");
productRouter.post("/", async (req, res) => {
  const parsed = productInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_product", details: parsed.error.flatten() }); return; }
  if (!["ADMIN", "ROLE_ADMIN"].includes(((req as AuthRequest).user?.role ?? "").toUpperCase())) { res.status(403).json({ error: "admin_required" }); return; }
  const actorId = (req as AuthRequest).user?.id;
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: parsed.data });
    if (created.stock > 0) {
      const movementId = randomUUID();
      await tx.stockMovement.create({ data: { id: movementId, productId: created.id, quantity: created.stock, type: "ENTRY", reference: `PRODUCT_INITIAL_STOCK:${movementId}`, operatorId: actorId, note: "Stock inicial do produto" } });
    }
    return created;
  });
  await audit("PRODUCT_CREATED", actorId, "PRODUCT", product.id, parsed.data); res.status(201).json(product);
});
productRouter.patch("/:id", requireAdminOrGrant("PRODUCT_UPDATED"), async (req, res) => {
  const parsed = productInputBase.partial().safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "invalid_product" }); return; }
  const updateSchema = productInputBase.partial().omit({ stock: true }).refine((value) => value.maxStock === null || value.maxStock === undefined || value.minStock === undefined || value.maxStock >= value.minStock, "maxStock_below_minStock");
  const update = updateSchema.safeParse(req.body);
  if (!update.success) { res.status(400).json({ error: "invalid_product" }); return; }
  const product = await prisma.product.update({ where: { id: String(req.params.id) }, data: update.data }); await audit("PRODUCT_UPDATED", (req as AuthRequest).user?.id, "PRODUCT", product.id, update.data); res.json(product);
});
productRouter.delete("/:id", requireAdminOrGrant("PRODUCT_DELETED"), async (req, res) => {
  const id = String(req.params.id);
  const product = await prisma.product.update({ where: { id }, data: { active: false } });
  await audit("PRODUCT_DELETED", (req as AuthRequest).user?.id, "PRODUCT", id);
  res.json(product);
});
