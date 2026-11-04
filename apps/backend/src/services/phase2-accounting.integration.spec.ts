import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { getEffectiveTestDatabaseUrl } from "./db-test-helper.js";
import { getEnv } from "../config/env.js";
import { accountingRouter } from "../routes/accounting.js";
import { allocateSubledgerSequence, ensureCompanyChart, ensureCompanySubledgers } from "./accounting.js";

const databaseUrl = await getEffectiveTestDatabaseUrl();
const integration = databaseUrl ? test : test.skip;

integration("Fase 2 PostgreSQL: Fundação Contabilística Multiempresa, Plano de Contas, Subdiários e Governação", async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/accounting", accountingRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    try { server.close(); } catch {}
    try { await prisma.$disconnect(); } catch {}
  });

  const suffix = randomUUID().slice(0, 8);
  const jwtSecret = getEnv().JWT_SECRET;

  // 1. Fixture de Empresas A e B
  const [companyA, companyB] = await Promise.all([
    prisma.company.create({ data: { legalName: `Empresa Alfa Contab ${suffix}`, nif: `541${suffix.slice(0, 6)}` } }),
    prisma.company.create({ data: { legalName: `Empresa Beta Contab ${suffix}`, nif: `542${suffix.slice(0, 6)}` } }),
  ]);

  const [branchA, branchB] = await Promise.all([
    prisma.branch.create({ data: { companyId: companyA.id, code: `BRA2-${suffix}`, name: "Filial Alfa" } }),
    prisma.branch.create({ data: { companyId: companyB.id, code: `BRB2-${suffix}`, name: "Filial Beta" } }),
  ]);

  // Sementeira inicial das árvores de contas base para Empresa A e B
  await ensureCompanyChart(prisma, companyA.id);
  await ensureCompanyChart(prisma, companyB.id);

  // Utilizadores: Admin em A, Admin em B
  const [userAdminA, userAdminB] = await Promise.all([
    prisma.user.create({
      data: {
        email: `admin-a-contab-${suffix}@teste.ao`,
        username: `admin_a_contab_${suffix}`,
        passwordHash: "dummy-hash",
        displayName: "Admin Alfa Contab",
        role: "ROLE_ADMIN",
      },
    }),
    prisma.user.create({
      data: {
        email: `admin-b-contab-${suffix}@teste.ao`,
        username: `admin_b_contab_${suffix}`,
        passwordHash: "dummy-hash",
        displayName: "Admin Beta Contab",
        role: "ROLE_ADMIN",
      },
    }),
  ]);

  await Promise.all([
    prisma.companyMembership.create({
      data: { userId: userAdminA.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_ADMIN", active: true, modules: ["ACCOUNTING", "SETTINGS"] },
    }),
    prisma.companyMembership.create({
      data: { userId: userAdminB.id, companyId: companyB.id, branchId: branchB.id, role: "ROLE_ADMIN", active: true, modules: ["ACCOUNTING", "SETTINGS"] },
    }),
  ]);

  const tokenA = jwt.sign(
    { id: userAdminA.id, email: userAdminA.email, role: "ROLE_ADMIN" },
    jwtSecret,
    { expiresIn: "1h" }
  );
  const tokenB = jwt.sign(
    { id: userAdminB.id, email: userAdminB.email, role: "ROLE_ADMIN" },
    jwtSecret,
    { expiresIn: "1h" }
  );

  const currentYear = new Date().getUTCFullYear();

  // Helper HTTP
  async function request(path: string, options: { method?: string; headers?: Record<string, string>; body?: any } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, ok: res.ok, body: json ?? text };
  }

  // ==========================================
  // 1. ISOLAMENTO MULTIEMPRESA
  // ==========================================
  await t.test("1.1 Conta criada na Empresa A não é visível na Empresa B", async () => {
    // Cria conta exclusiva em A
    const resCreate = await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        code: "11.1",
        name: "Caixa Filial Alfa Exclusiva",
        type: "ASSET",
        accountType: "MOVEMENT",
        normalBalance: "DEBIT",
      },
    });
    assert.equal(resCreate.status, 201, "Conta em A deve ser criada com 201");
    const accountAId = resCreate.body.id;

    // Listagem da Empresa B não deve conter accountAId
    const resListB = await request("/api/v1/accounting/chart", {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(resListB.status, 200);
    const codesInB = (resListB.body as any[]).map((acc) => acc.code);
    assert.ok(!codesInB.includes("11.1"), "Empresa B não deve ver a conta 11.1 da Empresa A");

    // Consulta direta pelo ID a partir de B deve retornar 404
    const resGetB = await request(`/api/v1/accounting/chart/${accountAId}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(resGetB.status, 404, "Empresa B não pode consultar conta da Empresa A por ID");
  });

  await t.test("1.2 Tentativa de associar parentId de outra empresa falha com 400 ou 404", async () => {
    // Obtém uma conta HEADER da Empresa A
    const accHeaderA = await prisma.account.findFirst({
      where: { companyId: companyA.id, accountType: "HEADER" },
    });
    assert.ok(accHeaderA, "Empresa A deve ter contas HEADER");

    // Tentativa de criar conta na Empresa B apontando accHeaderA.id como parentId
    const resCrossParent = await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenB}` },
      body: {
        code: "99.CROSS",
        name: "Conta Cross Tenant Incorreta",
        type: "ASSET",
        accountType: "MOVEMENT",
        parentId: accHeaderA.id,
      },
    });
    assert.ok([400, 404].includes(resCrossParent.status), "Deve rejeitar parentId pertencente a outra empresa");
    assert.ok(
      ["invalid_parent_account_cross_company", "parent_account_not_found_in_tenant"].includes(resCrossParent.body.error),
      "Erro deve indicar parent inválido ou não pertencente ao tenant"
    );
  });

  await t.test("1.3 Subdiários da Empresa A são inacessíveis pela Empresa B e cabeçalho forjado x-company-id é bloqueado com 403", async () => {
    // Garante subdiários para A e B
    await ensureCompanySubledgers(prisma, companyA.id, currentYear);
    await ensureCompanySubledgers(prisma, companyB.id, currentYear);

    // Consulta legítima da Empresa B
    const resSubB = await request("/api/v1/accounting/subledgers", {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(resSubB.status, 200);
    const subsB = resSubB.body as any[];
    assert.ok(subsB.length >= 8, "Empresa B deve ter pelo menos 8 subdiários canónicos");
    for (const sub of subsB) {
      assert.equal(sub.companyId, companyB.id, "Subdiários devem ser da Empresa B");
    }

    // Tentativa com header forjado x-company-id da Empresa A deve ser bloqueada com 403
    const resForged = await request("/api/v1/accounting/subledgers", {
      headers: {
        authorization: `Bearer ${tokenB}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resForged.status, 403, "Header x-company-id de empresa externa deve retornar 403");
    assert.equal(resForged.body.error, "company_context_forbidden");
  });

  // ==========================================
  // 2. INTEGRIDADE DO PLANO DE CONTAS
  // ==========================================
  await t.test("2.1 Código duplicado na mesma empresa rejeitado com 409; mesmo código em empresas distintas permitido com 201", async () => {
    // Cria 12.1 na Empresa A
    const resA1 = await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { code: "12.1", name: "Banco Alfa Kwanza", type: "ASSET", accountType: "MOVEMENT" },
    });
    assert.equal(resA1.status, 201);

    // Duplicado na Empresa A deve retornar 409
    const resA2 = await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { code: "12.1", name: "Banco Alfa Duplicado", type: "ASSET", accountType: "MOVEMENT" },
    });
    assert.equal(resA2.status, 409, "Código repetido na mesma empresa deve falhar com 409");
    assert.equal(resA2.body.error, "account_code_already_exists");

    // Mesmo código 12.1 na Empresa B deve ser permitido com 201
    const resB = await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenB}` },
      body: { code: "12.1", name: "Banco Beta Kwanza", type: "ASSET", accountType: "MOVEMENT" },
    });
    assert.equal(resB.status, 201, "Mesmo código em empresa distinta deve ser aceite com 201");
  });

  await t.test("2.2 Tentativa de criar ciclo hierárquico na árvore rejeitada com 400", async () => {
    // Cria Conta Raiz Nível 1
    const r1 = await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { code: "TREE.1", name: "Raiz Árvore", type: "ASSET", accountType: "HEADER" },
    });
    assert.equal(r1.status, 201);
    const id1 = r1.body.id;

    // Cria Conta Nível 2 filha de 1
    const r2 = await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { code: "TREE.2", name: "Filho Nível 2", type: "ASSET", accountType: "HEADER", parentId: id1 },
    });
    assert.equal(r2.status, 201);
    const id2 = r2.body.id;

    // Tentativa de alterar Conta 1 para ser filha de Conta 2 (ciclo 1 -> 2 -> 1)
    const resCycle = await request(`/api/v1/accounting/chart/${id1}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { parentId: id2 },
    });
    assert.equal(resCycle.status, 400, "Ciclo hierárquico deve ser rejeitado com 400");
    assert.equal(resCycle.body.error, "account_hierarchy_cycle");
  });

  await t.test("2.3 Lançamento contra conta HEADER é rejeitado com 400", async () => {
    // Conta 1 é HEADER
    const headerAcc = await prisma.account.findFirst({
      where: { companyId: companyA.id, code: "1" },
    });
    assert.ok(headerAcc && headerAcc.accountType === "HEADER");

    // Tentativa de postar diário usando conta HEADER
    const resPost = await request("/api/v1/accounting/journals", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        description: "Teste lançamento contra conta de cabeçalho",
        journalCode: "ODIV",
        journalType: "MANUAL",
        lines: [
          { accountCode: "1", debitCents: 10000, creditCents: 0 },
          { accountCode: "12.1", debitCents: 0, creditCents: 10000 },
        ],
      },
    });
    assert.equal(resPost.status, 400, "Lançamento em conta HEADER deve ser rejeitado com 400");
    assert.equal(resPost.body.error, "cannot_post_to_header_account");
  });

  await t.test("2.4 Lançamento contra conta inativa (isActive = false) rejeitado com 400", async () => {
    // Cria conta inativa
    const rInactive = await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { code: "INACT.1", name: "Conta Inativa Teste", type: "EXPENSE", accountType: "MOVEMENT", isActive: false },
    });
    assert.equal(rInactive.status, 201);

    const resPost = await request("/api/v1/accounting/journals", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        description: "Teste lançamento contra conta inativa",
        journalCode: "ODIV",
        lines: [
          { accountCode: "INACT.1", debitCents: 5000, creditCents: 0 },
          { accountCode: "12.1", debitCents: 0, creditCents: 5000 },
        ],
      },
    });
    assert.equal(resPost.status, 400, "Lançamento em conta inativa deve ser rejeitado com 400");
    assert.equal(resPost.body.error, "account_inactive");
  });

  await t.test("2.5 Lançamento desbalanceado rejeitado com 400", async () => {
    const resPost = await request("/api/v1/accounting/journals", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        description: "Lançamento desequilibrado",
        journalCode: "ODIV",
        lines: [
          { accountCode: "11.1", debitCents: 15000, creditCents: 0 },
          { accountCode: "12.1", debitCents: 0, creditCents: 10000 },
        ],
      },
    });
    assert.equal(resPost.status, 400, "Lançamento com débito != crédito deve ser rejeitado com 400");
    assert.equal(resPost.body.error, "journal_not_balanced");
  });

  await t.test("2.6 Lançamento em período contabilístico fechado rejeitado com 409", async () => {
    // Cria período fechado de 2020 para empresa A com limites exatos
    const start = new Date(Date.UTC(2020, 0, 1));
    const end = new Date(Date.UTC(2020, 0, 31, 23, 59, 59, 999));
    await prisma.accountingPeriod.upsert({
      where: { companyId_startsAt_endsAt: { companyId: companyA.id, startsAt: start, endsAt: end } },
      create: {
        companyId: companyA.id,
        branchId: branchA.id,
        name: "2020-01",
        startsAt: start,
        endsAt: end,
        status: "CLOSED",
        closingReason: "Auditoria externa",
        closedAt: new Date(),
      },
      update: {
        status: "CLOSED",
        closingReason: "Auditoria externa",
        closedAt: new Date(),
      },
    });

    const resPost = await request("/api/v1/accounting/journals", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        description: "Lançamento retroativo em período fechado",
        entryDate: "2020-01-15T10:00:00.000Z",
        journalCode: "ODIV",
        lines: [
          { accountCode: "11.1", debitCents: 8000, creditCents: 0 },
          { accountCode: "12.1", debitCents: 0, creditCents: 8000 },
        ],
      },
    });
    assert.equal(resPost.status, 409, "Lançamento em período fechado deve ser rejeitado com 409");
    assert.equal(resPost.body.error, "accounting_period_closed");
  });

  await t.test("2.7 Eliminação de conta com movimentos rejeitada com 409", async () => {
    // Realiza lançamento válido usando conta 11.1
    const resPost = await request("/api/v1/accounting/journals", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        description: "Lançamento para testar proteção de integridade na eliminação",
        journalCode: "ODIV",
        lines: [
          { accountCode: "11.1", debitCents: 2000, creditCents: 0 },
          { accountCode: "12.1", debitCents: 0, creditCents: 2000 },
        ],
      },
    });
    assert.equal(resPost.status, 201, "Lançamento deve ser criado com sucesso");

    const acc11 = await prisma.account.findFirst({
      where: { companyId: companyA.id, code: "11.1" },
    });
    assert.ok(acc11);

    // Tentativa de apagar conta 11.1
    const resDelete = await request(`/api/v1/accounting/chart/${acc11.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resDelete.status, 409, "Conta com movimentos não pode ser eliminada (409)");
    assert.equal(resDelete.body.error, "cannot_delete_account_with_movements");
  });

  // ==========================================
  // 3. SUBDIÁRIOS E SEQUENCIAÇÃO CONCORRENTE
  // ==========================================
  await t.test("3.1 Criação e consulta dos 8 subdiários canónicos por empresa", async () => {
    const resSubs = await request("/api/v1/accounting/subledgers", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resSubs.status, 200);
    const subCodes = (resSubs.body as any[]).map((s) => s.code);
    const expected = ["VEND", "COMP", "CAIX", "BANC", "ODIV", "REGL", "STCK", "ENC"];
    for (const code of expected) {
      assert.ok(subCodes.includes(code), `Subdiário obrigatório ${code} deve existir`);
    }
  });

  await t.test("3.2 Execução concorrente simulada (10 lançamentos concorrentes) gerando sequências estritamente incrementais sem colisões", async () => {
    // Usamos allocateSubledgerSequence diretamente com concorrência real contra PostgreSQL
    const concurrentRuns = 10;
    const promises = Array.from({ length: concurrentRuns }).map(() =>
      allocateSubledgerSequence(prisma, companyA.id, "ODIV", currentYear)
    );

    const allocated = await Promise.all(promises);
    assert.equal(allocated.length, concurrentRuns);

    // Todas as sequências devem ser números inteiros únicos
    const seqSet = new Set(allocated.map((a) => a.sequenceNumber));
    assert.equal(seqSet.size, concurrentRuns, "Não deve haver colisões de sequência em transações concorrentes");

    // Verificar se são ordenadas e consecutivas
    const sorted = [...allocated.map((a) => a.sequenceNumber)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      assert.equal(curr, prev + 1, "As sequências alocadas concorrentemente devem ser contíguas");
    }
  });

  await t.test("3.3 Subdiários com mesmo código em empresas distintas e anos fiscais mantêm sequências isoladas", async () => {
    // Aloca na empresa A
    const seqA = await allocateSubledgerSequence(prisma, companyA.id, "BANC", 2026);
    // Aloca na empresa B no mesmo ano
    const seqB = await allocateSubledgerSequence(prisma, companyB.id, "BANC", 2026);
    // Aloca na empresa A em ano fiscal diferente
    const seqA_Future = await allocateSubledgerSequence(prisma, companyA.id, "BANC", 2027);

    assert.ok(seqA.sequenceNumber >= 1);
    assert.ok(seqB.sequenceNumber >= 1);
    assert.ok(seqA_Future.sequenceNumber === 1, "Ano fiscal 2027 deve iniciar sequência em 1");
  });

  // ==========================================
  // 4. PARAMETRIZAÇÃO EXPLÍCITA, FECHO E REABERTURA DE EXERCÍCIO
  // ==========================================

  await t.test("4.0 Tentativas de preview e fecho sem parametrização explícita ativa são bloqueadas com 422", async () => {
    const resPreview = await request("/api/v1/accounting/fiscal-year/closing/preview", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { fiscalYear: currentYear },
    });
    assert.equal(resPreview.status, 422, "Preview sem configuração deve falhar com 422");
    assert.equal(resPreview.body.error, "closing_config_required");

    const resExecute = await request("/api/v1/accounting/fiscal-year/closing/execute", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { fiscalYear: currentYear, reason: "Fecho sem configuração prévia" },
    });
    assert.equal(resExecute.status, 422, "Execução sem configuração deve falhar com 422");
    assert.equal(resExecute.body.error, "closing_config_required");
  });

  let configAId: string;
  let closingJournalAId: string;
  let closingJournalCodeA: string;
  let retainedEarningsAccountAId: string;

  await t.test("4.1 Criação de parametrização explícita de fecho valida conta MOVEMENT, EQUITY e diário OPEN", async () => {
    // Obter conta HEADER para testar rejeição
    const headerAcc = await prisma.account.findFirst({
      where: { companyId: companyA.id, accountType: "HEADER", type: "EQUITY" },
    });
    assert.ok(headerAcc);

    // Obter subdiário de encerramento da Empresa A (tipo CLOSING)
    const subENC = await prisma.accountingJournal.findFirst({
      where: { companyId: companyA.id, type: "CLOSING", fiscalYear: currentYear },
    });
    assert.ok(subENC);
    closingJournalAId = subENC.id;
    closingJournalCodeA = subENC.code;

    // Tentativa com conta HEADER deve falhar com 400
    const resHeader = await request("/api/v1/accounting/closing-configs", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        retainedEarningsAccountId: headerAcc.id,
        closingJournalId: subENC.id,
        responsibleParty: "Dr. Contabilista OCPCA 999",
        source: "POLITICA_INTERNA",
      },
    });
    assert.equal(resHeader.status, 400);
    assert.equal(resHeader.body.error, "retained_earnings_account_must_be_movement");

    // Tentativa com conta de outra empresa (Empresa B) deve falhar com 404
    const accB = await prisma.account.findFirst({
      where: { companyId: companyB.id, accountType: "MOVEMENT", type: "EQUITY" },
    });
    assert.ok(accB);

    const resCross = await request("/api/v1/accounting/closing-configs", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        retainedEarningsAccountId: accB.id,
        closingJournalId: subENC.id,
        responsibleParty: "Dr. Contabilista OCPCA 999",
      },
    });
    assert.equal(resCross.status, 404);
    assert.equal(resCross.body.error, "retained_earnings_account_not_found");

    // Criação válida com conta MOVEMENT da Empresa A
    const accA = await prisma.account.findFirst({
      where: { companyId: companyA.id, accountType: "MOVEMENT", type: "EQUITY" },
    });
    assert.ok(accA);
    retainedEarningsAccountAId = accA.id;

    const resValid = await request("/api/v1/accounting/closing-configs", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        retainedEarningsAccountId: accA.id,
        closingJournalId: subENC.id,
        sourceAccountTypes: "REVENUE,EXPENSE",
        policyType: "INTERNAL_POLICY",
        responsibleParty: "Contabilista Certificado OCPCA Manuel Santos",
        source: "DELIBERACAO_ASSEMBLEIA",
        version: "2026-v1",
        approvalDate: new Date().toISOString(),
        status: "ACTIVE",
        notes: "Parametrização formal aprovada para encerramento anual",
      },
    });
    assert.equal(resValid.status, 201);
    assert.equal(resValid.body.version, "2026-v1");
    assert.equal(resValid.body.status, "ACTIVE");
    configAId = resValid.body.id;

    // Consulta de parametrização ativa
    const resActive = await request("/api/v1/accounting/closing-configs/active", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resActive.status, 200);
    assert.equal(resActive.body.id, configAId);
  });

  await t.test("4.2 Simulação/pré-visualização calcula receitas e despesas sem gravar na base via configuração ativa", async () => {
    // Cria contas de receita e despesa na Empresa A
    await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { code: "71", name: "Vendas Mercadorias", type: "REVENUE", accountType: "MOVEMENT", normalBalance: "CREDIT" },
    });
    await request("/api/v1/accounting/chart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { code: "62", name: "Fornecimentos e Serviços", type: "EXPENSE", accountType: "MOVEMENT", normalBalance: "DEBIT" },
    });

    // Regista lançamento de receita e despesa para testar apuramento
    await request("/api/v1/accounting/journals", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        description: "Registo de Venda a Dinheiro",
        journalCode: "VEND",
        lines: [
          { accountCode: "11.1", debitCents: 500000, creditCents: 0 },
          { accountCode: "71", debitCents: 0, creditCents: 500000 },
        ],
      },
    });

    await request("/api/v1/accounting/journals", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        description: "Registo de Despesa de Comunicações",
        journalCode: "COMP",
        lines: [
          { accountCode: "62", debitCents: 150000, creditCents: 0 },
          { accountCode: "11.1", debitCents: 0, creditCents: 150000 },
        ],
      },
    });

    const countBefore = await prisma.fiscalYearClosing.count({ where: { companyId: companyA.id } });
    const journalCountBefore = await prisma.journal.count({ where: { companyId: companyA.id } });

    // Executa preview com base na configuração ativa
    const resPreview = await request("/api/v1/accounting/fiscal-year/closing/preview", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { fiscalYear: currentYear },
    });
    assert.equal(resPreview.status, 200);
    assert.equal(resPreview.body.fiscalYear, currentYear);
    assert.equal(resPreview.body.configId, configAId);
    assert.ok(resPreview.body.revenueTotalCents >= 500000);
    assert.ok(resPreview.body.expenseTotalCents >= 150000);
    assert.equal(
      resPreview.body.netIncomeCents,
      resPreview.body.revenueTotalCents - resPreview.body.expenseTotalCents
    );

    // Confirma que nada foi gravado
    const countAfter = await prisma.fiscalYearClosing.count({ where: { companyId: companyA.id } });
    const journalCountAfter = await prisma.journal.count({ where: { companyId: companyA.id } });
    assert.equal(countAfter, countBefore, "Preview não pode alterar fiscalYearClosing");
    assert.equal(journalCountAfter, journalCountBefore, "Preview não pode criar diários");
  });

  await t.test("4.3 Fecho de exercício cria diário balanceado no subdiário configurado e transita para CLOSED", async () => {
    // Execução sem motivo deve falhar com 400
    const resNoReason = await request("/api/v1/accounting/fiscal-year/closing/execute", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { fiscalYear: currentYear, reason: "" },
    });
    assert.equal(resNoReason.status, 400, "Fecho sem motivo deve falhar com 400");

    // Executa fecho regular
    const resClose = await request("/api/v1/accounting/fiscal-year/closing/execute", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        fiscalYear: currentYear,
        reason: "Fecho do exercício anual regular com validação do contabilista",
      },
    });
    assert.equal(resClose.status, 201, "Fecho anual executado com sucesso");
    const status = resClose.body.closingRecord?.status ?? resClose.body.status;
    assert.equal(status, "CLOSED");
    const closingJournalId = resClose.body.closingRecord?.closingJournalId ?? resClose.body.closingJournalId;
    assert.ok(closingJournalId);
    assert.equal(resClose.body.closingRecord?.configId, configAId);

    // Verifica que o diário de fecho foi gerado no subdiário configurado e está perfeitamente balanceado
    const closingJournal = await prisma.journal.findUnique({
      where: { id: closingJournalId },
      include: { lines: true },
    });
    assert.ok(closingJournal);
    assert.equal(closingJournal.journalCode, closingJournalCodeA);

    const totalDebit = closingJournal.lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredit = closingJournal.lines.reduce((s, l) => s + l.creditCents, 0);
    assert.equal(totalDebit, totalCredit, "Diário de fecho tem de ser rigorosamente equilibrado");

    // Verifica que nova tentativa de fechar o mesmo ano retorna 409
    const resDoubleClose = await request("/api/v1/accounting/fiscal-year/closing/execute", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        fiscalYear: currentYear,
        reason: "Segunda tentativa de fecho",
      },
    });
    assert.equal(resDoubleClose.status, 409, "Exercício já fechado retorna 409");
  });

  await t.test("4.4 Tentativa cross-tenant de executar fecho com header forçado ou token de outra empresa é rejeitada", async () => {
    // Empresa B tenta fechar exercício usando contexto forçado da Empresa A
    const resCross = await request("/api/v1/accounting/fiscal-year/closing/execute", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenB}`,
        "x-company-id": companyA.id,
      },
      body: {
        fiscalYear: currentYear,
        reason: "Tentativa não autorizada de fechar Empresa A",
        configId: configAId,
      },
    });
    assert.equal(resCross.status, 403, "Acesso cross-tenant deve ser bloqueado com 403");
  });

  await t.test("4.5 Reabertura de exercício exige motivo auditável, cria estorno no subdiário configurado e mantém auditoria", async () => {
    // Tentativa de reabrir sem motivo falha com 400
    const resReopenNoReason = await request("/api/v1/accounting/fiscal-year/closing/reopen", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { fiscalYear: currentYear, reason: "curt" },
    });
    assert.equal(resReopenNoReason.status, 400, "Reabertura sem motivo consistente deve falhar com 400");

    // Reabertura válida
    const resReopen = await request("/api/v1/accounting/fiscal-year/closing/reopen", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        fiscalYear: currentYear,
        reason: "Retificação de provisões autorizada pela gerência e pelo revisor oficial",
      },
    });
    assert.equal(resReopen.status, 200, "Reabertura concluída com 200");
    const reopenStatus = resReopen.body.closingRecord?.status ?? resReopen.body.status;
    assert.equal(reopenStatus, "REOPENED");
    const reopeningJournalId =
      resReopen.body.closingRecord?.reopeningJournalId ??
      resReopen.body.reversalJournal?.id ??
      resReopen.body.reopeningJournalId;
    assert.ok(reopeningJournalId);

    // Confirma que o diário de estorno foi gerado no subdiário correspondente e referencia o diário de fecho original
    const reopeningJournal = await prisma.journal.findUnique({
      where: { id: reopeningJournalId },
      include: { lines: true },
    });
    assert.ok(reopeningJournal);
    assert.equal(reopeningJournal.journalCode, closingJournalCodeA);
    assert.ok(reopeningJournal.reversalOfId, "Estorno deve referenciar closingJournal original");

    // O diário original de fecho NUNCA é apagado (integridade de auditoria)
    const originalStillExists = await prisma.journal.findUnique({
      where: { id: reopeningJournal.reversalOfId! },
    });
    assert.ok(originalStillExists, "Histórico original de fecho deve permanecer gravado e intocado");
  });

  await t.test("4.6 Alterar parametrização de fecho (sourceAccountTypes) altera o apuramento sem alterar código", async () => {
    // Configura nova versão que apura exclusivamente "REVENUE" (ignorando EXPENSE)
    const resCustomConfig = await request("/api/v1/accounting/closing-configs", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: {
        retainedEarningsAccountId: retainedEarningsAccountAId,
        closingJournalId: closingJournalAId,
        sourceAccountTypes: "REVENUE",
        policyType: "CUSTOM_INTERNAL_POLICY",
        responsibleParty: "Auditor e Revisor Oficial",
        source: "DELIBERACAO_CONSELHO",
        version: "2026-v2-revenue-only",
        status: "ACTIVE",
      },
    });
    assert.equal(resCustomConfig.status, 201);
    assert.equal(resCustomConfig.body.sourceAccountTypes, "REVENUE");

    // Preview com a nova configuração ativa
    const resPreviewCustom = await request("/api/v1/accounting/fiscal-year/closing/preview", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
      body: { fiscalYear: currentYear },
    });
    assert.equal(resPreviewCustom.status, 200);
    assert.equal(resPreviewCustom.body.configId, resCustomConfig.body.id);
    assert.equal(resPreviewCustom.body.expenseTotalCents, 0, "Despesas não foram incluídas conforme configuração da empresa");
    assert.equal(resPreviewCustom.body.netIncomeCents, resPreviewCustom.body.revenueTotalCents, "Resultado apurado reflete estritamente a nova parametrização");
  });

  // ==========================================
  // 5. BACKFILL MULTIEMPRESA SEGURO (MIGRATION 35)
  // ==========================================

  await t.test("5.1 Backfill de migração: Cenário de Empresa Única atribui contas sem ambiguidade", async () => {
    await prisma.$executeRawUnsafe(`CREATE TEMP TABLE temp_migration_account AS SELECT 'acc-single-1' AS id, NULL::text AS "companyId", '6' AS code`);
    await prisma.$executeRawUnsafe(`CREATE TEMP TABLE temp_migration_company AS SELECT '${companyA.id}' AS id`);

    await prisma.$executeRawUnsafe(`
      DO \$\$
      DECLARE
          cnt INT;
          sole_id TEXT;
      BEGIN
          SELECT COUNT(*) INTO cnt FROM temp_migration_company;
          IF cnt = 1 THEN
              SELECT id INTO sole_id FROM temp_migration_company LIMIT 1;
              UPDATE temp_migration_account SET "companyId" = sole_id WHERE "companyId" IS NULL;
          END IF;
      END \$\$;
    `);

    const result = await prisma.$queryRawUnsafe<any[]>(`
      SELECT "companyId" FROM temp_migration_account WHERE id = 'acc-single-1'
    `);
    assert.equal(result[0].companyId, companyA.id, "Conta órfã em ambiente de empresa única deve ser atribuída à única empresa");

    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS temp_migration_account`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS temp_migration_company`);
  });

  await t.test("5.2 Backfill de migração: Cenário Multiempresa Inequívoca infere empresa por lançamentos históricos", async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TEMP TABLE temp_multi_acc AS
      SELECT 'acc-a' AS id, NULL::text AS "companyId"
      UNION ALL
      SELECT 'acc-b' AS id, NULL::text AS "companyId"
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TEMP TABLE temp_multi_entries AS
      SELECT 'acc-a' AS account_id, '${companyA.id}' AS "companyId"
      UNION ALL
      SELECT 'acc-b' AS account_id, '${companyB.id}' AS "companyId"
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE temp_multi_acc a
      SET "companyId" = inferred.company_id
      FROM (
          SELECT account_id, MIN("companyId") AS company_id
          FROM temp_multi_entries
          GROUP BY account_id
          HAVING COUNT(DISTINCT "companyId") = 1
      ) inferred
      WHERE a.id = inferred.account_id AND a."companyId" IS NULL
    `);

    const resA = await prisma.$queryRawUnsafe<any[]>(`SELECT "companyId" FROM temp_multi_acc WHERE id = 'acc-a'`);
    const resB = await prisma.$queryRawUnsafe<any[]>(`SELECT "companyId" FROM temp_multi_acc WHERE id = 'acc-b'`);

    assert.equal(resA[0].companyId, companyA.id, "Conta com lançamentos exclusivos de A deve ser associada a A");
    assert.equal(resB[0].companyId, companyB.id, "Conta com lançamentos exclusivos de B deve ser associada a B");

    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS temp_multi_acc`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS temp_multi_entries`);
  });

  await t.test("5.3 Backfill de migração: Cenário Ambiguidade bloqueia com erro explícito MIGRATION_AMBIGUOUS_MULTI_COMPANY_ACCOUNTS", async () => {
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(`
          DO \$\$
          DECLARE
              company_count INTEGER := 2;
              ambiguous_count INTEGER := 3;
          BEGIN
              IF ambiguous_count > 0 AND company_count > 1 THEN
                  RAISE EXCEPTION 'MIGRATION_AMBIGUOUS_MULTI_COMPANY_ACCOUNTS: Ambiguity detected in legacy Account backfill. % accounts have no definitive company reference among % companies. Safe migration blocked.', ambiguous_count, company_count;
              END IF;
          END \$\$;
        `);
      },
      (err: any) => {
        assert.ok(
          err.message.includes("MIGRATION_AMBIGUOUS_MULTI_COMPANY_ACCOUNTS"),
          "A migração deve bloquear com erro seguro explícito quando há ambiguidade multiempresa"
        );
        return true;
      }
    );
  });
});
