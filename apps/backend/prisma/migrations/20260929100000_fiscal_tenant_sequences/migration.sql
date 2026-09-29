-- Tenant-scoped fiscal foundation. This is additive: historic sequences are
-- retained and backfilled to the default legacy tenant created by the prior
-- tenant migration; no fiscal document is renumbered.
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "softwareCertificationNumber" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "softwareVersion" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT NOT NULL DEFAULT 'AOA';
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Africa/Luanda';
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "fiscalRegime" TEXT;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "roundingMode" TEXT NOT NULL DEFAULT 'HALF_UP';
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "fiscalArchiveRetentionYears" INTEGER;
ALTER TABLE "FiscalConfig" ADD COLUMN IF NOT EXISTS "saftXsdVersion" TEXT;

ALTER TABLE "FiscalSequence" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "FiscalSequence" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "FiscalSequence" ADD COLUMN IF NOT EXISTS "branchScopeId" TEXT NOT NULL DEFAULT '__COMPANY__';
ALTER TABLE "FiscalSequence" ADD COLUMN IF NOT EXISTS "fiscalYear" INTEGER;
ALTER TABLE "FiscalSequence" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "FiscalSequence" ADD COLUMN IF NOT EXISTS "closedBy" TEXT;

DO $$
DECLARE tenant_company TEXT; tenant_branch TEXT;
BEGIN
  SELECT "id" INTO tenant_company FROM "Company" WHERE "active" = true ORDER BY "createdAt" LIMIT 1;
  SELECT "id" INTO tenant_branch FROM "Branch" WHERE "companyId" = tenant_company AND "active" = true ORDER BY "code" LIMIT 1;
  UPDATE "FiscalSequence"
  SET "companyId" = tenant_company,
      "branchId" = tenant_branch,
      "branchScopeId" = COALESCE("branchId", '__COMPANY__'),
      "fiscalYear" = COALESCE("fiscalYear", EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
  WHERE "companyId" IS NULL OR "fiscalYear" IS NULL;
END $$;

ALTER TABLE "FiscalSequence" ALTER COLUMN "fiscalYear" SET NOT NULL;
DROP INDEX IF EXISTS "FiscalSequence_documentType_series_key";
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalSequence_company_scope_type_series_year_key"
  ON "FiscalSequence" ("companyId", "branchScopeId", "documentType", "series", "fiscalYear");
CREATE INDEX IF NOT EXISTS "FiscalSequence_company_branch_type_series_idx"
  ON "FiscalSequence" ("companyId", "branchId", "documentType", "series");

-- NIF/code identity is tenant-owned. PostgreSQL permits multiple NULLs, which
-- preserves records where identification was not collected.
DROP INDEX IF EXISTS "Customer_nif_key";
DROP INDEX IF EXISTS "Supplier_nif_key";
DROP INDEX IF EXISTS "Supplier_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_companyId_nif_key" ON "Customer" ("companyId", "nif");
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_companyId_nif_key" ON "Supplier" ("companyId", "nif");
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_companyId_code_key" ON "Supplier" ("companyId", "code");
