import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  readPrinterSettings,
  savePrinterSettings,
  DEFAULT_PRINTER_SETTINGS,
  injectPrintPageStyles,
  executePrint,
  downloadPdf,
  printDiagnosticTestPattern,
  dumpPrintDebugFile,
} from "./print-engine.js";
import {
  generateCompleteDocumentHtml,
  getPaperPixelWidth,
} from "./print-templates.js";
import {
  createSampleCommercialDocument,
  type CommercialDocument,
} from "@angola/shared";

// Mock localStorage and DOM for NodeJS testing environment
class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe("Enterprise Print Engine & Templates Test Suite", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      dispatchEvent: () => true,
      print: () => true,
    };
  });

  describe("Printer Settings Store", () => {
    it("should return default printer settings when storage is empty", () => {
      const settings = readPrinterSettings();
      assert.deepStrictEqual(settings, DEFAULT_PRINTER_SETTINGS);
      assert.strictEqual(settings.defaultFormat, "80mm");
      assert.strictEqual(settings.autoCut, true);
      assert.strictEqual(settings.marginPreset, "none");
    });

    it("should save and reload custom printer settings", () => {
      const custom = {
        ...DEFAULT_PRINTER_SETTINGS,
        defaultFormat: "58mm" as const,
        defaultPrinterName: "EPSON_TM_T20III",
        marginPreset: "compact" as const,
        autoCut: false,
        footerMessage: "Obrigado pela visita!",
      };

      savePrinterSettings(custom);
      const loaded = readPrinterSettings();

      assert.strictEqual(loaded.defaultFormat, "58mm");
      assert.strictEqual(loaded.defaultPrinterName, "EPSON_TM_T20III");
      assert.strictEqual(loaded.marginPreset, "compact");
      assert.strictEqual(loaded.autoCut, false);
      assert.strictEqual(loaded.footerMessage, "Obrigado pela visita!");
    });
  });

  describe("Paper Dimension & Pixel Calculation", () => {
    it("should calculate exact pixel widths for iframe sandboxing", () => {
      assert.strictEqual(getPaperPixelWidth("58mm"), 204);
      assert.strictEqual(getPaperPixelWidth("80mm"), 287);
      assert.strictEqual(getPaperPixelWidth("a5"), 559);
      assert.strictEqual(getPaperPixelWidth("a4"), 794);
      assert.strictEqual(getPaperPixelWidth("letter"), 816);
    });
  });

  describe("58mm Thermal Receipt Generation", () => {
    it("should generate clean, self-contained 58mm HTML without wide table clipping", async () => {
      const doc = createSampleCommercialDocument("FR");
      doc.number = "FR 2026/00045";
      doc.fiscalHash = "ABCD1234EF";

      const html = await generateCompleteDocumentHtml(doc, "58mm");

      assert.ok(html.includes("<!DOCTYPE html>"), "Must be a complete HTML document");
      assert.ok(html.includes("@page { size: 58mm auto; margin: 0mm; }"), "Must have 58mm zero-margin @page rule");
      assert.ok(html.includes("receipt-58mm"), "Must contain 58mm container class");
      assert.ok(html.includes("width: 48mm;"), "Must constrain printable width to 48mm to prevent clipping");
      assert.ok(html.includes("FR 2026/00045"), "Must contain invoice number");
      assert.ok(html.includes("ABCD-Processado por programa certificado"), "Must contain 4-char AGT fiscal hash");
      assert.ok(html.includes("CORTE AQUI"), "Must contain auto-cut feed space");
      assert.ok(!html.includes("undefined"), "Must not contain undefined strings");
      assert.ok(!html.includes("NaN"), "Must not contain NaN strings");
    });

    it("should format two-line product items for 58mm", async () => {
      const doc = createSampleCommercialDocument("FR");
      doc.lines = [
        {
          id: "p1",
          code: "ARROZ-01",
          description: "Arroz Carolino Bom Sucesso 1Kg",
          unit: "un",
          quantity: 2,
          unitPriceCents: 145000,
          taxRate: 0.14,
          totalCents: 290000,
        },
      ];

      const html = await generateCompleteDocumentHtml(doc, "58mm");

      assert.ok(html.includes("Arroz Carolino Bom Sucesso 1Kg"));
      assert.ok(html.includes("2 × 1.450,00"));
      assert.ok(html.includes("IVA 14%"));
      assert.ok(html.includes("2.900,00 Kz"));
    });
  });

  describe("80mm Thermal Receipt Generation", () => {
    it("should generate standard 80mm retail receipt with full customer and tax breakdown", async () => {
      const doc = createSampleCommercialDocument("FR");
      doc.number = "FR 2026/00088";
      doc.customer = {
        name: "Empresa de Transportes Kwanza Lda",
        nif: "5412345678",
        address: "Avenida 4 de Fevereiro, Luanda",
      };
      doc.fiscalHash = "EF789012";

      const html = await generateCompleteDocumentHtml(doc, "80mm");

      assert.ok(html.includes("@page { size: 80mm auto; margin: 0mm; }"), "Must have 80mm zero-margin @page rule");
      assert.ok(html.includes("receipt-80mm"), "Must contain 80mm container class");
      assert.ok(html.includes("width: 72mm;"), "Must constrain printable width to 72mm");
      assert.ok(html.includes("Empresa de Transportes Kwanza Lda"), "Must include customer name");
      assert.ok(html.includes("5412345678"), "Must include customer NIF");
      assert.ok(html.includes("DISCRIMINAÇÃO FISCAL DE IMPOSTOS"), "Must include tax breakdown table");
      assert.ok(html.includes("EF78-Processado por programa certificado"), "Must include AGT certification notice");
      assert.ok(html.includes("CORTE AQUI"), "Must include auto-cut space");
      assert.ok(!html.includes("undefined"));
      assert.ok(!html.includes("NaN"));
    });
  });

  describe("A4 / A5 / Letter Corporate ERP Layout", () => {
    it("should generate professional A4 layout with logo, bank accounts, and 8-column table", async () => {
      const doc = createSampleCommercialDocument("FT");
      doc.number = "FT 2026/00019";
      doc.fiscalHash = "12345678";

      const html = await generateCompleteDocumentHtml(doc, "a4");

      assert.ok(html.includes("@page { size: A4 portrait; margin: 10mm 12mm; }"), "Must have A4 @page rule");
      assert.ok(html.includes("office-document"), "Must have office document root");
      assert.ok(html.includes("office-brand"), "Must include corporate brand header");
      assert.ok(html.includes("office-table"), "Must include 8-column product table");
      assert.ok(html.includes("Designação dos Artigos / Serviços"), "Must include standard column header");
      assert.ok(html.includes("COORDENADAS BANCÁRIAS PARA LIQUIDAÇÃO"), "Must include bank accounts block");
      assert.ok(html.includes("TOTAL A PAGAR"), "Must include grand total box");
      assert.ok(html.includes("Assinatura do Adquirente / Carimbo"), "Must include signature line");
    });

    it("should render watermarks for proforma and cancelled documents", async () => {
      const proformaDoc = createSampleCommercialDocument("FP");
      proformaDoc.number = "FP 2026/00003";

      const proformaHtml = await generateCompleteDocumentHtml(proformaDoc, "a4");
      assert.ok(proformaHtml.includes("office-watermark"), "Must include watermark for proforma");
      assert.ok(proformaHtml.includes("PROFORMA"));

      const cancelledDoc = createSampleCommercialDocument("FT");
      cancelledDoc.isCancelled = true;

      const cancelledHtml = await generateCompleteDocumentHtml(cancelledDoc, "a4");
      assert.ok(cancelledHtml.includes("ANULADO"));
    });
  });

  describe("Universal Document Type Coverage", () => {
    const types: Array<CommercialDocument["type"]> = ["FT", "FR", "FP", "NC", "ND", "GR", "RC"];

    for (const type of types) {
      it(`should generate valid, robust HTML for document type ${type}`, async () => {
        const doc = createSampleCommercialDocument(type);
        const html58 = await generateCompleteDocumentHtml(doc, "58mm");
        const html80 = await generateCompleteDocumentHtml(doc, "80mm");
        const htmlA4 = await generateCompleteDocumentHtml(doc, "a4");

        assert.ok(html58.length > 500);
        assert.ok(html80.length > 500);
        assert.ok(htmlA4.length > 500);
        assert.ok(!html58.includes("undefined"));
        assert.ok(!html80.includes("undefined"));
        assert.ok(!htmlA4.includes("undefined"));
      });
    }
  });

  describe("Execution & Print Spooler Integration", () => {
    it("should invoke pos.printHtmlDocument when available in Electron environment", async () => {
      let calledHtml = "";
      let calledOptions: any = null;

      (globalThis as unknown as { window: { pos: any } }).window = {
        pos: {
          printHtmlDocument: async (html: string, options: any) => {
            calledHtml = html;
            calledOptions = options;
            return { success: true };
          },
        },
      };

      const doc = createSampleCommercialDocument("FR");
      const result = await executePrint(doc, "80mm", {
        printerName: "EPSON_TM_T20III",
        silent: true,
      });

      assert.strictEqual(result.success, true);
      assert.ok(calledHtml.includes("receipt-80mm"));
      assert.strictEqual(calledOptions.printerName, "EPSON_TM_T20III");
      assert.strictEqual(calledOptions.silent, true);
      assert.strictEqual(calledOptions.format, "80mm");
    });

    it("should invoke pos.exportPdfDocument for isolated PDF generation without blank tails", async () => {
      let calledTitle = "";
      let calledHtml = "";
      let calledOptions: any = null;

      (globalThis as unknown as { window: { pos: any } }).window = {
        pos: {
          exportPdfDocument: async (title: string, html: string, options: any) => {
            calledTitle = title;
            calledHtml = html;
            calledOptions = options;
            return { saved: true, filePath: "C:/docs/FR-001.pdf" };
          },
        },
      };

      const doc = createSampleCommercialDocument("FR");
      doc.number = "FR-2026-001";

      const res = await downloadPdf(doc, "58mm");

      assert.strictEqual(res.saved, true);
      assert.strictEqual(res.filePath, "C:/docs/FR-001.pdf");
      assert.strictEqual(calledTitle, "FR-2026-001");
      assert.ok(calledHtml.includes("receipt-58mm"));
      assert.strictEqual(calledOptions.format, "58mm");
    });

    it("should print diagnostic alignment pattern with test rulers", async () => {
      let calledHtml = "";

      (globalThis as unknown as { window: { pos: any } }).window = {
        pos: {
          printHtmlDocument: async (html: string) => {
            calledHtml = html;
            return { success: true };
          },
        },
      };

      const res = await printDiagnosticTestPattern("80mm");
      assert.strictEqual(res.success, true);
      assert.ok(calledHtml.includes("TESTE-DIAG-80MM"));
    });

    it("should dump print debug HTML for forensic analysis", async () => {
      let dumpNumber = "";
      let dumpHtml = "";
      let dumpMeta: any = null;

      (globalThis as unknown as { window: { pos: any } }).window = {
        pos: {
          savePrintDebugDump: async (num: string, html: string, meta: any) => {
            dumpNumber = num;
            dumpHtml = html;
            dumpMeta = meta;
            return { success: true, filePath: "/tmp/dump.html" };
          },
        },
      };

      const doc = createSampleCommercialDocument("FR");
      doc.number = "FR-DEBUG-99";

      const res = await dumpPrintDebugFile(doc, "80mm");
      assert.strictEqual(res.success, true);
      assert.strictEqual(dumpNumber, "FR-DEBUG-99");
      assert.ok(dumpHtml.includes("receipt-80mm"));
      assert.strictEqual(dumpMeta.format, "80mm");
    });
  });

  describe("Dynamic Style Injection Fallback", () => {
    it("should generate correct @page styles for each paper format", () => {
      const createdStyles: Array<{ id: string; textContent: string }> = [];
      const mockDocument = {
        getElementById: (id: string) => {
          const found = createdStyles.find((s) => s.id === id);
          return found
            ? {
                remove: () => {
                  const idx = createdStyles.indexOf(found);
                  if (idx !== -1) createdStyles.splice(idx, 1);
                },
              }
            : null;
        },
        createElement: () => ({ id: "", textContent: "" }),
        head: {
          appendChild: (el: { id: string; textContent: string }) => {
            createdStyles.push(el);
          },
        },
        body: {
          classList: {
            add: () => true,
            remove: () => true,
          },
        },
      };

      (globalThis as unknown as { document: typeof mockDocument }).document = mockDocument;

      injectPrintPageStyles("58mm");
      const style58 = createdStyles.find((s) => s.id === "dynamic-print-page-style");
      assert.ok(style58);
      assert.ok(style58.textContent.includes("size: 58mm auto;"));
      assert.ok(style58.textContent.includes("margin: 0mm !important;"));

      injectPrintPageStyles("80mm");
      const style80 = createdStyles.find((s) => s.id === "dynamic-print-page-style");
      assert.ok(style80);
      assert.ok(style80.textContent.includes("size: 80mm auto;"));
      assert.ok(style80.textContent.includes("margin: 0mm !important;"));

      injectPrintPageStyles("a4");
      const styleA4 = createdStyles.find((s) => s.id === "dynamic-print-page-style");
      assert.ok(styleA4);
      assert.ok(styleA4.textContent.includes("size: A4 portrait;"));

      injectPrintPageStyles("a5");
      const styleA5 = createdStyles.find((s) => s.id === "dynamic-print-page-style");
      assert.ok(styleA5);
      assert.ok(styleA5.textContent.includes("size: A5 portrait;"));

      injectPrintPageStyles("letter");
      const styleLetter = createdStyles.find((s) => s.id === "dynamic-print-page-style");
      assert.ok(styleLetter);
      assert.ok(styleLetter.textContent.includes("size: letter portrait;"));
    });
  });
});
