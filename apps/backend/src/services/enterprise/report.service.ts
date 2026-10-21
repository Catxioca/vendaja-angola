import {
  salesReport,
  productsReport,
  stockReport,
  purchasesReport,
  expensesReport,
  receivablesReport,
  payablesReport,
  dashboardSummary,
  type ReportFilters,
} from "../report-service.js";
import { logger } from "./logger.service.js";

export class EnterpriseReportService {
  /**
   * Generates commercial summary dashboard with performance metrics
   */
  public static async getDashboardSummary(filters: ReportFilters) {
    const started = Date.now();
    try {
      const summary = await dashboardSummary(filters);
      logger.info("REPORTS", "DASHBOARD_GENERATED", `Dashboard generated in ${Date.now() - started}ms`, {
        companyId: filters.companyId,
      });
      return summary;
    } catch (error) {
      logger.error("REPORTS", "DASHBOARD_ERROR", "Failed to generate dashboard summary", error, {
        companyId: filters.companyId,
      });
      throw error;
    }
  }

  /**
   * Generates sales report with payment distribution
   */
  public static async getSalesReport(filters: ReportFilters) {
    return salesReport(filters);
  }

  /**
   * Generates product performance report
   */
  public static async getProductsReport(filters: ReportFilters) {
    return productsReport(filters);
  }

  /**
   * Generates stock movement and ledger valuation report
   */
  public static async getStockReport(filters: ReportFilters) {
    return stockReport(filters);
  }

  /**
   * Generates supplier purchases report
   */
  public static async getPurchasesReport(filters: ReportFilters) {
    return purchasesReport(filters);
  }

  /**
   * Generates commercial expenses categorized report
   */
  public static async getExpensesReport(filters: ReportFilters) {
    return expensesReport(filters);
  }

  /**
   * Generates customers credit and receivables report
   */
  public static async getReceivablesReport(filters: ReportFilters) {
    return receivablesReport(filters);
  }

  /**
   * Generates supplier payables and due date aging report
   */
  public static async getPayablesReport(filters: ReportFilters) {
    return payablesReport(filters);
  }
}
