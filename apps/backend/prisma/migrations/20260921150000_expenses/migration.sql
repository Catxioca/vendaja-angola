CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "supplierId" TEXT,
  "documentNumber" TEXT,
  "amountCents" INTEGER NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "operatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Expense_expenseDate_status_idx" ON "Expense"("expenseDate", "status");
CREATE INDEX "Expense_category_expenseDate_idx" ON "Expense"("category", "expenseDate");
CREATE INDEX "Expense_supplierId_expenseDate_idx" ON "Expense"("supplierId", "expenseDate");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
