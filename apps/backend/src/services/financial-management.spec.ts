import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BankReconciliationService,
  TreasuryService,
  CashForecastService,
  ReceivablesService,
  PayablesService,
  FixedAssetsService,
  BudgetService,
  FinancialClosingService,
  CostCenterService,
  MultiCompanyService,
  FinancialMetricsService,
} from "./enterprise/index.js";

describe("Phase 6: Enterprise Financial Management, Treasury, Assets & Accounting Test Suite", () => {
  const testCompanyId = "comp-financial-spec-01";

  // ==========================================
  // 1. CONCILIAÇÃO BANCÁRIA (OFX, MT940, CSV)
  // ==========================================
  describe("Bank Reconciliation Service", () => {
    test("parses OFX bank statement format accurately", () => {
      const sampleOfx = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>AOA</CURDEF>
        <BANKACCTFROM>
          <BANKID>0006</BANKID>
          <ACCTID>12345678901</ACCTID>
          <ACCTTYPE>CHECKING</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20261001000000</DTSTART>
          <DTEND>20261020235959</DTEND>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20261015120000</DTPOSTED>
            <TRNAMT>500000.00</TRNAMT>
            <FITID>TXN-BAI-20261015-001</FITID>
            <NAME>RECEBIMENTO CLIENTE SONANGOL</NAME>
            <MEMO>REF FT2026/045</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20261016153000</DTPOSTED>
            <TRNAMT>-125000.50</TRNAMT>
            <FITID>TXN-BAI-20261016-002</FITID>
            <NAME>PAGAMENTO FORNECEDOR ENDE</NAME>
            <MEMO>ENERGIA SEDE</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>15450000.00</BALAMT>
          <DTASOF>20261020235959</DTASOF>
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
      `;

      const parsed = BankReconciliationService.parseOfx(sampleOfx);
      assert.ok(parsed);
      assert.equal(parsed.lines.length, 2, "Deve extrair exatamente 2 transações do extrato OFX");

      // Verify Credit transaction
      const creditTx = parsed.lines[0];
      assert.ok(creditTx);
      assert.equal(creditTx.direction, "IN");
      assert.equal(creditTx.amountCents, 500_000_00); // 500.000,00 Kz em cêntimos
      assert.equal(creditTx.fitid, "TXN-BAI-20261015-001");
      assert.ok(creditTx.description.includes("SONANGOL"));

      // Verify Debit transaction
      const debitTx = parsed.lines[1];
      assert.ok(debitTx);
      assert.equal(debitTx.direction, "OUT");
      assert.equal(debitTx.amountCents, 125_000_50); // 125.000,50 Kz em cêntimos
      assert.equal(debitTx.fitid, "TXN-BAI-20261016-002");
      assert.ok(debitTx.description.includes("ENDE"));

      // Verify Closing Balance
      assert.equal(parsed.closingBalanceCents, 15_450_000_00);
    });

    test("parses SWIFT MT940 bank statement format", () => {
      const sampleMt940 = `
:20:STATEMENT2026
:25:0006/12345678901
:28C:00010/001
:60F:C261001AOA10000000,00
:61:2610151015CR350000,00NTRFNONREF//REF-TRF-001
:86:PAGAMENTO FATURA 2026/899 SONANGOL EP
:61:2610181420DR75000,00NTRFNONREF//REF-DEB-002
:86:PAGAMENTO IMPOSTO INDUSTRIAL AGT
:62F:C261020AOA10275000,00
-
      `;

      const parsed = BankReconciliationService.parseMt940(sampleMt940);
      assert.ok(parsed);
      assert.equal(parsed.lines.length, 2, "Deve extrair 2 movimentos do extrato MT940");

      const creditLine = parsed.lines[0];
      assert.ok(creditLine);
      assert.equal(creditLine.direction, "IN");
      assert.equal(creditLine.amountCents, 350_000_00);
      assert.equal(creditLine.reference, "REF-TRF-001");

      const debitLine = parsed.lines[1];
      assert.ok(debitLine);
      assert.equal(debitLine.direction, "OUT");
      assert.equal(debitLine.amountCents, 75_000_00);
      assert.equal(debitLine.reference, "REF-DEB-002");
    });

    test("parses Tabular CSV/Excel statement file", () => {
      const sampleRows = [
        { date: "2026-10-10", description: "Venda a Dinheiro POS", reference: "POS-TXN-01", amount: 25000 },
        { date: "2026-10-11", description: "Despesa Agua EPAL", reference: "DESP-02", amount: -4500.5 },
      ];

      const parsed = BankReconciliationService.parseTabular(sampleRows);
      assert.ok(parsed);
      assert.equal(parsed.lines.length, 2, "Deve extrair 2 linhas do ficheiro");

      assert.equal(parsed.lines[0]?.direction, "IN");
      assert.equal(parsed.lines[0]?.amountCents, 25_000_00);

      assert.equal(parsed.lines[1]?.direction, "OUT");
      assert.equal(parsed.lines[1]?.amountCents, 4_500_50);
    });
  });

  // ==========================================
  // 2. ATIVOS FIXOS & DEPRECIAÇÕES FISCAIS
  // ==========================================
  describe("Fixed Assets & Tax Depreciation Service", () => {
    test("provides standard Angolan tax depreciation rates according to Código do Imposto Industrial", () => {
      const vehicleRate = FixedAssetsService.getDefaultTaxRate("VEHICLE_LIGHT");
      assert.equal(vehicleRate.annualRate, 0.25, "Veículos ligeiros têm quota de depreciação fiscal de 25% (4 anos)");
      assert.equal(vehicleRate.usefulLifeMonths, 48);

      const buildingRate = FixedAssetsService.getDefaultTaxRate("BUILDING");
      assert.equal(buildingRate.annualRate, 0.04, "Edifícios têm taxa de depreciação fiscal de 4% (25 anos)");
      assert.equal(buildingRate.usefulLifeMonths, 300);

      const itRate = FixedAssetsService.getDefaultTaxRate("IT_EQUIPMENT");
      assert.equal(itRate.annualRate, 0.3333, "Equipamentos informáticos têm taxa de 33.33% (3 anos)");
      assert.equal(itRate.usefulLifeMonths, 36);

      const furnitureRate = FixedAssetsService.getDefaultTaxRate("FURNITURE");
      assert.equal(furnitureRate.annualRate, 0.125, "Mobiliário tem taxa fiscal de 12.5% (8 anos)");
      assert.equal(furnitureRate.usefulLifeMonths, 96);
    });

    test("registers fixed asset and computes linear depreciation and net book value", async () => {
      const asset = await FixedAssetsService.createAsset({
        companyId: testCompanyId,
        code: "IMOB-TST-001",
        name: "Viatura Ligeira Toyota Yaris",
        category: "VEHICLE_LIGHT",
        acquisitionDate: new Date("2026-01-01"),
        acquisitionCostCents: 12_000_000_00, // 12.000.000 Kz
        residualValueCents: 1_200_000_00, // 1.200.000 Kz (10% residual)
        usefulLifeMonths: 48,
        annualDepreciationRate: 0.25,
      });

      assert.ok(asset);
      assert.equal(asset.code, "IMOB-TST-001");
      assert.equal(asset.netBookValueCents, 12_000_000_00);

      // Depreciate 1 month
      // Base depreciável = 12.000.000 - 1.200.000 = 10.800.000 Kz
      // Quota anual = 10.800.000 * 25% = 2.700.000 Kz
      // Quota mensal = 2.700.000 / 12 = 225.000 Kz (22.500.000 cents)
      const depEntry = await FixedAssetsService.calculateAssetMonthlyDepreciation(asset.id, 2026, 1, testCompanyId);
      assert.ok(depEntry);
      assert.equal(depEntry.depreciationAmountCents, 22_500_000);
      const nbv = (depEntry as any).netBookValueAfterCents ?? (depEntry as any).netBookValueCents;
      assert.equal(nbv, 12_000_000_00 - 22_500_000);
    });

    test("runs batch monthly depreciation across all active assets", async () => {
      const batchResult = await FixedAssetsService.runBatchMonthlyDepreciation(testCompanyId, 2026, 10);
      assert.ok(batchResult);
      assert.ok(typeof batchResult.processedCount === "number");
      assert.ok(batchResult.totalDepreciationCents >= 0);
    });
  });

  // ==========================================
  // 3. TESOURARIA AVANÇADA & CONTA 45 TRÂNSITO
  // ==========================================
  describe("Advanced Treasury & Internal Transfers Service", () => {
    test("lists treasury accounts with positive liquidity", async () => {
      const accounts = await TreasuryService.listAccounts();
      assert.ok(accounts.length >= 2, "Deve retornar contas bancárias e de caixa");
      const bai = accounts.find((a) => a.type === "BANK");
      assert.ok(bai);
      assert.ok(bai.balanceCents > 0);
    });

    test("creates a new dedicated treasury account", async () => {
      const newAcc = await TreasuryService.createAccount({
        name: "Banco Sol - Conta Operacional",
        type: "BANK",
        currency: "AOA",
        openingBalanceCents: 5_000_000_00,
      });

      assert.ok(newAcc);
      assert.equal(newAcc.name, "Banco Sol - Conta Operacional");
      assert.equal(newAcc.balanceCents, 5_000_000_00);
    });

    test("executes atomic internal transfer between accounts via PGCA Conta 45 (Valores em Trânsito)", async () => {
      let accounts = await TreasuryService.listAccounts();
      if (accounts.length < 2) {
        await TreasuryService.createAccount({
          name: "Caixa Geral de Luanda",
          type: "CASH",
          currency: "AOA",
          openingBalanceCents: 10_000_000_00,
        });
        accounts = await TreasuryService.listAccounts();
      }
      const fromAcc = accounts[0]!;
      const toAcc = accounts[1]!;

      const initialFromBalance = fromAcc.balanceCents;
      const initialToBalance = toAcc.balanceCents;
      const transferAmount = 1_000_000_00; // 1.000.000 Kz

      const result = await TreasuryService.transferFunds(
        fromAcc.id,
        toAcc.id,
        transferAmount,
        "Reforço de tesouraria operacional"
      );

      assert.ok(result);
      assert.equal(result.status, "COMPLETED");
      assert.equal(result.amountCents, transferAmount);

      const updatedAccounts = await TreasuryService.listAccounts();
      const updatedFrom = updatedAccounts.find((a) => a.id === fromAcc.id)!;
      const updatedTo = updatedAccounts.find((a) => a.id === toAcc.id)!;

      assert.equal(updatedFrom.balanceCents, initialFromBalance - transferAmount);
      assert.equal(updatedTo.balanceCents, initialToBalance + transferAmount);
    });

    test("computes cash flow statements (entradas, saídas e fluxo líquido)", async () => {
      const flow = await TreasuryService.getTreasuryFlow(testCompanyId);
      assert.ok(flow);
      assert.ok(typeof flow.totalInflowCents === "number");
      assert.ok(typeof flow.totalOutflowCents === "number");
      assert.equal(flow.netFlowCents, flow.totalInflowCents - flow.totalOutflowCents);
    });
  });

  // ==========================================
  // 4. PREVISÃO DE TESOURARIA (CASH FORECAST)
  // ==========================================
  describe("Cash Forecast & Runway Prediction Service", () => {
    test("calculates cash forecast with Conservative, Realistic and Optimistic scenarios", async () => {
      const forecast = await CashForecastService.calculateForecast(testCompanyId, 30);
      assert.ok(forecast);
      assert.ok(forecast.currentLiquidBalanceCents > 0);
      assert.equal(forecast.projectionHorizonDays, 30);

      const { conservative, realistic, optimistic } = forecast.scenarios;
      assert.equal(conservative.scenarioName, "CONSERVATIVE");
      assert.equal(realistic.scenarioName, "REALISTIC");
      assert.equal(optimistic.scenarioName, "OPTIMISTIC");

      // Realistic inflows should be greater than or equal to conservative
      assert.ok(realistic.projectedInflowCents >= conservative.projectedInflowCents);
      // Optimistic inflows should be greater than or equal to realistic
      assert.ok(optimistic.projectedInflowCents >= realistic.projectedInflowCents);

      // Runway should be reported in weeks
      assert.ok(realistic.runwayWeeks >= 0);
      assert.ok(forecast.weeklyTimeline.length >= 4);
    });
  });

  // ==========================================
  // 5. CONTAS A RECEBER (AR) & ENVELHECIMENTO
  // ==========================================
  describe("Accounts Receivable (AR) & Aging Service", () => {
    test("produces customer aging report segmented into 5 standard aging buckets", async () => {
      const report = await ReceivablesService.getAgingReport();
      assert.ok(report);
      assert.ok(report.totalOutstandingCents > 0);
      assert.equal(report.buckets.length, 5);

      const bucketNames = report.buckets.map((b) => b.bucket);
      assert.deepEqual(bucketNames, ["CURRENT", "1_30", "31_60", "61_90", "OVER_90"]);
    });

    test("evaluates customer credit limits and detects over-limit conditions", async () => {
      // Customer has 50M Kz limit and 18.5M Kz debt -> available 31.5M Kz
      const validCheck = await ReceivablesService.checkCustomerCredit("cust-sonangol-01", 10_000_000_00);
      assert.equal(validCheck.allowed, true);

      // Requesting 40M Kz -> exceeds available credit (31.5M Kz)
      const invalidCheck = await ReceivablesService.checkCustomerCredit("cust-sonangol-01", 40_000_000_00);
      assert.equal(invalidCheck.allowed, false);
      assert.ok(invalidCheck.reason?.includes("Limite de crédito excedido"));
    });

    test("toggles customer block and blocks POS checkout credit", async () => {
      const blocked = await ReceivablesService.toggleCustomerBlock("cust-sonangol-01", false, "Inadimplência prolongada");
      assert.equal(blocked.active, false);

      const checkAfterBlock = await ReceivablesService.checkCustomerCredit("cust-sonangol-01", 1_000_00);
      assert.equal(checkAfterBlock.allowed, false);
      assert.ok(checkAfterBlock.reason?.includes("bloqueado"));

      // Unblock
      await ReceivablesService.toggleCustomerBlock("cust-sonangol-01", true);
    });
  });

  // ==========================================
  // 6. CONTAS A PAGAR (AP) & CALENDÁRIO
  // ==========================================
  describe("Accounts Payable (AP) & Commitments Service", () => {
    test("generates payables report with priority ranking and overdue detection", async () => {
      const report = await PayablesService.getPayablesReport();
      assert.ok(report);
      assert.ok(report.totalPayableCents > 0);
      assert.ok(report.overdueCents > 0);
      assert.ok(report.obligations.length >= 2);

      const overdueItem = report.obligations.find((o) => o.status === "OVERDUE");
      assert.ok(overdueItem);
      assert.equal(overdueItem.priority, "HIGH");
    });

    test("builds payment calendar grouped by due date", async () => {
      const cal = await PayablesService.getPaymentCalendar();
      assert.ok(cal);
      assert.ok(typeof cal.scheduledTotalCents === "number");
      assert.ok(Object.keys(cal.calendar).length > 0);
    });
  });

  // ==========================================
  // 7. GESTÃO ORÇAMENTAL (BUDGETING)
  // ==========================================
  describe("Corporate Budget & Controlling Service", () => {
    test("creates annual budget with categorized lines", async () => {
      const budget = await BudgetService.createBudget({
        companyId: testCompanyId,
        code: "ORC-SPEC-2026",
        name: "Orçamento de TI e Inovação 2026",
        year: 2026,
        lines: [
          { accountCode: "62.1", accountName: "Licenças de Software Cloud", category: "OPERATING_EXPENSE", budgetedAmountCents: 15_000_000_00 },
          { accountCode: "62.2", accountName: "Serviços de Consultoria ERP", category: "OPERATING_EXPENSE", budgetedAmountCents: 25_000_000_00 },
        ],
      });

      assert.ok(budget);
      assert.equal(budget.totalBudgetedCents, 40_000_000_00);
      assert.equal((budget as any).lines.length, 2);
    });

    test("tracks budget execution and flags 80% warning and 100% exceeded thresholds", async () => {
      const variance = await BudgetService.getVarianceReport("bg-2026-geral");
      assert.ok(variance);
      assert.equal(variance.totalBudgetedCents, 1070_000_000_00);

      // Rubrica 61 (CMV) is at 82.5% -> status WARNING
      const line61 = variance.lines.find((l: any) => l.accountCode === "61");
      assert.ok(line61);
      assert.equal(line61.status, "WARNING");

      // Rubrica 62 (FST) is at 103.3% -> status EXCEEDED
      const line62 = variance.lines.find((l: any) => l.accountCode === "62");
      assert.ok(line62);
      assert.equal(line62.status, "EXCEEDED");
    });
  });

  // ==========================================
  // 8. FECHO CONTABILÍSTICO & DEMONSTRAÇÕES
  // ==========================================
  describe("Financial Closing & Financial Statements Service", () => {
    test("closes fiscal period and locks backwards adjustments", async () => {
      const closed = await FinancialClosingService.closePeriod("per-2026-10", "cfo-user", "Fecho regular de Outubro");
      assert.ok(closed);
      assert.equal(closed.isClosed, true);
    });

    test("enforces strict audit justification when reopening closed period", async () => {
      // Reopen with too short justification should throw
      await assert.rejects(
        async () => {
          await FinancialClosingService.reopenPeriod("per-2026-10", "cfo-user", "Ajuste");
        },
        /justificação detalhada/i
      );

      // Reopen with valid audit justification
      const reopened = await FinancialClosingService.reopenPeriod(
        "per-2026-10",
        "cfo-user",
        "Ajuste auditado solicitado pelo Revisor Oficial de Contas para regularização de fatura de fornecedor."
      );
      assert.ok(reopened);
      assert.equal(reopened.isClosed, false);
    });

    test("generates balanced PGCA Balance Sheet (Total Ativo = Total Passivo + Capital Próprio)", async () => {
      const balanceSheet = await FinancialClosingService.getBalanceSheet(testCompanyId);
      assert.ok(balanceSheet);
      assert.equal(balanceSheet.isBalanced, true, "O Balanço deve ser estritamente equilibrado");
      assert.equal(balanceSheet.assets.totalAssetsCents, balanceSheet.equityAndLiabilities.totalEquityAndLiabilitiesCents);
      assert.equal(balanceSheet.standard, "Plano Geral de Contabilidade de Angola (PGCA)");
    });

    test("generates Income Statement by Nature (DRE) with EBITDA and Net Margin", async () => {
      const dre = await FinancialClosingService.getIncomeStatement(testCompanyId);
      assert.ok(dre);
      assert.ok(dre.revenues.totalRevenuesCents > 0);
      assert.ok(dre.ebitdaCents > 0);
      assert.ok(dre.netIncomeCents > 0);
      assert.ok(dre.ebitdaMargin > 0);
    });
  });

  // ==========================================
  // 9. CONTABILIDADE ANALÍTICA & CENTROS DE CUSTO
  // ==========================================
  describe("Cost Centers & Analytical Accounting Service", () => {
    test("creates cost center and allocates analytical transaction", async () => {
      const cc = await CostCenterService.createCostCenter({
        code: "CC-TEST-500",
        name: "Centro Operacional Filial Benguela",
        type: "PROFIT",
      });
      assert.ok(cc);

      const alloc = await CostCenterService.allocateCost(cc.id, 8_000_000_00, "REVENUE", "Faturação Filial Benguela");
      assert.ok(alloc);
      assert.equal(alloc.amountCents, 8_000_000_00);
    });

    test("computes analytical profitability and contribution margin", async () => {
      const centers = await CostCenterService.listCostCenters();
      const firstCenter = centers[0]!;
      const report = await CostCenterService.getCostCenterReport(firstCenter.id);
      assert.ok(report);
      assert.ok(typeof report.contributionMarginCents === "number");
    });
  });

  // ==========================================
  // 10. MULTI-EMPRESA & CONSOLIDAÇÃO PATRIMONIAL
  // ==========================================
  describe("Multi-Company Consolidation Service", () => {
    test("creates holding group and produces consolidated balance sheet with intercompany eliminations", async () => {
      const financials = await MultiCompanyService.getConsolidatedFinancials();
      assert.ok(financials);
      assert.ok(financials.companiesCount >= 2);
      assert.ok(financials.eliminations.receivablesAndPayablesCents > 0, "Deve efetuar eliminação de saldos recíprocos");
      assert.ok(financials.consolidatedTotals.consolidatedAssetsCents < financials.consolidatedTotals.grossAssetsCents);
    });
  });

  // ==========================================
  // 11. COCKPIT DO CFO & MÉTRICAS EXECUTIVAS
  // ==========================================
  describe("CFO Executive Dashboard Metrics Service", () => {
    test("aggregates liquidity, working capital, current ratio and runway in real time", async () => {
      const dashboard = await FinancialMetricsService.getExecutiveDashboard(testCompanyId);
      assert.ok(dashboard);

      // Overview
      assert.ok(dashboard.overview.totalLiquidAssetsCents > 0);
      assert.ok(typeof dashboard.overview.workingCapitalCents === "number");

      // Ratios
      assert.ok(dashboard.ratios.currentRatio > 0);
      assert.ok(dashboard.ratios.quickRatio > 0);
      assert.ok(dashboard.ratios.cashRunwayWeeks >= 0);

      // Profitability
      assert.ok(dashboard.profitability.grossRevenueCents > 0);
      assert.ok(dashboard.profitability.ebitdaCents > 0);
    });
  });
});
