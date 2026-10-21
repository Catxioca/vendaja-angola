import {
  EnterpriseDataWarehouseService,
  type BiFilterParams,
  type FactSalesRow,
} from "./bi-datawarehouse.service.js";

export interface DrillDownNode {
  id: string;
  level: "TOTAL" | "BRANCH" | "CATEGORY" | "PRODUCT" | "DOCUMENT" | "LINE";
  name: string;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPercent: number;
  quantity: number;
  subNodesCount?: number;
}

export class EnterpriseBiAnalyticsService {
  /**
   * Executes hierarchical drill-down navigation:
   * Total -> Branch -> Category -> Product -> Document -> LineItem
   */
  public static async executeDrillDown(
    companyId: string,
    params: {
      level: "TOTAL" | "BRANCH" | "CATEGORY" | "PRODUCT" | "DOCUMENT";
      branchId?: string;
      category?: string;
      productId?: string;
      documentNumber?: string;
    }
  ): Promise<{
    currentLevel: string;
    breadcrumbs: Array<{ level: string; label: string; id: string }>;
    nodes: DrillDownNode[];
  }> {
    const cube = await EnterpriseDataWarehouseService.getAnalyticalCube(companyId);
    let sales = cube.sales;

    const breadcrumbs: Array<{ level: string; label: string; id: string }> = [
      { level: "TOTAL", label: "Receita Consolidada", id: "root" },
    ];

    if (params.branchId) {
      sales = sales.filter((s) => s.branchId === params.branchId);
      breadcrumbs.push({
        level: "BRANCH",
        label: params.branchId === "BRANCH-LUANDA" ? "Loja Kinaxixi (Luanda)" : "Loja Talatona",
        id: params.branchId,
      });
    }

    if (params.category) {
      sales = sales.filter((s) => s.categoryId === params.category);
      breadcrumbs.push({ level: "CATEGORY", label: params.category, id: params.category });
    }

    if (params.productId) {
      sales = sales.filter((s) => s.productId === params.productId);
      const pName = sales[0]?.productName || params.productId;
      breadcrumbs.push({ level: "PRODUCT", label: pName, id: params.productId });
    }

    const nodes: DrillDownNode[] = [];

    switch (params.level) {
      case "TOTAL": {
        // Break down by Branch
        const branches = new Map<string, FactSalesRow[]>();
        for (const s of cube.sales) {
          const bKey = s.branchId || "BRANCH-GERAL";
          const list = branches.get(bKey) || [];
          list.push(s);
          branches.set(bKey, list);
        }

        for (const [bKey, list] of branches.entries()) {
          const rev = list.reduce((a, b) => a + b.revenueCents, 0);
          const cost = list.reduce((a, b) => a + b.costCents, 0);
          const margin = rev - cost;
          nodes.push({
            id: bKey,
            level: "BRANCH",
            name: bKey === "BRANCH-LUANDA" ? "Loja Kinaxixi (Luanda)" : bKey === "BRANCH-TALATONA" ? "Loja Talatona" : "Filial Central",
            revenueCents: rev,
            costCents: cost,
            marginCents: margin,
            marginPercent: rev > 0 ? Number(((margin / rev) * 100).toFixed(1)) : 0,
            quantity: list.reduce((a, b) => a + b.quantity, 0),
            subNodesCount: new Set(list.map((s) => s.categoryId)).size,
          });
        }
        break;
      }

      case "BRANCH": {
        // Break down by Category
        const categories = new Map<string, FactSalesRow[]>();
        for (const s of sales) {
          const cat = s.categoryId || "Diversos";
          const list = categories.get(cat) || [];
          list.push(s);
          categories.set(cat, list);
        }

        for (const [cat, list] of categories.entries()) {
          const rev = list.reduce((a, b) => a + b.revenueCents, 0);
          const cost = list.reduce((a, b) => a + b.costCents, 0);
          const margin = rev - cost;
          nodes.push({
            id: cat,
            level: "CATEGORY",
            name: cat,
            revenueCents: rev,
            costCents: cost,
            marginCents: margin,
            marginPercent: rev > 0 ? Number(((margin / rev) * 100).toFixed(1)) : 0,
            quantity: list.reduce((a, b) => a + b.quantity, 0),
            subNodesCount: new Set(list.map((s) => s.productId)).size,
          });
        }
        break;
      }

      case "CATEGORY": {
        // Break down by Product
        const products = new Map<string, FactSalesRow[]>();
        for (const s of sales) {
          const pid = s.productId;
          const list = products.get(pid) || [];
          list.push(s);
          products.set(pid, list);
        }

        for (const [pid, list] of products.entries()) {
          const rev = list.reduce((a, b) => a + b.revenueCents, 0);
          const cost = list.reduce((a, b) => a + b.costCents, 0);
          const margin = rev - cost;
          nodes.push({
            id: pid,
            level: "PRODUCT",
            name: list[0]?.productName || pid,
            revenueCents: rev,
            costCents: cost,
            marginCents: margin,
            marginPercent: rev > 0 ? Number(((margin / rev) * 100).toFixed(1)) : 0,
            quantity: list.reduce((a, b) => a + b.quantity, 0),
            subNodesCount: new Set(list.map((s) => s.saleId)).size,
          });
        }
        break;
      }

      case "PRODUCT": {
        // Break down by Document / Invoice
        const documents = new Map<string, FactSalesRow[]>();
        for (const s of sales) {
          const docNum = s.number;
          const list = documents.get(docNum) || [];
          list.push(s);
          documents.set(docNum, list);
        }

        for (const [docNum, list] of documents.entries()) {
          const rev = list.reduce((a, b) => a + b.revenueCents, 0);
          const cost = list.reduce((a, b) => a + b.costCents, 0);
          const margin = rev - cost;
          nodes.push({
            id: docNum,
            level: "DOCUMENT",
            name: `Fatura ${docNum} (${list[0]?.customerName})`,
            revenueCents: rev,
            costCents: cost,
            marginCents: margin,
            marginPercent: rev > 0 ? Number(((margin / rev) * 100).toFixed(1)) : 0,
            quantity: list.reduce((a, b) => a + b.quantity, 0),
            subNodesCount: list.length,
          });
        }
        break;
      }

      default:
        break;
    }

    nodes.sort((a, b) => b.revenueCents - a.revenueCents);

    return {
      currentLevel: params.level,
      breadcrumbs,
      nodes,
    };
  }

  /**
   * Generates Multidimensional Profitability Matrix (Revenue, Costs, Margin, Margin %)
   */
  public static async getProfitabilityMatrix(
    companyId: string,
    dimension: "PRODUCT" | "CUSTOMER" | "CATEGORY" | "BRANCH" = "PRODUCT"
  ) {
    const cube = await EnterpriseDataWarehouseService.getAnalyticalCube(companyId);
    const sales = cube.sales;

    const map = new Map<string, { id: string; name: string; revenueCents: number; costCents: number; marginCents: number; quantity: number }>();

    for (const s of sales) {
      let key = "";
      let label = "";

      if (dimension === "PRODUCT") {
        key = s.productId;
        label = s.productName;
      } else if (dimension === "CUSTOMER") {
        key = s.customerId || s.customerName;
        label = s.customerName;
      } else if (dimension === "CATEGORY") {
        key = s.categoryId || "Diversos";
        label = key;
      } else {
        key = s.branchId || "Central";
        label = key === "BRANCH-LUANDA" ? "Loja Kinaxixi (Luanda)" : "Loja Talatona";
      }

      const cur = map.get(key) || { id: key, name: label, revenueCents: 0, costCents: 0, marginCents: 0, quantity: 0 };
      cur.revenueCents += s.revenueCents;
      cur.costCents += s.costCents;
      cur.marginCents += s.grossMarginCents;
      cur.quantity += s.quantity;
      map.set(key, cur);
    }

    const rows = Array.from(map.values())
      .map((r) => ({
        ...r,
        marginPercent: r.revenueCents > 0 ? Number(((r.marginCents / r.revenueCents) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.marginCents - a.marginCents);

    const totalRevenueCents = rows.reduce((a, b) => a + b.revenueCents, 0);
    const totalMarginCents = rows.reduce((a, b) => a + b.marginCents, 0);
    const averageMarginPercent = totalRevenueCents > 0 ? Number(((totalMarginCents / totalRevenueCents) * 100).toFixed(2)) : 0;

    const classifiedItems = rows.map((r) => ({
      ...r,
      grossMarginPercent: r.marginPercent,
      classification: r.marginPercent >= 45 ? "STAR" : r.marginPercent >= 25 ? "CASH_COW" : "PERFORMER",
    }));

    return {
      dimension,
      generatedAt: new Date().toISOString(),
      companyId,
      totalRevenueCents,
      totalMarginCents,
      averageMarginPercent,
      rows,
      items: classifiedItems,
    };
  }

  /**
   * Retrieves rankings: Top 10 Clients, Top 10 Products, Worst 10 Products, Most Profitable
   */
  public static async getRankings(companyId: string) {
    const cube = await EnterpriseDataWarehouseService.getAnalyticalCube(companyId);
    const sales = cube.sales;

    // Top Products
    const prodMap = new Map<string, { id: string; name: string; unitsSold: number; revenueCents: number; marginCents: number }>();
    for (const s of sales) {
      const cur = prodMap.get(s.productId) || { id: s.productId, name: s.productName, unitsSold: 0, revenueCents: 0, marginCents: 0 };
      cur.unitsSold += s.quantity;
      cur.revenueCents += s.revenueCents;
      cur.marginCents += s.grossMarginCents;
      prodMap.set(s.productId, cur);
    }

    const allProducts = Array.from(prodMap.values());
    const topProductsRevenue = [...allProducts].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10);
    const topProductsQuantity = [...allProducts].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10);
    const worstProducts = [...allProducts].sort((a, b) => a.unitsSold - b.unitsSold).slice(0, 10);

    // Top Customers
    const custMap = new Map<string, { id: string; name: string; revenueCents: number; marginCents: number; ordersCount: number }>();
    for (const s of sales) {
      const cid = s.customerId || s.customerName;
      const cur = custMap.get(cid) || { id: cid, name: s.customerName, revenueCents: 0, marginCents: 0, ordersCount: 0 };
      cur.revenueCents += s.revenueCents;
      cur.marginCents += s.grossMarginCents;
      cur.ordersCount += 1;
      custMap.set(cid, cur);
    }

    const allCustomers = Array.from(custMap.values());
    const topCustomersRevenue = [...allCustomers].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10);
    const topCustomersProfit = [...allCustomers].sort((a, b) => b.marginCents - a.marginCents).slice(0, 10);

    return {
      topProductsRevenue,
      topProductsQuantity,
      worstProducts,
      topCustomersRevenue,
      topCustomersProfit,
      topProductsByRevenue: topProductsRevenue,
      topProductsByMargin: [...allProducts].sort((a, b) => b.marginCents - a.marginCents).slice(0, 10),
      topCustomersBySpend: topCustomersRevenue,
      bottomProductsByMargin: worstProducts,
    };
  }
}
