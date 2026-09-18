import { Router } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../services/security.js";

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

  accountingRouter.post("/journals", requireRole("ADMIN"), async (req, res) => {
    const parsed = journalSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_journal", details: parsed.error.flatten() }); return; }
    const debit = parsed.data.lines.reduce((n, l) => n + l.debitCents, 0);
    const credit = parsed.data.lines.reduce((n, l) => n + l.creditCents, 0);
    if (debit <= 0 || debit !== credit) { res.status(400).json({ error: "journal_not_balanced", debitCents: debit, creditCents: credit }); return; }
    await ensureBaseAccounts();
    const accounts = await prisma.account.findMany({ where: { code: { in: parsed.data.lines.map((l) => l.accountCode) } } });
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    if (accounts.length !== new Set(parsed.data.lines.map((l) => l.accountCode)).size) { res.status(404).json({ error: "account_not_found" }); return; }
    const journal = await prisma.journal.create({
      data: {
        description: parsed.data.description, entryDate: parsed.data.entryDate ?? new Date(),
        journalType: parsed.data.journalType, documentType: parsed.data.documentType,
        documentNumber: parsed.data.documentNumber ?? null, createdBy: (req as AuthRequest).user?.id,
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


accountingRouter.post("/entries", requireRole("ADMIN"), async (req, res) => {
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
