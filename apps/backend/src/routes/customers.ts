import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
import { canManageCashSession } from "../services/authorization.js";
import { receivableStatus } from "../services/credit-integrity.js";

export const customerRouter = Router();
customerRouter.use(requireAuth);
export const receivableRouter = Router();
receivableRouter.use(requireAuth);
const customerInput = z.object({
  name: z.string().trim().min(1).max(200), nif: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(), phone: z.string().trim().max(40).optional().nullable(), address: z.string().max(300).optional().nullable(),
  active: z.boolean().optional(), creditLimitCents: z.number().int().nonnegative().optional(),
});

customerRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const customers = await prisma.customer.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { nif: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : undefined,
    orderBy: { name: "asc" }, take: 100,
  });
  res.json(customers);
});
async function listReceivables(_req: Request, res: Response) {
  const customers = await prisma.customer.findMany({
    where: { outstandingDebtCents: { gt: 0 } },
    include: { sales: { where: { paymentMethod: "CREDIT", status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" } }, receivablePayments: { orderBy: { receivedAt: "desc" }, take: 100 } },
    orderBy: { updatedAt: "asc" },
  });
  res.json(customers.map((customer) => {
    const totalInvoicedCents = customer.sales.reduce((sum, sale) => sum + sale.totalCents, 0);
    const totalPaidCents = customer.receivablePayments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const status = customer.outstandingDebtCents > 0 && totalPaidCents > 0
      ? "PARCIAL"
      : receivableStatus(customer.outstandingDebtCents, customer.sales[customer.sales.length - 1]?.dueDate ?? null);
    return { ...customer, status, totalInvoicedCents, totalPaidCents };
  }));
}
customerRouter.get("/receivables", listReceivables);
receivableRouter.get("/", listReceivables);
customerRouter.post("/", async (req, res) => {
  const parsed = customerInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_customer", details: parsed.error.flatten() }); return; }
  try {
    const customer = await prisma.customer.create({ data: parsed.data });
    await audit("CUSTOMER_CREATED", (req as AuthRequest).user?.id, "CUSTOMER", customer.id);
    res.status(201).json(customer);
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "customer_nif_exists" }); return; } throw error; }
});
customerRouter.get("/:id", async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: String(req.params.id) }, include: { sales: { orderBy: { createdAt: "desc" }, take: 100 }, receivablePayments: { orderBy: { receivedAt: "desc" }, take: 100 } } });
  if (!customer) { res.status(404).json({ error: "customer_not_found" }); return; }
  res.json(customer);
});
customerRouter.patch("/:id", async (req, res) => {
  const parsed = customerInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_customer", details: parsed.error.flatten() }); return; }
  try {
    const customer = await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id: String(req.params.id) }, select: { id: true, outstandingDebtCents: true } });
      if (!current) throw new Error("customer_not_found");
      if (parsed.data.creditLimitCents !== undefined && parsed.data.creditLimitCents < current.outstandingDebtCents) throw new Error("credit_limit_below_outstanding");
      return tx.customer.update({ where: { id: current.id }, data: parsed.data });
    });
    await audit("CUSTOMER_UPDATED", (req as AuthRequest).user?.id, "CUSTOMER", customer.id);
    res.json(customer);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "customer_not_found" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")) { res.status(404).json({ error: "customer_not_found" }); return; }
    if (code === "credit_limit_below_outstanding") { res.status(409).json({ error: code }); return; }
    throw error;
  }
});
customerRouter.delete("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.update({ where: { id: String(req.params.id) }, data: { active: false } });
    await audit("CUSTOMER_DEACTIVATED", (req as AuthRequest).user?.id, "CUSTOMER", customer.id);
    res.json(customer);
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "customer_not_found" }); return; } throw error; }
});

const paymentInput = z.object({
  amountCents: z.number().int().positive(), paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"]).default("CASH"),
  idempotencyKey: z.string().min(1).max(200), cashSessionId: z.string().uuid().nullable().optional(), reference: z.string().trim().max(200).optional().nullable(), note: z.string().max(300).optional(), receivedAt: z.coerce.date().optional(),
});
customerRouter.post("/:id/payments", async (req, res) => {
  const parsed = paymentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_receivable_payment", details: parsed.error.flatten() }); return; }
  const customerId = String(req.params.id), actorId = (req as AuthRequest).user?.id;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.receivablePayment.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
      if (existing) {
        if (existing.customerId !== customerId) throw new Error("idempotency_key_reused");
        return { payment: existing, customer: await tx.customer.findUniqueOrThrow({ where: { id: customerId } }), replay: true };
      }
      if (!parsed.data.cashSessionId) throw new Error("cash_session_required");
      const locked = await tx.$queryRaw<Array<{ id: string; outstandingDebtCents: number }>>`SELECT "id", "outstandingDebtCents" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
      if (!locked[0]) throw new Error("customer_not_found");
      if (parsed.data.amountCents > locked[0].outstandingDebtCents) throw new Error("payment_exceeds_outstanding");
      if (parsed.data.cashSessionId) {
        const sessions = await tx.$queryRaw<Array<{ id: string; openedBy: string; closedAt: Date | null }>>`SELECT "id","openedBy","closedAt" FROM "CashSession" WHERE "id" = ${parsed.data.cashSessionId} FOR UPDATE`;
        const session = sessions[0]; if (!session) throw new Error("cash_session_not_found");
        if (session.closedAt) throw new Error("cash_session_closed");
        if (!canManageCashSession(session.openedBy, actorId, (req as AuthRequest).user?.role)) throw new Error("cash_session_forbidden");
      }
      const payment = await tx.receivablePayment.create({ data: { customerId, amountCents: parsed.data.amountCents, paymentMethod: parsed.data.paymentMethod, idempotencyKey: parsed.data.idempotencyKey, cashSessionId: parsed.data.cashSessionId ?? null, operatorId: actorId, reference: parsed.data.reference ?? null, note: parsed.data.note, receivedAt: parsed.data.receivedAt } });
      const customer = await tx.customer.update({ where: { id: customerId }, data: { outstandingDebtCents: { decrement: parsed.data.amountCents } } });
      await audit("RECEIVABLE_PAYMENT", actorId, "RECEIVABLE_PAYMENT", payment.id, { customerId, amountCents: payment.amountCents }, tx);
      return { payment, customer, replay: false };
    });
    res.status(result.replay ? 200 : 201).json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "receivable_payment_failed";
    const status = code === "customer_not_found" ? 404 : code === "payment_exceeds_outstanding" || code === "cash_session_closed" ? 409 : code.startsWith("cash_session") || code === "idempotency_key_reused" ? 400 : 500;
    res.status(status).json({ error: code });
  }
});
