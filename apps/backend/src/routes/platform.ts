import { createHash } from "node:crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompanyContext, type AuthRequest } from "../middleware/auth.js";
import { auditInContext } from "../services/security.js";

export const platformRouter = Router();
platformRouter.use(requireAuth);
const actor = (req: AuthRequest) => req.user?.id ?? "";
const context = (req: AuthRequest) => req.context!;
const admin = (req: AuthRequest) => ["ADMIN", "ROLE_ADMIN", "MANAGER", "ROLE_MANAGER"].includes((req.context?.role ?? "").toUpperCase()) || ["ADMIN", "ROLE_ADMIN"].includes((req.user?.role ?? "").toUpperCase());
function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (admin(req)) return true;
  res.status(403).json({ error: "company_admin_required" });
  return false;
}

platformRouter.get("/context", async (req, res) => {
  const memberships = await prisma.companyMembership.findMany({ where: { userId: actor(req as AuthRequest), active: true }, include: { company: true, branch: true }, orderBy: { company: { legalName: "asc" } } });
  res.json(memberships);
});

platformRouter.post("/companies", async (req, res) => {
  const auth = req as AuthRequest;
  if (!["ADMIN", "ROLE_ADMIN"].includes((auth.user?.role ?? "").toUpperCase())) { res.status(403).json({ error: "admin_required" }); return; }
  const parsed = z.object({ legalName: z.string().min(2), nif: z.string().optional(), branchCode: z.string().min(1).default("MAIN"), branchName: z.string().min(1).default("Sede") }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_company" }); return; }
  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { legalName: parsed.data.legalName, nif: parsed.data.nif ?? null } });
    const branch = await tx.branch.create({ data: { companyId: company.id, code: parsed.data.branchCode, name: parsed.data.branchName } });
    await tx.companyMembership.create({ data: { userId: actor(req as AuthRequest), companyId: company.id, branchId: branch.id, role: "ROLE_ADMIN", modules: ["POS", "STOCK", "ACCOUNTING", "SETTINGS"] } });
    return { company, branch };
  });
  res.status(201).json(result);
});

platformRouter.use(requireCompanyContext);

platformRouter.get("/cash-registers", async (req, res) => {
  res.json(await prisma.cashRegister.findMany({ where: { companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { branchId: context(req as AuthRequest).branchId! } : {}) }, include: { branch: true }, orderBy: { code: "asc" } }));
});

platformRouter.post("/cash-registers", async (req, res) => {
  if (!requireAdmin(req as AuthRequest, res)) return;
  const parsed = z.object({ code: z.string().min(1), name: z.string().min(1), branchId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_cash_register" }); return; }
  const branch = await prisma.branch.findFirst({ where: { id: parsed.data.branchId, companyId: context(req as AuthRequest).companyId } });
  if (!branch) { res.status(404).json({ error: "branch_not_found" }); return; }
  const register = await prisma.cashRegister.create({ data: { ...parsed.data, companyId: branch.companyId } });
  await auditInContext("CASH_REGISTER_CREATED", context(req as AuthRequest), actor(req as AuthRequest), "CASH_REGISTER", register.id);
  res.status(201).json(register);
});

platformRouter.post("/cash-registers/:id/shifts", async (req, res) => {
  const parsed = z.object({ openingCents: z.number().int().nonnegative() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_shift" }); return; }
  const register = await prisma.cashRegister.findFirst({ where: { id: String(req.params.id), companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { branchId: context(req as AuthRequest).branchId! } : {}) } });
  if (!register) { res.status(404).json({ error: "cash_register_not_found" }); return; }
  const result = await prisma.$transaction(async (tx) => {
    const open = await tx.posShift.findFirst({ where: { cashRegisterId: register.id, status: "OPEN" }, select: { id: true } });
    if (open) throw new Error("shift_already_open");
    const shift = await tx.posShift.create({ data: { cashRegisterId: register.id, operatorId: actor(req as AuthRequest), openingCents: parsed.data.openingCents } });
    await auditInContext("POS_SHIFT_OPENED", context(req as AuthRequest), actor(req as AuthRequest), "POS_SHIFT", shift.id, { openingCents: shift.openingCents }, tx);
    return shift;
  });
  res.status(201).json(result);
});

platformRouter.post("/shifts/:id/close", async (req, res) => {
  const parsed = z.object({ declaredCents: z.number().int().nonnegative() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_close" }); return; }
  const shift = await prisma.posShift.findFirst({ where: { id: String(req.params.id), operatorId: actor(req as AuthRequest), cashRegister: { companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { branchId: context(req as AuthRequest).branchId! } : {}) }, status: "OPEN" } });
  if (!shift) { res.status(404).json({ error: "open_shift_not_found" }); return; }
  const expected = shift.openingCents;
  const updated = await prisma.$transaction(async tx => {
    const closed = await tx.posShift.updateMany({ where: { id: shift.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date(), declaredCents: parsed.data.declaredCents, closingCents: parsed.data.declaredCents, expectedCents: expected, differenceCents: parsed.data.declaredCents - expected } });
    if (closed.count !== 1) throw new Error("shift_already_closed");
    const result = await tx.posShift.findUniqueOrThrow({ where: { id: shift.id } });
    await auditInContext("POS_SHIFT_CLOSED", context(req as AuthRequest), actor(req as AuthRequest), "POS_SHIFT", result.id, { declaredCents: result.declaredCents, expectedCents: result.expectedCents, differenceCents: result.differenceCents }, tx);
    return result;
  });
  res.json(updated);
});

platformRouter.get("/bank-accounts", async (req, res) => {
  res.json(await prisma.bankAccount.findMany({ where: { companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { OR: [{ branchId: context(req as AuthRequest).branchId! }, { branchId: null }] } : {}) }, orderBy: { name: "asc" } }));
});

platformRouter.post("/bank-accounts", async (req, res) => {
  if (!requireAdmin(req as AuthRequest, res)) return;
  const parsed = z.object({ name: z.string().min(1), iban: z.string().min(4).optional(), branchId: z.string().uuid().nullable().optional(), openingBalanceCents: z.number().int().default(0) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_bank_account" }); return; }
  if (parsed.data.branchId && !(await prisma.branch.findFirst({ where: { id: parsed.data.branchId, companyId: context(req as AuthRequest).companyId } }))) { res.status(404).json({ error: "branch_not_found" }); return; }
  const account = await prisma.bankAccount.create({ data: { ...parsed.data, companyId: context(req as AuthRequest).companyId } });
  await auditInContext("BANK_ACCOUNT_CREATED", context(req as AuthRequest), actor(req as AuthRequest), "BANK_ACCOUNT", account.id);
  res.status(201).json(account);
});

platformRouter.post("/bank-accounts/:id/statements", async (req, res) => {
  const parsed = z.object({ statementDate: z.coerce.date(), openingBalanceCents: z.number().int(), closingBalanceCents: z.number().int(), lines: z.array(z.object({ occurredAt: z.coerce.date(), description: z.string().min(1), amountCents: z.number().int(), externalId: z.string().optional() })) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_statement" }); return; }
  const bank = await prisma.bankAccount.findFirst({ where: { id: String(req.params.id), companyId: context(req as AuthRequest).companyId } });
  if (!bank) { res.status(404).json({ error: "bank_account_not_found" }); return; }
  const referenceHash = createHash("sha256").update(JSON.stringify({ bank: bank.id, date: parsed.data.statementDate.toISOString(), closing: parsed.data.closingBalanceCents })).digest("hex");
  const statement = await prisma.bankStatement.upsert({ where: { referenceHash }, create: { bankAccountId: bank.id, referenceHash, statementDate: parsed.data.statementDate, openingBalanceCents: parsed.data.openingBalanceCents, closingBalanceCents: parsed.data.closingBalanceCents, lines: { create: parsed.data.lines.map(line => ({ lineHash: createHash("sha256").update(JSON.stringify(line)).digest("hex"), occurredAt: line.occurredAt, description: line.description, amountCents: line.amountCents })) } }, update: {} , include: { lines: true } });
  await auditInContext("BANK_STATEMENT_IMPORTED", context(req as AuthRequest), actor(req as AuthRequest), "BANK_STATEMENT", statement.id, { lineCount: statement.lines.length });
  res.status(201).json(statement);
});

platformRouter.post("/bank-statement-lines/:id/reconcile", async (req, res) => {
  const parsed = z.object({ reference: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_reconciliation" }); return; }
  const line = await prisma.bankStatementLine.findFirst({ where: { id: String(req.params.id), statement: { bankAccount: { companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { branchId: context(req as AuthRequest).branchId! } : {}) } } } });
  if (!line) { res.status(404).json({ error: "statement_line_not_found" }); return; }
  const updated = await prisma.bankStatementLine.update({ where: { id: line.id }, data: { reconciledAt: new Date(), reconciledBy: actor(req as AuthRequest), reconciliationReference: parsed.data.reference } });
  await auditInContext("BANK_STATEMENT_LINE_RECONCILED", context(req as AuthRequest), actor(req as AuthRequest), "BANK_STATEMENT_LINE", updated.id, { reference: parsed.data.reference });
  res.json(updated);
});

platformRouter.post("/payment-terminals/:id/transactions", async (req, res) => {
  const parsed = z.object({ idempotencyKey: z.string().min(8), amountCents: z.number().int().positive(), operation: z.enum(["SALE", "REFUND"]).default("SALE"), externalReference: z.string().optional(), shiftId: z.string().uuid().optional(), saleId: z.string().uuid().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_payment_transaction" }); return; }
  const terminal = await prisma.paymentTerminal.findFirst({ where: { id: String(req.params.id), companyId: context(req as AuthRequest).companyId, active: true } });
  if (!terminal) { res.status(404).json({ error: "payment_terminal_not_found" }); return; }
  if (parsed.data.shiftId && !(await prisma.posShift.findFirst({ where: { id: parsed.data.shiftId, cashRegister: { companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { branchId: context(req as AuthRequest).branchId! } : {}) }, status: "OPEN" } }))) { res.status(409).json({ error: "shift_not_open" }); return; }
  const transaction = await prisma.paymentTransaction.upsert({ where: { idempotencyKey: parsed.data.idempotencyKey }, create: { terminalId: terminal.id, ...parsed.data, status: "PENDING" }, update: {} });
  await auditInContext("PAYMENT_TRANSACTION_CREATED", context(req as AuthRequest), actor(req as AuthRequest), "PAYMENT_TRANSACTION", transaction.id, { operation: transaction.operation, amountCents: transaction.amountCents });
  res.status(201).json(transaction);
});

platformRouter.patch("/payment-transactions/:id", async (req, res) => {
  const parsed = z.object({ status: z.enum(["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "CANCELLED"]), externalReference: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_payment_status" }); return; }
  const row = await prisma.paymentTransaction.findFirst({ where: { id: String(req.params.id), terminal: { companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { branchId: context(req as AuthRequest).branchId! } : {}) } } });
  if (!row) { res.status(404).json({ error: "payment_transaction_not_found" }); return; }
  const updated = await prisma.paymentTransaction.update({ where: { id: row.id }, data: parsed.data });
  await auditInContext("PAYMENT_TRANSACTION_UPDATED", context(req as AuthRequest), actor(req as AuthRequest), "PAYMENT_TRANSACTION", updated.id, parsed.data);
  res.json(updated);
});

platformRouter.post("/reprints", async (req, res) => {
  const parsed = z.object({ documentType: z.string().min(1), documentId: z.string().uuid(), reason: z.string().min(3) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_reprint" }); return; }
  if (!requireAdmin(req as AuthRequest, res)) return;
  const document = parsed.data.documentType === "SALE" ? await prisma.sale.findFirst({ where: { id: parsed.data.documentId } }) : await prisma.commercialDocument.findFirst({ where: { id: parsed.data.documentId } });
  if (!document) { res.status(404).json({ error: "document_not_found" }); return; }
  const log = await prisma.reprintLog.create({ data: { ...parsed.data, companyId: context(req as AuthRequest).companyId, branchId: context(req as AuthRequest).branchId, userId: actor(req as AuthRequest) } });
  await auditInContext("DOCUMENT_REPRINTED", context(req as AuthRequest), actor(req as AuthRequest), parsed.data.documentType, parsed.data.documentId, { reason: parsed.data.reason });
  res.status(201).json(log);
});
