-- AlterTable / Create Phase 3 Tables
CREATE TABLE IF NOT EXISTS "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "module" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowState" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkflowState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "fromStateId" TEXT NOT NULL,
    "toStateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actionCode" TEXT NOT NULL,
    "requiredPermission" TEXT,
    "requiredRole" TEXT,
    "requiresComment" BOOLEAN NOT NULL DEFAULT false,
    "conditionScript" TEXT,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowApprovalRule" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "minValueCents" BIGINT NOT NULL DEFAULT 0,
    "maxValueCents" BIGINT,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "approverRole" TEXT NOT NULL,
    "approverUserId" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkflowApprovalRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowInstance" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "companyId" TEXT,
    "entityName" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "currentStateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "currentApprovalLevel" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "initiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowApprovalStep" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "requiredRole" TEXT,
    "requiredUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decisionById" TEXT,
    "delegatedToId" TEXT,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowApprovalStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowTimeline" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "comments" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTimeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseNotification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "category" TEXT NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InternalTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerEvent" TEXT NOT NULL,
    "conditionExpression" JSONB,
    "actionType" TEXT NOT NULL,
    "actionConfig" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationExecutionLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "companyId" TEXT,
    "triggerEvent" TEXT NOT NULL,
    "entityName" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "details" JSONB,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecutionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JobQueue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobQueue_pkey" PRIMARY KEY ("id")
);

-- Indexes and Constraints
CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowState_workflowId_code_key" ON "WorkflowState"("workflowId", "code");
CREATE INDEX IF NOT EXISTS "WorkflowDefinition_companyId_module_entityName_idx" ON "WorkflowDefinition"("companyId", "module", "entityName");
CREATE INDEX IF NOT EXISTS "WorkflowTransition_workflowId_actionCode_idx" ON "WorkflowTransition"("workflowId", "actionCode");
CREATE INDEX IF NOT EXISTS "WorkflowApprovalRule_workflowId_requiredLevel_idx" ON "WorkflowApprovalRule"("workflowId", "requiredLevel");
CREATE INDEX IF NOT EXISTS "WorkflowInstance_companyId_entityName_entityId_idx" ON "WorkflowInstance"("companyId", "entityName", "entityId");
CREATE INDEX IF NOT EXISTS "WorkflowInstance_status_idx" ON "WorkflowInstance"("status");
CREATE INDEX IF NOT EXISTS "WorkflowApprovalStep_instanceId_level_status_idx" ON "WorkflowApprovalStep"("instanceId", "level", "status");
CREATE INDEX IF NOT EXISTS "WorkflowTimeline_instanceId_createdAt_idx" ON "WorkflowTimeline"("instanceId", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterpriseNotification_companyId_userId_isRead_idx" ON "EnterpriseNotification"("companyId", "userId", "isRead");
CREATE INDEX IF NOT EXISTS "EnterpriseNotification_category_priority_idx" ON "EnterpriseNotification"("category", "priority");
CREATE INDEX IF NOT EXISTS "InternalTask_companyId_assignedToId_status_idx" ON "InternalTask"("companyId", "assignedToId", "status");
CREATE INDEX IF NOT EXISTS "InternalTask_relatedEntityType_relatedEntityId_idx" ON "InternalTask"("relatedEntityType", "relatedEntityId");
CREATE INDEX IF NOT EXISTS "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRule_companyId_triggerEvent_active_idx" ON "AutomationRule"("companyId", "triggerEvent", "active");
CREATE INDEX IF NOT EXISTS "AutomationExecutionLog_ruleId_executedAt_idx" ON "AutomationExecutionLog"("ruleId", "executedAt");
CREATE INDEX IF NOT EXISTS "JobQueue_companyId_status_idx" ON "JobQueue"("companyId", "status");
CREATE INDEX IF NOT EXISTS "JobQueue_type_status_idx" ON "JobQueue"("type", "status");
