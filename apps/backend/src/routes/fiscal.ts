import { Router } from "express";
import { getEnv } from "../config/env.js";
import { z } from "zod";
import QRCode from "qrcode";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { prisma } from "../server.js";
import { audit, verifyPassword } from "../services/security.js";
import { encryptFiscalSecret, exportSaftAo, qrPayload, validateSaftXml } from "../services/fiscal.js";
import { canManageCashSession } from "../services/authorization.js";
export const localCashRouter = Router();
localCashRouter.post("/open-shift", async (req, res) => {
  const parsed = z.object({ pin: z.string().regex(/^\d{4,6}$/), initialAmount: z.number().nonnegative(), registerNumber: z.string().min(1).default("01") }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_attendant_pin", message: "PIN de atendedor inválido ou não cadastrado." }); return; }
  try {
    const attendants = await prisma.user.findMany({ where: { role: { not: "ADMIN" }, pinHash: { not: null } }, select: { id: true, pinHash: true, displayName: true, nif: true, phone: true } });
    let attendant: typeof attendants[number] | undefined;
    for (const candidate of attendants) if (candidate.pinHash && await verifyPassword(parsed.data.pin, candidate.pinHash)) { attendant = candidate; break; }
    if (!attendant) { console.warn("[cashier/open-shift] attendant PIN mismatch"); res.status(403).json({ error: "invalid_attendant_pin", message: "PIN de atendedor inválido ou não cadastrado." }); return; }
    const existing = await prisma.cashSession.findFirst({ where: { openedBy: attendant.id, closedAt: null }, orderBy: { openedAt: "desc" } });
    if (existing) { res.status(409).json({ error: "cash_already_open", message: "Este atendedor já possui um turno aberto.", session: existing }); return; }
    const session = await prisma.cashSession.create({ data: { openedBy: attendant.id, openingCents: Math.round(parsed.data.initialAmount * 100), operatorName: attendant.displayName ?? "Atendedor", operatorNif: attendant.nif ?? "", operatorPhone: attendant.phone ?? "", terminalId: parsed.data.registerNumber } });
    await audit("CASH_OPEN", attendant.id, "CASH_SESSION", session.id, { mode: "ATTENDANT_PIN", terminalId: parsed.data.registerNumber });
    res.status(200).json({ ...session, attendant: { id: attendant.id, name: attendant.displayName, nif: attendant.nif, phone: attendant.phone } });
  } catch (error) { console.error("[cashier/open-shift] failed", error); res.status(500).json({ error: "cash_open_failed", message: "Não foi possível abrir o turno localmente." }); }
});
export const fiscalRouter = Router();
fiscalRouter.use(requireAuth);
fiscalRouter.post("/cash/open", async (req, res) => {
  const parsed = z.object({
    pin: z.string().regex(/^\d{6}$/),
    operatorName: z.string().min(2).optional(),
    cashierName: z.string().min(2).optional(),
    operatorNif: z.string().min(5).optional(),
    cashierNif: z.string().min(5).optional(),
    operatorPhone: z.string().min(7).optional(),
    cashierPhone: z.string().min(7).optional(),
    terminalId: z.string().min(1).optional(),
    registerNumber: z.string().min(1).optional(),
    openingCents: z.number().int().nonnegative().optional(),
    initialAmount: z.number().nonnegative().optional(),
  }).superRefine((value, context) => {
    if (!value.operatorName && !value.cashierName) context.addIssue({ code: "custom", path: ["cashierName"], message: "cashierName is required" });
    if (!value.operatorNif && !value.cashierNif) context.addIssue({ code: "custom", path: ["cashierNif"], message: "cashierNif is required" });
    if (!value.operatorPhone && !value.cashierPhone) context.addIssue({ code: "custom", path: ["cashierPhone"], message: "cashierPhone is required" });
    if (!value.terminalId && !value.registerNumber) context.addIssue({ code: "custom", path: ["registerNumber"], message: "registerNumber is required" });
    if (value.openingCents === undefined && value.initialAmount === undefined) context.addIssue({ code: "custom", path: ["initialAmount"], message: "initialAmount is required" });
  }).safeParse(req.body);
  const userId = (req as AuthRequest).user?.id as string | undefined;
  if (!parsed.success || !userId) {
    console.warn("[cash/open] invalid request", { userId, issues: parsed.success ? [] : parsed.error.flatten() });
    res.status(400).json({ error: "invalid_cash_opening", message: "Dados de abertura inválidos.", details: parsed.success ? undefined : parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const openingCents = data.openingCents ?? Math.round(data.initialAmount! * 100);
  const operatorName = data.operatorName ?? data.cashierName!;
  const operatorNif = data.operatorNif ?? data.cashierNif!;
  const operatorPhone = data.operatorPhone ?? data.cashierPhone!;
  const terminalId = data.terminalId ?? data.registerNumber!;
  try {
    const supervisors = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "admin", "SUPERVISOR", "supervisor"] }, pinHash: { not: null } }, select: { id: true, pinHash: true } });
    let supervisorId: string | undefined;
    for (const supervisor of supervisors) {
      if (supervisor.pinHash && await verifyPassword(data.pin, supervisor.pinHash)) {
        supervisorId = supervisor.id;
        break;
      }
    }
    if (!supervisorId) {
      console.warn("[cash/open] PIN mismatch", { userId, action: "CASH_OPEN" });
      await audit("CASH_OPEN_FAILED", userId, "CASH_SESSION", undefined, { stage: "AUTHENTICATION", reason: "invalid_pin" });
      res.status(403).json({ error: "invalid_pin", message: "PIN inválido." });
      return;
    }
    const existing = await prisma.cashSession.findFirst({ where: { openedBy: userId, closedAt: null }, orderBy: { openedAt: "desc" } });
    if (existing) { res.status(409).json({ error: "cash_already_open", message: "Já existe um turno aberto.", session: existing }); return; }
    const session = await prisma.cashSession.create({ data: { openedBy: userId, openingCents, operatorName, operatorNif, operatorPhone, terminalId } });
    await audit("CASH_OPEN", userId, "CASH_SESSION", session.id, { supervisorId, operatorName, operatorNif, operatorPhone, terminalId });
    res.status(200).json(session);
  } catch (error) {
    console.error("[cash/open] database or authentication failure", { userId, error });
    await audit("CASH_OPEN_FAILED", userId, "CASH_SESSION", undefined, { stage: "PERSISTENCE", reason: error instanceof Error ? error.message : "unknown_error" }).catch((auditError) => console.error("[cash/open] audit failure", auditError));
    res.status(500).json({ error: "cash_open_failed", message: "Não foi possível abrir o turno no servidor." });
  }
});
fiscalRouter.post("/cash/:id/close", async (req, res) => {
  const closingCents = z.object({ closingCents: z.number().int().nonnegative() }).parse(req.body).closingCents;
  const userId = (req as AuthRequest).user?.id as string;
  const role = (req as AuthRequest).user?.role;
  const existing = await prisma.cashSession.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) { res.status(404).json({ error: "cash_session_not_found" }); return; }
  if (!canManageCashSession(existing.openedBy, userId, role)) { res.status(403).json({ error: "cash_session_forbidden" }); return; }
  if (existing.closedAt) { res.status(409).json({ error: "cash_session_already_closed" }); return; }
  const session = await prisma.cashSession.update({ where: { id: String(req.params.id), }, data: { closedBy: userId, closedAt: new Date(), closingCents } }); await audit("CASH_CLOSE", userId, "CASH_SESSION", session.id); res.json(session);
});
fiscalRouter.get("/cash/current", async (req, res) => {
  const userId = (req as AuthRequest).user?.id as string;
  const session = await prisma.cashSession.findFirst({ where: { openedBy: userId, closedAt: null }, orderBy: { openedAt: "desc" } });
  if (!session) { res.json(null); return; }
  const sales = await prisma.sale.aggregate({ where: { cashSessionId: session.id, status: { not: "CANCELLED" } }, _sum: { totalCents: true, cashCents: true, cardCents: true, transferCents: true }, _count: { id: true } });
  res.json({ ...session, summary: { salesCount: sales._count.id, totalCents: sales._sum.totalCents ?? 0, cashCents: sales._sum.cashCents ?? 0, cardCents: sales._sum.cardCents ?? 0, transferCents: sales._sum.transferCents ?? 0, expectedCashCents: session.openingCents + (sales._sum.cashCents ?? 0) + session.suprimentoCents - session.sangriaCents } });
});
fiscalRouter.post("/cash/:id/adjustment", async (req, res) => {
  const parsed = z.object({ type: z.enum(["SANGRIA", "SUPRIMENTO"]), amountCents: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_cash_adjustment" }); return; }
  const userId = (req as AuthRequest).user?.id as string;
  const existing = await prisma.cashSession.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) { res.status(404).json({ error: "cash_session_not_found" }); return; }
  if (!canManageCashSession(existing.openedBy, userId, (req as AuthRequest).user?.role)) { res.status(403).json({ error: "cash_session_forbidden" }); return; }
  if (existing.closedAt) { res.status(409).json({ error: "cash_session_closed" }); return; }
  const field = parsed.data.type === "SANGRIA" ? "sangriaCents" : "suprimentoCents";
  const session = await prisma.cashSession.update({ where: { id: String(req.params.id) }, data: { [field]: { increment: parsed.data.amountCents } } });
  await audit(parsed.data.type, userId, "CASH_SESSION", session.id, { amountCents: parsed.data.amountCents });
  res.json(session);
});
fiscalRouter.get("/saft", async (req, res) => {
  const parsed = z.object({ from: z.coerce.date(), to: z.coerce.date() }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "invalid_date_range" }); return; }
  const xml = await exportSaftAo(parsed.data.from, parsed.data.to);
  try { validateSaftXml(xml); } catch { res.status(500).json({ error: "invalid_saft_output" }); return; }
  res.type("application/xml").send(xml);
});

fiscalRouter.get("/saft/validation", (_req, res) => res.json({ mode: getEnv().SAFT_AO_XSD_PATH ? "configured-xsd" : "structural", caveat: "This is not official AGT legal homologation. Configure the current official XSD to validate against it." }));

fiscalRouter.get("/sales/:id/qr.svg", async (req, res) => {
  const sale = await prisma.sale.findUnique({ where: { id: String(req.params.id) } });
  if (!sale) { res.status(404).json({ error: "not_found" }); return; }
  const data = sale.qrCode ?? qrPayload({ number: sale.number, totalCents: sale.totalCents, taxCents: sale.taxCents, issuedAt: sale.createdAt, hash: sale.fiscalHash ?? "" });
  res.type("image/svg+xml").send(await QRCode.toString(data, { type: "svg", margin: 1 }));
});
fiscalRouter.post("/qr/validate", async (req, res) => {
  const parsed = z.object({ payload: z.string().min(1).max(1000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_qr_payload" }); return; }
  const fields = new Map(parsed.data.payload.trim().split(";").map((field) => field.split(/:(.*)/s, 2) as [string, string]));
  const number = fields.get("F");
  const hash = fields.get("H");
  const total = fields.get("T");
  if (fields.get("A") !== getEnv().COMPANY_NIF || !number || !hash || !total) { res.status(400).json({ error: "invalid_agt_qr" }); return; }
  const sale = await prisma.sale.findUnique({ where: { number }, include: { lines: { include: { product: true } } } });
  if (!sale || sale.fiscalHash !== hash || Number(total) !== sale.totalCents / 100) { res.status(404).json({ error: "qr_validation_failed" }); return; }
  res.json({ valid: true, document: { number: sale.number, totalCents: sale.totalCents, taxCents: sale.taxCents, issuedAt: sale.createdAt, hash: sale.fiscalHash, status: sale.status }, lines: sale.lines.map((line) => ({ product: line.product.name, quantity: line.quantity, unitPriceCents: line.unitPriceCents })) });
});

fiscalRouter.get("/config", requireRole("ADMIN"), async (_req, res) => {
  const config = await prisma.fiscalConfig.findUnique({ where: { id: "default" } });
  res.json({ configured: Boolean(config), companyName: config?.companyName ?? "", companyNif: config?.companyNif ?? "", companyAddress: config?.companyAddress ?? "", companyProvince: config?.companyProvince ?? "", companyPhone: config?.companyPhone ?? "", invoiceSeries: config?.invoiceSeries ?? "A", saftSchedule: config?.saftSchedule ?? "", updatedAt: config?.updatedAt ?? null, secrets: { certificatePfx: Boolean(config?.certificatePfxEncrypted), privateKeyPem: Boolean(config?.privateKeyPemEncrypted), passphrase: Boolean(config?.passphraseEncrypted), license: Boolean(config?.licenseEncrypted) } });
});
fiscalRouter.put("/config", requireRole("ADMIN"), async (req, res) => {
  const body = z.object({ companyName: z.string().max(200).optional(), companyNif: z.string().max(30).optional(), companyAddress: z.string().max(300).optional(), companyProvince: z.string().max(100).optional(), companyPhone: z.string().max(50).optional(), invoiceSeries: z.string().min(1).max(20).optional(), saftSchedule: z.string().max(100).optional(), certificatePfx: z.string().optional(), privateKeyPem: z.string().optional(), passphrase: z.string().optional(), license: z.string().optional() }).parse(req.body);
  const config = await prisma.fiscalConfig.upsert({ where: { id: "default" }, create: { id: "default", companyName: body.companyName, companyNif: body.companyNif, companyAddress: body.companyAddress, companyProvince: body.companyProvince, companyPhone: body.companyPhone, invoiceSeries: body.invoiceSeries ?? "A", saftSchedule: body.saftSchedule, certificatePfxEncrypted: body.certificatePfx ? encryptFiscalSecret(body.certificatePfx) : null, privateKeyPemEncrypted: body.privateKeyPem ? encryptFiscalSecret(body.privateKeyPem) : null, passphraseEncrypted: body.passphrase ? encryptFiscalSecret(body.passphrase) : null, licenseEncrypted: body.license ? encryptFiscalSecret(body.license) : null }, update: { companyName: body.companyName, companyNif: body.companyNif, companyAddress: body.companyAddress, companyProvince: body.companyProvince, companyPhone: body.companyPhone, invoiceSeries: body.invoiceSeries, saftSchedule: body.saftSchedule, ...(body.certificatePfx ? { certificatePfxEncrypted: encryptFiscalSecret(body.certificatePfx) } : {}), ...(body.privateKeyPem ? { privateKeyPemEncrypted: encryptFiscalSecret(body.privateKeyPem) } : {}), ...(body.passphrase ? { passphraseEncrypted: encryptFiscalSecret(body.passphrase) } : {}), ...(body.license ? { licenseEncrypted: encryptFiscalSecret(body.license) } : {}) } });
  await audit("FISCAL_CONFIG_UPDATED", (req as AuthRequest).user?.id, "FISCAL_CONFIG", config.id);
  res.json({ configured: true, updatedAt: config.updatedAt });
});
fiscalRouter.post("/saft/schedule", requireRole("ADMIN"), async (req, res) => {
  const schedule = z.object({ schedule: z.string().max(100) }).parse(req.body);
  const config = await prisma.fiscalConfig.upsert({ where: { id: "default" }, create: { id: "default", saftSchedule: schedule.schedule }, update: { saftSchedule: schedule.schedule } });
  await audit("SAFT_SCHEDULE_UPDATED", (req as AuthRequest).user?.id, "FISCAL_CONFIG", config.id);
  res.json({ schedule: config.saftSchedule, configured: true });
});
