import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createPosStorage,
  type LocalPosStorage,
  type Sale,
  type Product,
  saleToCommercialDocument,
  type DocumentCompanyInfo,
} from "@angola/shared";
import {
  computeOfflineDashboard,
  computeSalesReport,
  exportSalesReportCsv,
  exportSalesReportExcelHtml,
  generateSalesReportPrintHtml,
} from "./offline-dashboard.js";
import {
  generateCompleteDocumentHtml,
} from "./print-templates.js";

describe("Enterprise POS Sale, Invoicing & Visual Identity Audit Suite", () => {
  let storage: LocalPosStorage;

  const testCompany: DocumentCompanyInfo = {
    name: "Comercial Luanda Lda.",
    tradeName: "Supermercado Luanda",
    nif: "5418099887",
    address: "Avenida 4 de Fevereiro, n.º 150",
    city: "Luanda",
    province: "Luanda",
    phone: "+244 923 111 222",
    email: "comercial@superluanda.ao",
    website: "https://www.superluanda.ao",
    shareCapital: "50.000.000 Kz",
    commercialRegistry: "Registo Comercial Luanda 8921/26",
    logoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    thanksMessage: "Agradecemos a sua preferência! Volte sempre.",
    footerText: "Documento emitido ao abrigo do Regime Geral de IVA.",
    signatureText: "Assinatura do Adquirente / Carimbo Oficial",
  };

  const productCoffee: Product = {
    id: "prod-cafe-01",
    sku: "CAF-001",
    name: "Café Angola Ginga",
    priceCents: 125000, // 1.250 Kz retail PVP
    taxRate: 0.14,
    costCents: 80000,
    stock: 50,
    active: true,
  };

  beforeEach(async () => {
    storage = createPosStorage(`test-pos-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    if (storage.clear) await storage.clear();
  });

  describe("Scenario 1: Mandatory POS Values, Invoicing & Change Calculation", () => {
    it("should calculate exact retail tax-inclusive PVP, tender, and change: Product 1.250 Kz, Cash 2.000 Kz -> Change 750 Kz", async () => {
      // 1. Retail POS logic:
      // Product price is 1.250,00 Kz (125000 cents)
      const qty = 1;
      const grossTotal = productCoffee.priceCents * qty; // 125000
      const discountCents = 0;
      const totalCents = grossTotal - discountCents; // 125000 (1.250 Kz)

      // Tax extraction (IVA incluído no PVP a 14%):
      const lineBase = Math.round(grossTotal / (1 + productCoffee.taxRate)); // 125000 / 1.14 = 109649 cents (1.096,49 Kz)
      const taxCents = grossTotal - lineBase; // 15351 cents (153,51 Kz)
      const subtotalCents = totalCents - taxCents; // 109649 cents (1.096,49 Kz)

      assert.equal(totalCents, 125000, "Total a pagar deve ser exatamente 1.250 Kz (125000 cents)");
      assert.equal(subtotalCents + taxCents, totalCents, "Subtotal + IVA deve ser rigorosamente igual ao Total Final");
      assert.equal(subtotalCents, 109649, "Subtotal (base tributável) deve ser 1.096,49 Kz");
      assert.equal(taxCents, 15351, "IVA a 14% extraído deve ser 153,51 Kz");

      // 2. Customer payment:
      const cashTendered = 200000; // Customer hands 2.000 Kz
      const changeCents = cashTendered - totalCents; // 200000 - 125000 = 75000 cents (750 Kz)

      assert.equal(changeCents, 75000, "O troco calculado deve ser estritamente 750 Kz (75000 cents)");

      // 3. Construct and save Sale
      const sale: Sale = {
        id: "sale-scenario-1",
        number: "FR PDV 2026/0001",
        lines: [{
          productId: productCoffee.id,
          quantity: qty,
          unitPriceCents: productCoffee.priceCents,
          taxRate: productCoffee.taxRate,
        }],
        subtotalCents,
        taxCents,
        totalCents,
        currency: "AOA",
        createdAt: new Date().toISOString(),
        discountCents,
        paymentMethod: "CASH",
        cashCents: cashTendered,
        cardCents: 0,
        transferCents: 0,
        tenderedCents: cashTendered,
        changeCents,
        fiscalType: "INVOICE_RECEIPT",
      };

      await storage.saveSaleAndEnqueue(sale, {
        id: "mut-01",
        operation: "CREATE",
        entity: "SALE",
        payload: sale,
        occurredAt: sale.createdAt,
      });

      // 4. Convert to CommercialDocument
      const doc = saleToCommercialDocument(sale, testCompany, [productCoffee]);

      // Rule: Total da Venda = Total da Fatura = Total Impresso = Total Registado em Caixa
      assert.equal(doc.totalCents, sale.totalCents, "Total da Fatura deve ser exatamente igual ao Total da Venda");
      assert.equal(doc.paymentDetails?.tenderedCents, 200000, "Valor Entregue na fatura deve ser 2.000 Kz");
      assert.equal(doc.paymentDetails?.changeCents, 75000, "Troco na fatura deve ser exatamente 750 Kz");
      assert.equal(doc.subtotalCents, 109649, "Subtotal na fatura deve ser 1.096,49 Kz");
      assert.equal(doc.taxTotalCents, 15351, "Total de IVA na fatura deve ser 153,51 Kz");

      // 5. Verify HTML print output across formats (58mm, 80mm, A4)
      const html58 = await generateCompleteDocumentHtml(doc, "58mm");
      const html80 = await generateCompleteDocumentHtml(doc, "80mm");
      const htmlA4 = await generateCompleteDocumentHtml(doc, "a4");

      // 58mm checks
      assert.ok(html58.includes("1.250,00 Kz"), "HTML 58mm deve conter Total de 1.250,00 Kz");
      assert.ok(html58.includes("2.000,00 Kz"), "HTML 58mm deve conter Valor Entregue de 2.000,00 Kz");
      assert.ok(html58.includes("750,00 Kz"), "HTML 58mm deve conter Troco de 750,00 Kz");

      // 80mm checks
      assert.ok(html80.includes("1.250,00 Kz"), "HTML 80mm deve conter Total de 1.250,00 Kz");
      assert.ok(html80.includes("2.000,00 Kz"), "HTML 80mm deve conter Valor Entregue de 2.000,00 Kz");
      assert.ok(html80.includes("750,00 Kz"), "HTML 80mm deve conter Troco de 750,00 Kz");

      // A4 checks
      assert.ok(htmlA4.includes("1.250,00 Kz"), "HTML A4 deve conter Total de 1.250,00 Kz");
      assert.ok(htmlA4.includes("2.000,00 Kz"), "HTML A4 deve conter Valor Entregue de 2.000,00 Kz");
      assert.ok(htmlA4.includes("750,00 Kz"), "HTML A4 deve conter Troco de 750,00 Kz");
    });
  });

  describe("Scenario 2: Zero Mock / Fictitious Data on Clean Install", () => {
    it("should display strictly ZERO across all indicators when no sales exist", async () => {
      const summary = await computeOfflineDashboard({
        storage,
        customProducts: [],
      });

      const kpis = summary.offlineKpis;
      assert.ok(kpis, "Offline KPIs devem estar presentes");

      // All 8 required commercial indicators must be 0
      assert.equal(kpis.todaySalesCents, 0, "Vendas Hoje deve ser 0 Kz");
      assert.equal(kpis.todayDocuments, 0, "Faturas Hoje deve ser 0");
      assert.equal(kpis.weekSalesCents, 0, "Vendas Semana deve ser 0 Kz");
      assert.equal(kpis.weekDocuments, 0, "Faturas Semana deve ser 0");
      assert.equal(kpis.monthSalesCents, 0, "Vendas Mês deve ser 0 Kz");
      assert.equal(kpis.monthDocuments, 0, "Faturas Mês deve ser 0");
      assert.equal(kpis.yearSalesCents, 0, "Vendas Ano deve ser 0 Kz");
      assert.equal(kpis.yearDocuments, 0, "Faturas Ano deve ser 0");
      assert.equal(kpis.customersServedCount, 0, "Clientes Atendidos deve ser 0");
      assert.equal(kpis.totalDocuments, 0, "Total de Faturas deve ser 0");
      assert.equal(kpis.totalBilledCents, 0, "Receita Faturada deve ser 0 Kz");
      assert.equal(kpis.productsSoldUnits, 0, "Stock Vendido deve ser 0");

      // Charts and alerts must have zero fictitious data
      assert.equal(summary.charts.salesByDay.length, 0, "Gráfico de vendas deve estar vazio");
      assert.equal(summary.sales.byPayment.length, 0, "Vendas por pagamento deve estar vazio");
    });
  });

  describe("Scenario 3: Sales Report Engine & Multi-Format Exporters", () => {
    it("should compute accurate sales reports across periods and export CSV, Excel, and Print HTML", async () => {
      const now = new Date();
      // Record 3 real sales with different methods
      const s1: Sale = {
        id: "s-1",
        number: "FR 2026/01",
        lines: [{ productId: productCoffee.id, quantity: 2, unitPriceCents: 125000, taxRate: 0.14 }],
        subtotalCents: 219298,
        taxCents: 30702,
        totalCents: 250000,
        currency: "AOA",
        createdAt: now.toISOString(),
        paymentMethod: "CASH",
        tenderedCents: 300000,
        changeCents: 50000,
        fiscalType: "INVOICE_RECEIPT",
      };

      const s2: Sale = {
        id: "s-2",
        number: "FR 2026/02",
        lines: [{ productId: productCoffee.id, quantity: 1, unitPriceCents: 125000, taxRate: 0.14 }],
        subtotalCents: 109649,
        taxCents: 15351,
        totalCents: 125000,
        currency: "AOA",
        createdAt: now.toISOString(),
        paymentMethod: "CARD",
        tenderedCents: 125000,
        changeCents: 0,
        fiscalType: "INVOICE_RECEIPT",
      };

      const s3Proforma: Sale = {
        id: "s-3-fp",
        number: "FP 2026/01",
        lines: [{ productId: productCoffee.id, quantity: 10, unitPriceCents: 125000, taxRate: 0.14 }],
        subtotalCents: 1096491,
        taxCents: 153509,
        totalCents: 1250000,
        currency: "AOA",
        createdAt: now.toISOString(),
        fiscalType: "PROFORMA", // Must be excluded from commercial sales report
      };

      const sales = [s1, s2, s3Proforma];

      // Generate Sales Report for Today
      const report = computeSalesReport(sales, "today");

      assert.equal(report.salesCount, 2, "Proforma deve ser estritamente excluída do relatório comercial");
      assert.equal(report.totalBilledCents, 375000, "Total Faturado deve ser 250.000 + 125.000 = 375.000 Kz");
      assert.equal(report.totalReceivedCents, 425000, "Total Recebido deve ser 300.000 + 125.000 = 425.000 Kz");
      assert.equal(report.totalVatCents, 46053, "Total IVA deve ser 30.702 + 15.351 = 46.053 Kz");
      assert.equal(report.totalChangeCents, 50000, "Trocos entregues deve ser 50.000 Kz");

      // Verify payment methods breakdown
      const cashMethod = report.byPaymentMethod.find((m) => m.method === "CASH");
      const cardMethod = report.byPaymentMethod.find((m) => m.method === "CARD");
      assert.ok(cashMethod, "Método Numerário deve estar presente");
      assert.equal(cashMethod?.count, 1);
      assert.equal(cashMethod?.totalCents, 250000);
      assert.ok(cardMethod, "Método Cartão deve estar presente");
      assert.equal(cardMethod?.count, 1);
      assert.equal(cardMethod?.totalCents, 125000);

      // Verify CSV export
      const csv = exportSalesReportCsv(report);
      assert.ok(csv.startsWith("\uFEFF"), "CSV deve conter UTF-8 BOM");
      assert.ok(csv.includes("3750,00"), "CSV deve conter Total Faturado");
      assert.ok(csv.includes("500,00"), "CSV deve conter Trocos Entregues");

      // Verify Excel export
      const excel = exportSalesReportExcelHtml(report, testCompany.name);
      assert.ok(excel.includes("urn:schemas-microsoft-com:office:excel"), "Deve gerar formato nativo Excel XML");
      assert.ok(excel.includes("3.750,00 Kz"), "Excel deve conter Total Faturado formatado");

      // Verify Print HTML export
      const printHtml = generateSalesReportPrintHtml(report, testCompany);
      assert.ok(printHtml.includes(testCompany.name), "HTML de impressão deve conter Razão Social da Empresa");
      assert.ok(printHtml.includes(testCompany.nif), "HTML de impressão deve conter NIF da Empresa");
      assert.ok(printHtml.includes("3.750,00 Kz"), "HTML de impressão deve conter Total Faturado");
    });
  });

  describe("Scenario 4: Professional Company Identity & Customization", () => {
    it("should never use VENDAJÁ as header and strictly print real client company information", async () => {
      const sale: Sale = {
        id: "sale-custom-co",
        number: "FT 2026/9001",
        lines: [{
          productId: productCoffee.id,
          quantity: 1,
          unitPriceCents: 125000,
          taxRate: 0.14,
        }],
        subtotalCents: 109649,
        taxCents: 15351,
        totalCents: 125000,
        currency: "AOA",
        createdAt: new Date().toISOString(),
        paymentMethod: "CASH",
        tenderedCents: 200000,
        changeCents: 75000,
        fiscalType: "INVOICE",
      };

      const doc = saleToCommercialDocument(sale, testCompany, [productCoffee]);

      const html58 = await generateCompleteDocumentHtml(doc, "58mm");
      const html80 = await generateCompleteDocumentHtml(doc, "80mm");
      const htmlA4 = await generateCompleteDocumentHtml(doc, "a4");

      const formats: Array<[string, string]> = [["58mm", html58], ["80mm", html80], ["A4", htmlA4]];
      for (const [format, html] of formats) {
        // Assert client company name and NIF are present
        assert.ok(html.includes(testCompany.name), `${format} deve conter nome da empresa do cliente`);
        assert.ok(html.includes(testCompany.nif), `${format} deve conter NIF da empresa do cliente`);

        // Assert custom thanks message and footer text
        assert.ok(html.includes("Agradecemos a sua preferência!"), `${format} deve conter mensagem de agradecimento personalizada`);
        assert.ok(html.includes("Regime Geral de IVA"), `${format} deve conter texto de rodapé personalizado`);

        // Assert VENDAJÁ is NOT used as company brand title/header
        assert.ok(!html.includes('class="r58-brand-title">VENDAJÁ'), `58mm não deve ter VENDAJÁ como cabeçalho`);
        assert.ok(!html.includes('class="r80-brand-title">VENDAJÁ'), `80mm não deve ter VENDAJÁ como cabeçalho`);
        assert.ok(!html.includes('class="office-logo-badge">VEN'), `A4 não deve ter VENDAJÁ como logo badge`);
      }
    });
  });
});
