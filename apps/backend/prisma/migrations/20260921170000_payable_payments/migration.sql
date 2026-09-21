CREATE TABLE "PayablePayment" (
  "id" TEXT NOT NULL,
  "payableId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'TRANSFER',
  "idempotencyKey" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "operatorId" TEXT,
  CONSTRAINT "PayablePayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayablePayment_idempotencyKey_key" ON "PayablePayment"("idempotencyKey");
CREATE INDEX "PayablePayment_payableId_paidAt_idx" ON "PayablePayment"("payableId","paidAt");
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "AccountPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
