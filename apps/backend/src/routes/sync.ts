import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { prisma } from "../server.js";
import { calculateSale } from "../services/sale-calculation.js";
import { deterministicInvoiceHash, nextFiscalNumber, qrPayload, signFiscalPayload } from "../services/fiscal.js";
import { equivalentSale } from "../services/sync-idempotency.js";
import { validateSalePayments } from "../services/payment-integrity.js";
import { canManageCashSession } from "../services/authorization.js";

export const syncRouter = Router();
syncRouter.use(requireAuth);

const mutation = z.object({ id: z.string(), operation: z.enum(["CREATE", "UPDATE"]), entity: z.enum(["SALE", "PRODUCT"]), payload: z.unknown(), occurredAt: z.string().datetime() });
const saleSchema = z.object({
  id: z.string().uuid(),
  number: z.string().min(1).optional(),
  subtotalCents: z.number().int().nonnegative().optional(),
  taxCents: z.number().int().nonnegative().optional(),
  totalCents: z.number().int().nonnegative().optional(),
  discountCents: z.number().int().nonnegative().optional(),
  cashSessionId: z.string().uuid().nullable().optional(),
  cashCents: z.number().int().nonnegative().default(0),
  cardCents: z.number().int().nonnegative().default(0),
  transferCents: z.number().int().nonnegative().default(0),
  fiscalType: z.enum(["INVOICE", "INVOICE_RECEIPT", "PROFORMA"]).default("INVOICE_RECEIPT"),
  lines: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative().optional(),
    taxRate: z.number().min(0).max(1).optional(),
  })).min(1),
});

class SyncMutationRejected extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

async function recordMutation(
  item: z.infer<typeof mutation>,
  deviceId: string,
  saleId: string,
) {
  await prisma.syncMutation.create({
    data: {
      id: item.id,
      deviceId,
      entity: item.entity,
      operation: item.operation,
      occurredAt: new Date(item.occurredAt),
      saleId,
    },
  });
}

syncRouter.post("/", async (req, res) => {
  const parsed = z.object({ deviceId: z.string().min(1), mutations: z.array(mutation), lastCursor: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_sync", details: parsed.error.flatten() }); return; }

  const accepted: string[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const item of parsed.data.mutations) {
    if (item.entity !== "SALE" || item.operation !== "CREATE") {
      rejected.push({ id: item.id, reason: "unsupported_mutation" });
      continue;
    }

    const saleResult = saleSchema.safeParse(item.payload);
    if (!saleResult.success) {
      rejected.push({ id: item.id, reason: "invalid_sale" });
      continue;
    }
    const sale = saleResult.data;
    const operatorId = (req as AuthRequest).user?.id;

    try {
      await prisma.$transaction(async (tx) => {
        const existingMutation = await tx.syncMutation.findUnique({ where: { id: item.id } });
        if (existingMutation) {
          if (existingMutation.saleId !== sale.id) throw new SyncMutationRejected("mutation_sale_mismatch");
          return;
        }

        const existingSale = await tx.sale.findUnique({ where: { id: sale.id }, include: { lines: { select: { productId: true, quantity: true } } } });
        if (existingSale) {
          if (!equivalentSale(existingSale, sale)) throw new SyncMutationRejected("sale_payload_mismatch");
          await tx.syncMutation.create({
            data: { id: item.id, deviceId: parsed.data.deviceId, entity: item.entity, operation: item.operation, occurredAt: new Date(item.occurredAt), saleId: sale.id },
          });
          return;
        }

        const calculated = await calculateSale(tx, sale.lines.map(({ productId, quantity }) => ({ productId, quantity })), sale.discountCents);
        validateSalePayments(calculated.totalCents, { cashCents: sale.cashCents, cardCents: sale.cardCents, transferCents: sale.transferCents }, sale.fiscalType);
        if (sale.fiscalType !== "PROFORMA" && (sale.cashCents > 0 || sale.cashSessionId)) {
          if (!sale.cashSessionId) throw new Error("cash_session_required");
          const lockedSessions = await tx.$queryRaw<Array<{ id: string; openedBy: string; closedAt: Date | null }>>`
            SELECT "id", "openedBy", "closedAt"
            FROM "CashSession"
            WHERE "id" = ${sale.cashSessionId}
            FOR UPDATE
          `;
          const session = lockedSessions[0];
          if (!session) throw new Error("cash_session_not_found");
          if (!canManageCashSession(session.openedBy, operatorId, (req as AuthRequest).user?.role)) throw new Error("cash_session_forbidden");
          if (session.closedAt) throw new Error("cash_session_closed");
        }
        const series = (await tx.fiscalConfig.findUnique({ where: { id: "default" }, select: { invoiceSeries: true } }))?.invoiceSeries ?? "A";
        const number = await nextFiscalNumber(sale.fiscalType, series, tx);
        const issuedAt = new Date(item.occurredAt);
        const hash = deterministicInvoiceHash({ number, date: issuedAt, subtotalCents: calculated.subtotalCents, totalCents: calculated.totalCents, taxCents: calculated.taxCents });
        const signed = signFiscalPayload(`${number}|${issuedAt.toISOString().slice(0, 10)}|${calculated.subtotalCents}|${calculated.totalCents}|${calculated.taxCents}|${hash}`);
        const qrCode = qrPayload({ number, totalCents: calculated.totalCents, taxCents: calculated.taxCents, issuedAt, hash });

        await tx.sale.create({
          data: {
            id: sale.id,
            number,
            series,
            subtotalCents: calculated.subtotalCents,
            taxCents: calculated.taxCents,
            totalCents: calculated.totalCents,
            fiscalType: sale.fiscalType,
            fiscalHash: hash,
            fiscalSignature: signed.signature,
            signatureAlgorithm: signed.algorithm,
            qrCode,
            operatorId,
            cashSessionId: sale.fiscalType === "PROFORMA" ? null : sale.cashSessionId ?? null,
            cashCents: sale.fiscalType === "PROFORMA" ? 0 : sale.cashCents,
            cardCents: sale.fiscalType === "PROFORMA" ? 0 : sale.cardCents,
            transferCents: sale.fiscalType === "PROFORMA" ? 0 : sale.transferCents,
            lines: { create: calculated.lines },
          },
        });
        if (sale.fiscalType !== "PROFORMA") for (const line of calculated.lines) {
          const updated = await tx.product.updateMany({ where: { id: line.productId, stock: { gte: line.quantity }, active: true }, data: { stock: { decrement: line.quantity } } });
          if (updated.count !== 1) throw new Error("insufficient_stock");
          await tx.stockMovement.create({ data: { productId: line.productId, quantity: -line.quantity, type: "SALE", reference: sale.id, operatorId } });
        }
        await tx.syncMutation.create({
          data: { id: item.id, deviceId: parsed.data.deviceId, entity: item.entity, operation: item.operation, occurredAt: new Date(item.occurredAt), saleId: sale.id },
        });
      });
      accepted.push(item.id);
    } catch (error) {
      if (error instanceof SyncMutationRejected) {
        rejected.push({ id: item.id, reason: error.reason });
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrentMutation = await prisma.syncMutation.findUnique({ where: { id: item.id } });
        if (concurrentMutation) {
          if (concurrentMutation.saleId !== sale.id) rejected.push({ id: item.id, reason: "mutation_sale_mismatch" });
          else accepted.push(item.id);
          continue;
        }
        const concurrentSale = await prisma.sale.findUnique({ where: { id: sale.id }, include: { lines: { select: { productId: true, quantity: true } } } });
        if (concurrentSale && equivalentSale(concurrentSale, sale)) {
          try {
            await recordMutation(item, parsed.data.deviceId, sale.id);
            accepted.push(item.id);
          } catch (recordError) {
            if (recordError instanceof Prisma.PrismaClientKnownRequestError && recordError.code === "P2002") accepted.push(item.id);
            else throw recordError;
          }
          continue;
        }
      }
      console.error("sync mutation rejected", { mutationId: item.id, error });
      rejected.push({ id: item.id, reason: "rejected" });
    }
  }
  res.json({ accepted, rejected, cursor: new Date().toISOString() });
});
