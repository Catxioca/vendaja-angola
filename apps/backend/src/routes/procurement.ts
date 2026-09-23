import { Router } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireModuleAccess, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";

export const procurementRouter = Router();
procurementRouter.use(requireAuth, requireModuleAccess("STOCK"));
const lines = z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive(), unitCostCents: z.number().int().nonnegative().optional() })).min(1);

procurementRouter.get("/requests", async (_req, res) => res.json(await prisma.procurementRequest.findMany({ include: { lines: true, quotations: true }, orderBy: { createdAt: "desc" }, take: 200 })));
procurementRouter.post("/requests", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ number: z.string().trim().min(1).max(80), lines: lines.transform((items) => items.map((item) => ({ productId: item.productId, quantity: item.quantity }))) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_procurement_request" }); return; }
  try {
    const result = await prisma.procurementRequest.create({ data: { number: parsed.data.number, requestedById: (req as AuthRequest).user?.id, lines: { create: parsed.data.lines } }, include: { lines: true } });
    await audit("PROCUREMENT_REQUEST_CREATED", (req as AuthRequest).user?.id, "PROCUREMENT_REQUEST", result.id);
    res.status(201).json(result);
  } catch { res.status(409).json({ error: "procurement_request_exists" }); }
});

procurementRouter.post("/quotations", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ number: z.string().trim().min(1).max(80), requestId: z.string().uuid().optional().nullable(), supplierId: z.string().uuid(), lines }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_supplier_quotation" }); return; }
  try {
    const result = await prisma.supplierQuotation.create({ data: { number: parsed.data.number, requestId: parsed.data.requestId ?? null, supplierId: parsed.data.supplierId, lines: { create: parsed.data.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCostCents: line.unitCostCents ?? 0 })) } }, include: { lines: true } });
    await audit("SUPPLIER_QUOTATION_CREATED", (req as AuthRequest).user?.id, "SUPPLIER_QUOTATION", result.id);
    res.status(201).json(result);
  } catch { res.status(409).json({ error: "supplier_quotation_exists" }); }
});

procurementRouter.post("/orders", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ number: z.string().trim().min(1).max(80), quotationId: z.string().uuid().optional().nullable(), supplierId: z.string().uuid(), lines: lines.refine((items) => items.every((item) => item.unitCostCents !== undefined), "unit_cost_required") }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_procurement_order" }); return; }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.create({ data: { number: parsed.data.number, quotationId: parsed.data.quotationId ?? null, supplierId: parsed.data.supplierId, lines: { create: parsed.data.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCostCents: line.unitCostCents! })) } }, include: { lines: true } });
      if (parsed.data.quotationId) await tx.supplierQuotation.update({ where: { id: parsed.data.quotationId }, data: { status: "CONVERTED_TO_ORDER" } });
      return order;
    });
    await audit("SUPPLIER_QUOTATION_CONVERTED_TO_ORDER", (req as AuthRequest).user?.id, "PROCUREMENT_ORDER", result.id, { quotationId: parsed.data.quotationId ?? null });
    res.status(201).json(result);
  } catch { res.status(409).json({ error: "procurement_order_exists_or_invalid_source" }); }
});

procurementRouter.get("/orders", async (_req, res) => res.json(await prisma.procurementOrder.findMany({ include: { supplier: true, quotation: true, lines: true }, orderBy: { createdAt: "desc" }, take: 200 })));
