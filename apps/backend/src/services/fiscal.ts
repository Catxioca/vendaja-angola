import crypto from "node:crypto";
import fs from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getEnv } from "../config/env.js";

function encryptionKey() {
  return crypto.createHash("sha256").update(getEnv().FISCAL_CONFIG_KEY).digest();
}
export function encryptFiscalSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

/** Configurable placeholders: confirm code meanings against the current AGT publication. */
export const AGT_EXEMPTION_CODES: Record<string, string> = {
  M00: "Configurable AGT code; confirm current legal reason before use",
  M02: "Configurable AGT code; confirm current legal reason before use",
  M04: "Configurable AGT code; confirm current legal reason before use",
};

export function validateVatExemption(taxRate: number, exemptionCode?: string | null) {
  if (taxRate === 0 && !exemptionCode) throw new Error("vat_exemption_code_required");
  if (taxRate === 0 && exemptionCode && !/^[A-Z]\d{2}$/.test(exemptionCode)) throw new Error("invalid_vat_exemption_code");
  return true;
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
 * Versioned extension point for an official fiscal hash contract. The pilot
 * implementation intentionally preserves the historic hash for compatibility;
 * it must not be represented as an AGT-prescribed algorithm.
 */
export interface FiscalHashProvider {
  readonly id: string;
  readonly official: boolean;
  hash(input: FiscalHashInput): string;
}

export const pilotFiscalHashProvider: FiscalHashProvider = {
  id: "vendaja-pilot-sha256-v1",
  official: false,
  hash(invoice) {
    return crypto.createHash("sha256").update([invoice.number, new Date(invoice.date).toISOString().slice(0, 10), invoice.subtotalCents ?? "", invoice.totalCents, invoice.taxCents, invoice.previousHash ?? ""].join("|"), "utf8").digest("hex");
  },
};

export async function nextFiscalNumber(
  input: { documentType: string; series?: string; issuedAt: Date; tenant: FiscalTenant },
  client: Pick<Prisma.TransactionClient, "fiscalSequence"> | typeof prisma = prisma,
) {
  const series = input.series ?? "A";
  const fiscalYear = input.issuedAt.getUTCFullYear();
  const branchScopeId = input.tenant.branchId ?? "__COMPANY__";
  const sequence = await client.fiscalSequence.upsert({
    where: { companyId_branchScopeId_documentType_series_fiscalYear: { companyId: input.tenant.companyId, branchScopeId, documentType: input.documentType, series, fiscalYear } },
    create: { companyId: input.tenant.companyId, branchId: input.tenant.branchId, branchScopeId, documentType: input.documentType, series, fiscalYear, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  });
  if (sequence.closedAt) throw new Error("fiscal_series_closed");
  return `${series}/${input.documentType}/${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}

export function signFiscalPayload(payload: string, algorithm: "RSA-SHA1" | "RSA-SHA256" = "RSA-SHA256") {
  const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  const key = getEnv().FISCAL_PRIVATE_KEY;
  return { hash, algorithm, signature: key ? crypto.sign(algorithm, Buffer.from(payload), key).toString("base64") : null };
}

export function deterministicInvoiceHash(invoice: FiscalHashInput) {
  return pilotFiscalHashProvider.hash(invoice);
}

/** Pilot payload format only; replace through a configured official provider when supplied. */
export function fiscalQrPayloadV1(input: { issuerNif: string; customerNif?: string; number?: string; date: Date | string; totalCents: number; taxCents: number; hash: string }) {
  return `A:${input.issuerNif};F:${input.number ?? ""};N:${input.customerNif ?? ""};D:${new Date(input.date).toISOString().slice(0, 10)};T:${(input.totalCents / 100).toFixed(2)};I:${(input.taxCents / 100).toFixed(2)};H:${input.hash}`;
}
export function qrPayload(document: { number: string; totalCents: number; taxCents: number; issuedAt: Date; issuerNif?: string; customerNif?: string; hash?: string }) {
  return fiscalQrPayloadV1({ issuerNif: document.issuerNif ?? getEnv().COMPANY_NIF, customerNif: document.customerNif, number: document.number, date: document.issuedAt, totalCents: document.totalCents, taxCents: document.taxCents, hash: document.hash ?? "" });
}
/** @deprecated Use the qrcode-backed route renderer. This text SVG is retained
 * only for legacy callers and is not a machine-readable QR code. */
export function qrSvg(data: string, size = 240) {
  const escaped = data.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" role="img"><rect width="100%" height="100%" fill="white"/><text x="8" y="${size / 2}" font-family="monospace" font-size="8" textLength="${size - 16}" lengthAdjust="spacingAndGlyphs">${escaped}</text></svg>`;
}

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const money = (cents: number) => (cents / 100).toFixed(2);
export async function exportSaftAo(from: Date, to: Date, tenant?: { companyId: string; branchId: string | null }) {
  const [sales, products, journals, legacyEntries, fiscalConfig] = await Promise.all([
    prisma.sale.findMany({ where: { createdAt: { gte: from, lte: to }, ...(tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : {}) }, include: { lines: { include: { product: true } }, customer: true }, orderBy: { createdAt: "asc" } }),
    prisma.product.findMany({ where: tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : undefined, orderBy: { sku: "asc" } }),
    prisma.journal.findMany({ where: { entryDate: { gte: from, lte: to }, ...(tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : {}) }, include: { lines: { include: { account: true } } }, orderBy: { entryDate: "asc" } }),
    prisma.journalEntry.findMany({ where: { entryDate: { gte: from, lte: to }, ...(tenant ? { companyId: tenant.companyId, branchId: tenant.branchId } : {}) }, include: { debitAccount: true, creditAccount: true }, orderBy: { entryDate: "asc" } }),
    tenant ? prisma.fiscalConfig.findUnique({ where: { companyId: tenant.companyId } }) : Promise.resolve(null),
  ]);
  const customers = sales.flatMap(s => s.customer ? [s.customer] : []).filter((c, i, a) => a.findIndex(x => x.id === c.id) === i);
  const productXml = products.map(p => `<Product><ProductType>Product</ProductType><ProductCode>${esc(p.sku)}</ProductCode><ProductDescription>${esc(p.name)}</ProductDescription><ProductNumberCode>${esc(p.sku)}</ProductNumberCode><Tax><TaxType>IVA</TaxType><TaxCode>${esc(p.taxCategory)}</TaxCode><TaxPercentage>${Number(p.taxRate) * 100}</TaxPercentage></Tax></Product>`).join("");
  const taxTable = [...new Map(products.map((p) => [`${p.taxCategory}|${p.taxRate}`, { code: p.taxCategory, rate: p.taxRate }])).values()];
  const taxTableXml = taxTable.map((tax) => `<TaxTableEntry><TaxType>IVA</TaxType><TaxCode>${esc(tax.code)}</TaxCode><TaxPercentage>${Number(tax.rate) * 100}</TaxPercentage></TaxTableEntry>`).join("");
  const customerXml = customers.map(c => `<Customer><CustomerID>${esc(c.id)}</CustomerID><AccountID>${esc(c.nif || "999999999")}</AccountID><CustomerTaxID>${esc(c.nif || "999999999")}</CustomerTaxID><CompanyName>${esc(c.name)}</CompanyName><BillingAddress><Country>AO</Country></BillingAddress></Customer>`).join("");
  const invoices = sales.map(s => `<Invoice><InvoiceNo>${esc(s.number)}</InvoiceNo><DocumentType>${s.fiscalType === "INVOICE_RECEIPT" ? "FR" : "FT"}</DocumentType><DocumentStatus><InvoiceStatus>${esc(s.status)}</InvoiceStatus><InvoiceStatusDate>${s.createdAt.toISOString()}</InvoiceStatusDate></DocumentStatus><Hash>${esc(s.fiscalHash ?? "")}</Hash><InvoiceDate>${s.createdAt.toISOString().slice(0, 10)}</InvoiceDate><CustomerID>${esc(s.customer?.id ?? "CONSUMIDOR_FINAL")}</CustomerID><LineCount>${s.lines.length}</LineCount>${s.lines.map((l, i) => `<Line><LineNumber>${i + 1}</LineNumber><ProductCode>${esc(l.product.sku)}</ProductCode><ProductDescription>${esc(l.product.name)}</ProductDescription><Quantity>${l.quantity}</Quantity><UnitPrice>${money(l.unitPriceCents)}</UnitPrice><Tax><TaxType>IVA</TaxType><TaxCode>${esc(l.product.taxCategory)}</TaxCode><TaxPercentage>${Number(l.taxRate) * 100}</TaxPercentage></Tax><CreditAmount>${money(l.unitPriceCents * l.quantity)}</CreditAmount></Line>`).join("")}<DocumentTotals><TaxPayable>${money(s.taxCents)}</TaxPayable><NetTotal>${money(s.subtotalCents)}</NetTotal><GrossTotal>${money(s.totalCents)}</GrossTotal></DocumentTotals></Invoice>`).join("");
  const generalLedger = [...journals.flatMap(j => j.lines.map(l => `<Line><LineNumber>1</LineNumber><AccountID>${esc(l.account.code)}</AccountID><AccountDescription>${esc(l.account.name)}</AccountDescription><TransactionDate>${j.entryDate.toISOString().slice(0, 10)}</TransactionDate><Description>${esc(j.description)}</Description><DebitAmount>${money(l.debitCents)}</DebitAmount><CreditAmount>${money(l.creditCents)}</CreditAmount></Line>`)), ...legacyEntries.flatMap(e => [`<Line><LineNumber>1</LineNumber><AccountID>${esc(e.debitAccount.code)}</AccountID><AccountDescription>${esc(e.debitAccount.name)}</AccountDescription><TransactionDate>${e.entryDate.toISOString().slice(0, 10)}</TransactionDate><Description>${esc(e.description)}</Description><DebitAmount>${money(e.amountCents)}</DebitAmount><CreditAmount>0.00</CreditAmount></Line>`, `<Line><LineNumber>2</LineNumber><AccountID>${esc(e.creditAccount.code)}</AccountID><AccountDescription>${esc(e.creditAccount.name)}</AccountDescription><TransactionDate>${e.entryDate.toISOString().slice(0, 10)}</TransactionDate><Description>${esc(e.description)}</Description><DebitAmount>0.00</DebitAmount><CreditAmount>${money(e.amountCents)}</CreditAmount></Line>`])].join("");
  const generalLedgerXml = `<GeneralLedger><NumberOfEntries>${journals.length + legacyEntries.length}</NumberOfEntries><TotalDebit>${money(journals.reduce((n,j)=>n+j.lines.reduce((x,l)=>x+l.debitCents,0),0)+legacyEntries.reduce((n,e)=>n+e.amountCents,0))}</TotalDebit><TotalCredit>${money(journals.reduce((n,j)=>n+j.lines.reduce((x,l)=>x+l.creditCents,0),0)+legacyEntries.reduce((n,e)=>n+e.amountCents,0))}</TotalCredit>${generalLedger}</GeneralLedger>`;
  const env = getEnv();
  // Environment values are bootstrap fallbacks only. A persisted tenant
  // configuration is authoritative once present.
  const companyNif = fiscalConfig?.companyNif ?? env.COMPANY_NIF;
  const companyName = fiscalConfig?.companyName ?? env.COMPANY_NAME;
  const currency = fiscalConfig?.baseCurrency ?? "AOA";
  return `<?xml version="1.0" encoding="UTF-8"?><AuditFile><Header><AuditFileVersion>1.01_01</AuditFileVersion><CompanyID>${esc(companyNif)}</CompanyID><TaxRegistrationNumber>${esc(companyNif)}</TaxRegistrationNumber><CompanyName>${esc(companyName)}</CompanyName><BusinessName>${esc(companyName)}</BusinessName><FiscalYear>${from.getUTCFullYear()}</FiscalYear><StartDate>${from.toISOString().slice(0, 10)}</StartDate><EndDate>${to.toISOString().slice(0, 10)}</EndDate><CurrencyCode>${esc(currency)}</CurrencyCode><TaxAccountingBasis>F</TaxAccountingBasis></Header><MasterFiles><Customer>${customerXml}</Customer><Product>${productXml}</Product><TaxTable>${taxTableXml}</TaxTable></MasterFiles>${generalLedgerXml}<SourceDocuments><SalesInvoices><NumberOfEntries>${sales.length}</NumberOfEntries><TotalDebit>0.00</TotalDebit><TotalCredit>${money(sales.reduce((n, s) => n + s.totalCents, 0))}</TotalCredit>${invoices}</SalesInvoices><Payments><NumberOfEntries>0</NumberOfEntries></Payments></SourceDocuments></AuditFile>`;
}

export function validateSaftXml(xml: string) {
  if (!xml.startsWith("<?xml") || !/<AuditFile[\s>]/.test(xml) || !/<Header>[\s\S]*<\/Header>/.test(xml) || !/<MasterFiles>[\s\S]*<\/MasterFiles>/.test(xml) || !/<SourceDocuments>[\s\S]*<\/SourceDocuments>/.test(xml)) throw new Error("invalid_saft_structure");
  const env = getEnv();
  const xsd = env.SAFT_AO_XSD_PATH;
  if (env.NODE_ENV === "production" && (!xsd || !fs.existsSync(xsd))) throw new Error("official_saft_xsd_required_in_production");
  if (xsd && fs.existsSync(xsd)) return { valid: true, xsdPath: xsd, validatedBy: "xsd-file-configured", caveat: "The XSD file is configured but must be validated with an approved XML Schema validator before submission." };
  return { valid: true, validatedBy: "structural", caveat: "Official AGT XSD was not configured; structural validation is not legal certification." };
}
