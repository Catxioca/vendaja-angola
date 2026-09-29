-- Tenant ownership for legacy business roots. Existing records remain available
-- only through the default company/branch created by the earlier platform migration.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "CommercialDocument" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "CommercialDocument" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

DO $$
DECLARE tenant_company TEXT; tenant_branch TEXT;
BEGIN
  SELECT "id" INTO tenant_company FROM "Company" WHERE "active" = true ORDER BY "createdAt" LIMIT 1;
  IF tenant_company IS NULL THEN
    INSERT INTO "Company" ("id", "legalName", "active", "createdAt")
    VALUES ('legacy-' || md5('vendaja-legacy-company'), 'VendaJá - dados legados', true, now()) RETURNING "id" INTO tenant_company;
  END IF;
  SELECT "id" INTO tenant_branch FROM "Branch" WHERE "companyId" = tenant_company AND "active" = true ORDER BY "code" LIMIT 1;
  IF tenant_branch IS NULL THEN
    INSERT INTO "Branch" ("id", "companyId", "code", "name", "active")
    VALUES ('legacy-' || md5('vendaja-legacy-branch'), tenant_company, 'MATRIZ', 'Matriz', true) RETURNING "id" INTO tenant_branch;
  END IF;
  UPDATE "Product" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "Customer" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "Sale" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "Supplier" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "Expense" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "Purchase" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "CashSession" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
  UPDATE "CommercialDocument" SET "companyId" = tenant_company, "branchId" = tenant_branch WHERE "companyId" IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Product_companyId_branchId_active_idx" ON "Product" ("companyId", "branchId", "active");
CREATE INDEX IF NOT EXISTS "Customer_companyId_branchId_active_idx" ON "Customer" ("companyId", "branchId", "active");
CREATE INDEX IF NOT EXISTS "Sale_companyId_branchId_createdAt_idx" ON "Sale" ("companyId", "branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "Supplier_companyId_branchId_active_idx" ON "Supplier" ("companyId", "branchId", "active");
CREATE INDEX IF NOT EXISTS "Expense_companyId_branchId_expenseDate_idx" ON "Expense" ("companyId", "branchId", "expenseDate");
CREATE INDEX IF NOT EXISTS "Purchase_companyId_branchId_purchasedAt_idx" ON "Purchase" ("companyId", "branchId", "purchasedAt");
CREATE INDEX IF NOT EXISTS "CashSession_companyId_branchId_closedAt_idx" ON "CashSession" ("companyId", "branchId", "closedAt");
CREATE INDEX IF NOT EXISTS "CommercialDocument_companyId_branchId_createdAt_idx" ON "CommercialDocument" ("companyId", "branchId", "createdAt");
