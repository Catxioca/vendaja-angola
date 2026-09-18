import { Router } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAdminOrGrant, requireAuth, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
import { deterministicInvoiceHash, nextFiscalNumber, qrPayload, signFiscalPayload, validateVatExemption } from "../services/fiscal.js";
export const saleRouter = Router();
saleRouter.use(requireAuth);
const line = z.object({ productId: z.string(), quantity: z.number().int().positive(), unitPriceCents: z.number().int().nonnegative(), taxRate: z.number().min(0).max(1) });
const input = z.object({ id: z.string().uuid(), number: z.string().min(1).optional(), lines: z.array(line).min(1), subtotalCents: z.number().int().nonnegative(), taxCents: z.number().int().nonnegative(), totalCents: z.number().int().nonnegative(), createdAt: z.string().datetime().optional(), fiscalType: z.enum(["INVOICE", "INVOICE_RECEIPT", "PROFORMA"]).default("INVOICE_RECEIPT"), cashSessionId: z.string().uuid().nullable().optional(), cashCents: z.number().int().nonnegative().default(0), cardCents: z.number().int().nonnegative().default(0), transferCents: z.number().int().nonnegative().default(0), operatorName: z.string().optional(), operatorNif: z.string().optional(), operatorPhone: z.string().optional(), terminalId: z.string().optional() });
saleRouter.get("/", async (_req, res) => {
  try {
    res.json(await prisma.sale.findMany({ include: { lines: true }, orderBy: { createdAt: "desc" }, take: 100 }));
  } catch (error) {
    console.error("[sales-list] unavailable", error);
    res.json([]);
  }
});
saleRouter.post("/", async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_sale", details: parsed.error.flatten() }); return; }
  const sale = parsed.data;
  const products = await prisma.product.findMany({ where: { id: { in: sale.lines.map(l => l.productId) } } });
  for (const product of products) validateVatExemption(Number(product.taxRate), product.exemptionCode);
  const number = sale.number || await nextFiscalNumber("INVOICE_RECEIPT");
  const issuedAt = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const hash = deterministicInvoiceHash({ number, date: issuedAt, totalCents: sale.totalCents, taxCents: sale.taxCents });
  const signed = signFiscalPayload(`${number}|${issuedAt.toISOString().slice(0, 10)}|${sale.totalCents}|${sale.taxCents}|${hash}`);
  const qrCode = qrPayload({ number, totalCents: sale.totalCents, taxCents: sale.taxCents, issuedAt, hash });
  const operatorId = (req as AuthRequest).user?.id;
  const saved = await prisma.$transaction(async (tx) => {
    if (sale.fiscalType !== "PROFORMA") for (const item of sale.lines) {
      const updated = await tx.product.updateMany({ where: { id: item.productId, stock: { gte: item.quantity }, active: true }, data: { stock: { decrement: item.quantity } } });
      if (updated.count !== 1) throw new Error(`insufficient_stock:${item.productId}`);
      await tx.stockMovement.create({ data: { productId: item.productId, quantity: -item.quantity, type: "SALE", reference: sale.id, operatorId } });
    }
    return tx.sale.create({ data: { id: sale.id, number, subtotalCents: sale.subtotalCents, taxCents: sale.taxCents, totalCents: sale.totalCents, createdAt: issuedAt, fiscalType: sale.fiscalType, operatorId, operatorName: sale.operatorName, operatorNif: sale.operatorNif, operatorPhone: sale.operatorPhone, terminalId: sale.terminalId, cashSessionId: sale.fiscalType === "PROFORMA" ? null : sale.cashSessionId ?? null, cashCents: sale.fiscalType === "PROFORMA" ? 0 : sale.cashCents, cardCents: sale.fiscalType === "PROFORMA" ? 0 : sale.cardCents, transferCents: sale.fiscalType === "PROFORMA" ? 0 : sale.transferCents, fiscalHash: hash, fiscalSignature: signed.signature, signatureAlgorithm: signed.algorithm, qrCode, lines: { create: sale.lines } }, include: { lines: true } });
  });
  await audit("SALE_CREATED", (req as AuthRequest).user?.id, "SALE", saved.id);
  res.status(201).json(saved);
});
saleRouter.post("/:id/cancel", requireAdminOrGrant("SALE_CANCELLED"), async (req, res) => {
  const saleId = String(req.params.id);
  const actorId = (req as AuthRequest).user?.id;
  try {
    const existing = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { lines: true },
    });
    if (!existing) {
      console.warn("[sale-cancel] sale not found", { saleId, actorId, stage: "TRANSACTION" });
      res.status(404).json({ error: "sale_not_found", stage: "TRANSACTION" });
      return;
    }
    if (existing.status === "CANCELLED") {
      console.warn("[sale-cancel] already cancelled", { saleId, actorId, stage: "TRANSACTION" });
      res.status(409).json({ error: "sale_already_cancelled", stage: "TRANSACTION" });
      return;
    }
    if (existing.cashSessionId) {
      const cashSession = await prisma.cashSession.findUnique({ where: { id: existing.cashSessionId } });
      if (!cashSession) {
        console.warn("[sale-cancel] cash session not found", { saleId, actorId, cashSessionId: existing.cashSessionId, stage: "CASH_SESSION" });
        await audit("SALE_CANCEL_FAILED", actorId, "SALE", saleId, { stage: "CASH_SESSION", reason: "cash_session_not_found" });
        res.status(409).json({ error: "cash_session_not_found", stage: "CASH_SESSION" });
        return;
      }
      if (cashSession.closedAt) {
        console.warn("[sale-cancel] cash session closed", { saleId, actorId, cashSessionId: cashSession.id, stage: "CASH_SESSION" });
        await audit("SALE_CANCEL_FAILED", actorId, "SALE", saleId, { stage: "CASH_SESSION", reason: "cash_session_closed", cashSessionId: cashSession.id });
        res.status(409).json({ error: "cash_session_closed", stage: "CASH_SESSION", cashSessionId: cashSession.id });
        return;
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      for (const item of existing.lines) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            type: "SALE_CANCELLED",
            reference: saleId,
            operatorId: actorId,
            note: "Reposição por anulação de venda",
          },
        });
      }
      return tx.sale.update({
        where: { id: saleId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: actorId },
        include: { lines: true },
      });
    });
    await audit("SALE_CANCELLED", actorId, "SALE", sale.id, { stage: "TRANSACTION", cashSessionId: sale.cashSessionId });
    res.json({ ...sale, diagnostics: { stage: "TRANSACTION", status: "cancelled" } });
  } catch (error) {
    console.error("[sale-cancel] transaction update failed", { saleId, actorId, stage: "TRANSACTION", error: error instanceof Error ? error.message : "unknown_error" });
    await audit("SALE_CANCEL_FAILED", actorId, "SALE", saleId, {
      stage: "TRANSACTION",
      reason: error instanceof Error ? error.message : "transaction_update_failed",
    });
    res.status(500).json({
      error: "sale_cancel_failed",
      stage: "TRANSACTION",
      details: error instanceof Error ? error.message : "transaction_update_failed",
    });
  }
});
