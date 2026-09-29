-- Scope accounting, fiscal configuration and HR roots to the default tenant while
-- retaining all existing historical identifiers and documents.
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Journal" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Journal" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "TaxRule" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "TaxRule" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

DO $$
DECLARE tenant_company TEXT; tenant_branch TEXT;
BEGIN
  SELECT "id" INTO tenant_company FROM "Company" WHERE "active" = true ORDER BY "createdAt" LIMIT 1;
  IF tenant_company IS NULL THEN RAISE EXCEPTION 'tenant backfill requires Company'; END IF;
  SELECT "id" INTO tenant_branch FROM "Branch" WHERE "companyId" = tenant_company AND "active" = true ORDER BY "code" LIMIT 1;
  IF tenant_branch IS NULL THEN RAISE EXCEPTION 'tenant backfill requires Branch'; END IF;
  UPDATE "FiscalConfig" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "Employee" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "Payroll" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "JournalEntry" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "Journal" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "AccountingPeriod" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "TaxRule" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Journal_companyId_branchId_entryDate_idx" ON "Journal" ("companyId", "branchId", "entryDate");
CREATE INDEX IF NOT EXISTS "JournalEntry_companyId_branchId_entryDate_idx" ON "JournalEntry" ("companyId", "branchId", "entryDate");
CREATE INDEX IF NOT EXISTS "Employee_companyId_branchId_active_idx" ON "Employee" ("companyId", "branchId", "active");
CREATE INDEX IF NOT EXISTS "Payroll_companyId_branchId_month_idx" ON "Payroll" ("companyId", "branchId", "month");
DROP INDEX IF EXISTS "AccountingPeriod_startsAt_endsAt_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingPeriod_companyId_startsAt_endsAt_key" ON "AccountingPeriod" ("companyId", "startsAt", "endsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalConfig_companyId_key" ON "FiscalConfig" ("companyId");
DROP INDEX IF EXISTS "Journal_sourceType_sourceId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Journal_companyId_sourceType_sourceId_key" ON "Journal" ("companyId", "sourceType", "sourceId");
