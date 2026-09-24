import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireModuleAccess, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
import { expenseCategories, expensePaymentMethods } from "../services/expense-validation.js";
import { ensureAccountingPeriod, postExpenseAccounting } from "../services/accounting.js";

export const expenseRouter = Router();
expenseRouter.use(requireAuth, requireModuleAccess("ACCOUNTING"));

const expenseInput = z.object({
  description: z.string().trim().min(2).max(260),
  category: z.enum(expenseCategories),
  supplierId: z.string().uuid().optional().nullable(),
  documentNumber: z.string().trim().max(100).optional().nullable(),
  amountCents: z.number().int().positive(),
  expenseDate: z.coerce.date(),
  paymentMethod: z.enum(expensePaymentMethods),
  notes: z.string().trim().max(1000).optional().nullable(),
});

function filters(req: { query: Record<string, unknown> }) {
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const paymentMethod = typeof req.query.paymentMethod === "string" ? req.query.paymentMethod : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  return {
    ...(from && !Number.isNaN(from.valueOf()) || to && !Number.isNaN(to.valueOf()) ? { expenseDate: { ...(from && !Number.isNaN(from.valueOf()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.valueOf()) ? { lte: to } : {}) } } : {}),
    ...(category ? { category } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" as const } }, { documentNumber: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
}

expenseRouter.get("/categories", (_req, res) => res.json(expenseCategories));
expenseRouter.get("/", async (req, res) => {
  const expenses = await prisma.expense.findMany({
    where: { ...filters(req), ...(req.query.status === "CANCELLED" ? { status: "CANCELLED" } : { status: "ACTIVE" }) },
    include: { supplier: true, operator: { select: { id: true, displayName: true, username: true } } },
    orderBy: { expenseDate: "desc" }, take: 500,
  });
  res.json(expenses);
});
expenseRouter.get("/:id", async (req, res) => {
  const expense = await prisma.expense.findUnique({ where: { id: String(req.params.id) }, include: { supplier: true, operator: { select: { id: true, displayName: true, username: true } } } });
  if (!expense) { res.status(404).json({ error: "expense_not_found" }); return; }
  res.json(expense);
});
expenseRouter.post("/", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  const parsed = expenseInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_expense", details: parsed.error.flatten() }); return; }
  try {
    const supplier = parsed.data.supplierId ? await prisma.supplier.findUnique({ where: { id: parsed.data.supplierId } }) : null;
    if (parsed.data.supplierId && !supplier) { res.status(404).json({ error: "supplier_not_found" }); return; }
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({ data: { ...parsed.data, operatorId: (req as AuthRequest).user?.id ?? null } });
      await ensureAccountingPeriod(tx, created.expenseDate);
      await postExpenseAccounting(tx, created);
      return created;
    });
    await audit("EXPENSE_CREATED", (req as AuthRequest).user?.id, "EXPENSE", expense.id, { amountCents: expense.amountCents });
    res.status(201).json(expense);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") { res.status(404).json({ error: "supplier_not_found" }); return; }
    throw error;
  }
});
expenseRouter.patch("/:id", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  const parsed = expenseInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_expense", details: parsed.error.flatten() }); return; }
  try {
    if (parsed.data.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: parsed.data.supplierId } });
      if (!supplier) { res.status(404).json({ error: "supplier_not_found" }); return; }
    }
    const expense = await prisma.expense.update({ where: { id: String(req.params.id) }, data: parsed.data });
    await audit("EXPENSE_UPDATED", (req as AuthRequest).user?.id, "EXPENSE", expense.id);
    res.json(expense);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "expense_not_found" }); return; }
    throw error;
  }
});
expenseRouter.post("/:id/cancel", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  try {
    const expense = await prisma.expense.update({ where: { id: String(req.params.id) }, data: { status: "CANCELLED" } });
    await audit("EXPENSE_CANCELLED", (req as AuthRequest).user?.id, "EXPENSE", expense.id);
    res.json(expense);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "expense_not_found" }); return; }
    throw error;
  }
});
