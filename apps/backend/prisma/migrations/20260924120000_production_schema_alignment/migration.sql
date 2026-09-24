ALTER TABLE "Customer" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Sale"
  ADD COLUMN "cardCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cashCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cashSessionId" TEXT,
  ADD COLUMN "transferCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Supplier" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER INDEX "DocumentSeries_companyKey_establishmentKey_documentType_prefix_"
  RENAME TO "DocumentSeries_companyKey_establishmentKey_documentType_pre_key";
