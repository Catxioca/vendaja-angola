CREATE TABLE "AccountingPeriod" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingPeriod_startsAt_endsAt_key" ON "AccountingPeriod"("startsAt", "endsAt");
CREATE INDEX "AccountingPeriod_status_startsAt_endsAt_idx" ON "AccountingPeriod"("status", "startsAt", "endsAt");

CREATE TABLE "TaxRule" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DECIMAL(5,4) NOT NULL,
  "exemptionCode" TEXT,
  "outputAccountId" TEXT,
  "inputAccountId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaxRule_code_key" ON "TaxRule"("code");
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_outputAccountId_fkey" FOREIGN KEY ("outputAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_inputAccountId_fkey" FOREIGN KEY ("inputAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Journal" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "Journal" ADD COLUMN "periodId" TEXT;
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Journal_periodId_idx" ON "Journal"("periodId");
CREATE UNIQUE INDEX "Journal_sourceType_sourceId_key" ON "Journal"("sourceType", "sourceId");
