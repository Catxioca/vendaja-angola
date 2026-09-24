import { Router } from "express";
import { ensureAccountingPeriod, postPurchaseAccounting, postPayablePaymentAccounting } from "../services/accounting.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireModuleAccess, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
import { payableStatus, validatePaymentAmount } from "../services/payable-integrity.js";
import { applyStockChange } from "../services/stock-ledger.js";

export const supplierRouter = Router();
export const purchaseRouter = Router();
export const payableRouter = Router();
supplierRouter.use(requireAuth, requireModuleAccess("STOCK"));
purchaseRouter.use(requireAuth, requireModuleAccess("STOCK"));
payableRouter.use(requireAuth, requireModuleAccess("ACCOUNTING"));

const supplierInput = z.object({
  name: z.string().trim().min(2).max(200),
  nif: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  contactName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  code: z.string().trim().max(40).optional().nullable(),
  active: z.boolean().optional(),
});

supplierRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const active = typeof req.query.active === "string" ? req.query.active === "true" : undefined;
  res.json(await prisma.supplier.findMany({
    where: { ...(active === undefined ? {} : { active }), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { nif: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { _count: { select: { purchases: true } } }, orderBy: { name: "asc" }, take: 200,
  }));
});
supplierRouter.get("/:id", async (req, res) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: String(req.params.id) }, include: { purchases: { include: { lines: true, payable: true }, orderBy: { purchasedAt: "desc" }, take: 100 } } });
  if (!supplier) { res.status(404).json({ error: "supplier_not_found" }); return; }
  res.json(supplier);
});
supplierRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = supplierInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_supplier", details: parsed.error.flatten() }); return; }
  try {
    const supplier = await prisma.supplier.create({ data: parsed.data });
    await audit("SUPPLIER_CREATED", (req as AuthRequest).user?.id, "SUPPLIER", supplier.id);
    res.status(201).json(supplier);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "supplier_identifier_exists" }); return; }
    throw error;
  }
});
supplierRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = supplierInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_supplier", details: parsed.error.flatten() }); return; }
  try { const supplier = await prisma.supplier.update({ where: { id: String(req.params.id) }, data: parsed.data }); await audit("SUPPLIER_UPDATED", (req as AuthRequest).user?.id, "SUPPLIER", supplier.id); res.json(supplier); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "supplier_not_found" }); return; } throw error; }
});
supplierRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  try { res.json(await prisma.supplier.update({ where: { id: String(req.params.id) }, data: { active: false } })); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "supplier_not_found" }); return; } throw error; }
});

supplierRouter.get("/:id/prices", async (req, res) => {
  const prices = await prisma.supplierProductPrice.findMany({ where: { supplierId: String(req.params.id), OR: [{ validTo: null }, { validTo: { gt: new Date() } }] }, include: { product: true }, orderBy: { validFrom: "desc" } });
  res.json(prices);
});

supplierRouter.post("/:id/prices", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ productId: z.string().uuid(), unitCostCents: z.number().int().nonnegative(), validFrom: z.coerce.date().optional(), validTo: z.coerce.date().optional().nullable() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_supplier_price" }); return; }
  try {
    const price = await prisma.supplierProductPrice.create({ data: { supplierId: String(req.params.id), ...parsed.data } });
    res.status(201).json(price);
  } catch { res.status(400).json({ error: "supplier_price_failed" }); }
});

const lineInput = z.object({ productId: z.string().uuid(), quantity: z.number().int().positive(), unitCostCents: z.number().int().nonnegative(), taxRate: z.number().min(0).max(1).default(0) });
const purchaseInput = z.object({
  idempotencyKey: z.string().min(1).max(200), number: z.string().min(1).max(80), supplierId: z.string().uuid(),
  procurementOrderId: z.string().uuid().optional().nullable(),
  lines: z.array(lineInput).min(1), discountCents: z.number().int().nonnegative().default(0),
  paymentMethod: z.enum(["CASH", "TRANSFER", "CREDIT"]).default("CASH"), dueDate: z.coerce.date().optional(),
  documentNumber: z.string().max(100).optional().nullable(), purchasedAt: z.coerce.date().optional(), notes: z.string().max(1000).optional().nullable(),
});
purchaseRouter.get("/", async (req, res) => {
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
  res.json(await prisma.purchase.findMany({ where: supplierId ? { supplierId } : undefined, include: { supplier: true, lines: { include: { product: true } }, payable: true }, orderBy: { purchasedAt: "desc" }, take: 200 }));
});
purchaseRouter.get("/payables", async (_req, res) => res.json(await prisma.accountPayable.findMany({ include: { supplier: true, purchase: true, payments: { include: { operator: { select: { id: true, displayName: true, username: true } } }, orderBy: { paidAt: "desc" } } }, orderBy: { dueDate: "asc" } })));
purchaseRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = purchaseInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_purchase", details: parsed.error.flatten() }); return; }
  const actorId = (req as AuthRequest).user?.id;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.purchase.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey }, include: { lines: true, payable: true } });
      if (replay) return replay;
      const supplier = await tx.supplier.findUnique({ where: { id: parsed.data.supplierId } });
      if (!supplier?.active) throw new Error("supplier_inactive");
      const products = await tx.product.findMany({ where: { id: { in: parsed.data.lines.map((line) => line.productId) }, active: true } });
      const byId = new Map(products.map((product) => [product.id, product]));
      const lines = parsed.data.lines.map((line) => {
        if (!byId.has(line.productId)) throw new Error("product_not_found");
        return { ...line, totalCents: Math.round(line.quantity * line.unitCostCents * (1 + line.taxRate)) };
      });

      const payablePaymentInput = z.object({
        amountCents: z.number().int().positive(),
        paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"]).default("TRANSFER"),
        idempotencyKey: z.string().min(1).max(200),
        reference: z.string().trim().max(200).optional().nullable(),
        note: z.string().max(500).optional().nullable(),
        paidAt: z.coerce.date().optional(),
      });
      payableRouter.get("/:id", async (req, res) => {
        const payable = await prisma.accountPayable.findUnique({ where: { id: String(req.params.id) }, include: { supplier: true, purchase: true, payments: { include: { operator: { select: { id: true, displayName: true, username: true } } }, orderBy: { paidAt: "desc" } } } });
        if (!payable) { res.status(404).json({ error: "payable_not_found" }); return; }
        res.json({ ...payable, balanceCents: payable.originalCents - payable.paidCents });
      });
      payableRouter.post("/:id/payments", async (req, res) => {
        const parsed = payablePaymentInput.safeParse(req.body);
        if (!parsed.success) { res.status(400).json({ error: "invalid_payable_payment", details: parsed.error.flatten() }); return; }
        const payableId = String(req.params.id);
        const actorId = (req as AuthRequest).user?.id;
        try {
          const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.payablePayment.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey }, include: { payable: true } });
            if (existing) {
              if (existing.payableId !== payableId) throw new Error("idempotency_key_reused");
              return { payment: existing, payable: existing.payable, replay: true };
            }
            const locked = await tx.$queryRaw<Array<{ id: string; originalCents: number; paidCents: number; dueDate: Date }>>`SELECT "id", "originalCents", "paidCents", "dueDate" FROM "AccountPayable" WHERE "id" = ${payableId} FOR UPDATE`;
            if (!locked[0]) throw new Error("payable_not_found");
            const balanceCents = locked[0].originalCents - locked[0].paidCents;
            validatePaymentAmount(locked[0].originalCents, locked[0].paidCents, parsed.data.amountCents);
            const payment = await tx.payablePayment.create({ data: { payableId, amountCents: parsed.data.amountCents, paymentMethod: parsed.data.paymentMethod, idempotencyKey: parsed.data.idempotencyKey, reference: parsed.data.reference ?? null, note: parsed.data.note ?? null, paidAt: parsed.data.paidAt, operatorId: actorId } });
            await ensureAccountingPeriod(tx, payment.paidAt);
            await postPayablePaymentAccounting(tx, payment);
            const paidCents = locked[0].paidCents + parsed.data.amountCents;
            const status = payableStatus(locked[0].originalCents, paidCents, locked[0].dueDate);
            const payable = await tx.accountPayable.update({ where: { id: payableId }, data: { paidCents, status } });
            await audit("PAYABLE_PAYMENT", actorId, "PAYABLE_PAYMENT", payment.id, { payableId, amountCents: payment.amountCents }, tx);
            return { payment, payable, replay: false };
          });
          res.status(result.replay ? 200 : 201).json({ ...result, balanceCents: result.payable.originalCents - result.payable.paidCents });
        } catch (error) {
          const code = error instanceof Error ? error.message : "payable_payment_failed";
          const status = code === "payable_not_found" ? 404 : code === "payment_exceeds_outstanding" ? 409 : code === "idempotency_key_reused" ? 400 : 500;
          res.status(status).json({ error: code });
        }
      });
      const subtotalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
      const taxCents = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCostCents * line.taxRate), 0);
      const totalCents = subtotalCents - parsed.data.discountCents + taxCents;
      const purchase = await tx.purchase.create({ data: { number: parsed.data.number, supplierId: parsed.data.supplierId, procurementOrderId: parsed.data.procurementOrderId ?? null, operatorId: actorId, status: "CONFIRMED", paymentMethod: parsed.data.paymentMethod, subtotalCents, discountCents: parsed.data.discountCents, taxCents, totalCents, documentNumber: parsed.data.documentNumber ?? null, purchasedAt: parsed.data.purchasedAt, confirmedAt: new Date(), notes: parsed.data.notes ?? null, idempotencyKey: parsed.data.idempotencyKey, lines: { create: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCostCents: line.unitCostCents, taxRate: line.taxRate, totalCents: line.totalCents })) }, payable: parsed.data.paymentMethod === "CREDIT" ? { create: { supplierId: parsed.data.supplierId, originalCents: totalCents, dueDate: parsed.data.dueDate ?? new Date(Date.now() + 30 * 86400000) } } : undefined }, include: { lines: true, payable: true } });
      await ensureAccountingPeriod(tx, purchase.purchasedAt);
      await postPurchaseAccounting(tx, purchase);
      await audit("PURCHASE_CONFIRMED", actorId, "PURCHASE", purchase.id, { totalCents }, tx);
      return purchase;
    });

    res.status(201).json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "purchase_failed";
    res.status(code === "supplier_inactive" || code === "product_not_found" ? 409 : 400).json({ error: code });
  }
});

const receiptInput = z.object({
  reference: z.string().trim().min(1).max(120),
  locationId: z.string().uuid(),
  lines: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive(), lotNumber: z.string().trim().max(120).optional(), serialNumber: z.string().trim().max(120).optional(), expiresAt: z.coerce.date().optional() })).min(1),
});

purchaseRouter.post("/:id/receipts", requireRole("ADMIN"), async (req, res) => {
  const parsed = receiptInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_purchase_receipt" }); return; }
  const purchaseId = String(req.params.id);
  const operatorId = (req as AuthRequest).user?.id;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { lines: true } });
      if (!purchase) throw new Error("purchase_not_found");
      const existing = await tx.purchaseReceipt.findUnique({ where: { reference: parsed.data.reference }, include: { lines: true } });
      if (existing) {
        if (existing.purchaseId !== purchaseId) throw new Error("receipt_reference_reused");
        const samePayload = existing.lines.length === parsed.data.lines.length
          && existing.lines.every((line) => parsed.data.lines.some((candidate) => candidate.productId === line.productId && candidate.quantity === line.quantity));
        if (!samePayload) throw new Error("receipt_reference_conflict");
        return existing;
      }
      const ordered = new Map(purchase.lines.map((line) => [line.productId, line.quantity]));
      const received = await tx.purchaseReceiptLine.findMany({ where: { receipt: { purchaseId } } });
      const receivedByProduct = new Map<string, number>();
      for (const line of received) receivedByProduct.set(line.productId, (receivedByProduct.get(line.productId) ?? 0) + line.quantity);
      for (const line of parsed.data.lines) {
        const remaining = (ordered.get(line.productId) ?? 0) - (receivedByProduct.get(line.productId) ?? 0);
        if (remaining < line.quantity) throw new Error("receipt_exceeds_ordered");
      }
      const receipt = await tx.purchaseReceipt.create({ data: { purchaseId, reference: parsed.data.reference, operatorId, lines: { create: parsed.data.lines } }, include: { lines: true } });
      for (const line of parsed.data.lines) {
        const purchaseLine = purchase.lines.find((candidate) => candidate.productId === line.productId);
        await applyStockChange(tx, { productId: line.productId, locationId: parsed.data.locationId, quantity: line.quantity, type: "PURCHASE_RECEIPT", reference: `RECEIPT:${receipt.id}`, operatorId, supplierId: purchase.supplierId, lotNumber: line.lotNumber, serialNumber: line.serialNumber, expiresAt: line.expiresAt });
        await tx.product.update({ where: { id: line.productId }, data: { costCents: purchaseLine?.unitCostCents ?? undefined } });
      }
      const totalOrdered = purchase.lines.reduce((sum, line) => sum + line.quantity, 0);
      const totalReceived = [...receivedByProduct.values()].reduce((sum, quantity) => sum + quantity, 0) + parsed.data.lines.reduce((sum, line) => sum + line.quantity, 0);
      await tx.purchase.update({ where: { id: purchaseId }, data: { status: totalReceived >= totalOrdered ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
      return receipt;
    });
    await audit("PURCHASE_RECEIPT", operatorId, "PURCHASE_RECEIPT", result.id, { purchaseId });
    res.status(201).json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "purchase_receipt_failed";
    res.status(code === "purchase_not_found" ? 404 : code === "receipt_exceeds_ordered" || code === "receipt_reference_conflict" ? 409 : 400).json({ error: code });
  }
});
