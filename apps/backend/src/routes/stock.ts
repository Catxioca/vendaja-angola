import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { companyContext, requireAuth, requireCompanyContext, requireModuleAccess, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
import { applyStockChange, transferStock } from "../services/stock-ledger.js";

export const stockRouter = Router();
stockRouter.use(requireAuth, requireCompanyContext);
stockRouter.use(requireModuleAccess("STOCK"));

const locationInput = z.object({ warehouseId: z.string().uuid(), code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120) });
const warehouseInput = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120) });
const transferInput = z.object({
  sourceLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  reference: z.string().trim().min(1).max(120),
  lines: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
});
const inventoryInput = z.object({
  locationId: z.string().uuid(),
  reference: z.string().trim().min(1).max(120),
  lines: z.array(z.object({ productId: z.string().uuid(), countedQuantity: z.number().int().nonnegative() })).min(1),
}).superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.productId)).size !== value.lines.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["lines"], message: "duplicate_product" });
  }
});

async function assertStockScope(
  tx: Prisma.TransactionClient,
  tenant: ReturnType<typeof companyContext>,
  productIds: string[],
  locationIds: string[],
) {
  const [products, locations] = await Promise.all([
    tx.product.findMany({ where: { id: { in: productIds }, companyId: tenant.companyId, branchId: tenant.branchId, active: true }, select: { id: true } }),
    tx.stockLocation.findMany({ where: { id: { in: locationIds }, active: true, warehouse: { companyId: tenant.companyId, ...(tenant.branchId ? { branchId: tenant.branchId } : {}) } }, select: { id: true } }),
  ]);
  if (products.length !== new Set(productIds).size) throw new Error("product_not_found");
  if (locations.length !== new Set(locationIds).size) throw new Error("stock_location_not_found");
}

stockRouter.get("/warehouses", async (req, res) => {
  const tenant = companyContext(req);
  res.json(await prisma.warehouse.findMany({ where: { active: true, companyId: tenant.companyId, ...(tenant.branchId ? { branchId: tenant.branchId } : {}) }, include: { locations: { where: { active: true }, include: { _count: { select: { balances: true } } } } }, orderBy: { name: "asc" } }));
});

stockRouter.post("/warehouses", requireRole("ADMIN"), async (req, res) => {
  const parsed = warehouseInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_warehouse" }); return; }
  try {
    const tenant = companyContext(req);
    const warehouse = await prisma.warehouse.create({ data: { ...parsed.data, companyId: tenant.companyId, branchId: tenant.branchId } });
    await audit("WAREHOUSE_CREATED", (req as AuthRequest).user?.id, "WAREHOUSE", warehouse.id);
    res.status(201).json(warehouse);
  } catch { res.status(409).json({ error: "warehouse_code_exists" }); }
});

stockRouter.post("/locations", requireRole("ADMIN"), async (req, res) => {
  const parsed = locationInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_stock_location" }); return; }
  try {
    const tenant = companyContext(req);
    const warehouse = await prisma.warehouse.findFirst({ where: { id: parsed.data.warehouseId, companyId: tenant.companyId, ...(tenant.branchId ? { branchId: tenant.branchId } : {}) } });
    if (!warehouse) { res.status(404).json({ error: "warehouse_not_found" }); return; }
    const location = await prisma.stockLocation.create({ data: parsed.data });
    await audit("STOCK_LOCATION_CREATED", (req as AuthRequest).user?.id, "STOCK_LOCATION", location.id);
    res.status(201).json(location);
  } catch { res.status(409).json({ error: "stock_location_exists" }); }
});

stockRouter.get("/balances", async (req, res) => {
  const tenant = companyContext(req);
  const locationId = typeof req.query.locationId === "string" ? req.query.locationId : undefined;
  res.json(await prisma.stockBalance.findMany({ where: { ...(locationId ? { locationId } : {}), product: { companyId: tenant.companyId, ...(tenant.branchId ? { branchId: tenant.branchId } : {}) }, location: { warehouse: { companyId: tenant.companyId, ...(tenant.branchId ? { branchId: tenant.branchId } : {}) } } }, include: { product: true, location: { include: { warehouse: true } } }, orderBy: { updatedAt: "desc" }, take: 500 }));
});

stockRouter.get("/reorder-suggestions", async (req, res) => {
  const tenant = companyContext(req);
  const products = await prisma.product.findMany({ where: { active: true, minStock: { gt: 0 }, companyId: tenant.companyId, branchId: tenant.branchId }, include: { stockBalances: true }, orderBy: { name: "asc" } });
  res.json(products.filter((product) => product.stock <= product.minStock).map((product) => ({
    productId: product.id, sku: product.sku, name: product.name, currentStock: product.stock,
    minStock: product.minStock, maxStock: product.maxStock, suggestedQuantity: product.reorderQuantity || Math.max(0, (product.maxStock ?? product.minStock) - product.stock),
    locations: product.stockBalances,
  })));
});

stockRouter.post("/transfers", requireRole("ADMIN"), async (req, res) => {
  const parsed = transferInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_stock_transfer" }); return; }
  try {
    const tenant = companyContext(req);
    const result = await prisma.$transaction(async (tx) => {
      await assertStockScope(tx, tenant, parsed.data.lines.map(line => line.productId), [parsed.data.sourceLocationId, parsed.data.destinationLocationId]);
      return transferStock(tx, { ...parsed.data, operatorId: (req as AuthRequest).user?.id });
    });
    await audit("STOCK_TRANSFER", (req as AuthRequest).user?.id, "STOCK_TRANSFER", result.id, { reference: result.reference });
    res.status(201).json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "stock_transfer_failed";
    res.status(code === "insufficient_stock" ? 409 : 400).json({ error: code });
  }
});

stockRouter.post("/inventory-counts", requireRole("ADMIN"), async (req, res) => {
  const parsed = inventoryInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_inventory_count" }); return; }
  try {
    const tenant = companyContext(req);
    const result = await prisma.$transaction(async (tx) => {
      await assertStockScope(tx, tenant, parsed.data.lines.map(line => line.productId), [parsed.data.locationId]);
      const existing = await tx.inventoryCount.findUnique({ where: { reference: parsed.data.reference }, include: { lines: true } });
      if (existing) {
        const samePayload = existing.locationId === parsed.data.locationId
          && existing.lines.length === parsed.data.lines.length
          && existing.lines.every((line) => parsed.data.lines.some((candidate) => candidate.productId === line.productId && candidate.countedQuantity === line.countedQuantity));
        if (!samePayload) throw new Error("inventory_reference_conflict");
        return existing;
      }
      const balances = await tx.stockBalance.findMany({ where: { locationId: parsed.data.locationId, productId: { in: parsed.data.lines.map((line) => line.productId) } } });
      const expected = new Map(balances.map((balance) => [balance.productId, balance.quantity]));
      const count = await tx.inventoryCount.create({
        data: {
          locationId: parsed.data.locationId,
          reference: parsed.data.reference,
          status: "COMPLETED",
          countedAt: new Date(),
          operatorId: (req as AuthRequest).user?.id,
          lines: { create: parsed.data.lines.map((line) => ({ productId: line.productId, countedQuantity: line.countedQuantity, expectedQuantity: expected.get(line.productId) ?? 0 })) },
        },
        include: { lines: true },
      });
      for (const line of parsed.data.lines) {
        const delta = line.countedQuantity - (expected.get(line.productId) ?? 0);
        if (delta !== 0) {
          await applyStockChange(tx, { productId: line.productId, locationId: parsed.data.locationId, quantity: delta, type: "INVENTORY_ADJUSTMENT", reference: `INVENTORY:${count.id}`, operatorId: (req as AuthRequest).user?.id });
        }
      }
      return count;
    });
    await audit("INVENTORY_COUNT_COMPLETED", (req as AuthRequest).user?.id, "INVENTORY_COUNT", result.id);
    res.status(201).json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "inventory_count_failed";
    res.status(code === "insufficient_stock" || code === "inventory_reference_conflict" ? 409 : 400).json({ error: code });
  }
});

stockRouter.get("/movements", async (req, res) => {
  const tenant = companyContext(req);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(await prisma.stockMovement.findMany({ where: { product: { companyId: tenant.companyId, branchId: tenant.branchId } }, include: { product: true, operator: { select: { id: true, username: true, displayName: true } }, }, orderBy: { occurredAt: "desc" }, take: limit }));
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
  const tenant = companyContext(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: { id: parsed.data.productId, companyId: tenant.companyId, branchId: tenant.branchId, active: true },
        data: { stock: { increment: parsed.data.quantity } },
      });
      if (updated.count !== 1) throw new Error("product_not_found");
      const movementId = randomUUID();
      const product = await tx.product.findFirstOrThrow({ where: { id: parsed.data.productId, companyId: tenant.companyId, branchId: tenant.branchId } });
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
  const tenant = companyContext(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: {
          id: parsed.data.productId,
          companyId: tenant.companyId,
          branchId: tenant.branchId,
          active: true,
          ...(parsed.data.quantity < 0 ? { stock: { gte: Math.abs(parsed.data.quantity) } } : {}),
        },
        data: { stock: { increment: parsed.data.quantity } },
      });
      if (updated.count !== 1) throw new Error(parsed.data.quantity < 0 ? "insufficient_stock" : "product_not_found");
      const movementId = randomUUID();
      const product = await tx.product.findFirstOrThrow({ where: { id: parsed.data.productId, companyId: tenant.companyId, branchId: tenant.branchId } });
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
