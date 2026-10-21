-- CreateTable: BiDashboard
CREATE TABLE "BiDashboard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT NOT NULL DEFAULT 'EXECUTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "layoutJson" TEXT,
    "widgetsJson" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BiAlertRule
CREATE TABLE "BiAlertRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "department" TEXT NOT NULL DEFAULT 'EXECUTIVE',
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "notifyEmail" BOOLEAN NOT NULL DEFAULT false,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiAlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BiAlertEvent
CREATE TABLE "BiAlertEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT,
    "metric" TEXT NOT NULL,
    "actualValue" DOUBLE PRECISION NOT NULL,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BiKpiSnapshot
CREATE TABLE "BiKpiSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "granularity" TEXT NOT NULL DEFAULT 'DAY',
    "revenueCents" BIGINT NOT NULL DEFAULT 0,
    "netRevenueCents" BIGINT NOT NULL DEFAULT 0,
    "costCents" BIGINT NOT NULL DEFAULT 0,
    "marginCents" BIGINT NOT NULL DEFAULT 0,
    "expensesCents" BIGINT NOT NULL DEFAULT 0,
    "ebitdaCents" BIGINT NOT NULL DEFAULT 0,
    "netProfitCents" BIGINT NOT NULL DEFAULT 0,
    "cashflowCents" BIGINT NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "activeCustomers" INTEGER NOT NULL DEFAULT 0,
    "stockValuationCents" BIGINT NOT NULL DEFAULT 0,
    "payrollCostCents" BIGINT NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiKpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "BiDashboard_companyId_department_idx" ON "BiDashboard"("companyId", "department");
CREATE INDEX "BiAlertRule_companyId_active_idx" ON "BiAlertRule"("companyId", "active");
CREATE INDEX "BiAlertEvent_companyId_acknowledged_createdAt_idx" ON "BiAlertEvent"("companyId", "acknowledged", "createdAt");
CREATE UNIQUE INDEX "BiKpiSnapshot_companyId_branchId_date_granularity_key" ON "BiKpiSnapshot"("companyId", "branchId", "date", "granularity");
CREATE INDEX "BiKpiSnapshot_companyId_date_idx" ON "BiKpiSnapshot"("companyId", "date");

-- AddForeignKey
ALTER TABLE "BiAlertEvent" ADD CONSTRAINT "BiAlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BiAlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
