-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "biometricConsentGiven" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "biometricRefId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "integrityHash" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollRectification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "rectificationNumber" TEXT NOT NULL,
    "adjustmentCents" INTEGER NOT NULL,
    "originalNetSalaryCents" INTEGER NOT NULL,
    "adjustedNetSalaryCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "integrityHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRectification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollSnapshot_payrollId_key" ON "PayrollSnapshot"("payrollId");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollSnapshot_companyId_payrollId_key" ON "PayrollSnapshot"("companyId", "payrollId");
CREATE INDEX IF NOT EXISTS "PayrollSnapshot_companyId_month_idx" ON "PayrollSnapshot"("companyId", "month");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRectification_companyId_rectificationNumber_key" ON "PayrollRectification"("companyId", "rectificationNumber");
CREATE INDEX IF NOT EXISTS "PayrollRectification_companyId_payrollId_idx" ON "PayrollRectification"("companyId", "payrollId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PayrollSnapshot_payrollId_fkey'
    ) THEN
        ALTER TABLE "PayrollSnapshot" ADD CONSTRAINT "PayrollSnapshot_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PayrollRectification_payrollId_fkey'
    ) THEN
        ALTER TABLE "PayrollRectification" ADD CONSTRAINT "PayrollRectification_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PayrollRectification_snapshotId_fkey'
    ) THEN
        ALTER TABLE "PayrollRectification" ADD CONSTRAINT "PayrollRectification_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PayrollSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Triggers for Database-Level Immutability and Append-Only Integrity
CREATE OR REPLACE FUNCTION prevent_payroll_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'PayrollSnapshot is strictly immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payroll_snapshot_immutable ON "PayrollSnapshot";
CREATE TRIGGER trg_payroll_snapshot_immutable
BEFORE UPDATE OR DELETE ON "PayrollSnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_payroll_snapshot_mutation();

CREATE OR REPLACE FUNCTION prevent_payroll_rectification_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'PayrollRectification is strictly append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payroll_rectification_immutable ON "PayrollRectification";
CREATE TRIGGER trg_payroll_rectification_immutable
BEFORE UPDATE OR DELETE ON "PayrollRectification"
FOR EACH ROW EXECUTE FUNCTION prevent_payroll_rectification_mutation();
