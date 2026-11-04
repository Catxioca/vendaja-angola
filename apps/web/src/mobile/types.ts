export type MobileTab = "pos" | "products" | "stock" | "cash" | "more";

export type MobileFormFactor = "phone" | "tablet";
export type MobileOrientation = "portrait" | "landscape";

export type AuthState = "LOGGED_OUT" | "LOCKED" | "AUTHENTICATED";

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  authMethod?: "password" | "pin";
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TenantContext {
  companyId: string;
  branchId: string | null;
  companyName: string;
  branchName?: string;
  membershipId: string;
  role: string;
  terminalId: string;
  modules: string[];
}

export interface CompanyMembershipOption {
  id: string;
  companyId: string;
  branchId: string | null;
  role: string;
  company: {
    id: string;
    legalName: string;
    nif?: string | null;
  };
  branch?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export type MutationLifecycleState =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "RETRYABLE"
  | "REJECTED"
  | "CONFLICT";

export type OutboxOperation =
  | "CREATE"
  | "UPDATE"
  | "OPEN"
  | "CLOSE"
  | "ADJUSTMENT"
  | "SANGRIA"
  | "SUPRIMENTO";

export interface MobileOutboxItem {
  id: string;
  idempotencyKey: string;
  correlationId: string;
  entity: string;
  operation: OutboxOperation;
  companyId: string;
  branchId: string;
  userId: string;
  terminalId: string;
  payload: unknown;
  state: MutationLifecycleState;
  attempts: number;
  lastAttemptAt?: string;
  errorSanitized?: string | null;
  occurredAt: string;
}

export interface OutboxStatusSummary {
  total: number;
  pending: number;
  processing: number;
  retryable: number;
  rejected: number;
  conflict: number;
  sent: number;
}

export type PeripheralType =
  | "camera"
  | "bluetooth"
  | "hid"
  | "printer"
  | "scale"
  | "tpa"
  | "biometrics";

export type PeripheralStatus =
  | "funcional"
  | "mockavel"
  | "parcial"
  | "pendente"
  | "compativel_teclado_pendente_validacao";

export interface PeripheralInfo {
  type: PeripheralType;
  label: string;
  status: PeripheralStatus;
  description: string;
  permissionGranted?: boolean;
}
