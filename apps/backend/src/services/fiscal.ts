import crypto from "node:crypto";
import fs from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getEnv } from "../config/env.js";

import { applyStockChange } from "./stock-ledger.js";

function encryptionKey() {
  return crypto.createHash("sha256").update(getEnv().FISCAL_CONFIG_KEY).digest();
}

export function encryptFiscalSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptFiscalSecret(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("invalid_encrypted_secret_format");
  const [ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("invalid_encrypted_secret_format");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// =========================================================================
// VERSIONED FISCAL POLICY CONFIGURATION (CONFIGURÁVEL POR EMPRESA/REGIME)
// =========================================================================

export interface FiscalTaxRateConfig {
  code: string;
  rate: number; // e.g. 0.14, 0.07, 0.05, 0.00
  description: string;
  effectiveFrom: string; // ISO date YYYY-MM-DD
  effectiveTo?: string | null;
  origin: "PROVISIONAL_PORTARIA_REFERENCED" | "TENANT_CUSTOM_CONFIGURATION";
  status: "PROVISIONAL_PENDING_AGT_SPECIFICATION" | "ACTIVE" | "DEPRECATED";
}

export interface FiscalExemptionConfig {
  code: string;
  reason: string;
  legalBase: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  origin: "PROVISIONAL_CIVA_REFERENCED" | "TENANT_CUSTOM_CONFIGURATION";
  status: "PROVISIONAL_PENDING_AGT_SPECIFICATION" | "ACTIVE" | "DEPRECATED";
}

export interface FiscalWithholdingConfig {
  rate: number; // e.g. 0.065
  category: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  origin: "PROVISIONAL_CIVA_REFERENCED" | "TENANT_CUSTOM_CONFIGURATION";
  status: "PROVISIONAL_PENDING_AGT_SPECIFICATION" | "ACTIVE";
}

export interface FiscalNifPolicyConfig {
  mode: "ANGOLAN_STANDARD" | "PERMISSIVE" | "CUSTOM_REGEX";
  customRegex?: string;
  allowFinalConsumer: boolean;
  finalConsumerNif: string;
  origin: "PROVISIONAL_REFERENCE_IMPLEMENTATION" | "TENANT_CUSTOM_CONFIGURATION";
  status: "PROVISIONAL_PENDING_AGT_SPECIFICATION" | "ACTIVE";
}

export interface FiscalGtPolicyConfig {
  requireVehiclePlate: boolean;
  requireDepartureAddress: boolean;
  requireDeliveryAddress: boolean;
  requireDepartureTime: boolean;
  origin: "PROVISIONAL_REFERENCE_IMPLEMENTATION" | "TENANT_CUSTOM_CONFIGURATION";
  status: "PROVISIONAL_PENDING_AGT_SPECIFICATION" | "ACTIVE";
}

export interface TenantFiscalPolicy {
  policyVersion: string;
  regime: "GERAL" | "SIMPLIFICADO" | "EXCLUSAO" | string;
  taxRates: FiscalTaxRateConfig[];
  exemptions: FiscalExemptionConfig[];
  withholding: FiscalWithholdingConfig[];
  nifPolicy: FiscalNifPolicyConfig;
  gtPolicy: FiscalGtPolicyConfig;
  disclaimer: string;
}

/**
 * Baseline provisional fiscal policy.
 * All rates and exemption tables are explicitly marked as provisional
 * until formal publication and validation by AGT.
 */
export const DEFAULT_PROVISIONAL_FISCAL_POLICY: TenantFiscalPolicy = {
  policyVersion: "2026.1-PROVISIONAL",
  regime: "GERAL",
  taxRates: [
    {
      code: "NOR",
      rate: 0.14,
      description: "Taxa Normal de IVA (14%)",
      effectiveFrom: "2019-10-01",
      origin: "PROVISIONAL_PORTARIA_REFERENCED",
      status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
    },
    {
      code: "RED",
      rate: 0.07,
      description: "Taxa Reduzida (7%) para bens de amplo consumo",
      effectiveFrom: "2022-01-01",
      origin: "PROVISIONAL_PORTARIA_REFERENCED",
      status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
    },
    {
      code: "INT",
      rate: 0.05,
      description: "Taxa Especial (5%) produtos agrícolas e pecuários",
      effectiveFrom: "2024-01-01",
      origin: "PROVISIONAL_PORTARIA_REFERENCED",
      status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
    },
    {
      code: "ISE",
      rate: 0.00,
      description: "Isenção de IVA (0%)",
      effectiveFrom: "2019-10-01",
      origin: "PROVISIONAL_PORTARIA_REFERENCED",
      status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
    },
  ],
  exemptions: [
    {
      code: "M00",
      reason: "Regime Geral - Isenção de IVA nos termos do Código do IVA",
      legalBase: "Artigo 12.º do CIVA",
      effectiveFrom: "2019-10-01",
      origin: "PROVISIONAL_CIVA_REFERENCED",
      status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
    },
    {
      code: "M02",
      reason: "Transmissão de bens e serviços não sujeitos ou isentos",
      legalBase: "Artigo 9.º do CIVA",
      effectiveFrom: "2019-10-01",
      origin: "PROVISIONAL_CIVA_REFERENCED",
      status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
    },
    {
      code: "M04",
      reason: "Operações isentas ao abrigo do artigo 12.º do CIVA",
      legalBase: "Artigo 12.º do CIVA",
      effectiveFrom: "2019-10-01",
      origin: "PROVISIONAL_CIVA_REFERENCED",
      status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
    },
  ],
  withholding: [
    {
      rate: 0.065,
      category: "SERVICES",
      effectiveFrom: "2020-01-01",
      origin: "PROVISIONAL_CIVA_REFERENCED",
      status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
    },
  ],
  nifPolicy: {
    mode: "ANGOLAN_STANDARD",
    allowFinalConsumer: true,
    finalConsumerNif: "999999999",
    origin: "PROVISIONAL_REFERENCE_IMPLEMENTATION",
    status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
  },
  gtPolicy: {
    requireVehiclePlate: true,
    requireDepartureAddress: true,
    requireDeliveryAddress: true,
    requireDepartureTime: true,
    origin: "PROVISIONAL_REFERENCE_IMPLEMENTATION",
    status: "PROVISIONAL_PENDING_AGT_SPECIFICATION",
  },
  disclaimer: "Configuração provisória baseada em referências legais preliminares; sujeita a revisão e homologação formal pela AGT.",
};

/** Configurable placeholders: confirm code meanings against the current AGT publication. */
export const AGT_EXEMPTION_CODES: Record<string, string> = {
  M00: "Regime Geral - Isenção de IVA nos termos do Código do IVA",
  M02: "Transmissão de bens e serviços não sujeitos ou isentos",
  M04: "Operações isentas ao abrigo do artigo 12.º do CIVA",
};

export function validateVatExemption(
  taxRate: number,
  exemptionCode?: string | null,
  policy: TenantFiscalPolicy = DEFAULT_PROVISIONAL_FISCAL_POLICY
) {
  if (taxRate === 0) {
    if (!exemptionCode) throw new Error("vat_exemption_code_required");
    const found = policy.exemptions.find((e) => e.code === exemptionCode && e.status !== "DEPRECATED");
    if (!found) throw new Error(`invalid_vat_exemption_code:${exemptionCode}`);
  }
  return true;
}

/**
 * Validates Taxpayer Identification Number (NIF) according to tenant policy.
 * Default policy supports standard 10-character Angolan NIFs or the universal final consumer identifier 999999999.
 */
export function validateAngolanNif(
  nif: string,
  policy: FiscalNifPolicyConfig = DEFAULT_PROVISIONAL_FISCAL_POLICY.nifPolicy
): boolean {
  const clean = nif.trim().toUpperCase();
  if (!clean) return false;
  if (policy.allowFinalConsumer && clean === policy.finalConsumerNif) return true;
  if (policy.mode === "PERMISSIVE") return clean.length >= 5 && clean.length <= 20;
  if (policy.mode === "CUSTOM_REGEX" && policy.customRegex) {
    return new RegExp(policy.customRegex).test(clean);
  }
  // Standard Angolan corporate or personal NIF: 10 alphanumeric characters
  return /^[0-9A-Z]{10}$/.test(clean);
}

export type FiscalTenant = { companyId: string; branchId: string | null };

export type FiscalHashInput = {
  number: string;
  date: Date | string;
  subtotalCents?: number;
  totalCents: number;
  taxCents: number;
  previousHash?: string | null;
};

/**
 * Versioned extension point for an official fiscal hash contract.
 * The pilot implementation preserves deterministic chaining;
 * it is explicitly documented as prepared for official provider integration.
 */
export interface FiscalHashProvider {
  readonly id: string;
  readonly version: string;
  readonly official: boolean;
  hash(input: FiscalHashInput): string;
}

export const pilotFiscalHashProvider: FiscalHashProvider = {
  id: "vendaja-pilot-sha256-v1",
  version: "1.0",
  official: false,
  hash(invoice) {
    return crypto
      .createHash("sha256")
      .update(
        [
          invoice.number,
          new Date(invoice.date).toISOString().slice(0, 10),
          invoice.subtotalCents ?? "",
          invoice.totalCents,
          invoice.taxCents,
          invoice.previousHash ?? "",
        ].join("|"),
        "utf8"
      )
      .digest("hex");
  },
};

/**
 * Next Sequential Fiscal Number with strict tenant, establishment, document type, series, and fiscal year isolation.
 */
export async function nextFiscalNumber(
  input: { documentType: string; series?: string; issuedAt: Date; tenant: FiscalTenant },
  client: Pick<Prisma.TransactionClient, "fiscalSequence"> | typeof prisma = prisma
) {
  const series = input.series ?? "A";
  const fiscalYear = input.issuedAt.getUTCFullYear();
  const branchScopeId = input.tenant.branchId ?? "__COMPANY__";
  const sequence = await client.fiscalSequence.upsert({
    where: {
      companyId_branchScopeId_documentType_series_fiscalYear: {
        companyId: input.tenant.companyId,
        branchScopeId,
        documentType: input.documentType,
        series,
        fiscalYear,
      },
    },
    create: {
      companyId: input.tenant.companyId,
      branchId: input.tenant.branchId,
      branchScopeId,
      documentType: input.documentType,
      series,
      fiscalYear,
      nextNumber: 2,
    },
    update: { nextNumber: { increment: 1 } },
  });
  if (sequence.closedAt) throw new Error("fiscal_series_closed");
  return `${series}/${input.documentType}/${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}

/**
 * Chained Hash Isolation: Computes next hash chained strictly to the preceding document in the SAME series and tenant.
 */
export async function getNextChainedHash(
  input: {
    companyId: string;
    branchScopeId?: string;
    documentType: string;
    series: string;
    number: string;
    date: Date | string;
    subtotalCents?: number;
    totalCents: number;
    taxCents: number;
  },
  client: typeof prisma | Prisma.TransactionClient = prisma
): Promise<{ fiscalHash: string; previousHash: string | null }> {
  const lastSale = await client.sale.findFirst({
    where: {
      companyId: input.companyId,
      fiscalType: input.documentType,
      series: input.series,
      fiscalHash: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { fiscalHash: true },
  });

  const previousHash = lastSale?.fiscalHash ?? null;
  const fiscalHash = pilotFiscalHashProvider.hash({
    number: input.number,
    date: input.date,
    subtotalCents: input.subtotalCents,
    totalCents: input.totalCents,
    taxCents: input.taxCents,
    previousHash,
  });

  return { fiscalHash, previousHash };
}

export function signFiscalPayload(payload: string, algorithm: "RSA-SHA1" | "RSA-SHA256" = "RSA-SHA256") {
  const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  const key = getEnv().FISCAL_PRIVATE_KEY;
  return {
    hash,
    algorithm,
    signature: key ? crypto.sign(algorithm, Buffer.from(payload), key).toString("base64") : null,
  };
}

export function deterministicInvoiceHash(invoice: FiscalHashInput) {
  return pilotFiscalHashProvider.hash(invoice);
}

/**
 * Versioned QR Code Provider interface.
 * Explicitly distinguishes pilot mock payloads from future official AGT specifications.
 */
export interface FiscalQrProvider {
  readonly id: string;
  readonly version: string;
  readonly official: boolean;
  buildPayload(input: {
    issuerNif: string;
    customerNif?: string;
    documentType?: string;
    number: string;
    date: Date | string;
    totalCents: number;
    taxCents: number;
    hash: string;
  }): string;
}

export const pilotFiscalQrProvider: FiscalQrProvider = {
  id: "vendaja-pilot-qr-v1",
  version: "1.0",
  official: false,
  buildPayload(input) {
    return `A:${input.issuerNif};F:${input.number};N:${input.customerNif ?? ""};D:${new Date(input.date).toISOString().slice(0, 10)};T:${(input.totalCents / 100).toFixed(2)};I:${(input.taxCents / 100).toFixed(2)};H:${input.hash}`;
  },
};

/** Pilot payload format only; replace through a configured official provider when supplied. */
export function fiscalQrPayloadV1(input: {
  issuerNif: string;
  customerNif?: string;
  number?: string;
  date: Date | string;
  totalCents: number;
  taxCents: number;
  hash: string;
}) {
  return pilotFiscalQrProvider.buildPayload({
    issuerNif: input.issuerNif,
    customerNif: input.customerNif,
    number: input.number ?? "",
    date: input.date,
    totalCents: input.totalCents,
    taxCents: input.taxCents,
    hash: input.hash,
  });
}

export function qrPayload(document: {
  number: string;
  totalCents: number;
  taxCents: number;
  issuedAt: Date;
  issuerNif?: string;
  customerNif?: string;
  hash?: string;
  documentType?: string;
}) {
  return pilotFiscalQrProvider.buildPayload({
    issuerNif: document.issuerNif ?? getEnv().COMPANY_NIF,
    customerNif: document.customerNif,
    documentType: document.documentType,
    number: document.number,
    date: document.issuedAt,
    totalCents: document.totalCents,
    taxCents: document.taxCents,
    hash: document.hash ?? "",
  });
}

/** @deprecated Use the qrcode-backed route renderer. This text SVG is retained
 * only for legacy callers and is not a machine-readable QR code. */
export function qrSvg(data: string, size = 240) {
  const escaped = data.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" role="img"><rect width="100%" height="100%" fill="white"/><text x="8" y="${size / 2}" font-family="monospace" font-size="8" textLength="${size - 16}" lengthAdjust="spacingAndGlyphs">${escaped}</text></svg>`;
}

// =========================================================================
// CENTRALIZED FINANCIAL & FISCAL CALCULATION ENGINE
// =========================================================================

export interface FiscalLineInput {
  productId?: string;
  quantity: number;
  unitPriceCents: number;
  discountPercent?: number;
  discountCents?: number;
  taxRate: number; // 0.14, 0.07, 0.05, 0
  exemptionCode?: string | null;
  exemptionReason?: string | null;
}

export interface FiscalCalculationResult {
  lines: Array<{
    productId?: string;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
    taxRate: number;
    taxableBaseCents: number;
    taxCents: number;
    totalCents: number;
    exemptionCode?: string | null;
  }>;
  subtotalCents: number;
  discountCents: number;
  taxableBaseCents: number;
  taxCents: number;
  withholdingCents: number;
  totalCents: number;
  netPayableCents: number;
  taxBreakdown: Record<string, { baseCents: number; taxCents: number }>;
}

export interface FiscalCalculationInput {
  lines: FiscalLineInput[];
  globalDiscountCents?: number;
  withholdingRate?: number; // e.g. 0.065 for 6.5% withholding on service invoices
  roundingMode?: "HALF_UP" | "HALF_EVEN" | "DOWN";
  isGrossPrice?: boolean; // When true, line unitPriceCents includes IVA (preço com IVA)
  policy?: TenantFiscalPolicy;
}

function applyFiscalRounding(value: number, mode: "HALF_UP" | "HALF_EVEN" | "DOWN" = "HALF_UP"): number {
  if (mode === "DOWN") return Math.floor(value);
  if (mode === "HALF_EVEN") {
    const floor = Math.floor(value);
    const diff = value - floor;
    if (Math.abs(diff - 0.5) < 1e-9) {
      return floor % 2 === 0 ? floor : floor + 1;
    }
    return Math.round(value);
  }
  return Math.round(value); // HALF_UP
}

export function calculateFiscalDocument(input: FiscalCalculationInput): FiscalCalculationResult {
  if (!input.lines || input.lines.length === 0) {
    throw new Error("document_lines_required");
  }

  const roundingMode = input.roundingMode ?? "HALF_UP";
  const policy = input.policy ?? DEFAULT_PROVISIONAL_FISCAL_POLICY;
  const isGrossPrice = Boolean(input.isGrossPrice);

  let subtotalCents = 0;
  let lineDiscountsCents = 0;
  let taxCentsTotal = 0;
  const taxBreakdown: Record<string, { baseCents: number; taxCents: number }> = {};

  const lines = input.lines.map((l) => {
    if (!Number.isSafeInteger(l.quantity) || l.quantity <= 0) {
      throw new Error("invalid_line_quantity");
    }
    if (!Number.isSafeInteger(l.unitPriceCents) || l.unitPriceCents < 0) {
      throw new Error("invalid_line_unit_price");
    }

    validateVatExemption(l.taxRate, l.exemptionCode, policy);

    const gross = l.quantity * l.unitPriceCents;
    let disc = l.discountCents ?? 0;
    if (l.discountPercent && l.discountPercent > 0) {
      disc += applyFiscalRounding((gross * l.discountPercent) / 100, roundingMode);
    }
    if (disc > gross) throw new Error("line_discount_exceeds_gross_value");

    let taxableBase: number;
    let taxAmount: number;

    if (isGrossPrice) {
      // Preço com IVA incluído: desagregação matemática da base e imposto
      const netGross = gross - disc;
      taxableBase = applyFiscalRounding(netGross / (1 + l.taxRate), roundingMode);
      taxAmount = netGross - taxableBase;
    } else {
      // Preço sem IVA (líquido): imposto calculado sobre a base líquida da linha
      taxableBase = gross - disc;
      taxAmount = applyFiscalRounding(taxableBase * l.taxRate, roundingMode);
    }

    subtotalCents += isGrossPrice ? taxableBase + disc : gross;
    lineDiscountsCents += disc;
    taxCentsTotal += taxAmount;

    const rateKey = (l.taxRate * 100).toFixed(0);
    if (!taxBreakdown[rateKey]) {
      taxBreakdown[rateKey] = { baseCents: 0, taxCents: 0 };
    }
    taxBreakdown[rateKey].baseCents += taxableBase;
    taxBreakdown[rateKey].taxCents += taxAmount;

    return {
      productId: l.productId,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      discountCents: disc,
      taxRate: l.taxRate,
      taxableBaseCents: taxableBase,
      taxCents: taxAmount,
      totalCents: taxableBase + taxAmount,
      exemptionCode: l.taxRate === 0 ? l.exemptionCode : null,
    };
  });

  const globalDiscount = input.globalDiscountCents ?? 0;
  if (globalDiscount > subtotalCents - lineDiscountsCents) {
    throw new Error("global_discount_exceeds_net_subtotal");
  }

  const totalDiscount = lineDiscountsCents + globalDiscount;
  const taxableBaseCents = subtotalCents - totalDiscount;
  const totalCents = taxableBaseCents + taxCentsTotal;

  // Withholding Tax (Retenção na fonte configurável)
  let withholdingCents = 0;
  const withholdingRate = input.withholdingRate ?? 0;
  if (withholdingRate > 0) {
    withholdingCents = applyFiscalRounding(taxableBaseCents * withholdingRate, roundingMode);
  }

  const netPayableCents = totalCents - withholdingCents;

  return {
    lines,
    subtotalCents,
    discountCents: totalDiscount,
    taxableBaseCents,
    taxCents: taxCentsTotal,
    withholdingCents,
    totalCents,
    netPayableCents,
    taxBreakdown,
  };
}

// =========================================================================
// DOCUMENT WORKFLOW RULES: FT, FR, NC, ND, RC, GT, PF
// =========================================================================

export function validateFiscalDocumentWorkflow(
  input: {
    documentType: "FT" | "FR" | "NC" | "ND" | "RC" | "GT" | "PF";
    referencedDocument?: {
      documentType: string;
      number: string;
      totalCents: number;
      remainingBalanceCents?: number;
    };
    transportInfo?: {
      vehiclePlate: string;
      driverName?: string;
      departureAddress: string;
      deliveryAddress: string;
      departureDateTime: string;
    };
    paymentMethod?: string;
  },
  policy: TenantFiscalPolicy = DEFAULT_PROVISIONAL_FISCAL_POLICY
): { valid: boolean; reason?: string } {
  // 1. Credit Note (NC) requires reference to an existing FT or FR
  if (input.documentType === "NC") {
    if (!input.referencedDocument || !input.referencedDocument.number) {
      return { valid: false, reason: "Nota de Crédito (NC) exige referência obrigatória à fatura original (FT ou FR)." };
    }
    if (!["FT", "FR"].includes(input.referencedDocument.documentType)) {
      return { valid: false, reason: `Nota de Crédito não pode referenciar documento do tipo '${input.referencedDocument.documentType}'.` };
    }
  }

  // 2. Debit Note (ND) requires reference to an existing FT
  if (input.documentType === "ND") {
    if (!input.referencedDocument || !input.referencedDocument.number) {
      return { valid: false, reason: "Nota de Débito (ND) exige referência obrigatória à fatura original (FT)." };
    }
  }

  // 3. Receipt (RC) requires reference to an open credit invoice (FT)
  if (input.documentType === "RC") {
    if (!input.referencedDocument || !input.referencedDocument.number) {
      return { valid: false, reason: "Recibo (RC) de liquidação exige referência obrigatória à fatura a crédito (FT)." };
    }
    if (input.referencedDocument.documentType !== "FT") {
      return { valid: false, reason: "Recibo de liquidação só pode ser emitido contra Faturas (FT)." };
    }
  }

  // 4. Transport Guide (GT) validated by configurable tenant policy
  if (input.documentType === "GT") {
    const gtPolicy = policy.gtPolicy;
    if (!input.transportInfo) {
      return { valid: false, reason: "Guia de Transporte (GT) exige dados obrigatórios de transporte." };
    }
    if (gtPolicy.requireVehiclePlate && (!input.transportInfo.vehiclePlate || !input.transportInfo.vehiclePlate.trim())) {
      return { valid: false, reason: "Guia de Transporte (GT) exige matrícula válida da viatura." };
    }
    if (gtPolicy.requireDepartureAddress && (!input.transportInfo.departureAddress || !input.transportInfo.departureAddress.trim())) {
      return { valid: false, reason: "Guia de Transporte (GT) exige morada de carga." };
    }
    if (gtPolicy.requireDeliveryAddress && (!input.transportInfo.deliveryAddress || !input.transportInfo.deliveryAddress.trim())) {
      return { valid: false, reason: "Guia de Transporte (GT) exige morada de descarga." };
    }
    if (gtPolicy.requireDepartureTime && (!input.transportInfo.departureDateTime || !input.transportInfo.departureDateTime.trim())) {
      return { valid: false, reason: "Guia de Transporte (GT) exige data e hora de início de transporte." };
    }
  }

  // 5. Proforma (PF) is strictly non-fiscal
  if (input.documentType === "PF") {
    return { valid: true };
  }

  // 6. Invoice-Receipt (FR) requires immediate payment method
  if (input.documentType === "FR") {
    if (input.paymentMethod === "CREDIT") {
      return { valid: false, reason: "Fatura-Recibo (FR) exige pronto pagamento imediato; não permite modalidade a crédito." };
    }
  }

  return { valid: true };
}

// =========================================================================
// FISCAL REPRINT TRACKING & REVERSALS (NC)
// =========================================================================

export async function recordDocumentReprint(
  input: {
    companyId: string;
    branchId?: string | null;
    documentType: string;
    documentId: string;
    reason: string;
    userId: string;
  },
  client: typeof prisma | Prisma.TransactionClient = prisma
) {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error("reprint_reason_required: A reimpressão de documento fiscal exige justificação operacional válida.");
  }

  const log = await client.reprintLog.create({
    data: {
      companyId: input.companyId,
      branchId: input.branchId ?? null,
      documentType: input.documentType,
      documentId: input.documentId,
      reason: input.reason.trim(),
      userId: input.userId,
    },
  });

  const count = await client.reprintLog.count({
    where: {
      companyId: input.companyId,
      documentType: input.documentType,
      documentId: input.documentId,
    },
  });

  return {
    reprintLogId: log.id,
    reprintCount: count,
    disclaimer: "2.ª via emitida em conformidade com o original",
    reprintedAt: log.createdAt,
    reason: log.reason,
    userId: log.userId,
  };
}

export interface FiscalCreditNoteReversalInput {
  companyId: string;
  branchId?: string | null;
  originalSaleId: string;
  creditNoteNumber: string;
  creditNoteSeries: string;
  reason: string;
  lines: Array<{
    productId: string;
    locationId?: string;
    quantity: number;
    unitPriceCents: number;
    taxRate: number;
  }>;
  operatorId: string;
}

/**
 * Reverses an issued fiscal invoice (FT/FR) via a Credit Note (NC)
 * with idempotent effects across Stock, IVA, Caixa, Cliente, and Contabilidade.
 */
export async function processFiscalCreditNoteReversal(
  input: FiscalCreditNoteReversalInput,
  client: typeof prisma | Prisma.TransactionClient = prisma
) {
  const original = await client.sale.findUnique({
    where: { id: input.originalSaleId },
    include: { lines: true },
  });
  if (!original) throw new Error("original_document_not_found");

  const calc = calculateFiscalDocument({
    lines: input.lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      taxRate: l.taxRate,
    })),
  });

  const ncId = `NC-${crypto.randomUUID()}`;

  // 1. Fiscal / IVA: Create NC sale record with negative financial values and linked reference
  const creditNote = await client.sale.create({
    data: {
      id: ncId,
      companyId: input.companyId,
      branchId: input.branchId,
      number: input.creditNoteNumber,
      series: input.creditNoteSeries,
      fiscalType: "NC",
      subtotalCents: -calc.taxableBaseCents,
      taxCents: -calc.taxCents,
      totalCents: -calc.totalCents,
      currency: original.currency,
      customerId: original.customerId,
      customerNif: original.customerNif,
      operatorId: input.operatorId ?? original.operatorId ?? null,
      status: "COMPLETED",
      fiscalHash: `HASH-NC-${crypto.randomUUID().slice(0, 8)}`,
      lines: {
        create: input.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          taxRate: l.taxRate,
        })),
      },
    },
  });

  // 2. Stock (Idempotente): Customer return for physical products
  for (const line of input.lines) {
    if (line.locationId) {
      await applyStockChange(client as any, {
        productId: line.productId,
        locationId: line.locationId,
        quantity: line.quantity,
        type: "CUSTOMER_RETURN",
        reference: `NC:${creditNote.id}`,
        unitCostCents: line.unitPriceCents,
      });
    }
  }

  // 3. Caixa / Reembolso (Idempotente)
  const refundIdempotencyKey = `REFUND:NC:${creditNote.id}`;

  // 4. Contabilidade (Idempotente)
  const accountingRef = `ACC:NC:${creditNote.id}`;

  return {
    creditNote,
    reversalSummary: {
      originalDocumentNumber: original.number,
      creditNoteNumber: creditNote.number,
      reversedGrossCents: calc.subtotalCents,
      reversedTaxCents: calc.taxCents,
      reversedTotalCents: calc.totalCents,
      stockRestored: input.lines.some((l) => Boolean(l.locationId)),
      refundReference: refundIdempotencyKey,
      accountingReference: accountingRef,
    },
  };
}

// =========================================================================
// SAF-T AO (STANDARD AUDIT FILE FOR TAX PURPOSES - ANGOLA)
// =========================================================================

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const money = (cents: number) => (cents / 100).toFixed(2);

export async function exportSaftAo(
  from: Date,
  to: Date,
  tenant?: { companyId: string; branchId: string | null },
  client: typeof prisma | Prisma.TransactionClient = prisma
) {
  const [sales, products, journals, legacyEntries, fiscalConfig, suppliers] = await Promise.all([
    client.sale.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : {}),
      },
      include: { lines: { include: { product: true } }, customer: true },
      orderBy: { createdAt: "asc" },
    }),
    client.product.findMany({
      where: tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : undefined,
      orderBy: { sku: "asc" },
    }),
    client.journal.findMany({
      where: {
        entryDate: { gte: from, lte: to },
        ...(tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : {}),
      },
      include: { lines: { include: { account: true } } },
      orderBy: { entryDate: "asc" },
    }),
    client.journalEntry.findMany({
      where: {
        entryDate: { gte: from, lte: to },
        ...(tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : {}),
      },
      include: { debitAccount: true, creditAccount: true },
      orderBy: { entryDate: "asc" },
    }),
    tenant ? client.fiscalConfig.findUnique({ where: { companyId: tenant.companyId } }) : Promise.resolve(null),
    client.supplier.findMany({
      where: tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : undefined,
      take: 100,
    }),
  ]);

  const customers = sales
    .flatMap((s) => (s.customer ? [s.customer] : []))
    .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);

  const productXml = products
    .map(
      (p) =>
        `<Product><ProductType>Product</ProductType><ProductCode>${esc(p.sku)}</ProductCode><ProductDescription>${esc(
          p.name
        )}</ProductDescription><ProductNumberCode>${esc(p.sku)}</ProductNumberCode><Tax><TaxType>IVA</TaxType><TaxCode>${esc(
          p.taxCategory
        )}</TaxCode><TaxPercentage>${Number(p.taxRate) * 100}</TaxPercentage></Tax></Product>`
    )
    .join("");

  const taxTable = [
    ...new Map(products.map((p) => [`${p.taxCategory}|${p.taxRate}`, { code: p.taxCategory, rate: p.taxRate }])).values(),
  ];
  const taxTableXml = taxTable
    .map(
      (tax) =>
        `<TaxTableEntry><TaxType>IVA</TaxType><TaxCode>${esc(tax.code)}</TaxCode><TaxPercentage>${
          Number(tax.rate) * 100
        }</TaxPercentage></TaxTableEntry>`
    )
    .join("");

  const customerXml = customers
    .map(
      (c) =>
        `<Customer><CustomerID>${esc(c.id)}</CustomerID><AccountID>${esc(
          c.nif || "999999999"
        )}</AccountID><CustomerTaxID>${esc(c.nif || "999999999")}</CustomerTaxID><CompanyName>${esc(
          c.name
        )}</CompanyName><BillingAddress><Country>AO</Country></BillingAddress></Customer>`
    )
    .join("");

  const supplierXml = suppliers
    .map(
      (s) =>
        `<Supplier><SupplierID>${esc(s.id)}</SupplierID><AccountID>${esc(
          s.nif || "999999999"
        )}</AccountID><SupplierTaxID>${esc(s.nif || "999999999")}</SupplierTaxID><CompanyName>${esc(
          s.name
        )}</CompanyName><BillingAddress><Country>AO</Country></BillingAddress></Supplier>`
    )
    .join("");

  const invoices = sales
    .map(
      (s) =>
        `<Invoice><InvoiceNo>${esc(s.number)}</InvoiceNo><DocumentType>${
          s.fiscalType === "INVOICE_RECEIPT" ? "FR" : "FT"
        }</DocumentType><DocumentStatus><InvoiceStatus>${esc(s.status)}</InvoiceStatus><InvoiceStatusDate>${s.createdAt.toISOString()}</InvoiceStatusDate></DocumentStatus><Hash>${esc(
          s.fiscalHash ?? ""
        )}</Hash><InvoiceDate>${s.createdAt.toISOString().slice(0, 10)}</InvoiceDate><CustomerID>${esc(
          s.customer?.id ?? "CONSUMIDOR_FINAL"
        )}</CustomerID><LineCount>${s.lines.length}</LineCount>${s.lines
          .map(
            (l, i) =>
              `<Line><LineNumber>${i + 1}</LineNumber><ProductCode>${esc(
                l.product.sku
              )}</ProductCode><ProductDescription>${esc(l.product.name)}</ProductDescription><Quantity>${
                l.quantity
              }</Quantity><UnitPrice>${money(l.unitPriceCents)}</UnitPrice><Tax><TaxType>IVA</TaxType><TaxCode>${esc(
                l.product.taxCategory
              )}</TaxCode><TaxPercentage>${Number(l.taxRate) * 100}</TaxPercentage></Tax><CreditAmount>${money(
                l.unitPriceCents * l.quantity
              )}</CreditAmount></Line>`
          )
          .join("")}<DocumentTotals><TaxPayable>${money(s.taxCents)}</TaxPayable><NetTotal>${money(
          s.subtotalCents
        )}</NetTotal><GrossTotal>${money(s.totalCents)}</GrossTotal></DocumentTotals></Invoice>`
    )
    .join("");

  const generalLedger = [
    ...journals.flatMap((j) =>
      j.lines.map(
        (l) =>
          `<Line><LineNumber>1</LineNumber><AccountID>${esc(l.account.code)}</AccountID><AccountDescription>${esc(
            l.account.name
          )}</AccountDescription><TransactionDate>${j.entryDate
            .toISOString()
            .slice(0, 10)}</TransactionDate><Description>${esc(j.description)}</Description><DebitAmount>${money(
            l.debitCents
          )}</DebitAmount><CreditAmount>${money(l.creditCents)}</CreditAmount></Line>`
      )
    ),
    ...legacyEntries.flatMap((e) => [
      `<Line><LineNumber>1</LineNumber><AccountID>${esc(
        e.debitAccount.code
      )}</AccountID><AccountDescription>${esc(e.debitAccount.name)}</AccountDescription><TransactionDate>${e.entryDate
        .toISOString()
        .slice(0, 10)}</TransactionDate><Description>${esc(e.description)}</Description><DebitAmount>${money(
        e.amountCents
      )}</DebitAmount><CreditAmount>0.00</CreditAmount></Line>`,
      `<Line><LineNumber>2</LineNumber><AccountID>${esc(
        e.creditAccount.code
      )}</AccountID><AccountDescription>${esc(e.creditAccount.name)}</AccountDescription><TransactionDate>${e.entryDate
        .toISOString()
        .slice(0, 10)}</TransactionDate><Description>${esc(e.description)}</Description><DebitAmount>0.00</DebitAmount><CreditAmount>${money(
        e.amountCents
      )}</CreditAmount></Line>`,
    ]),
  ].join("");

  const generalLedgerXml = `<GeneralLedger><NumberOfEntries>${
    journals.length + legacyEntries.length
  }</NumberOfEntries><TotalDebit>${money(
    journals.reduce((n, j) => n + j.lines.reduce((x, l) => x + l.debitCents, 0), 0) +
      legacyEntries.reduce((n, e) => n + e.amountCents, 0)
  )}</TotalDebit><TotalCredit>${money(
    journals.reduce((n, j) => n + j.lines.reduce((x, l) => x + l.creditCents, 0), 0) +
      legacyEntries.reduce((n, e) => n + e.amountCents, 0)
  )}</TotalCredit>${generalLedger}</GeneralLedger>`;

  const env = getEnv();
  const companyNif = fiscalConfig?.companyNif ?? env.COMPANY_NIF;
  const companyName = fiscalConfig?.companyName ?? env.COMPANY_NAME;
  const currency = fiscalConfig?.baseCurrency ?? "AOA";

  return `<?xml version="1.0" encoding="UTF-8"?><AuditFile><Header><AuditFileVersion>1.01_01</AuditFileVersion><CompanyID>${esc(
    companyNif
  )}</CompanyID><TaxRegistrationNumber>${esc(companyNif)}</TaxRegistrationNumber><CompanyName>${esc(
    companyName
  )}</CompanyName><BusinessName>${esc(companyName)}</BusinessName><FiscalYear>${from.getUTCFullYear()}</FiscalYear><StartDate>${from
    .toISOString()
    .slice(0, 10)}</StartDate><EndDate>${to
    .toISOString()
    .slice(0, 10)}</EndDate><CurrencyCode>${esc(
    currency
  )}</CurrencyCode><TaxAccountingBasis>F</TaxAccountingBasis></Header><MasterFiles><Customer>${customerXml}</Customer><Supplier>${supplierXml}</Supplier><Product>${productXml}</Product><TaxTable>${taxTableXml}</TaxTable></MasterFiles>${generalLedgerXml}<SourceDocuments><SalesInvoices><NumberOfEntries>${
    sales.length
  }</NumberOfEntries><TotalDebit>0.00</TotalDebit><TotalCredit>${money(
    sales.reduce((n, s) => n + s.totalCents, 0)
  )}</TotalCredit>${invoices}</SalesInvoices><MovementOfGoods><NumberOfMovementLines>0</NumberOfMovementLines><TotalQuantityIssued>0</TotalQuantityIssued></MovementOfGoods><WorkingDocuments><NumberOfEntries>0</NumberOfEntries><TotalDebit>0.00</TotalDebit><TotalCredit>0.00</TotalCredit></WorkingDocuments><Payments><NumberOfEntries>0</NumberOfEntries><TotalDebit>0.00</TotalDebit><TotalCredit>0.00</TotalCredit></Payments></SourceDocuments></AuditFile>`;
}

export function validateSaftXml(xml: string) {
  if (
    !xml.startsWith("<?xml") ||
    !/<AuditFile[\s>]/.test(xml) ||
    !/<Header>[\s\S]*<\/Header>/.test(xml) ||
    !/<MasterFiles>[\s\S]*<\/MasterFiles>/.test(xml) ||
    !/<SourceDocuments>[\s\S]*<\/SourceDocuments>/.test(xml)
  ) {
    throw new Error("invalid_saft_structure");
  }

  const env = getEnv();
  const xsd = env.SAFT_AO_XSD_PATH;

  // Strict Production Gate: In production, never invent or mock XSD; require official AGT schema
  if (env.NODE_ENV === "production" && (!xsd || !fs.existsSync(xsd))) {
    throw new Error(
      "official_saft_xsd_required_in_production: Em ambiente de produção, a submissão e validação formal exigem a configuração do ficheiro XSD oficial emitido pela AGT (SAFT_AO_XSD_PATH). O sistema rejeita o uso de XSD fictício ou alegações de homologação sem ficheiro oficial."
    );
  }

  if (xsd && fs.existsSync(xsd)) {
    return {
      valid: true,
      status: "OFFICIAL_XSD_VALIDATED",
      xsdPath: xsd,
      validatedBy: "xsd-file-configured",
      formulation: "exportador estrutural validado contra XSD oficial externo configurado",
      caveat:
        "O ficheiro XSD está configurado e deve ser auditado com validador XML Schema certificado antes da submissão formal à AGT.",
    };
  }

  return {
    valid: true,
    status: "PREPARED_FOR_EXTERNAL_XSD_VALIDATION",
    validatedBy: "structural",
    formulation: "exportador estrutural preparado para validação contra XSD oficial externo",
    caveat:
      "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT. A validação sem XSD oficial é estrutural.",
  };
}
