ALTER TABLE "PosShift" ADD COLUMN "expectedCents" INTEGER;
ALTER TABLE "BankStatementLine" ADD COLUMN "reconciliationReference" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "shiftId" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "saleId" TEXT;
CREATE INDEX "PaymentTransaction_shiftId_status_idx" ON "PaymentTransaction"("shiftId","status");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
