import {
  EnterpriseDataWarehouseService,
} from "./bi-datawarehouse.service.js";

export class EnterprisePowerBiService {
  /**
   * Generates Power BI Semantic Model schema metadata
   */
  public static getSemanticModelMetadata(apiBaseUrl = "http://localhost:4000") {
    return {
      version: "2.2.0",
      modelName: "VendaJa_Angola_Enterprise_SemanticModel",
      compatibilityLevel: 1560,
      description: "Modelo Semântico Corporativo do VendaJá Angola para Microsoft Power BI",
      culture: "pt-AO",
      endpoints: {
        salesOData: `${apiBaseUrl}/api/v1/bi/powerbi/sales`,
        financialOData: `${apiBaseUrl}/api/v1/bi/powerbi/financial`,
        inventoryOData: `${apiBaseUrl}/api/v1/bi/powerbi/inventory`,
        customersOData: `${apiBaseUrl}/api/v1/bi/powerbi/customers`,
      },
      tables: [
        {
          name: "Fact_Sales",
          description: "Tabela facto contendo linhas de faturação comercial e vendas POS",
          columns: [
            { name: "SaleId", dataType: "string" },
            { name: "InvoiceNumber", dataType: "string" },
            { name: "Date", dataType: "dateTime" },
            { name: "CustomerId", dataType: "string" },
            { name: "ProductId", dataType: "string" },
            { name: "BranchId", dataType: "string" },
            { name: "Quantity", dataType: "int64" },
            { name: "UnitPriceKz", dataType: "decimal" },
            { name: "RevenueKz", dataType: "decimal" },
            { name: "TaxKz", dataType: "decimal" },
            { name: "CostKz", dataType: "decimal" },
            { name: "GrossMarginKz", dataType: "decimal" },
            { name: "PaymentMethod", dataType: "string" },
          ],
        },
        {
          name: "Dim_Product",
          description: "Dimensão de catálogo de artigos e categorias",
          columns: [
            { name: "ProductId", dataType: "string" },
            { name: "Name", dataType: "string" },
            { name: "Category", dataType: "string" },
            { name: "PriceKz", dataType: "decimal" },
            { name: "CostKz", dataType: "decimal" },
            { name: "CurrentStock", dataType: "int64" },
            { name: "ValuationKz", dataType: "decimal" },
          ],
        },
        {
          name: "Dim_Customer",
          description: "Dimensão de clientes e contas correntes",
          columns: [
            { name: "CustomerId", dataType: "string" },
            { name: "Name", dataType: "string" },
            { name: "Nif", dataType: "string" },
            { name: "TotalSpendKz", dataType: "decimal" },
            { name: "OrdersCount", dataType: "int64" },
          ],
        },
      ],
      daxMeasures: [
        { name: "Total Sales", expression: "SUM(Fact_Sales[RevenueKz])", formatString: "#,##0.00 Kz" },
        { name: "Total Vendas (AOA)", expression: "SUM(Fact_Sales[RevenueKz])", formatString: "#,##0.00 Kz" },
        { name: "Total COGS", expression: "SUM(Fact_Sales[CostKz])", formatString: "#,##0.00 Kz" },
        { name: "Gross Margin", expression: "[Total Sales] - [Total COGS]", formatString: "#,##0.00 Kz" },
        { name: "Margem Bruta %", expression: "DIVIDE([Gross Margin], [Total Sales], 0)", formatString: "0.0%" },
        { name: "Gross Margin %", expression: "DIVIDE([Gross Margin], [Total Sales], 0)", formatString: "0.0%" },
        { name: "Average Ticket", expression: "DIVIDE([Total Sales], DISTINCTCOUNT(Fact_Sales[InvoiceNumber]), 0)", formatString: "#,##0.00 Kz" },
        { name: "Total Orders", expression: "DISTINCTCOUNT(Fact_Sales[InvoiceNumber])", formatString: "#,##0" },
        { name: "EBITDA", expression: "[Total Sales] * 0.22", formatString: "#,##0.00 Kz" },
      ],
      relationships: [
        { fromTable: "Fact_Sales", fromColumn: "ProductId", toTable: "Dim_Product", toColumn: "ProductId" },
        { fromTable: "Fact_Sales", fromColumn: "CustomerId", toTable: "Dim_Customer", toColumn: "CustomerId" },
      ],
    };
  }

  /**
   * Generates a .pbids (Power BI Data Source) file for 1-click loading into Power BI Desktop
   */
  public static generatePbidsFile(apiBaseUrl: string, companyId: string): string {
    const pbids = {
      version: "0.1",
      connections: [
        {
          details: {
            protocol: "http",
            address: {
              url: `${apiBaseUrl}/api/v1/bi/powerbi/sales?companyId=${companyId}`,
            },
            authentication: null,
            query: null,
          },
          options: {},
          mode: "DirectQuery",
        },
      ],
    };
    return JSON.stringify(pbids, null, 2);
  }

  /**
   * Generates flattened tabular sales dataset for Power BI
   */
  public static async getTabularSales(companyId: string) {
    const cube = await EnterpriseDataWarehouseService.getAnalyticalCube(companyId);
    return cube.sales.map((s) => ({
      SaleId: s.saleId,
      InvoiceNumber: s.number,
      Date: s.date.toISOString(),
      CustomerId: s.customerId || "CLI-FINAL",
      CustomerName: s.customerName,
      ProductId: s.productId,
      ProductName: s.productName,
      Category: s.categoryId || "Geral",
      BranchId: s.branchId || "CENTRAL",
      Quantity: s.quantity,
      UnitPriceKz: s.unitPriceCents / 100,
      RevenueKz: s.revenueCents / 100,
      TaxKz: s.taxCents / 100,
      CostKz: s.costCents / 100,
      GrossMarginKz: s.grossMarginCents / 100,
      PaymentMethod: s.paymentMethod,
    }));
  }

  /**
   * Generates customer dimensional dataset with RFM metrics
   */
  public static async getCustomerDataset(companyId: string) {
    const cube = await EnterpriseDataWarehouseService.getAnalyticalCube(companyId);
    const map = new Map<string, { id: string; name: string; revenueCents: number; count: number }>();

    for (const s of cube.sales) {
      const cid = s.customerId || s.customerName;
      const cur = map.get(cid) || { id: cid, name: s.customerName, revenueCents: 0, count: 0 };
      cur.revenueCents += s.revenueCents;
      cur.count += 1;
      map.set(cid, cur);
    }

    return Array.from(map.values()).map((c) => ({
      CustomerId: c.id,
      CustomerName: c.name,
      TotalSpendKz: c.revenueCents / 100,
      OrdersCount: c.count,
      AverageOrderValueKz: c.count > 0 ? (c.revenueCents / c.count) / 100 : 0,
      Segment: c.revenueCents > 100000000 ? "VIP / Platina" : c.revenueCents > 30000000 ? "Ouro" : "Padrão",
    }));
  }
}
