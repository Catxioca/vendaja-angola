export type CommercialPlan = "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE" | "CUSTOM";

export type LicenseTierType = "PRODUCT" | "MODULAR" | "COMBINED";

export type CanonicalLicenseState =
  | "VALID"
  | "EXPIRED"
  | "REVOKED"
  | "INCOMPATIBLE"
  | "NO_CONNECTIVITY"
  | "OFFLINE_GRACE_PERIOD";

export type LicensePayload = {
  version: number;
  licenseId: string;
  type?: LicenseTierType;
  company?: string;
  nif: string;
  hardwareId: string;
  plan?: CommercialPlan;
  startsAt: string;
  expiresAt: string;
  modules: string[];
  gracePeriodDays?: number;
  requiresHeartbeat?: boolean;
  limits?: {
    maxTerminals?: number;
    maxUsers?: number;
  };
  issuedAt?: string;
};

export interface ModuleLicenseDetail {
  code: string;
  name: string;
  category: string;
  licensed: boolean;
  activatedAt?: string;
  expiresAt?: string;
  daysRemaining?: number;
  source?: string;
}

export interface ProductLicenseInfo {
  active: boolean;
  hardwareId: string;
  company?: string;
  nif?: string;
  edition?: string;
  startsAt?: string;
  expiresAt?: string;
  daysRemaining?: number;
  gracePeriodDaysRemaining?: number;
  status: "ACTIVE" | "EXPIRED" | "NOT_ACTIVATED" | "TAMPERED" | "REVOKED" | "INCOMPATIBLE" | "NO_CONNECTIVITY" | "OFFLINE_GRACE_PERIOD";
  canonicalState?: CanonicalLicenseState;
}

export interface ModularLicenseInfo {
  totalModulesCount: number;
  licensedModulesCount: number;
  lockedModulesCount: number;
  modules: ModuleLicenseDetail[];
}

export interface LicenseAuditLogEntry {
  id: string;
  timestamp: string;
  event:
    | "PRODUCT_ACTIVATED"
    | "MODULE_ACTIVATED"
    | "MODULE_BLOCKED_ATTEMPT"
    | "LICENSE_INVALID"
    | "LICENSE_EXPIRED";
  details: string;
  actor?: string;
}

export type LicenseStatus = {
  valid: boolean;
  state?: CanonicalLicenseState;
  reason?: string;
  hardwareId: string;
  expiresAt?: string;
  startsAt?: string;
  nif?: string;
  company?: string;
  plan?: CommercialPlan;
  modules?: string[];
  daysRemaining?: number;
  gracePeriodDaysRemaining?: number;
  expiryTier?: "valid" | "expiring_soon" | "critical" | "urgent" | "expired";
  limits?: {
    maxTerminals?: number;
    maxUsers?: number;
  };
  productLicense?: ProductLicenseInfo;
  modularLicense?: ModularLicenseInfo;
  auditLog?: LicenseAuditLogEntry[];
};

declare global {
  type CanonicalLicenseState =
    | "VALID"
    | "EXPIRED"
    | "REVOKED"
    | "INCOMPATIBLE"
    | "NO_CONNECTIVITY"
    | "OFFLINE_GRACE_PERIOD";
  type LicenseStatus = {
    valid: boolean;
    state?: CanonicalLicenseState;
    reason?: string;
    hardwareId: string;
    expiresAt?: string;
    startsAt?: string;
    nif?: string;
    company?: string;
    plan?: "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE" | "CUSTOM";
    modules?: string[];
    daysRemaining?: number;
    gracePeriodDaysRemaining?: number;
    expiryTier?: "valid" | "expiring_soon" | "critical" | "urgent" | "expired";
    limits?: {
      maxTerminals?: number;
      maxUsers?: number;
    };
    productLicense?: ProductLicenseInfo;
    modularLicense?: ModularLicenseInfo;
    auditLog?: LicenseAuditLogEntry[];
  };
  type CommercialPlan = "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE" | "CUSTOM";
  interface Window {
    pos?: {
      version?: string;
      printHtmlDocument?: (
        html: string,
        options?: {
          printerName?: string;
          silent?: boolean;
          copies?: number;
          format?: string;
          paperWidthMm?: number;
        }
      ) => Promise<{ success: boolean; failureReason?: string }>;
      exportPdfDocument?: (
        title: string,
        html: string,
        options?: { format?: string; defaultPath?: string }
      ) => Promise<{ saved: boolean; filePath?: string; error?: string }>;
      savePrintDebugDump?: (
        docNumber: string,
        html: string,
        meta?: any
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      saveInvoicePdf?: (title: string, format?: string) => Promise<{ saved: boolean; filePath?: string }>;
      printDocument?: (options?: {
        deviceName?: string;
        silent?: boolean;
        copies?: number;
        pageSize?: string;
      }) => Promise<{ success: boolean; failureReason?: string }>;
      getPrinters?: () => Promise<Array<{ name: string; displayName?: string; isDefault?: boolean; status?: number }>>;
      getLicenseStatus?: () => Promise<LicenseStatus>;
      getHardwareId?: () => Promise<string>;
      activateLicense?: (token: string, targetType?: LicenseTierType | "AUTO") => Promise<LicenseStatus>;
      logLicenseAudit?: (event: string, details: string) => Promise<boolean>;
      getServerConfig?: () => Promise<any>;
      saveServerConfig?: (config: any) => Promise<any>;
      testServerConnection?: (apiUrl: string) => Promise<any>;
      checkLiveUpdates?: (apiUrl?: string) => Promise<any>;
      syncLiveConfig?: (apiUrl?: string) => Promise<any>;
      copilotQuery?: (payload: { query: string; contextModule?: string; token?: string; apiUrl?: string }) => Promise<{ success: boolean; result?: any; isOffline?: boolean; error?: string; statusCode?: number }>;
      copilotStatus?: (apiUrl?: string) => Promise<{ online: boolean; reason?: string; service?: string; databaseConnected?: boolean }>;
    };
  }
}
