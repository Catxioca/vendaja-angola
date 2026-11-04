import { Prisma } from "@prisma/client";

export type Db = Prisma.TransactionClient;
export type AccountingTenant = { companyId: string; branchId: string | null };

export interface BaseAccountDefinition {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  accountType: "HEADER" | "MOVEMENT";
  category?: string;
  parentCode?: string;
  normalBalance: "DEBIT" | "CREDIT";
  description?: string;
}

/**
 * Modelo de demonstração / base inicial (PROVISIONAL_DEMO).
 * Modelagem contabilística configurável por empresa, sujeita a fonte oficial e validação por contabilista certificado.
 * Não constitui plano oficial taxativo nem pressuposto legal obrigatório.
 */
export const PROVISIONAL_DEMO_ACCOUNTS_TEMPLATE: BaseAccountDefinition[] = [
  // Agrupadores Sintéticos (HEADER / Totalizadoras - Não movimentáveis diretamente)
  { code: "1", name: "Ativos", type: "ASSET", accountType: "HEADER", category: "ATIVO", normalBalance: "DEBIT", description: "Grupo Sintético - Ativos" },
  { code: "2", name: "Passivos", type: "LIABILITY", accountType: "HEADER", category: "PASSIVO", normalBalance: "CREDIT", description: "Grupo Sintético - Passivos" },
  { code: "3", name: "Património Líquido", type: "EQUITY", accountType: "HEADER", category: "PATRIMONIO", normalBalance: "CREDIT", description: "Grupo Sintético - Capital e Reservas" },
  { code: "4", name: "Receitas / Proveitos", type: "REVENUE", accountType: "HEADER", category: "RECEITA", normalBalance: "CREDIT", description: "Grupo Sintético - Proveitos e Rendimentos" },
  { code: "5", name: "Despesas / Custos", type: "EXPENSE", accountType: "HEADER", category: "DESPESA", normalBalance: "DEBIT", description: "Grupo Sintético - Gastos e Despesas" },

  // Subcontas Operacionais de Movimento (MOVEMENT / Lançáveis)
  { code: "6", name: "Caixa Geral", type: "ASSET", accountType: "MOVEMENT", category: "CAIXA", parentCode: "1", normalBalance: "DEBIT", description: "Disponibilidades em Caixa" },
  { code: "7", name: "Clientes Correntes", type: "ASSET", accountType: "MOVEMENT", category: "CLIENTES", parentCode: "1", normalBalance: "DEBIT", description: "Contas Correntes de Clientes" },
  { code: "8", name: "Fornecedores Correntes", type: "LIABILITY", accountType: "MOVEMENT", category: "FORNECEDORES", parentCode: "2", normalBalance: "CREDIT", description: "Contas a Pagar a Fornecedores" },
  { code: "9", name: "Vendas de Mercadorias", type: "REVENUE", accountType: "MOVEMENT", category: "VENDAS", parentCode: "4", normalBalance: "CREDIT", description: "Vendas Brutas Faturadas" },
  { code: "10", name: "Compras de Mercadorias", type: "EXPENSE", accountType: "MOVEMENT", category: "COMPRAS", parentCode: "5", normalBalance: "DEBIT", description: "Aquisição de Mercadorias" },
  { code: "11", name: "IVA Liquidado", type: "LIABILITY", accountType: "MOVEMENT", category: "IVA_LIQUIDADO", parentCode: "2", normalBalance: "CREDIT", description: "Imposto sobre Valor Acrescentado Liquidado" },
  { code: "12", name: "IVA Dedutível", type: "ASSET", accountType: "MOVEMENT", category: "IVA_DEDUTIVEL", parentCode: "1", normalBalance: "DEBIT", description: "Imposto sobre Valor Acrescentado Dedutível" },
  { code: "13", name: "Custo das Mercadorias Vendidas (CMV)", type: "EXPENSE", accountType: "MOVEMENT", category: "CMV", parentCode: "5", normalBalance: "DEBIT", description: "Custo de Existências Vendidas e Consumidas" },
  { code: "14", name: "Inventário / Existências", type: "ASSET", accountType: "MOVEMENT", category: "INVENTARIO", parentCode: "1", normalBalance: "DEBIT", description: "Mercadorias em Armazém" },
  { code: "15", name: "Despesas Operacionais e Gerais", type: "EXPENSE", accountType: "MOVEMENT", category: "DESPESAS_OPERACIONAIS", parentCode: "5", normalBalance: "DEBIT", description: "Fornecimentos e Serviços de Terceiros" },
  { code: "16", name: "Resultados Transitados (Exemplo Demonstrativo)", type: "EQUITY", accountType: "MOVEMENT", category: "PATRIMONIO", parentCode: "3", normalBalance: "CREDIT", description: "Exemplo demonstrativo de conta de resultados transitados" },
  { code: "17", name: "Resultado Líquido do Exercício (Exemplo Demonstrativo)", type: "EQUITY", accountType: "MOVEMENT", category: "PATRIMONIO", parentCode: "3", normalBalance: "CREDIT", description: "Exemplo demonstrativo de apuramento do exercício" },
];

export const BASE_ACCOUNTS_TEMPLATE = PROVISIONAL_DEMO_ACCOUNTS_TEMPLATE;

export interface DefaultSubledgerDefinition {
  code: string;
  name: string;
  type: string;
  description: string;
}

export const DEFAULT_SUBLEDGERS: DefaultSubledgerDefinition[] = [
  { code: "VEND", name: "Diário de Vendas", type: "SALES", description: "Faturação e notas de crédito de clientes" },
  { code: "COMP", name: "Diário de Compras", type: "PURCHASES", description: "Faturas de compra e notas de débito de fornecedores" },
  { code: "CAIX", name: "Diário de Caixa", type: "CASH", description: "Movimentos de entradas e saídas de numerário" },
  { code: "BANC", name: "Diário de Bancos", type: "BANK", description: "Movimentação de contas bancárias e transferências" },
  { code: "ODIV", name: "Diário de Operações Diversas", type: "GENERAL", description: "Lançamentos manuais e operações correntes" },
  { code: "REGL", name: "Diário de Regularizações", type: "ADJUSTMENT", description: "Estornos, acertos e correções contabilísticas" },
  { code: "STCK", name: "Diário de Inventário/Stock", type: "INVENTORY", description: "Entradas, saídas e quebras de inventário" },
  { code: "ENC", name: "Diário de Encerramento", type: "CLOSING", description: "Subdiário demonstrativo para apuramento de resultados e encerramento anual" },
];

/**
 * Garante que o plano de contas base existe para a empresa indicada,
 * respeitando estritamente o isolamento multi-tenant por companyId.
 */
export async function ensureCompanyChart(db: Db, companyId: string) {
  // 1. Criar/garantir contas de nível HEADER primeiro
  for (const def of BASE_ACCOUNTS_TEMPLATE.filter((a) => a.accountType === "HEADER")) {
    await db.account.upsert({
      where: { companyId_code: { companyId, code: def.code } },
      create: {
        companyId,
        code: def.code,
        name: def.name,
        type: def.type,
        accountType: def.accountType,
        category: def.category,
        normalBalance: def.normalBalance,
        description: def.description,
        isActive: true,
      },
      update: {},
    });
  }

  // 2. Criar/garantir contas MOVEMENT associando ao parentId correspondente
  const headers = await db.account.findMany({
    where: { companyId, accountType: "HEADER" },
  });
  const headerMap = new Map(headers.map((h) => [h.code, h.id]));

  for (const def of BASE_ACCOUNTS_TEMPLATE.filter((a) => a.accountType === "MOVEMENT")) {
    const parentId = def.parentCode ? headerMap.get(def.parentCode) ?? null : null;
    await db.account.upsert({
      where: { companyId_code: { companyId, code: def.code } },
      create: {
        companyId,
        code: def.code,
        name: def.name,
        type: def.type,
        accountType: def.accountType,
        category: def.category,
        parentCode: def.parentCode,
        parentId,
        normalBalance: def.normalBalance,
        description: def.description,
        isActive: true,
      },
      update: {},
    });
  }
}

/**
 * Garante a criação dos 8 subdiários padrão para o exercício e empresa especificados.
 */
export async function ensureCompanySubledgers(db: Db, companyId: string, fiscalYear: number) {
  for (const sub of DEFAULT_SUBLEDGERS) {
    await db.accountingJournal.upsert({
      where: { companyId_code_fiscalYear: { companyId, code: sub.code, fiscalYear } },
      create: {
        companyId,
        code: sub.code,
        name: sub.name,
        type: sub.type,
        fiscalYear,
        description: sub.description,
        status: "OPEN",
        currentSeq: 0,
      },
      update: {},
    });
  }
}

/**
 * Alocação atómica e concorrente da sequência do subdiário para a empresa e exercício.
 * Garante ausência de colisões e integridade transacional.
 */
export async function allocateSubledgerSequence(
  db: Db,
  companyId: string,
  journalCode: string,
  fiscalYear: number
): Promise<{ sequenceNumber: number; subledger: any }> {
  await ensureCompanySubledgers(db, companyId, fiscalYear);
  const updated = await db.accountingJournal.update({
    where: { companyId_code_fiscalYear: { companyId, code: journalCode, fiscalYear } },
    data: { currentSeq: { increment: 1 } },
  });
  return { sequenceNumber: updated.currentSeq, subledger: updated };
}

/**
 * Deteção rigorosa de ciclos na árvore hierárquica de contas.
 * Impede que uma conta seja colocada como filha de si mesma ou de um dos seus descendentes.
 */
export async function checkHierarchyCycle(
  db: Db,
  companyId: string,
  targetAccountId: string,
  proposedParentId: string | null
): Promise<void> {
  if (!proposedParentId) return;
  if (targetAccountId === proposedParentId) {
    throw new Error("account_hierarchy_cycle");
  }

  let currentId: string | null = proposedParentId;
  const visited = new Set<string>([targetAccountId]);

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error("account_hierarchy_cycle");
    }
    visited.add(currentId);

    const parent: { parentId: string | null; companyId: string | null } | null = await db.account.findUnique({
      where: { id: currentId },
      select: { parentId: true, companyId: true },
    });

    if (!parent) break;
    if (parent.companyId !== companyId) {
      throw new Error("cross_tenant_parent_account");
    }
    currentId = parent.parentId;
  }
}

/**
 * Resolução segura de conta contábil por código para o tenant especificado.
 */
export async function account(
  db: Db,
  tenantOrCode: AccountingTenant | string,
  optionalCode?: string
) {
  const tenant = typeof tenantOrCode === "object" ? tenantOrCode : null;
  const code = typeof tenantOrCode === "string" ? tenantOrCode : optionalCode!;

  if (!code) throw new Error("account_code_required");

  if (tenant?.companyId) {
    let existing = await db.account.findUnique({
      where: { companyId_code: { companyId: tenant.companyId, code } },
    });
    if (!existing) {
      await ensureCompanyChart(db, tenant.companyId);
      existing = await db.account.findUnique({
        where: { companyId_code: { companyId: tenant.companyId, code } },
      });
    }
    if (!existing) {
      const def = BASE_ACCOUNTS_TEMPLATE.find((a) => a.code === code);
      if (!def) throw new Error(`account_definition_missing:${code}`);
      existing = await db.account.create({
        data: {
          companyId: tenant.companyId,
          code: def.code,
          name: def.name,
          type: def.type,
          accountType: def.accountType,
          category: def.category,
          parentCode: def.parentCode,
          normalBalance: def.normalBalance,
          description: def.description,
          isActive: true,
        },
      });
    }
    return existing;
  }

  // Fallback para pesquisas sem contexto de empresa explícito (compatibilidade de dados pré-Fase 2)
  const legacy = await db.account.findFirst({ where: { code } });
  if (legacy) return legacy;

  const def = BASE_ACCOUNTS_TEMPLATE.find((a) => a.code === code);
  if (!def) throw new Error(`account_definition_missing:${code}`);
  return db.account.create({
    data: {
      code: def.code,
      name: def.name,
      type: def.type,
      accountType: def.accountType,
      category: def.category,
      parentCode: def.parentCode,
      normalBalance: def.normalBalance,
      description: def.description,
      isActive: true,
    },
  });
}

/**
 * Garante a existência do período contabilístico para a empresa e data.
 */
export async function ensureAccountingPeriod(db: Db, tenant: AccountingTenant, date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const existing = await db.accountingPeriod.findUnique({
    where: { companyId_startsAt_endsAt: { companyId: tenant.companyId, startsAt: start, endsAt: end } },
  });
  if (existing) return existing;
  return db.accountingPeriod.upsert({
    where: { companyId_startsAt_endsAt: { companyId: tenant.companyId, startsAt: start, endsAt: end } },
    create: {
      companyId: tenant.companyId,
      branchId: tenant.branchId,
      name: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      startsAt: start,
      endsAt: end,
      status: "OPEN",
    },
    update: {},
  });
}

export interface PostJournalInput {
  sourceType: string;
  sourceId: string;
  date: Date;
  description: string;
  documentType: string;
  documentNumber?: string | null;
  journalType?: string;
  journalCode?: string;
  correlationId?: string;
  reason?: string;
  reversalOfId?: string;
  lines: Array<{
    code: string;
    debitCents: number;
    creditCents: number;
    description?: string;
  }>;
}

/**
 * Mapeador inteligente de subdiário por omissão com base no tipo de operação.
 */
function resolveSubledgerCode(input: PostJournalInput): string {
  if (input.journalCode) return input.journalCode;
  switch (input.sourceType) {
    case "SALE":
    case "SALE_COGS":
      return "VEND";
    case "PURCHASE":
      return "COMP";
    case "EXPENSE":
      return "ODIV";
    case "RECEIVABLE_PAYMENT":
    case "PAYABLE_PAYMENT":
      return "CAIX";
    case "JOURNAL_REVERSAL":
      return "REGL";
    case "CLOSING":
      throw new Error("closing_journal_code_required");
    default:
      return "ODIV";
  }
}

/**
 * Lançamento contabilístico com validação estrita de partidas dobradas,
 * verificação de contas ativas e de movimento (rejeitando HEADER),
 * bloqueio de período fechado e sequenciação auditável por subdiário.
 */
export async function post(db: Db, tenant: AccountingTenant, input: PostJournalInput) {
  // Idempotência
  const existing = await db.journal.findUnique({
    where: {
      companyId_sourceType_sourceId: {
        companyId: tenant.companyId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    include: { lines: true },
  });
  if (existing) return existing;

  // 1. Validação de Partidas Dobradas
  const debit = input.lines.reduce((sum, line) => sum + line.debitCents, 0);
  const credit = input.lines.reduce((sum, line) => sum + line.creditCents, 0);
  if (debit <= 0 || debit !== credit) {
    throw new Error("journal_not_balanced");
  }

  // 2. Validação de Período Contabilístico
  const period = await ensureAccountingPeriod(db, tenant, input.date);
  if (period.status !== "OPEN") {
    if (process.env.ACCOUNTING_ALLOW_CLOSED_PERIOD !== "true") {
      throw new Error("accounting_period_closed_or_missing");
    }
    await db.accountingPeriod.update({
      where: { id: period.id },
      data: { status: "OPEN", closedAt: null, closedBy: null },
    });
  }

  // 3. Validação e Resolução de Contas (Apenas MOVEMENT e Ativas da mesma empresa)
  await ensureCompanyChart(db, tenant.companyId);
  const resolvedLines = await Promise.all(
    input.lines.map(async (line) => {
      const acc = await account(db, tenant, line.code);
      if (!acc) {
        throw new Error(`account_not_found:${line.code}`);
      }
      if (acc.companyId && acc.companyId !== tenant.companyId) {
        throw new Error(`cross_tenant_account_forbidden:${line.code}`);
      }
      if (!acc.isActive) {
        throw new Error(`account_inactive:${line.code}`);
      }
      if (acc.accountType === "HEADER") {
        throw new Error(`cannot_post_to_header_account:${line.code}`);
      }
      return {
        accountId: acc.id,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        description: line.description,
      };
    })
  );

  // 4. Sequenciação Concorrente no Subdiário da Empresa e Exercício
  const fiscalYear = input.date.getUTCFullYear();
  const subledgerCode = resolveSubledgerCode(input);
  const { sequenceNumber } = await allocateSubledgerSequence(
    db,
    tenant.companyId,
    subledgerCode,
    fiscalYear
  );

  // 5. Persistência Atómica
  return db.journal.create({
    data: {
      companyId: tenant.companyId,
      branchId: tenant.branchId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      entryDate: input.date,
      description: input.description,
      journalType: input.journalType ?? subledgerCode,
      documentType: input.documentType,
      documentNumber: input.documentNumber ?? null,
      periodId: period.id,
      journalCode: subledgerCode,
      sequenceNumber,
      fiscalYear,
      reversalOfId: input.reversalOfId ?? null,
      correlationId: input.correlationId ?? null,
      reason: input.reason ?? null,
      lines: {
        create: resolvedLines.map((line) => ({
          accountId: line.accountId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          description: line.description,
        })),
      },
    },
    include: { lines: true },
  });
}

// ----------------------------------------------------
// INTEGRAÇÕES AUTOMÁTICAS DE NEGÓCIO (PRESERVADAS)
// ----------------------------------------------------

export async function postSaleAccounting(
  db: Db,
  tenant: AccountingTenant,
  sale: {
    id: string;
    createdAt: Date;
    totalCents: number;
    subtotalCents: number;
    taxCents: number;
    paymentMethod: string;
    customerId: string | null;
    number: string;
    costCents?: number;
  }
) {
  const receivable = sale.paymentMethod === "CREDIT" ? "7" : "6";
  const journal = await post(db, tenant, {
    sourceType: "SALE",
    sourceId: sale.id,
    date: sale.createdAt,
    description: `Venda ${sale.number}`,
    documentType: "SALE",
    documentNumber: sale.number,
    journalCode: "VEND",
    lines: [
      { code: receivable, debitCents: sale.totalCents, creditCents: 0 },
      { code: "9", debitCents: 0, creditCents: sale.subtotalCents },
      ...(sale.taxCents > 0 ? [{ code: "11", debitCents: 0, creditCents: sale.taxCents }] : []),
    ],
  });

  if ((sale.costCents ?? 0) > 0) {
    await post(db, tenant, {
      sourceType: "SALE_COGS",
      sourceId: sale.id,
      date: sale.createdAt,
      description: `CMV ${sale.number}`,
      documentType: "SALE_COGS",
      documentNumber: sale.number,
      journalCode: "STCK",
      lines: [
        { code: "13", debitCents: sale.costCents ?? 0, creditCents: 0 },
        { code: "14", debitCents: 0, creditCents: sale.costCents ?? 0 },
      ],
    });
  }

  return journal;
}

export async function postPurchaseAccounting(
  db: Db,
  tenant: AccountingTenant,
  purchase: {
    id: string;
    purchasedAt: Date;
    totalCents: number;
    subtotalCents: number;
    taxCents: number;
    paymentMethod: string;
    number: string;
  }
) {
  const payable = purchase.paymentMethod === "CREDIT" ? "8" : "6";
  return post(db, tenant, {
    sourceType: "PURCHASE",
    sourceId: purchase.id,
    date: purchase.purchasedAt,
    description: `Compra ${purchase.number}`,
    documentType: "PURCHASE",
    documentNumber: purchase.number,
    journalCode: "COMP",
    lines: [
      { code: "14", debitCents: purchase.subtotalCents, creditCents: 0 },
      ...(purchase.taxCents > 0 ? [{ code: "12", debitCents: purchase.taxCents, creditCents: 0 }] : []),
      { code: payable, debitCents: 0, creditCents: purchase.totalCents },
    ],
  });
}

export async function postExpenseAccounting(
  db: Db,
  tenant: AccountingTenant,
  expense: {
    id: string;
    expenseDate: Date;
    amountCents: number;
    paymentMethod: string;
    description: string;
  }
) {
  const credit = expense.paymentMethod === "CREDIT" ? "8" : "6";
  return post(db, tenant, {
    sourceType: "EXPENSE",
    sourceId: expense.id,
    date: expense.expenseDate,
    description: expense.description,
    documentType: "EXPENSE",
    journalCode: "ODIV",
    lines: [
      { code: "15", debitCents: expense.amountCents, creditCents: 0 },
      { code: credit, debitCents: 0, creditCents: expense.amountCents },
    ],
  });
}

export async function postReceivablePaymentAccounting(
  db: Db,
  tenant: AccountingTenant,
  payment: { id: string; receivedAt: Date; amountCents: number }
) {
  return post(db, tenant, {
    sourceType: "RECEIVABLE_PAYMENT",
    sourceId: payment.id,
    date: payment.receivedAt,
    description: "Recebimento de cliente",
    documentType: "RECEIPT",
    journalCode: "CAIX",
    lines: [
      { code: "6", debitCents: payment.amountCents, creditCents: 0 },
      { code: "7", debitCents: 0, creditCents: payment.amountCents },
    ],
  });
}

export async function postPayablePaymentAccounting(
  db: Db,
  tenant: AccountingTenant,
  payment: { id: string; paidAt: Date; amountCents: number }
) {
  return post(db, tenant, {
    sourceType: "PAYABLE_PAYMENT",
    sourceId: payment.id,
    date: payment.paidAt,
    description: "Pagamento a fornecedor",
    documentType: "PAYMENT",
    journalCode: "CAIX",
    lines: [
      { code: "8", debitCents: payment.amountCents, creditCents: 0 },
      { code: "6", debitCents: 0, creditCents: payment.amountCents },
    ],
  });
}

export async function reverseJournal(
  db: Db,
  tenant: AccountingTenant,
  journalId: string,
  date = new Date(),
  reason = "Estorno contabilístico",
  targetJournalCode?: string
) {
  const original = await db.journal.findFirst({
    where: {
      id: journalId,
      companyId: tenant.companyId,
      ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
    },
    include: { lines: true },
  });
  if (!original) throw new Error("journal_not_found");
  if (original.status === "REVERSED") throw new Error("journal_already_reversed");

  const accountRows = await db.account.findMany({
    where: { id: { in: original.lines.map((line) => line.accountId) } },
  });
  const codes = new Map(accountRows.map((row) => [row.id, row.code]));

  const journalCode = targetJournalCode ?? (original.journalCode ?? "REGL");

  const reversal = await post(db, tenant, {
    sourceType: "JOURNAL_REVERSAL",
    sourceId: original.id,
    date,
    description: `Reversão: ${original.description}`,
    documentType: "REVERSAL",
    journalCode,
    reversalOfId: original.id,
    reason,
    lines: original.lines.map((line) => ({
      code: codes.get(line.accountId) ?? "",
      debitCents: line.creditCents,
      creditCents: line.debitCents,
      description: `Estorno: ${line.description ?? ""}`,
    })),
  });

  await db.journal.update({
    where: { id: original.id },
    data: { status: "REVERSED" },
  });

  return reversal;
}

// ----------------------------------------------------
// FECHO E REABERTURA CONTROLADOS DE EXERCÍCIO (PARAMETRIZAÇÃO EXPLÍCITA)
// ----------------------------------------------------

export interface FiscalYearClosingConfigInput {
  retainedEarningsAccountId: string;
  closingJournalId: string;
  sourceAccountTypes?: string;
  sourceCategoryFilter?: string | null;
  policyType?: string;
  source?: string;
  version?: string;
  responsibleParty: string;
  approvalDate?: Date | string;
  status?: "ACTIVE" | "INACTIVE";
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
  notes?: string | null;
}

export async function createFiscalYearClosingConfig(
  db: Db,
  companyId: string,
  input: FiscalYearClosingConfigInput
) {
  if (!input.responsibleParty || input.responsibleParty.trim().length < 3) {
    throw new Error("responsible_party_required");
  }

  // 1. Validar conta de resultados transitados (deve pertencer à mesma empresa, ser EQUITY, MOVEMENT e ativa)
  const account = await db.account.findFirst({
    where: { id: input.retainedEarningsAccountId, companyId },
  });
  if (!account) {
    throw new Error("retained_earnings_account_not_found");
  }
  if (account.type !== "EQUITY") {
    throw new Error("retained_earnings_account_must_be_equity");
  }
  if (account.accountType !== "MOVEMENT") {
    throw new Error("retained_earnings_account_must_be_movement");
  }
  if (!account.isActive) {
    throw new Error("retained_earnings_account_inactive");
  }

  // 2. Validar subdiário de fecho (deve pertencer à mesma empresa e estar OPEN)
  const journal = await db.accountingJournal.findFirst({
    where: { id: input.closingJournalId, companyId },
  });
  if (!journal) {
    throw new Error("closing_journal_not_found");
  }
  if (journal.status !== "OPEN") {
    throw new Error("closing_journal_not_open");
  }

  const version = input.version?.trim() || `v-${Date.now()}`;
  const source = input.source?.trim() || "MANUAL_CONTABILISTICO";
  const status = input.status ?? "ACTIVE";
  const sourceAccountTypes = input.sourceAccountTypes?.trim() || "REVENUE,EXPENSE";
  const sourceCategoryFilter = input.sourceCategoryFilter?.trim() || null;
  const policyType = input.policyType?.trim() || "INTERNAL_POLICY";

  // Se o novo estado for ACTIVE, desativar configurações ativas anteriores da empresa
  if (status === "ACTIVE") {
    await db.fiscalYearClosingConfig.updateMany({
      where: { companyId, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
  }

  return db.fiscalYearClosingConfig.create({
    data: {
      companyId,
      retainedEarningsAccountId: account.id,
      closingJournalId: journal.id,
      sourceAccountTypes,
      sourceCategoryFilter,
      policyType,
      source,
      version,
      responsibleParty: input.responsibleParty.trim(),
      approvalDate: input.approvalDate ? new Date(input.approvalDate) : new Date(),
      status,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      notes: input.notes?.trim() || null,
    },
    include: {
      retainedEarningsAccount: true,
      closingJournal: true,
    },
  });
}

export async function getActiveFiscalYearClosingConfig(
  db: Db,
  companyId: string,
  configId?: string
) {
  if (configId) {
    return db.fiscalYearClosingConfig.findFirst({
      where: { id: configId, companyId, status: "ACTIVE" },
      include: {
        retainedEarningsAccount: true,
        closingJournal: true,
      },
    });
  }

  return db.fiscalYearClosingConfig.findFirst({
    where: { companyId, status: "ACTIVE" },
    orderBy: { approvalDate: "desc" },
    include: {
      retainedEarningsAccount: true,
      closingJournal: true,
    },
  });
}

export async function listFiscalYearClosingConfigs(db: Db, companyId: string) {
  return db.fiscalYearClosingConfig.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: {
      retainedEarningsAccount: true,
      closingJournal: true,
    },
  });
}

export interface FiscalYearClosingPreview {
  fiscalYear: number;
  configId: string;
  sourceAccountTypes: string;
  policyType: string;
  revenueTotalCents: number;
  expenseTotalCents: number;
  netIncomeCents: number; // Positivo = Lucro, Negativo = Prejuízo
  retainedEarningsAccountId: string;
  retainedEarningsAccountCode: string;
  retainedEarningsAccountName: string;
  closingJournalId: string;
  closingJournalCode: string;
  simulatedLines: Array<{
    accountCode: string;
    accountName: string;
    debitCents: number;
    creditCents: number;
  }>;
}

/**
 * Simulação / Pré-visualização do fecho de exercício sem alterar a base de dados.
 * Opera exclusivamente com base na configuração explícita e ativa da empresa.
 */
export async function previewFiscalYearClosing(
  db: Db,
  companyId: string,
  fiscalYear: number,
  configId?: string
): Promise<FiscalYearClosingPreview> {
  const config = await getActiveFiscalYearClosingConfig(db, companyId, configId);
  if (!config) {
    throw new Error("closing_config_required");
  }

  // Validação rigorosa contra vazamento ou violação de integridade cross-tenant
  if (config.companyId !== companyId) {
    throw new Error("cross_tenant_closing_config_forbidden");
  }
  if (config.retainedEarningsAccount.companyId !== companyId) {
    throw new Error("cross_tenant_retained_earnings_account_forbidden");
  }
  if (config.retainedEarningsAccount.accountType === "HEADER") {
    throw new Error("retained_earnings_account_must_be_movement");
  }
  if (!config.retainedEarningsAccount.isActive) {
    throw new Error("retained_earnings_account_inactive");
  }
  if (config.closingJournal.companyId !== companyId) {
    throw new Error("cross_tenant_closing_journal_forbidden");
  }
  if (config.closingJournal.status !== "OPEN") {
    throw new Error("closing_journal_not_open");
  }

  const startDate = new Date(Date.UTC(fiscalYear, 0, 1));
  const endDate = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59, 999));

  // Contas de movimento ativas da empresa conforme tipos configurados explicitamente na política
  const targetTypes = (config.sourceAccountTypes || "REVENUE,EXPENSE")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const accountsWhere: Prisma.AccountWhereInput = {
    companyId,
    type: { in: targetTypes },
    accountType: "MOVEMENT",
    isActive: true,
  };
  if (config.sourceCategoryFilter) {
    accountsWhere.category = config.sourceCategoryFilter;
  }

  const accounts = await db.account.findMany({
    where: accountsWhere,
  });

  const journals = await db.journal.findMany({
    where: {
      companyId,
      entryDate: { gte: startDate, lte: endDate },
      status: "POSTED",
      journalCode: { not: config.closingJournal.code }, // Ignorar lançamentos de fecho prévios no diário configurado
    },
    include: { lines: true },
  });

  const totals = new Map<string, { debit: number; credit: number }>();
  for (const j of journals) {
    for (const l of j.lines) {
      const cur = totals.get(l.accountId) ?? { debit: 0, credit: 0 };
      cur.debit += l.debitCents;
      cur.credit += l.creditCents;
      totals.set(l.accountId, cur);
    }
  }

  let revenueTotalCents = 0;
  let expenseTotalCents = 0;
  const simulatedLines: FiscalYearClosingPreview["simulatedLines"] = [];

  for (const acc of accounts) {
    const t = totals.get(acc.id) ?? { debit: 0, credit: 0 };
    // Determinar saldo com base na natureza de saldo da conta (normalBalance) ou semântica configurada
    const isCreditNormal = acc.normalBalance === "CREDIT" || acc.type === "REVENUE";
    if (isCreditNormal) {
      const balance = t.credit - t.debit;
      if (balance !== 0) {
        revenueTotalCents += balance;
        // Para zerar saldo credor: Debita
        simulatedLines.push({
          accountCode: acc.code,
          accountName: acc.name,
          debitCents: balance > 0 ? balance : 0,
          creditCents: balance < 0 ? -balance : 0,
        });
      }
    } else {
      const balance = t.debit - t.credit;
      if (balance !== 0) {
        expenseTotalCents += balance;
        // Para zerar saldo devedor: Credita
        simulatedLines.push({
          accountCode: acc.code,
          accountName: acc.name,
          debitCents: balance < 0 ? -balance : 0,
          creditCents: balance > 0 ? balance : 0,
        });
      }
    }
  }

  const netIncomeCents = revenueTotalCents - expenseTotalCents;
  const retainedEarningsCode = config.retainedEarningsAccount.code;
  const retainedEarningsName = config.retainedEarningsAccount.name;

  if (netIncomeCents > 0) {
    // Lucro líquido: Credita conta de resultados configurada
    simulatedLines.push({
      accountCode: retainedEarningsCode,
      accountName: retainedEarningsName,
      debitCents: 0,
      creditCents: netIncomeCents,
    });
  } else if (netIncomeCents < 0) {
    // Prejuízo líquido: Debita conta de resultados configurada
    simulatedLines.push({
      accountCode: retainedEarningsCode,
      accountName: retainedEarningsName,
      debitCents: -netIncomeCents,
      creditCents: 0,
    });
  }

  return {
    fiscalYear,
    configId: config.id,
    sourceAccountTypes: config.sourceAccountTypes,
    policyType: config.policyType,
    revenueTotalCents,
    expenseTotalCents,
    netIncomeCents,
    retainedEarningsAccountId: config.retainedEarningsAccountId,
    retainedEarningsAccountCode: retainedEarningsCode,
    retainedEarningsAccountName: retainedEarningsName,
    closingJournalId: config.closingJournalId,
    closingJournalCode: config.closingJournal.code,
    simulatedLines,
  };
}

/**
 * Executa transacionalmente o fecho de exercício anual,
 * gerando o lançamento de transferência de resultados no subdiário configurado
 * e registando a auditoria de fecho imutável vinculada à parametrização explícita.
 */
export async function executeFiscalYearClosing(
  db: Db,
  companyId: string,
  fiscalYear: number,
  userId: string,
  reason: string,
  configId?: string
) {
  const existingClosing = await db.fiscalYearClosing.findUnique({
    where: { companyId_fiscalYear: { companyId, fiscalYear } },
  });
  if (existingClosing && existingClosing.status === "CLOSED") {
    throw new Error("fiscal_year_already_closed");
  }

  const preview = await previewFiscalYearClosing(db, companyId, fiscalYear, configId);
  if (preview.simulatedLines.length < 2) {
    throw new Error("no_movements_to_close");
  }

  const closingDate = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59, 999));
  const closingJournal = await post(db, { companyId, branchId: null }, {
    sourceType: "CLOSING",
    sourceId: `FY-${fiscalYear}-${companyId}`,
    date: closingDate,
    description: `Fecho do Exercício Fiscal ${fiscalYear}: ${reason}`,
    documentType: "CLOSING",
    journalCode: preview.closingJournalCode,
    reason,
    lines: preview.simulatedLines.map((l) => ({
      code: l.accountCode,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      description: `Encerramento ${fiscalYear}`,
    })),
  });

  // Fechar todos os períodos do ano
  await db.accountingPeriod.updateMany({
    where: {
      companyId,
      startsAt: { gte: new Date(Date.UTC(fiscalYear, 0, 1)) },
      endsAt: { lte: closingDate },
      status: "OPEN",
    },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedBy: userId,
      closingReason: `Fecho de Exercício ${fiscalYear}`,
    },
  });

  // Criar ou atualizar registo de fecho
  const closingRecord = await db.fiscalYearClosing.upsert({
    where: { companyId_fiscalYear: { companyId, fiscalYear } },
    create: {
      companyId,
      fiscalYear,
      status: "CLOSED",
      configId: preview.configId,
      retainedEarningsAccountId: preview.retainedEarningsAccountId,
      closingJournalId: closingJournal.id,
      closedAt: new Date(),
      closedBy: userId,
      closingReason: reason,
      summaryNetIncomeCents: preview.netIncomeCents,
    },
    update: {
      status: "CLOSED",
      configId: preview.configId,
      retainedEarningsAccountId: preview.retainedEarningsAccountId,
      closingJournalId: closingJournal.id,
      closedAt: new Date(),
      closedBy: userId,
      closingReason: reason,
      reopenedAt: null,
      reopenedBy: null,
      reopeningReason: null,
      reopeningJournalId: null,
      summaryNetIncomeCents: preview.netIncomeCents,
    },
  });

  return { closingRecord, closingJournal };
}

/**
 * Reabertura controlada de exercício fiscal.
 * Não elimina o lançamento de fecho histórico; em vez disso, gera um estorno auditável
 * no mesmo subdiário e regista utilizador, data e motivo obrigatório.
 */
export async function reopenFiscalYear(
  db: Db,
  companyId: string,
  fiscalYear: number,
  userId: string,
  reason: string
) {
  if (!reason || reason.trim().length < 5) {
    throw new Error("reopening_reason_required");
  }

  const existingClosing = await db.fiscalYearClosing.findUnique({
    where: { companyId_fiscalYear: { companyId, fiscalYear } },
  });
  if (!existingClosing || existingClosing.status !== "CLOSED") {
    throw new Error("fiscal_year_not_closed");
  }

  if (!existingClosing.closingJournalId) {
    throw new Error("closing_journal_missing");
  }

  // Obter o subdiário utilizado no fecho original para manter coerência estrita
  const closingJournalRecord = await db.journal.findUnique({
    where: { id: existingClosing.closingJournalId },
  });
  if (!closingJournalRecord) {
    throw new Error("closing_journal_record_not_found");
  }
  const subledgerCode = closingJournalRecord.journalCode ?? undefined;

  // Reabre os períodos contabilísticos correspondentes primeiro
  const reopeningDate = new Date();
  await db.accountingPeriod.updateMany({
    where: {
      companyId,
      startsAt: { gte: new Date(Date.UTC(fiscalYear, 0, 1)) },
      endsAt: { lte: new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59, 999)) },
    },
    data: {
      status: "OPEN",
      reopenedAt: reopeningDate,
      reopenedBy: userId,
      reopeningReason: reason,
    },
  });

  // Gera o estorno auditável do fecho no mesmo subdiário do lançamento de fecho
  const reversalJournal = await reverseJournal(
    db,
    { companyId, branchId: null },
    existingClosing.closingJournalId,
    reopeningDate,
    `Reabertura do Exercício ${fiscalYear}: ${reason}`,
    subledgerCode
  );

  const updatedClosing = await db.fiscalYearClosing.update({
    where: { id: existingClosing.id },
    data: {
      status: "REOPENED",
      reopenedAt: reopeningDate,
      reopenedBy: userId,
      reopeningReason: reason,
      reopeningJournalId: reversalJournal.id,
    },
  });

  return { closingRecord: updatedClosing, reversalJournal };
}
