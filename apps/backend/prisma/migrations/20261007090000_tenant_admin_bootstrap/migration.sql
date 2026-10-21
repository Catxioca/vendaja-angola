-- Additive tenant bootstrap claim. Existing companies keep their historic
-- memberships; the claim is only set when a bootstrap administrator is made.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "bootstrapAdminUserId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Company_bootstrapAdminUserId_key"
  ON "Company" ("bootstrapAdminUserId");

-- One atomic, installation-wide claim for public initial provisioning.
-- A populated installation is deliberately locked during migration: creating
-- additional companies remains an authenticated administrator operation.
CREATE TABLE IF NOT EXISTS "SystemBootstrap" (
  "id" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "companyId" TEXT,
  "userId" TEXT,
  CONSTRAINT "SystemBootstrap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemBootstrap_companyId_key" ON "SystemBootstrap" ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemBootstrap_userId_key" ON "SystemBootstrap" ("userId");
INSERT INTO "SystemBootstrap" ("id")
SELECT 'primary'
WHERE EXISTS (SELECT 1 FROM "Company")
ON CONFLICT ("id") DO NOTHING;
