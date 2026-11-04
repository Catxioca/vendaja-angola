import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { getEffectiveTestDatabaseUrl } from "./db-test-helper.js";
import { getEnv } from "../config/env.js";
import { saleRouter } from "../routes/sales.js";
import { commercialDocumentRouter } from "../routes/commercial-documents.js";
import { platformRouter } from "../routes/platform.js";
import { fiscalRouter } from "../routes/fiscal.js";
import { accountingRouter } from "../routes/accounting.js";
import { authRouter } from "../routes/auth.js";
import { corporateHeadquartersRouter } from "../routes/corporate-headquarters.js";
import { aiCopilotRouter } from "../routes/ai-copilot.js";
import { licenseRouter } from "../routes/license.js";

const databaseUrl = await getEffectiveTestDatabaseUrl();
const integration = databaseUrl ? test : test.skip;

integration("Fase 5 PostgreSQL: Validação de Integridade, RBAC e Isolamento Multi-tenant", async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/sales", saleRouter);
  app.use("/api/v1/commercial-documents", commercialDocumentRouter);
  app.use("/api/v1/platform", platformRouter);
  app.use("/api/v1/fiscal", fiscalRouter);
  app.use("/api/v1/accounting", accountingRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/corporate", corporateHeadquartersRouter);
  app.use("/api/v1/ai", aiCopilotRouter);
  app.use("/api/v1/license", licenseRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const suffix = randomUUID().slice(0, 8);
  const jwtSecret = getEnv().JWT_SECRET;

  // 1. Fixture de Empresas A e B
  const [companyA, companyB] = await Promise.all([
    prisma.company.create({ data: { legalName: `Empresa Alfa Fase5 ${suffix}`, nif: `541${suffix.slice(0, 6)}` } }),
    prisma.company.create({ data: { legalName: `Empresa Beta Fase5 ${suffix}`, nif: `542${suffix.slice(0, 6)}` } }),
  ]);

  const [branchA, branchB] = await Promise.all([
    prisma.branch.create({ data: { companyId: companyA.id, code: `BRA5-${suffix}`, name: "Filial Alfa" } }),
    prisma.branch.create({ data: { companyId: companyB.id, code: `BRB5-${suffix}`, name: "Filial Beta" } }),
  ]);

  // Fiscal Config para Empresa A
  await prisma.fiscalConfig.create({
    data: {
      companyId: companyA.id,
      companyName: companyA.legalName,
      companyNif: companyA.nif ?? "5410000000",
      invoiceSeries: "A",
      softwareCertificationNumber: "CERT-001/AGT/2026",
    },
  });

  // 2. Utilizadores e Memberships para todos os papéis canónicos
  // 2.1 Admin em A
  const userAdminA = await prisma.user.create({
    data: {
      email: `admin-a5-${suffix}@teste.ao`,
      username: `admin_a5_${suffix}`,
      passwordHash: "dummy-hash",
      displayName: "Administrador Alfa",
      role: "ROLE_ADMIN",
    },
  });
  await prisma.companyMembership.create({
    data: { userId: userAdminA.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_ADMIN", active: true, modules: ["POS", "STOCK", "ACCOUNTING", "SETTINGS"] },
  });
  const tokenAdminA = jwt.sign({ id: userAdminA.id, role: "ROLE_ADMIN" }, jwtSecret, { expiresIn: "1h" });

  // 2.2 Gestor (Manager) em A
  const userManagerA = await prisma.user.create({
    data: {
      email: `mgr-a5-${suffix}@teste.ao`,
      username: `mgr_a5_${suffix}`,
      passwordHash: "dummy-hash",
      displayName: "Gestor de Loja",
      role: "ROLE_MANAGER",
    },
  });
  await prisma.companyMembership.create({
    data: { userId: userManagerA.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_MANAGER", active: true, modules: ["POS", "STOCK", "DASHBOARD"] },
  });
  const tokenManagerA = jwt.sign({ id: userManagerA.id, role: "ROLE_MANAGER" }, jwtSecret, { expiresIn: "1h" });

  // 2.3 Caixa em A (CASHIER)
  const userCashierA = await prisma.user.create({
    data: {
      email: `cashier-a5-${suffix}@teste.ao`,
      username: `cashier_a5_${suffix}`,
      passwordHash: "dummy-hash",
      displayName: "Operador de Caixa",
      role: "ROLE_CASHIER",
    },
  });
  await prisma.companyMembership.create({
    data: { userId: userCashierA.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_CASHIER", active: true, modules: ["POS"] },
  });
  const tokenCashierA = jwt.sign({ id: userCashierA.id, role: "ROLE_CASHIER" }, jwtSecret, { expiresIn: "1h" });

  // 2.4 Operador em A (OPERATOR)
  const userOperatorA = await prisma.user.create({
    data: {
      email: `op-a5-${suffix}@teste.ao`,
      username: `op_a5_${suffix}`,
      passwordHash: "dummy-hash",
      displayName: "Operador Geral",
      role: "ROLE_OPERATOR",
    },
  });
  await prisma.companyMembership.create({
    data: { userId: userOperatorA.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_OPERATOR", active: true, modules: ["POS"] },
  });
  const tokenOperatorA = jwt.sign({ id: userOperatorA.id, role: "ROLE_OPERATOR" }, jwtSecret, { expiresIn: "1h" });

  // 2.5 Contabilista em A (ACCOUNTANT)
  const userAccountantA = await prisma.user.create({
    data: {
      email: `acc-a5-${suffix}@teste.ao`,
      username: `acc_a5_${suffix}`,
      passwordHash: "dummy-hash",
      displayName: "Contabilista Alfa",
      role: "ROLE_ACCOUNTANT",
    },
  });
  await prisma.companyMembership.create({
    data: { userId: userAccountantA.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_ACCOUNTANT", active: true, modules: ["ACCOUNTING"] },
  });
  const tokenAccountantA = jwt.sign({ id: userAccountantA.id, role: "ROLE_ACCOUNTANT" }, jwtSecret, { expiresIn: "1h" });

  // 2.6 Admin em B (Outra Empresa)
  const userAdminB = await prisma.user.create({
    data: {
      email: `admin-b5-${suffix}@teste.ao`,
      username: `admin_b5_${suffix}`,
      passwordHash: "dummy-hash",
      displayName: "Administrador Beta",
      role: "ROLE_ADMIN",
    },
  });
  await prisma.companyMembership.create({
    data: { userId: userAdminB.id, companyId: companyB.id, branchId: branchB.id, role: "ROLE_ADMIN", active: true, modules: ["POS", "STOCK", "ACCOUNTING", "SETTINGS"] },
  });
  const tokenAdminB = jwt.sign({ id: userAdminB.id, role: "ROLE_ADMIN" }, jwtSecret, { expiresIn: "1h" });

  // Produto em A para vendas
  const productA = await prisma.product.create({
    data: {
      companyId: companyA.id,
      branchId: branchA.id,
      sku: `PROD-A5-${suffix}`,
      name: "Produto Teste A",
      priceCents: 10000,
      costCents: 5000,
      stock: 50,
      taxRate: 0.14,
    },
  });

  // Venda e Documento Comercial em Empresa A
  const saleIdA = randomUUID();
  const saleA = await prisma.sale.create({
    data: {
      id: saleIdA,
      companyId: companyA.id,
      branchId: branchA.id,
      number: `FT ${suffix}/1`,
      subtotalCents: 10000,
      taxCents: 1400,
      totalCents: 11400,
      fiscalType: "INVOICE",
      status: "COMPLETED",
      paymentMethod: "CASH",
      cashCents: 11400,
      lines: {
        create: [
          { productId: productA.id, quantity: 1, unitPriceCents: 10000, taxRate: 0.14 },
        ],
      },
    },
  });

  t.after(async () => {
    server.close();
    await prisma.reprintLog.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.journalEntry.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.journalLine.deleteMany({ where: { journal: { companyId: { in: [companyA.id, companyB.id] } } } }).catch(() => {});
    await prisma.journal.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.accountingPeriod.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.bankStatementLine.deleteMany({ where: { statement: { bankAccount: { companyId: { in: [companyA.id, companyB.id] } } } } }).catch(() => {});
    await prisma.bankStatement.deleteMany({ where: { bankAccount: { companyId: { in: [companyA.id, companyB.id] } } } }).catch(() => {});
    await prisma.bankAccount.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.saleLine.deleteMany({ where: { saleId: saleA.id } }).catch(() => {});
    await prisma.sale.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.commercialDocumentLine.deleteMany({ where: { document: { companyId: { in: [companyA.id, companyB.id] } } } }).catch(() => {});
    await prisma.commercialDocument.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.fiscalConfig.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: productA.id } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.companyMembership.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { companyId: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: { in: [companyA.id, companyB.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [userAdminA.id, userManagerA.id, userCashierA.id, userOperatorA.id, userAccountantA.id, userAdminB.id] } } }).catch(() => {});
    await prisma.$disconnect();
  });

  // 1. Documento de outro tenant retornando 404/403
  await t.test("1. Documento de outro tenant retorna 404 isolado", async () => {
    const res = await fetch(`${baseUrl}/api/v1/sales/${saleA.id}`, {
      headers: {
        Authorization: `Bearer ${tokenAdminB}`,
        "x-company-id": companyB.id,
        "x-branch-id": branchB.id,
      },
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "sale_not_found");
  });

  // 2. Reimpressão com RBAC explícito (ADMIN e MANAGER autorizados; CASHIER/OPERATOR bloqueados; motivo obrigatório)
  await t.test("2. Reimpressão com RBAC e registo auditável", async () => {
    // 2.1 Caixa bloqueado (403)
    const cashierDenied = await fetch(`${baseUrl}/api/v1/platform/reprints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenCashierA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentType: "SALE",
        documentId: saleA.id,
        reason: "Segunda via solicitada pelo cliente",
      }),
    });
    assert.equal(cashierDenied.status, 403);

    // 2.2 Operador bloqueado (403)
    const opDenied = await fetch(`${baseUrl}/api/v1/platform/reprints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenOperatorA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentType: "SALE",
        documentId: saleA.id,
        reason: "Segunda via solicitada pelo cliente",
      }),
    });
    assert.equal(opDenied.status, 403);

    // 2.3 Gestor (Manager) autorizado com motivo válido (201)
    const mgrAuthorized = await fetch(`${baseUrl}/api/v1/platform/reprints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenManagerA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentType: "SALE",
        documentId: saleA.id,
        reason: "Autorização de gestor para emissão de duplicado",
      }),
    });
    assert.equal(mgrAuthorized.status, 201);
    const mgrLog = await mgrAuthorized.json();
    assert.equal(mgrLog.documentId, saleA.id);

    // 2.4 Administrador autorizado com motivo válido (201)
    const adminAuthorized = await fetch(`${baseUrl}/api/v1/platform/reprints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentType: "SALE",
        documentId: saleA.id,
        reason: "Extravio da via física original do cliente",
      }),
    });
    assert.equal(adminAuthorized.status, 201);
    const adminLog = await adminAuthorized.json();
    assert.equal(adminLog.documentId, saleA.id);

    // 2.5 Motivo inválido ou curto (< 3 carateres) rejeitado com 400
    const shortReason = await fetch(`${baseUrl}/api/v1/platform/reprints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentType: "SALE",
        documentId: saleA.id,
        reason: "no",
      }),
    });
    assert.equal(shortReason.status, 400);

    // Confirma persistência real no PostgreSQL dos registos auditáveis
    const dbLogs = await prisma.reprintLog.findMany({
      where: { documentId: saleA.id, companyId: companyA.id },
    });
    assert.equal(dbLogs.length >= 2, true);
  });

  // 3. Tentativa de alteração/exclusão de documento fiscal emitido (rejeitada por imutabilidade)
  await t.test("3. Documento fiscal emitido é estritamente imutável (PUT/DELETE rejeitados com 405)", async () => {
    const putRes = await fetch(`${baseUrl}/api/v1/sales/${saleA.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ totalCents: 500 }),
    });
    assert.equal(putRes.status, 405);
    const putBody = await putRes.json();
    assert.equal(putBody.error, "fiscal_document_immutable");

    const deleteRes = await fetch(`${baseUrl}/api/v1/sales/${saleA.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(deleteRes.status, 405);
    const delBody = await deleteRes.json();
    assert.equal(delBody.error, "fiscal_document_immutable");
  });

  // 4. Exportação SAF-T sem ADMIN/ACCOUNTANT (403)
  await t.test("4. Exportação SAF-T rejeitada para perfis não autorizados (403)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/fiscal/saft?from=2026-01-01&to=2026-12-31`, {
      headers: {
        Authorization: `Bearer ${tokenCashierA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "forbidden");
  });

  // 5. SAF-T de empresa/filial diferente isolado e protegido
  await t.test("5. SAF-T bloqueia tentativa de acesso cruzado com 403 company_context_forbidden", async () => {
    const res = await fetch(`${baseUrl}/api/v1/fiscal/saft?from=2026-01-01&to=2026-12-31`, {
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyB.id,
      },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "company_context_forbidden");
  });

  // 6. Operação contabilística em período fechado (409 accounting_period_closed)
  await t.test("6. Lançamento contabilístico em período fechado é rejeitado com 409", async () => {
    const closedDate = new Date(Date.UTC(2026, 0, 15, 10, 0, 0));
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 1, 0, 23, 59, 59, 999));

    await prisma.accountingPeriod.create({
      data: {
        companyId: companyA.id,
        branchId: branchA.id,
        name: `Janeiro 2026-${suffix}`,
        startsAt: start,
        endsAt: end,
        status: "CLOSED",
        closedAt: new Date(),
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/accounting/journals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAccountantA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: "Lançamento em período fechado",
        entryDate: closedDate.toISOString(),
        lines: [
          { accountCode: "6", debitCents: 1000, creditCents: 0 },
          { accountCode: "7", debitCents: 0, creditCents: 1000 },
        ],
      }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, "accounting_period_closed");
  });

  // 7. Logs de auditoria de outro tenant protegidos e isolados
  await t.test("7. Logs de auditoria isolados entre tenants", async () => {
    await prisma.auditLog.create({
      data: {
        companyId: companyA.id,
        branchId: branchA.id,
        action: "TEST_ACTION_ALFA",
        userId: userAdminA.id,
        entity: "SALE",
        entityId: saleA.id,
      },
    });

    const resB = await fetch(`${baseUrl}/api/v1/platform/audit-logs`, {
      headers: {
        Authorization: `Bearer ${tokenAdminB}`,
        "x-company-id": companyB.id,
        "x-branch-id": branchB.id,
      },
    });
    assert.equal(resB.status, 200);
    const bodyB = await resB.json();
    const list = Array.isArray(bodyB) ? bodyB : (bodyB.records || bodyB.items || []);
    const hasAlfaAction = list.some((item: any) => item.action === "TEST_ACTION_ALFA");
    assert.equal(hasAlfaAction, false, "Admin B nunca deve ver logs de auditoria da Empresa A");

    const forbiddenRes = await fetch(`${baseUrl}/api/v1/platform/audit-logs`, {
      headers: {
        Authorization: `Bearer ${tokenAdminB}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(forbiddenRes.status, 403);
  });

  // 8. Gestão de utilizadores sem ADMIN (403 forbidden)
  await t.test("8. Gestão de utilizadores exclusiva de ADMIN (403 para não-admin)", async () => {
    const denied = await fetch(`${baseUrl}/api/v1/auth/users`, {
      headers: {
        Authorization: `Bearer ${tokenCashierA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(denied.status, 403);

    const allowed = await fetch(`${baseUrl}/api/v1/auth/users`, {
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(allowed.status, 200);
    const users = await allowed.json();
    assert.ok(Array.isArray(users));
    assert.ok(users.length > 0);
  });

  // 9. Sede corporativa com RBAC estrito e isolamento (Operador/Caixa bloqueados, Gestor/Admin autorizados, Empresa externa 403)
  await t.test("9. Acesso a cockpit da sede corporativa com RBAC e isolamento multi-tenant", async () => {
    // 9.1 Operador da mesma empresa bloqueado (403)
    const opRes = await fetch(`${baseUrl}/api/v1/corporate/cockpit`, {
      headers: {
        Authorization: `Bearer ${tokenOperatorA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(opRes.status, 403);

    // 9.2 Caixa da mesma empresa bloqueado (403)
    const cashierRes = await fetch(`${baseUrl}/api/v1/corporate/cockpit`, {
      headers: {
        Authorization: `Bearer ${tokenCashierA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(cashierRes.status, 403);

    // 9.3 Gestor (Manager) da mesma empresa autorizado (200)
    const mgrRes = await fetch(`${baseUrl}/api/v1/corporate/cockpit`, {
      headers: {
        Authorization: `Bearer ${tokenManagerA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(mgrRes.status, 200);

    // 9.4 Administrador da mesma empresa autorizado (200)
    const adminRes = await fetch(`${baseUrl}/api/v1/corporate/cockpit`, {
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(adminRes.status, 200);

    // 9.5 Empresa externa bloqueada com 403 company_context_forbidden
    const extRes = await fetch(`${baseUrl}/api/v1/corporate/cockpit`, {
      headers: {
        Authorization: `Bearer ${tokenAdminB}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(extRes.status, 403);
    const body = await extRes.json();
    assert.equal(body.error, "company_context_forbidden");

    // 9.6 Header forçado de empresa alheia por utilizador sem pertença bloqueado com 403
    const forcedHeaderRes = await fetch(`${baseUrl}/api/v1/corporate/cockpit`, {
      headers: {
        Authorization: `Bearer ${tokenManagerA}`,
        "x-company-id": companyB.id,
      },
    });
    assert.equal(forcedHeaderRes.status, 403);
  });

  // 10. IA sem sessão (401), sem RBAC (403), e acesso autorizado
  await t.test("10. AI Copilot protegido: 401 sem sessão, 403 sem RBAC", async () => {
    const unauth = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Qual foi o total de vendas hoje?" }),
    });
    assert.equal(unauth.status, 401);

    const forbidden = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenCashierA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "Qual foi o total de vendas hoje?" }),
    });
    assert.equal(forbidden.status, 403);

    const allowed = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "ajuda geral" }),
    });
    assert.equal(allowed.status, 200);
  });

  // 11. Licença sem sessão autorizada (401/403)
  await t.test("11. Verificação de status de licença exige autenticação (401) e posse de contexto (403)", async () => {
    const noToken = await fetch(`${baseUrl}/api/v1/license/status`);
    assert.equal(noToken.status, 401);

    const crossTenant = await fetch(`${baseUrl}/api/v1/license/status`, {
      headers: {
        Authorization: `Bearer ${tokenAdminB}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(crossTenant.status, 403);

    const ok = await fetch(`${baseUrl}/api/v1/license/status`, {
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(ok.status, 200);
  });

  // 12. Contas bancárias com RBAC estrito e isolamento multi-tenant
  await t.test("12. Contas bancárias com RBAC estrito (ADMIN, MANAGER, ACCOUNTANT autorizados; CASHIER, OPERATOR bloqueados) e isolamento", async () => {
    const bankA = await prisma.bankAccount.create({
      data: {
        companyId: companyA.id,
        name: `Conta BFA Alfa ${suffix}`,
        iban: "AO06000000000000000000001",
        openingBalanceCents: 500000,
      },
    });

    // 12.1 CASHIER bloqueado com 403
    const cashierRes = await fetch(`${baseUrl}/api/v1/platform/bank-accounts`, {
      headers: { Authorization: `Bearer ${tokenCashierA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(cashierRes.status, 403);
    const cashierErr = await cashierRes.json();
    assert.equal(cashierErr.error, "forbidden");

    // 12.2 OPERATOR bloqueado com 403
    const opRes = await fetch(`${baseUrl}/api/v1/platform/bank-accounts`, {
      headers: { Authorization: `Bearer ${tokenOperatorA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(opRes.status, 403);

    // 12.3 MANAGER autorizado com 200
    const mgrRes = await fetch(`${baseUrl}/api/v1/platform/bank-accounts`, {
      headers: { Authorization: `Bearer ${tokenManagerA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(mgrRes.status, 200);
    const mgrAccounts = await mgrRes.json();
    assert.equal(mgrAccounts.some((a: any) => a.id === bankA.id), true);

    // 12.4 ACCOUNTANT autorizado com 200
    const accRes = await fetch(`${baseUrl}/api/v1/platform/bank-accounts`, {
      headers: { Authorization: `Bearer ${tokenAccountantA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(accRes.status, 200);

    // 12.5 ADMIN autorizado com 200
    const adminRes = await fetch(`${baseUrl}/api/v1/platform/bank-accounts`, {
      headers: { Authorization: `Bearer ${tokenAdminA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(adminRes.status, 200);

    // 12.6 Tenant externo isolado (empresa B lista contas mas nunca vê conta de A)
    const listB = await fetch(`${baseUrl}/api/v1/platform/bank-accounts`, {
      headers: { Authorization: `Bearer ${tokenAdminB}`, "x-company-id": companyB.id, "x-branch-id": branchB.id },
    });
    assert.equal(listB.status, 200);
    const accountsB = await listB.json();
    assert.equal(accountsB.some((a: any) => a.id === bankA.id), false);

    // 12.7 Tenant externo com header forçado da Empresa A bloqueado com 403
    const crossRes = await fetch(`${baseUrl}/api/v1/platform/bank-accounts`, {
      headers: { Authorization: `Bearer ${tokenAdminB}`, "x-company-id": companyA.id },
    });
    assert.equal(crossRes.status, 403);

    // 12.8 Importação em conta de outro tenant rejeitada com 404
    const importRes = await fetch(`${baseUrl}/api/v1/platform/bank-accounts/${bankA.id}/statements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdminB}`,
        "x-company-id": companyB.id,
        "x-branch-id": branchB.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statementDate: "2026-10-30",
        openingBalanceCents: 1000,
        closingBalanceCents: 2000,
        lines: [
          { occurredAt: "2026-10-30T10:00:00Z", description: "Depósito", amountCents: 1000 },
        ],
      }),
    });
    assert.equal(importRes.status, 404);
  });

  // 13. Configuração fiscal com RBAC estrito (CASHIER, OPERATOR, MANAGER, ACCOUNTANT bloqueados com 403; ADMIN autorizado 200)
  await t.test("13. Configuração fiscal com RBAC real no backend (apenas ADMIN autorizado)", async () => {
    // 13.1 CASHIER bloqueado com 403
    const cashierRes = await fetch(`${baseUrl}/api/v1/fiscal/config`, {
      headers: {
        Authorization: `Bearer ${tokenCashierA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(cashierRes.status, 403);
    const cashierBody = await cashierRes.json();
    assert.equal(cashierBody.error, "forbidden");

    // 13.2 OPERATOR bloqueado com 403
    const opRes = await fetch(`${baseUrl}/api/v1/fiscal/config`, {
      headers: {
        Authorization: `Bearer ${tokenOperatorA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(opRes.status, 403);
    const opBody = await opRes.json();
    assert.equal(opBody.error, "forbidden");

    // 13.3 MANAGER bloqueado com 403
    const mgrRes = await fetch(`${baseUrl}/api/v1/fiscal/config`, {
      headers: {
        Authorization: `Bearer ${tokenManagerA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(mgrRes.status, 403);
    const mgrBody = await mgrRes.json();
    assert.equal(mgrBody.error, "forbidden");

    // 13.4 ACCOUNTANT bloqueado com 403
    const accRes = await fetch(`${baseUrl}/api/v1/fiscal/config`, {
      headers: {
        Authorization: `Bearer ${tokenAccountantA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(accRes.status, 403);
    const accBody = await accRes.json();
    assert.equal(accBody.error, "forbidden");

    // 13.5 ADMIN autorizado com 200 e dados fiscais protegidos
    const adminRes = await fetch(`${baseUrl}/api/v1/fiscal/config`, {
      headers: {
        Authorization: `Bearer ${tokenAdminA}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA.id,
      },
    });
    assert.equal(adminRes.status, 200);
    const config = await adminRes.json();
    assert.equal(config.configured, true);
    assert.equal(config.companyNif, companyA.nif);
    assert.equal(config.invoiceSeries, "A");
    assert.equal(config.softwareCertificationNumber, "CERT-001/AGT/2026");
  });


  // 14. Períodos contabilísticos com RBAC estrito (ADMIN e ACCOUNTANT autorizados; MANAGER, CASHIER, OPERATOR bloqueados com 403)
  await t.test("14. Períodos contabilísticos com RBAC real no backend (apenas ADMIN e ACCOUNTANT autorizados)", async () => {
    // 14.1 CASHIER bloqueado com 403
    const cashRes = await fetch(`${baseUrl}/api/v1/accounting/periods`, {
      headers: { Authorization: `Bearer ${tokenCashierA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(cashRes.status, 403);

    // 14.2 OPERATOR bloqueado com 403
    const opRes = await fetch(`${baseUrl}/api/v1/accounting/periods`, {
      headers: { Authorization: `Bearer ${tokenOperatorA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(opRes.status, 403);

    // 14.3 MANAGER bloqueado com 403
    const mgrRes = await fetch(`${baseUrl}/api/v1/accounting/periods`, {
      headers: { Authorization: `Bearer ${tokenManagerA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(mgrRes.status, 403);

    // 14.4 ACCOUNTANT autorizado com 200
    const accRes = await fetch(`${baseUrl}/api/v1/accounting/periods`, {
      headers: { Authorization: `Bearer ${tokenAccountantA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(accRes.status, 200);
    const accPeriods = await accRes.json();
    assert.ok(Array.isArray(accPeriods));

    // 14.5 ADMIN autorizado com 200
    const adminRes = await fetch(`${baseUrl}/api/v1/accounting/periods`, {
      headers: { Authorization: `Bearer ${tokenAdminA}`, "x-company-id": companyA.id, "x-branch-id": branchA.id },
    });
    assert.equal(adminRes.status, 200);
    const adminPeriods = await adminRes.json();
    assert.ok(Array.isArray(adminPeriods));

    // 14.6 Tentativa de consulta com header de outro tenant bloqueada com 403
    const crossRes = await fetch(`${baseUrl}/api/v1/accounting/periods`, {
      headers: { Authorization: `Bearer ${tokenAdminA}`, "x-company-id": companyB.id },
    });
    assert.equal(crossRes.status, 403);
  });
});
