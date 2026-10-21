-- CreateTable CrmLead
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "title" TEXT NOT NULL,
    "companyName" TEXT,
    "contactName" TEXT NOT NULL,
    "nif" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "segment" TEXT,
    "potentialValueCents" BIGINT NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "probabilityPercent" INTEGER NOT NULL DEFAULT 10,
    "source" TEXT,
    "assignedToUserId" TEXT,
    "notes" TEXT,
    "lostReason" TEXT,
    "convertedCustomerId" TEXT,
    "convertedOpportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable CrmOpportunity
CREATE TABLE "CrmOpportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "title" TEXT NOT NULL,
    "customerId" TEXT,
    "leadId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'OPPORTUNITY',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expectedRevenueCents" BIGINT NOT NULL DEFAULT 0,
    "probabilityPercent" INTEGER NOT NULL DEFAULT 20,
    "expectedCloseDate" TIMESTAMP(3),
    "assignedToUserId" TEXT,
    "tags" JSONB,
    "notes" TEXT,
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable CrmActivity
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CALL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "customerId" TEXT,
    "leadId" TEXT,
    "opportunityId" TEXT,
    "assignedToUserId" TEXT,
    "resultNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable CrmProposal
CREATE TABLE "CrmProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerId" TEXT,
    "leadId" TEXT,
    "opportunityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmountCents" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "validUntil" TIMESTAMP(3),
    "termsAndConditions" TEXT,
    "notes" TEXT,
    "items" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "convertedSaleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable CrmTicket
CREATE TABLE "CrmTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "ticketNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COMPLAINT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable EnterpriseDocument
CREATE TABLE "EnterpriseDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileExtension" TEXT NOT NULL DEFAULT 'pdf',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT NOT NULL,
    "tags" JSONB,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiryDate" TIMESTAMP(3),
    "checksumSha256" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable DocumentVersion
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "changeNotes" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "CrmProposal_number_key" ON "CrmProposal"("number");
CREATE UNIQUE INDEX "CrmTicket_ticketNumber_key" ON "CrmTicket"("ticketNumber");
CREATE UNIQUE INDEX "EnterpriseDocument_code_key" ON "EnterpriseDocument"("code");
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

CREATE INDEX "CrmLead_companyId_stage_status_idx" ON "CrmLead"("companyId", "stage", "status");
CREATE INDEX "CrmLead_companyId_assignedToUserId_idx" ON "CrmLead"("companyId", "assignedToUserId");
CREATE INDEX "CrmOpportunity_companyId_stage_status_idx" ON "CrmOpportunity"("companyId", "stage", "status");
CREATE INDEX "CrmOpportunity_companyId_customerId_idx" ON "CrmOpportunity"("companyId", "customerId");
CREATE INDEX "CrmActivity_companyId_scheduledAt_status_idx" ON "CrmActivity"("companyId", "scheduledAt", "status");
CREATE INDEX "CrmActivity_customerId_opportunityId_idx" ON "CrmActivity"("customerId", "opportunityId");
CREATE INDEX "CrmProposal_companyId_status_idx" ON "CrmProposal"("companyId", "status");
CREATE INDEX "CrmProposal_customerId_opportunityId_idx" ON "CrmProposal"("customerId", "opportunityId");
CREATE INDEX "CrmTicket_companyId_status_priority_idx" ON "CrmTicket"("companyId", "status", "priority");
CREATE INDEX "CrmTicket_customerId_status_idx" ON "CrmTicket"("customerId", "status");
CREATE INDEX "EnterpriseDocument_companyId_category_status_idx" ON "EnterpriseDocument"("companyId", "category", "status");
CREATE INDEX "EnterpriseDocument_relatedEntityType_relatedEntityId_idx" ON "EnterpriseDocument"("relatedEntityType", "relatedEntityId");
CREATE INDEX "DocumentVersion_documentId_createdAt_idx" ON "DocumentVersion"("documentId", "createdAt");

-- Foreign Keys
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmProposal" ADD CONSTRAINT "CrmProposal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CrmOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EnterpriseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
