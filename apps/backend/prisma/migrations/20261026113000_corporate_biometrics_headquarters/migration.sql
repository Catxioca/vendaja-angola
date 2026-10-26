-- AlterTable: Add isHeadquarters to Branch
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "isHeadquarters" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: AccessPerson
CREATE TABLE IF NOT EXISTS "AccessPerson" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "internalCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nif" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "photoUrl" TEXT,
    "department" TEXT,
    "category" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "employeeId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BiometricCredential
CREATE TABLE IF NOT EXISTS "BiometricCredential" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "identifier" TEXT,
    "biometricTemplate" TEXT,
    "qualityScore" INTEGER DEFAULT 100,
    "hardwareVendor" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "BiometricCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AccessDevice
CREATE TABLE IF NOT EXISTS "AccessDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TURNSTILE',
    "direction" TEXT NOT NULL DEFAULT 'ENTRY',
    "locationZone" TEXT NOT NULL DEFAULT 'RECEPTION',
    "ipAddress" TEXT,
    "port" INTEGER DEFAULT 4370,
    "protocol" TEXT NOT NULL DEFAULT 'SIMULATOR',
    "mqttTopic" TEXT,
    "relayPin" INTEGER,
    "relayPulseMs" INTEGER NOT NULL DEFAULT 3000,
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "lastPingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AccessRule
CREATE TABLE IF NOT EXISTS "AccessRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "daysOfWeek" TEXT NOT NULL DEFAULT 'ALL',
    "startTime" TEXT NOT NULL DEFAULT '00:00',
    "endTime" TEXT NOT NULL DEFAULT '23:59',
    "allowedZones" TEXT NOT NULL DEFAULT 'ALL',
    "requireSubscriptionValid" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AccessLog
CREATE TABLE IF NOT EXISTS "AccessLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "personId" TEXT,
    "personName" TEXT NOT NULL,
    "personCategory" TEXT,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ENTRY',
    "authMethod" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "denialReason" TEXT,
    "snapshotUrl" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AttendanceRecord
CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "personId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "breakOut" TIMESTAMP(3),
    "breakIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "syncedToPayroll" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GymSubscription
CREATE TABLE IF NOT EXISTS "GymSubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GymSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VisitorPass
CREATE TABLE IF NOT EXISTS "VisitorPass" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "hostEmployeeName" TEXT,
    "hostDepartment" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "purpose" TEXT,
    "badgeNumber" TEXT,
    "qrCodeToken" TEXT,
    "idDocNumber" TEXT,
    "entryTime" TIMESTAMP(3),
    "exitTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CorporateLivePatch
CREATE TABLE IF NOT EXISTS "CorporateLivePatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patchVersion" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetBranches" TEXT[] DEFAULT ARRAY['ALL']::TEXT[],
    "payloadJson" TEXT NOT NULL,
    "sha256Signature" TEXT NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateLivePatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CorporateBroadcast
CREATE TABLE IF NOT EXISTS "CorporateBroadcast" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "senderUserId" TEXT NOT NULL,
    "targetBranches" TEXT[] DEFAULT ARRAY['ALL']::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CorporateStoreStatus
CREATE TABLE IF NOT EXISTS "CorporateStoreStatus" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "isHeadquarters" BOOLEAN NOT NULL DEFAULT false,
    "online" BOOLEAN NOT NULL DEFAULT true,
    "lastPingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeUsersCount" INTEGER NOT NULL DEFAULT 0,
    "todaySalesCents" INTEGER NOT NULL DEFAULT 0,
    "todayDocumentsCount" INTEGER NOT NULL DEFAULT 0,
    "cashDrawerCents" INTEGER NOT NULL DEFAULT 0,
    "activeModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appVersion" TEXT NOT NULL DEFAULT '2.2.4',
    "hardwareId" TEXT,
    "terminalId" TEXT,
    "pendingSyncCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateStoreStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CorporateEventStream
CREATE TABLE IF NOT EXISTS "CorporateEventStream" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "actorName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateEventStream_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "AccessPerson_companyId_internalCode_key" ON "AccessPerson"("companyId", "internalCode");
CREATE INDEX IF NOT EXISTS "AccessPerson_companyId_category_status_idx" ON "AccessPerson"("companyId", "category", "status");
CREATE INDEX IF NOT EXISTS "AccessPerson_companyId_nif_idx" ON "AccessPerson"("companyId", "nif");

CREATE INDEX IF NOT EXISTS "BiometricCredential_personId_type_active_idx" ON "BiometricCredential"("personId", "type", "active");
CREATE INDEX IF NOT EXISTS "BiometricCredential_identifier_idx" ON "BiometricCredential"("identifier");

CREATE INDEX IF NOT EXISTS "AccessDevice_companyId_locationZone_status_idx" ON "AccessDevice"("companyId", "locationZone", "status");

CREATE INDEX IF NOT EXISTS "AccessRule_companyId_category_active_idx" ON "AccessRule"("companyId", "category", "active");

CREATE INDEX IF NOT EXISTS "AccessLog_companyId_timestamp_idx" ON "AccessLog"("companyId", "timestamp");
CREATE INDEX IF NOT EXISTS "AccessLog_companyId_granted_idx" ON "AccessLog"("companyId", "granted");
CREATE INDEX IF NOT EXISTS "AccessLog_personId_timestamp_idx" ON "AccessLog"("personId", "timestamp");

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_companyId_employeeId_date_key" ON "AttendanceRecord"("companyId", "employeeId", "date");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_companyId_date_status_idx" ON "AttendanceRecord"("companyId", "date", "status");

CREATE INDEX IF NOT EXISTS "GymSubscription_companyId_personId_status_idx" ON "GymSubscription"("companyId", "personId", "status");
CREATE INDEX IF NOT EXISTS "GymSubscription_companyId_endDate_idx" ON "GymSubscription"("companyId", "endDate");

CREATE INDEX IF NOT EXISTS "VisitorPass_companyId_status_idx" ON "VisitorPass"("companyId", "status");
CREATE INDEX IF NOT EXISTS "VisitorPass_companyId_validFrom_validUntil_idx" ON "VisitorPass"("companyId", "validFrom", "validUntil");

CREATE INDEX IF NOT EXISTS "CorporateLivePatch_companyId_patchVersion_idx" ON "CorporateLivePatch"("companyId", "patchVersion");
CREATE INDEX IF NOT EXISTS "CorporateLivePatch_companyId_status_idx" ON "CorporateLivePatch"("companyId", "status");

CREATE INDEX IF NOT EXISTS "CorporateBroadcast_companyId_priority_idx" ON "CorporateBroadcast"("companyId", "priority");
CREATE INDEX IF NOT EXISTS "CorporateBroadcast_companyId_createdAt_idx" ON "CorporateBroadcast"("companyId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CorporateStoreStatus_companyId_branchId_key" ON "CorporateStoreStatus"("companyId", "branchId");
CREATE INDEX IF NOT EXISTS "CorporateStoreStatus_companyId_online_idx" ON "CorporateStoreStatus"("companyId", "online");
CREATE INDEX IF NOT EXISTS "CorporateStoreStatus_companyId_lastPingAt_idx" ON "CorporateStoreStatus"("companyId", "lastPingAt");

CREATE INDEX IF NOT EXISTS "CorporateEventStream_companyId_eventType_idx" ON "CorporateEventStream"("companyId", "eventType");
CREATE INDEX IF NOT EXISTS "CorporateEventStream_companyId_createdAt_idx" ON "CorporateEventStream"("companyId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BiometricCredential_personId_fkey') THEN
    ALTER TABLE "BiometricCredential" ADD CONSTRAINT "BiometricCredential_personId_fkey" FOREIGN KEY ("personId") REFERENCES "AccessPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessLog_personId_fkey') THEN
    ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_personId_fkey" FOREIGN KEY ("personId") REFERENCES "AccessPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessLog_deviceId_fkey') THEN
    ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceRecord_personId_fkey') THEN
    ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "AccessPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GymSubscription_personId_fkey') THEN
    ALTER TABLE "GymSubscription" ADD CONSTRAINT "GymSubscription_personId_fkey" FOREIGN KEY ("personId") REFERENCES "AccessPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VisitorPass_personId_fkey') THEN
    ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_personId_fkey" FOREIGN KEY ("personId") REFERENCES "AccessPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
