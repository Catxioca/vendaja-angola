import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

const accounts = [
  { code: "6", name: "Caixa", type: "ASSET", category: "CAIXA", parentCode: "1" },
  { code: "7", name: "Clientes", type: "ASSET", category: "CLIENTES", parentCode: "1" },
  { code: "8", name: "Fornecedores", type: "LIABILITY", category: "FORNECEDORES", parentCode: "2" },
  { code: "9", name: "Vendas", type: "REVENUE", category: "VENDAS", parentCode: "4" },
  { code: "10", name: "Compras", type: "EXPENSE", category: "COMPRAS", parentCode: "5" },
  { code: "14", name: "Inventário", type: "ASSET", category: "INVENTARIO", parentCode: "1" },
  { code: "15", name: "Despesas operacionais", type: "EXPENSE", category: "DESPESAS_OPERACIONAIS", parentCode: "5" },
  { code: "11", name: "IVA liquidado", type: "LIABILITY", category: "IVA_LIQUIDADO", parentCode: "2" },
  { code: "12", name: "IVA dedutível", type: "ASSET", category: "IVA_DEDUTIVEL", parentCode: "1" },
  { code: "13", name: "Custo das mercadorias vendidas", type: "EXPENSE", category: "CMV", parentCode: "5" },
];

async function account(db: Db, code: string) {
  const definition = accounts.find((item) => item.code === code);
  if (!definition) throw new Error(`account_definition_missing:${code}`);
  return db.account.upsert({ where: { code }, create: definition, update: {} });
}

async function openPeriod(db: Db, date: Date) {
  const period = await db.accountingPeriod.findFirst({ where: { startsAt: { lte: date }, endsAt: { gte: date }, status: "OPEN" } });
  if (!period) throw new Error("accounting_period_closed_or_missing");
  return period;
}

export async function ensureAccountingPeriod(db: Db, date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return db.accountingPeriod.upsert({
    where: { startsAt_endsAt: { startsAt: start, endsAt: end } },
    create: { name: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`, startsAt: start, endsAt: end },
    update: {},
  });
}

async function post(db: Db, input: { sourceType: string; sourceId: string; date: Date; description: string; documentType: string; documentNumber?: string | null; lines: Array<{ code: string; debitCents: number; creditCents: number; description?: string }> }) {
  const existing = await db.journal.findUnique({ where: { sourceType_sourceId: { sourceType: input.sourceType, sourceId: input.sourceId } }, include: { lines: true } });
  if (existing) return existing;
  const debit = input.lines.reduce((sum, line) => sum + line.debitCents, 0);
  const credit = input.lines.reduce((sum, line) => sum + line.creditCents, 0);
  if (debit <= 0 || debit !== credit) throw new Error("journal_not_balanced");
  const period = await openPeriod(db, input.date);
  const resolved = await Promise.all(input.lines.map(async (line) => ({ ...line, accountId: (await account(db, line.code)).id })));
  return db.journal.create({
    data: {
      sourceType: input.sourceType, sourceId: input.sourceId, entryDate: input.date, description: input.description,
      documentType: input.documentType, documentNumber: input.documentNumber ?? null, periodId: period.id,
      lines: { create: resolved.map((line) => ({ accountId: line.accountId, debitCents: line.debitCents, creditCents: line.creditCents, description: line.description })) },
    },
    include: { lines: true },
  });
}

export async function postSaleAccounting(db: Db, sale: { id: string; createdAt: Date; totalCents: number; subtotalCents: number; taxCents: number; paymentMethod: string; customerId: string | null; number: string; costCents?: number }) {
  const receivable = sale.paymentMethod === "CREDIT" ? "7" : "6";
  const journal = await post(db, { sourceType: "SALE", sourceId: sale.id, date: sale.createdAt, description: `Venda ${sale.number}`, documentType: "SALE", documentNumber: sale.number, lines: [
    { code: receivable, debitCents: sale.totalCents, creditCents: 0 },
    { code: "9", debitCents: 0, creditCents: sale.subtotalCents },
    ...(sale.taxCents > 0 ? [{ code: "11", debitCents: 0, creditCents: sale.taxCents }] : []),
  ] });
  if ((sale.costCents ?? 0) > 0) await post(db, { sourceType: "SALE_COGS", sourceId: sale.id, date: sale.createdAt, description: `CMV ${sale.number}`, documentType: "SALE_COGS", documentNumber: sale.number, lines: [
    { code: "13", debitCents: sale.costCents ?? 0, creditCents: 0 },
    { code: "14", debitCents: 0, creditCents: sale.costCents ?? 0 },
  ] });
  return journal;
}

export async function postPurchaseAccounting(db: Db, purchase: { id: string; purchasedAt: Date; totalCents: number; subtotalCents: number; taxCents: number; paymentMethod: string; number: string }) {
  const payable = purchase.paymentMethod === "CREDIT" ? "8" : "6";
  return post(db, { sourceType: "PURCHASE", sourceId: purchase.id, date: purchase.purchasedAt, description: `Compra ${purchase.number}`, documentType: "PURCHASE", documentNumber: purchase.number, lines: [
    { code: "14", debitCents: purchase.subtotalCents, creditCents: 0 },
    ...(purchase.taxCents > 0 ? [{ code: "12", debitCents: purchase.taxCents, creditCents: 0 }] : []),
    { code: payable, debitCents: 0, creditCents: purchase.totalCents },
  ] });
}

export async function postExpenseAccounting(db: Db, expense: { id: string; expenseDate: Date; amountCents: number; paymentMethod: string; description: string }) {
  const credit = expense.paymentMethod === "CREDIT" ? "8" : "6";
  return post(db, { sourceType: "EXPENSE", sourceId: expense.id, date: expense.expenseDate, description: expense.description, documentType: "EXPENSE", lines: [
    { code: "15", debitCents: expense.amountCents, creditCents: 0 },
    { code: credit, debitCents: 0, creditCents: expense.amountCents },
  ] });
}

export async function postReceivablePaymentAccounting(db: Db, payment: { id: string; receivedAt: Date; amountCents: number }) {
  return post(db, { sourceType: "RECEIVABLE_PAYMENT", sourceId: payment.id, date: payment.receivedAt, description: "Recebimento de cliente", documentType: "RECEIPT", lines: [
    { code: "6", debitCents: payment.amountCents, creditCents: 0 },
    { code: "7", debitCents: 0, creditCents: payment.amountCents },
  ] });
}

export async function postPayablePaymentAccounting(db: Db, payment: { id: string; paidAt: Date; amountCents: number }) {
  return post(db, { sourceType: "PAYABLE_PAYMENT", sourceId: payment.id, date: payment.paidAt, description: "Pagamento a fornecedor", documentType: "PAYMENT", lines: [
    { code: "8", debitCents: payment.amountCents, creditCents: 0 },
    { code: "6", debitCents: 0, creditCents: payment.amountCents },
  ] });
}

export async function reverseJournal(db: Db, journalId: string, date = new Date()) {
  const original = await db.journal.findUnique({ where: { id: journalId }, include: { lines: true } });
  if (!original) throw new Error("journal_not_found");
  const accountRows = await db.account.findMany({ where: { id: { in: original.lines.map((line) => line.accountId) } } });
  const codes = new Map(accountRows.map((row) => [row.id, row.code]));
  return post(db, { sourceType: "JOURNAL_REVERSAL", sourceId: original.id, date, description: `Reversão: ${original.description}`, documentType: "REVERSAL", lines: original.lines.map((line) => ({ code: codes.get(line.accountId) ?? "", debitCents: line.creditCents, creditCents: line.debitCents })) });
}
