ALTER TABLE "Customer"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "creditLimitCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outstandingDebtCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Sale"
  ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
  ADD COLUMN "dueDate" TIMESTAMP(3);

CREATE TABLE "ReceivablePayment" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
  "idempotencyKey" TEXT NOT NULL,
  "cashSessionId" TEXT,
  "operatorId" TEXT,
  "note" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceivablePayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReceivablePayment_idempotencyKey_key" ON "ReceivablePayment"("idempotencyKey");
CREATE INDEX "ReceivablePayment_customerId_receivedAt_idx" ON "ReceivablePayment"("customerId", "receivedAt");
ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
