import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getEffectiveTestDatabaseUrl } from "./db-test-helper.js";

const PSQL_PATH =
  process.platform === "win32"
    ? fs.existsSync("C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe")
      ? "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
      : "psql.exe"
    : "psql";

test("PROVA REAL DAS MIGRATIONS 1 A 36 EM POSTGRESQL (CENÁRIOS A, B, C, D, E)", async (t) => {
  const dbUrl = await getEffectiveTestDatabaseUrl();
  if (!dbUrl) {
    t.skip("PostgreSQL não disponível para teste de migrations");
    return;
  }

  const urlObj = new URL(dbUrl);
  const host = urlObj.hostname;
  const port = urlObj.port || "5432";
  const user = urlObj.username || "vendaja_test";
  const password = decodeURIComponent(urlObj.password || "VendaJ@2309");
  const baseDb = urlObj.pathname.slice(1).split("?")[0] || "vendaja_test";

  const psqlEnv = { ...process.env, PGPASSWORD: password };

  const execPsql = (dbName: string, sql: string) => {
    return execFileSync(
      PSQL_PATH,
      ["-h", host, "-p", port, "-U", user, "-d", dbName, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
      { env: psqlEnv, stdio: "pipe" }
    ).toString();
  };

  const execPsqlFile = (dbName: string, filePath: string) => {
    return execFileSync(
      PSQL_PATH,
      ["-h", host, "-p", port, "-U", user, "-d", dbName, "-v", "ON_ERROR_STOP=1", "-f", filePath],
      { env: psqlEnv, stdio: "pipe" }
    ).toString();
  };

  const migrationsDir = fs.existsSync(path.resolve("prisma/migrations"))
    ? path.resolve("prisma/migrations")
    : path.resolve("apps/backend/prisma/migrations");

  const allMigrationDirs = fs
    .readdirSync(migrationsDir)
    .filter((d) => fs.existsSync(path.join(migrationsDir, d, "migration.sql")))
    .sort();

  const migration35Index = allMigrationDirs.findIndex((d) => d.includes("phase2_accounting"));
  const migration35Dir = migration35Index >= 0 ? allMigrationDirs[migration35Index] : allMigrationDirs[34];
  if (!migration35Dir) throw new Error("migration_35_dir_not_found");
  const migration35File = path.join(migrationsDir, migration35Dir, "migration.sql");
  const migrations1to34 = allMigrationDirs.slice(0, migration35Index >= 0 ? migration35Index : 34);

  const migration36Index = allMigrationDirs.findIndex((d) => d.includes("hr_payroll_immutable"));
  const migration36Dir = migration36Index >= 0 ? allMigrationDirs[migration36Index] : allMigrationDirs[35];
  if (!migration36Dir) throw new Error("migration_36_dir_not_found");
  const migration36File = path.join(migrationsDir, migration36Dir, "migration.sql");
  const migrations1to35 = allMigrationDirs.slice(0, migration36Index >= 0 ? migration36Index : 35);

  assert.ok(allMigrationDirs.length >= 36, "Devem existir pelo menos 36 migrações no repositório");

  // ====================================================
  // CENÁRIO A: BASE LIMPA (MIGRATIONS 1 A 36 SEQUENCIAIS)
  // ====================================================
  await t.test("Cenário A: Base limpa - Aplicação sequencial de 1 a 36 e validação de schema final", async () => {
    const testDbA = `vendaja_mig_a_${Date.now()}`;

    // 1. Criar base descartável limpa
    execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbA}";`);
    execPsql(baseDb, `CREATE DATABASE "${testDbA}";`);

    try {
      // 2. Confirmar zero tabelas na base limpa
      const initialCount = parseInt(
        execPsql(
          testDbA,
          "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
        ).trim(),
        10
      );
      assert.equal(initialCount, 0, "A base limpa deve ter 0 tabelas antes das migrations");

      // 3. Aplicar migrations 1 a 36 sequencialmente
      for (const dir of allMigrationDirs) {
        const sqlPath = path.join(migrationsDir, dir, "migration.sql");
        execPsqlFile(testDbA, sqlPath);
      }

      // 4. Confirmar criação das tabelas e schema final
      const finalCount = parseInt(
        execPsql(
          testDbA,
          "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
        ).trim(),
        10
      );
      assert.ok(finalCount >= 122, `Schema final deve conter todas as tabelas (obtidas ${finalCount})`);

      // Verificar existência e colunas da tabela FiscalYearClosingConfig
      const closingConfigColumns = execPsql(
        testDbA,
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'FiscalYearClosingConfig' ORDER BY column_name;"
      );
      assert.ok(closingConfigColumns.includes("sourceAccountTypes"), "Coluna sourceAccountTypes deve existir");
      assert.ok(closingConfigColumns.includes("policyType"), "Coluna policyType deve existir");
      assert.ok(closingConfigColumns.includes("retainedEarningsAccountId"), "Coluna retainedEarningsAccountId deve existir");
      assert.ok(closingConfigColumns.includes("closingJournalId"), "Coluna closingJournalId deve existir");

      // Verificar colunas de Account
      const accountColumns = execPsql(
        testDbA,
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'Account' ORDER BY column_name;"
      );
      assert.ok(accountColumns.includes("companyId"), "Coluna companyId deve existir na Account");
      assert.ok(accountColumns.includes("normalBalance"), "Coluna normalBalance deve existir na Account");
      assert.ok(accountColumns.includes("accountType"), "Coluna accountType deve existir na Account");

      // Verificar existência e colunas da tabela PayrollSnapshot
      const snapshotColumns = execPsql(
        testDbA,
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'PayrollSnapshot' ORDER BY column_name;"
      );
      assert.ok(snapshotColumns.includes("companyId"), "Coluna companyId deve existir na PayrollSnapshot");
      assert.ok(snapshotColumns.includes("payrollId"), "Coluna payrollId deve existir na PayrollSnapshot");
      assert.ok(snapshotColumns.includes("month"), "Coluna month deve existir na PayrollSnapshot");
      assert.ok(snapshotColumns.includes("version"), "Coluna version deve existir na PayrollSnapshot");
      assert.ok(snapshotColumns.includes("configSnapshot"), "Coluna configSnapshot deve existir na PayrollSnapshot");
      assert.ok(snapshotColumns.includes("integrityHash"), "Coluna integrityHash deve existir na PayrollSnapshot");
      assert.ok(snapshotColumns.includes("closedAt"), "Coluna closedAt deve existir na PayrollSnapshot");
      assert.ok(snapshotColumns.includes("closedBy"), "Coluna closedBy deve existir na PayrollSnapshot");

      // Verificar existência e colunas da tabela PayrollRectification
      const rectColumns = execPsql(
        testDbA,
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'PayrollRectification' ORDER BY column_name;"
      );
      assert.ok(rectColumns.includes("companyId"), "Coluna companyId deve existir na PayrollRectification");
      assert.ok(rectColumns.includes("payrollId"), "Coluna payrollId deve existir na PayrollRectification");
      assert.ok(rectColumns.includes("snapshotId"), "Coluna snapshotId deve existir na PayrollRectification");
      assert.ok(rectColumns.includes("rectificationNumber"), "Coluna rectificationNumber deve existir na PayrollRectification");
      assert.ok(rectColumns.includes("adjustmentCents"), "Coluna adjustmentCents deve existir na PayrollRectification");
      assert.ok(rectColumns.includes("originalNetSalaryCents"), "Coluna originalNetSalaryCents deve existir na PayrollRectification");
      assert.ok(rectColumns.includes("adjustedNetSalaryCents"), "Coluna adjustedNetSalaryCents deve existir na PayrollRectification");
      assert.ok(rectColumns.includes("integrityHash"), "Coluna integrityHash deve existir na PayrollRectification");

      // Verificar colunas de Employee
      const employeeColumns = execPsql(
        testDbA,
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'Employee' ORDER BY column_name;"
      );
      assert.ok(employeeColumns.includes("biometricConsentGiven"), "Coluna biometricConsentGiven deve existir na Employee");
      assert.ok(employeeColumns.includes("biometricRefId"), "Coluna biometricRefId deve existir na Employee");
    } finally {
      // 5. Descartar base descartável após teste
      execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbA}";`);
    }
  });

  // ====================================================
  // CENÁRIO B: UPGRADE LEGADO DE UMA EMPRESA
  // ====================================================
  await t.test("Cenário B: Upgrade legado de uma empresa - Atribuição correta sem perda de dados", async () => {
    const testDbB = `vendaja_mig_b_${Date.now()}`;

    execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbB}";`);
    execPsql(baseDb, `CREATE DATABASE "${testDbB}";`);

    try {
      // 1. Aplicar migrations 1 a 34
      for (const dir of migrations1to34) {
        execPsqlFile(testDbB, path.join(migrationsDir, dir, "migration.sql"));
      }

      // 2. Obter a única empresa existente da base legada
      const soleCompanyId = execPsql(testDbB, 'SELECT "id" FROM "Company" LIMIT 1;').trim();
      assert.ok(soleCompanyId, "Deve existir a empresa da base legada");
      const companyCount = parseInt(execPsql(testDbB, 'SELECT count(*) FROM "Company";').trim(), 10);
      assert.equal(companyCount, 1, "Cenário B deve ter exatamente 1 empresa legada");

      execPsql(
        testDbB,
        `INSERT INTO "Account" ("id", "code", "name", "type", "createdAt") VALUES
         ('acc-leg-1', '1.1', 'Caixa Legado', 'ASSET', NOW()),
         ('acc-leg-2', '7.1', 'Vendas Legadas', 'REVENUE', NOW()),
         ('acc-leg-3', '6.1', 'Custos Legados', 'EXPENSE', NOW());`
      );

      // Confirmar contagem antes da 35
      const accountsBefore = parseInt(
        execPsql(testDbB, `SELECT count(*) FROM "Account";`).trim(),
        10
      );
      assert.equal(accountsBefore, 3);

      // 3. Aplicar migration 35
      execPsqlFile(testDbB, migration35File);

      // 4. Confirmar que todas as 3 contas receberam o companyId da empresa única
      const assignedCount = parseInt(
        execPsql(
          testDbB,
          `SELECT count(*) FROM "Account" WHERE "companyId" = '${soleCompanyId}';`
        ).trim(),
        10
      );
      assert.equal(assignedCount, 3, "Todas as contas legadas devem receber o companyId da única empresa");

      // Confirmar zero perda de dados
      const accountsAfter = parseInt(
        execPsql(testDbB, `SELECT count(*) FROM "Account";`).trim(),
        10
      );
      assert.equal(accountsAfter, 3, "Nenhuma conta pode ser apagada no upgrade");
    } finally {
      execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbB}";`);
    }
  });

  // ====================================================
  // CENÁRIO C: UPGRADE LEGADO MULTIEMPRESA INEQUÍVOCO
  // ====================================================
  await t.test("Cenário C: Upgrade legado multiempresa inequívoco - Associação via transações históricas", async () => {
    const testDbC = `vendaja_mig_c_${Date.now()}`;

    execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbC}";`);
    execPsql(baseDb, `CREATE DATABASE "${testDbC}";`);

    try {
      // 1. Aplicar migrations 1 a 34
      for (const dir of migrations1to34) {
        execPsqlFile(testDbC, path.join(migrationsDir, dir, "migration.sql"));
      }

      // 2. Obter a primeira empresa e inserir uma segunda empresa
      const compAlpha = execPsql(testDbC, 'SELECT "id" FROM "Company" LIMIT 1;').trim();
      const compBeta = "comp-beta-002";
      execPsql(
        testDbC,
        `INSERT INTO "Company" ("id", "legalName", "nif", "active") VALUES
         ('${compBeta}', 'Beta Distribuição SA', '5400000003', true);`
      );
      const companyCount = parseInt(execPsql(testDbC, 'SELECT count(*) FROM "Company";').trim(), 10);
      assert.equal(companyCount, 2, "Cenário C deve ter 2 empresas legadas");

      // Inserir contas legadas sem companyId
      execPsql(
        testDbC,
        `INSERT INTO "Account" ("id", "code", "name", "type", "createdAt") VALUES
         ('acc-alpha-rev', '7.ALPHA', 'Receitas Alpha', 'REVENUE', NOW()),
         ('acc-alpha-csh', '1.ALPHA', 'Caixa Alpha', 'ASSET', NOW()),
         ('acc-beta-rev', '7.BETA', 'Receitas Beta', 'REVENUE', NOW()),
         ('acc-beta-csh', '1.BETA', 'Caixa Beta', 'ASSET', NOW());`
      );

      // Inserir JournalEntry vinculando acc-alpha exclusivamente a compAlpha
      execPsql(
        testDbC,
        `INSERT INTO "JournalEntry" ("id", "companyId", "description", "debitAccountId", "creditAccountId", "amountCents") VALUES
         ('je-alpha-1', '${compAlpha}', 'Venda Alpha', 'acc-alpha-csh', 'acc-alpha-rev', 50000);`
      );

      // Inserir TaxRule vinculando acc-beta exclusivamente a compBeta
      execPsql(
        testDbC,
        `INSERT INTO "TaxRule" ("id", "companyId", "code", "name", "rate", "outputAccountId", "inputAccountId") VALUES
         ('tax-beta-1', '${compBeta}', 'IVA-BETA', 'IVA 14%', 0.14, 'acc-beta-rev', 'acc-beta-csh');`
      );

      // 3. Aplicar migration 35
      execPsqlFile(testDbC, migration35File);

      // 4. Confirmar que contas Alpha pertencem estritamente a Alpha e Beta a Beta
      const alphaAccounts = execPsql(
        testDbC,
        `SELECT "id" FROM "Account" WHERE "companyId" = '${compAlpha}';`
      );
      assert.ok(alphaAccounts.includes("acc-alpha-rev"), "acc-alpha-rev deve pertencer a compAlpha");
      assert.ok(alphaAccounts.includes("acc-alpha-csh"), "acc-alpha-csh deve pertencer a compAlpha");

      const betaAccounts = execPsql(
        testDbC,
        `SELECT "id" FROM "Account" WHERE "companyId" = '${compBeta}';`
      );
      assert.ok(betaAccounts.includes("acc-beta-rev"), "acc-beta-rev deve pertencer a compBeta");
      assert.ok(betaAccounts.includes("acc-beta-csh"), "acc-beta-csh deve pertencer a compBeta");
    } finally {
      execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbC}";`);
    }
  });

  // ====================================================
  // CENÁRIO D: UPGRADE LEGADO AMBÍGUO (BLOQUEIO E ROLLBACK)
  // ====================================================
  await t.test("Cenário D: Upgrade legado ambíguo - Bloqueio com erro determinístico e rollback transacional", async () => {
    const testDbD = `vendaja_mig_d_${Date.now()}`;

    execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbD}";`);
    execPsql(baseDb, `CREATE DATABASE "${testDbD}";`);

    try {
      // 1. Aplicar migrations 1 a 34
      for (const dir of migrations1to34) {
        execPsqlFile(testDbD, path.join(migrationsDir, dir, "migration.sql"));
      }

      // 2. Obter a primeira empresa e inserir uma segunda empresa
      const comp1 = execPsql(testDbD, 'SELECT "id" FROM "Company" LIMIT 1;').trim();
      const comp2 = "comp-ambig-2";
      execPsql(
        testDbD,
        `INSERT INTO "Company" ("id", "legalName", "nif", "active") VALUES
         ('${comp2}', 'Segunda Empresa SA', '5400000005', true);`
      );
      const companyCount = parseInt(execPsql(testDbD, 'SELECT count(*) FROM "Company";').trim(), 10);
      assert.equal(companyCount, 2, "Cenário D deve ter 2 empresas");

      // Inserir conta órfã sem qualquer ligação histórica (ambiguidade multiempresa)
      execPsql(
        testDbD,
        `INSERT INTO "Account" ("id", "code", "name", "type", "createdAt") VALUES
         ('acc-orphan-ambiguous', '99.ORPHAN', 'Conta Sem Vínculo Definido', 'EXPENSE', NOW());`
      );

      // 3. Tentar aplicar migration 35 - deve falhar deterministicamente
      let migrationFailed = false;
      let errorMessage = "";
      try {
        execPsqlFile(testDbD, migration35File);
      } catch (err: any) {
        migrationFailed = true;
        errorMessage = err.stderr?.toString() || err.message;
      }

      assert.ok(migrationFailed, "Migration 35 DEVE falhar quando existe ambiguidade multiempresa");
      assert.ok(
        errorMessage.includes("MIGRATION_AMBIGUOUS_MULTI_COMPANY_ACCOUNTS"),
        `Erro deve conter MIGRATION_AMBIGUOUS_MULTI_COMPANY_ACCOUNTS (recebido: ${errorMessage})`
      );

      // 4. Confirmar que a transação fez rollback completo:
      // A tabela FiscalYearClosingConfig NÃO deve ter sido criada e a conta continua intacta sem atribuição arbitrária
      const closingConfigExists = execPsql(
        testDbD,
        "SELECT count(*) FROM information_schema.tables WHERE table_name = 'FiscalYearClosingConfig';"
      ).trim();
      assert.equal(
        closingConfigExists,
        "0",
        "Rollback transacional: FiscalYearClosingConfig não deve existir após falha"
      );

      const orphanStillIntact = execPsql(
        testDbD,
        `SELECT "id" FROM "Account" WHERE "id" = 'acc-orphan-ambiguous';`
      ).trim();
      assert.ok(orphanStillIntact.includes("acc-orphan-ambiguous"), "Conta órfã não foi apagada");

      // Confirmar que nenhuma 'empresa padrão' foi inventada
      const orphanCompany = execPsql(
        testDbD,
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Account' AND column_name = 'companyId';`
      ).trim();
      assert.equal(orphanCompany, "", "Rollback transacional: coluna companyId não foi comitada");
    } finally {
      execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbD}";`);
    }
  });

  // ====================================================
  // CENÁRIO E: UPGRADE DA MIGRATION 35 PARA 36 & IMUTABILIDADE POSTGRESQL
  // ====================================================
  await t.test(
    "Cenário E: Upgrade da migration 35 para 36, bloqueio por trigger de UPDATE/DELETE e rollback transacional",
    async () => {
      const testDbE = `vendaja_mig_e_${Date.now()}`;

      execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbE}";`);
      execPsql(baseDb, `CREATE DATABASE "${testDbE}";`);

      try {
        // 1. Aplicar migrations 1 a 35 sequencialmente
        for (const dir of migrations1to35) {
          execPsqlFile(testDbE, path.join(migrationsDir, dir, "migration.sql"));
        }

        // 2. Confirmar que na migration 35 PayrollSnapshot e PayrollRectification ainda não existem
        const snapshotBefore = parseInt(
          execPsql(
            testDbE,
            "SELECT count(*) FROM information_schema.tables WHERE table_name = 'PayrollSnapshot';"
          ).trim(),
          10
        );
        assert.equal(snapshotBefore, 0, "PayrollSnapshot não deve existir antes da migration 36");

        // 3. Aplicar migration 36 (upgrade de 35 para 36)
        execPsqlFile(testDbE, migration36File);

        // 4. Confirmar que PayrollSnapshot e PayrollRectification agora existem
        const snapshotAfter = parseInt(
          execPsql(
            testDbE,
            "SELECT count(*) FROM information_schema.tables WHERE table_name = 'PayrollSnapshot';"
          ).trim(),
          10
        );
        assert.equal(snapshotAfter, 1, "PayrollSnapshot deve existir após a migration 36");

        const rectAfter = parseInt(
          execPsql(
            testDbE,
            "SELECT count(*) FROM information_schema.tables WHERE table_name = 'PayrollRectification';"
          ).trim(),
          10
        );
        assert.equal(rectAfter, 1, "PayrollRectification deve existir após a migration 36");

        // 5. Testar Rollback Transacional em falha de migração
        let rollbackFailed = false;
        try {
          execPsql(
            testDbE,
            `BEGIN;
             CREATE TABLE "RollbackTestTable" ("id" TEXT PRIMARY KEY);
             ALTER TABLE "NonExistentTableToForceError" ADD COLUMN "test" TEXT;
             COMMIT;`
          );
        } catch {
          rollbackFailed = true;
        }
        assert.ok(rollbackFailed, "Bloco com erro forçado deve abortar a transação");
        const rollbackTableExists = parseInt(
          execPsql(
            testDbE,
            "SELECT count(*) FROM information_schema.tables WHERE table_name = 'RollbackTestTable';"
          ).trim(),
          10
        );
        assert.equal(rollbackTableExists, 0, "Rollback transacional: RollbackTestTable foi revertida");

        // 6. Testar Triggers de Imutabilidade Direta no PostgreSQL
        // Obter empresa legada existente
        const companyId = execPsql(testDbE, 'SELECT "id" FROM "Company" LIMIT 1;').trim();
        assert.ok(companyId, "Deve existir empresa para o teste de payroll");

        // Inserir Employee
        execPsql(
          testDbE,
          `INSERT INTO "Employee" ("id", "companyId", "fullName", "position", "baseSalaryCents", "biometricConsentGiven", "biometricRefId", "updatedAt")
           VALUES ('emp-mig-01', '${companyId}', 'Colaborador Imutável', 'Engenheiro', 30000000, true, 'enc:v2:k1:iv:tag:data', NOW());`
        );

        // Inserir Payroll
        execPsql(
          testDbE,
          `INSERT INTO "Payroll" ("id", "companyId", "employeeId", "month", "salaryBaseCents", "grossSalaryCents", "netSalaryCents", "status", "createdAt", "updatedAt")
           VALUES ('pay-mig-01', '${companyId}', 'emp-mig-01', '2026-11', 30000000, 30000000, 26000000, 'CLOSED', NOW(), NOW());`
        );

        // Inserir PayrollSnapshot com configHash canónico
        const configCanonicalHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        execPsql(
          testDbE,
          `INSERT INTO "PayrollSnapshot" ("id", "companyId", "payrollId", "month", "version", "configSnapshot", "integrityHash", "closedAt", "closedBy")
           VALUES ('snap-mig-01', '${companyId}', 'pay-mig-01', '2026-11', '2026.1', '{"version":"2026.1","configHash":"${configCanonicalHash}"}', 'hash-snapshot-01', NOW(), 'admin-auditor');`
        );

        // Validar que o configHash canónico está gravado no snapshot
        const configHashCheck = execPsql(
          testDbE,
          `SELECT "configSnapshot"->>'configHash' FROM "PayrollSnapshot" WHERE "id" = 'snap-mig-01';`
        ).trim();
        assert.equal(configHashCheck, configCanonicalHash, "Snapshot deve conter hash canónico da configuração remuneratória aplicada");

        // Testar SQL direto UPDATE em PayrollSnapshot (deve ser bloqueado pelo trigger)
        let updateSnapshotBlocked = false;
        let updateSnapshotError = "";
        try {
          execPsql(testDbE, `UPDATE "PayrollSnapshot" SET "closedBy" = 'hacker' WHERE "id" = 'snap-mig-01';`);
        } catch (err: any) {
          updateSnapshotBlocked = true;
          updateSnapshotError = err.stderr?.toString() || err.message;
        }
        assert.ok(updateSnapshotBlocked, "Trigger DEVE bloquear UPDATE direto em PayrollSnapshot");
        assert.ok(
          updateSnapshotError.includes("PayrollSnapshot is strictly immutable"),
          `Mensagem do trigger deve indicar imutabilidade estrita (recebido: ${updateSnapshotError})`
        );

        // Testar SQL direto DELETE em PayrollSnapshot (deve ser bloqueado pelo trigger)
        let deleteSnapshotBlocked = false;
        let deleteSnapshotError = "";
        try {
          execPsql(testDbE, `DELETE FROM "PayrollSnapshot" WHERE "id" = 'snap-mig-01';`);
        } catch (err: any) {
          deleteSnapshotBlocked = true;
          deleteSnapshotError = err.stderr?.toString() || err.message;
        }
        assert.ok(deleteSnapshotBlocked, "Trigger DEVE bloquear DELETE direto em PayrollSnapshot");
        assert.ok(
          deleteSnapshotError.includes("PayrollSnapshot is strictly immutable"),
          `Mensagem do trigger deve indicar imutabilidade estrita (recebido: ${deleteSnapshotError})`
        );

        // Inserir PayrollRectification
        execPsql(
          testDbE,
          `INSERT INTO "PayrollRectification" ("id", "companyId", "payrollId", "snapshotId", "rectificationNumber", "adjustmentCents", "originalNetSalaryCents", "adjustedNetSalaryCents", "reason", "integrityHash", "createdBy")
           VALUES ('rect-mig-01', '${companyId}', 'pay-mig-01', 'snap-mig-01', 'RET-PAY-01-1', 1000000, 26000000, 27000000, 'Retificação de subsídio de turno', 'hash-rect-01', 'admin-auditor');`
        );

        // Testar SQL direto UPDATE em PayrollRectification (deve ser bloqueado pelo trigger)
        let updateRectBlocked = false;
        let updateRectError = "";
        try {
          execPsql(testDbE, `UPDATE "PayrollRectification" SET "adjustmentCents" = 9999999 WHERE "id" = 'rect-mig-01';`);
        } catch (err: any) {
          updateRectBlocked = true;
          updateRectError = err.stderr?.toString() || err.message;
        }
        assert.ok(updateRectBlocked, "Trigger DEVE bloquear UPDATE direto em PayrollRectification");
        assert.ok(
          updateRectError.includes("PayrollRectification is strictly append-only"),
          `Mensagem do trigger deve indicar append-only estrito (recebido: ${updateRectError})`
        );

        // Testar SQL direto DELETE em PayrollRectification (deve ser bloqueado pelo trigger)
        let deleteRectBlocked = false;
        let deleteRectError = "";
        try {
          execPsql(testDbE, `DELETE FROM "PayrollRectification" WHERE "id" = 'rect-mig-01';`);
        } catch (err: any) {
          deleteRectBlocked = true;
          deleteRectError = err.stderr?.toString() || err.message;
        }
        assert.ok(deleteRectBlocked, "Trigger DEVE bloquear DELETE direto em PayrollRectification");
        assert.ok(
          deleteRectError.includes("PayrollRectification is strictly append-only"),
          `Mensagem do trigger deve indicar append-only estrito (recebido: ${deleteRectError})`
        );
      } finally {
        execPsql(baseDb, `DROP DATABASE IF EXISTS "${testDbE}";`);
      }
    }
  );
});
