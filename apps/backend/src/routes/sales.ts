import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../server.js";
import { requireAdminOrGrant, requireAuth, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
import { deterministicInvoiceHash, nextFiscalNumber, qrPayload, signFiscalPayload } from "../services/fiscal.js";
import { calculateSale } from "../services/sale-calculation.js";
import { validateSalePayments } from "../services/payment-integrity.js";
import { canManageCashSession } from "../services/authorization.js";
import { validateCreditSale } from "../services/credit-integrity.js";
export const saleRouter = Router();
saleRouter.use(requireAuth);
const line = z.object({ productId: z.string(), quantity: z.number().int().positive(), unitPriceCents: z.number().int().nonnegative().optional(), taxRate: z.number().min(0).max(1).optional() });
const input = z.object({ id: z.string().uuid(), number: z.string().min(1).optional(), lines: z.array(line).min(1), subtotalCents: z.number().int().nonnegative().optional(), taxCents: z.number().int().nonnegative().optional(), totalCents: z.number().int().nonnegative().optional(), discountCents: z.number().int().nonnegative().optional(), createdAt: z.string().datetime().optional(), fiscalType: z.enum(["INVOICE", "INVOICE_RECEIPT", "PROFORMA"]).default("INVOICE_RECEIPT"), paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "CREDIT"]).default("CASH"), customerId: z.string().uuid().nullable().optional(), dueDate: z.string().datetime().nullable().optional(), cashSessionId: z.string().uuid().nullable().optional(), cashCents: z.number().int().nonnegative().default(0), cardCents: z.number().int().nonnegative().default(0), transferCents: z.number().int().nonnegative().default(0), operatorName: z.string().optional(), operatorNif: z.string().optional(), operatorPhone: z.string().optional(), terminalId: z.string().optional() });
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
  const existing = await prisma.sale.findUnique({ where: { id: sale.id }, include: { lines: true } });
  if (existing) { res.status(200).json(existing); return; }
  let calculated;
  try {
    calculated = await calculateSale(prisma, sale.lines.map(({ productId, quantity }) => ({ productId, quantity })), sale.discountCents);
  } catch (error) {
    res.status(400).json({ error: "invalid_sale_values", message: error instanceof Error ? error.message : "Os valores da venda são inválidos." });
    return;
  }
  try {
    if (sale.paymentMethod === "CREDIT") {
      validateCreditSale(sale);
    } else validateSalePayments(calculated.totalCents, { cashCents: sale.cashCents, cardCents: sale.cardCents, transferCents: sale.transferCents }, sale.fiscalType);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "invalid_payment" });
    return;
  }
  const issuedAt = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const operatorId = (req as AuthRequest).user?.id;
  try {
    const saved = await prisma.$transaction(async (tx) => {
      if (sale.paymentMethod === "CREDIT") {
        const locked = await tx.$queryRaw<Array<{ id: string; active: boolean; creditLimitCents: number; outstandingDebtCents: number }>>`SELECT "id","active","creditLimitCents","outstandingDebtCents" FROM "Customer" WHERE "id" = ${sale.customerId} FOR UPDATE`;
        const customer = locked[0];
        if (!customer || !customer.active) throw new Error("customer_inactive");
        if (customer.outstandingDebtCents + calculated.totalCents > customer.creditLimitCents) throw new Error("credit_limit_exceeded");
        await tx.customer.update({ where: { id: customer.id }, data: { outstandingDebtCents: { increment: calculated.totalCents } } });
      }
      if (sale.fiscalType !== "PROFORMA" && (sale.cashCents > 0 || sale.cashSessionId)) {
        if (!sale.cashSessionId) throw new Error("cash_session_required");
        const session = await tx.cashSession.findUnique({ where: { id: sale.cashSessionId } });
        if (!session) throw new Error("cash_session_not_found");
        if (!canManageCashSession(session.openedBy, operatorId, (req as AuthRequest).user?.role)) throw new Error("cash_session_forbidden");
        if (session.closedAt) throw new Error("cash_session_closed");
      }
      const series = (await tx.fiscalConfig.findUnique({ where: { id: "default" }, select: { invoiceSeries: true } }))?.invoiceSeries ?? "A";
      const number = await nextFiscalNumber(sale.fiscalType, series, tx);
      const hash = deterministicInvoiceHash({ number, date: issuedAt, subtotalCents: calculated.subtotalCents, totalCents: calculated.totalCents, taxCents: calculated.taxCents });
      const signed = signFiscalPayload(`${number}|${issuedAt.toISOString().slice(0, 10)}|${calculated.subtotalCents}|${calculated.totalCents}|${calculated.taxCents}|${hash}`);
      const qrCode = qrPayload({ number, totalCents: calculated.totalCents, taxCents: calculated.taxCents, issuedAt, hash });
      if (sale.fiscalType !== "PROFORMA" && sale.cashSessionId) {
        const lockedSessions = await tx.$queryRaw<Array<{ id: string; openedBy: string; closedAt: Date | null }>>`
          SELECT "id", "openedBy", "closedAt"
          FROM "CashSession"
          WHERE "id" = ${sale.cashSessionId}
          FOR UPDATE
        `;
        const lockedSession = lockedSessions[0];
        if (!lockedSession) throw new Error("cash_session_not_found");
        if (lockedSession.closedAt) throw new Error("cash_session_closed");
      }
      if (sale.fiscalType !== "PROFORMA") for (const item of calculated.lines) {
        const updated = await tx.product.updateMany({ where: { id: item.productId, stock: { gte: item.quantity }, active: true }, data: { stock: { decrement: item.quantity } } });
        if (updated.count !== 1) throw new Error(`insufficient_stock:${item.productId}`);
        await tx.stockMovement.create({ data: { productId: item.productId, quantity: -item.quantity, type: "SALE", reference: sale.id, operatorId } });
      }
      const created = await tx.sale.create({ data: { id: sale.id, number, series, subtotalCents: calculated.subtotalCents, taxCents: calculated.taxCents, totalCents: calculated.totalCents, createdAt: issuedAt, fiscalType: sale.fiscalType, paymentMethod: sale.paymentMethod, customerId: sale.customerId ?? null, dueDate: sale.dueDate ? new Date(sale.dueDate) : null, operatorId, operatorName: sale.operatorName, operatorNif: sale.operatorNif, operatorPhone: sale.operatorPhone, terminalId: sale.terminalId, cashSessionId: sale.fiscalType === "PROFORMA" || sale.paymentMethod === "CREDIT" ? null : sale.cashSessionId ?? null, cashCents: sale.fiscalType === "PROFORMA" || sale.paymentMethod === "CREDIT" ? 0 : sale.cashCents, cardCents: sale.fiscalType === "PROFORMA" || sale.paymentMethod === "CREDIT" ? 0 : sale.cardCents, transferCents: sale.fiscalType === "PROFORMA" || sale.paymentMethod === "CREDIT" ? 0 : sale.transferCents, fiscalHash: hash, fiscalSignature: signed.signature, signatureAlgorithm: signed.algorithm, qrCode, lines: { create: calculated.lines } }, include: { lines: true } });
      await audit("SALE_CREATED", operatorId, "SALE", created.id, { stage: "TRANSACTION" }, tx);
      return created;
    });
    res.status(201).json(saved);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await prisma.sale.findUnique({ where: { id: sale.id }, include: { lines: true } });
      if (concurrent) { res.status(200).json(concurrent); return; }
    }
    const code = error instanceof Error ? error.message : "";
    if (["credit_customer_due_date_required", "credit_payment_not_allowed", "customer_inactive", "credit_limit_exceeded"].includes(code)) {
      res.status(400).json({ error: code });
      return;
    }
    throw error;
  }
});
saleRouter.post("/:id/cancel", requireAdminOrGrant("SALE_CANCELLED"), async (req, res) => {
  const saleId = String(req.params.id);
  const actorId = (req as AuthRequest).user?.id;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({ where: { id: saleId }, include: { lines: true } });
      if (!existing) return { kind: "not_found" as const };
      if (existing.status === "CANCELLED") return { kind: "already_cancelled" as const, sale: existing };
      if (existing.cashSessionId) {
        const lockedSessions = await tx.$queryRaw<Array<{ id: string; openedBy: string; closedAt: Date | null }>>`
          SELECT "id", "openedBy", "closedAt"
          FROM "CashSession"
          WHERE "id" = ${existing.cashSessionId}
          FOR UPDATE
        `;
        const cashSession = lockedSessions[0];
        if (!cashSession) throw new Error("cash_session_not_found");
        if (cashSession.closedAt) throw new Error("cash_session_closed");
      }
      const claimed = await tx.sale.updateMany({
        where: { id: saleId, status: { not: "CANCELLED" } },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: actorId },
      });
      if (claimed.count !== 1) {
        const cancelled = await tx.sale.findUnique({ where: { id: saleId }, include: { lines: true } });
        if (cancelled?.status === "CANCELLED") return { kind: "already_cancelled" as const, sale: cancelled };
        return { kind: "not_found" as const };
      }
      if (existing.paymentMethod === "CREDIT" && existing.customerId) {
        await tx.customer.update({ where: { id: existing.customerId }, data: { outstandingDebtCents: { decrement: existing.totalCents } } });
      }
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
      const cancelled = await tx.sale.findUnique({ where: { id: saleId }, include: { lines: true } });
      if (!cancelled) throw new Error("sale_not_found_after_cancel");
      await audit("SALE_CANCELLED", actorId, "SALE", cancelled.id, { stage: "TRANSACTION", cashSessionId: cancelled.cashSessionId }, tx);
      return { kind: "cancelled" as const, sale: cancelled };
    });
    if (result.kind === "not_found") {
      console.warn("[sale-cancel] sale not found", { saleId, actorId, stage: "TRANSACTION" });
      res.status(404).json({ error: "sale_not_found", stage: "TRANSACTION" });
      return;
    }
    if (result.kind === "already_cancelled") {
      console.warn("[sale-cancel] already cancelled", { saleId, actorId, stage: "TRANSACTION" });
      res.status(200).json({ ...result.sale, diagnostics: { stage: "TRANSACTION", status: "already_cancelled" } });
      return;
    }
    res.json({ ...result.sale, diagnostics: { stage: "TRANSACTION", status: "cancelled" } });
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
