CREATE TABLE "Employee" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "nif" TEXT,
  "inss" TEXT,
  "position" TEXT NOT NULL,
  "department" TEXT,
  "contractType" TEXT NOT NULL DEFAULT 'FIXED',
  "iban" TEXT,
  "baseSalaryCents" INTEGER NOT NULL,
  "foodAllowanceCents" INTEGER NOT NULL DEFAULT 0,
  "transportAllowanceCents" INTEGER NOT NULL DEFAULT 0,
  "housingAllowanceCents" INTEGER NOT NULL DEFAULT 0,
  "otherAllowancesCents" INTEGER NOT NULL DEFAULT 0,
  "foodAllowanceExempt" BOOLEAN NOT NULL DEFAULT true,
  "transportAllowanceExempt" BOOLEAN NOT NULL DEFAULT true,
  "housingAllowanceExempt" BOOLEAN NOT NULL DEFAULT false,
  "otherAllowancesExempt" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Employee_nif_key" ON "Employee"("nif");
CREATE UNIQUE INDEX "Employee_inss_key" ON "Employee"("inss");

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "category" TEXT,
  "parentCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

CREATE TABLE "Payroll" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "salaryBaseCents" INTEGER NOT NULL,
  "foodAllowanceCents" INTEGER NOT NULL DEFAULT 0,
  "transportAllowanceCents" INTEGER NOT NULL DEFAULT 0,
  "housingAllowanceCents" INTEGER NOT NULL DEFAULT 0,
  "otherAllowancesCents" INTEGER NOT NULL DEFAULT 0,
  "taxableAllowancesCents" INTEGER NOT NULL DEFAULT 0,
  "grossSalaryCents" INTEGER NOT NULL,
  "irtCents" INTEGER NOT NULL DEFAULT 0,
  "inssEmployeeCents" INTEGER NOT NULL DEFAULT 0,
  "inssEmployerCents" INTEGER NOT NULL DEFAULT 0,
  "netSalaryCents" INTEGER NOT NULL,
  "payDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payroll_employeeId_month_key" ON "Payroll"("employeeId", "month");
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JournalEntry" (
  "id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "debitAccountId" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "journalType" TEXT NOT NULL DEFAULT 'GENERAL',
  "documentType" TEXT NOT NULL DEFAULT 'MANUAL',
  "documentNumber" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_debitAccountId_fkey"
  FOREIGN KEY ("debitAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_creditAccountId_fkey"
  FOREIGN KEY ("creditAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Journal" (
  "id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "journalType" TEXT NOT NULL DEFAULT 'GENERAL',
  "documentType" TEXT NOT NULL DEFAULT 'MANUAL',
  "documentNumber" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JournalLine" (
  "id" TEXT NOT NULL,
  "journalId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "description" TEXT,
  "debitCents" INTEGER NOT NULL DEFAULT 0,
  "creditCents" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Journal_entryDate_idx" ON "Journal"("entryDate");
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX "JournalLine_journalId_idx" ON "JournalLine"("journalId");
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
