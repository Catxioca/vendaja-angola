ALTER TABLE "Supplier"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "code" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Supplier_nif_key" ON "Supplier"("nif");
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "operatorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
  "subtotalCents" INTEGER NOT NULL,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "taxCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL,
  "documentNumber" TEXT,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "notes" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Purchase_number_key" ON "Purchase"("number");
CREATE UNIQUE INDEX "Purchase_idempotencyKey_key" ON "Purchase"("idempotencyKey");
CREATE INDEX "Purchase_supplierId_purchasedAt_idx" ON "Purchase"("supplierId","purchasedAt");

CREATE TABLE "PurchaseLine" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCostCents" INTEGER NOT NULL,
  "taxRate" DECIMAL(5,4) NOT NULL,
  "totalCents" INTEGER NOT NULL,
  CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseLine_purchaseId_idx" ON "PurchaseLine"("purchaseId");

CREATE TABLE "AccountPayable" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "originalCents" INTEGER NOT NULL,
  "paidCents" INTEGER NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountPayable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountPayable_purchaseId_key" ON "AccountPayable"("purchaseId");
CREATE INDEX "AccountPayable_supplierId_status_idx" ON "AccountPayable"("supplierId","status");

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
