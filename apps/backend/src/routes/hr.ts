import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  companyContext,
  requireAuth,
  requireCompanyContext,
  requireModuleAccess,
  requireRole,
  type AuthRequest,
} from "../middleware/auth.js";
import { audit, auditInContext } from "../services/security.js";

async function logHrAudit(
  tenant: { companyId: string; branchId: string | null },
  userId: string | undefined,
  action: string,
  entity: string,
  entityId: string,
  metadata?: unknown
) {
  try {
    return await auditInContext(action, tenant, userId || "system", entity, entityId, metadata);
  } catch {
    return await audit(action, userId, entity, entityId, metadata);
  }
}

export const REGULATORY_NOTICE =
  "Configurações laborais e remuneratórias sujeitas a fonte oficial e validação por profissional habilitado.";

export type HrConfigStatus = "ACTIVE" | "PENDING_APPROVAL" | "SUPERSEDED" | "REVOKED";

export interface HrPayrollConfig {
  version: string;
  source: string;
  responsibleParty: string;
  approvalDate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: HrConfigStatus;
  notes?: string | null;
  // Aliases retrocompatíveis
  effectiveDate: string;
  responsibleName: string;
  responsibleRole: string;
  officialSource: string;
  approvalReference: string;
  approvedAt: string;
  // Parâmetros tributários e laborais
  irtBrackets: Array<{ minCents: number; maxCents: number; rate: number }>;
  inssEmployeeRate: number;
  inssEmployerRate: number;
  allowanceExemptionCapCents: number;
  regulatoryNotice: string;
}

export const DEFAULT_HR_PAYROLL_CONFIG: HrPayrollConfig = {
  version: "2026.1",
  source: "Código do IRT / Regulamento do INSS / Lei Geral do Trabalho de Angola",
  responsibleParty: "Contabilista Certificado / Diretor de Recursos Humanos",
  approvalDate: "2026-01-01T00:00:00.000Z",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  status: "ACTIVE",
  notes: "Parametrização legal ativa e aprovada para o exercício 2026.",
  // Aliases
  effectiveDate: "2026-01-01",
  responsibleName: "Responsável Contabilístico / RH Certificado",
  responsibleRole: "Contabilista Certificado / Diretor de Recursos Humanos",
  officialSource: "Código do IRT / Regulamento do INSS / Lei Geral do Trabalho de Angola",
  approvalReference: "PARAM-RH-PADRAO-2026",
  approvedAt: "2026-01-01T00:00:00.000Z",
  irtBrackets: [
    { minCents: 0, maxCents: 500000, rate: 0 },
    { minCents: 500000, maxCents: 1500000, rate: 0.1 },
    { minCents: 1500000, maxCents: 3500000, rate: 0.15 },
    { minCents: 3500000, maxCents: 7000000, rate: 0.2 },
    { minCents: 7000000, maxCents: Number.POSITIVE_INFINITY, rate: 0.25 },
  ],
  inssEmployeeRate: 0.03,
  inssEmployerRate: 0.08,
  allowanceExemptionCapCents: 3_000_000,
  regulatoryNotice: REGULATORY_NOTICE,
};

export const hrConfigSchema = z
  .object({
    version: z.string().min(1).default("1.0.0"),
    source: z.string().min(2).max(300).optional(),
    responsibleParty: z.string().min(2).max(200).optional(),
    approvalDate: z.string().min(1).optional(),
    effectiveFrom: z.string().min(1).optional(),
    effectiveTo: z.string().nullable().optional(),
    status: z.enum(["ACTIVE", "PENDING_APPROVAL", "SUPERSEDED", "REVOKED"]).default("ACTIVE"),
    notes: z.string().max(500).nullable().optional(),
    // Legacy fields
    effectiveDate: z.string().optional(),
    responsibleName: z.string().min(2).max(160).optional(),
    responsibleRole: z.string().min(2).max(120).optional(),
    officialSource: z.string().min(2).max(200).optional(),
    approvalReference: z.string().min(2).max(100).optional(),
    approvedAt: z.string().optional(),
    // Financial brackets & rates
    irtBrackets: z
      .array(
        z.object({
          minCents: z.number().int().nonnegative(),
          maxCents: z
            .number()
            .nonnegative()
            .or(z.literal(Number.POSITIVE_INFINITY))
            .or(z.null())
            .transform((v) => v ?? Number.POSITIVE_INFINITY),
          rate: z.number().min(0).max(1),
        })
      )
      .min(1),
    inssEmployeeRate: z.number().min(0).max(0.5),
    inssEmployerRate: z.number().min(0).max(0.5),
    allowanceExemptionCapCents: z.number().int().nonnegative(),
  })
  .transform((data) => {
    const source = data.source || data.officialSource || "Código do IRT / Regulamento do INSS";
    const responsibleParty =
      data.responsibleParty ||
      (data.responsibleName ? `${data.responsibleName} (${data.responsibleRole || "Responsável"})` : "Responsável Técnico RH");
    const approvalDate = data.approvalDate || data.approvedAt || new Date().toISOString();
    const effectiveFrom = data.effectiveFrom || data.effectiveDate || new Date().toISOString().slice(0, 10);
    const effectiveTo = data.effectiveTo ?? null;

    return {
      version: data.version,
      source,
      responsibleParty,
      approvalDate,
      effectiveFrom,
      effectiveTo,
      status: data.status,
      notes: data.notes ?? null,
      effectiveDate: effectiveFrom,
      responsibleName: data.responsibleName || responsibleParty,
      responsibleRole: data.responsibleRole || "Responsável Autorizado",
      officialSource: source,
      approvalReference: data.approvalReference || `PARAM-${data.version}`,
      approvedAt: approvalDate,
      irtBrackets: data.irtBrackets,
      inssEmployeeRate: data.inssEmployeeRate,
      inssEmployerRate: data.inssEmployerRate,
      allowanceExemptionCapCents: data.allowanceExemptionCapCents,
      regulatoryNotice: REGULATORY_NOTICE,
    };
  });

export function validatePayrollConfigValidity(
  config: HrPayrollConfig,
  targetMonth: string
): { valid: boolean; reason?: string } {
  if (config.status !== "ACTIVE") {
    return {
      valid: false,
      reason: `Configuração remuneratória com estado '${config.status}'. Apenas configurações com estado 'ACTIVE' podem processar salários.`,
    };
  }

  if (!config.approvalDate || config.approvalDate.trim().length === 0) {
    return {
      valid: false,
      reason: "Configuração remuneratória carece de aprovação formal (approvalDate inexistente).",
    };
  }

  const targetPrefix = targetMonth.slice(0, 7); // "YYYY-MM"
  const effectiveFromPrefix = config.effectiveFrom.slice(0, 7);

  if (targetPrefix < effectiveFromPrefix) {
    return {
      valid: false,
      reason: `Mês de processamento (${targetMonth}) é anterior à vigência da configuração (${config.effectiveFrom}).`,
    };
  }

  if (config.effectiveTo) {
    const effectiveToPrefix = config.effectiveTo.slice(0, 7);
    if (targetPrefix > effectiveToPrefix) {
      return {
        valid: false,
        reason: `Mês de processamento (${targetMonth}) é posterior ao fim de vigência da configuração (${config.effectiveTo}).`,
      };
    }
  }

  return { valid: true };
}

export async function getCompanyPayrollConfig(companyId: string): Promise<HrPayrollConfig> {
  try {
    const integration = await prisma.integrationConfig.findUnique({
      where: { companyId_provider: { companyId, provider: "HR_PAYROLL_CONFIG" } },
    });
    if (integration && integration.config && typeof integration.config === "object") {
      const cfg = integration.config as Partial<HrPayrollConfig>;
      if (Array.isArray(cfg.irtBrackets) && typeof cfg.inssEmployeeRate === "number") {
        const version = cfg.version || "1.0.0";
        const source = cfg.source || cfg.officialSource || DEFAULT_HR_PAYROLL_CONFIG.source;
        const responsibleParty = cfg.responsibleParty || cfg.responsibleName || DEFAULT_HR_PAYROLL_CONFIG.responsibleParty;
        const approvalDate = cfg.approvalDate || cfg.approvedAt || DEFAULT_HR_PAYROLL_CONFIG.approvalDate;
        const effectiveFrom = cfg.effectiveFrom || cfg.effectiveDate || DEFAULT_HR_PAYROLL_CONFIG.effectiveFrom;
        const effectiveTo = cfg.effectiveTo !== undefined ? cfg.effectiveTo : null;
        const status = (cfg.status as HrConfigStatus) || (integration.status === "ACTIVE" ? "ACTIVE" : "PENDING_APPROVAL");
        const notes = cfg.notes || null;

        return {
          version,
          source,
          responsibleParty,
          approvalDate,
          effectiveFrom,
          effectiveTo,
          status,
          notes,
          effectiveDate: effectiveFrom,
          responsibleName: responsibleParty,
          responsibleRole: cfg.responsibleRole || "Responsável Autorizado",
          officialSource: source,
          approvalReference: cfg.approvalReference || `PARAM-${version}`,
          approvedAt: approvalDate,
          irtBrackets: cfg.irtBrackets,
          inssEmployeeRate: cfg.inssEmployeeRate,
          inssEmployerRate: typeof cfg.inssEmployerRate === "number" ? cfg.inssEmployerRate : DEFAULT_HR_PAYROLL_CONFIG.inssEmployerRate,
          allowanceExemptionCapCents:
            typeof cfg.allowanceExemptionCapCents === "number"
              ? cfg.allowanceExemptionCapCents
              : DEFAULT_HR_PAYROLL_CONFIG.allowanceExemptionCapCents,
          regulatoryNotice: REGULATORY_NOTICE,
        };
      }
    }
  } catch {
    // fallback caso a tabela esteja vazia
  }
  return { ...DEFAULT_HR_PAYROLL_CONFIG };
}

export function calculateIrt(
  taxableCents: number,
  brackets: Array<{ minCents: number; maxCents: number; rate: number }>
): number {
  let tax = 0;
  for (const bracket of brackets) {
    const taxableBase = Math.max(taxableCents - bracket.minCents, 0);
    const taxable = Math.min(taxableBase, bracket.maxCents - bracket.minCents);
    tax += taxable * bracket.rate;
  }
  return Math.round(tax);
}

export function calculatePayroll(
  employee: {
    baseSalaryCents: number;
    foodAllowanceCents: number;
    transportAllowanceCents: number;
    housingAllowanceCents: number;
    otherAllowancesCents: number;
    foodAllowanceExempt: boolean;
    transportAllowanceExempt: boolean;
    housingAllowanceExempt: boolean;
    otherAllowancesExempt: boolean;
  },
  config: HrPayrollConfig
) {
  const grossSalaryCents =
    employee.baseSalaryCents +
    employee.foodAllowanceCents +
    employee.transportAllowanceCents +
    employee.housingAllowanceCents +
    employee.otherAllowancesCents;

  const cap = config.allowanceExemptionCapCents;
  const foodTaxableCents = employee.foodAllowanceExempt
    ? Math.max(0, employee.foodAllowanceCents - cap)
    : employee.foodAllowanceCents;
  const transportTaxableCents = employee.transportAllowanceExempt
    ? Math.max(0, employee.transportAllowanceCents - cap)
    : employee.transportAllowanceCents;
  const taxableAllowancesCents =
    foodTaxableCents +
    transportTaxableCents +
    (employee.housingAllowanceExempt ? 0 : employee.housingAllowanceCents) +
    (employee.otherAllowancesExempt ? 0 : employee.otherAllowancesCents);

  const inssBaseCents = employee.baseSalaryCents + taxableAllowancesCents;
  const inssEmployeeCents = Math.round(inssBaseCents * config.inssEmployeeRate);
  const inssEmployerCents = Math.round(inssBaseCents * config.inssEmployerRate);
  const irtBaseCents = Math.max(0, inssBaseCents - inssEmployeeCents);
  const irtCents = calculateIrt(irtBaseCents, config.irtBrackets);
  const netSalaryCents = Math.max(0, grossSalaryCents - inssEmployeeCents - irtCents);

  return {
    grossSalaryCents,
    taxableAllowancesCents,
    inssEmployeeCents,
    inssEmployerCents,
    irtCents,
    netSalaryCents,
    regulatoryNotice: config.regulatoryNotice,
    configApprovalReference: config.approvalReference,
  };
}

export function getBiometricKeyRing(): { keys: Map<string, Buffer>; activeKeyId: string | null } {
  const keys = new Map<string, Buffer>();

  // 1. Check BIOMETRIC_KEYS or BIOMETRIC_KEY_RING (JSON ou comma-separated)
  const rawRing = process.env.BIOMETRIC_KEYS || process.env.BIOMETRIC_KEY_RING;
  if (rawRing && rawRing.trim()) {
    try {
      const parsed = JSON.parse(rawRing);
      if (typeof parsed === "object" && parsed !== null) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string" && v.trim()) {
            keys.set(k.trim(), crypto.createHash("sha256").update(v.trim()).digest());
          }
        }
      }
    } catch {
      for (const pair of rawRing.split(",")) {
        const [k, v] = pair.split(":");
        if (k && v && v.trim()) {
          keys.set(k.trim(), crypto.createHash("sha256").update(v.trim()).digest());
        }
      }
    }
  }

  // 2. Check BIOMETRIC_ENCRYPTION_KEY
  const singleKey = process.env.BIOMETRIC_ENCRYPTION_KEY;
  const activeIdEnv = process.env.BIOMETRIC_ACTIVE_KEY_ID || process.env.BIOMETRIC_KEY_ID;
  if (singleKey && singleKey.trim()) {
    const id = activeIdEnv?.trim() || "k1";
    if (!keys.has(id)) {
      keys.set(id, crypto.createHash("sha256").update(singleKey.trim()).digest());
    }
  }

  // 3. Fallback to FISCAL_CONFIG_KEY se o anel permanecer vazio
  const fiscalKey = process.env.FISCAL_CONFIG_KEY;
  if (keys.size === 0 && fiscalKey && fiscalKey.trim()) {
    const id = activeIdEnv?.trim() || "k1";
    keys.set(id, crypto.createHash("sha256").update(fiscalKey.trim()).digest());
  }

  let activeKeyId: string | null = null;
  if (activeIdEnv && keys.has(activeIdEnv.trim())) {
    activeKeyId = activeIdEnv.trim();
  } else if (keys.size > 0) {
    activeKeyId = Array.from(keys.keys())[0] ?? null;
  }

  return { keys, activeKeyId };
}

export function encryptBiometricRef(plainText: string, forcedKeyId?: string): string {
  if (!plainText) return plainText;
  const { keys, activeKeyId } = getBiometricKeyRing();
  const keyId = forcedKeyId || activeKeyId;
  if (!keyId || !keys.has(keyId)) {
    throw new Error("BIOMETRIC_KEY_NOT_CONFIGURED: Chave de cifragem biométrica não configurada no ambiente.");
  }
  const key = keys.get(keyId)!;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `enc:v2:${keyId}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decryptBiometricRef(
  cipherText: string | null | undefined,
  onAudit?: (meta: { keyId: string; version: string }) => void
): string | null {
  if (!cipherText) return null;

  if (cipherText.startsWith("enc:v2:")) {
    const parts = cipherText.split(":");
    if (parts.length !== 6) return null;
    const [, , keyId, ivBase64, authTagBase64, encBase64] = parts;
    if (!keyId || !ivBase64 || !authTagBase64 || !encBase64) return null;
    const { keys } = getBiometricKeyRing();
    const key = keys.get(keyId);
    if (!key) return null;
    try {
      const iv = Buffer.from(ivBase64, "base64");
      const authTag = Buffer.from(authTagBase64, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = decipher.update(encBase64, "base64", "utf8") + decipher.final("utf8");
      onAudit?.({ keyId, version: "v2" });
      return decrypted;
    } catch {
      return null;
    }
  }

  if (cipherText.startsWith("enc:v1:")) {
    const parts = cipherText.split(":");
    if (parts.length !== 5) return null;
    const [, , ivBase64, authTagBase64, encBase64] = parts;
    if (!ivBase64 || !authTagBase64 || !encBase64) return null;
    const { keys } = getBiometricKeyRing();
    if (keys.size === 0) return null;
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    for (const [keyId, key] of keys.entries()) {
      try {
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = decipher.update(encBase64, "base64", "utf8") + decipher.final("utf8");
        onAudit?.({ keyId, version: "v1" });
        return decrypted;
      } catch {
        continue;
      }
    }
    return null;
  }

  return cipherText;
}

export function computeConfigHash(config: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function computeSnapshotHash(data: {
  companyId: string;
  payrollId: string;
  month: string;
  version: string;
  configSnapshot: unknown;
  configHash?: string;
  closedAt: string;
  closedBy: string;
}): string {
  const configHash =
    data.configHash ||
    (data.configSnapshot && typeof data.configSnapshot === "object" && "configHash" in (data.configSnapshot as any)
      ? (data.configSnapshot as any).configHash
      : computeConfigHash(data.configSnapshot));

  const canonical = JSON.stringify({
    closedAt: data.closedAt,
    closedBy: data.closedBy,
    companyId: data.companyId,
    configHash,
    configSnapshot: data.configSnapshot,
    month: data.month,
    payrollId: data.payrollId,
    version: data.version,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function computeRectificationHash(data: {
  companyId: string;
  payrollId: string;
  snapshotId: string;
  rectificationNumber: string;
  adjustmentCents: number;
  originalNetSalaryCents: number;
  adjustedNetSalaryCents: number;
  reason: string;
  createdBy: string;
}): string {
  const canonical = JSON.stringify({
    adjustedNetSalaryCents: data.adjustedNetSalaryCents,
    adjustmentCents: data.adjustmentCents,
    companyId: data.companyId,
    createdBy: data.createdBy,
    originalNetSalaryCents: data.originalNetSalaryCents,
    payrollId: data.payrollId,
    reason: data.reason,
    rectificationNumber: data.rectificationNumber,
    snapshotId: data.snapshotId,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function sanitizeEmployeeForRole(employee: any, userRole: string) {
  const isHrAuthorized = ["ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"].includes((userRole || "").toUpperCase());
  if (isHrAuthorized) {
    return employee;
  }
  return {
    ...employee,
    biometricRefId: null,
    biometricConsentGiven: false,
  };
}

export async function getEmployeeBiometricState(
  companyId: string,
  employeeId: string
): Promise<{ biometricConsentGiven: boolean; biometricRefId: string | null; keyId?: string }> {
  try {
    let capturedKeyId: string | undefined;
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { biometricConsentGiven: true, biometricRefId: true },
    });
    if (emp && (emp.biometricConsentGiven || emp.biometricRefId)) {
      const decrypted = decryptBiometricRef(emp.biometricRefId, (meta) => {
        capturedKeyId = meta.keyId;
      });
      return {
        biometricConsentGiven: Boolean(emp.biometricConsentGiven),
        biometricRefId: decrypted,
        keyId: capturedKeyId,
      };
    }
    const record = await prisma.integrationConfig.findUnique({
      where: {
        companyId_provider: {
          companyId,
          provider: `HR_BIO_${employeeId}`,
        },
      },
    });
    if (record && record.config && typeof record.config === "object") {
      const cfg = record.config as any;
      const decrypted = decryptBiometricRef(cfg.biometricRefId, (meta) => {
        capturedKeyId = meta.keyId;
      });
      return {
        biometricConsentGiven: Boolean(cfg.biometricConsentGiven),
        biometricRefId: decrypted || null,
        keyId: capturedKeyId,
      };
    }
  } catch {
    // fallback
  }
  return { biometricConsentGiven: false, biometricRefId: null };
}

export async function saveEmployeeBiometricState(
  companyId: string,
  employeeId: string,
  state: { biometricConsentGiven: boolean; biometricRefId: string | null },
  userId?: string
) {
  const encryptedRefId = state.biometricRefId ? encryptBiometricRef(state.biometricRefId) : null;
  await Promise.all([
    prisma.employee.update({
      where: { id: employeeId },
      data: {
        biometricConsentGiven: state.biometricConsentGiven,
        biometricRefId: encryptedRefId,
      },
    }),
    prisma.integrationConfig.upsert({
      where: {
        companyId_provider: {
          companyId,
          provider: `HR_BIO_${employeeId}`,
        },
      },
      update: {
        config: {
          biometricConsentGiven: state.biometricConsentGiven,
          biometricRefId: encryptedRefId,
        } as any,
        status: state.biometricConsentGiven ? "ACTIVE" : "INACTIVE",
        updatedAt: new Date(),
      },
      create: {
        companyId,
        provider: `HR_BIO_${employeeId}`,
        name: `Consentimento Biométrico - Colaborador ${employeeId}`,
        config: {
          biometricConsentGiven: state.biometricConsentGiven,
          biometricRefId: encryptedRefId,
        } as any,
        status: state.biometricConsentGiven ? "ACTIVE" : "INACTIVE",
        createdById: userId,
      },
    }),
  ]);
}

export const employeeSchema = z
  .object({
    fullName: z.string().min(2).max(160),
    nif: z.string().max(20).optional().nullable(),
    inss: z.string().max(30).optional().nullable(),
    position: z.string().min(1).max(120),
    department: z.string().max(120).optional().nullable(),
    contractType: z.enum(["FIXED", "PART_TIME", "TEMPORARY", "INTERNSHIP"]).default("FIXED"),
    iban: z.string().max(50).optional().nullable(),
    baseSalaryCents: z.number().int().nonnegative(),
    foodAllowanceCents: z.number().int().nonnegative().default(0),
    transportAllowanceCents: z.number().int().nonnegative().default(0),
    housingAllowanceCents: z.number().int().nonnegative().default(0),
    otherAllowancesCents: z.number().int().nonnegative().default(0),
    foodAllowanceExempt: z.boolean().default(true),
    transportAllowanceExempt: z.boolean().default(true),
    housingAllowanceExempt: z.boolean().default(false),
    otherAllowancesExempt: z.boolean().default(false),
    active: z.boolean().optional(),
    branchId: z.string().optional().nullable(),
    // Proteção biométrica: consentimento explícito e token técnico de hardware, NUNCA biometria bruta
    biometricConsentGiven: z.boolean().optional().default(false),
    biometricRefId: z.string().max(100).optional().nullable(),
  })
  .catchall(z.unknown())
  .superRefine((data, ctx) => {
    const rawKeys = [
      "biometricTemplate",
      "rawBiometrics",
      "minutiae",
      "fingerprintRaw",
      "faceImage",
      "biometricRaw",
      "fingerprintTemplate",
      "faceTemplate",
      "rawTemplate",
    ];
    for (const key of rawKeys) {
      if ((data as any)[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Amostras biométricas brutas ou templates não podem ser armazenadas no sistema. Utilize apenas token técnico de hardware (biometricRefId) com consentimento explícito.",
          path: [key],
        });
      }
    }
  });

export const attendanceSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  workedMinutes: z.number().int().nonnegative().optional().default(0),
  overtimeMinutes: z.number().int().nonnegative().optional().default(0),
  delayMinutes: z.number().int().nonnegative().optional().default(0),
  status: z.enum(["PRESENT", "ABSENT_JUSTIFIED", "ABSENT_UNJUSTIFIED", "VACATION", "LEAVE", "LATE"]).default("PRESENT"),
});

export const leaveSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(["VACATION", "JUSTIFIED_ABSENCE", "MEDICAL", "MATERNITY_PATERNITY", "UNPAID_LEAVE"]).default("VACATION"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  daysCount: z.number().int().positive(),
  justification: z.string().max(500).optional().nullable(),
});

export const payrollSchema = z.object({
  employeeId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const hrRouter = Router();
hrRouter.use(requireAuth, requireCompanyContext);
hrRouter.use(requireModuleAccess("HR"));

// 1. CONFIGURAÇÃO DE REMUNERAÇÃO E ENCARGOS
hrRouter.get("/config", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const config = await getCompanyPayrollConfig(tenant.companyId);
  res.json(config);
});

hrRouter.put(
  "/config",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = hrConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_hr_config", details: parsed.error.flatten() });
      return;
    }

    const tenant = companyContext(req);
    const userId = (req as AuthRequest).user?.id;

    const payload: HrPayrollConfig = {
      ...parsed.data,
      regulatoryNotice: REGULATORY_NOTICE,
    };

    await prisma.integrationConfig.upsert({
      where: {
        companyId_provider: {
          companyId: tenant.companyId,
          provider: "HR_PAYROLL_CONFIG",
        },
      },
      update: {
        config: payload as any,
        updatedAt: new Date(),
        status: "ACTIVE",
      },
      create: {
        companyId: tenant.companyId,
        provider: "HR_PAYROLL_CONFIG",
        name: "Configuração de Remuneração e Encargos Laborais",
        config: payload as any,
        status: "ACTIVE",
        createdById: userId,
      },
    });

    await logHrAudit(tenant, userId, "HR_CONFIG_UPDATED", "HR_CONFIG", tenant.companyId, {
      responsibleName: payload.responsibleName,
      officialSource: payload.officialSource,
      approvalReference: payload.approvalReference,
      effectiveDate: payload.effectiveDate,
    });

    res.json(payload);
  }
);

// 2. DASHBOARD DE INDICADORES REAIS DE RH
hrRouter.get("/dashboard", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const userRole = ((req as AuthRequest).context?.role ?? (req as AuthRequest).user?.role ?? "").toUpperCase();

  // Se o perfil for MANAGER, restringe estritamente à sua filial
  const branchFilter =
    userRole === "ROLE_MANAGER" || userRole === "MANAGER"
      ? { branchId: tenant.branchId }
      : tenant.branchId
      ? { branchId: tenant.branchId }
      : {};

  const whereCompany = {
    companyId: tenant.companyId,
    ...branchFilter,
  };

  const [totalEmployees, activeEmployees, inactiveEmployees, allEmployees] = await Promise.all([
    prisma.employee.count({ where: whereCompany }),
    prisma.employee.count({ where: { ...whereCompany, active: true } }),
    prisma.employee.count({ where: { ...whereCompany, active: false } }),
    prisma.employee.findMany({
      where: { ...whereCompany, active: true },
      select: { department: true, position: true, baseSalaryCents: true },
    }),
  ]);

  const departments = new Set(allEmployees.map((e) => e.department).filter(Boolean));
  const positions = new Set(allEmployees.map((e) => e.position).filter(Boolean));
  const totalBaseSalaryCents = allEmployees.reduce((sum, e) => sum + e.baseSalaryCents, 0);

  // Folhas salariais do mês corrente
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthPayrolls = await prisma.payroll.findMany({
    where: {
      companyId: tenant.companyId,
      month: currentMonth,
      ...branchFilter,
    },
    select: {
      grossSalaryCents: true,
      netSalaryCents: true,
      inssEmployeeCents: true,
      inssEmployerCents: true,
      irtCents: true,
    },
  });

  const payrollTotals = currentMonthPayrolls.reduce(
    (acc, p) => ({
      grossSalaryCents: acc.grossSalaryCents + p.grossSalaryCents,
      netSalaryCents: acc.netSalaryCents + p.netSalaryCents,
      inssTotalCents: acc.inssTotalCents + p.inssEmployeeCents + p.inssEmployerCents,
      irtCents: acc.irtCents + p.irtCents,
    }),
    { grossSalaryCents: 0, netSalaryCents: 0, inssTotalCents: 0, irtCents: 0 }
  );

  res.json({
    companyId: tenant.companyId,
    branchId: tenant.branchId,
    currentMonth,
    totalEmployees,
    activeEmployees,
    inactiveEmployees,
    departmentsCount: departments.size,
    positionsCount: positions.size,
    departmentsList: Array.from(departments),
    positionsList: Array.from(positions),
    totalBaseSalaryCents,
    processedPayrollsCount: currentMonthPayrolls.length,
    currentMonthTotals: payrollTotals,
    regulatoryNotice: REGULATORY_NOTICE,
  });
});

// 3. GESTÃO DE COLABORADORES
hrRouter.get("/employees", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const userRole = ((req as AuthRequest).context?.role ?? (req as AuthRequest).user?.role ?? "").toUpperCase();

  const branchFilter =
    userRole === "ROLE_MANAGER" || userRole === "MANAGER"
      ? { branchId: tenant.branchId }
      : req.query.branchId
      ? { branchId: String(req.query.branchId) }
      : tenant.branchId
      ? { branchId: tenant.branchId }
      : {};

  const departmentFilter = req.query.department ? { department: String(req.query.department) } : {};
  const activeFilter = req.query.active !== undefined ? { active: req.query.active === "true" } : {};

  const employees = await prisma.employee.findMany({
    where: {
      companyId: tenant.companyId,
      ...branchFilter,
      ...departmentFilter,
      ...activeFilter,
    },
    orderBy: { fullName: "asc" },
  });

  const employeesWithBio = await Promise.all(
    employees.map(async (e) => {
      const bio = await getEmployeeBiometricState(tenant.companyId, e.id);
      return {
        ...e,
        biometricConsentGiven: bio.biometricConsentGiven,
        biometricRefId: bio.biometricRefId,
      };
    })
  );

  res.json(employeesWithBio.map((e) => sanitizeEmployeeForRole(e, userRole)));
});

hrRouter.get("/employees/:id", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const userRole = ((req as AuthRequest).context?.role ?? (req as AuthRequest).user?.role ?? "").toUpperCase();
  const userId = (req as AuthRequest).user?.id;

  const employee = await prisma.employee.findFirst({
    where: {
      id: String(req.params.id),
      companyId: tenant.companyId,
    },
    include: {
      payrolls: {
        orderBy: { month: "desc" },
        take: 6,
      },
    },
  });

  if (!employee) {
    res.status(404).json({ error: "employee_not_found" });
    return;
  }

  const bio = await getEmployeeBiometricState(tenant.companyId, employee.id);
  const employeeWithBio = {
    ...employee,
    biometricConsentGiven: bio.biometricConsentGiven,
    biometricRefId: bio.biometricRefId,
  };

  const isHrAuthorized = ["ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"].includes(userRole);
  if (isHrAuthorized && bio.biometricRefId) {
    await logHrAudit(tenant, userId, "HR_BIOMETRIC_REF_DECRYPTED", "EMPLOYEE", employee.id, {
      companyId: tenant.companyId,
      keyId: bio.keyId || "active",
      authorizedRole: userRole,
    });
  } else if (isHrAuthorized && bio.biometricConsentGiven) {
    await logHrAudit(tenant, userId, "HR_BIOMETRIC_CONSENT_READ", "EMPLOYEE", employee.id, {
      companyId: tenant.companyId,
    });
  }

  res.json(sanitizeEmployeeForRole(employeeWithBio, userRole));
});

hrRouter.post(
  "/employees",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_employee", details: parsed.error.flatten() });
      return;
    }

    const tenant = companyContext(req);
    const assignedBranchId = parsed.data.branchId || tenant.branchId;

    const {
      fullName,
      nif,
      inss,
      position,
      department,
      contractType,
      iban,
      baseSalaryCents,
      foodAllowanceCents,
      transportAllowanceCents,
      housingAllowanceCents,
      otherAllowancesCents,
      foodAllowanceExempt,
      transportAllowanceExempt,
      housingAllowanceExempt,
      otherAllowancesExempt,
      active,
      biometricConsentGiven,
      biometricRefId,
    } = parsed.data;

    const employee = await prisma.employee.create({
      data: {
        fullName,
        nif,
        inss,
        position,
        department,
        contractType,
        iban,
        baseSalaryCents,
        foodAllowanceCents,
        transportAllowanceCents,
        housingAllowanceCents,
        otherAllowancesCents,
        foodAllowanceExempt,
        transportAllowanceExempt,
        housingAllowanceExempt,
        otherAllowancesExempt,
        active,
        companyId: tenant.companyId,
        branchId: assignedBranchId,
      },
    });

    if (biometricConsentGiven || biometricRefId) {
      try {
        await saveEmployeeBiometricState(
          tenant.companyId,
          employee.id,
          {
            biometricConsentGiven: Boolean(biometricConsentGiven),
            biometricRefId: biometricRefId ?? null,
          },
          (req as AuthRequest).user?.id
        );
      } catch (err: any) {
        if (err.message && err.message.includes("BIOMETRIC_KEY_NOT_CONFIGURED")) {
          res.status(503).json({
            error: "biometric_key_not_configured",
            message: "Chave de cifragem biométrica não configurada no ambiente. Registo biométrico bloqueado.",
          });
          return;
        }
        throw err;
      }
    }

    const employeeWithBio = {
      ...employee,
      biometricConsentGiven: Boolean(biometricConsentGiven),
      biometricRefId: biometricRefId ?? null,
    };

    await logHrAudit(tenant, (req as AuthRequest).user?.id, "EMPLOYEE_CREATED", "EMPLOYEE", employee.id, {
      fullName: employee.fullName,
      position: employee.position,
      department: employee.department,
      branchId: employee.branchId,
      biometricConsentGiven: Boolean(biometricConsentGiven),
    });

    res.status(201).json(employeeWithBio);
  }
);

hrRouter.patch(
  "/employees/:id",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = employeeSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_employee_update", details: parsed.error.flatten() });
      return;
    }

    const tenant = companyContext(req);
    const current = await prisma.employee.findFirst({
      where: { id: String(req.params.id), companyId: tenant.companyId },
      select: { id: true },
    });

    if (!current) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }

    const {
      fullName,
      nif,
      inss,
      position,
      department,
      contractType,
      iban,
      baseSalaryCents,
      foodAllowanceCents,
      transportAllowanceCents,
      housingAllowanceCents,
      otherAllowancesCents,
      foodAllowanceExempt,
      transportAllowanceExempt,
      housingAllowanceExempt,
      otherAllowancesExempt,
      active,
      branchId,
      biometricConsentGiven,
      biometricRefId,
    } = parsed.data as any;

    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (nif !== undefined) updateData.nif = nif;
    if (inss !== undefined) updateData.inss = inss;
    if (position !== undefined) updateData.position = position;
    if (department !== undefined) updateData.department = department;
    if (contractType !== undefined) updateData.contractType = contractType;
    if (iban !== undefined) updateData.iban = iban;
    if (baseSalaryCents !== undefined) updateData.baseSalaryCents = baseSalaryCents;
    if (foodAllowanceCents !== undefined) updateData.foodAllowanceCents = foodAllowanceCents;
    if (transportAllowanceCents !== undefined) updateData.transportAllowanceCents = transportAllowanceCents;
    if (housingAllowanceCents !== undefined) updateData.housingAllowanceCents = housingAllowanceCents;
    if (otherAllowancesCents !== undefined) updateData.otherAllowancesCents = otherAllowancesCents;
    if (foodAllowanceExempt !== undefined) updateData.foodAllowanceExempt = foodAllowanceExempt;
    if (transportAllowanceExempt !== undefined) updateData.transportAllowanceExempt = transportAllowanceExempt;
    if (housingAllowanceExempt !== undefined) updateData.housingAllowanceExempt = housingAllowanceExempt;
    if (otherAllowancesExempt !== undefined) updateData.otherAllowancesExempt = otherAllowancesExempt;
    if (active !== undefined) updateData.active = active;
    if (branchId !== undefined) updateData.branchId = branchId;

    const employee = await prisma.employee.update({
      where: { id: current.id },
      data: updateData,
    });

    let currentBio = await getEmployeeBiometricState(tenant.companyId, current.id);
    if (biometricConsentGiven !== undefined || biometricRefId !== undefined) {
      const nextBio = {
        biometricConsentGiven: biometricConsentGiven !== undefined ? Boolean(biometricConsentGiven) : currentBio.biometricConsentGiven,
        biometricRefId: biometricRefId !== undefined ? biometricRefId : currentBio.biometricRefId,
      };
      try {
        await saveEmployeeBiometricState(tenant.companyId, current.id, nextBio, (req as AuthRequest).user?.id);
      } catch (err: any) {
        if (err.message && err.message.includes("BIOMETRIC_KEY_NOT_CONFIGURED")) {
          res.status(503).json({
            error: "biometric_key_not_configured",
            message: "Chave de cifragem biométrica não configurada no ambiente. Atualização biométrica bloqueada.",
          });
          return;
        }
        throw err;
      }

      if (biometricConsentGiven !== undefined && biometricConsentGiven !== currentBio.biometricConsentGiven) {
        await logHrAudit(tenant, (req as AuthRequest).user?.id, "HR_BIOMETRIC_CONSENT_UPDATED", "EMPLOYEE", employee.id, {
          biometricConsentGiven: nextBio.biometricConsentGiven,
          biometricRefId: nextBio.biometricRefId,
        });
      }
      currentBio = nextBio;
    }

    await logHrAudit(tenant, (req as AuthRequest).user?.id, "EMPLOYEE_UPDATED", "EMPLOYEE", employee.id, updateData);
    res.json({
      ...employee,
      biometricConsentGiven: currentBio.biometricConsentGiven,
      biometricRefId: currentBio.biometricRefId,
    });
  }
);

hrRouter.delete(
  "/employees/:id",
  requireRole("ADMIN", "ROLE_ADMIN"),
  async (req: Request, res: Response) => {
    const tenant = companyContext(req);
    const current = await prisma.employee.findFirst({
      where: { id: String(req.params.id), companyId: tenant.companyId },
      select: { id: true, active: true },
    });

    if (!current) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }

    // Desativação lógica segura para preservação integral do histórico fiscal e contabilístico
    const deactivated = await prisma.employee.update({
      where: { id: current.id },
      data: { active: false },
    });

    await logHrAudit(tenant, (req as AuthRequest).user?.id, "EMPLOYEE_DEACTIVATED", "EMPLOYEE", current.id, {
      active: false,
    });

    res.json({ success: true, message: "Colaborador desativado com sucesso.", employee: deactivated });
  }
);

hrRouter.post(
  "/employees/:id/biometric-consent/revoke",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const tenant = companyContext(req);
    const userId = (req as AuthRequest).user?.id;
    const current = await prisma.employee.findFirst({
      where: { id: String(req.params.id), companyId: tenant.companyId },
    });

    if (!current) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }

    const previousBio = await getEmployeeBiometricState(tenant.companyId, current.id);

    await saveEmployeeBiometricState(
      tenant.companyId,
      current.id,
      {
        biometricConsentGiven: false,
        biometricRefId: null,
      },
      userId
    );

    await logHrAudit(tenant, userId, "HR_BIOMETRIC_CONSENT_REVOKED", "EMPLOYEE", current.id, {
      reason: req.body?.reason || "Consentimento biométrico revogado pelo titular ou administrador",
      revokedAt: new Date().toISOString(),
      previousRefId: previousBio.biometricRefId,
    });

    res.json({
      success: true,
      message: "Consentimento biométrico revogado com sucesso. O histórico de auditoria permanece inalterado.",
      employee: {
        ...current,
        biometricConsentGiven: false,
        biometricRefId: null,
      },
    });
  }
);

// 4. ASSIDUIDADE, TURNOS E PONTO
hrRouter.get("/attendance", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
  const dateStr = req.query.date ? String(req.query.date) : undefined;

  const records = await prisma.attendanceRecord.findMany({
    where: {
      companyId: tenant.companyId,
      ...(employeeId ? { employeeId } : {}),
      ...(dateStr ? { date: new Date(dateStr) } : {}),
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  res.json(records);
});

hrRouter.post(
  "/attendance",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER", "ROLE_MANAGER", "MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = attendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_attendance_payload", details: parsed.error.flatten() });
      return;
    }

    const tenant = companyContext(req);
    const dateObj = new Date(parsed.data.date);

    const record = await prisma.attendanceRecord.upsert({
      where: {
        companyId_employeeId_date: {
          companyId: tenant.companyId,
          employeeId: parsed.data.employeeId,
          date: dateObj,
        },
      },
      update: {
        checkIn: parsed.data.checkIn ? new Date(parsed.data.checkIn) : undefined,
        checkOut: parsed.data.checkOut ? new Date(parsed.data.checkOut) : undefined,
        workedMinutes: parsed.data.workedMinutes,
        overtimeMinutes: parsed.data.overtimeMinutes,
        delayMinutes: parsed.data.delayMinutes,
        status: parsed.data.status,
      },
      create: {
        companyId: tenant.companyId,
        employeeId: parsed.data.employeeId,
        date: dateObj,
        checkIn: parsed.data.checkIn ? new Date(parsed.data.checkIn) : null,
        checkOut: parsed.data.checkOut ? new Date(parsed.data.checkOut) : null,
        workedMinutes: parsed.data.workedMinutes ?? 0,
        overtimeMinutes: parsed.data.overtimeMinutes ?? 0,
        delayMinutes: parsed.data.delayMinutes ?? 0,
        status: parsed.data.status,
      },
    });

    await logHrAudit(tenant, (req as AuthRequest).user?.id, "ATTENDANCE_RECORDED", "ATTENDANCE", record.id, {
      employeeId: parsed.data.employeeId,
      status: parsed.data.status,
      workedMinutes: record.workedMinutes,
    });

    res.status(201).json(record);
  }
);

// 5. FÉRIAS E LICENÇAS
hrRouter.get("/leaves", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;

  const records = await prisma.attendanceRecord.findMany({
    where: {
      companyId: tenant.companyId,
      status: { in: ["VACATION", "LEAVE", "ABSENT_JUSTIFIED"] },
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  res.json(records);
});

hrRouter.post(
  "/leaves",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER", "ROLE_MANAGER", "MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = leaveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_leave_request", details: parsed.error.flatten() });
      return;
    }

    const tenant = companyContext(req);
    const startDate = new Date(parsed.data.startDate);

    const record = await prisma.attendanceRecord.create({
      data: {
        companyId: tenant.companyId,
        employeeId: parsed.data.employeeId,
        date: startDate,
        status: parsed.data.type === "VACATION" ? "VACATION" : "LEAVE",
        syncedToPayroll: false,
        workedMinutes: 0,
      },
    });

    await logHrAudit(tenant, (req as AuthRequest).user?.id, "LEAVE_REQUESTED", "LEAVE", record.id, {
      employeeId: parsed.data.employeeId,
      type: parsed.data.type,
      daysCount: parsed.data.daysCount,
    });

    res.status(201).json({
      id: record.id,
      employeeId: record.employeeId,
      status: "PENDING_APPROVAL",
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      daysCount: parsed.data.daysCount,
      justification: parsed.data.justification,
    });
  }
);

hrRouter.patch(
  "/leaves/:id/approve",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER", "ROLE_MANAGER", "MANAGER"),
  async (req: Request, res: Response) => {
    const tenant = companyContext(req);
    const record = await prisma.attendanceRecord.findFirst({
      where: { id: String(req.params.id), companyId: tenant.companyId },
    });

    if (!record) {
      res.status(404).json({ error: "leave_record_not_found" });
      return;
    }

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { syncedToPayroll: true },
    });

    await logHrAudit(tenant, (req as AuthRequest).user?.id, "LEAVE_APPROVED", "LEAVE", record.id, {
      employeeId: record.employeeId,
      status: "APPROVED",
    });

    res.json({ id: updated.id, status: "APPROVED", syncedToPayroll: true });
  }
);

// 6. PROCESSAMENTO SALARIAL
hrRouter.get("/payrolls", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const month = req.query.month ? String(req.query.month) : undefined;
  const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;

  const rows = await prisma.payroll.findMany({
    where: {
      companyId: tenant.companyId,
      ...(month ? { month } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { employee: true },
  });

  res.json(rows);
});

hrRouter.post(
  "/payrolls/compute",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = payrollSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payroll_request", details: parsed.error.flatten() });
      return;
    }

    const tenant = companyContext(req);
    const employee = await prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, companyId: tenant.companyId },
    });

    if (!employee) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }

    // Verificar se o recibo deste mês já foi fechado
    const existing = await prisma.payroll.findUnique({
      where: { employeeId_month: { employeeId: employee.id, month: parsed.data.month } },
    });

    if (existing && existing.status === "CLOSED") {
      res.status(409).json({
        error: "payroll_already_closed",
        message: "Recibo salarial fechado não pode ser alterado ou reprocessado. Ajustes devem ocorrer por retificação auditada.",
      });
      return;
    }

    const config = await getCompanyPayrollConfig(tenant.companyId);

    // Validação estrita de vigência e aprovação formal da configuração remuneratória
    const validity = validatePayrollConfigValidity(config, parsed.data.month);
    if (!validity.valid) {
      res.status(412).json({
        error: "no_valid_hr_config",
        message: "Apenas configurações remuneratórias ativas, aprovadas e vigentes podem processar remunerações.",
        details: validity.reason,
      });
      return;
    }

    const values = calculatePayroll(employee, config);

    const row = await prisma.payroll.upsert({
      where: { employeeId_month: { employeeId: employee.id, month: parsed.data.month } },
      update: {
        salaryBaseCents: employee.baseSalaryCents,
        foodAllowanceCents: employee.foodAllowanceCents,
        transportAllowanceCents: employee.transportAllowanceCents,
        housingAllowanceCents: employee.housingAllowanceCents,
        otherAllowancesCents: employee.otherAllowancesCents,
        taxableAllowancesCents: values.taxableAllowancesCents,
        grossSalaryCents: values.grossSalaryCents,
        inssEmployeeCents: values.inssEmployeeCents,
        inssEmployerCents: values.inssEmployerCents,
        irtCents: values.irtCents,
        netSalaryCents: values.netSalaryCents,
        status: "APPROVED",
        payDate: new Date(),
      },
      create: {
        companyId: tenant.companyId,
        branchId: employee.branchId || tenant.branchId,
        employeeId: employee.id,
        month: parsed.data.month,
        salaryBaseCents: employee.baseSalaryCents,
        foodAllowanceCents: employee.foodAllowanceCents,
        transportAllowanceCents: employee.transportAllowanceCents,
        housingAllowanceCents: employee.housingAllowanceCents,
        otherAllowancesCents: employee.otherAllowancesCents,
        grossSalaryCents: values.grossSalaryCents,
        taxableAllowancesCents: values.taxableAllowancesCents,
        inssEmployeeCents: values.inssEmployeeCents,
        inssEmployerCents: values.inssEmployerCents,
        irtCents: values.irtCents,
        netSalaryCents: values.netSalaryCents,
        status: "APPROVED",
        payDate: new Date(),
      },
    });

    await logHrAudit(tenant, (req as AuthRequest).user?.id, "PAYROLL_CREATED", "PAYROLL", row.id, {
      employeeId: employee.id,
      month: parsed.data.month,
      configApprovalReference: values.configApprovalReference,
    });

    res.status(201).json({
      ...row,
      regulatoryNotice: values.regulatoryNotice,
      payslip: {
        employee: employee.fullName,
        nif: employee.nif,
        month: parsed.data.month,
        grossSalaryCents: row.grossSalaryCents,
        netSalaryCents: row.netSalaryCents,
        irtCents: row.irtCents,
        inssEmployeeCents: row.inssEmployeeCents,
        regulatoryNotice: values.regulatoryNotice,
      },
    });
  }
);

hrRouter.post(
  "/payrolls/process-month",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payroll_month" });
      return;
    }

    const tenant = companyContext(req);

    // Bloqueia reprocessamento silencioso caso já existam recibos fechados para este mês
    const closedCount = await prisma.payroll.count({
      where: { companyId: tenant.companyId, month: parsed.data.month, status: "CLOSED" },
    });

    if (closedCount > 0) {
      res.status(409).json({
        error: "payroll_already_closed",
        message: `O mês ${parsed.data.month} contém ${closedCount} recibo(s) fechado(s). Reprocessamento em bloco bloqueado.`,
      });
      return;
    }

    const config = await getCompanyPayrollConfig(tenant.companyId);

    // Validação estrita de vigência e aprovação formal da configuração remuneratória
    const validity = validatePayrollConfigValidity(config, parsed.data.month);
    if (!validity.valid) {
      res.status(412).json({
        error: "no_valid_hr_config",
        message: "Apenas configurações remuneratórias ativas, aprovadas e vigentes podem processar remunerações.",
        details: validity.reason,
      });
      return;
    }

    const employees = await prisma.employee.findMany({
      where: { active: true, companyId: tenant.companyId },
    });

    const results = [];
    for (const employee of employees) {
      const values = calculatePayroll(employee, config);
      const row = await prisma.payroll.upsert({
        where: { employeeId_month: { employeeId: employee.id, month: parsed.data.month } },
        update: {
          salaryBaseCents: employee.baseSalaryCents,
          foodAllowanceCents: employee.foodAllowanceCents,
          transportAllowanceCents: employee.transportAllowanceCents,
          housingAllowanceCents: employee.housingAllowanceCents,
          otherAllowancesCents: employee.otherAllowancesCents,
          taxableAllowancesCents: values.taxableAllowancesCents,
          grossSalaryCents: values.grossSalaryCents,
          inssEmployeeCents: values.inssEmployeeCents,
          inssEmployerCents: values.inssEmployerCents,
          irtCents: values.irtCents,
          netSalaryCents: values.netSalaryCents,
          status: "APPROVED",
          payDate: new Date(),
        },
        create: {
          companyId: tenant.companyId,
          branchId: employee.branchId || tenant.branchId,
          employeeId: employee.id,
          month: parsed.data.month,
          salaryBaseCents: employee.baseSalaryCents,
          foodAllowanceCents: employee.foodAllowanceCents,
          transportAllowanceCents: employee.transportAllowanceCents,
          housingAllowanceCents: employee.housingAllowanceCents,
          otherAllowancesCents: employee.otherAllowancesCents,
          taxableAllowancesCents: values.taxableAllowancesCents,
          grossSalaryCents: values.grossSalaryCents,
          inssEmployeeCents: values.inssEmployeeCents,
          inssEmployerCents: values.inssEmployerCents,
          irtCents: values.irtCents,
          netSalaryCents: values.netSalaryCents,
          status: "APPROVED",
          payDate: new Date(),
        },
      });
      results.push(row);
    }

    await logHrAudit(tenant, (req as AuthRequest).user?.id, "PAYROLL_MONTH_PROCESSED", "PAYROLL", parsed.data.month, {
      count: results.length,
      configApprovalReference: config.approvalReference,
      configVersion: config.version,
    });

    res.status(201).json({
      month: parsed.data.month,
      count: results.length,
      payrolls: results,
      regulatoryNotice: config.regulatoryNotice,
    });
  }
);

// Fecho formal e gravação de snapshot imutável da configuração remuneratória aplicada
hrRouter.post(
  "/payrolls/close-month",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payroll_month" });
      return;
    }

    const tenant = companyContext(req);
    const userId = (req as AuthRequest).user?.id;
    const month = parsed.data.month;

    const payrolls = await prisma.payroll.findMany({
      where: { companyId: tenant.companyId, month },
    });

    if (payrolls.length === 0) {
      res.status(404).json({
        error: "no_payrolls_for_month",
        message: "Nenhum recibo salarial encontrado para este mês.",
      });
      return;
    }

    const config = await getCompanyPayrollConfig(tenant.companyId);
    const configHash = computeConfigHash(config);
    const configSnapshotWithHash = {
      ...(typeof config === "object" && config !== null ? config : {}),
      configHash,
    };
    const nowIso = new Date().toISOString();

    // 1. Grava snapshot imutável em modelo próprio persistente migrado com SHA-256 e FK restrita
    for (const p of payrolls) {
      const existingSnapshot = await prisma.payrollSnapshot.findUnique({
        where: { companyId_payrollId: { companyId: tenant.companyId, payrollId: p.id } },
      });
      if (!existingSnapshot) {
        const integrityHash = computeSnapshotHash({
          companyId: tenant.companyId,
          payrollId: p.id,
          month,
          version: config.version,
          configSnapshot: configSnapshotWithHash,
          configHash,
          closedAt: nowIso,
          closedBy: userId || "SYSTEM",
        });
        await prisma.payrollSnapshot.create({
          data: {
            companyId: tenant.companyId,
            payrollId: p.id,
            month,
            version: config.version,
            configSnapshot: configSnapshotWithHash as any,
            integrityHash,
            closedAt: new Date(nowIso),
            closedBy: userId || "SYSTEM",
          },
        });
      }
    }

    // Grava também snapshot de integração para retrocompatibilidade
    await prisma.integrationConfig.upsert({
      where: {
        companyId_provider: {
          companyId: tenant.companyId,
          provider: `HR_PAYROLL_SNAPSHOT_${month}`,
        },
      },
      update: {
        config: {
          month,
          closedAt: nowIso,
          closedById: userId,
          configSnapshot: config,
          payrollsCount: payrolls.length,
        } as any,
        updatedAt: new Date(),
        status: "ACTIVE",
      },
      create: {
        companyId: tenant.companyId,
        provider: `HR_PAYROLL_SNAPSHOT_${month}`,
        name: `Snapshot Histórico de Remuneração - ${month}`,
        config: {
          month,
          closedAt: nowIso,
          closedById: userId,
          configSnapshot: config,
          payrollsCount: payrolls.length,
        } as any,
        status: "ACTIVE",
        createdById: userId,
      },
    });

    // 2. Atualiza status de todos os recibos deste mês para CLOSED
    await prisma.payroll.updateMany({
      where: { companyId: tenant.companyId, month },
      data: { status: "CLOSED" },
    });

    await logHrAudit(tenant, userId, "HR_PAYROLL_CLOSED", "PAYROLL", month, {
      month,
      count: payrolls.length,
      configVersion: config.version,
      configApprovalReference: config.approvalReference,
      closedAt: nowIso,
    });

    res.json({
      success: true,
      message: `Processamento salarial de ${month} fechado com sucesso. Configuração histórica gravada em snapshot imutável.`,
      month,
      closedCount: payrolls.length,
      configSnapshotVersion: config.version,
    });
  }
);

hrRouter.post(
  "/payrolls/:id/close",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const tenant = companyContext(req);
    const userId = (req as AuthRequest).user?.id;
    const payroll = await prisma.payroll.findFirst({
      where: { id: String(req.params.id), companyId: tenant.companyId },
    });

    if (!payroll) {
      res.status(404).json({ error: "payroll_not_found" });
      return;
    }

    const existingSnapshot = await prisma.payrollSnapshot.findUnique({
      where: { companyId_payrollId: { companyId: tenant.companyId, payrollId: payroll.id } },
    });

    if (existingSnapshot || payroll.status === "CLOSED") {
      res.status(409).json({
        error: "payroll_already_closed",
        message: "Recibo salarial já se encontra fechado com snapshot imutável.",
      });
      return;
    }

    const config = await getCompanyPayrollConfig(tenant.companyId);
    const configHash = computeConfigHash(config);
    const configSnapshotWithHash = {
      ...(typeof config === "object" && config !== null ? config : {}),
      configHash,
    };
    const nowIso = new Date().toISOString();
    const integrityHash = computeSnapshotHash({
      companyId: tenant.companyId,
      payrollId: payroll.id,
      month: payroll.month,
      version: config.version,
      configSnapshot: configSnapshotWithHash,
      configHash,
      closedAt: nowIso,
      closedBy: userId || "SYSTEM",
    });

    const snapshot = await prisma.payrollSnapshot.create({
      data: {
        companyId: tenant.companyId,
        payrollId: payroll.id,
        month: payroll.month,
        version: config.version,
        configSnapshot: configSnapshotWithHash as any,
        integrityHash,
        closedAt: new Date(nowIso),
        closedBy: userId || "SYSTEM",
      },
    });

    const updated = await prisma.payroll.update({
      where: { id: payroll.id },
      data: { status: "CLOSED" },
    });

    await logHrAudit(tenant, userId, "HR_PAYROLL_CLOSED", "PAYROLL", payroll.id, {
      month: payroll.month,
      employeeId: payroll.employeeId,
      configVersion: config.version,
      configApprovalReference: config.approvalReference,
      snapshotId: snapshot.id,
      integrityHash: snapshot.integrityHash,
      closedAt: nowIso,
    });

    res.json({
      success: true,
      message: "Recibo salarial fechado com sucesso e snapshot imutável gravado.",
      payroll: updated,
      snapshot,
    });
  }
);

hrRouter.get(
  "/payrolls/:id/snapshot",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const tenant = companyContext(req);
    const snapshot = await prisma.payrollSnapshot.findUnique({
      where: {
        companyId_payrollId: {
          companyId: tenant.companyId,
          payrollId: String(req.params.id),
        },
      },
    });
    if (!snapshot) {
      res.status(404).json({ error: "snapshot_not_found", message: "Nenhum snapshot imutável encontrado para este recibo." });
      return;
    }
    res.json(snapshot);
  }
);

hrRouter.get(
  "/payrolls/:id/rectifications",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const tenant = companyContext(req);
    const rectifications = await prisma.payrollRectification.findMany({
      where: {
        companyId: tenant.companyId,
        payrollId: String(req.params.id),
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(rectifications);
  }
);

// Ajustes e retificações auditadas sem destruição do histórico fechado
hrRouter.post(
  "/payrolls/:id/rectify",
  requireRole("ADMIN", "ROLE_ADMIN", "ROLE_HR", "HR_MANAGER"),
  async (req: Request, res: Response) => {
    const parsed = z
      .object({
        adjustmentCents: z.number().int(),
        reason: z.string().min(3).max(300),
        notes: z.string().max(500).optional().nullable(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "invalid_rectification", details: parsed.error.flatten() });
      return;
    }

    const tenant = companyContext(req);
    const userId = (req as AuthRequest).user?.id;
    const payroll = await prisma.payroll.findFirst({
      where: { id: String(req.params.id), companyId: tenant.companyId },
      include: { employee: true },
    });

    if (!payroll) {
      res.status(404).json({ error: "payroll_not_found" });
      return;
    }

    if (payroll.status !== "CLOSED") {
      res.status(409).json({
        error: "payroll_not_closed",
        message: "Apenas recibos salariais formalmente fechados podem receber retificações auditadas.",
      });
      return;
    }

    // Snapshot obrigatório para ancoragem imutável da retificação
    let snapshot = await prisma.payrollSnapshot.findUnique({
      where: { companyId_payrollId: { companyId: tenant.companyId, payrollId: payroll.id } },
    });

    if (!snapshot) {
      const config = await getCompanyPayrollConfig(tenant.companyId);
      const configHash = computeConfigHash(config);
      const configSnapshotWithHash = {
        ...(typeof config === "object" && config !== null ? config : {}),
        configHash,
      };
      const nowIso = new Date().toISOString();
      const integrityHash = computeSnapshotHash({
        companyId: tenant.companyId,
        payrollId: payroll.id,
        month: payroll.month,
        version: config.version,
        configSnapshot: configSnapshotWithHash,
        configHash,
        closedAt: nowIso,
        closedBy: userId || "SYSTEM",
      });
      snapshot = await prisma.payrollSnapshot.create({
        data: {
          companyId: tenant.companyId,
          payrollId: payroll.id,
          month: payroll.month,
          version: config.version,
          configSnapshot: configSnapshotWithHash as any,
          integrityHash,
          closedAt: new Date(nowIso),
          closedBy: userId || "SYSTEM",
        },
      });
    }

    const rectCount = await prisma.payrollRectification.count({
      where: { companyId: tenant.companyId, payrollId: payroll.id },
    });
    const rectificationNumber = `RET-${payroll.id.slice(0, 8).toUpperCase()}-${rectCount + 1}`;
    const adjustedNetSalaryCents = payroll.netSalaryCents + parsed.data.adjustmentCents;

    const rectHash = computeRectificationHash({
      companyId: tenant.companyId,
      payrollId: payroll.id,
      snapshotId: snapshot.id,
      rectificationNumber,
      adjustmentCents: parsed.data.adjustmentCents,
      originalNetSalaryCents: payroll.netSalaryCents,
      adjustedNetSalaryCents,
      reason: parsed.data.reason,
      createdBy: userId || "SYSTEM",
    });

    const rectification = await prisma.payrollRectification.create({
      data: {
        companyId: tenant.companyId,
        payrollId: payroll.id,
        snapshotId: snapshot.id,
        rectificationNumber,
        adjustmentCents: parsed.data.adjustmentCents,
        originalNetSalaryCents: payroll.netSalaryCents,
        adjustedNetSalaryCents,
        reason: parsed.data.reason,
        notes: parsed.data.notes ?? null,
        integrityHash: rectHash,
        createdBy: userId || "SYSTEM",
      },
    });

    await logHrAudit(tenant, userId, "HR_PAYROLL_RECTIFIED", "PAYROLL", payroll.id, {
      employeeId: payroll.employeeId,
      month: payroll.month,
      rectificationNumber,
      rectificationId: rectification.id,
      snapshotId: snapshot.id,
      adjustmentCents: parsed.data.adjustmentCents,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      originalNetSalaryCents: payroll.netSalaryCents,
      adjustedNetSalaryCents,
      integrityHash: rectHash,
    });

    res.json({
      success: true,
      message: "Retificação salarial registada com sucesso em trilha de auditoria sem corrupção do recibo original.",
      rectification,
      payrollId: payroll.id,
      month: payroll.month,
      originalNetSalaryCents: payroll.netSalaryCents,
      adjustmentCents: parsed.data.adjustmentCents,
      adjustedNetSalaryCents,
      reason: parsed.data.reason,
    });
  }
);

hrRouter.delete(
  "/payrolls/:id",
  requireRole("ADMIN", "ROLE_ADMIN"),
  async (req: Request, res: Response) => {
    const tenant = companyContext(req);
    const payroll = await prisma.payroll.findFirst({
      where: { id: String(req.params.id), companyId: tenant.companyId },
    });

    if (!payroll) {
      res.status(404).json({ error: "payroll_not_found" });
      return;
    }

    if (payroll.status === "CLOSED") {
      res.status(409).json({
        error: "payroll_already_closed",
        message: "Recibo salarial fechado não pode ser removido do histórico.",
      });
      return;
    }

    const snapshot = await prisma.payrollSnapshot.findUnique({
      where: { companyId_payrollId: { companyId: tenant.companyId, payrollId: payroll.id } },
    });
    if (snapshot) {
      res.status(409).json({
        error: "payroll_snapshot_exists",
        message: "Recibo salarial possui snapshot imutável e não pode ser removido.",
      });
      return;
    }

    await prisma.payroll.delete({ where: { id: payroll.id } });
    await logHrAudit(tenant, (req as AuthRequest).user?.id, "PAYROLL_DELETED", "PAYROLL", payroll.id, {
      month: payroll.month,
      employeeId: payroll.employeeId,
    });

    res.json({ success: true, message: "Recibo salarial removido com sucesso." });
  }
);

hrRouter.get("/payrolls/report", async (req: Request, res: Response) => {
  const month = String(req.query.month ?? new Date().toISOString().slice(0, 7));
  const tenant = companyContext(req);
  const rows = await prisma.payroll.findMany({
    where: { month, companyId: tenant.companyId },
    include: { employee: true },
    orderBy: { employee: { fullName: "asc" } },
  });

  res.json({
    month,
    count: rows.length,
    totals: {
      grossSalaryCents: rows.reduce((n, r) => n + r.grossSalaryCents, 0),
      inssEmployeeCents: rows.reduce((n, r) => n + r.inssEmployeeCents, 0),
      inssEmployerCents: rows.reduce((n, r) => n + r.inssEmployerCents, 0),
      irtCents: rows.reduce((n, r) => n + r.irtCents, 0),
      netSalaryCents: rows.reduce((n, r) => n + r.netSalaryCents, 0),
    },
    rows,
    regulatoryNotice: REGULATORY_NOTICE,
  });
});

hrRouter.get("/payrolls/:id/payslip", async (req: Request, res: Response) => {
  const tenant = companyContext(req);
  const item = await prisma.payroll.findFirst({
    where: { id: String(req.params.id), companyId: tenant.companyId },
    include: { employee: true },
  });

  if (!item) {
    res.status(404).json({ error: "payroll_not_found" });
    return;
  }

  res.json({
    employee: item.employee,
    payroll: item,
    regulatoryNotice: REGULATORY_NOTICE,
  });
});
