CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "nif" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Company_nif_key" ON "Company"("nif");
CREATE TABLE "Branch" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId","code");
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "CompanyMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "role" TEXT NOT NULL,
  "modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompanyMembership_userId_companyId_branchId_key" ON "CompanyMembership"("userId","companyId","branchId");
CREATE INDEX "CompanyMembership_companyId_branchId_active_idx" ON "CompanyMembership"("companyId","branchId","active");
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "CashRegister" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashRegister_branchId_code_key" ON "CashRegister"("branchId","code");
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "PosShift" (
  "id" TEXT NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingCents" INTEGER NOT NULL,
  "closedAt" TIMESTAMP(3),
  "closingCents" INTEGER,
  "declaredCents" INTEGER,
  "differenceCents" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  CONSTRAINT "PosShift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PosShift_cashRegisterId_status_idx" ON "PosShift"("cashRegisterId","status");
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "BankAccount" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "name" TEXT NOT NULL,
  "iban" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'AOA',
  "openingBalanceCents" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankAccount_companyId_iban_key" ON "BankAccount"("companyId","iban");
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "BankStatement" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "referenceHash" TEXT NOT NULL,
  "statementDate" TIMESTAMP(3) NOT NULL,
  "openingBalanceCents" INTEGER NOT NULL,
  "closingBalanceCents" INTEGER NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankStatement_referenceHash_key" ON "BankStatement"("referenceHash");
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "BankStatementLine" (
  "id" TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "lineHash" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "reconciledAt" TIMESTAMP(3),
  "reconciledBy" TEXT,
  CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankStatementLine_lineHash_key" ON "BankStatementLine"("lineHash");
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "PaymentTerminal" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "code" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "config" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "PaymentTerminal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentTerminal_companyId_code_key" ON "PaymentTerminal"("companyId","code");
ALTER TABLE "PaymentTerminal" ADD CONSTRAINT "PaymentTerminal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "terminalId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "externalReference" TEXT,
  "amountCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "operation" TEXT NOT NULL DEFAULT 'SALE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentTransaction_idempotencyKey_key" ON "PaymentTransaction"("idempotencyKey");
CREATE INDEX "PaymentTransaction_terminalId_createdAt_idx" ON "PaymentTransaction"("terminalId","createdAt");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "PaymentTerminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ReprintLog" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "branchId" TEXT,
  "documentType" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReprintLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReprintLog_companyId_documentType_documentId_idx" ON "ReprintLog"("companyId","documentType","documentId");
ALTER TABLE "Warehouse" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN "branchId" TEXT;
CREATE INDEX "Warehouse_companyId_branchId_idx" ON "Warehouse"("companyId","branchId");
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD COLUMN "companyId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "branchId" TEXT;
ALTER TABLE "SyncMutation" ADD COLUMN "companyId" TEXT;
ALTER TABLE "SyncMutation" ADD COLUMN "branchId" TEXT;
ALTER TABLE "SyncMutation" ADD COLUMN "userId" TEXT;
CREATE INDEX "SyncMutation_companyId_branchId_userId_idx" ON "SyncMutation"("companyId","branchId","userId");
