import QRCode from "qrcode";
import {
  type CommercialDocument,
  type PaperFormat,
  DOCUMENT_TYPE_METADATA,
  formatKwanza,
  formatAgtCertificationMention,
  PAPER_FORMAT_INFO,
} from "@angola/shared";
import type { EnterprisePrinterSettings } from "./print-engine.js";

export interface HtmlTemplateOptions {
  isDiagnostic?: boolean;
  watermark?: string;
  qrDataUrl?: string;
  zoom?: number;
}

/**
 * Returns the CSS pixel width for sandboxed iframe preview according to physical paper dimensions.
 */
export function getPaperPixelWidth(format: PaperFormat): number {
  switch (format) {
    case "58mm":
      return 204; // ~54mm rendered preview width
    case "80mm":
      return 287; // ~76mm rendered preview width
    case "a5":
      return 559; // 148mm
    case "letter":
      return 816; // 215.9mm
    case "a4":
    default:
      return 794; // 210mm
  }
}

/**
 * Embeds complete, isolated CSS styles tailored for crisp thermal receipt and enterprise A4 printing.
 */
function getEmbeddedPrintCss(format: PaperFormat): string {
  let pageRule = "";
  switch (format) {
    case "58mm":
      pageRule = `@page { size: 58mm auto; margin: 0mm; }`;
      break;
    case "80mm":
      pageRule = `@page { size: 80mm auto; margin: 0mm; }`;
      break;
    case "a5":
      pageRule = `@page { size: A5 portrait; margin: 8mm 10mm; }`;
      break;
    case "letter":
      pageRule = `@page { size: letter portrait; margin: 10mm 12mm; }`;
      break;
    case "a4":
    default:
      pageRule = `@page { size: A4 portrait; margin: 10mm 12mm; }`;
      break;
  }

  return `
    ${pageRule}

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 100%;
      height: auto;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-feature-settings: "tnum" 1;
    }

    /* ========================================================
       58mm THERMAL RECEIPT STYLES (Narrow Roll / POS-58)
       Printable Area: 48mm - 52mm (384 dots @ 203 DPI)
       ======================================================== */
    .receipt-58mm {
      width: 48mm;
      max-width: 48mm;
      margin: 0 auto;
      padding: 2mm 1mm 8mm 1mm;
      font-family: 'Courier New', Courier, ui-monospace, monospace;
      font-size: 10px;
      line-height: 1.25;
      color: #000000;
      word-wrap: break-word;
    }

    .r58-center { text-align: center; }
    .r58-right { text-align: right; }
    .r58-bold { font-weight: 700; }
    .r58-divider {
      border-top: 1px dashed #000000;
      margin: 4px 0;
    }
    .r58-divider-double {
      border-top: 2px solid #000000;
      margin: 4px 0;
    }
    .r58-divider-dotted {
      border-top: 1px dotted #444444;
      margin: 3px 0;
    }

    .r58-brand-title {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      line-height: 1.2;
      margin-bottom: 2px;
    }
    .r58-meta {
      font-size: 9px;
      line-height: 1.2;
    }
    .r58-badge {
      border: 1px solid #000000;
      padding: 3px;
      margin: 4px 0;
      text-align: center;
      font-weight: 700;
      font-size: 10px;
    }
    .r58-badge-sub {
      font-size: 8.5px;
      font-weight: normal;
      margin-top: 2px;
    }

    /* 58mm Two-Line Items layout */
    .r58-item {
      margin-bottom: 4px;
    }
    .r58-item-name {
      font-weight: 600;
      font-size: 9.5px;
      line-height: 1.2;
    }
    .r58-item-row {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
    }

    .r58-row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
      font-size: 9.5px;
    }
    .r58-row-total {
      font-size: 12px;
      font-weight: 800;
      margin: 4px 0;
    }

    .r58-tax-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5px;
      margin: 3px 0;
    }
    .r58-tax-table th {
      border-bottom: 1px dotted #000000;
      padding: 2px 0;
    }
    .r58-tax-table td {
      padding: 2px 0;
    }

    .r58-hash-block {
      font-size: 8.5px;
      text-align: center;
      margin: 4px 0;
      font-weight: 700;
    }
    .r58-qr {
      display: flex;
      justify-content: center;
      margin: 4px 0;
    }
    .r58-qr img {
      width: 95px;
      height: 95px;
      image-rendering: pixelated;
    }
    .r58-footer-msg {
      font-size: 8px;
      text-align: center;
      margin-top: 4px;
      line-height: 1.2;
    }
    .r58-cut-space {
      height: 10mm;
      text-align: center;
      font-size: 8px;
      color: #777777;
      padding-top: 4mm;
    }

    /* ========================================================
       80mm THERMAL RECEIPT STYLES (Standard Retail POS)
       Printable Area: 72mm - 76mm (576 dots @ 203 DPI)
       ======================================================== */
    .receipt-80mm {
      width: 72mm;
      max-width: 72mm;
      margin: 0 auto;
      padding: 3mm 2mm 10mm 2mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.3;
      color: #000000;
    }

    .r80-center { text-align: center; }
    .r80-right { text-align: right; }
    .r80-bold { font-weight: 700; }
    .r80-divider {
      border-top: 1px dashed #000000;
      margin: 5px 0;
    }
    .r80-divider-double {
      border-top: 2px solid #000000;
      margin: 5px 0;
    }
    .r80-divider-dotted {
      border-top: 1px dotted #666666;
      margin: 4px 0;
    }

    .r80-brand-title {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 2px;
      letter-spacing: -0.3px;
    }
    .r80-meta {
      font-size: 10px;
      line-height: 1.25;
      color: #222222;
    }
    .r80-badge {
      border: 1px solid #000000;
      padding: 4px;
      margin: 5px 0;
      text-align: center;
    }
    .r80-badge-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .r80-badge-num {
      font-size: 12.5px;
      font-weight: 800;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .r80-customer-box {
      border: 1px solid #777777;
      padding: 4px 6px;
      margin: 4px 0;
      font-size: 10px;
      background: #fafafa;
    }

    .r80-table {
      width: 100%;
      border-collapse: collapse;
      margin: 5px 0;
      font-size: 10px;
    }
    .r80-table th {
      border-bottom: 1px solid #000000;
      padding: 3px 0;
      font-weight: 700;
      text-transform: uppercase;
    }
    .r80-table td {
      padding: 3px 0;
      vertical-align: top;
    }
    .r80-table .td-art { text-align: left; }
    .r80-table .td-qty { text-align: center; width: 30px; }
    .r80-table .td-price { text-align: right; width: 55px; }
    .r80-table .td-tax { text-align: center; width: 35px; }
    .r80-table .td-tot { text-align: right; width: 60px; font-weight: 600; }

    .r80-row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
      font-size: 10.5px;
    }
    .r80-row-bold {
      font-weight: 700;
    }
    .r80-row-grand {
      font-size: 14px;
      font-weight: 800;
      padding: 3px 0;
      border-top: 1px solid #000000;
      border-bottom: 1px solid #000000;
      margin: 4px 0;
    }

    .r80-tax-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin: 4px 0;
    }
    .r80-tax-table th {
      border-bottom: 1px dotted #000000;
      padding: 2px 0;
      text-align: left;
    }
    .r80-tax-table td {
      padding: 2px 0;
    }

    .r80-qr {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 6px 0;
    }
    .r80-qr img {
      width: 115px;
      height: 115px;
      image-rendering: pixelated;
    }
    .r80-hash-block {
      font-size: 9px;
      text-align: center;
      margin: 4px 0;
      font-family: ui-monospace, monospace;
      font-weight: 700;
    }
    .r80-footer-msg {
      font-size: 8.5px;
      text-align: center;
      margin-top: 4px;
      line-height: 1.3;
      color: #333333;
    }
    .r80-cut-space {
      height: 12mm;
      text-align: center;
      font-size: 8px;
      color: #888888;
      padding-top: 5mm;
    }

    /* ========================================================
       OFFICE A4 / A5 / LETTER CORPORATE ERP LAYOUT
       (Primavera, SAP Business One, Odoo Enterprise Standard)
       ======================================================== */
    .office-document {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
      padding: 6mm 4mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11.5px;
      line-height: 1.4;
      color: #1e293b;
      position: relative;
    }

    .office-watermark {
      position: absolute;
      top: 35%;
      left: 10%;
      right: 10%;
      text-align: center;
      font-size: 64px;
      font-weight: 900;
      color: rgba(220, 38, 38, 0.08);
      transform: rotate(-30deg);
      pointer-events: none;
      user-select: none;
      z-index: 100;
      letter-spacing: 6px;
      text-transform: uppercase;
    }

    .office-header-band {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }

    .office-brand {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      flex: 1;
    }
    .office-logo-badge {
      width: 52px;
      height: 52px;
      background: #0f172a;
      color: #e2b252;
      border-radius: 6px;
      display: grid;
      place-items: center;
      font-weight: 900;
      font-size: 22px;
      flex-shrink: 0;
    }
    .office-company-info h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }
    .office-trade-name {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
    }
    .office-company-meta {
      font-size: 10px;
      color: #475569;
      line-height: 1.35;
      margin-top: 3px;
    }

    .office-doc-card {
      width: 240px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      flex-shrink: 0;
    }
    .office-doc-title {
      font-size: 12px;
      font-weight: 800;
      color: #1e40af;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .office-doc-number {
      font-size: 16px;
      font-weight: 900;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: #0f172a;
      margin-bottom: 6px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }
    .office-doc-meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      margin-bottom: 2px;
    }

    .office-client-band {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 14px;
    }
    .office-client-box {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 14px;
      background: #ffffff;
    }
    .office-client-box-title {
      font-size: 9.5px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .office-client-name {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .office-client-meta {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.35;
    }

    .office-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    .office-table thead tr {
      background: #0f172a;
      color: #ffffff;
    }
    .office-table th {
      padding: 7px 8px;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .office-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .office-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .office-bottom-grid {
      display: grid;
      grid-template-columns: 1.35fr 1fr;
      gap: 16px;
      margin-bottom: 14px;
    }
    .office-bottom-left {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .office-mini-header {
      font-size: 9px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .office-mini-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    .office-mini-table th {
      background: #f1f5f9;
      color: #475569;
      padding: 4px 6px;
      font-size: 8.5px;
      font-weight: 700;
      border-bottom: 1px solid #cbd5e1;
    }
    .office-mini-table td {
      padding: 4px 6px;
      border-bottom: 1px solid #e2e8f0;
    }

    .office-bank-details {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 9.5px;
    }
    .office-bank-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 2px;
    }

    .office-totals-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .office-totals-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #475569;
    }
    .office-totals-row span:last-child {
      font-weight: 600;
      color: #0f172a;
      font-family: ui-monospace, monospace;
    }
    .office-totals-divider {
      border-bottom: 1px solid #cbd5e1;
      margin: 4px 0;
    }
    .office-grand-total-box {
      background: #0f172a;
      color: #ffffff;
      padding: 8px 12px;
      border-radius: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grand-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .grand-val {
      font-size: 16px;
      font-weight: 900;
      font-family: ui-monospace, monospace;
    }

    .office-footer-band {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      border-top: 1px solid #cbd5e1;
      padding-top: 10px;
      margin-top: 10px;
    }
    .office-footer-legal {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 9px;
      color: #475569;
    }
    .office-hash-line {
      font-size: 10px;
      color: #0f172a;
      font-weight: 800;
      font-family: ui-monospace, monospace;
    }
    .office-qr-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .office-qr-box img {
      width: 85px;
      height: 85px;
    }
    .office-signature-box {
      width: 170px;
      text-align: center;
      font-size: 9px;
      color: #475569;
    }
    .office-signature-line {
      border-bottom: 1px solid #000000;
      margin-bottom: 4px;
      height: 30px;
    }

    /* Test & Diagnostic Alignment Elements */
    .diag-banner {
      background: #fef08a;
      border: 1px dashed #ca8a04;
      color: #713f12;
      padding: 4px;
      text-align: center;
      margin-bottom: 6px;
      font-size: 9.5px;
      font-weight: 700;
    }
    .diag-ruler {
      font-family: ui-monospace, monospace;
      font-size: 8.5px;
      margin-top: 2px;
    }
  `;
}

/**
 * Escapes plain text for safe HTML embedding.
 */
function escapeHtml(text?: string | null): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates standalone, self-contained HTML for 58mm thermal receipt printers.
 */
function renderThermal58mmHtml(
  doc: CommercialDocument,
  settings: EnterprisePrinterSettings | undefined,
  qrDataUrl: string,
  isDiagnostic = false
): string {
  const showLogo = settings?.showLogo ?? true;
  const meta = DOCUMENT_TYPE_METADATA[doc.type] || {
    label: doc.typeName || "DOCUMENTO COMERCIAL",
    acronym: doc.type,
    fiscal: true,
  };

  const isProforma = doc.type === "FP";
  const customerName = escapeHtml(doc.customer?.name || "Consumidor Final");
  const customerNif = escapeHtml(doc.customer?.nif || "999999999");
  const companyName = escapeHtml(doc.company.name || "VendaJá Angola");
  const companyNif = escapeHtml(doc.company.nif || "5000000000");
  const companyAddress = escapeHtml(doc.company.address || "Angola");
  const companyPhone = escapeHtml(doc.company.phone || "—");

  const linesHtml = doc.lines
    .map((line) => {
      const desc = escapeHtml(line.description);
      const qtyPrice = `${line.quantity} × ${formatKwanza(line.unitPriceCents).replace(" Kz", "")}`;
      const taxRate = line.taxRate > 0 ? `IVA ${(line.taxRate * 100).toFixed(0)}%` : "Isento";
      const total = formatKwanza(line.totalCents);
      return `
        <div class="r58-item">
          <div class="r58-item-name">${desc}</div>
          <div class="r58-item-row">
            <span>${qtyPrice} (${taxRate})</span>
            <span class="r58-bold">${total}</span>
          </div>
        </div>
      `;
    })
    .join("");

  const taxRowsHtml = doc.taxSummary
    .map((item) => {
      const rateLabel = item.rate === 0 ? "Isento" : `${(item.rate * 100).toFixed(0)}%`;
      const base = formatKwanza(item.baseCents);
      const tax = formatKwanza(item.taxCents);
      return `
        <tr>
          <td>${rateLabel}</td>
          <td class="r58-right">${base}</td>
          <td class="r58-right">${tax}</td>
        </tr>
      `;
    })
    .join("");

  const fiscalHashLine = doc.fiscalHash
    ? formatAgtCertificationMention(doc.fiscalHash, doc.agtCertificate)
    : "--------Processado por programa certificado n.º 24/AGT/2026";

  return `
    <div class="receipt-58mm">
      ${
        isDiagnostic
          ? `
        <div class="diag-banner">
          *** TESTE DIAGNÓSTICO 58mm ***
          <div class="diag-ruler">|&lt;-- LARGURA IMPRESSÃO: 48mm --&gt;|</div>
        </div>
      `
          : ""
      }

      <!-- Header -->
      <div class="r58-center">
        ${showLogo && doc.company.logoUrl ? `<img src="${doc.company.logoUrl}" style="max-height: 40px; max-width: 130px; object-fit: contain; margin-bottom: 4px;" alt="Logo" />` : (showLogo && doc.company.logoText ? `<div class="r58-brand-title">${escapeHtml(doc.company.logoText)}</div>` : "")}
        <div class="r58-bold" style="font-size: 11px;">${companyName}</div>
        ${doc.company.tradeName && doc.company.tradeName !== doc.company.name ? `<div class="r58-meta" style="font-size: 9px;">${escapeHtml(doc.company.tradeName)}</div>` : ""}
        <div class="r58-meta">NIF: ${companyNif} · Tel: ${companyPhone}</div>
        <div class="r58-meta">${companyAddress}</div>
      </div>

      <!-- Document Badge -->
      <div class="r58-badge">
        <div>${escapeHtml(meta.label)}</div>
        <div class="r58-bold" style="font-size: 11px;">${escapeHtml(doc.number)}</div>
        ${isProforma ? `<div class="r58-badge-sub r58-bold">NÃO SERVE DE FATURA</div>` : ""}
      </div>

      <div class="r58-meta">
        <div>Data: ${new Date(doc.date).toLocaleString("pt-PT")}</div>
        ${doc.operator ? `<div>Op: ${escapeHtml(doc.operator.name)} | Cx: ${escapeHtml(doc.operator.terminalId || "01")}</div>` : ""}
      </div>

      <div class="r58-divider"></div>

      <!-- Customer -->
      <div class="r58-meta">
        <div>Cliente: <b>${customerName}</b></div>
        <div>NIF: <b>${customerNif}</b></div>
      </div>

      <div class="r58-divider-double"></div>

      <!-- Items -->
      <div class="r58-bold" style="font-size: 9px; margin-bottom: 3px;">ARTIGOS / DESCRIÇÃO</div>
      ${linesHtml}

      <div class="r58-divider"></div>

      <!-- Totals -->
      <div class="r58-row">
        <span>Total Ilíquido:</span>
        <span>${formatKwanza(doc.subtotalCents)}</span>
      </div>
      ${
        doc.discountCents > 0
          ? `
        <div class="r58-row">
          <span>Desconto:</span>
          <span>- ${formatKwanza(doc.discountCents)}</span>
        </div>
      `
          : ""
      }
      <div class="r58-row">
        <span>Total IVA:</span>
        <span>${formatKwanza(doc.taxTotalCents)}</span>
      </div>
      <div class="r58-row r58-row-total">
        <span>TOTAL A PAGAR:</span>
        <span>${formatKwanza(doc.totalCents)}</span>
      </div>

      <!-- Payment -->
      ${
        doc.paymentDetails
          ? `
        <div class="r58-divider-dotted"></div>
        <div class="r58-row">
          <span>Modo Pagamento:</span>
          <b>${escapeHtml(doc.paymentDetails.methodLabel || doc.paymentDetails.method)}</b>
        </div>
        ${
          doc.paymentDetails.tenderedCents !== undefined && doc.paymentDetails.tenderedCents > 0
            ? `
          <div class="r58-row">
            <span>Valor Entregue:</span>
            <b>${formatKwanza(doc.paymentDetails.tenderedCents)}</b>
          </div>
          <div class="r58-row r58-bold">
            <span>Troco:</span>
            <b>${formatKwanza(doc.paymentDetails.changeCents ?? 0)}</b>
          </div>
        `
            : ""
        }
      `
          : ""
      }

      <div class="r58-divider"></div>

      <!-- Taxes -->
      <div class="r58-bold" style="font-size: 8.5px;">DISCRIMINAÇÃO FISCAL (IVA)</div>
      <table class="r58-tax-table">
        <thead>
          <tr>
            <th>Taxa</th>
            <th class="r58-right">Incid.</th>
            <th class="r58-right">Imposto</th>
          </tr>
        </thead>
        <tbody>
          ${taxRowsHtml}
        </tbody>
      </table>

      <!-- Hash & QR -->
      <div class="r58-divider"></div>
      <div class="r58-hash-block font-mono">${escapeHtml(fiscalHashLine)}</div>

      ${
        qrDataUrl
          ? `
        <div class="r58-qr">
          <img src="${qrDataUrl}" alt="QR AGT" />
        </div>
      `
          : ""
      }

      <div class="r58-footer-msg">
        ${escapeHtml(doc.company.thanksMessage || settings?.footerMessage || "Obrigado pela sua preferência! Talão indispensável em caso de troca.")}
        ${doc.company.footerText ? `<div style="margin-top: 3px; font-size: 8px;">${escapeHtml(doc.company.footerText)}</div>` : ""}
      </div>

      <!-- Feed / Cut padding -->
      <div class="r58-cut-space">- - - - CORTE AQUI - - - -</div>
    </div>
  `;
}

/**
 * Generates standalone, self-contained HTML for standard 80mm thermal receipt printers.
 */
function renderThermal80mmHtml(
  doc: CommercialDocument,
  settings: EnterprisePrinterSettings | undefined,
  qrDataUrl: string,
  isDiagnostic = false
): string {
  const showLogo = settings?.showLogo ?? true;
  const meta = DOCUMENT_TYPE_METADATA[doc.type] || {
    label: doc.typeName || "DOCUMENTO COMERCIAL",
    acronym: doc.type,
    fiscal: true,
  };

  const isProforma = doc.type === "FP";
  const customerName = escapeHtml(doc.customer?.name || "Consumidor Final");
  const customerNif = escapeHtml(doc.customer?.nif || "999999999");
  const customerAddr = escapeHtml(doc.customer?.address || "");
  const companyName = escapeHtml(doc.company.name || "VendaJá Angola");
  const companyTrade = escapeHtml(doc.company.tradeName || "");
  const companyNif = escapeHtml(doc.company.nif || "5000000000");
  const companyAddress = escapeHtml(doc.company.address || "Angola");
  const companyProvince = escapeHtml(doc.company.province || "Luanda");
  const companyPhone = escapeHtml(doc.company.phone || "—");

  const linesHtml = doc.lines
    .map((line) => {
      const desc = escapeHtml(line.description);
      const qty = line.quantity;
      const unitPrice = formatKwanza(line.unitPriceCents).replace(" Kz", "");
      const taxRate = line.taxRate > 0 ? `${(line.taxRate * 100).toFixed(0)}%` : "0%";
      const total = formatKwanza(line.totalCents);
      return `
        <tr>
          <td class="td-art">${desc}</td>
          <td class="td-qty">${qty}</td>
          <td class="td-price">${unitPrice}</td>
          <td class="td-tax">${taxRate}</td>
          <td class="td-tot">${total}</td>
        </tr>
      `;
    })
    .join("");

  const taxRowsHtml = doc.taxSummary
    .map((item) => {
      const rateLabel = item.rate === 0 ? "Isento (0%)" : `${(item.rate * 100).toFixed(0)}%`;
      const base = formatKwanza(item.baseCents);
      const tax = formatKwanza(item.taxCents);
      const reason = escapeHtml(item.exemptionReason || "Regime Geral");
      return `
        <tr>
          <td>${rateLabel}</td>
          <td class="r80-right">${base}</td>
          <td class="r80-right">${tax}</td>
          <td>${reason}</td>
        </tr>
      `;
    })
    .join("");

  const fiscalHashLine = doc.fiscalHash
    ? formatAgtCertificationMention(doc.fiscalHash, doc.agtCertificate)
    : "--------Processado por programa certificado n.º 24/AGT/2026";

  return `
    <div class="receipt-80mm">
      ${
        isDiagnostic
          ? `
        <div class="diag-banner">
          *** TESTE DE DIAGNÓSTICO TÉRMICO 80mm ***
          <div class="diag-ruler">|&lt;--- LARGURA ÚTIL DE IMPRESSÃO: 72mm ---&gt;|</div>
        </div>
      `
          : ""
      }

      <!-- Header -->
      <div class="r80-center">
        ${showLogo && doc.company.logoUrl ? `<img src="${doc.company.logoUrl}" class="r80-logo-img" style="max-height: 50px; max-width: 150px; object-fit: contain; margin-bottom: 4px;" alt="Logo" />` : (showLogo && doc.company.logoText ? `<div class="r80-brand-title">${escapeHtml(doc.company.logoText)}</div>` : "")}
        <div class="r80-bold" style="font-size: 13px;">${companyName}</div>
        ${companyTrade && companyTrade !== companyName ? `<div style="font-size: 11px;">${companyTrade}</div>` : ""}
        <div class="r80-meta">NIF: ${companyNif} · Tel: ${companyPhone}</div>
        <div class="r80-meta">${companyAddress} · ${companyProvince} - Angola</div>
      </div>

      <!-- Document Badge -->
      <div class="r80-badge">
        <div class="r80-badge-title">${escapeHtml(meta.label)}</div>
        <div class="r80-badge-num">${escapeHtml(doc.number)}</div>
        ${isProforma ? `<div class="r80-bold" style="color: #000; font-size: 9.5px; margin-top: 2px;">DOCUMENTO SEM VALOR FISCAL · NÃO SERVE DE FATURA</div>` : ""}
      </div>

      <div class="r80-row" style="font-size: 10px;">
        <span>Data: <b>${new Date(doc.date).toLocaleString("pt-PT")}</b></span>
        ${doc.operator ? `<span>Op: <b>${escapeHtml(doc.operator.name)}</b> (Cx ${escapeHtml(doc.operator.terminalId || "01")})</span>` : ""}
      </div>

      <!-- Customer Card -->
      <div class="r80-customer-box">
        <div>Adquirente: <b>${customerName}</b></div>
        <div>NIF: <b>${customerNif}</b></div>
        ${customerAddr ? `<div>Morada: ${customerAddr}</div>` : ""}
      </div>

      <div class="r80-divider"></div>

      <!-- Product Table -->
      <table class="r80-table">
        <thead>
          <tr>
            <th class="td-art">Artigo</th>
            <th class="td-qty">Qtd</th>
            <th class="td-price">Preço</th>
            <th class="td-tax">IVA</th>
            <th class="td-tot">Total</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml}
        </tbody>
      </table>

      <div class="r80-divider"></div>

      <!-- Totals Breakdown -->
      <div class="r80-row">
        <span>Total Ilíquido:</span>
        <span class="r80-bold">${formatKwanza(doc.subtotalCents)}</span>
      </div>
      ${
        doc.discountCents > 0
          ? `
        <div class="r80-row">
          <span>Desconto Comercial:</span>
          <span>- ${formatKwanza(doc.discountCents)}</span>
        </div>
      `
          : ""
      }
      <div class="r80-row">
        <span>Incidência Tributável:</span>
        <span>${formatKwanza(doc.subtotalCents - doc.discountCents)}</span>
      </div>
      <div class="r80-row">
        <span>Total do IVA:</span>
        <span>${formatKwanza(doc.taxTotalCents)}</span>
      </div>
      ${
        doc.retentionCents && doc.retentionCents > 0
          ? `
        <div class="r80-row">
          <span>Retenção na Fonte (${doc.retentionPercent ?? 6.5}%):</span>
          <span>- ${formatKwanza(doc.retentionCents)}</span>
        </div>
      `
          : ""
      }

      <div class="r80-row r80-row-grand">
        <span>TOTAL A PAGAR:</span>
        <span>${formatKwanza(doc.totalCents)}</span>
      </div>

      <!-- Payment & Change -->
      ${
        doc.paymentDetails
          ? `
        <div class="r80-row">
          <span>Forma de Pagamento:</span>
          <b>${escapeHtml(doc.paymentDetails.methodLabel || doc.paymentDetails.method)}</b>
        </div>
        ${
          doc.paymentDetails.tenderedCents !== undefined && doc.paymentDetails.tenderedCents > 0
            ? `
          <div class="r80-row">
            <span>Valor Entregue:</span>
            <span>${formatKwanza(doc.paymentDetails.tenderedCents)}</span>
          </div>
          <div class="r80-row r80-bold">
            <span>Troco:</span>
            <span>${formatKwanza(doc.paymentDetails.changeCents ?? 0)}</span>
          </div>
        `
            : ""
        }
      `
          : ""
      }

      <div class="r80-divider"></div>

      <!-- Tax Breakdown -->
      <div class="r80-bold" style="font-size: 9.5px; margin-bottom: 2px;">DISCRIMINAÇÃO FISCAL DE IMPOSTOS</div>
      <table class="r80-tax-table">
        <thead>
          <tr>
            <th>Taxa</th>
            <th class="r80-right">Incidência</th>
            <th class="r80-right">Valor IVA</th>
            <th>Enquadramento</th>
          </tr>
        </thead>
        <tbody>
          ${taxRowsHtml}
        </tbody>
      </table>

      <!-- AGT Fiscal Footer -->
      <div class="r80-divider"></div>
      <div class="r80-hash-block">${escapeHtml(fiscalHashLine)}</div>
      <div class="r80-meta r80-center" style="font-size: 8.5px;">
        Os bens e/ou serviços foram colocados à disposição na data e local indicados.
      </div>

      ${
        qrDataUrl
          ? `
        <div class="r80-qr">
          <img src="${qrDataUrl}" alt="Código QR Fiscal AGT" />
          <span style="font-size: 8px; color: #555; margin-top: 2px;">AGT FISCAL VALIDATION QR</span>
        </div>
      `
          : ""
      }

      <div class="r80-footer-msg">
        ${escapeHtml(doc.company.thanksMessage || settings?.footerMessage || "Talão indispensável para efeitos de troca ou devolução no prazo de 15 dias. Obrigado pela preferência!")}
        ${doc.company.footerText ? `<div style="margin-top: 4px; font-size: 8.5px;">${escapeHtml(doc.company.footerText)}</div>` : ""}
      </div>

      <!-- Auto-cut spacing -->
      <div class="r80-cut-space">- - - - - - CORTE AQUI - - - - - -</div>
    </div>
  `;
}

/**
 * Generates standalone corporate HTML for A4 / A5 / Letter documents.
 */
function renderOfficeHtml(
  doc: CommercialDocument,
  format: PaperFormat,
  settings: EnterprisePrinterSettings | undefined,
  qrDataUrl: string,
  watermarkText?: string
): string {
  const showLogo = settings?.showLogo ?? true;
  const showWatermark = settings?.showWatermark ?? true;
  const meta = DOCUMENT_TYPE_METADATA[doc.type] || {
    label: doc.typeName || "DOCUMENTO COMERCIAL",
    acronym: doc.type,
    fiscal: true,
  };

  const isProforma = doc.type === "FP";
  const activeWatermark =
    watermarkText ||
    (doc.isCancelled
      ? "ANULADO"
      : doc.isDraft
      ? "RASCUNHO"
      : isProforma
      ? "PROFORMA"
      : undefined);

  const customerName = escapeHtml(doc.customer?.name || "Consumidor Final");
  const customerNif = escapeHtml(doc.customer?.nif || "999999999");
  const customerAddr = escapeHtml(doc.customer?.address || "Luanda, Angola");
  const companyName = escapeHtml(doc.company.name || "VendaJá Angola Enterprise");
  const companyTrade = escapeHtml(doc.company.tradeName || "");
  const companyNif = escapeHtml(doc.company.nif || "5000000000");
  const companyAddress = escapeHtml(doc.company.address || "Rua Rainha Ginga, Vernon");
  const companyProvince = escapeHtml(doc.company.province || "Luanda");
  const companyPhone = escapeHtml(doc.company.phone || "+244 923 000 000");
  const companyEmail = escapeHtml(doc.company.email || "comercial@vendaja.ao");
  const commercialReg = escapeHtml(doc.company.commercialRegistry || "Conservatória de Luanda");
  const shareCapital = escapeHtml(doc.company.shareCapital || "10.000.000 Kz");

  const linesHtml = doc.lines
    .map((line, idx) => {
      const code = escapeHtml(line.code || `ART-${idx + 1}`);
      const desc = escapeHtml(line.description);
      const qty = line.quantity;
      const unit = escapeHtml(line.unit || "un");
      const unitPrice = formatKwanza(line.unitPriceCents);
      const disc = line.discountPercent ? `${line.discountPercent}%` : "0%";
      const taxRate = line.taxRate > 0 ? `${(line.taxRate * 100).toFixed(0)}%` : "0% (Isento)";
      const total = formatKwanza(line.totalCents);
      return `
        <tr>
          <td style="font-family: ui-monospace, monospace;">${code}</td>
          <td>
            <strong>${desc}</strong>
            ${line.taxExemptionReason ? `<div style="font-size: 9px; color: #64748b;">${escapeHtml(line.taxExemptionReason)}</div>` : ""}
          </td>
          <td style="text-align: center;">${qty}</td>
          <td style="text-align: center; color: #64748b;">${unit}</td>
          <td style="text-align: right;">${unitPrice}</td>
          <td style="text-align: center;">${disc}</td>
          <td style="text-align: center;">${taxRate}</td>
          <td style="text-align: right; font-weight: 700;">${total}</td>
        </tr>
      `;
    })
    .join("");

  const taxRowsHtml = doc.taxSummary
    .map((item) => {
      const rateLabel = item.rate === 0 ? "Isento (0%)" : `${(item.rate * 100).toFixed(0)}%`;
      const base = formatKwanza(item.baseCents);
      const tax = formatKwanza(item.taxCents);
      const reason = escapeHtml(item.exemptionReason || "Regime Geral de IVA - Art. 12.º");
      return `
        <tr>
          <td>${rateLabel}</td>
          <td style="text-align: right; font-family: ui-monospace, monospace;">${base}</td>
          <td style="text-align: right; font-family: ui-monospace, monospace;">${tax}</td>
          <td style="color: #64748b;">${reason}</td>
        </tr>
      `;
    })
    .join("");

  const bankAccountsHtml = (doc.company.bankAccounts || [])
    .map(
      (b) => `
      <div class="office-bank-row">
        <b>${escapeHtml(b.bank)}:</b>
        <span style="font-family: ui-monospace, monospace;">IBAN: ${escapeHtml(b.iban)}</span>
        ${b.swift ? `<span>SWIFT: ${escapeHtml(b.swift)}</span>` : ""}
      </div>
    `
    )
    .join("");

  const fiscalHashLine = doc.fiscalHash
    ? formatAgtCertificationMention(doc.fiscalHash, doc.agtCertificate)
    : "--------Processado por programa certificado n.º 24/AGT/2026";

  return `
    <div class="office-document">
      ${showWatermark && activeWatermark ? `<div class="office-watermark">${activeWatermark}</div>` : ""}

      <!-- Header Band -->
      <div class="office-header-band">
        <div class="office-brand">
          ${showLogo ? (doc.company.logoUrl ? `<img src="${doc.company.logoUrl}" style="max-height: 60px; max-width: 180px; object-fit: contain; margin-bottom: 6px;" alt="Logo" />` : `<div class="office-logo-badge">${escapeHtml(doc.company.logoText?.slice(0, 3) || doc.company.name.slice(0, 3) || "EMP")}</div>`) : ""}
          <div class="office-company-info">
            <h1>${companyName}</h1>
            ${companyTrade ? `<div class="office-trade-name">${companyTrade}</div>` : ""}
            <div class="office-company-meta">
              <div>NIF: <b>${companyNif}</b> · Capital Social: ${shareCapital}</div>
              <div>${companyAddress} · ${companyProvince} - Angola</div>
              <div>Tel: ${companyPhone} · Email: ${companyEmail}</div>
              ${doc.company.website ? `<div>Web: ${escapeHtml(doc.company.website)}</div>` : ""}
              <div style="font-style: italic;">${commercialReg}</div>
            </div>
          </div>
        </div>

        <div class="office-doc-card">
          <div class="office-doc-title">${escapeHtml(meta.label)}</div>
          <div class="office-doc-number">${escapeHtml(doc.number)}</div>
          <div class="office-doc-meta-row">
            <span>Data de Emissão:</span>
            <b>${new Date(doc.date).toLocaleDateString("pt-PT")}</b>
          </div>
          <div class="office-doc-meta-row">
            <span>Data de Vencimento:</span>
            <b>${new Date(doc.taxPointDate || doc.date).toLocaleDateString("pt-PT")}</b>
          </div>
          ${
            doc.operator
              ? `
            <div class="office-doc-meta-row">
              <span>Operador:</span>
              <span>${escapeHtml(doc.operator.name)}</span>
            </div>
          `
              : ""
          }
        </div>
      </div>

      <!-- Client Band -->
      <div class="office-client-band">
        <div class="office-client-box">
          <div class="office-client-box-title">EXMO.(S) SR.(S) / ADQUIRENTE:</div>
          <div class="office-client-name">${customerName}</div>
          <div class="office-client-meta">
            <div>NIF: <b>${customerNif}</b></div>
            <div>Morada: ${customerAddr}</div>
            <div>País: Angola</div>
          </div>
        </div>

        ${
          doc.referenceDocument
            ? `
          <div class="office-client-box" style="flex: 0.8; background: #f0fdf4; border-color: #86efac;">
            <div class="office-client-box-title" style="color: #166534;">DOCUMENTO DE REFERÊNCIA:</div>
            <div style="font-weight: 700; color: #166534;">${escapeHtml(doc.referenceDocument.number)} (${escapeHtml(doc.referenceDocument.type)})</div>
            ${doc.referenceDocument.reason ? `<div style="font-size: 10px; color: #166534; margin-top: 2px;">Motivo: ${escapeHtml(doc.referenceDocument.reason)}</div>` : ""}
          </div>
        `
            : ""
        }
      </div>

      <!-- Items Table -->
      <table class="office-table">
        <thead>
          <tr>
            <th style="width: 80px;">Código</th>
            <th>Designação dos Artigos / Serviços</th>
            <th style="width: 45px; text-align: center;">Qtd</th>
            <th style="width: 35px; text-align: center;">Un</th>
            <th style="width: 90px; text-align: right;">Preço Unit.</th>
            <th style="width: 45px; text-align: center;">Desc.</th>
            <th style="width: 55px; text-align: center;">IVA</th>
            <th style="width: 105px; text-align: right;">Total Líquido</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml}
        </tbody>
      </table>

      <!-- Bottom Financial Grid -->
      <div class="office-bottom-grid">
        <div class="office-bottom-left">
          <!-- Tax Matrix -->
          <div>
            <div class="office-mini-header">DISCRIMINAÇÃO FISCAL DE IMPOSTOS</div>
            <table class="office-mini-table">
              <thead>
                <tr>
                  <th>Taxa</th>
                  <th style="text-align: right;">Incidência</th>
                  <th style="text-align: right;">Valor IVA</th>
                  <th>Enquadramento Legal</th>
                </tr>
              </thead>
              <tbody>
                ${taxRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- Bank Accounts -->
          ${
            bankAccountsHtml
              ? `
            <div class="office-bank-details">
              <div class="office-mini-header">COORDENADAS BANCÁRIAS PARA LIQUIDAÇÃO</div>
              ${bankAccountsHtml}
            </div>
          `
              : ""
          }

          ${
            doc.notes || doc.terms
              ? `
            <div style="font-size: 9.5px; color: #475569; border-left: 3px solid #cbd5e1; padding-left: 8px;">
              ${doc.notes ? `<div>${escapeHtml(doc.notes)}</div>` : ""}
              ${doc.terms ? `<div>${escapeHtml(doc.terms)}</div>` : ""}
            </div>
          `
              : ""
          }
        </div>

        <!-- Totals Card -->
        <div class="office-totals-card">
          <div class="office-totals-row">
            <span>Total Ilíquido:</span>
            <span>${formatKwanza(doc.subtotalCents)}</span>
          </div>
          <div class="office-totals-row">
            <span>Descontos Comerciais:</span>
            <span>- ${formatKwanza(doc.discountCents > 0 ? doc.discountCents : 0)}</span>
          </div>
          <div class="office-totals-row">
            <span>Total da Incidência:</span>
            <span>${formatKwanza(doc.subtotalCents - doc.discountCents)}</span>
          </div>
          <div class="office-totals-row">
            <span>Total do IVA:</span>
            <span>${formatKwanza(doc.taxTotalCents)}</span>
          </div>
          ${
            doc.retentionCents && doc.retentionCents > 0
              ? `
            <div class="office-totals-row">
              <span>Retenção na Fonte (${doc.retentionPercent ?? 6.5}%):</span>
              <span>- ${formatKwanza(doc.retentionCents)}</span>
            </div>
          `
              : ""
          }
          <div class="office-totals-divider"></div>
          <div class="office-grand-total-box">
            <span class="grand-label">TOTAL A PAGAR</span>
            <span class="grand-val">${formatKwanza(doc.totalCents)}</span>
          </div>
          ${
            doc.paymentDetails
              ? `
            <div class="office-totals-row" style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
              <span>Forma de Pagamento:</span>
              <b>${escapeHtml(doc.paymentDetails.methodLabel || doc.paymentDetails.method)}</b>
            </div>
            ${
              doc.paymentDetails.tenderedCents !== undefined && doc.paymentDetails.tenderedCents > 0
                ? `
              <div class="office-totals-row">
                <span>Valor Entregue:</span>
                <span>${formatKwanza(doc.paymentDetails.tenderedCents)}</span>
              </div>
              <div class="office-totals-row" style="font-weight: 700; color: #047857;">
                <span>Troco:</span>
                <span>${formatKwanza(doc.paymentDetails.changeCents ?? 0)}</span>
              </div>
            `
                : ""
            }
          `
              : ""
          }
        </div>
      </div>

      <!-- Footer Band -->
      <div class="office-footer-band">
        <div class="office-footer-legal">
          <div class="office-hash-line">${escapeHtml(fiscalHashLine)}</div>
          <div>
            ${
              meta.fiscal
                ? "Os bens e/ou serviços foram colocados à disposição do adquirente na data e local indicados no presente documento."
                : "Documento probatório emitido a título informativo, sem eficácia de validação fiscal."
            }
          </div>
          <div style="font-style: italic; color: #64748b;">
            Emitido por software certificado VendaJá Angola Enterprise v2.2 · Licença Oficial AGT
          </div>
          ${doc.company.thanksMessage ? `<div style="font-weight: 600; color: #0f172a; margin-top: 4px;">${escapeHtml(doc.company.thanksMessage)}</div>` : ""}
          ${doc.company.footerText ? `<div style="color: #64748b; font-size: 8.5px;">${escapeHtml(doc.company.footerText)}</div>` : ""}
        </div>

        ${
          qrDataUrl
            ? `
          <div class="office-qr-box">
            <img src="${qrDataUrl}" alt="QR AGT" />
            <span style="font-size: 8px; font-weight: 700; color: #64748b;">AGT FISCAL QR</span>
          </div>
        `
            : ""
        }

        <div class="office-signature-box">
          <div class="office-signature-line"></div>
          <span>${escapeHtml(doc.company.signatureText || "Assinatura do Adquirente / Carimbo")}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Main Entrypoint: Generates a 100% self-contained HTML document string with complete inline CSS.
 */
export async function generateCompleteDocumentHtml(
  doc: CommercialDocument,
  format: PaperFormat,
  settings?: EnterprisePrinterSettings,
  options?: HtmlTemplateOptions
): Promise<string> {
  let qrDataUrl = options?.qrDataUrl || "";
  if (!qrDataUrl && doc.qrPayload) {
    try {
      const qrWidth = format === "58mm" ? 110 : format === "80mm" ? 130 : 120;
      qrDataUrl = await QRCode.toDataURL(doc.qrPayload, {
        margin: 1,
        width: qrWidth,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
    } catch {
      qrDataUrl = "";
    }
  }

  const css = getEmbeddedPrintCss(format);

  let bodyContent = "";
  if (format === "58mm") {
    bodyContent = renderThermal58mmHtml(doc, settings, qrDataUrl, options?.isDiagnostic);
  } else if (format === "80mm") {
    bodyContent = renderThermal80mmHtml(doc, settings, qrDataUrl, options?.isDiagnostic);
  } else {
    bodyContent = renderOfficeHtml(doc, format, settings, qrDataUrl, options?.watermark);
  }

  return `<!DOCTYPE html>
<html lang="pt-AO">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(doc.number || "Documento Comercial")}</title>
  <style>
    ${css}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}
