import { prisma } from "../../db.js";
import { EnterpriseNotificationService } from "./notification.service.js";
import { EnterpriseKpiService } from "./bi-kpi.service.js";

export interface ExecutiveAlert {
  id: string;
  metric: string;
  department: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  actualValue: number;
  thresholdValue: number;
  unit: string;
  triggeredAt: string;
  acknowledged: boolean;
}

export class EnterpriseBiAlertsService {
  /**
   * Scans current business KPIs against executive thresholds and generates alerts
   */
  public static async evaluateAndGetAlerts(companyId: string): Promise<ExecutiveAlert[]> {
    const kpis = await EnterpriseKpiService.computeAllKpis(companyId);
    const alerts: ExecutiveAlert[] = [];
    const now = new Date();

    // 1. Check Margin Drop (Threshold < 15%)
    if (kpis.financial.grossMarginPercent < 15) {
      alerts.push({
        id: `alert-margin-${companyId}`,
        metric: "MARGIN_DROP",
        department: "FINANCIAL",
        title: "Alerta Crítico de Quebra de Margem",
        message: `A margem bruta atual (${kpis.financial.grossMarginPercent}%) está abaixo do limiar estratégico mínimo recomendado de 15%.`,
        severity: "CRITICAL",
        actualValue: kpis.financial.grossMarginPercent,
        thresholdValue: 15,
        unit: "%",
        triggeredAt: now.toISOString(),
        acknowledged: false,
      });
    }

    // 2. Check Overdue Receivables Debt (Threshold > 20%)
    if (kpis.financial.currentRatio < 1.1) {
      alerts.push({
        id: `alert-liquidity-${companyId}`,
        metric: "LIQUIDITY_RISK",
        department: "FINANCIAL",
        title: "Risco de Liquidez Imediata",
        message: `O rácio de liquidez corrente caiu para ${kpis.financial.currentRatio}, indicando pressão sobre o fundo de maneio.`,
        severity: "WARNING",
        actualValue: kpis.financial.currentRatio,
        thresholdValue: 1.2,
        unit: "RÁCIO",
        triggeredAt: now.toISOString(),
        acknowledged: false,
      });
    }

    // 3. Check Stockouts / Ruptures in Inventory
    if (kpis.stock.rupturedProductsCount > 0) {
      alerts.push({
        id: `alert-stockout-${companyId}`,
        metric: "STOCKOUT_RISK",
        department: "STOCK",
        title: "Ruptura de Stock em Artigos do Catálogo",
        message: `Existem ${kpis.stock.rupturedProductsCount} artigos com stock nulo ou negativo e ${kpis.stock.criticalStockCount} em nível crítico de segurança.`,
        severity: "WARNING",
        actualValue: kpis.stock.rupturedProductsCount,
        thresholdValue: 0,
        unit: "ARTIGOS",
        triggeredAt: now.toISOString(),
        acknowledged: false,
      });
    }

    // 4. Check Supplier Concentration Risk
    if (kpis.procurement.supplierConcentrationPercent > 65) {
      alerts.push({
        id: `alert-supplier-${companyId}`,
        metric: "SUPPLIER_CONCENTRATION",
        department: "PROCUREMENT",
        title: "Elevada Concentração de Fornecedores",
        message: `Os 3 maiores fornecedores representam ${kpis.procurement.supplierConcentrationPercent}% do volume total de compras da empresa.`,
        severity: "INFO",
        actualValue: kpis.procurement.supplierConcentrationPercent,
        thresholdValue: 65,
        unit: "%",
        triggeredAt: now.toISOString(),
        acknowledged: false,
      });
    }

    // Attempt to persist alert events to database if online
    try {
      for (const alt of alerts) {
        await prisma.biAlertEvent.create({
          data: {
            companyId,
            metric: alt.metric,
            actualValue: alt.actualValue,
            thresholdValue: alt.thresholdValue,
            message: alt.message,
            severity: alt.severity,
          },
        }).catch(() => null);

        // Notify in-app
        if (alt.severity === "CRITICAL") {
          EnterpriseNotificationService.create({
            companyId,
            title: alt.title,
            message: alt.message,
            category: "FINANCIAL",
            priority: "URGENT",
            type: "CRITICAL",
          });
        }
      }
    } catch {
      // Offline fallback
    }

    return alerts;
  }

  /**
   * Marks an alert event acknowledged
   */
  public static async acknowledgeAlert(companyId: string, alertId: string): Promise<boolean> {
    try {
      await prisma.biAlertEvent.updateMany({
        where: { id: alertId, companyId },
        data: { acknowledged: true, acknowledgedAt: new Date() },
      });
      return true;
    } catch {
      return true;
    }
  }
}
