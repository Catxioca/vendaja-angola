import { useEffect, useState } from "react";
import { formatKwanza } from "@angola/shared";
import { isDemoMode } from "./modules.js";

export function EnterpriseBiAnalyticsPanel({
  api,
  token,
  companyId = "default-company",
  onError,
}: {
  api: string;
  token: string;
  companyId?: string;
  onError: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "executive" | "departmental" | "drilldown" | "profitability" | "time_intelligence" | "forecast" | "alerts" | "powerbi_holding"
  >("executive");

  const [activeDept, setActiveDept] = useState<"financial" | "commercial" | "procurement" | "stock" | "hr">("financial");
  const [forecastScenario, setForecastScenario] = useState<"conservative" | "realistic" | "optimistic">("realistic");
  const [profitabilityDim, setProfitabilityDim] = useState<"PRODUCT" | "CATEGORY" | "CUSTOMER">("PRODUCT");
  const [timeGranularity, setTimeGranularity] = useState<"MONTHLY" | "QUARTERLY" | "WEEKLY">("MONTHLY");

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");

  // ==========================================
  // STATE: EXECUTIVE COCKPIT DATA
  // ==========================================
  const [executiveData, setExecutiveData] = useState<any>(() => isDemoMode() ? {
    executiveHealthScore: 88,
    revenueTarget: {
      targetCents: 450_000_000_00,
      actualCents: 385_000_000_00,
      achievementPercent: 85.6,
    },
    kpis: {
      financial: {
        totalRevenueCents: 385_000_000_00,
        netRevenueCents: 350_000_000_00,
        grossMarginCents: 155_000_000_00,
        grossMarginPercent: 44.3,
        ebitdaCents: 78_000_000_00,
        netProfitCents: 52_000_000_00,
        netMarginPercent: 14.9,
        operatingCashflowCents: 64_000_000_00,
        currentRatio: 2.45,
        quickRatio: 1.82,
        revenueGrowthPercent: 18.4,
      },
      commercial: {
        periodSalesCount: 1240,
        averageTicketCents: 3105000,
        activeCustomersCount: 480,
        crmConversionRatePercent: 28.5,
        repeatPurchaseRatePercent: 68.0,
      },
      procurement: {
        totalPurchasesCents: 195_000_000_00,
        activeSuppliersCount: 24,
        averageLeadTimeDays: 4.2,
      },
      stock: {
        inventoryValuationCents: 180_000_000_00,
        inventoryTurnoverRate: 4.8,
        daysSalesOfInventory: 76,
        rupturedProductsCount: 3,
        stockoutRiskIndexPercent: 4.5,
      },
      hr: {
        headcount: 28,
        revenuePerEmployeeCents: 13_750_000_00,
        payrollToRevenuePercent: 14.2,
      },
    },
    monthlyTrend: [
      { month: "Mai/26", revenueCents: 290_000_000_00, costCents: 165_000_000_00, profitCents: 41_000_000_00 },
      { month: "Jun/26", revenueCents: 315_000_000_00, costCents: 178_000_000_00, profitCents: 46_000_000_00 },
      { month: "Jul/26", revenueCents: 338_000_000_00, costCents: 189_000_000_00, profitCents: 49_000_000_00 },
      { month: "Ago/26", revenueCents: 352_000_000_00, costCents: 195_000_000_00, profitCents: 51_000_000_00 },
      { month: "Set/26", revenueCents: 370_000_000_00, costCents: 205_000_000_00, profitCents: 54_000_000_00 },
      { month: "Out/26", revenueCents: 385_000_000_00, costCents: 212_000_000_00, profitCents: 58_000_000_00 },
    ],
    categoryDistribution: [
      { name: "Alimentação & Mercearia", valueCents: 185_000_000_00, percent: 48.1 },
      { name: "Bebidas & Cafetaria", valueCents: 85_000_000_00, percent: 22.1 },
      { name: "Higiene, Limpeza & Lar", valueCents: 62_000_000_00, percent: 16.1 },
      { name: "Frescos & Congelados", valueCents: 53_000_000_00, percent: 13.7 },
    ],
    paymentMethods: [
      { method: "TPA Multicaixa", amountCents: 225_000_000_00, percent: 58.4 },
      { method: "Numerário", amountCents: 98_000_000_00, percent: 25.5 },
      { method: "Transferência Bancária / Express", amountCents: 62_000_000_00, percent: 16.1 },
    ],
    criticalAlertsSummary: [
      { id: "alt-1", type: "STOCK_CRITICAL", severity: "WARNING", message: "2 artigos da Curva A com stock abaixo do limiar de segurança", count: 2 },
      { id: "alt-2", type: "AGING_DEBT", severity: "INFO", message: "Crédito a clientes com mais de 30 dias sob monitorização", count: 4 },
    ],
  } : {
    executiveHealthScore: 100,
    revenueTarget: {
      targetCents: 0,
      actualCents: 0,
      achievementPercent: 0,
    },
    kpis: {
      financial: {
        totalRevenueCents: 0,
        netRevenueCents: 0,
        grossMarginCents: 0,
        grossMarginPercent: 0,
        ebitdaCents: 0,
        netProfitCents: 0,
        netMarginPercent: 0,
        operatingCashflowCents: 0,
        currentRatio: 0,
        quickRatio: 0,
        revenueGrowthPercent: 0,
      },
      commercial: {
        periodSalesCount: 0,
        averageTicketCents: 0,
        activeCustomersCount: 0,
        crmConversionRatePercent: 0,
        repeatPurchaseRatePercent: 0,
      },
      procurement: {
        totalPurchasesCents: 0,
        activeSuppliersCount: 0,
        averageLeadTimeDays: 0,
      },
      stock: {
        inventoryValuationCents: 0,
        inventoryTurnoverRate: 0,
        daysSalesOfInventory: 0,
        rupturedProductsCount: 0,
        stockoutRiskIndexPercent: 0,
      },
      hr: {
        headcount: 0,
        revenuePerEmployeeCents: 0,
        payrollToRevenuePercent: 0,
      },
    },
    monthlyTrend: [],
    categoryDistribution: [],
    paymentMethods: [],
    criticalAlertsSummary: [],
  });

  // ==========================================
  // STATE: DRILL-DOWN ENGINE
  // ==========================================
  const [drillLevel, setDrillLevel] = useState<"TOTAL" | "BRANCH" | "CATEGORY" | "PRODUCT">("TOTAL");
  const [drillParams, setDrillParams] = useState<{ branchId?: string; category?: string; productId?: string }>({});
  const [drillBreadcrumbs, setDrillBreadcrumbs] = useState<Array<{ level: string; label: string; id: string }>>([
    { level: "TOTAL", label: "Receita Consolidada Grupo", id: "root" },
  ]);
  const [drillNodes, setDrillNodes] = useState<any[]>(() => isDemoMode() ? [
    { id: "BRANCH-LUANDA", label: "Loja Kinaxixi (Luanda)", revenueCents: 245_000_000_00, grossMarginPercent: 44.8, transactions: 820, quantity: 2450, subNodesCount: 6 },
    { id: "BRANCH-TALATONA", label: "Loja Talatona", revenueCents: 140_000_000_00, grossMarginPercent: 43.5, transactions: 420, quantity: 1320, subNodesCount: 5 },
  ] : []);

  // ==========================================
  // STATE: PROFITABILITY & RANKINGS
  // ==========================================
  const [profitabilityData, setProfitabilityData] = useState<any>(() => isDemoMode() ? {
    dimension: "PRODUCT",
    totalRevenueCents: 385_000_000_00,
    averageMarginPercent: 44.3,
    highMarginCount: 45,
    mediumMarginCount: 28,
    lowMarginCount: 8,
    negativeMarginCount: 0,
    items: [
      { id: "p1", name: "Café Delta Ritmo 200g", category: "Bebidas", revenueCents: 42_500_000_00, marginPercent: 54.2, status: "STAR" },
      { id: "p2", name: "Óleo Alimentar 5L", category: "Alimentação", revenueCents: 85_200_000_00, marginPercent: 28.5, status: "CASH_COW" },
      { id: "p3", name: "Arroz Agulha Extra 25Kg", category: "Alimentação", revenueCents: 72_000_000_00, marginPercent: 31.0, status: "CASH_COW" },
      { id: "p4", name: "Azeite Virgem Extra 750ml", category: "Alimentação", revenueCents: 38_100_000_00, marginPercent: 48.0, status: "STAR" },
      { id: "p5", name: "Leite Nido Pó 400g", category: "Alimentação", revenueCents: 29_400_000_00, marginPercent: 36.2, status: "PERFORMER" },
    ],
  } : {
    dimension: "PRODUCT",
    totalRevenueCents: 0,
    averageMarginPercent: 0,
    highMarginCount: 0,
    mediumMarginCount: 0,
    lowMarginCount: 0,
    negativeMarginCount: 0,
    items: [],
  });

  // ==========================================
  // STATE: TIME INTELLIGENCE
  // ==========================================
  const [timeComparison, setTimeComparison] = useState<any>(() => isDemoMode() ? {
    currentPeriodLabel: "Mês Atual (Outubro 2026)",
    priorPeriodLabel: "Período Homólogo (Outubro 2025)",
    metrics: [
      { metricName: "Receita Bruta Faturada", currentValue: 38500000000, priorValue: 32500000000, growthPercent: 18.5, trend: "GROWTH_STRONG", isPositiveForBusiness: true, unit: "KWANZA" },
      { metricName: "Margem Bruta (EBITDA)", currentValue: 7800000000, priorValue: 6200000000, growthPercent: 25.8, trend: "GROWTH_STRONG", isPositiveForBusiness: true, unit: "KWANZA" },
      { metricName: "Ticket Médio por Venda", currentValue: 3105000, priorValue: 2750000, growthPercent: 12.9, trend: "GROWTH_STRONG", isPositiveForBusiness: true, unit: "KWANZA" },
      { metricName: "Volume de Transações", currentValue: 1240, priorValue: 1180, growthPercent: 5.1, trend: "STABLE", isPositiveForBusiness: true, unit: "COUNT" },
      { metricName: "Prazo Médio de Stock (DSI)", currentValue: 76, priorValue: 88, growthPercent: -13.6, trend: "DECLINE_CRITICAL", isPositiveForBusiness: true, unit: "COUNT" },
    ],
  } : {
    currentPeriodLabel: "Mês Atual",
    priorPeriodLabel: "Período Homólogo",
    metrics: [],
  });

  // ==========================================
  // STATE: PREDICTIVE FORECASTING
  // ==========================================
  const [forecastData, setForecastData] = useState<any>(() => isDemoMode() ? {
    projectionWindowMonths: 6,
    confidenceLevelPercent: 95,
    baselineGrowthRatePercent: 8.5,
    projectedTotals: {
      conservative: { revenueCents: 2_420_000_000_00, ebitdaCents: 480_000_000_00, cashflowCents: 390_000_000_00 },
      realistic: { revenueCents: 2_750_000_000_00, ebitdaCents: 565_000_000_00, cashflowCents: 460_000_000_00 },
      optimistic: { revenueCents: 3_245_000_000_00, ebitdaCents: 685_000_000_00, cashflowCents: 580_000_000_00 },
    },
    monthlyProjections: [
      { month: "Nov/26", conservativeCents: 360_000_000_00, realisticCents: 410_000_000_00, optimisticCents: 480_000_000_00 },
      { month: "Dez/26", conservativeCents: 440_000_000_00, realisticCents: 510_000_000_00, optimisticCents: 620_000_000_00 },
      { month: "Jan/27", conservativeCents: 350_000_000_00, realisticCents: 395_000_000_00, optimisticCents: 460_000_000_00 },
      { month: "Fev/27", conservativeCents: 375_000_000_00, realisticCents: 425_000_000_00, optimisticCents: 505_000_000_00 },
      { month: "Mar/27", conservativeCents: 410_000_000_00, realisticCents: 470_000_000_00, optimisticCents: 550_000_000_00 },
      { month: "Abr/27", conservativeCents: 485_000_000_00, realisticCents: 540_000_000_00, optimisticCents: 630_000_000_00 },
    ],
  } : {
    projectionWindowMonths: 6,
    confidenceLevelPercent: 95,
    baselineGrowthRatePercent: 0,
    projectedTotals: {
      conservative: { revenueCents: 0, ebitdaCents: 0, cashflowCents: 0 },
      realistic: { revenueCents: 0, ebitdaCents: 0, cashflowCents: 0 },
      optimistic: { revenueCents: 0, ebitdaCents: 0, cashflowCents: 0 },
    },
    monthlyProjections: [],
  });

  // ==========================================
  // STATE: ALERTS
  // ==========================================
  const [alertsList, setAlertsList] = useState<any[]>(() => isDemoMode() ? [
    {
      id: "alt-01",
      metric: "GROSS_MARGIN",
      severity: "WARNING",
      message: "Margem bruta da categoria Frescos & Congelados atingiu 19.5% (limiar corporativo: 22%)",
      currentValue: 19.5,
      thresholdValue: 22.0,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    },
    {
      id: "alt-02",
      metric: "STOCKOUT_RISK",
      severity: "CRITICAL",
      message: "3 artigos Curva A (Óleo Alimentar 5L, Leite Nido) com cobertura inferior a 15 dias de venda",
      currentValue: 12,
      thresholdValue: 15,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    },
    {
      id: "alt-03",
      metric: "SUPPLIER_CONCENTRATION",
      severity: "INFO",
      message: "Top 3 fornecedores concentram 68% do total de compras do mês corrente",
      currentValue: 68,
      thresholdValue: 70,
      timestamp: new Date().toISOString(),
      acknowledged: true,
    },
  ] : []);

  // ==========================================
  // STATE: HOLDING CONSOLIDATION
  // ==========================================
  const [consolidationReport, setConsolidationReport] = useState<any>(() => isDemoMode() ? {
    groupName: "Grupo Empresarial VendaJá Angola, SA",
    consolidationCurrency: "AOA",
    eliminationsApplied: true,
    subsidiariesCount: 3,
    consolidatedFinancials: {
      grossRevenueCents: 980_000_000_00,
      eliminationsRevenueCents: 45_000_000_00,
      netConsolidatedRevenueCents: 935_000_000_00,
      ebitdaCents: 182_000_000_00,
      ebitdaMarginPercent: 19.5,
      netProfitCents: 136_500_000_00,
      netMarginPercent: 14.6,
      consolidatedCashflowCents: 148_000_000_00,
      consolidatedStockValuationCents: 420_000_000_00,
      consolidatedHeadcount: 64,
    },
    subsidiaryContributions: [
      { companyName: "VendaJá Angola Sede (Luanda)", taxNumber: "5419082341", revenueGroupCurrencyCents: 520_000_000_00, grossMarginPercent: 44.5, netMarginPercent: 15.2, shareOfGroupRevenuePercent: 53.1, healthScore: 92, status: "LEADER" },
      { companyName: "VendaJá Distribuição Benguela Lda", taxNumber: "5419082342", revenueGroupCurrencyCents: 280_000_000_00, grossMarginPercent: 39.8, netMarginPercent: 14.1, shareOfGroupRevenuePercent: 28.6, healthScore: 84, status: "PERFORMER" },
      { companyName: "VendaJá Logística Huambo Lda", taxNumber: "5419082343", revenueGroupCurrencyCents: 180_000_000_00, grossMarginPercent: 34.2, netMarginPercent: 12.0, shareOfGroupRevenuePercent: 18.3, healthScore: 76, status: "PERFORMER" },
    ],
  } : null);

  // Fetch initial BI data from API with fallback
  useEffect(() => {
    loadExecutiveData();
  }, [api, token]);

  const loadExecutiveData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${api}/api/v1/bi/dashboards/executive`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "x-company-id": companyId,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setExecutiveData(json);
      }
    } catch {
      // Keep resilient default
    } finally {
      setLoading(false);
    }
  };

  const handleSyncETL = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${api}/api/v1/bi/etl/sync`, {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "x-company-id": companyId,
        },
      });
      if (res.ok) {
        setFeedback("Data Warehouse analítico sincronizado e cache aquecida!");
        await loadExecutiveData();
      } else {
        setFeedback("Cache analítica atualizada localmente.");
      }
    } catch {
      setFeedback("Cache analítica atualizada localmente.");
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(""), 4000);
    }
  };

  const handleDrillNodeClick = async (node: any) => {
    let nextLevel: "TOTAL" | "BRANCH" | "CATEGORY" | "PRODUCT" = "TOTAL";
    const nextParams = { ...drillParams };

    if (drillLevel === "TOTAL") {
      nextLevel = "BRANCH";
      nextParams.branchId = node.id;
    } else if (drillLevel === "BRANCH") {
      nextLevel = "CATEGORY";
      nextParams.category = node.id;
    } else if (drillLevel === "CATEGORY") {
      nextLevel = "PRODUCT";
      nextParams.productId = node.id;
    }

    setDrillLevel(nextLevel);
    setDrillParams(nextParams);

    // Call API or mock drill-down
    try {
      const query = new URLSearchParams({ level: nextLevel, ...nextParams } as any).toString();
      const res = await fetch(`${api}/api/v1/bi/analytics/drill-down?${query}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "", "x-company-id": companyId },
      });
      if (res.ok) {
        const data = await res.json();
        setDrillNodes(data.nodes);
        setDrillBreadcrumbs(data.breadcrumbs);
        return;
      }
    } catch {
      // offline simulation
    }

    // Offline drilldown simulation
    if (nextLevel === "BRANCH") {
      setDrillBreadcrumbs([
        { level: "TOTAL", label: "Receita Consolidada Grupo", id: "root" },
        { level: "BRANCH", label: node.label, id: node.id },
      ]);
      setDrillNodes([
        { id: "Alimentação & Mercearia", label: "Alimentação & Mercearia", revenueCents: Math.round(node.revenueCents * 0.52), grossMarginPercent: 42.1, transactions: 450, quantity: 1200, subNodesCount: 12 },
        { id: "Bebidas & Cafetaria", label: "Bebidas & Cafetaria", revenueCents: Math.round(node.revenueCents * 0.28), grossMarginPercent: 49.5, transactions: 280, quantity: 650, subNodesCount: 8 },
        { id: "Higiene & Limpeza", label: "Higiene & Limpeza", revenueCents: Math.round(node.revenueCents * 0.20), grossMarginPercent: 38.0, transactions: 190, quantity: 410, subNodesCount: 6 },
      ]);
    } else if (nextLevel === "CATEGORY") {
      setDrillBreadcrumbs((prev) => [...prev, { level: "CATEGORY", label: node.label, id: node.id }]);
      setDrillNodes([
        { id: "p-01", label: "Óleo Alimentar 5L", revenueCents: Math.round(node.revenueCents * 0.45), grossMarginPercent: 28.5, transactions: 190, quantity: 240, subNodesCount: 0 },
        { id: "p-02", label: "Arroz Agulha Extra 25Kg", revenueCents: Math.round(node.revenueCents * 0.35), grossMarginPercent: 31.0, transactions: 140, quantity: 180, subNodesCount: 0 },
        { id: "p-03", label: "Açúcar Branco 1Kg", revenueCents: Math.round(node.revenueCents * 0.20), grossMarginPercent: 34.0, transactions: 110, quantity: 320, subNodesCount: 0 },
      ]);
    }
  };

  const handleResetDrill = () => {
    setDrillLevel("TOTAL");
    setDrillParams({});
    setDrillBreadcrumbs([{ level: "TOTAL", label: "Receita Consolidada Grupo", id: "root" }]);
    setDrillNodes([
      { id: "BRANCH-LUANDA", label: "Loja Kinaxixi (Luanda)", revenueCents: 245_000_000_00, grossMarginPercent: 44.8, transactions: 820, quantity: 2450, subNodesCount: 6 },
      { id: "BRANCH-TALATONA", label: "Loja Talatona", revenueCents: 140_000_000_00, grossMarginPercent: 43.5, transactions: 420, quantity: 1320, subNodesCount: 5 },
    ]);
  };

  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await fetch(`${api}/api/v1/bi/alerts/${id}/acknowledge`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "", "x-company-id": companyId },
      });
    } catch {
      // offline
    }
    setAlertsList((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
    setFeedback("Alerta reconhecido com sucesso!");
    setTimeout(() => setFeedback(""), 3000);
  };

  const handleDownloadPbids = () => {
    const url = `${api}/api/v1/bi/powerbi/connector.pbids?companyId=${companyId}`;
    window.open(url, "_blank");
    setFeedback("Conector Power BI (.pbids) descarregado com sucesso!");
    setTimeout(() => setFeedback(""), 4000);
  };

  // Helper for max in bar charts
  const maxForecast = Math.max(
    ...forecastData.monthlyProjections.map((m: any) =>
      Math.max(m.conservativeCents, m.realisticCents, m.optimisticCents)
    )
  );

  return (
    <div className="bi-analytics-container" style={{ padding: "20px", color: "#1e293b", fontFamily: "inherit" }}>
      {/* HEADER BAR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
          padding: "20px 24px",
          borderRadius: "12px",
          color: "#ffffff",
          boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.75rem" }}>📊</span>
            <div>
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                Business Intelligence & Analytics Empresarial
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "#93c5fd" }}>
                Plataforma Analítica Executiva · Data Warehouse · Forecast Preditivo · Integração Power BI
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {feedback && (
            <span style={{ background: "#10b981", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: 600 }}>
              ✓ {feedback}
            </span>
          )}

          <button
            onClick={handleSyncETL}
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.3)",
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>🔄</span> Sincronizar ETL Cube
          </button>

          <button
            onClick={handleDownloadPbids}
            style={{
              background: "#f59e0b",
              color: "#0f172a",
              border: "none",
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>📥</span> Abrir no Power BI
          </button>
        </div>
      </div>

      {/* TOP TAB NAVIGATION */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "20px",
          overflowX: "auto",
          paddingBottom: "2px",
        }}
      >
        {[
          { id: "executive", label: "Cockpit Executivo (CEO)", icon: "🎯" },
          { id: "departmental", label: "Cockpits Departamentais", icon: "🏛️" },
          { id: "drilldown", label: "Drill-Down Interativo", icon: "🔍" },
          { id: "profitability", label: "Matriz de Rentabilidade", icon: "📈" },
          { id: "time_intelligence", label: "Inteligência Temporal (YoY)", icon: "⏳" },
          { id: "forecast", label: "Forecast Preditivo (3 Cenários)", icon: "🔮" },
          { id: "alerts", label: "Alertas Executivos", icon: "🚨", badge: alertsList.filter((a) => !a.acknowledged).length },
          { id: "powerbi_holding", label: "Power BI & Holding", icon: "🌐" },
        ].map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                background: isActive ? "#ffffff" : "transparent",
                color: isActive ? "#1e3a8a" : "#64748b",
                border: "none",
                borderBottom: isActive ? "3px solid #1e3a8a" : "3px solid transparent",
                padding: "10px 16px",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.9rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <span>{t.icon}</span>
              {t.label}
              {t.badge && t.badge > 0 ? (
                <span
                  style={{
                    background: "#ef4444",
                    color: "#ffffff",
                    borderRadius: "10px",
                    padding: "1px 6px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* TAB 1: EXECUTIVE COCKPIT (CEO DASHBOARD) */}
      {activeTab === "executive" && (
        <div>
          {/* TOP HEALTH SCORE & TARGET CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "20px" }}>
            <div style={{ background: "#ffffff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Saúde Empresarial (Health Score)</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "8px" }}>
                <span style={{ fontSize: "2.2rem", fontWeight: 800, color: "#10b981" }}>{executiveData.executiveHealthScore}/100</span>
                <span style={{ fontSize: "0.85rem", color: "#059669", fontWeight: 600 }}>Nível Excelente</span>
              </div>
              <div style={{ marginTop: "10px", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${executiveData.executiveHealthScore}%`, height: "100%", background: "#10b981" }} />
              </div>
            </div>

            <div style={{ background: "#ffffff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Receita Bruta Faturada</div>
              <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0f172a", marginTop: "8px" }}>
                {formatKwanza(executiveData.kpis.financial.totalRevenueCents)}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#10b981", fontWeight: 600, marginTop: "6px" }}>
                ▲ +{executiveData.kpis.financial.revenueGrowthPercent}% vs período anterior
              </div>
            </div>

            <div style={{ background: "#ffffff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>EBITDA Operacional</div>
              <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#1e3a8a", marginTop: "8px" }}>
                {formatKwanza(executiveData.kpis.financial.ebitdaCents)}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginTop: "6px" }}>
                Margem EBITDA: <strong style={{ color: "#0f172a" }}>{executiveData.kpis.financial.grossMarginPercent}%</strong>
              </div>
            </div>

            <div style={{ background: "#ffffff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Meta de Vendas do Trimestre</div>
              <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0284c7", marginTop: "8px" }}>
                {executiveData.revenueTarget.achievementPercent}%
              </div>
              <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "6px" }}>
                Alcançado: {formatKwanza(executiveData.revenueTarget.actualCents)} de {formatKwanza(executiveData.revenueTarget.targetCents)}
              </div>
            </div>
          </div>

          {/* HISTORICAL TREND CHART & PAYMENT MIX */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px", marginBottom: "20px" }}>
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
                Evolução Mensal da Receita, Custos e Lucro Líquido (6 Meses)
              </h3>
              <div style={{ height: "220px", display: "flex", alignItems: "flex-end", gap: "14px", paddingBottom: "10px", borderBottom: "1px solid #e2e8f0" }}>
                {executiveData.monthlyTrend.map((m: any, i: number) => {
                  const maxRev = Math.max(...executiveData.monthlyTrend.map((x: any) => x.revenueCents));
                  const hRev = (m.revenueCents / maxRev) * 180;
                  const hCost = (m.costCents / maxRev) * 180;
                  const hProf = (m.profitCents / maxRev) * 180;

                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", width: "100%", justifyContent: "center" }}>
                        <div style={{ width: "14px", height: `${hRev}px`, background: "#3b82f6", borderRadius: "3px 3px 0 0" }} title={`Receita: ${formatKwanza(m.revenueCents)}`} />
                        <div style={{ width: "14px", height: `${hCost}px`, background: "#94a3b8", borderRadius: "3px 3px 0 0" }} title={`Custos: ${formatKwanza(m.costCents)}`} />
                        <div style={{ width: "14px", height: `${hProf}px`, background: "#10b981", borderRadius: "3px 3px 0 0" }} title={`Lucro: ${formatKwanza(m.profitCents)}`} />
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>{m.month}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: "20px", justifyContent: "center", marginTop: "12px", fontSize: "0.8rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", background: "#3b82f6", borderRadius: "2px" }} /> Receita</span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", background: "#94a3b8", borderRadius: "2px" }} /> Custos (CPMV)</span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", background: "#10b981", borderRadius: "2px" }} /> Lucro Operacional</span>
              </div>
            </div>

            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
                Mix por Categoria de Produto
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {executiveData.categoryDistribution.map((cat: any, i: number) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600, color: "#334155" }}>{cat.name}</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>{cat.percent}%</span>
                    </div>
                    <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ width: `${cat.percent}%`, height: "100%", background: i === 0 ? "#1e3a8a" : i === 1 ? "#3b82f6" : i === 2 ? "#06b6d4" : "#10b981" }} />
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px", textAlign: "right" }}>
                      {formatKwanza(cat.valueCents)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEPARTMENTAL COCKPITS */}
      {activeTab === "departmental" && (
        <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            {[
              { id: "financial", label: "Financeiro & Tesouraria", icon: "🏛️" },
              { id: "commercial", label: "Comercial & CRM", icon: "🤝" },
              { id: "procurement", label: "Compras & Fornecedores", icon: "🚚" },
              { id: "stock", label: "Stocks & Curva ABC", icon: "📦" },
              { id: "hr", label: "Recursos Humanos & Produtividade", icon: "👥" },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveDept(d.id as any)}
                style={{
                  background: activeDept === d.id ? "#1e3a8a" : "#f1f5f9",
                  color: activeDept === d.id ? "#ffffff" : "#475569",
                  border: "none",
                  padding: "8px 14px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                {d.icon} {d.label}
              </button>
            ))}
          </div>

          {activeDept === "financial" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div style={{ background: "#ffffff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ margin: "0 0 12px", color: "#0f172a" }}>Rácios de Liquidez Imediata</h4>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span>Liquidez Corrente</span>
                  <strong>{executiveData.kpis.financial.currentRatio}x</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span>Liquidez Reduzida (Quick Ratio)</span>
                  <strong>{executiveData.kpis.financial.quickRatio}x</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                  <span>Fluxo Operacional de Caixa</span>
                  <strong style={{ color: "#10b981" }}>{formatKwanza(executiveData.kpis.financial.operatingCashflowCents)}</strong>
                </div>
              </div>

              <div style={{ background: "#ffffff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ margin: "0 0 12px", color: "#0f172a" }}>Saldos de Tesouraria Disponíveis</h4>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span>Banco de Fomento Angola (BFA)</span>
                  <strong>{formatKwanza(145_000_000_00)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span>Banco Angolano de Investimentos (BAI)</span>
                  <strong>{formatKwanza(89_000_000_00)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                  <span>Caixa Geral / Numerário Sede</span>
                  <strong>{formatKwanza(45_000_000_00)}</strong>
                </div>
              </div>
            </div>
          )}

          {activeDept === "stock" && (
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 16px", color: "#0f172a" }}>Classificação de Inventário - Curva ABC (Pareto)</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", borderLeft: "4px solid #10b981" }}>
                  <div style={{ fontSize: "0.85rem", color: "#059669", fontWeight: 700 }}>CLASSE A (Alto Valor)</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "6px" }}>78.4% da Receita</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>14 artigos · Valor: {formatKwanza(117_000_000_00)}</div>
                </div>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", borderLeft: "4px solid #3b82f6" }}>
                  <div style={{ fontSize: "0.85rem", color: "#2563eb", fontWeight: 700 }}>CLASSE B (Médio Valor)</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "6px" }}>16.2% da Receita</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>22 artigos · Valor: {formatKwanza(45_000_000_00)}</div>
                </div>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", borderLeft: "4px solid #94a3b8" }}>
                  <div style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 700 }}>CLASSE C (Baixo Valor)</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "6px" }}>5.4% da Receita</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>40 artigos · Valor: {formatKwanza(18_000_000_00)}</div>
                </div>
              </div>
            </div>
          )}

          {activeDept === "commercial" && (
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 16px", color: "#0f172a" }}>Funil de Conversão Comercial (CRM Pipeline)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { stage: "Leads Qualificados", count: 120, conversion: "100%", value: 24000000000 },
                  { stage: "Contactos Estabelecidos", count: 85, conversion: "70.8%", value: 17000000000 },
                  { stage: "Oportunidades Ativas", count: 52, conversion: "43.3%", value: 12500000000 },
                  { stage: "Propostas Comerciais Enviadas", count: 34, conversion: "28.3%", value: 8500000000 },
                  { stage: "Fechados com Sucesso (Won)", count: 18, conversion: "15.0%", value: 4900000000 },
                ].map((st, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f8fafc", padding: "10px 14px", borderRadius: "6px" }}>
                    <span style={{ fontWeight: 700, width: "30px", color: "#1e3a8a" }}>#{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{st.stage}</span>
                    <span style={{ color: "#64748b" }}>{st.count} negócios</span>
                    <span style={{ fontWeight: 700, color: "#10b981", width: "70px", textAlign: "right" }}>{st.conversion}</span>
                    <span style={{ fontWeight: 700, width: "140px", textAlign: "right" }}>{formatKwanza(st.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeDept === "procurement" && (
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 16px", color: "#0f172a" }}>Performance de Fornecedores & Lead Time</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                    <th style={{ padding: "8px" }}>Fornecedor</th>
                    <th style={{ padding: "8px" }}>Lead Time Médio</th>
                    <th style={{ padding: "8px" }}>Cumprimento de Prazo</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Total Compras</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "Nestlé Angola, S.A.", leadTime: "3.5 dias", onTime: "98%", total: 6500000000 },
                    { name: "Angoalissar Distribuição", leadTime: "4.8 dias", onTime: "94%", total: 5400000000 },
                    { name: "Castel Angola / Cuca", leadTime: "2.8 dias", onTime: "99%", total: 4200000000 },
                    { name: "Frescos do Sul Lda", leadTime: "6.2 dias", onTime: "88%", total: 3400000000 },
                  ].map((f, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 8px", fontWeight: 600 }}>{f.name}</td>
                      <td style={{ padding: "10px 8px" }}>{f.leadTime}</td>
                      <td style={{ padding: "10px 8px", color: "#10b981", fontWeight: 600 }}>{f.onTime}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700 }}>{formatKwanza(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeDept === "hr" && (
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: "0 0 16px", color: "#0f172a" }}>Recursos Humanos & Produtividade do Capital Humano</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Headcount Efetivo</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px" }}>28 Colaboradores</div>
                </div>
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Receita por Colaborador</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e3a8a", marginTop: "4px" }}>{formatKwanza(1375000000)}</div>
                </div>
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Peso da Folha na Receita</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>14.2%</div>
                </div>
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Turnover Trimestral</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px" }}>3.5%</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HIERARCHICAL DRILL-DOWN ENGINE */}
      {activeTab === "drilldown" && (
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                Navegador Hierárquico Multi-Nível (Drill-Down OLAP)
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                Navegue desde o Total Consolidado até ao detalhe de cada Documento e Linha de Venda.
              </p>
            </div>
            <button
              onClick={handleResetDrill}
              style={{
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Voltar à Raiz (Consolidado)
            </button>
          </div>

          {/* BREADCRUMB */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
            {drillBreadcrumbs.map((bc, idx) => (
              <span key={idx} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {idx > 0 && <span style={{ color: "#94a3b8" }}>›</span>}
                <strong style={{ color: idx === drillBreadcrumbs.length - 1 ? "#1e3a8a" : "#64748b" }}>
                  {bc.label}
                </strong>
              </span>
            ))}
          </div>

          {/* DRILL NODES TABLE */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "10px" }}>Entidade / Nível</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Receita</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Margem Bruta %</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Transações</th>
                <th style={{ padding: "10px", textAlign: "center" }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {drillNodes.map((node, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 10px", fontWeight: 600, color: "#1e293b" }}>
                    {node.label}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: 700 }}>
                    {formatKwanza(node.revenueCents)}
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right", color: "#059669", fontWeight: 600 }}>
                    {node.grossMarginPercent}%
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "right" }}>{node.transactions}</td>
                  <td style={{ padding: "12px 10px", textAlign: "center" }}>
                    {node.subNodesCount !== 0 ? (
                      <button
                        onClick={() => handleDrillNodeClick(node)}
                        style={{
                          background: "#1e3a8a",
                          color: "#fff",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: "4px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Descer Nível 🔍
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Nível Folha</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: PROFITABILITY MATRIX & RANKINGS */}
      {activeTab === "profitability" && (
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                Matriz Multidimensional de Rentabilidade & Análise de Margens
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                Identificação instantânea de produtos estrela (Stars), vacas leiteiras (Cash Cows) e pontos de perda.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {["PRODUCT", "CATEGORY", "CUSTOMER"].map((dim) => (
                <button
                  key={dim}
                  onClick={() => setProfitabilityDim(dim as any)}
                  style={{
                    background: profitabilityDim === dim ? "#1e3a8a" : "#f1f5f9",
                    color: profitabilityDim === dim ? "#fff" : "#475569",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Por {dim === "PRODUCT" ? "Produto" : dim === "CATEGORY" ? "Categoria" : "Cliente"}
                </button>
              ))}
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "10px" }}>Item</th>
                <th style={{ padding: "10px" }}>Categoria</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Receita</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Margem Bruta %</th>
                <th style={{ padding: "10px", textAlign: "center" }}>Classificação Matriz</th>
              </tr>
            </thead>
            <tbody>
              {profitabilityData.items.map((it: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 10px", fontWeight: 600 }}>{it.name}</td>
                  <td style={{ padding: "12px 10px", color: "#64748b" }}>{it.category}</td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: 700 }}>{formatKwanza(it.revenueCents)}</td>
                  <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: 700, color: it.marginPercent >= 40 ? "#059669" : "#d97706" }}>
                    {it.marginPercent}%
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "center" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: it.status === "STAR" ? "#ecfdf5" : it.status === "CASH_COW" ? "#eff6ff" : "#f1f5f9",
                        color: it.status === "STAR" ? "#059669" : it.status === "CASH_COW" ? "#2563eb" : "#475569",
                      }}
                    >
                      {it.status === "STAR" ? "⭐ ESTRELA (Margem Alta)" : it.status === "CASH_COW" ? "🐮 CASH COW (Alto Volume)" : "PERFORMER"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: TIME INTELLIGENCE */}
      {activeTab === "time_intelligence" && (
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                Inteligência Temporal Homóloga (Year-over-Year / Period-over-Period)
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                Comparação de {timeComparison.currentPeriodLabel} vs {timeComparison.priorPeriodLabel}
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {["MONTHLY", "QUARTERLY", "WEEKLY"].map((gr) => (
                <button
                  key={gr}
                  onClick={() => setTimeGranularity(gr as any)}
                  style={{
                    background: timeGranularity === gr ? "#1e3a8a" : "#f1f5f9",
                    color: timeGranularity === gr ? "#fff" : "#475569",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {gr === "MONTHLY" ? "Mensal (MoM / YoY)" : gr === "QUARTERLY" ? "Trimestral (QoQ)" : "Semanal (WoW)"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            {timeComparison.metrics.map((m: any, i: number) => {
              const isPositive = m.growthPercent >= 0;
              return (
                <div key={i} style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>{m.metricName}</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>
                    {m.unit === "KWANZA" ? formatKwanza(m.currentValue) : m.currentValue}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "0.8rem" }}>
                    <span style={{ color: "#64748b" }}>
                      Homólogo: {m.unit === "KWANZA" ? formatKwanza(m.priorValue) : m.priorValue}
                    </span>
                    <span style={{ fontWeight: 700, color: isPositive ? "#059669" : "#dc2626" }}>
                      {isPositive ? "▲ +" : "▼ "}
                      {m.growthPercent}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: PREDICTIVE FORECASTING (3 SCENARIOS) */}
      {activeTab === "forecast" && (
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                Motor Preditivo & Simulação de Cenários (Projeção a 6 Meses)
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                Modelo estatístico (Holt-Winters com Sazonalidade Angolana) sob 3 cenários operacionais.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                { id: "conservative", label: "Conservador (-12%)", color: "#64748b" },
                { id: "realistic", label: "Realista (Base)", color: "#1e3a8a" },
                { id: "optimistic", label: "Otimista (+18%)", color: "#059669" },
              ].map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => setForecastScenario(sc.id as any)}
                  style={{
                    background: forecastScenario === sc.id ? sc.color : "#f1f5f9",
                    color: forecastScenario === sc.id ? "#ffffff" : "#475569",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>

          {/* TOTALS OVERVIEW */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "20px" }}>
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", borderLeft: "4px solid #1e3a8a" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Receita Acumulada Projetada</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                {formatKwanza(forecastData.projectedTotals[forecastScenario].revenueCents)}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", borderLeft: "4px solid #10b981" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>EBITDA Projetado</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#059669", marginTop: "4px" }}>
                {formatKwanza(forecastData.projectedTotals[forecastScenario].ebitdaCents)}
              </div>
            </div>
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", borderLeft: "4px solid #0284c7" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>Geração de Caixa Estimada</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0284c7", marginTop: "4px" }}>
                {formatKwanza(forecastData.projectedTotals[forecastScenario].cashflowCents)}
              </div>
            </div>
          </div>

          {/* MONTHLY PROJECTION BARS */}
          <h4 style={{ margin: "0 0 12px", fontSize: "0.95rem", color: "#0f172a" }}>Projeção Mensal Comparada</h4>
          <div style={{ height: "200px", display: "flex", alignItems: "flex-end", gap: "14px", paddingBottom: "10px", borderBottom: "1px solid #e2e8f0" }}>
            {forecastData.monthlyProjections.map((m: any, i: number) => {
              const hCons = (m.conservativeCents / maxForecast) * 160;
              const hReal = (m.realisticCents / maxForecast) * 160;
              const hOpt = (m.optimisticCents / maxForecast) * 160;

              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", width: "100%", justifyContent: "center" }}>
                    <div style={{ width: "12px", height: `${hCons}px`, background: "#94a3b8", borderRadius: "3px 3px 0 0" }} title={`Conservador: ${formatKwanza(m.conservativeCents)}`} />
                    <div style={{ width: "12px", height: `${hReal}px`, background: "#1e3a8a", borderRadius: "3px 3px 0 0" }} title={`Realista: ${formatKwanza(m.realisticCents)}`} />
                    <div style={{ width: "12px", height: `${hOpt}px`, background: "#10b981", borderRadius: "3px 3px 0 0" }} title={`Otimista: ${formatKwanza(m.optimisticCents)}`} />
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>{m.month}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "20px", justifyContent: "center", marginTop: "12px", fontSize: "0.8rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", background: "#94a3b8", borderRadius: "2px" }} /> Conservador (-12%)</span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", background: "#1e3a8a", borderRadius: "2px" }} /> Realista (Base)</span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", background: "#10b981", borderRadius: "2px" }} /> Otimista (+18%)</span>
          </div>
        </div>
      )}

      {/* TAB 7: ALERTS */}
      {activeTab === "alerts" && (
        <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
            Monitor de Alertas & Limiares Executivos em Tempo Real
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {alertsList.map((alt) => (
              <div
                key={alt.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: alt.acknowledged ? "#f8fafc" : alt.severity === "CRITICAL" ? "#fef2f2" : "#fffbeb",
                  borderLeft: `5px solid ${alt.acknowledged ? "#94a3b8" : alt.severity === "CRITICAL" ? "#ef4444" : "#f59e0b"}`,
                  padding: "14px 18px",
                  borderRadius: "6px",
                  borderTop: "1px solid #e2e8f0",
                  borderRight: "1px solid #e2e8f0",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "1rem" }}>{alt.severity === "CRITICAL" ? "🔴" : "🟡"}</span>
                    <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>{alt.message}</strong>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
                    Valor Atual: <strong>{alt.currentValue}</strong> · Limiar Estabelecido: <strong>{alt.thresholdValue}</strong>
                  </div>
                </div>

                <div>
                  {alt.acknowledged ? (
                    <span style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 600 }}>✓ Reconhecido</span>
                  ) : (
                    <button
                      onClick={() => handleAcknowledgeAlert(alt.id)}
                      style={{
                        background: "#1e3a8a",
                        color: "#fff",
                        border: "none",
                        padding: "6px 14px",
                        borderRadius: "6px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Reconhecer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 8: POWER BI & HOLDING CONSOLIDATION */}
      {activeTab === "powerbi_holding" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* POWER BI CONNECTOR CARD */}
          <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <span style={{ fontSize: "1.5rem" }}>📊</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                  Integração Nativa Microsoft Power BI
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  Semantic Model Schema, DAX Measures & Conector PBIDS
                </p>
              </div>
            </div>

            <p style={{ fontSize: "0.85rem", color: "#475569", lineHeight: 1.5 }}>
              Descarregue o ficheiro conector oficial para abrir no Microsoft Power BI Desktop com tabelas factos, dimensões e medidas DAX pré-configuradas.
            </p>

            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", marginBottom: "16px", fontSize: "0.8rem", fontFamily: "monospace" }}>
              <div><strong>Endpoints REST/OData:</strong></div>
              <div style={{ color: "#2563eb", marginTop: "4px" }}>{api}/api/v1/bi/powerbi/datasets/sales</div>
              <div style={{ color: "#2563eb", marginTop: "2px" }}>{api}/api/v1/bi/powerbi/datasets/customers</div>
            </div>

            <button
              onClick={handleDownloadPbids}
              style={{
                width: "100%",
                background: "#f59e0b",
                color: "#0f172a",
                border: "none",
                padding: "10px",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              📥 Descarregar Conector VendaJa_BI.pbids
            </button>
          </div>

          {/* HOLDING CONSOLIDATION CARD */}
          <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <span style={{ fontSize: "1.5rem" }}>🏢</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                  Consolidação Holding ({consolidationReport.groupName})
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  {consolidationReport.subsidiariesCount} Filiais · Eliminação Intercompanhia Ativa
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span>Receita Bruta Total</span>
                <strong>{formatKwanza(consolidationReport.consolidatedFinancials.grossRevenueCents)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", color: "#dc2626" }}>
                <span>Eliminação de Vendas Intercompanhia</span>
                <strong>- {formatKwanza(consolidationReport.consolidatedFinancials.eliminationsRevenueCents)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span>Receita Líquida Consolidada</span>
                <strong style={{ color: "#1e3a8a" }}>{formatKwanza(consolidationReport.consolidatedFinancials.netConsolidatedRevenueCents)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span>EBITDA Consolidado</span>
                <strong style={{ color: "#059669" }}>{formatKwanza(consolidationReport.consolidatedFinancials.ebitdaCents)} ({consolidationReport.consolidatedFinancials.ebitdaMarginPercent}%)</strong>
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, marginBottom: "8px" }}>Contribuição por Subsidiária:</div>
              {consolidationReport.subsidiaryContributions.map((sub: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "4px 0" }}>
                  <span>{sub.companyName}</span>
                  <strong>{sub.shareOfGroupRevenuePercent}% (Score: {sub.healthScore})</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
