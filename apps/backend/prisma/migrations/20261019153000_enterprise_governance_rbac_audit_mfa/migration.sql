-- Phase 2 Enterprise Security, Corporate Governance, RBAC, MFA, Sessions and Audit

-- 1. Extend AuditLog with forensically complete fields
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "roleId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "module" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "oldValue" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "newValue" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "deviceName" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "operatingSystem" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "browser" TEXT;

CREATE INDEX IF NOT EXISTS "AuditLog_companyId_module_action_idx" ON "AuditLog"("companyId", "module", "action");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- 2. Extend User with MFA, security policies and session tracking
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaRecoveryCodes" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHistory" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "trustedDevices" JSONB;

-- 3. Granular RBAC: Role, Permission, RolePermission, UserPermission
CREATE TABLE IF NOT EXISTS "Role" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Role_companyId_code_key" ON "Role"("companyId", "code");
CREATE INDEX IF NOT EXISTS "Role_companyId_idx" ON "Role"("companyId");

CREATE TABLE IF NOT EXISTS "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "screen" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Permission_code_key" ON "Permission"("code");

CREATE TABLE IF NOT EXISTS "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

CREATE TABLE IF NOT EXISTS "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermission_userId_permissionId_key" ON "UserPermission"("userId", "permissionId");

-- 4. Session Management: ActiveSession
CREATE TABLE IF NOT EXISTS "ActiveSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "deviceName" TEXT,
    "operatingSystem" TEXT,
    "browser" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActiveSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActiveSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ActiveSession_tokenHash_key" ON "ActiveSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "ActiveSession_userId_revokedAt_idx" ON "ActiveSession"("userId", "revokedAt");

-- 5. Corporate Security Policies
CREATE TABLE IF NOT EXISTS "SecurityPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "minPasswordLength" INTEGER NOT NULL DEFAULT 8,
    "requireUppercase" BOOLEAN NOT NULL DEFAULT true,
    "requireLowercase" BOOLEAN NOT NULL DEFAULT true,
    "requireNumbers" BOOLEAN NOT NULL DEFAULT true,
    "requireSpecialChars" BOOLEAN NOT NULL DEFAULT true,
    "passwordExpiryDays" INTEGER NOT NULL DEFAULT 90,
    "preventPasswordReuseCount" INTEGER NOT NULL DEFAULT 5,
    "maxFailedLogins" INTEGER NOT NULL DEFAULT 5,
    "lockoutDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "sessionInactivityMinutes" INTEGER NOT NULL DEFAULT 15,
    "mfaMandatoryRoles" JSONB,
    "ipWhitelist" JSONB,
    "allowedWorkingHoursStart" TEXT,
    "allowedWorkingHoursEnd" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SecurityPolicy_companyId_key" ON "SecurityPolicy"("companyId");

-- 6. Enterprise Backups: BackupRecord
CREATE TABLE IF NOT EXISTS "BackupRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "checksum" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BackupRecord_createdAt_idx" ON "BackupRecord"("createdAt");
