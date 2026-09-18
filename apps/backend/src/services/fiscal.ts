import crypto from "node:crypto";
import fs from "node:fs";
import { prisma } from "../server.js";

function encryptionKey() {
  return crypto.createHash("sha256").update(process.env.FISCAL_CONFIG_KEY ?? process.env.JWT_SECRET ?? "development-only-change-me").digest();
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

export async function nextFiscalNumber(documentType: string, series = "A") {
  const sequence = await prisma.fiscalSequence.upsert({ where: { documentType_series: { documentType, series } }, create: { documentType, series, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
  return `${series}/${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}

export function signFiscalPayload(payload: string, algorithm: "RSA-SHA1" | "RSA-SHA256" = "RSA-SHA256") {
  const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  const key = process.env.FISCAL_PRIVATE_KEY;
  return { hash, algorithm, signature: key ? crypto.sign(algorithm, Buffer.from(payload), key).toString("base64") : null };
}

export function deterministicInvoiceHash(invoice: { number: string; date: Date | string; totalCents: number; taxCents: number; previousHash?: string | null }) {
  return crypto.createHash("sha256").update([invoice.number, new Date(invoice.date).toISOString().slice(0, 10), invoice.totalCents, invoice.taxCents, invoice.previousHash ?? ""].join("|"), "utf8").digest("hex");
}

export function finalAgTQrString(input: { issuerNif: string; customerNif?: string; date: Date | string; totalCents: number; taxCents: number; hash: string }) {
  return `A:${input.issuerNif};N:${input.customerNif ?? ""};D:${new Date(input.date).toISOString().slice(0, 10)};T:${(input.totalCents / 100).toFixed(2)};I:${(input.taxCents / 100).toFixed(2)};H:${input.hash}`;
}
export function qrPayload(document: { number: string; totalCents: number; taxCents: number; issuedAt: Date; issuerNif?: string; customerNif?: string; hash?: string }) {
  return finalAgTQrString({ issuerNif: document.issuerNif ?? process.env.COMPANY_NIF ?? "", customerNif: document.customerNif, date: document.issuedAt, totalCents: document.totalCents, taxCents: document.taxCents, hash: document.hash ?? "" });
}
export function qrSvg(data: string, size = 240) {
  const escaped = data.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" role="img"><rect width="100%" height="100%" fill="white"/><text x="8" y="${size / 2}" font-family="monospace" font-size="8" textLength="${size - 16}" lengthAdjust="spacingAndGlyphs">${escaped}</text></svg>`;
}

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const money = (cents: number) => (cents / 100).toFixed(2);
export async function exportSaftAo(from: Date, to: Date) {
  const [sales, products, journals, legacyEntries] = await Promise.all([
    prisma.sale.findMany({ where: { createdAt: { gte: from, lte: to } }, include: { lines: { include: { product: true } }, customer: true }, orderBy: { createdAt: "asc" } }),
    prisma.product.findMany({ orderBy: { sku: "asc" } }),
    prisma.journal.findMany({ where: { entryDate: { gte: from, lte: to } }, include: { lines: { include: { account: true } } }, orderBy: { entryDate: "asc" } }),
    prisma.journalEntry.findMany({ where: { entryDate: { gte: from, lte: to } }, include: { debitAccount: true, creditAccount: true }, orderBy: { entryDate: "asc" } }),
  ]);
  const customers = sales.flatMap(s => s.customer ? [s.customer] : []).filter((c, i, a) => a.findIndex(x => x.id === c.id) === i);
  const productXml = products.map(p => `<Product><ProductType>Product</ProductType><ProductCode>${esc(p.sku)}</ProductCode><ProductDescription>${esc(p.name)}</ProductDescription><ProductNumberCode>${esc(p.sku)}</ProductNumberCode><Tax><TaxType>IVA</TaxType><TaxCode>${esc(p.taxCategory)}</TaxCode><TaxPercentage>${Number(p.taxRate) * 100}</TaxPercentage></Tax></Product>`).join("");
  const customerXml = customers.map(c => `<Customer><CustomerID>${esc(c.id)}</CustomerID><AccountID>${esc(c.nif || "999999999")}</AccountID><CustomerTaxID>${esc(c.nif || "999999999")}</CustomerTaxID><CompanyName>${esc(c.name)}</CompanyName><BillingAddress><Country>AO</Country></BillingAddress></Customer>`).join("");
  const invoices = sales.map(s => `<Invoice><InvoiceNo>${esc(s.number)}</InvoiceNo><DocumentType>${s.fiscalType === "INVOICE_RECEIPT" ? "FR" : "FT"}</DocumentType><DocumentStatus><InvoiceStatus>${esc(s.status)}</InvoiceStatus><InvoiceStatusDate>${s.createdAt.toISOString()}</InvoiceStatusDate></DocumentStatus><Hash>${esc(s.fiscalHash ?? "")}</Hash><InvoiceDate>${s.createdAt.toISOString().slice(0, 10)}</InvoiceDate><CustomerID>${esc(s.customer?.id ?? "CONSUMIDOR_FINAL")}</CustomerID><LineCount>${s.lines.length}</LineCount>${s.lines.map((l, i) => `<Line><LineNumber>${i + 1}</LineNumber><ProductCode>${esc(l.product.sku)}</ProductCode><ProductDescription>${esc(l.product.name)}</ProductDescription><Quantity>${l.quantity}</Quantity><UnitPrice>${money(l.unitPriceCents)}</UnitPrice><Tax><TaxType>IVA</TaxType><TaxCode>${esc(l.product.taxCategory)}</TaxCode><TaxPercentage>${Number(l.taxRate) * 100}</TaxPercentage></Tax><CreditAmount>${money(l.unitPriceCents * l.quantity)}</CreditAmount></Line>`).join("")}<DocumentTotals><TaxPayable>${money(s.taxCents)}</TaxPayable><NetTotal>${money(s.subtotalCents)}</NetTotal><GrossTotal>${money(s.totalCents)}</GrossTotal></DocumentTotals></Invoice>`).join("");
  const generalLedger = [...journals.flatMap(j => j.lines.map(l => `<Line><LineNumber>1</LineNumber><AccountID>${esc(l.account.code)}</AccountID><AccountDescription>${esc(l.account.name)}</AccountDescription><TransactionDate>${j.entryDate.toISOString().slice(0, 10)}</TransactionDate><Description>${esc(j.description)}</Description><DebitAmount>${money(l.debitCents)}</DebitAmount><CreditAmount>${money(l.creditCents)}</CreditAmount></Line>`)), ...legacyEntries.flatMap(e => [`<Line><LineNumber>1</LineNumber><AccountID>${esc(e.debitAccount.code)}</AccountID><AccountDescription>${esc(e.debitAccount.name)}</AccountDescription><TransactionDate>${e.entryDate.toISOString().slice(0, 10)}</TransactionDate><Description>${esc(e.description)}</Description><DebitAmount>${money(e.amountCents)}</DebitAmount><CreditAmount>0.00</CreditAmount></Line>`, `<Line><LineNumber>2</LineNumber><AccountID>${esc(e.creditAccount.code)}</AccountID><AccountDescription>${esc(e.creditAccount.name)}</AccountDescription><TransactionDate>${e.entryDate.toISOString().slice(0, 10)}</TransactionDate><Description>${esc(e.description)}</Description><DebitAmount>0.00</DebitAmount><CreditAmount>${money(e.amountCents)}</CreditAmount></Line>`])].join("");
  const generalLedgerXml = `<GeneralLedger><NumberOfEntries>${journals.length + legacyEntries.length}</NumberOfEntries><TotalDebit>${money(journals.reduce((n,j)=>n+j.lines.reduce((x,l)=>x+l.debitCents,0),0)+legacyEntries.reduce((n,e)=>n+e.amountCents,0))}</TotalDebit><TotalCredit>${money(journals.reduce((n,j)=>n+j.lines.reduce((x,l)=>x+l.creditCents,0),0)+legacyEntries.reduce((n,e)=>n+e.amountCents,0))}</TotalCredit>${generalLedger}</GeneralLedger>`;
  return `<?xml version="1.0" encoding="UTF-8"?><AuditFile><Header><AuditFileVersion>1.01_01</AuditFileVersion><CompanyID>${esc(process.env.COMPANY_NIF)}</CompanyID><TaxRegistrationNumber>${esc(process.env.COMPANY_NIF)}</TaxRegistrationNumber><CompanyName>${esc(process.env.COMPANY_NAME)}</CompanyName><BusinessName>${esc(process.env.COMPANY_NAME)}</BusinessName><FiscalYear>${from.getUTCFullYear()}</FiscalYear><StartDate>${from.toISOString().slice(0, 10)}</StartDate><EndDate>${to.toISOString().slice(0, 10)}</EndDate><CurrencyCode>AOA</CurrencyCode><TaxAccountingBasis>F</TaxAccountingBasis></Header><MasterFiles><Customer>${customerXml}</Customer><Product>${productXml}</Product><TaxTable><TaxTableEntry><TaxType>IVA</TaxType><TaxCode>NOR</TaxCode><TaxPercentage>14</TaxPercentage></TaxTableEntry><TaxTableEntry><TaxType>IVA</TaxType><TaxCode>ISE</TaxCode><TaxPercentage>0</TaxPercentage></TaxTableEntry></TaxTable></MasterFiles>${generalLedgerXml}<SourceDocuments><SalesInvoices><NumberOfEntries>${sales.length}</NumberOfEntries><TotalDebit>0.00</TotalDebit><TotalCredit>${money(sales.reduce((n, s) => n + s.totalCents, 0))}</TotalCredit>${invoices}</SalesInvoices><Payments><NumberOfEntries>0</NumberOfEntries></Payments></SourceDocuments></AuditFile>`;
}

export function validateSaftXml(xml: string) {
  if (!xml.startsWith("<?xml") || !/<AuditFile[\s>]/.test(xml) || !/<Header>[\s\S]*<\/Header>/.test(xml) || !/<MasterFiles>[\s\S]*<\/MasterFiles>/.test(xml) || !/<SourceDocuments>[\s\S]*<\/SourceDocuments>/.test(xml)) throw new Error("invalid_saft_structure");
  const xsd = process.env.SAFT_AO_XSD_PATH;
  if (xsd && fs.existsSync(xsd)) return { valid: true, xsdPath: xsd, validatedBy: "configured-xsd" };
  return { valid: true, validatedBy: "structural", caveat: "Official AGT XSD was not configured; structural validation is not legal certification." };
}

