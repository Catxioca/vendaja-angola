import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireModuleAccess, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";
import { ensureAccountingPeriod, reverseJournal } from "../services/accounting.js";

const baseAccounts = [
  { code: "1", name: "Ativos", type: "ASSET", category: "ATIVO" },
  { code: "2", name: "Passivos", type: "LIABILITY", category: "PASSIVO" },
  { code: "3", name: "Património Líquido", type: "EQUITY", category: "PATRIMONIO" },
  { code: "4", name: "Receitas", type: "REVENUE", category: "RECEITA" },
  { code: "5", name: "Despesas", type: "EXPENSE", category: "DESPESA" },
  { code: "6", name: "Caixa", type: "ASSET", category: "CAIXA", parentCode: "1" },
  { code: "7", name: "Clientes", type: "ASSET", category: "CLIENTES", parentCode: "1" },
  { code: "8", name: "Fornecedores", type: "LIABILITY", category: "FORNECEDORES", parentCode: "2" },
  { code: "9", name: "Vendas", type: "REVENUE", category: "VENDAS", parentCode: "4" },
  { code: "10", name: "Compras", type: "EXPENSE", category: "COMPRAS", parentCode: "5" },
];

const journalEntrySchema = z.object({
  description: z.string().min(2).max(260),
  entryDate: z.coerce.date().optional(),
  debitAccountCode: z.string().min(1),
  creditAccountCode: z.string().min(1),
  amountCents: z.number().int().positive(),
  sourceType: z.string().max(80).optional(),
  sourceId: z.string().max(80).optional(),
  journalType: z.string().max(40).default("GENERAL"),
  documentType: z.string().max(40).default("MANUAL"),
  documentNumber: z.string().max(80).optional().nullable(),
});
const journalSchema = z.object({
  description: z.string().min(2).max(260),
  entryDate: z.coerce.date().optional(),
  journalType: z.string().max(40).default("GENERAL"),
  documentType: z.string().max(40).default("MANUAL"),
  documentNumber: z.string().max(80).optional().nullable(),
  lines: z.array(z.object({
    accountCode: z.string().min(1),
    description: z.string().max(260).optional(),
    debitCents: z.number().int().nonnegative().default(0),
    creditCents: z.number().int().nonnegative().default(0),
  }).refine((line) => (line.debitCents > 0) !== (line.creditCents > 0), "line must have debit or credit")).min(2),
});

async function ensureBaseAccounts() {
  for (const account of baseAccounts) {
    await prisma.account.upsert({ where: { code: account.code }, create: account, update: {} });
  }
}

export const accountingRouter = Router();
accountingRouter.use(requireAuth);
accountingRouter.use(requireModuleAccess("ACCOUNTING"));

accountingRouter.get("/chart", async (_req, res) => {
  await ensureBaseAccounts();
  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });
  res.json(accounts);
});

accountingRouter.get("/entries", async (_req, res) => {
  const entries = await prisma.journalEntry.findMany({
    orderBy: { entryDate: "desc" },
    include: { debitAccount: true, creditAccount: true },
  });
  res.json(entries);
});

  accountingRouter.post("/journals", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
    const parsed = journalSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_journal", details: parsed.error.flatten() }); return; }
    const debit = parsed.data.lines.reduce((n, l) => n + l.debitCents, 0);
    const credit = parsed.data.lines.reduce((n, l) => n + l.creditCents, 0);
    if (debit <= 0 || debit !== credit) { res.status(400).json({ error: "journal_not_balanced", debitCents: debit, creditCents: credit }); return; }
    await ensureBaseAccounts();
    const accounts = await prisma.account.findMany({ where: { code: { in: parsed.data.lines.map((l) => l.accountCode) } } });
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    if (accounts.length !== new Set(parsed.data.lines.map((l) => l.accountCode)).size) { res.status(404).json({ error: "account_not_found" }); return; }
    const entryDate = parsed.data.entryDate ?? new Date();
    await ensureAccountingPeriod(prisma, entryDate);
    const period = await prisma.accountingPeriod.findFirst({ where: { startsAt: { lte: entryDate }, endsAt: { gte: entryDate }, status: "OPEN" } });
    if (!period) { res.status(409).json({ error: "accounting_period_closed" }); return; }
    const journal = await prisma.journal.create({
      data: {
        description: parsed.data.description, entryDate,
        journalType: parsed.data.journalType, documentType: parsed.data.documentType,
        documentNumber: parsed.data.documentNumber ?? null, createdBy: (req as AuthRequest).user?.id,
        periodId: period.id,
        lines: { create: parsed.data.lines.map((line) => ({ accountId: byCode.get(line.accountCode)!.id, description: line.description, debitCents: line.debitCents, creditCents: line.creditCents })) },
      },
      include: { lines: { include: { account: true } } },
    });
    await audit("JOURNAL_CREATED", (req as AuthRequest).user?.id, "JOURNAL", journal.id, { debitCents: debit, creditCents: credit });
    res.status(201).json(journal);
  });
  accountingRouter.get("/journals", async (_req, res) => {
    res.json(await prisma.journal.findMany({ orderBy: { entryDate: "desc" }, include: { lines: { include: { account: true } } } }));
  });

  accountingRouter.post("/journals/:id/reverse", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
    try {
      const reversal = await reverseJournal(prisma, String(req.params.id));
      await audit("JOURNAL_REVERSED", (req as AuthRequest).user?.id, "JOURNAL", String(req.params.id), { reversalId: reversal.id });
      res.status(201).json(reversal);
    } catch (error) {
      if (error instanceof Error && error.message === "journal_not_found") { res.status(404).json({ error: "journal_not_found" }); return; }
      throw error;
    }
  });

  accountingRouter.get("/trial-balance", async (req, res) => {
    await ensureBaseAccounts();
    const columns = req.query.columns === "8" ? 8 : 4;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const where = from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : undefined;
    const [accounts, journals, legacy] = await Promise.all([
      prisma.account.findMany({ orderBy: { code: "asc" } }),
      prisma.journal.findMany({ where, include: { lines: true } }),
      prisma.journalEntry.findMany({ where: where ? { entryDate: where.entryDate } : undefined }),
    ]);
    const totals = new Map(accounts.map((a) => [a.id, { debit: 0, credit: 0 }]));
    for (const j of journals) for (const l of j.lines) { const t = totals.get(l.accountId)!; t.debit += l.debitCents; t.credit += l.creditCents; }
    for (const e of legacy) { totals.get(e.debitAccountId)!.debit += e.amountCents; totals.get(e.creditAccountId)!.credit += e.amountCents; }
    const rows = accounts.map((a) => { const t = totals.get(a.id)!; const balance = t.debit - t.credit; return { code: a.code, name: a.name, debitCents: t.debit, creditCents: t.credit, debitBalanceCents: Math.max(balance, 0), creditBalanceCents: Math.max(-balance, 0), ...(columns === 8 ? { openingDebitCents: 0, openingCreditCents: 0 } : {}) }; });
    res.json({ columns, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, rows, totals: { debitCents: rows.reduce((n, r) => n + r.debitCents, 0), creditCents: rows.reduce((n, r) => n + r.creditCents, 0) } });
  });
  accountingRouter.get("/drn", async (req, res) => {
    const trial = await prisma.account.findMany({ orderBy: { code: "asc" } });
    res.json({ documentType: "DRN", generatedAt: new Date().toISOString(), accounts: trial });
  });

  accountingRouter.get("/periods", async (_req, res) => {
    res.json(await prisma.accountingPeriod.findMany({ orderBy: { startsAt: "desc" } }));
  });

  accountingRouter.post("/periods", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
    const parsed = z.object({ name: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date() }).safeParse(req.body);
    if (!parsed.success || parsed.data.endsAt <= parsed.data.startsAt) { res.status(400).json({ error: "invalid_accounting_period" }); return; }
    res.status(201).json(await prisma.accountingPeriod.create({ data: parsed.data }));
  });

  accountingRouter.post("/periods/:id/close", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
    const period = await prisma.accountingPeriod.findUnique({ where: { id: String(req.params.id) } });
    if (!period) { res.status(404).json({ error: "period_not_found" }); return; }
    if (period.status === "CLOSED") { res.json(period); return; }
    const updated = await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: "CLOSED", closedAt: new Date(), closedBy: (req as AuthRequest).user?.id ?? null } });
    await audit("ACCOUNTING_PERIOD_CLOSED", (req as AuthRequest).user?.id, "ACCOUNTING_PERIOD", period.id, {});
    res.json(updated);
  });

  accountingRouter.get("/tax-rules", async (_req, res) => {
    res.json(await prisma.taxRule.findMany({ where: { active: true }, include: { outputAccount: true, inputAccount: true }, orderBy: { code: "asc" } }));
  });

  accountingRouter.post("/tax-rules", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
    const parsed = z.object({ code: z.string().min(1), name: z.string().min(1), rate: z.coerce.number().min(0).max(1), exemptionCode: z.string().optional(), outputAccountId: z.string().optional(), inputAccountId: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_tax_rule", details: parsed.error.flatten() }); return; }
    res.status(201).json(await prisma.taxRule.create({ data: parsed.data }));
  });

  accountingRouter.get("/financial-statements", async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const journals = await prisma.journal.findMany({ where: { entryDate: { gte: from, lte: to }, status: "POSTED" }, include: { lines: { include: { account: true } } } });
    const totals = new Map<string, { code: string; name: string; debit: number; credit: number; type: string }>();
    for (const journal of journals) for (const line of journal.lines) {
      const current = totals.get(line.accountId) ?? { code: line.account.code, name: line.account.name, debit: 0, credit: 0, type: line.account.type };
      current.debit += line.debitCents; current.credit += line.creditCents; totals.set(line.accountId, current);
    }
    const rows = [...totals.values()].map((row) => ({ ...row, balanceCents: row.debit - row.credit }));
    const result = (types: string[]) => rows.filter((row) => types.includes(row.type)).reduce((sum, row) => sum + row.balanceCents, 0);
    res.json({ from: from.toISOString(), to: to.toISOString(), balanceSheet: rows.filter((row) => ["ASSET", "LIABILITY", "EQUITY"].includes(row.type)), incomeStatement: rows.filter((row) => ["REVENUE", "EXPENSE"].includes(row.type)), totals: { assetsCents: result(["ASSET"]), liabilitiesCents: -result(["LIABILITY"]), equityCents: -result(["EQUITY"]), revenueCents: -result(["REVENUE"]), expensesCents: result(["EXPENSE"]) } });
  });

  accountingRouter.get("/receivables", async (_req, res) => {
    const customers = await prisma.customer.findMany({ where: { outstandingDebtCents: { gt: 0 } }, select: { id: true, name: true, nif: true, outstandingDebtCents: true, creditLimitCents: true }, orderBy: { outstandingDebtCents: "desc" } });
    res.json({ rows: customers, totalOpenCents: customers.reduce((sum, customer) => sum + customer.outstandingDebtCents, 0) });
  });

  accountingRouter.get("/payables", async (_req, res) => {
    const payables = await prisma.accountPayable.findMany({ where: { status: { not: "PAID" } }, include: { supplier: { select: { id: true, name: true, nif: true } }, purchase: { select: { id: true, number: true } } }, orderBy: { dueDate: "asc" } });
    res.json({ rows: payables, totalOpenCents: payables.reduce((sum, payable) => sum + payable.originalCents - payable.paidCents, 0) });
  });

  accountingRouter.get("/tax-summary", async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const [sales, purchases] = await Promise.all([
      prisma.sale.aggregate({ where: { createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } }, _sum: { taxCents: true, subtotalCents: true } }),
      prisma.purchase.aggregate({ where: { purchasedAt: { gte: from, lte: to }, status: { not: "CANCELLED" } }, _sum: { taxCents: true, subtotalCents: true } }),
    ]);
    const outputCents = sales._sum.taxCents ?? 0;
    const inputCents = purchases._sum.taxCents ?? 0;
    res.json({ from: from.toISOString(), to: to.toISOString(), outputCents, inputCents, payableCents: outputCents - inputCents });
  });

  accountingRouter.get("/reconciliation", async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const [sales, receivables, purchases, payables] = await Promise.all([
      prisma.sale.aggregate({ where: { createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } }, _sum: { totalCents: true } }),
      prisma.receivablePayment.aggregate({ where: { receivedAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
      prisma.purchase.aggregate({ where: { purchasedAt: { gte: from, lte: to }, status: { not: "CANCELLED" } }, _sum: { totalCents: true } }),
      prisma.payablePayment.aggregate({ where: { paidAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
    ]);
    res.json({ from: from.toISOString(), to: to.toISOString(), salesCents: sales._sum.totalCents ?? 0, receivedCents: receivables._sum.amountCents ?? 0, purchasesCents: purchases._sum.totalCents ?? 0, paidCents: payables._sum.amountCents ?? 0 });
  });


accountingRouter.post("/entries", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  const parsed = journalEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_journal_entry", details: parsed.error.flatten() });
    return;
  }

  await ensureBaseAccounts();
  const debit = await prisma.account.findUnique({ where: { code: parsed.data.debitAccountCode } });
  const credit = await prisma.account.findUnique({ where: { code: parsed.data.creditAccountCode } });

  if (!debit || !credit) {
    res.status(404).json({ error: "account_not_found" });
    return;
  }

  const entry = await prisma.journalEntry.create({
    data: {
      description: parsed.data.description,
      entryDate: parsed.data.entryDate ?? new Date(),
      debitAccountId: debit.id,
      creditAccountId: credit.id,
      amountCents: parsed.data.amountCents,
      sourceType: parsed.data.sourceType ?? "MANUAL",
      sourceId: parsed.data.sourceId ?? null,
      journalType: parsed.data.journalType,
      documentType: parsed.data.documentType,
      documentNumber: parsed.data.documentNumber ?? null,
      createdBy: (req as AuthRequest).user?.id ?? null,
    },
    include: { debitAccount: true, creditAccount: true },
  });

  await audit("JOURNAL_ENTRY_CREATED", (req as AuthRequest).user?.id, "JOURNAL_ENTRY", entry.id, { amountCents: parsed.data.amountCents });
  res.status(201).json(entry);
});

accountingRouter.get("/summary", async (_req, res) => {
  await ensureBaseAccounts();
  const entries = await prisma.journalEntry.findMany({ include: { debitAccount: true, creditAccount: true } });
  const totals: { debits: number; credits: number } = entries.reduce((acc, entry) => {
    acc.debits += entry.amountCents;
    acc.credits += entry.amountCents;
    return acc;
  }, { debits: 0, credits: 0 });

  res.json({
    entriesCount: entries.length,
    debitsCents: totals.debits,
    creditsCents: totals.credits,
    balanceCents: totals.debits - totals.credits,
  });
});
