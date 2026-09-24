import { createHash } from "node:crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../server.js";
import { requireAuth, requireCompanyContext, type AuthRequest } from "../middleware/auth.js";

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
  res.status(201).json(await prisma.cashRegister.create({ data: { ...parsed.data, companyId: branch.companyId } }));
});

platformRouter.post("/cash-registers/:id/shifts", async (req, res) => {
  const parsed = z.object({ openingCents: z.number().int().nonnegative() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_shift" }); return; }
  const register = await prisma.cashRegister.findFirst({ where: { id: String(req.params.id), companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { branchId: context(req as AuthRequest).branchId! } : {}) } });
  if (!register) { res.status(404).json({ error: "cash_register_not_found" }); return; }
  const result = await prisma.$transaction(async (tx) => {
    const open = await tx.posShift.findFirst({ where: { cashRegisterId: register.id, status: "OPEN" }, select: { id: true } });
    if (open) throw new Error("shift_already_open");
    return tx.posShift.create({ data: { cashRegisterId: register.id, operatorId: actor(req as AuthRequest), openingCents: parsed.data.openingCents } });
  });
  res.status(201).json(result);
});

platformRouter.post("/shifts/:id/close", async (req, res) => {
  const parsed = z.object({ declaredCents: z.number().int().nonnegative() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_close" }); return; }
  const shift = await prisma.posShift.findFirst({ where: { id: String(req.params.id), operatorId: actor(req as AuthRequest), cashRegister: { companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { branchId: context(req as AuthRequest).branchId! } : {}) }, status: "OPEN" } });
  if (!shift) { res.status(404).json({ error: "open_shift_not_found" }); return; }
  const updated = await prisma.posShift.update({ where: { id: shift.id }, data: { status: "CLOSED", closedAt: new Date(), declaredCents: parsed.data.declaredCents, closingCents: parsed.data.declaredCents, differenceCents: parsed.data.declaredCents - shift.openingCents } });
  res.json(updated);
});

platformRouter.get("/bank-accounts", async (req, res) => {
  res.json(await prisma.bankAccount.findMany({ where: { companyId: context(req as AuthRequest).companyId, ...(context(req as AuthRequest).branchId ? { OR: [{ branchId: context(req as AuthRequest).branchId! }, { branchId: null }] } : {}) }, orderBy: { name: "asc" } }));
});

platformRouter.post("/bank-accounts/:id/statements", async (req, res) => {
  const parsed = z.object({ statementDate: z.coerce.date(), openingBalanceCents: z.number().int(), closingBalanceCents: z.number().int(), lines: z.array(z.object({ occurredAt: z.coerce.date(), description: z.string().min(1), amountCents: z.number().int(), externalId: z.string().optional() })) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_statement" }); return; }
  const bank = await prisma.bankAccount.findFirst({ where: { id: String(req.params.id), companyId: context(req as AuthRequest).companyId } });
  if (!bank) { res.status(404).json({ error: "bank_account_not_found" }); return; }
  const referenceHash = createHash("sha256").update(JSON.stringify({ bank: bank.id, date: parsed.data.statementDate.toISOString(), closing: parsed.data.closingBalanceCents })).digest("hex");
  const statement = await prisma.bankStatement.upsert({ where: { referenceHash }, create: { bankAccountId: bank.id, referenceHash, statementDate: parsed.data.statementDate, openingBalanceCents: parsed.data.openingBalanceCents, closingBalanceCents: parsed.data.closingBalanceCents, lines: { create: parsed.data.lines.map(line => ({ lineHash: createHash("sha256").update(JSON.stringify(line)).digest("hex"), occurredAt: line.occurredAt, description: line.description, amountCents: line.amountCents })) } }, update: {} , include: { lines: true } });
  res.status(201).json(statement);
});

platformRouter.post("/payment-terminals/:id/transactions", async (req, res) => {
  const parsed = z.object({ idempotencyKey: z.string().min(8), amountCents: z.number().int().positive(), operation: z.enum(["SALE", "REFUND"]).default("SALE"), externalReference: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_payment_transaction" }); return; }
  const terminal = await prisma.paymentTerminal.findFirst({ where: { id: String(req.params.id), companyId: context(req as AuthRequest).companyId, active: true } });
  if (!terminal) { res.status(404).json({ error: "payment_terminal_not_found" }); return; }
  const transaction = await prisma.paymentTransaction.upsert({ where: { idempotencyKey: parsed.data.idempotencyKey }, create: { terminalId: terminal.id, ...parsed.data, status: "PENDING" }, update: {} });
  res.status(201).json(transaction);
});

platformRouter.post("/reprints", async (req, res) => {
  const parsed = z.object({ documentType: z.string().min(1), documentId: z.string().uuid(), reason: z.string().min(3) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_reprint" }); return; }
  res.status(201).json(await prisma.reprintLog.create({ data: { ...parsed.data, companyId: context(req as AuthRequest).companyId, branchId: context(req as AuthRequest).branchId, userId: actor(req as AuthRequest) } }));
});
