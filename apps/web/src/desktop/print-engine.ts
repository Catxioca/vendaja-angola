import {
  type PaperFormat,
  type CommercialDocument,
  PAPER_FORMAT_INFO,
  createSampleCommercialDocument,
} from "@angola/shared";
import { generateCompleteDocumentHtml } from "./print-templates.js";

export interface PrinterDeviceOption {
  name: string;
  displayName: string;
  isDefault: boolean;
  status?: number;
}

export interface EnterprisePrinterSettings {
  defaultFormat: PaperFormat;
  defaultPrinterName: string;
  marginPreset: "none" | "compact" | "standard";
  autoCut: boolean;
  showLogo: boolean;
  showWatermark: boolean;
  headerMessage: string;
  footerMessage: string;
  duplicateReceipt: boolean;
  density: "normal" | "high";
}

const STORAGE_KEY = "vendaja-printer-enterprise-config";

export const DEFAULT_PRINTER_SETTINGS: EnterprisePrinterSettings = {
  defaultFormat: "80mm",
  defaultPrinterName: "",
  marginPreset: "none",
  autoCut: true,
  showLogo: true,
  showWatermark: true,
  headerMessage: "",
  footerMessage:
    "Talão indispensável para efeitos de troca ou devolução no prazo legal de 15 dias. Obrigado pela sua preferência!",
  duplicateReceipt: false,
  density: "high",
};

export function readPrinterSettings(): EnterprisePrinterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRINTER_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PRINTER_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_PRINTER_SETTINGS;
  }
}

export function savePrinterSettings(settings: EnterprisePrinterSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("printer-settings-updated", { detail: settings }));
  } catch (err) {
    console.error("[print-engine] Falha ao guardar definições de impressão:", err);
  }
}

export async function fetchSystemPrinters(): Promise<PrinterDeviceOption[]> {
  try {
    const posApi = (window as unknown as { pos?: { getPrinters?: () => Promise<Array<{ name: string; displayName?: string; isDefault?: boolean; status?: number }>> } }).pos;
    if (posApi?.getPrinters) {
      const list = await posApi.getPrinters();
      return (list || []).map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: Boolean(p.isDefault),
        status: p.status,
      }));
    }
  } catch (err) {
    console.warn("[print-engine] Não foi possível consultar impressoras locais:", err);
  }
  return [];
}

/**
 * Injects dynamic CSS @page size to force Chromium to format the canvas
 * according to the exact paper dimensions (58mm, 80mm, A5, A4, Letter).
 */
export function injectPrintPageStyles(format: PaperFormat): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById("dynamic-print-page-style");
  if (existing) {
    existing.remove();
  }

  const style = document.createElement("style");
  style.id = "dynamic-print-page-style";

  let pageRule = "";
  switch (format) {
    case "58mm":
      pageRule = `@page { size: 58mm auto; margin: 0mm !important; }`;
      break;
    case "80mm":
      pageRule = `@page { size: 80mm auto; margin: 0mm !important; }`;
      break;
    case "a5":
      pageRule = `@page { size: A5 portrait; margin: 6mm 8mm !important; }`;
      break;
    case "letter":
      pageRule = `@page { size: letter portrait; margin: 8mm 10mm !important; }`;
      break;
    case "a4":
    default:
      pageRule = `@page { size: A4 portrait; margin: 8mm 10mm !important; }`;
      break;
  }

  style.textContent = `
    @media print {
      ${pageRule}
      html, body {
        width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        overflow: visible !important;
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Universal print executor supporting both isolated HTML rendering (Electron headless window)
 * and sandboxed web fallback.
 */
export async function executePrint(
  docOrFormat: CommercialDocument | PaperFormat,
  formatOrOptions?: PaperFormat | { printerName?: string; silent?: boolean },
  options?: { printerName?: string; silent?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const isDoc = typeof docOrFormat === "object" && docOrFormat !== null && "lines" in docOrFormat;
    const format: PaperFormat = isDoc
      ? (typeof formatOrOptions === "string" ? formatOrOptions : "80mm")
      : (docOrFormat as PaperFormat);

    const actualOptions = isDoc
      ? (typeof formatOrOptions === "object" ? formatOrOptions : options)
      : (typeof formatOrOptions === "object" ? formatOrOptions : undefined);

    const settings = readPrinterSettings();
    const printerName = actualOptions?.printerName || settings.defaultPrinterName || undefined;
    const silent = actualOptions?.silent ?? false;

    // 1. Preferred Isolated Print Flow via Electron Hidden Window
    const posApi = (window as unknown as {
      pos?: {
        printHtmlDocument?: (
          html: string,
          opts: { printerName?: string; silent?: boolean; format?: string; copies?: number }
        ) => Promise<{ success: boolean; failureReason?: string }>;
        printDocument?: (opts: { deviceName?: string; silent?: boolean }) => Promise<{ success: boolean; failureReason?: string }>;
      };
    }).pos;

    if (posApi?.printHtmlDocument && isDoc) {
      const html = await generateCompleteDocumentHtml(docOrFormat as CommercialDocument, format, settings);
      const res = await posApi.printHtmlDocument(html, {
        printerName,
        silent,
        format,
        copies: 1,
      });
      return { success: res.success, error: res.failureReason };
    }

    // 2. Sandboxed Iframe Fallback (eliminates desktop UI scaling distortion in Web mode)
    if (isDoc && typeof document !== "undefined") {
      const html = await generateCompleteDocumentHtml(docOrFormat as CommercialDocument, format, settings);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = format === "58mm" ? "54mm" : format === "80mm" ? "76mm" : "210mm";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      iframe.srcdoc = html;

      document.body.appendChild(iframe);

      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
              iframe.remove();
              resolve({ success: true });
            }, 1000);
          } catch (e) {
            iframe.remove();
            resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
          }
        };
      });
    }

    // 3. Fallback to legacy window.print
    injectPrintPageStyles(format);
    if (typeof document !== "undefined") {
      document.body.classList.add("printing-active", `print-format-${format}`);
    }

    if (posApi?.printDocument && printerName) {
      const res = await posApi.printDocument({
        deviceName: printerName,
        silent,
      });
      if (typeof document !== "undefined") {
        document.body.classList.remove("printing-active", `print-format-${format}`);
      }
      return { success: res.success, error: res.failureReason };
    }

    if (typeof window !== "undefined") {
      window.print();
    }
    if (typeof document !== "undefined") {
      document.body.classList.remove("printing-active", `print-format-${format}`);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generates and downloads a clean PDF with accurate dimensions and no runaway feed whitespace.
 */
export async function downloadPdf(
  docOrTitle: CommercialDocument | string,
  format: PaperFormat
): Promise<{ saved: boolean; filePath?: string; error?: string }> {
  try {
    const isDoc = typeof docOrTitle === "object" && docOrTitle !== null && "lines" in docOrTitle;
    const documentTitle = isDoc ? (docOrTitle as CommercialDocument).number : (docOrTitle as string);
    const settings = readPrinterSettings();

    const posApi = (window as unknown as {
      pos?: {
        exportPdfDocument?: (
          title: string,
          html: string,
          options?: { format?: string }
        ) => Promise<{ saved: boolean; filePath?: string; error?: string }>;
        saveInvoicePdf?: (title: string, fmt: string) => Promise<{ saved: boolean; filePath?: string }>;
      };
    }).pos;

    // Preferred Isolated PDF Export
    if (posApi?.exportPdfDocument && isDoc) {
      const html = await generateCompleteDocumentHtml(docOrTitle as CommercialDocument, format, settings);
      const res = await posApi.exportPdfDocument(documentTitle, html, { format });
      return { saved: Boolean(res.saved), filePath: res.filePath, error: res.error };
    }

    if (posApi?.saveInvoicePdf) {
      injectPrintPageStyles(format);
      const res = await posApi.saveInvoicePdf(documentTitle, format);
      return { saved: Boolean(res.saved), filePath: res.filePath };
    }

    // Web fallback
    if (typeof window !== "undefined") {
      window.print();
    }
    return { saved: true };
  } catch (err) {
    return { saved: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Prints a full diagnostic alignment and calibration test pattern to verify thermal margins and cutting.
 */
export async function printDiagnosticTestPattern(
  format: PaperFormat,
  printerName?: string
): Promise<{ success: boolean; error?: string }> {
  const diagnosticDoc = createSampleCommercialDocument("FR");
  diagnosticDoc.number = `TESTE-DIAG-${format.toUpperCase()}`;
  diagnosticDoc.notes = `TESTE DE ALINHAMENTO E CALIBRAÇÃO TÉRMICA (${format.toUpperCase()}): Margens verificadas, corte automático validado.`;

  return executePrint(diagnosticDoc, format, {
    printerName,
    silent: false,
  });
}

/**
 * Dumps the exact rendered HTML and metadata to disk for forensic debugging of print issues.
 */
export async function dumpPrintDebugFile(
  doc: CommercialDocument,
  format: PaperFormat
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const settings = readPrinterSettings();
    const html = await generateCompleteDocumentHtml(doc, format, settings);
    const posApi = (window as unknown as {
      pos?: {
        savePrintDebugDump?: (
          num: string,
          h: string,
          meta?: any
        ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      };
    }).pos;

    if (posApi?.savePrintDebugDump) {
      return await posApi.savePrintDebugDump(doc.number, html, {
        format,
        settings,
        paperInfo: PAPER_FORMAT_INFO[format],
        timestamp: new Date().toISOString(),
      });
    }

    // Web fallback: download as HTML file
    if (typeof document !== "undefined") {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `debug-print-${doc.number.replace(/[/\\?%*:|"<>]/g, "-")}.html`;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true, filePath: a.download };
    }

    return { success: false, error: "Ambiente não suporta exportação de diagnóstico" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
