-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "sangriaCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suprimentoCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FiscalConfig" ADD COLUMN     "invoiceSeries" TEXT NOT NULL DEFAULT 'A';
