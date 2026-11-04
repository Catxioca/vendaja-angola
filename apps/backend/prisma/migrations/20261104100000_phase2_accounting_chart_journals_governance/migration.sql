BEGIN;

-- AlterTable Account
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'MOVEMENT';
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "normalBalance" TEXT NOT NULL DEFAULT 'DEBIT';
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "chartVersion" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill normalBalance based on accounting classification
UPDATE "Account" SET "normalBalance" = 'CREDIT' WHERE "type" IN ('LIABILITY', 'EQUITY', 'REVENUE');
UPDATE "Account" SET "normalBalance" = 'DEBIT' WHERE "type" IN ('ASSET', 'EXPENSE');

-- Backfill parent accounts as HEADER accounts generically without hardcoding root classes
UPDATE "Account" SET "accountType" = 'HEADER' WHERE "code" IN (SELECT DISTINCT "parentCode" FROM "Account" WHERE "parentCode" IS NOT NULL);

-- Safe multi-tenant backfill of companyId for legacy accounts:
-- Never silently attribute legacy records to an arbitrary default company in multi-company environments.
-- 1. Single company: attribute safely to the sole company.
-- 2. Multi-company: infer exclusively from unambiguous historical references (JournalEntry, TaxRule).
-- 3. If ambiguity persists (unreferenced accounts across multiple companies), block migration safely.
DO $$
DECLARE
    company_count INTEGER;
    sole_company_id TEXT;
    ambiguous_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO company_count FROM "Company";

    IF company_count = 1 THEN
        SELECT "id" INTO sole_company_id FROM "Company" LIMIT 1;
        UPDATE "Account" SET "companyId" = sole_company_id WHERE "companyId" IS NULL;
    ELSIF company_count > 1 THEN
        -- Infer company from JournalEntry and TaxRule lines where all records point to a single company
        UPDATE "Account" a
        SET "companyId" = inferred.company_id
        FROM (
            SELECT account_id, MIN(company_id) AS company_id
            FROM (
                SELECT "debitAccountId" AS account_id, "companyId" AS company_id FROM "JournalEntry" WHERE "companyId" IS NOT NULL
                UNION ALL
                SELECT "creditAccountId" AS account_id, "companyId" AS company_id FROM "JournalEntry" WHERE "companyId" IS NOT NULL
                UNION ALL
                SELECT "outputAccountId" AS account_id, "companyId" AS company_id FROM "TaxRule" WHERE "companyId" IS NOT NULL
                UNION ALL
                SELECT "inputAccountId" AS account_id, "companyId" AS company_id FROM "TaxRule" WHERE "companyId" IS NOT NULL
            ) combined
            GROUP BY account_id
            HAVING COUNT(DISTINCT company_id) = 1
        ) inferred
        WHERE a."id" = inferred.account_id AND a."companyId" IS NULL;

        -- Check if any orphaned accounts remain unassigned
        SELECT COUNT(*) INTO ambiguous_count FROM "Account" WHERE "companyId" IS NULL;
        IF ambiguous_count > 0 THEN
            RAISE EXCEPTION 'MIGRATION_AMBIGUOUS_MULTI_COMPANY_ACCOUNTS: Ambiguity detected in legacy Account backfill. % accounts have no definitive company reference among % companies. Safe migration blocked.', ambiguous_count, company_count;
        END IF;
    END IF;
END $$;

-- Backfill parentId hierarchy using parentCode within same company context
UPDATE "Account" a
SET "parentId" = p."id"
FROM "Account" p
WHERE a."parentCode" IS NOT NULL
  AND a."parentCode" = p."code"
  AND (a."companyId" = p."companyId" OR (a."companyId" IS NULL AND p."companyId" IS NULL));

-- Drop legacy global unique constraint on Account(code)
DROP INDEX IF EXISTS "Account_code_key";

-- Create multi-tenant unique and performance indices on Account
CREATE UNIQUE INDEX IF NOT EXISTS "Account_companyId_code_key" ON "Account"("companyId", "code");
CREATE INDEX IF NOT EXISTS "Account_companyId_accountType_isActive_idx" ON "Account"("companyId", "accountType", "isActive");
CREATE INDEX IF NOT EXISTS "Account_companyId_parentId_idx" ON "Account"("companyId", "parentId");

-- Add foreign key constraint for self-referencing parent account hierarchy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Account_parentId_fkey'
    ) THEN
        ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AlterTable Journal with audit, subledger tracking and correlation
ALTER TABLE "Journal" ADD COLUMN IF NOT EXISTS "journalCode" TEXT;
ALTER TABLE "Journal" ADD COLUMN IF NOT EXISTS "sequenceNumber" INTEGER;
ALTER TABLE "Journal" ADD COLUMN IF NOT EXISTS "fiscalYear" INTEGER;
ALTER TABLE "Journal" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;
ALTER TABLE "Journal" ADD COLUMN IF NOT EXISTS "correlationId" TEXT;
ALTER TABLE "Journal" ADD COLUMN IF NOT EXISTS "reason" TEXT;

CREATE INDEX IF NOT EXISTS "Journal_companyId_journalCode_fiscalYear_idx" ON "Journal"("companyId", "journalCode", "fiscalYear");

-- AlterTable AccountingPeriod with controlled closing/reopening audit
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "closingReason" TEXT;
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3);
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "reopenedBy" TEXT;
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "reopeningReason" TEXT;

-- CreateTable AccountingJournal (Subdiários Configuráveis)
CREATE TABLE IF NOT EXISTS "AccountingJournal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "currentSeq" INTEGER NOT NULL DEFAULT 0,
    "fiscalYear" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "AccountingJournal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingJournal_companyId_code_fiscalYear_key" ON "AccountingJournal"("companyId", "code", "fiscalYear");
CREATE INDEX IF NOT EXISTS "AccountingJournal_companyId_type_status_idx" ON "AccountingJournal"("companyId", "type", "status");
CREATE INDEX IF NOT EXISTS "AccountingJournal_companyId_fiscalYear_idx" ON "AccountingJournal"("companyId", "fiscalYear");

-- CreateTable FiscalYearClosingConfig (Parametrização Explícita de Fecho por Empresa)
CREATE TABLE IF NOT EXISTS "FiscalYearClosingConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "retainedEarningsAccountId" TEXT NOT NULL,
    "closingJournalId" TEXT NOT NULL,
    "sourceAccountTypes" TEXT NOT NULL DEFAULT 'REVENUE,EXPENSE',
    "sourceCategoryFilter" TEXT,
    "policyType" TEXT NOT NULL DEFAULT 'INTERNAL_POLICY',
    "source" TEXT NOT NULL DEFAULT 'MANUAL_CONTABILISTICO',
    "version" TEXT NOT NULL DEFAULT 'v1',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "responsibleParty" TEXT NOT NULL,
    "approvalDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalYearClosingConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalYearClosingConfig_companyId_version_key" ON "FiscalYearClosingConfig"("companyId", "version");
CREATE INDEX IF NOT EXISTS "FiscalYearClosingConfig_companyId_status_idx" ON "FiscalYearClosingConfig"("companyId", "status");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalYearClosingConfig_companyId_fkey') THEN
        ALTER TABLE "FiscalYearClosingConfig" ADD CONSTRAINT "FiscalYearClosingConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalYearClosingConfig_retainedEarningsAccountId_fkey') THEN
        ALTER TABLE "FiscalYearClosingConfig" ADD CONSTRAINT "FiscalYearClosingConfig_retainedEarningsAccountId_fkey" FOREIGN KEY ("retainedEarningsAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalYearClosingConfig_closingJournalId_fkey') THEN
        ALTER TABLE "FiscalYearClosingConfig" ADD CONSTRAINT "FiscalYearClosingConfig_closingJournalId_fkey" FOREIGN KEY ("closingJournalId") REFERENCES "AccountingJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- CreateTable FiscalYearClosing (Fecho e Reabertura de Exercício com Ligação a Configuração)
CREATE TABLE IF NOT EXISTS "FiscalYearClosing" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "configId" TEXT,
    "closingJournalId" TEXT,
    "retainedEarningsAccountId" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT NOT NULL,
    "closingReason" TEXT NOT NULL,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopeningReason" TEXT,
    "reopeningJournalId" TEXT,
    "summaryNetIncomeCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalYearClosing_pkey" PRIMARY KEY ("id")
);

-- Ensure columns exist if table was already created
ALTER TABLE "FiscalYearClosing" ADD COLUMN IF NOT EXISTS "configId" TEXT;
ALTER TABLE "FiscalYearClosing" ADD COLUMN IF NOT EXISTS "retainedEarningsAccountId" TEXT;
ALTER TABLE "FiscalYearClosing" DROP COLUMN IF EXISTS "retainedEarningsAccountCode";

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalYearClosing_companyId_fiscalYear_key" ON "FiscalYearClosing"("companyId", "fiscalYear");
CREATE INDEX IF NOT EXISTS "FiscalYearClosing_companyId_status_idx" ON "FiscalYearClosing"("companyId", "status");

ALTER TABLE "FiscalYearClosingConfig" ADD COLUMN IF NOT EXISTS "sourceAccountTypes" TEXT NOT NULL DEFAULT 'REVENUE,EXPENSE';
ALTER TABLE "FiscalYearClosingConfig" ADD COLUMN IF NOT EXISTS "sourceCategoryFilter" TEXT;
ALTER TABLE "FiscalYearClosingConfig" ADD COLUMN IF NOT EXISTS "policyType" TEXT NOT NULL DEFAULT 'INTERNAL_POLICY';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalYearClosing_configId_fkey') THEN
        ALTER TABLE "FiscalYearClosing" ADD CONSTRAINT "FiscalYearClosing_configId_fkey" FOREIGN KEY ("configId") REFERENCES "FiscalYearClosingConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;
