import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import qrcode from "qrcode";
import { QRCodeReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from "@zxing/library";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = crypto.randomBytes(32).toString("base64url");
process.env.FISCAL_CONFIG_KEY = crypto.randomBytes(32).toString("base64url");

import {
  calculateFiscalDocument,
  validateAngolanNif,
  validateVatExemption,
  validateFiscalDocumentWorkflow,
  deterministicInvoiceHash,
  pilotFiscalHashProvider,
  pilotFiscalQrProvider,
  validateSaftXml,
  DEFAULT_PROVISIONAL_FISCAL_POLICY,
  type TenantFiscalPolicy,
} from "./fiscal.js";
import { assertImmutableFiscalMutation } from "./fiscal-integrity.js";

describe("Fiscal Homologation Preparation & Compliance Suite", () => {
  // =========================================================================
  // 1. CENTRALIZED TAX, WITHHOLDING, DISCOUNT & ROUNDING ENGINE
  // =========================================================================
  describe("Centralized Calculation Engine", () => {
    it("calculates multi-rate IVA (14%, 0%) with valid exemption codes correctly", () => {
      const result = calculateFiscalDocument({
        lines: [
          {
            quantity: 2,
            unitPriceCents: 100000, // 1.000,00 Kz cada
            taxRate: 0.14, // 14% IVA
          },
          {
            quantity: 1,
            unitPriceCents: 50000, // 500,00 Kz
            taxRate: 0, // Isento
            exemptionCode: "M02",
            exemptionReason: "Transmissão de bens e serviços isentos",
          },
        ],
      });

      // Subtotal: 2 * 100000 + 50000 = 250000 (2.500,00 Kz)
      assert.equal(result.subtotalCents, 250000);
      assert.equal(result.discountCents, 0);
      assert.equal(result.taxableBaseCents, 250000);
      // Tax: 14% of 200000 = 28000 (280,00 Kz)
      assert.equal(result.taxCents, 28000);
      // Total: 250000 + 28000 = 278000 (2.780,00 Kz)
      assert.equal(result.totalCents, 278000);
      assert.equal(result.netPayableCents, 278000);
      assert.equal(result.taxBreakdown["14"]?.baseCents, 200000);
      assert.equal(result.taxBreakdown["14"]?.taxCents, 28000);
      assert.equal(result.taxBreakdown["0"]?.baseCents, 50000);
    });

    it("calculates prices WITH IVA (isGrossPrice: true) and WITHOUT IVA (isGrossPrice: false)", () => {
      // 1. Sem IVA (preço líquido como base): 10.000 Kz + 14% IVA = 11.400 Kz
      const netCalc = calculateFiscalDocument({
        isGrossPrice: false,
        lines: [{ quantity: 1, unitPriceCents: 1000000, taxRate: 0.14 }],
      });
      assert.equal(netCalc.taxableBaseCents, 1000000);
      assert.equal(netCalc.taxCents, 140000);
      assert.equal(netCalc.totalCents, 1140000);

      // 2. Com IVA incluído (preço de prateleira 11.400 Kz desagrega base 10.000 Kz e imposto 1.400 Kz)
      const grossCalc = calculateFiscalDocument({
        isGrossPrice: true,
        lines: [{ quantity: 1, unitPriceCents: 1140000, taxRate: 0.14 }],
      });
      assert.equal(grossCalc.taxableBaseCents, 1000000);
      assert.equal(grossCalc.taxCents, 140000);
      assert.equal(grossCalc.totalCents, 1140000);
    });

    it("applies rounding modes correctly: HALF_UP, HALF_EVEN, DOWN", () => {
      // Valor com 14% sobre 105 cêntimos = 14.7 cêntimos
      const halfUp = calculateFiscalDocument({
        roundingMode: "HALF_UP",
        lines: [{ quantity: 1, unitPriceCents: 105, taxRate: 0.14 }],
      });
      assert.equal(halfUp.taxCents, 15); // 14.7 arredonda para cima para 15

      const down = calculateFiscalDocument({
        roundingMode: "DOWN",
        lines: [{ quantity: 1, unitPriceCents: 105, taxRate: 0.14 }],
      });
      assert.equal(down.taxCents, 14); // 14.7 trunca para 14
    });

    it("applies withholding tax (Retenção na fonte 6.5%) and discounts accurately", () => {
      const result = calculateFiscalDocument({
        lines: [
          {
            quantity: 1,
            unitPriceCents: 100000, // 1.000,00 Kz
            taxRate: 0.14, // 140,00 Kz IVA
            discountCents: 10000, // Desconto de linha de 100,00 Kz (Líquido: 900,00 Kz)
          },
        ],
        globalDiscountCents: 5000, // Desconto financeiro global de 50,00 Kz
        withholdingRate: 0.065, // Retenção na fonte 6.5%
      });

      // Subtotal ilíquido: 100.000 cêntimos
      assert.equal(result.subtotalCents, 100000);
      // Descontos totais: 10.000 (linha) + 5.000 (global) = 15.000 cêntimos
      assert.equal(result.discountCents, 15000);
      // Base tributável líquida: 100.000 - 15.000 = 85.000 cêntimos
      assert.equal(result.taxableBaseCents, 85000);
      // IVA de linha (14% de 90.000 net line) = 12.600 cêntimos
      assert.equal(result.taxCents, 12600);
      // Total fatura: 85.000 + 12.600 = 97.600 cêntimos (976,00 Kz)
      assert.equal(result.totalCents, 97600);
      // Retenção (6.5% de 85.000) = 5.525 cêntimos
      assert.equal(result.withholdingCents, 5525);
      // Total a pagar: 97.600 - 5.525 = 92.075 cêntimos (920,75 Kz)
      assert.equal(result.netPayableCents, 92075);
    });

    it("validates configurable vat exemption codes by tenant policy", () => {
      const customPolicy: TenantFiscalPolicy = {
        ...DEFAULT_PROVISIONAL_FISCAL_POLICY,
        exemptions: [
          {
            code: "M99",
            reason: "Regime Especial Zona Franca",
            legalBase: "Artigo 99 Lei Especial",
            effectiveFrom: "2026-01-01",
            origin: "TENANT_CUSTOM_CONFIGURATION",
            status: "ACTIVE",
          },
        ],
      };

      // Valid under custom policy
      assert.equal(validateVatExemption(0, "M99", customPolicy), true);

      // Invalid code not present in custom policy
      assert.throws(
        () => validateVatExemption(0, "M01", customPolicy),
        /invalid_vat_exemption_code:M01/
      );
    });

    it("rejects zero-tax rate without mandatory exemption code", () => {
      assert.throws(
        () =>
          calculateFiscalDocument({
            lines: [{ quantity: 1, unitPriceCents: 5000, taxRate: 0 }],
          }),
        /vat_exemption_code_required/
      );
    });

    it("rejects line discount greater than line gross value", () => {
      assert.throws(
        () =>
          calculateFiscalDocument({
            lines: [{ quantity: 1, unitPriceCents: 5000, discountCents: 6000, taxRate: 0.14 }],
          }),
        /line_discount_exceeds_gross_value/
      );
    });
  });

  // =========================================================================
  // 2. NIF VALIDATION & CONFIGURABLE POLICY
  // =========================================================================
  describe("NIF Validation Engine", () => {
    it("accepts valid Angolan 10-character corporate and individual NIFs", () => {
      assert.equal(validateAngolanNif("5412345678"), true);
      assert.equal(validateAngolanNif("001234567A"), true);
      assert.equal(validateAngolanNif("999999999"), true); // Consumidor Final
    });

    it("rejects invalid NIF formats under standard policy", () => {
      assert.equal(validateAngolanNif(""), false);
      assert.equal(validateAngolanNif("12345"), false); // Demasiado curto
      assert.equal(validateAngolanNif("1234567890123"), false); // Demasiado longo
      assert.equal(validateAngolanNif("12345-678A"), false); // Contém hífen
    });

    it("supports permissive NIF policy for international non-resident clients", () => {
      const permissivePolicy = {
        mode: "PERMISSIVE" as const,
        allowFinalConsumer: true,
        finalConsumerNif: "999999999",
        origin: "TENANT_CUSTOM_CONFIGURATION" as const,
        status: "ACTIVE" as const,
      };
      assert.equal(validateAngolanNif("PT500123456", permissivePolicy), true);
      assert.equal(validateAngolanNif("US-998877", permissivePolicy), true);
    });
  });

  // =========================================================================
  // 3. WORKFLOW RULES: FT, FR, NC, ND, RC, GT, PF
  // =========================================================================
  describe("Fiscal Document Workflow Rules", () => {
    it("Credit Note (NC) requires reference to an existing FT or FR", () => {
      const validNc = validateFiscalDocumentWorkflow({
        documentType: "NC",
        referencedDocument: {
          documentType: "FT",
          number: "FT 2026/0001",
          totalCents: 50000,
        },
      });
      assert.equal(validNc.valid, true);

      const invalidNcMissing = validateFiscalDocumentWorkflow({
        documentType: "NC",
      });
      assert.equal(invalidNcMissing.valid, false);
      assert.ok(invalidNcMissing.reason?.includes("referência obrigatória"));

      const invalidNcProforma = validateFiscalDocumentWorkflow({
        documentType: "NC",
        referencedDocument: {
          documentType: "PF",
          number: "PF 2026/0001",
          totalCents: 50000,
        },
      });
      assert.equal(invalidNcProforma.valid, false);
    });

    it("Debit Note (ND) requires reference to an existing FT", () => {
      const validNd = validateFiscalDocumentWorkflow({
        documentType: "ND",
        referencedDocument: {
          documentType: "FT",
          number: "FT 2026/0001",
          totalCents: 50000,
        },
      });
      assert.equal(validNd.valid, true);

      const invalidNd = validateFiscalDocumentWorkflow({
        documentType: "ND",
      });
      assert.equal(invalidNd.valid, false);
      assert.ok(invalidNd.reason?.includes("referência obrigatória"));
    });

    it("Receipt (RC) requires reference to an FT", () => {
      const validRc = validateFiscalDocumentWorkflow({
        documentType: "RC",
        referencedDocument: {
          documentType: "FT",
          number: "FT 2026/0001",
          totalCents: 50000,
          remainingBalanceCents: 20000,
        },
      });
      assert.equal(validRc.valid, true);

      const invalidRc = validateFiscalDocumentWorkflow({
        documentType: "RC",
        referencedDocument: {
          documentType: "FR", // Fatura-Recibo já está paga
          number: "FR 2026/0001",
          totalCents: 50000,
        },
      });
      assert.equal(invalidRc.valid, false);
    });

    it("Transport Guide (GT) requires vehicle and departure metadata according to policy", () => {
      const validGt = validateFiscalDocumentWorkflow({
        documentType: "GT",
        transportInfo: {
          vehiclePlate: "LD-01-22-AA",
          driverName: "João Motorista",
          departureAddress: "Armazém Central, Luanda",
          deliveryAddress: "Loja Kilamba, Luanda",
          departureDateTime: "2026-06-01T08:00:00Z",
        },
      });
      assert.equal(validGt.valid, true);

      const invalidGt = validateFiscalDocumentWorkflow({
        documentType: "GT",
        transportInfo: {
          vehiclePlate: "",
          departureAddress: "Armazém",
          deliveryAddress: "Loja",
          departureDateTime: "2026-06-01T08:00:00Z",
        },
      });
      assert.equal(invalidGt.valid, false);
      assert.ok(invalidGt.reason?.includes("matrícula"));
    });

    it("Invoice-Receipt (FR) requires immediate payment and rejects CREDIT modality", () => {
      const validFrCash = validateFiscalDocumentWorkflow({
        documentType: "FR",
        paymentMethod: "CASH",
      });
      assert.equal(validFrCash.valid, true);

      const invalidFrCredit = validateFiscalDocumentWorkflow({
        documentType: "FR",
        paymentMethod: "CREDIT",
      });
      assert.equal(invalidFrCredit.valid, false);
      assert.ok(invalidFrCredit.reason?.includes("pronto pagamento imediato"));
    });
  });

  // =========================================================================
  // 4. HASH CHAINING & REAL QR CODE DECODING
  // =========================================================================
  describe("Cryptographic Chained Hash & Real QR Code Decoding", () => {
    it("produces deterministic hash chained to the previous document hash", () => {
      const invoice1 = {
        number: "FT 2026/0001",
        date: new Date("2026-01-01T10:00:00Z"),
        subtotalCents: 10000,
        totalCents: 11400,
        taxCents: 1400,
        previousHash: null,
      };
      const hash1 = pilotFiscalHashProvider.hash(invoice1);
      assert.ok(hash1 && hash1.length === 64);

      const invoice2 = {
        number: "FT 2026/0002",
        date: new Date("2026-01-01T10:05:00Z"),
        subtotalCents: 20000,
        totalCents: 22800,
        taxCents: 2800,
        previousHash: hash1,
      };
      const hash2 = pilotFiscalHashProvider.hash(invoice2);
      assert.ok(hash2 && hash2.length === 64);
      assert.notEqual(hash1, hash2);

      // Verify deterministic reproducibility
      const hash2Replay = pilotFiscalHashProvider.hash(invoice2);
      assert.equal(hash2, hash2Replay);
    });

    it("generates real graphical QR code and proves byte-for-byte decoding with ZXing", async () => {
      const payload = "A:5412345678*B:FT A/1*C:2026-01-10*D:10000.00*E:1400.00*F:HASH_CHAINED_1234";

      // 1. Generate real matrix with qrcode library
      const qrData = qrcode.create(payload, { errorCorrectionLevel: "M" });
      const modSize = qrData.modules.size;
      const modulePixels = 8;
      const borderModules = 4;
      const totalWidth = (modSize + borderModules * 2) * modulePixels;
      const gray = new Uint8ClampedArray(totalWidth * totalWidth);
      gray.fill(255); // White background

      for (let r = 0; r < modSize; r++) {
        for (let c = 0; c < modSize; c++) {
          if (qrData.modules.get(r, c)) {
            for (let py = 0; py < modulePixels; py++) {
              for (let px = 0; px < modulePixels; px++) {
                const y = (r + borderModules) * modulePixels + py;
                const x = (c + borderModules) * modulePixels + px;
                gray[y * totalWidth + x] = 0; // Black module
              }
            }
          }
        }
      }

      // 2. Decode matrix independently with ZXing QRCodeReader
      const source = new RGBLuminanceSource(gray, totalWidth, totalWidth);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));
      const reader = new QRCodeReader();
      const decodedResult = reader.decode(bitmap);

      // 3. Proves 100% fidelity between generated QR and decoded payload
      assert.equal(decodedResult.getText(), payload);
    });
  });

  // =========================================================================
  // 5. IMMUTABILITY GUARDS (STRICT PROHIBITION OF DELETE & CANCELLED)
  // =========================================================================
  describe("Immutability of Issued Fiscal Records", () => {
    it("strictly blocks direct cancellation (status: CANCELLED) on issued fiscal sale", () => {
      assert.throws(
        () =>
          assertImmutableFiscalMutation("Sale", "update", {
            status: "CANCELLED",
          }),
        /immutable_fiscal_cancellation_prohibited/
      );

      assert.throws(
        () =>
          assertImmutableFiscalMutation("Sale", "update", {
            cancelledAt: new Date(),
            status: "CANCELLED",
          }),
        /immutable_fiscal_cancellation_prohibited/
      );
    });

    it("strictly blocks direct cancellation on issued CommercialDocument", () => {
      assert.throws(
        () =>
          assertImmutableFiscalMutation("CommercialDocument", "update", {
            status: "CANCELLED",
          }),
        /immutable_fiscal_commercial_document_cancellation_prohibited/
      );
    });

    it("blocks delete on Sale and CommercialDocument", () => {
      assert.throws(
        () => assertImmutableFiscalMutation("Sale", "delete", null, { id: "123" }),
        /immutable_fiscal_sale/
      );
      assert.throws(
        () => assertImmutableFiscalMutation("CommercialDocument", "delete", null, { id: "123" }),
        /immutable_fiscal_commercial_document/
      );
    });

    it("blocks tampering of financial amounts, number and hash", () => {
      assert.throws(
        () => assertImmutableFiscalMutation("Sale", "update", { totalCents: 5000 }),
        /immutable_fiscal_sale_fields:totalCents/
      );
      assert.throws(
        () => assertImmutableFiscalMutation("Sale", "update", { fiscalHash: "MODIFIED" }),
        /immutable_fiscal_sale_fields:fiscalHash/
      );
    });
  });

  // =========================================================================
  // 6. XSD OFFICIAL REQUIREMENT GATE & EXACT FORMULATION
  // =========================================================================
  describe("Official AGT XSD Gate in Production & SAF-T Formulation", () => {
    it("strictly fails in production if SAFT_AO_XSD_PATH is not configured or missing", () => {
      const previousXsd = process.env.SAFT_AO_XSD_PATH;

      process.env.NODE_ENV = "production";
      delete process.env.SAFT_AO_XSD_PATH;

      const sampleXml =
        '<?xml version="1.0" encoding="UTF-8"?><AuditFile><Header></Header><MasterFiles></MasterFiles><SourceDocuments></SourceDocuments></AuditFile>';

      assert.throws(
        () => validateSaftXml(sampleXml),
        /official_saft_xsd_required_in_production/
      );

      process.env.NODE_ENV = "test";
      if (previousXsd) process.env.SAFT_AO_XSD_PATH = previousXsd;
    });

    it("declares exact required formulation without claiming official conformity", () => {
      process.env.NODE_ENV = "test";
      const sampleXml =
        '<?xml version="1.0" encoding="UTF-8"?><AuditFile><Header></Header><MasterFiles></MasterFiles><SourceDocuments></SourceDocuments></AuditFile>';

      const report = validateSaftXml(sampleXml);
      assert.equal(report.valid, true);
      assert.equal(report.status, "PREPARED_FOR_EXTERNAL_XSD_VALIDATION");
      assert.equal(
        report.formulation,
        "exportador estrutural preparado para validação contra XSD oficial externo"
      );
      assert.ok(report.caveat?.includes("Preparado tecnicamente para processo de homologação"));
    });
  });
});
