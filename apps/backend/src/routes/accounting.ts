import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  companyContext,
  requireAuth,
  requireCompanyContext,
  requireModuleAccess,
  requireRole,
  type AuthRequest,
} from "../middleware/auth.js";
import { audit } from "../services/security.js";
import {
  allocateSubledgerSequence,
  checkHierarchyCycle,
  createFiscalYearClosingConfig,
  ensureAccountingPeriod,
  ensureCompanyChart,
  ensureCompanySubledgers,
  executeFiscalYearClosing,
  getActiveFiscalYearClosingConfig,
  listFiscalYearClosingConfigs,
  previewFiscalYearClosing,
  reopenFiscalYear,
  reverseJournal,
} from "../services/accounting.js";

const accountCreateSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(120),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  accountType: z.enum(["HEADER", "MOVEMENT"]).default("MOVEMENT"),
  category: z.string().max(80).optional(),
  parentId: z.string().uuid().optional().nullable(),
  normalBalance: z.enum(["DEBIT", "CREDIT"]).optional(),
  isActive: z.boolean().default(true).optional(),
  description: z.string().max(300).optional().nullable(),
});

const accountUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  code: z.string().min(1).max(30).optional(),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]).optional(),
  accountType: z.enum(["HEADER", "MOVEMENT"]).optional(),
  category: z.string().max(80).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  normalBalance: z.enum(["DEBIT", "CREDIT"]).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(300).optional().nullable(),
});

const journalSchema = z.object({
  description: z.string().min(2).max(260),
  entryDate: z.coerce.date().optional(),
  journalType: z.string().max(40).default("GENERAL"),
  journalCode: z.string().max(20).optional(),
  documentType: z.string().max(40).default("MANUAL"),
  documentNumber: z.string().max(80).optional().nullable(),
  lines: z
    .array(
      z
        .object({
          accountCode: z.string().min(1),
          description: z.string().max(260).optional(),
          debitCents: z.number().int().nonnegative().default(0),
          creditCents: z.number().int().nonnegative().default(0),
        })
        .refine(
          (line) => (line.debitCents > 0) !== (line.creditCents > 0),
          "line must have debit or credit"
        )
    )
    .min(2),
});

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

export const accountingRouter = Router();
accountingRouter.use(requireAuth, requireCompanyContext);
accountingRouter.use(requireModuleAccess("ACCOUNTING"));

// ====================================================
// PLANO DE CONTAS MULTIEMPRESA (CHART OF ACCOUNTS)
// ====================================================

accountingRouter.get("/chart", async (req, res) => {
  const tenant = companyContext(req);
  await ensureCompanyChart(prisma, tenant.companyId);

  const where: any = { companyId: tenant.companyId };
  if (req.query.type) where.type = String(req.query.type);
  if (req.query.accountType) where.accountType = String(req.query.accountType);
  if (req.query.active !== undefined) where.isActive = req.query.active === "true";

  const accounts = await prisma.account.findMany({
    where,
    orderBy: { code: "asc" },
    include: { parent: { select: { id: true, code: true, name: true } } },
  });

  if (req.query.tree === "true") {
    // Formata retorno como árvore hierárquica
    const byId = new Map(accounts.map((a) => [a.id, { ...a, children: [] as any[] }]));
    const rootNodes: any[] = [];
    for (const acc of byId.values()) {
      if (acc.parentId && byId.has(acc.parentId)) {
        byId.get(acc.parentId)!.children.push(acc);
      } else {
        rootNodes.push(acc);
      }
    }
    res.json(rootNodes);
    return;
  }

  res.json(accounts);
});

accountingRouter.get("/chart/:id", async (req, res) => {
  const tenant = companyContext(req);
  const account = await prisma.account.findFirst({
    where: { id: String(req.params.id), companyId: tenant.companyId },
    include: { parent: true, children: true },
  });
  if (!account) {
    res.status(404).json({ error: "account_not_found" });
    return;
  }
  res.json(account);
});

accountingRouter.post("/chart", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const parsed = accountCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_account_payload", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);

  // Unicidade dentro da mesma empresa
  const existing = await prisma.account.findUnique({
    where: { companyId_code: { companyId: tenant.companyId, code: parsed.data.code } },
  });
  if (existing) {
    res.status(409).json({ error: "account_code_already_exists", code: parsed.data.code });
    return;
  }

  // Validação de parent pertencer ao mesmo tenant
  let parentCode: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.account.findFirst({
      where: { id: parsed.data.parentId, companyId: tenant.companyId },
    });
    if (!parent) {
      res.status(404).json({ error: "parent_account_not_found_in_tenant" });
      return;
    }
    parentCode = parent.code;
  }

  // Normal balance predefinido se omitido
  const normalBalance =
    parsed.data.normalBalance ??
    (["ASSET", "EXPENSE"].includes(parsed.data.type) ? "DEBIT" : "CREDIT");

  const created = await prisma.account.create({
    data: {
      companyId: tenant.companyId,
      code: parsed.data.code,
      name: parsed.data.name,
      type: parsed.data.type,
      accountType: parsed.data.accountType,
      category: parsed.data.category ?? null,
      parentId: parsed.data.parentId ?? null,
      parentCode,
      normalBalance,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive ?? true,
    },
  });

  await audit("ACCOUNT_CREATED", (req as AuthRequest).user?.id, "ACCOUNT", created.id, {
    code: created.code,
    name: created.name,
    accountType: created.accountType,
  });

  res.status(201).json(created);
});

accountingRouter.put("/chart/:id", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const parsed = accountUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_account_payload", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);
  const existing = await prisma.account.findFirst({
    where: { id: String(req.params.id), companyId: tenant.companyId },
  });
  if (!existing) {
    res.status(404).json({ error: "account_not_found" });
    return;
  }

  // Se alterar código, verificar unicidade na empresa
  if (parsed.data.code && parsed.data.code !== existing.code) {
    const duplicate = await prisma.account.findUnique({
      where: { companyId_code: { companyId: tenant.companyId, code: parsed.data.code } },
    });
    if (duplicate) {
      res.status(409).json({ error: "account_code_already_exists", code: parsed.data.code });
      return;
    }
  }

  // Se alterar parent, verificar se pertence à empresa e detetar ciclos
  if (parsed.data.parentId !== undefined && parsed.data.parentId !== existing.parentId) {
    if (parsed.data.parentId) {
      const parent = await prisma.account.findFirst({
        where: { id: parsed.data.parentId, companyId: tenant.companyId },
      });
      if (!parent) {
        res.status(404).json({ error: "parent_account_not_found_in_tenant" });
        return;
      }
      try {
        await checkHierarchyCycle(prisma, tenant.companyId, existing.id, parsed.data.parentId);
      } catch (err: any) {
        res.status(400).json({ error: err.message ?? "account_hierarchy_cycle" });
        return;
      }
    }
  }

  const updated = await prisma.account.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.code !== undefined ? { code: parsed.data.code } : {}),
      ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
      ...(parsed.data.accountType !== undefined ? { accountType: parsed.data.accountType } : {}),
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
      ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId } : {}),
      ...(parsed.data.normalBalance !== undefined ? { normalBalance: parsed.data.normalBalance } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    },
  });

  await audit("ACCOUNT_UPDATED", (req as AuthRequest).user?.id, "ACCOUNT", updated.id, {
    changes: parsed.data,
  });

  res.json(updated);
});

accountingRouter.delete("/chart/:id", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const tenant = companyContext(req);
  const account = await prisma.account.findFirst({
    where: { id: String(req.params.id), companyId: tenant.companyId },
  });
  if (!account) {
    res.status(404).json({ error: "account_not_found" });
    return;
  }

  // 1. Proibir apagar se tiver contas-filhas
  const childrenCount = await prisma.account.count({ where: { parentId: account.id } });
  if (childrenCount > 0) {
    res.status(409).json({ error: "cannot_delete_account_with_children", childrenCount });
    return;
  }

  // 2. Proibir apagar fisicamente contas que já tenham movimentos
  const [linesCount, debitsCount, creditsCount] = await Promise.all([
    prisma.journalLine.count({ where: { accountId: account.id } }),
    prisma.journalEntry.count({ where: { debitAccountId: account.id } }),
    prisma.journalEntry.count({ where: { creditAccountId: account.id } }),
  ]);
  const totalMovements = linesCount + debitsCount + creditsCount;
  if (totalMovements > 0) {
    res.status(409).json({
      error: "cannot_delete_account_with_movements",
      totalMovements,
      message: "Contas com movimentos históricos não podem ser eliminadas. Desative a conta em vez de apagar.",
    });
    return;
  }

  await prisma.account.delete({ where: { id: account.id } });
  await audit("ACCOUNT_DELETED", (req as AuthRequest).user?.id, "ACCOUNT", account.id, {
    code: account.code,
    name: account.name,
  });

  res.json({ message: "account_deleted_successfully", id: account.id });
});

accountingRouter.post("/chart/import-template", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const tenant = companyContext(req);
  const templateSchema = z.object({
    chartVersion: z.string().min(1).default("PGC-AO-2026"),
    source: z.string().min(1).default("Decreto Presidencial n.º 82/01 - Modelo de Referência"),
    responsibleParty: z.string().min(1).default("Contabilista Certificado OCPCA"),
    effectiveDate: z.coerce.date().default(() => new Date()),
    accounts: z.array(accountCreateSchema).optional(),
  });

  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_template_payload", details: parsed.error.flatten() });
    return;
  }

  await ensureCompanyChart(prisma, tenant.companyId);

  if (parsed.data.accounts && parsed.data.accounts.length > 0) {
    for (const item of parsed.data.accounts) {
      await prisma.account.upsert({
        where: { companyId_code: { companyId: tenant.companyId, code: item.code } },
        create: {
          companyId: tenant.companyId,
          code: item.code,
          name: item.name,
          type: item.type,
          accountType: item.accountType,
          category: item.category ?? null,
          normalBalance: item.normalBalance ?? (["ASSET", "EXPENSE"].includes(item.type) ? "DEBIT" : "CREDIT"),
          chartVersion: parsed.data.chartVersion,
          isActive: true,
        },
        update: {
          name: item.name,
          type: item.type,
          accountType: item.accountType,
          category: item.category ?? null,
          chartVersion: parsed.data.chartVersion,
        },
      });
    }
  }

  await audit("CHART_TEMPLATE_IMPORTED", (req as AuthRequest).user?.id, "ACCOUNT_CHART", tenant.companyId, {
    chartVersion: parsed.data.chartVersion,
    source: parsed.data.source,
    responsibleParty: parsed.data.responsibleParty,
  });

  res.json({
    message: "chart_template_imported_successfully",
    chartVersion: parsed.data.chartVersion,
    disclaimer: "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.",
  });
});

// ====================================================
// SUBDIÁRIOS (ACCOUNTING JOURNALS)
// ====================================================

accountingRouter.get("/subledgers", requireRole("ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"), async (req, res) => {
  const tenant = companyContext(req);
  const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : new Date().getUTCFullYear();
  await ensureCompanySubledgers(prisma, tenant.companyId, fiscalYear);

  const subledgers = await prisma.accountingJournal.findMany({
    where: { companyId: tenant.companyId, fiscalYear },
    orderBy: { code: "asc" },
  });
  res.json(subledgers);
});

accountingRouter.post("/subledgers", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const schema = z.object({
    code: z.string().min(2).max(10),
    name: z.string().min(2).max(80),
    type: z.enum(["SALES", "PURCHASES", "CASH", "BANK", "GENERAL", "ADJUSTMENT", "INVENTORY", "CLOSING"]),
    fiscalYear: z.number().int().min(2000).max(2100).default(() => new Date().getUTCFullYear()),
    description: z.string().max(200).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_subledger_payload", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);
  const existing = await prisma.accountingJournal.findUnique({
    where: { companyId_code_fiscalYear: { companyId: tenant.companyId, code: parsed.data.code, fiscalYear: parsed.data.fiscalYear } },
  });
  if (existing) {
    res.status(409).json({ error: "subledger_code_already_exists" });
    return;
  }

  const created = await prisma.accountingJournal.create({
    data: {
      companyId: tenant.companyId,
      branchId: tenant.branchId,
      code: parsed.data.code,
      name: parsed.data.name,
      type: parsed.data.type,
      fiscalYear: parsed.data.fiscalYear,
      description: parsed.data.description ?? null,
      status: "OPEN",
      currentSeq: 0,
      createdBy: (req as AuthRequest).user?.id ?? null,
    },
  });

  await audit("SUBLEDGER_CREATED", (req as AuthRequest).user?.id, "ACCOUNTING_JOURNAL", created.id, {
    code: created.code,
    type: created.type,
  });

  res.status(201).json(created);
});

// ====================================================
// LANÇAMENTOS CONTABILÍSTICOS E SUBMISSÃO
// ====================================================

accountingRouter.get("/entries", async (req, res) => {
  const tenant = companyContext(req);
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: tenant.companyId, branchId: tenant.branchId },
    orderBy: { entryDate: "desc" },
    include: { debitAccount: true, creditAccount: true },
  });
  res.json(entries);
});

accountingRouter.get("/journals", requireRole("ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"), async (req, res) => {
  const tenant = companyContext(req);
  const where: any = { companyId: tenant.companyId };
  if (req.query.journalCode) where.journalCode = String(req.query.journalCode);
  if (req.query.journalType) where.journalType = String(req.query.journalType);
  if (req.query.fiscalYear) where.fiscalYear = Number(req.query.fiscalYear);

  const journals = await prisma.journal.findMany({
    where,
    orderBy: { entryDate: "desc" },
    include: { lines: { include: { account: true } } },
  });
  res.json(journals);
});

accountingRouter.post("/journals", requireRole("ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"), async (req, res) => {
  const parsed = journalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_journal", details: parsed.error.flatten() });
    return;
  }

  const debit = parsed.data.lines.reduce((n, l) => n + l.debitCents, 0);
  const credit = parsed.data.lines.reduce((n, l) => n + l.creditCents, 0);
  if (debit <= 0 || debit !== credit) {
    res.status(400).json({ error: "journal_not_balanced", debitCents: debit, creditCents: credit });
    return;
  }

  const tenant = companyContext(req);
  await ensureCompanyChart(prisma, tenant.companyId);

  // Validação de contas
  const codes = parsed.data.lines.map((l) => l.accountCode);
  const accounts = await prisma.account.findMany({
    where: { companyId: tenant.companyId, code: { in: codes } },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  for (const line of parsed.data.lines) {
    const acc = byCode.get(line.accountCode);
    if (!acc) {
      res.status(404).json({ error: "account_not_found", code: line.accountCode });
      return;
    }
    if (!acc.isActive) {
      res.status(400).json({ error: "account_inactive", code: line.accountCode });
      return;
    }
    if (acc.accountType === "HEADER") {
      res.status(400).json({
        error: "cannot_post_to_header_account",
        code: line.accountCode,
        message: "Contas do tipo HEADER são agregadoras e não podem receber movimentos diretos.",
      });
      return;
    }
  }

  const entryDate = parsed.data.entryDate ?? new Date();
  await ensureAccountingPeriod(prisma, tenant, entryDate);
  const period = await prisma.accountingPeriod.findFirst({
    where: {
      companyId: tenant.companyId,
      startsAt: { lte: entryDate },
      endsAt: { gte: entryDate },
      status: "OPEN",
    },
  });
  if (!period) {
    res.status(409).json({ error: "accounting_period_closed" });
    return;
  }

  const fiscalYear = entryDate.getUTCFullYear();
  const journalCode = parsed.data.journalCode ?? "ODIV";
  const { sequenceNumber } = await allocateSubledgerSequence(
    prisma,
    tenant.companyId,
    journalCode,
    fiscalYear
  );

  const journal = await prisma.journal.create({
    data: {
      companyId: tenant.companyId,
      branchId: tenant.branchId,
      description: parsed.data.description,
      entryDate,
      journalType: parsed.data.journalType,
      documentType: parsed.data.documentType,
      documentNumber: parsed.data.documentNumber ?? null,
      createdBy: (req as AuthRequest).user?.id,
      periodId: period.id,
      journalCode,
      sequenceNumber,
      fiscalYear,
      lines: {
        create: parsed.data.lines.map((line) => ({
          accountId: byCode.get(line.accountCode)!.id,
          description: line.description,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
        })),
      },
    },
    include: { lines: { include: { account: true } } },
  });

  await audit("JOURNAL_CREATED", (req as AuthRequest).user?.id, "JOURNAL", journal.id, {
    journalCode,
    sequenceNumber,
    debitCents: debit,
    creditCents: credit,
  });

  res.status(201).json(journal);
});

accountingRouter.post("/journals/:id/reverse", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  try {
    const reason = req.body?.reason ?? "Estorno de movimento";
    const reversal = await reverseJournal(prisma, companyContext(req), String(req.params.id), new Date(), reason);
    await audit("JOURNAL_REVERSED", (req as AuthRequest).user?.id, "JOURNAL", String(req.params.id), {
      reversalId: reversal.id,
      reason,
    });
    res.status(201).json(reversal);
  } catch (error: any) {
    if (error instanceof Error && error.message === "journal_not_found") {
      res.status(404).json({ error: "journal_not_found" });
      return;
    }
    if (error instanceof Error && error.message === "journal_already_reversed") {
      res.status(409).json({ error: "journal_already_reversed" });
      return;
    }
    throw error;
  }
});

// ====================================================
// PERÍODOS CONTABILÍSTICOS E FECHO/REABERTURA
// ====================================================

accountingRouter.get("/periods", requireRole("ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"), async (req, res) => {
  const tenant = companyContext(req);
  res.json(
    await prisma.accountingPeriod.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { startsAt: "desc" },
    })
  );
});

accountingRouter.post("/periods", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  const parsed = z
    .object({ name: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date() })
    .safeParse(req.body);
  if (!parsed.success || parsed.data.endsAt <= parsed.data.startsAt) {
    res.status(400).json({ error: "invalid_accounting_period" });
    return;
  }
  const tenant = companyContext(req);
  res.status(201).json(
    await prisma.accountingPeriod.create({
      data: { ...parsed.data, companyId: tenant.companyId, branchId: tenant.branchId },
    })
  );
});

accountingRouter.post("/periods/:id/close", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  const tenant = companyContext(req);
  const period = await prisma.accountingPeriod.findFirst({
    where: { id: String(req.params.id), companyId: tenant.companyId },
  });
  if (!period) {
    res.status(404).json({ error: "period_not_found" });
    return;
  }
  if (period.status === "CLOSED") {
    res.json(period);
    return;
  }
  const closingReason = req.body?.reason ?? "Fecho regular de período contabilístico";
  const updated = await prisma.accountingPeriod.update({
    where: { id: period.id },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedBy: (req as AuthRequest).user?.id ?? null,
      closingReason,
    },
  });
  await audit("ACCOUNTING_PERIOD_CLOSED", (req as AuthRequest).user?.id, "ACCOUNTING_PERIOD", period.id, {
    closingReason,
  });
  res.json(updated);
});

accountingRouter.post("/periods/:id/reopen", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const schema = z.object({ reason: z.string().min(5, "O motivo de reabertura deve ter pelo menos 5 caracteres") });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "reopening_reason_required", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);
  const period = await prisma.accountingPeriod.findFirst({
    where: { id: String(req.params.id), companyId: tenant.companyId },
  });
  if (!period) {
    res.status(404).json({ error: "period_not_found" });
    return;
  }

  const updated = await prisma.accountingPeriod.update({
    where: { id: period.id },
    data: {
      status: "OPEN",
      reopenedAt: new Date(),
      reopenedBy: (req as AuthRequest).user?.id ?? null,
      reopeningReason: parsed.data.reason,
    },
  });

  await audit("ACCOUNTING_PERIOD_REOPENED", (req as AuthRequest).user?.id, "ACCOUNTING_PERIOD", period.id, {
    reason: parsed.data.reason,
  });

  res.json(updated);
});

// ====================================================
// PARAMETRIZAÇÃO EXPLÍCITA DE FECHO DE EXERCÍCIO
// ====================================================

const closingConfigSchema = z.object({
  retainedEarningsAccountId: z.string().uuid(),
  closingJournalId: z.string().uuid(),
  sourceAccountTypes: z.string().min(1).default("REVENUE,EXPENSE"),
  sourceCategoryFilter: z.string().max(100).optional().nullable(),
  policyType: z.string().min(1).default("INTERNAL_POLICY"),
  source: z.string().min(3).default("MANUAL_CONTABILISTICO"),
  version: z.string().min(1).default("v1"),
  responsibleParty: z.string().min(3),
  approvalDate: z.coerce.date().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  effectiveFrom: z.coerce.date().optional().nullable(),
  effectiveTo: z.coerce.date().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

accountingRouter.get("/closing-configs", requireRole("ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"), async (req, res) => {
  const tenant = companyContext(req);
  const configs = await listFiscalYearClosingConfigs(prisma, tenant.companyId);
  res.json(configs);
});

accountingRouter.get("/closing-configs/active", requireRole("ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"), async (req, res) => {
  const tenant = companyContext(req);
  const active = await getActiveFiscalYearClosingConfig(prisma, tenant.companyId);
  if (!active) {
    res.status(404).json({ error: "no_active_closing_config", message: "Nenhuma configuração ativa de fecho encontrada para a empresa." });
    return;
  }
  res.json(active);
});

accountingRouter.post("/closing-configs", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const parsed = closingConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_closing_config_payload", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);
  try {
    const config = await createFiscalYearClosingConfig(prisma, tenant.companyId, parsed.data);
    await audit("CLOSING_CONFIG_CREATED", (req as AuthRequest).user?.id, "ACCOUNTING_CONFIG", config.id, {
      version: config.version,
      responsibleParty: config.responsibleParty,
      retainedEarningsAccountId: config.retainedEarningsAccountId,
      closingJournalId: config.closingJournalId,
      sourceAccountTypes: config.sourceAccountTypes,
      policyType: config.policyType,
    });
    res.status(201).json(config);
  } catch (err: any) {
    if (err.message === "retained_earnings_account_not_found" || err.message === "closing_journal_not_found") {
      res.status(404).json({ error: err.message });
      return;
    }
    if (
      err.message === "retained_earnings_account_must_be_equity" ||
      err.message === "retained_earnings_account_must_be_movement" ||
      err.message === "retained_earnings_account_inactive" ||
      err.message === "closing_journal_not_open" ||
      err.message === "responsible_party_required"
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ====================================================
// FECHO E REABERTURA DE EXERCÍCIO FISCAL ANUAL
// ====================================================

accountingRouter.post("/fiscal-year/closing/preview", requireRole("ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"), async (req, res) => {
  const schema = z.object({
    fiscalYear: z.number().int().min(2000).max(2100),
    configId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_preview_payload", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);
  try {
    const preview = await previewFiscalYearClosing(
      prisma,
      tenant.companyId,
      parsed.data.fiscalYear,
      parsed.data.configId
    );
    res.json(preview);
  } catch (err: any) {
    if (err.message === "closing_config_required") {
      res.status(422).json({ error: "closing_config_required", message: "Configuração explícita de fecho não encontrada para a empresa." });
      return;
    }
    if (err.message?.startsWith("cross_tenant_")) {
      res.status(403).json({ error: "company_context_forbidden", message: err.message });
      return;
    }
    if (
      err.message === "retained_earnings_account_must_be_movement" ||
      err.message === "retained_earnings_account_inactive" ||
      err.message === "closing_journal_not_open"
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

accountingRouter.post("/fiscal-year/closing/execute", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const schema = z.object({
    fiscalYear: z.number().int().min(2000).max(2100),
    reason: z.string().min(5),
    configId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_closing_payload", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);
  try {
    const result = await executeFiscalYearClosing(
      prisma,
      tenant.companyId,
      parsed.data.fiscalYear,
      (req as AuthRequest).user?.id ?? "SYSTEM",
      parsed.data.reason,
      parsed.data.configId
    );

    await audit("FISCAL_YEAR_CLOSED", (req as AuthRequest).user?.id, "FISCAL_YEAR_CLOSING", result.closingRecord.id, {
      fiscalYear: parsed.data.fiscalYear,
      netIncomeCents: result.closingRecord.summaryNetIncomeCents,
      configId: result.closingRecord.configId,
      closingJournalId: result.closingRecord.closingJournalId,
    });

    res.status(201).json(result);
  } catch (err: any) {
    if (err.message === "closing_config_required") {
      res.status(422).json({ error: "closing_config_required", message: "Configuração explícita de fecho não encontrada para a empresa." });
      return;
    }
    if (err.message === "fiscal_year_already_closed") {
      res.status(409).json({ error: "fiscal_year_already_closed" });
      return;
    }
    if (err.message === "no_movements_to_close") {
      res.status(400).json({ error: "no_movements_to_close", message: "Não existem movimentos de receitas ou despesas para fechar neste ano." });
      return;
    }
    if (err.message?.startsWith("cross_tenant_")) {
      res.status(403).json({ error: "company_context_forbidden", message: err.message });
      return;
    }
    if (
      err.message === "retained_earnings_account_must_be_movement" ||
      err.message === "retained_earnings_account_inactive" ||
      err.message === "closing_journal_not_open"
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

accountingRouter.post("/fiscal-year/closing/reopen", requireRole("ADMIN", "ROLE_ADMIN"), async (req, res) => {
  const schema = z.object({
    fiscalYear: z.number().int().min(2000).max(2100),
    reason: z.string().min(5, "O motivo de reabertura anual é obrigatório (mín. 5 caracteres)"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_reopen_payload", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);
  try {
    const result = await reopenFiscalYear(
      prisma,
      tenant.companyId,
      parsed.data.fiscalYear,
      (req as AuthRequest).user?.id ?? "SYSTEM",
      parsed.data.reason
    );

    await audit("FISCAL_YEAR_REOPENED", (req as AuthRequest).user?.id, "FISCAL_YEAR_CLOSING", result.closingRecord.id, {
      fiscalYear: parsed.data.fiscalYear,
      reason: parsed.data.reason,
    });

    res.json(result);
  } catch (err: any) {
    if (err.message === "fiscal_year_not_closed") {
      res.status(404).json({ error: "fiscal_year_not_closed" });
      return;
    }
    if (err.message === "reopening_reason_required") {
      res.status(400).json({ error: "reopening_reason_required" });
      return;
    }
    throw err;
  }
});

// ====================================================
// BALANCETES E RELATÓRIOS (ISOLADOS POR EMPRESA)
// ====================================================

accountingRouter.get("/trial-balance", async (req, res) => {
  const tenant = companyContext(req);
  await ensureCompanyChart(prisma, tenant.companyId);

  const columns = req.query.columns === "8" ? 8 : 4;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const where = {
    companyId: tenant.companyId,
    branchId: tenant.branchId,
    ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [accounts, journals, legacy] = await Promise.all([
    prisma.account.findMany({ where: { companyId: tenant.companyId }, orderBy: { code: "asc" } }),
    prisma.journal.findMany({ where, include: { lines: true } }),
    prisma.journalEntry.findMany({ where }),
  ]);

  const totals = new Map(accounts.map((a) => [a.id, { debit: 0, credit: 0 }]));
  for (const j of journals) {
    for (const l of j.lines) {
      const t = totals.get(l.accountId);
      if (t) {
        t.debit += l.debitCents;
        t.credit += l.creditCents;
      }
    }
  }
  for (const e of legacy) {
    const deb = totals.get(e.debitAccountId);
    if (deb) deb.debit += e.amountCents;
    const cred = totals.get(e.creditAccountId);
    if (cred) cred.credit += e.amountCents;
  }

  const rows = accounts.map((a) => {
    const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
    const balance = t.debit - t.credit;
    return {
      code: a.code,
      name: a.name,
      accountType: a.accountType,
      debitCents: t.debit,
      creditCents: t.credit,
      debitBalanceCents: Math.max(balance, 0),
      creditBalanceCents: Math.max(-balance, 0),
      ...(columns === 8 ? { openingDebitCents: 0, openingCreditCents: 0 } : {}),
    };
  });

  res.json({
    columns,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    rows,
    totals: {
      debitCents: rows.reduce((n, r) => n + r.debitCents, 0),
      creditCents: rows.reduce((n, r) => n + r.creditCents, 0),
    },
  });
});

accountingRouter.get("/drn", async (req, res) => {
  const tenant = companyContext(req);
  await ensureCompanyChart(prisma, tenant.companyId);
  const trial = await prisma.account.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { code: "asc" },
  });
  res.json({ documentType: "DRN", generatedAt: new Date().toISOString(), accounts: trial });
});

accountingRouter.get("/tax-rules", async (req, res) => {
  const tenant = companyContext(req);
  res.json(
    await prisma.taxRule.findMany({
      where: { active: true, companyId: tenant.companyId, branchId: tenant.branchId },
      include: { outputAccount: true, inputAccount: true },
      orderBy: { code: "asc" },
    })
  );
});

accountingRouter.post("/tax-rules", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  const parsed = z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
      rate: z.coerce.number().min(0).max(1),
      exemptionCode: z.string().optional(),
      outputAccountId: z.string().optional(),
      inputAccountId: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_tax_rule", details: parsed.error.flatten() });
    return;
  }
  const tenant = companyContext(req);
  res.status(201).json(
    await prisma.taxRule.create({
      data: { ...parsed.data, companyId: tenant.companyId, branchId: tenant.branchId },
    })
  );
});

accountingRouter.get("/financial-statements", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const tenant = companyContext(req);
  const journals = await prisma.journal.findMany({
    where: { companyId: tenant.companyId, branchId: tenant.branchId, entryDate: { gte: from, lte: to }, status: "POSTED" },
    include: { lines: { include: { account: true } } },
  });
  const totals = new Map<string, { code: string; name: string; debit: number; credit: number; type: string }>();
  for (const journal of journals) {
    for (const line of journal.lines) {
      const current = totals.get(line.accountId) ?? {
        code: line.account.code,
        name: line.account.name,
        debit: 0,
        credit: 0,
        type: line.account.type,
      };
      current.debit += line.debitCents;
      current.credit += line.creditCents;
      totals.set(line.accountId, current);
    }
  }
  const rows = [...totals.values()].map((row) => ({ ...row, balanceCents: row.debit - row.credit }));
  const result = (types: string[]) =>
    rows.filter((row) => types.includes(row.type)).reduce((sum, row) => sum + row.balanceCents, 0);

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    balanceSheet: rows.filter((row) => ["ASSET", "LIABILITY", "EQUITY"].includes(row.type)),
    incomeStatement: rows.filter((row) => ["REVENUE", "EXPENSE"].includes(row.type)),
    totals: {
      assetsCents: result(["ASSET"]),
      liabilitiesCents: -result(["LIABILITY"]),
      equityCents: -result(["EQUITY"]),
      revenueCents: -result(["REVENUE"]),
      expensesCents: result(["EXPENSE"]),
    },
  });
});

accountingRouter.get("/receivables", async (req, res) => {
  const tenant = companyContext(req);
  const customers = await prisma.customer.findMany({
    where: { companyId: tenant.companyId, branchId: tenant.branchId, outstandingDebtCents: { gt: 0 } },
    select: { id: true, name: true, nif: true, outstandingDebtCents: true, creditLimitCents: true },
    orderBy: { outstandingDebtCents: "desc" },
  });
  res.json({
    rows: customers,
    totalOpenCents: customers.reduce((sum, customer) => sum + customer.outstandingDebtCents, 0),
  });
});

accountingRouter.get("/payables", async (req, res) => {
  const tenant = companyContext(req);
  const payables = await prisma.accountPayable.findMany({
    where: { status: { not: "PAID" }, purchase: { companyId: tenant.companyId, branchId: tenant.branchId } },
    include: {
      supplier: { select: { id: true, name: true, nif: true } },
      purchase: { select: { id: true, number: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  res.json({
    rows: payables,
    totalOpenCents: payables.reduce((sum, payable) => sum + payable.originalCents - payable.paidCents, 0),
  });
});

accountingRouter.get("/tax-summary", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const tenant = companyContext(req);
  const [sales, purchases] = await Promise.all([
    prisma.sale.aggregate({
      where: { companyId: tenant.companyId, branchId: tenant.branchId, createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      _sum: { taxCents: true, subtotalCents: true },
    }),
    prisma.purchase.aggregate({
      where: { companyId: tenant.companyId, branchId: tenant.branchId, purchasedAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      _sum: { taxCents: true, subtotalCents: true },
    }),
  ]);
  const outputCents = sales._sum.taxCents ?? 0;
  const inputCents = purchases._sum.taxCents ?? 0;
  res.json({ from: from.toISOString(), to: to.toISOString(), outputCents, inputCents, payableCents: outputCents - inputCents });
});

accountingRouter.get("/reconciliation", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const tenant = companyContext(req);
  const [sales, receivables, purchases, payables] = await Promise.all([
    prisma.sale.aggregate({
      where: { companyId: tenant.companyId, branchId: tenant.branchId, createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      _sum: { totalCents: true },
    }),
    prisma.receivablePayment.aggregate({
      where: { customer: { companyId: tenant.companyId, branchId: tenant.branchId }, receivedAt: { gte: from, lte: to } },
      _sum: { amountCents: true },
    }),
    prisma.purchase.aggregate({
      where: { companyId: tenant.companyId, branchId: tenant.branchId, purchasedAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      _sum: { totalCents: true },
    }),
    prisma.payablePayment.aggregate({
      where: { payable: { purchase: { companyId: tenant.companyId, branchId: tenant.branchId } }, paidAt: { gte: from, lte: to } },
      _sum: { amountCents: true },
    }),
  ]);
  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    salesCents: sales._sum.totalCents ?? 0,
    receivedCents: receivables._sum.amountCents ?? 0,
    purchasesCents: purchases._sum.totalCents ?? 0,
    paidCents: payables._sum.amountCents ?? 0,
  });
});

accountingRouter.post("/entries", requireRole("ADMIN", "ROLE_ADMIN", "ROLE_ACCOUNTANT"), async (req, res) => {
  const parsed = journalEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_journal_entry", details: parsed.error.flatten() });
    return;
  }

  const tenant = companyContext(req);
  await ensureCompanyChart(prisma, tenant.companyId);
  const debit = await prisma.account.findUnique({
    where: { companyId_code: { companyId: tenant.companyId, code: parsed.data.debitAccountCode } },
  });
  const credit = await prisma.account.findUnique({
    where: { companyId_code: { companyId: tenant.companyId, code: parsed.data.creditAccountCode } },
  });

  if (!debit || !credit) {
    res.status(404).json({ error: "account_not_found" });
    return;
  }
  if (!debit.isActive || !credit.isActive) {
    res.status(400).json({ error: "account_inactive" });
    return;
  }
  if (debit.accountType === "HEADER" || credit.accountType === "HEADER") {
    res.status(400).json({ error: "cannot_post_to_header_account" });
    return;
  }

  const entry = await prisma.journalEntry.create({
    data: {
      companyId: tenant.companyId,
      branchId: tenant.branchId,
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

  await audit("JOURNAL_ENTRY_CREATED", (req as AuthRequest).user?.id, "JOURNAL_ENTRY", entry.id, {
    amountCents: parsed.data.amountCents,
  });
  res.status(201).json(entry);
});

accountingRouter.get("/summary", async (req, res) => {
  const tenant = companyContext(req);
  await ensureCompanyChart(prisma, tenant.companyId);
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: tenant.companyId, branchId: tenant.branchId },
    include: { debitAccount: true, creditAccount: true },
  });
  const totals: { debits: number; credits: number } = entries.reduce(
    (acc, entry) => {
      acc.debits += entry.amountCents;
      acc.credits += entry.amountCents;
      return acc;
    },
    { debits: 0, credits: 0 }
  );

  res.json({
    entriesCount: entries.length,
    debitsCents: totals.debits,
    creditsCents: totals.credits,
    balanceCents: totals.debits - totals.credits,
  });
});
