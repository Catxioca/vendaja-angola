import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { getEffectiveTestDatabaseUrl } from "./db-test-helper.js";
import { getEnv } from "../config/env.js";
import { hrRouter } from "../routes/hr.js";

const databaseUrl = await getEffectiveTestDatabaseUrl();
const integration = databaseUrl ? test : test.skip;

integration("Fase 12 PostgreSQL: RH Enterprise Real, Governação, Isolamento e Privacidade Biométrica", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const app = express();
  app.use(express.json());
  app.use("/api/v1/hr", hrRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const suffix = randomUUID().slice(0, 8);
  const jwtSecret = getEnv().JWT_SECRET;

  let companyAId = "";
  let companyBId = "";
  const createdUserIds: string[] = [];

  try {
    // 1. Fixture de Empresas e Filiais
    const [companyA, companyB] = await Promise.all([
      prisma.company.create({ data: { legalName: `Empresa RH Alfa ${suffix}` } }),
      prisma.company.create({ data: { legalName: `Empresa RH Beta ${suffix}` } }),
    ]);
    companyAId = companyA.id;
    companyBId = companyB.id;

    const [branchA1, branchA2, branchB1] = await Promise.all([
      prisma.branch.create({ data: { companyId: companyA.id, code: `BRA1-${suffix}`, name: "Filial A1 Sede" } }),
      prisma.branch.create({ data: { companyId: companyA.id, code: `BRA2-${suffix}`, name: "Filial A2 Talatona" } }),
      prisma.branch.create({ data: { companyId: companyB.id, code: `BRB1-${suffix}`, name: "Filial B1 Sede" } }),
    ]);

    // 2. Utilizadores com papéis RBAC
    const userAdmin = await prisma.user.create({
      data: {
        email: `admin-${suffix}@empresa.ao`,
        username: `admin_${suffix}`,
        passwordHash: "hash-seguro",
        role: "ROLE_ADMIN",
      },
    });
    createdUserIds.push(userAdmin.id);
    await prisma.companyMembership.create({
      data: { userId: userAdmin.id, companyId: companyA.id, branchId: branchA1.id, role: "ROLE_ADMIN", active: true },
    });
    const tokenAdmin = jwt.sign({ id: userAdmin.id, role: "ROLE_ADMIN" }, jwtSecret, { expiresIn: "1h" });

    const userHrManager = await prisma.user.create({
      data: {
        email: `hr-${suffix}@empresa.ao`,
        username: `hr_${suffix}`,
        passwordHash: "hash-seguro",
        role: "ROLE_HR",
      },
    });
    createdUserIds.push(userHrManager.id);
    await prisma.companyMembership.create({
      data: { userId: userHrManager.id, companyId: companyA.id, branchId: branchA1.id, role: "ROLE_HR", active: true },
    });
    const tokenHrManager = jwt.sign({ id: userHrManager.id, role: "ROLE_HR" }, jwtSecret, { expiresIn: "1h" });

    const userBranchManagerA2 = await prisma.user.create({
      data: {
        email: `manager-a2-${suffix}@empresa.ao`,
        username: `manager_a2_${suffix}`,
        passwordHash: "hash-seguro",
        role: "ROLE_MANAGER",
      },
    });
    createdUserIds.push(userBranchManagerA2.id);
    await prisma.companyMembership.create({
      data: { userId: userBranchManagerA2.id, companyId: companyA.id, branchId: branchA2.id, role: "ROLE_MANAGER", active: true },
    });
    const tokenManagerA2 = jwt.sign({ id: userBranchManagerA2.id, role: "ROLE_MANAGER" }, jwtSecret, { expiresIn: "1h" });

    const userCashier = await prisma.user.create({
      data: {
        email: `cashier-${suffix}@empresa.ao`,
        username: `cashier_${suffix}`,
        passwordHash: "hash-seguro",
        role: "ROLE_CASHIER",
      },
    });
    createdUserIds.push(userCashier.id);
    await prisma.companyMembership.create({
      data: { userId: userCashier.id, companyId: companyA.id, branchId: branchA1.id, role: "ROLE_CASHIER", active: true },
    });
    const tokenCashier = jwt.sign({ id: userCashier.id, role: "ROLE_CASHIER" }, jwtSecret, { expiresIn: "1h" });

    const userBetaAdmin = await prisma.user.create({
      data: {
        email: `admin-beta-${suffix}@beta.ao`,
        username: `admin_b_${suffix}`,
        passwordHash: "hash-seguro",
        role: "ROLE_ADMIN",
      },
    });
    createdUserIds.push(userBetaAdmin.id);
    await prisma.companyMembership.create({
      data: { userId: userBetaAdmin.id, companyId: companyB.id, branchId: branchB1.id, role: "ROLE_ADMIN", active: true },
    });
    const tokenBetaAdmin = jwt.sign({ id: userBetaAdmin.id, role: "ROLE_ADMIN" }, jwtSecret, { expiresIn: "1h" });

    // =========================================================================
    // CENÁRIO 1: RBAC RH - Permissões Granulares e Bloqueio de Não Autorizados
    // =========================================================================
    // 1.1 Operador de caixa tenta aceder ao módulo HR -> 403 Forbidden
    const resCashier = await fetch(`${baseUrl}/api/v1/hr/config`, {
      headers: {
        Authorization: `Bearer ${tokenCashier}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resCashier.status, 403, "Operador sem papel HR deve receber 403 Forbidden");

    // 1.2 HR Manager tem acesso autorizado à configuração
    const resHrConfigGet = await fetch(`${baseUrl}/api/v1/hr/config`, {
      headers: {
        Authorization: `Bearer ${tokenHrManager}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resHrConfigGet.status, 200, "HR Manager deve ter acesso 200 OK à configuração de RH");

    // =========================================================================
    // CENÁRIO 2: Tenant A/B e Isolamento por Filial
    // =========================================================================
    // 2.1 Criar colaborador na Empresa A (Filial A1) com consentimento biométrico
    const empAlfaRes = await fetch(`${baseUrl}/api/v1/hr/employees`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA1.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fullName: `Manuel Antunes ${suffix}`,
        nif: `5412${suffix.slice(0, 6)}`,
        position: "Técnico Sénior",
        department: "Logística",
        baseSalaryCents: 18000000, // 180.000 Kz
        foodAllowanceCents: 3000000,
        transportAllowanceCents: 3000000,
        branchId: branchA1.id,
        biometricConsentGiven: true,
        biometricRefId: `zk-token-${suffix}`,
      }),
    });
    assert.equal(empAlfaRes.status, 201, "Colaborador da Empresa A deve ser criado com sucesso");
    const empAlfa = await empAlfaRes.json();

    // 2.2 Criar colaborador na Empresa A (Filial A2)
    const empAlfa2Res = await fetch(`${baseUrl}/api/v1/hr/employees`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fullName: `Joana Talatona ${suffix}`,
        position: "Assistente Comercial",
        baseSalaryCents: 12000000,
        branchId: branchA2.id,
      }),
    });
    assert.equal(empAlfa2Res.status, 201);
    const empAlfa2 = await empAlfa2Res.json();

    // 2.3 Empresa B (Tenant B) lista colaboradores -> NÃO pode ver colaboradores da Empresa A
    const resBetaList = await fetch(`${baseUrl}/api/v1/hr/employees`, {
      headers: {
        Authorization: `Bearer ${tokenBetaAdmin}`,
        "x-company-id": companyB.id,
      },
    });
    assert.equal(resBetaList.status, 200);
    const betaEmployees = await resBetaList.json();
    assert.equal(betaEmployees.length, 0, "Empresa B não pode ver colaboradores da Empresa A");

    // 2.4 Empresa B tenta aceder diretamente pelo ID do colaborador de A -> 404
    const resCrossDirect = await fetch(`${baseUrl}/api/v1/hr/employees/${empAlfa.id}`, {
      headers: {
        Authorization: `Bearer ${tokenBetaAdmin}`,
        "x-company-id": companyB.id,
      },
    });
    assert.equal(resCrossDirect.status, 404, "Tentativa de acesso cross-tenant deve retornar 404");

    // 2.5 Gerente da Filial A2 consulta colaboradores -> vê apenas Filial A2
    const resManagerA2List = await fetch(`${baseUrl}/api/v1/hr/employees`, {
      headers: {
        Authorization: `Bearer ${tokenManagerA2}`,
        "x-company-id": companyA.id,
        "x-branch-id": branchA2.id,
      },
    });
    assert.equal(resManagerA2List.status, 200);
    const a2Employees = await resManagerA2List.json();
    assert.equal(a2Employees.length, 1);
    assert.equal(a2Employees[0].id, empAlfa2.id, "Gerente da filial A2 deve ver apenas a filial A2");

    // =========================================================================
    // CENÁRIO 3: Governação da Configuração Remuneratória e Vigência
    // =========================================================================
    // 3.1 Atualizar para configuração com estado PENDING_APPROVAL
    const resPutPending = await fetch(`${baseUrl}/api/v1/hr/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenHrManager}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        version: "2026.P1",
        source: "Proposta Interna de Remuneração",
        responsibleParty: "Comissão Paritária de RH",
        approvalDate: "2026-01-01T00:00:00Z",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
        status: "PENDING_APPROVAL", // Pendente!
        irtBrackets: [
          { minCents: 0, maxCents: 500000, rate: 0 },
          { minCents: 500000, maxCents: Number.POSITIVE_INFINITY, rate: 0.15 },
        ],
        inssEmployeeRate: 0.03,
        inssEmployerRate: 0.08,
        allowanceExemptionCapCents: 3000000,
      }),
    });
    assert.equal(resPutPending.status, 200);

    // 3.2 Tentar processar folha com configuração PENDING_APPROVAL -> Rejeitado com 412 Precondition Failed
    const resComputePending = await fetch(`${baseUrl}/api/v1/hr/payrolls/compute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenHrManager}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        employeeId: empAlfa.id,
        month: "2026-11",
      }),
    });
    assert.equal(resComputePending.status, 412, "Configuração PENDING_APPROVAL deve ser rejeitada com 412");
    const pendingErr = await resComputePending.json();
    assert.equal(pendingErr.error, "no_valid_hr_config");

    // 3.3 Aprovar e ativar a configuração com vigência válida para 2026
    const resPutActive = await fetch(`${baseUrl}/api/v1/hr/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenHrManager}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        version: "2026.FINAL",
        source: "Código do IRT / Regulamento do INSS Oficial 2026",
        responsibleParty: "Contabilista Certificado OCAP nº 4492",
        approvalDate: "2026-01-15T00:00:00Z",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
        status: "ACTIVE",
        irtBrackets: [
          { minCents: 0, maxCents: 500000, rate: 0 },
          { minCents: 500000, maxCents: 1500000, rate: 0.1 },
          { minCents: 1500000, maxCents: Number.POSITIVE_INFINITY, rate: 0.15 },
        ],
        inssEmployeeRate: 0.03,
        inssEmployerRate: 0.08,
        allowanceExemptionCapCents: 3000000,
      }),
    });
    assert.equal(resPutActive.status, 200);

    // 3.4 Agora o processamento salarial deve ter sucesso (201 Created)
    const resComputeSuccess = await fetch(`${baseUrl}/api/v1/hr/payrolls/compute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenHrManager}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        employeeId: empAlfa.id,
        month: "2026-11",
      }),
    });
    assert.equal(resComputeSuccess.status, 201, "Cálculo salarial deve ter sucesso com configuração ativa");
    const payrollAlfa = await resComputeSuccess.json();
    assert.ok(payrollAlfa.netSalaryCents > 0);
    assert.equal(payrollAlfa.status, "APPROVED");

    // =========================================================================
    // CENÁRIO 4: Fecho Formal de Folha, Snapshot Imutável e Bloqueio Histórico
    // =========================================================================
    // 4.1 Fechar formalmente o mês 2026-11
    const resCloseMonth = await fetch(`${baseUrl}/api/v1/hr/payrolls/close-month`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({ month: "2026-11" }),
    });
    assert.equal(resCloseMonth.status, 200, "Fecho formal do mês deve retornar 200");
    const closeRes = await resCloseMonth.json();
    assert.equal(closeRes.success, true);
    assert.equal(closeRes.configSnapshotVersion, "2026.FINAL");

    // 4.2 Verificar que o snapshot imutável foi gravado em IntegrationConfig
    const snapshotRecord = await prisma.integrationConfig.findUnique({
      where: {
        companyId_provider: {
          companyId: companyA.id,
          provider: "HR_PAYROLL_SNAPSHOT_2026-11",
        },
      },
    });
    assert.ok(snapshotRecord, "Snapshot imutável deve estar persistido em PostgreSQL");
    const snapshotCfg = snapshotRecord!.config as any;
    assert.equal(snapshotCfg.configSnapshot.version, "2026.FINAL");
    assert.equal(snapshotCfg.month, "2026-11");

    // 4.3 Tentativa de reprocessar em bloco o mês fechado -> 409 Conflict
    const resReprocessMonth = await fetch(`${baseUrl}/api/v1/hr/payrolls/process-month`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({ month: "2026-11" }),
    });
    assert.equal(resReprocessMonth.status, 409, "Reprocessamento de mês fechado deve retornar 409 Conflict");

    // 4.4 Tentativa de reprocessar individualmente o recibo fechado -> 409 Conflict
    const resRecomputeSingle = await fetch(`${baseUrl}/api/v1/hr/payrolls/compute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        employeeId: empAlfa.id,
        month: "2026-11",
      }),
    });
    assert.equal(resRecomputeSingle.status, 409, "Reprocessamento individual de recibo fechado deve retornar 409 Conflict");

    // 4.5 Tentativa de remover (DELETE) recibo fechado -> 409 Conflict
    const resDeleteClosed = await fetch(`${baseUrl}/api/v1/hr/payrolls/${payrollAlfa.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resDeleteClosed.status, 409, "Remoção de recibo fechado deve ser bloqueada com 409 Conflict");

    // 4.6 Ajuste por retificação auditada (POST /payrolls/:id/rectify)
    const resRectify = await fetch(`${baseUrl}/api/v1/hr/payrolls/${payrollAlfa.id}/rectify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        adjustmentCents: 500000, // +5.000 Kz de retroativo/ajuste
        reason: "Acerto de subsídio de transporte aprovado pela administração",
        notes: "Processado em sede de retificação sem rasura do recibo original",
      }),
    });
    assert.equal(resRectify.status, 200, "Retificação auditada deve retornar 200 OK");
    const rectifyRes = await resRectify.json();
    assert.equal(rectifyRes.adjustmentCents, 500000);
    assert.ok(rectifyRes.rectification?.rectificationNumber, "Deve conter número sequencial único de retificação");

    // 4.7 Consulta e Validação de Imutabilidade Estrutural de Snapshot no PostgreSQL
    const resSnapshot = await fetch(`${baseUrl}/api/v1/hr/payrolls/${payrollAlfa.id}/snapshot`, {
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resSnapshot.status, 200, "Consulta de snapshot deve retornar 200 OK");
    const snapshotJson = await resSnapshot.json();
    assert.equal(snapshotJson.payrollId, payrollAlfa.id);
    assert.equal(snapshotJson.month, "2026-11");
    assert.equal(snapshotJson.integrityHash.length, 64, "Hash de integridade SHA-256 deve ter 64 caracteres hex");
    assert.ok(snapshotJson.configSnapshot.configHash, "configSnapshot deve incluir configHash");
    assert.equal(snapshotJson.configSnapshot.configHash.length, 64, "configHash deve ter 64 caracteres hex");

    // Tentativa direta no PostgreSQL de UPDATE do snapshot -> Bloqueio por trigger
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE "PayrollSnapshot" SET "version" = '9.9.9' WHERE "id" = '${snapshotJson.id}';`
        );
      },
      /immutable|cannot be updated|PayrollSnapshot/i,
      "PostgreSQL trigger deve impedir UPDATE em PayrollSnapshot imutável"
    );

    // Tentativa direta no PostgreSQL de DELETE do snapshot -> Bloqueio por trigger
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "PayrollSnapshot" WHERE "id" = '${snapshotJson.id}';`
        );
      },
      /immutable|cannot be updated|PayrollSnapshot/i,
      "PostgreSQL trigger deve impedir DELETE em PayrollSnapshot imutável"
    );

    // Tentativa de DELETE no recibo fechado -> Bloqueio por Foreign Key ON DELETE RESTRICT
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "Payroll" WHERE "id" = '${payrollAlfa.id}';`
        );
      },
      /violates foreign key constraint|update or delete on table "Payroll"/i,
      "PostgreSQL FK deve impedir remoção de recibo com snapshot fechado associado"
    );

    // 4.8 Consulta e Validação de Imutabilidade Estrutural de Retificação
    const resRectList = await fetch(`${baseUrl}/api/v1/hr/payrolls/${payrollAlfa.id}/rectifications`, {
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resRectList.status, 200, "Consulta de retificações deve retornar 200 OK");
    const rectListJson = await resRectList.json();
    assert.ok(rectListJson.length >= 1, "Deve listar a retificação auditada");
    const firstRect = rectListJson[0];
    assert.equal(firstRect.snapshotId, snapshotJson.id, "Retificação deve estar vinculada ao snapshot imutável");
    assert.equal(firstRect.integrityHash.length, 64, "Hash de integridade da retificação deve ter 64 caracteres");

    // Tentativa direta no PostgreSQL de UPDATE da retificação -> Bloqueio por trigger
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE "PayrollRectification" SET "adjustmentCents" = 0 WHERE "id" = '${firstRect.id}';`
        );
      },
      /immutable|cannot be updated|PayrollRectification/i,
      "PostgreSQL trigger deve impedir UPDATE em PayrollRectification imutável"
    );

    // Tentativa direta no PostgreSQL de DELETE da retificação -> Bloqueio por trigger
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "PayrollRectification" WHERE "id" = '${firstRect.id}';`
        );
      },
      /immutable|cannot be updated|PayrollRectification/i,
      "PostgreSQL trigger deve impedir DELETE em PayrollRectification imutável"
    );

    // =========================================================================
    // CENÁRIO 5: Privacidade Biométrica, Encriptação em Repouso e Revogação
    // =========================================================================
    // 5.1 Rejeição de cadastro com template biométrico bruto
    const resRawBio = await fetch(`${baseUrl}/api/v1/hr/employees`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fullName: `Teste Biometria Inválida ${suffix}`,
        position: "Operador",
        baseSalaryCents: 10000000,
        biometricTemplate: "VECTORES_FACIAIS_RAW_BASE64_PROIBIDO",
      }),
    });
    assert.equal(resRawBio.status, 400, "Envio de template biométrico bruto deve ser rejeitado com 400");

    // 5.2 Validação de Encriptação AES-256-GCM v2 em Repouso no PostgreSQL com keyId
    const empInDb = await prisma.employee.findUnique({ where: { id: empAlfa.id } });
    assert.ok(empInDb?.biometricRefId, "biometricRefId deve persistir no modelo Employee");
    assert.ok(
      empInDb.biometricRefId.startsWith("enc:v2:"),
      "biometricRefId deve ser encriptado em repouso no formato enc:v2:keyId:..."
    );

    // 5.3 Consulta autorizada com consentimento biométrico ativo (deve retornar desencriptado)
    const resEmpDetailAdmin = await fetch(`${baseUrl}/api/v1/hr/employees/${empAlfa.id}`, {
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resEmpDetailAdmin.status, 200);
    const detailAdmin = await resEmpDetailAdmin.json();
    assert.equal(detailAdmin.biometricConsentGiven, true);
    assert.equal(detailAdmin.biometricRefId, `zk-token-${suffix}`, "Consulta autorizada deve desencriptar o token");

    // 5.4 Perfis não autorizados (CASHIER e MANAGER) recebem dados com biometria sanitizada (null / false)
    const resEmpDetailManager = await fetch(`${baseUrl}/api/v1/hr/employees/${empAlfa.id}`, {
      headers: {
        Authorization: `Bearer ${tokenManagerA2}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resEmpDetailManager.status, 200);
    const detailManager = await resEmpDetailManager.json();
    assert.equal(detailManager.biometricRefId, null, "MANAGER não pode ver biometricRefId");
    assert.equal(detailManager.biometricConsentGiven, false, "MANAGER não pode ver consentimento biométrico");

    const resEmpDetailCashier = await fetch(`${baseUrl}/api/v1/hr/employees/${empAlfa.id}`, {
      headers: {
        Authorization: `Bearer ${tokenCashier}`,
        "x-company-id": companyA.id,
      },
    });
    assert.equal(resEmpDetailCashier.status, 403, "CASHIER sem acesso ao módulo HR é bloqueado com 403");

    // 5.5 Revogação de consentimento biométrico
    const resRevokeBio = await fetch(`${baseUrl}/api/v1/hr/employees/${empAlfa.id}/biometric-consent/revoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        "x-company-id": companyA.id,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reason: "Colaborador solicitou revogação formal de consentimento biométrico",
      }),
    });
    assert.equal(resRevokeBio.status, 200, "Revogação de consentimento biométrico deve retornar 200 OK");
    const revokeRes = await resRevokeBio.json();
    assert.equal(revokeRes.success, true);
    assert.equal(revokeRes.employee.biometricConsentGiven, false);
    assert.equal(revokeRes.employee.biometricRefId, null);

    // 5.6 Confirmação em PostgreSQL de que a auditoria de desencriptação foi registada sem valor em texto claro
    const decryptAudit = await prisma.auditLog.findFirst({
      where: {
        companyId: companyA.id,
        action: "HR_BIOMETRIC_REF_DECRYPTED",
      },
    });
    assert.ok(decryptAudit, "Deve registar auditoria de desencriptação autorizada");
    const decryptMeta = decryptAudit.metadata as any;
    assert.ok(decryptMeta?.keyId, "Auditoria deve indicar keyId utilizado");
    assert.ok(decryptMeta?.authorizedRole, "Auditoria deve indicar papel autorizado");
    assert.equal(decryptMeta?.biometricRefId, undefined, "Auditoria NUNCA pode gravar o valor biométrico em texto claro");
    assert.equal(JSON.stringify(decryptMeta).includes(`zk-token-${suffix}`), false, "Valor claro não pode constar nos logs");
  } finally {
    // Teardown em PostgreSQL
    try {
      if (companyAId || companyBId) {
        const companies = [companyAId, companyBId].filter(Boolean);
        const compList = companies.map((c) => `'${c}'`).join(",");

        // Desativa temporariamente os triggers de imutabilidade apenas para descarte dos registos deste teste descartável
        await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRectification" DISABLE TRIGGER trg_payroll_rectification_immutable;`).catch(() => {});
        await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollSnapshot" DISABLE TRIGGER trg_payroll_snapshot_immutable;`).catch(() => {});

        await prisma.$executeRawUnsafe(`DELETE FROM "PayrollRectification" WHERE "companyId" IN (${compList});`).catch(() => {});
        await prisma.$executeRawUnsafe(`DELETE FROM "PayrollSnapshot" WHERE "companyId" IN (${compList});`).catch(() => {});

        await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollRectification" ENABLE TRIGGER trg_payroll_rectification_immutable;`).catch(() => {});
        await prisma.$executeRawUnsafe(`ALTER TABLE "PayrollSnapshot" ENABLE TRIGGER trg_payroll_snapshot_immutable;`).catch(() => {});

        await prisma.payroll.deleteMany({ where: { companyId: { in: companies } } });
        await prisma.employee.deleteMany({ where: { companyId: { in: companies } } });
        await prisma.integrationConfig.deleteMany({ where: { companyId: { in: companies } } });
        await prisma.auditLog.deleteMany({ where: { companyId: { in: companies } } });
        await prisma.companyMembership.deleteMany({ where: { companyId: { in: companies } } });
        await prisma.branch.deleteMany({ where: { companyId: { in: companies } } });
        await prisma.company.deleteMany({ where: { id: { in: companies } } });
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } catch (cleanupErr) {
      console.warn("[Teardown] Erro na limpeza dos registos de teste:", cleanupErr);
    }
    await prisma.$disconnect();
    server.close();
  }
});
