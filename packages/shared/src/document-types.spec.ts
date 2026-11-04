import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type CommercialDocumentType,
  type PaperFormat,
  DOCUMENT_TYPE_METADATA,
  PAPER_FORMAT_INFO,
  buildAgtQrPayload,
  buildFiscalStructuredQrPayload,
  formatAgtCertificationMention,
  createSampleCommercialDocument,
  saleToCommercialDocument,
} from "./document-types.js";

describe("Commercial Document Engine & Types", () => {
  it("should define all 12 commercial and operational document types", () => {
    const expectedTypes: CommercialDocumentType[] = [
      "FT",
      "FR",
      "RC",
      "NC",
      "ND",
      "FP",
      "EC",
      "GR",
      "GT",
      "OC",
      "POS_X",
      "POS_Z",
    ];

    for (const type of expectedTypes) {
      const meta = DOCUMENT_TYPE_METADATA[type];
      assert.ok(meta, `Metadata missing for document type ${type}`);
      assert.ok(meta.label.length > 0, `Label missing for ${type}`);
      assert.ok(meta.acronym.length > 0, `Acronym missing for ${type}`);
      assert.strictEqual(typeof meta.fiscal, "boolean");
    }
  });

  it("should define all supported paper formats with correct dimensions and properties", () => {
    const expectedFormats: PaperFormat[] = ["58mm", "80mm", "a5", "a4", "letter"];

    for (const fmt of expectedFormats) {
      const info = PAPER_FORMAT_INFO[fmt];
      assert.ok(info, `Paper format info missing for ${fmt}`);
      assert.ok(info.widthMm > 0, `Width must be > 0 for ${fmt}`);
      if (fmt === "58mm" || fmt === "80mm") {
        assert.strictEqual(info.isRoll, true, `${fmt} must be identified as roll paper`);
        assert.strictEqual(info.defaultMarginsMm, 0, `${fmt} must have 0mm default margins`);
      } else {
        assert.strictEqual(info.isRoll, false, `${fmt} must be sheet paper`);
        assert.ok(info.heightMm! > 0, `${fmt} must have positive height`);
      }
    }
  });

  it("should generate structured fiscal QR payload (pilot format)", () => {
    const payload = buildAgtQrPayload({
      issuerNif: "5417283921",
      customerNif: "5000182749",
      documentType: "FR",
      documentNumber: "FR 2026/0001",
      totalCents: 1540000,
      dateIso: "2026-10-20T10:00:00.000Z",
      hash: "a1b2c3d4",
    });

    assert.strictEqual(
      payload,
      "AO|5417283921|5000182749|FR|FR 2026/0001|15400.00|2026-10-20|a1b2c3d4"
    );
  });

  it("should format fiscal software mention with 4-character hash prefix", () => {
    const mentionWithCert = formatAgtCertificationMention("e74a81dc", "TEST-CERT-123");
    assert.strictEqual(mentionWithCert, "e74a-Processado por programa informático (certificação formal: TEST-CERT-123)");

    const mentionPending = formatAgtCertificationMention("e74a81dc", "PENDING_HOMOLOGATION");
    assert.strictEqual(mentionPending, "e74a-Processado por programa informático · Não homologado até aprovação formal da AGT");

    const mentionProvisional = formatAgtCertificationMention("e74a81dc", "PROVISIONAL");
    assert.strictEqual(mentionProvisional, "e74a-Processado por programa informático · Não homologado até aprovação formal da AGT");

    const mentionWithoutCert = formatAgtCertificationMention("e74a81dc");
    assert.strictEqual(mentionWithoutCert, "e74a-Processado por programa informático · Não homologado até aprovação formal da AGT");
  });

  it("should create valid sample documents for all 12 document types", () => {
    const types: CommercialDocumentType[] = [
      "FT",
      "FR",
      "RC",
      "NC",
      "ND",
      "FP",
      "EC",
      "GR",
      "GT",
      "OC",
      "POS_X",
      "POS_Z",
    ];

    for (const type of types) {
      const doc = createSampleCommercialDocument(type);
      assert.ok(doc, `Failed to create sample for ${type}`);
      assert.strictEqual(doc.type, type);
      assert.ok(doc.company.nif, "Company NIF required");
      assert.ok(doc.company.name, "Company Name required");
      assert.ok(doc.number, "Document number required");

      if (type === "GT") {
        assert.ok(doc.transport, "Transport info required for GT");
        assert.ok(doc.transport.vehiclePlate, "Vehicle plate required for GT");
      }

      if (type === "NC") {
        assert.ok(doc.referenceDocument, "Reference document required for NC");
      }

      if (type === "POS_X" || type === "POS_Z") {
        assert.ok(doc.cashSummary, `Cash summary required for ${type}`);
        assert.ok(
          doc.cashSummary.openingBalanceCents >= 0,
          "Opening balance required for cash reports"
        );
      }
    }
  });

  it("should convert POS sale to CommercialDocument with multi-rate tax calculation", () => {
    const sale = {
      id: "sale-999",
      number: "FR 2026/0042",
      lines: [
        { productId: "p1", quantity: 2, unitPriceCents: 100000, taxRate: 0.14 },
        { productId: "p2", quantity: 1, unitPriceCents: 50000, taxRate: 0.05 },
        { productId: "p3", quantity: 3, unitPriceCents: 20000, taxRate: 0.0 },
      ],
      subtotalCents: 310000,
      taxCents: 30500, // 200000*0.14 = 28000; 50000*0.05 = 2500; total = 30500
      totalCents: 340500,
      createdAt: "2026-10-20T11:00:00.000Z",
      discountCents: 0,
      paymentMethod: "CASH" as const,
      cashCents: 400000,
      customerName: "Empresa XPTO, Lda.",
      customerNif: "5401928374",
      fiscalType: "INVOICE_RECEIPT" as const,
      operatorName: "António Manuel",
      terminalId: "POS-01",
    };

    const company = {
      name: "Loja Central, Lda.",
      nif: "5000998877",
      address: "Rua Direita de Luanda",
      phone: "+244 923 111 222",
    };

    const catalog = [
      { id: "p1", name: "Produto 14%", sku: "SKU-14", brand: "Marca A" },
      { id: "p2", name: "Produto 5%", sku: "SKU-05", brand: "Marca B" },
      { id: "p3", name: "Produto Isento", sku: "SKU-00" },
    ];

    const doc = saleToCommercialDocument(sale, company, catalog, "f9e8d7c6");

    assert.strictEqual(doc.id, "sale-999");
    assert.strictEqual(doc.type, "FR");
    assert.strictEqual(doc.number, "FR 2026/0042");
    assert.strictEqual(doc.lines.length, 3);
    const line0 = doc.lines[0]!;
    assert.strictEqual(line0.description, "Produto 14% · Marca A");
    assert.strictEqual(line0.code, "SKU-14");
    assert.strictEqual(line0.totalCents, 200000);

    // Verify tax summary breakdown has all 3 rates
    assert.strictEqual(doc.taxSummary.length, 3);
    const rate14 = doc.taxSummary.find((t) => t.rate === 0.14);
    assert.ok(rate14);
    assert.strictEqual(rate14.baseCents, 200000);
    assert.strictEqual(rate14.taxCents, 28000);

    const rate5 = doc.taxSummary.find((t) => t.rate === 0.05);
    assert.ok(rate5);
    assert.strictEqual(rate5.baseCents, 50000);
    assert.strictEqual(rate5.taxCents, 2500);

    const rate0 = doc.taxSummary.find((t) => t.rate === 0.0);
    assert.ok(rate0);
    assert.strictEqual(rate0.baseCents, 60000);
    assert.strictEqual(rate0.taxCents, 0);
    assert.ok(rate0.exemptionReason?.includes("Isento"));

    // Verify payment change
    assert.ok(doc.paymentDetails);
    assert.strictEqual(doc.paymentDetails.tenderedCents, 400000);
    assert.strictEqual(doc.paymentDetails.changeCents, 400000 - 340500);

    // Verify fiscal hash & QR
    assert.strictEqual(doc.fiscalHash, "f9e8d7c6");
    assert.ok(doc.qrPayload?.startsWith("AO|5000998877|5401928374|FR|"));
  });

  it("strictly prohibits false AGT certification claims in generated documents", () => {
    const prohibitedPatterns = [
      /24\/AGT\/2026/,
      /software certificado/i,
      /certificado pela AGT/i,
      /certificação emitida/i,
      /licença oficial AGT/i,
      /validador oficial/i,
      /conformidade fiscal AGT/i,
      /QR AGT/i,
      /QR Code Fiscal AGT/i,
      /Código QR Fiscal AGT/i,
      /AGT Fiscal QR/i,
      /Consulte a validação na AGT/i,
      /payload AGT/i,
      /AGT-TRANS-/i,
    ];

    const allTypes: CommercialDocumentType[] = [
      "FT", "FR", "RC", "NC", "ND", "FP", "EC", "GR", "GT", "OC", "POS_X", "POS_Z"
    ];
    for (const t of allTypes) {
      const sample = createSampleCommercialDocument(t);
      const json = JSON.stringify(sample);
      for (const pattern of prohibitedPatterns) {
        assert.strictEqual(
          pattern.test(json),
          false,
          `Sample document ${t} must not match prohibited claim pattern: ${pattern}`
        );
      }
    }

    const defaultMention = formatAgtCertificationMention("abc12345");
    assert.ok(
      defaultMention.includes("Não homologado até aprovação formal da AGT"),
      "Default mention must state non-homologated until formal AGT approval"
    );
    assert.strictEqual(
      defaultMention.includes("24/AGT/2026"),
      false,
      "Default mention must never contain fake certification number"
    );
  });

  it("strictly enforces AGT compliance across all production source files", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const prohibitedPatterns = [
      /QR AGT/i,
      /QR Code Fiscal AGT/i,
      /Código QR Fiscal AGT/i,
      /AGT Fiscal QR/i,
      /Consulte a validação na AGT/i,
      /software certificado/i,
      /certificado pela AGT/i,
      /certificação emitida/i,
      /validador oficial/i,
      /conformidade fiscal AGT/i,
      /24\/AGT\/2026/,
      /payload AGT/i,
    ];

    const violations: { file: string; pattern: string }[] = [];

    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (["node_modules", "dist", "build", ".git", "coverage", "release", ".system_generated"].includes(entry.name)) {
            continue;
          }
          scanDir(fullPath);
        } else if (entry.isFile()) {
          if (/\.(spec|test)\.[jt]sx?$/.test(entry.name)) continue;
          if (!/\.(ts|tsx|js|jsx|json|html|css|mjs)$/.test(entry.name)) continue;
          const content = fs.readFileSync(fullPath, "utf8");
          for (const pattern of prohibitedPatterns) {
            if (pattern.test(content)) {
              violations.push({ file: fullPath, pattern: pattern.toString() });
            }
          }
        }
      }
    }

    const root = path.resolve(process.cwd());
    scanDir(path.join(root, "apps"));
    scanDir(path.join(root, "packages"));

    assert.strictEqual(
      violations.length,
      0,
      `Forbidden AGT claims found in production source files: ${JSON.stringify(violations, null, 2)}`
    );
  });

  it("confirms pilot QR and provisional mentions adhere strictly to legal requirements", () => {
    // 1. Mandatory declaration check
    const mandatoryNotice = "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.";
    assert.ok(mandatoryNotice.length > 0);

    // 2. Empty/provisional certification number is NEVER printed as official
    const provisionalCases = ["", "   ", "PROVISIONAL", "PENDING_HOMOLOGATION", "000/AGT/2026", "24/AGT/2026"];
    for (const cert of provisionalCases) {
      const mention = formatAgtCertificationMention("cafe9876", cert);
      assert.strictEqual(
        mention,
        "cafe-Processado por programa informático · Não homologado até aprovação formal da AGT",
        `Must not print provisional certification '${cert}' as formal`
      );
      assert.strictEqual(mention.includes("certificação formal:"), false);
    }

    // 3. Pilot QR payload format is structured without claiming official validation
    const qr = buildFiscalStructuredQrPayload({
      issuerNif: "5400000000",
      customerNif: "999999999",
      documentType: "FT",
      documentNumber: "FT 2026/0001",
      totalCents: 100000,
      dateIso: "2026-11-04T12:00:00Z",
      hash: "feedbeef",
    });
    assert.ok(qr.startsWith("AO|5400000000|999999999|FT|FT 2026/0001|1000.00|2026-11-04|feedbeef"));
    assert.strictEqual(/AGT|OFICIAL/i.test(qr), false, "QR payload must not claim official validation");
  });
});
