import { prisma } from "../server.js";
import { average, groupByDay, sum } from "./report-aggregation.js";
import { cashflowReport } from "./cashflow-service.js";
export { average, groupByDay, sum } from "./report-aggregation.js";

export type ReportFilters = { from?: Date; to?: Date; productId?: string; categoryId?: string; customerId?: string; operatorId?: string; supplierId?: string; paymentMethod?: string; status?: string };
const range = (filters: ReportFilters, field: "createdAt" | "expenseDate" | "purchasedAt" | "occurredAt" | "dueDate" | "receivedAt" | "paidAt") => {
  if (!filters.from && !filters.to) return {};
  return { [field]: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } };
};

export async function salesReport(filters: ReportFilters) {
  const rows = await prisma.sale.findMany({
    where: { ...range(filters, "createdAt"), ...(filters.customerId ? { customerId: filters.customerId } : {}), ...(filters.operatorId ? { operatorId: filters.operatorId } : {}), ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}), ...(filters.status ? { status: filters.status } : {}), ...(filters.productId || filters.categoryId ? { lines: { some: { ...(filters.productId ? { productId: filters.productId } : {}), ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}) } } } : {}) },
    include: { customer: { select: { id: true, name: true } }, operator: { select: { id: true, displayName: true, username: true } }, lines: { include: { product: { select: { id: true, name: true, sku: true, categoryId: true, costCents: true } } } } },
    orderBy: { createdAt: "desc" }, take: 5000,
  });
  const active = filters.status ? rows : rows.filter((sale) => sale.status !== "CANCELLED");
  const byPayment = new Map<string, { paymentMethod: string; documents: number; totalCents: number }>();
  for (const sale of active) {
    const current = byPayment.get(sale.paymentMethod) ?? { paymentMethod: sale.paymentMethod, documents: 0, totalCents: 0 };
    current.documents += 1; current.totalCents += sale.totalCents; byPayment.set(sale.paymentMethod, current);
  }
  return { documents: active.length, quantity: sum(active.flatMap((sale) => sale.lines.map((line) => line.quantity))), subtotalCents: sum(active.map((sale) => sale.subtotalCents)), discountCents: null, taxCents: sum(active.map((sale) => sale.taxCents)), totalCents: sum(active.map((sale) => sale.totalCents)), averageTicketCents: average(active.map((sale) => sale.totalCents)), byPayment: [...byPayment.values()], rows: active, limitation: "Descontos não estão persistidos no modelo Sale atual." };
}

export async function productsReport(filters: ReportFilters) {
  const sales = await salesReport(filters);
  const products = new Map<string, { productId: string; name: string; sku: string; quantitySold: number; revenueCents: number; stock: number; costCents: number | null; marginCents: number | null }>();
  for (const sale of sales.rows) for (const line of sale.lines) {
    if (filters.productId && line.productId !== filters.productId) continue;
    if (filters.categoryId && line.product.categoryId !== filters.categoryId) continue;
    const current = products.get(line.productId) ?? { productId: line.productId, name: line.product.name, sku: line.product.sku, quantitySold: 0, revenueCents: 0, stock: 0, costCents: line.product.costCents ?? null, marginCents: null };
    current.quantitySold += line.quantity; current.revenueCents += line.quantity * line.unitPriceCents;
    if (current.costCents !== null) current.marginCents = current.revenueCents - current.quantitySold * current.costCents;
    products.set(line.productId, current);
  }
  const currentStock = await prisma.product.findMany({ where: { id: { in: [...products.keys()] } }, select: { id: true, stock: true } });
  for (const product of currentStock) { const row = products.get(product.id); if (row) row.stock = product.stock; }
  return { rows: [...products.values()], totalRevenueCents: sum([...products.values()].map((row) => row.revenueCents)), totalMarginCents: [...products.values()].every((row) => row.marginCents !== null) ? sum([...products.values()].map((row) => row.marginCents ?? 0)) : null };
}

export async function stockReport(filters: ReportFilters) {
  const rows = await prisma.stockMovement.findMany({ where: { ...range(filters, "occurredAt"), ...(filters.productId ? { productId: filters.productId } : {}) }, include: { product: { select: { id: true, name: true, sku: true, stock: true } } }, orderBy: { occurredAt: "desc" }, take: 5000 });
  return { entries: sum(rows.filter((row) => row.quantity > 0).map((row) => row.quantity)), exits: sum(rows.filter((row) => row.quantity < 0).map((row) => Math.abs(row.quantity))), adjustments: rows.filter((row) => row.type === "ADJUSTMENT").length, currentStock: [...new Map(rows.map((row) => [row.productId, row.product.stock])).values()].reduce((total, value) => total + value, 0), rows };
}

export async function purchasesReport(filters: ReportFilters) {
  const rows = await prisma.purchase.findMany({ where: { ...range(filters, "purchasedAt"), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}), ...(filters.status ? { status: filters.status } : {}) }, include: { supplier: { select: { id: true, name: true } }, payable: true }, orderBy: { purchasedAt: "desc" }, take: 5000 });
  return { count: rows.length, totalCents: sum(rows.map((row) => row.totalCents)), creditCents: sum(rows.filter((row) => row.paymentMethod === "CREDIT").map((row) => row.totalCents)), payableOriginalCents: sum(rows.map((row) => row.payable?.originalCents ?? 0)), payablePaidCents: sum(rows.map((row) => row.payable?.paidCents ?? 0)), rows };
}

export async function expensesReport(filters: ReportFilters) {
  const rows = await prisma.expense.findMany({ where: { ...range(filters, "expenseDate"), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}), ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}), ...(filters.status ? { status: filters.status } : {}) }, include: { supplier: { select: { id: true, name: true } } }, orderBy: { expenseDate: "desc" }, take: 5000 });
  const byCategory = new Map<string, { category: string; count: number; totalCents: number }>();
  for (const row of rows) { const current = byCategory.get(row.category) ?? { category: row.category, count: 0, totalCents: 0 }; current.count += 1; current.totalCents += row.amountCents; byCategory.set(row.category, current); }
  return { count: rows.length, totalCents: sum(rows.map((row) => row.amountCents)), byCategory: [...byCategory.values()], rows };
}

export async function receivablesReport(filters: ReportFilters) {
  const customers = await prisma.customer.findMany({ where: filters.customerId ? { id: filters.customerId } : undefined, include: { sales: { where: { ...range(filters, "createdAt"), paymentMethod: "CREDIT", status: { not: "CANCELLED" } }, select: { totalCents: true, dueDate: true } }, receivablePayments: { where: range(filters, "receivedAt"), select: { amountCents: true } } } });
  return { rows: customers.map((customer) => { const originalCents = sum(customer.sales.map((sale) => sale.totalCents)); const receivedCents = sum(customer.receivablePayments.map((payment) => payment.amountCents)); const balanceCents = Math.max(0, originalCents - receivedCents); return { customerId: customer.id, customer: customer.name, originalCents, receivedCents, balanceCents, status: balanceCents <= 0 ? "PAGO" : "PENDENTE" }; }) };
}

export async function payablesReport(filters: ReportFilters) {
  const rows = await prisma.accountPayable.findMany({ where: { ...range(filters, "dueDate"), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}), ...(filters.status ? { status: filters.status } : {}) }, include: { supplier: { select: { id: true, name: true } }, purchase: { select: { number: true } }, payments: { where: range(filters, "paidAt"), orderBy: { paidAt: "desc" } } }, orderBy: { dueDate: "asc" }, take: 5000 });
  const paidInPeriodCents = sum(rows.flatMap((row) => row.payments.map((payment) => payment.amountCents)));
  return { rows, originalCents: sum(rows.map((row) => row.originalCents)), paidCents: sum(rows.map((row) => row.paidCents)), paidInPeriodCents, balanceCents: sum(rows.map((row) => row.originalCents - row.paidCents)) };
}

export async function financialSummary(filters: ReportFilters) {
  const [sales, purchases, expenses, receivables, payables] = await Promise.all([salesReport(filters), purchasesReport(filters), expensesReport(filters), receivablesReport(filters), payablesReport(filters)]);
  return { salesCents: sales.totalCents, purchasesCents: purchases.totalCents, expensesCents: expenses.totalCents, receivablesBalanceCents: sum(receivables.rows.map((row) => row.balanceCents)), payablesBalanceCents: payables.balanceCents, receivedCents: sum(receivables.rows.map((row) => row.receivedCents)), paidToSuppliersCents: payables.paidInPeriodCents, profitability: null, note: "Lucro líquido não calculado: despesas operacionais e custo das vendas não estão totalmente ligados ao mesmo período." };
}

export async function dashboardSummary(filters: ReportFilters) {
  const [sales, purchases, expenses, receivables, payables, cashflow, customers, suppliers, products] = await Promise.all([
    salesReport(filters),
    purchasesReport(filters),
    expensesReport(filters),
    receivablesReport(filters),
    payablesReport(filters),
    cashflowReport(filters),
    prisma.customer.count({ where: { active: true } }),
    prisma.supplier.count({ where: { active: true } }),
    prisma.product.findMany({ where: { active: true }, select: { id: true, stock: true, costCents: true } }),
  ]);
  const stock = await stockReport(filters);
  const payablePending = payables.rows.filter((row) => row.originalCents > row.paidCents);
  const inventoryValuationAvailable = products.every((product) => Number.isInteger(product.costCents));
  return {
    period: { from: filters.from?.toISOString() ?? null, to: filters.to?.toISOString() ?? null },
    sales: { totalCents: sales.totalCents, documents: sales.documents, averageTicketCents: sales.averageTicketCents, byPayment: sales.byPayment },
    purchases: { totalCents: purchases.totalCents, count: purchases.count, creditCents: purchases.creditCents, topSuppliers: [...new Map(purchases.rows.map((row) => [row.supplierId, { supplierId: row.supplierId, supplier: row.supplier.name, totalCents: row.totalCents }])).values()].sort((left, right) => right.totalCents - left.totalCents).slice(0, 5) },
    expenses: { totalCents: expenses.totalCents, count: expenses.count, byCategory: expenses.byCategory },
    receivables: { openCents: sum(receivables.rows.map((row) => row.balanceCents)), receivedCents: sum(receivables.rows.map((row) => row.receivedCents)), count: receivables.rows.filter((row) => row.balanceCents > 0).length, overdueCount: null },
    payables: { openCents: payables.balanceCents, paidCents: payables.paidInPeriodCents, count: payablePending.length, overdueCount: payablePending.filter((row) => row.dueDate < new Date()).length },
    cashflow: { entriesCents: cashflow.entriesCents, exitsCents: cashflow.exitsCents, netCents: cashflow.netCents },
    stock: { productCount: products.length, lowStockCount: null, entries: stock.entries, exits: stock.exits, inventoryValuationCents: inventoryValuationAvailable ? sum(products.map((product) => product.stock * product.costCents)) : null },
    entities: { activeCustomers: customers, activeSuppliers: suppliers },
    charts: {
      salesByDay: groupByDay(sales.rows.map((row) => ({ date: row.createdAt, amountCents: row.totalCents }))),
      purchasesByDay: groupByDay(purchases.rows.map((row) => ({ date: row.purchasedAt, amountCents: row.totalCents }))),
      expensesByDay: groupByDay(expenses.rows.map((row) => ({ date: row.expenseDate, amountCents: row.amountCents }))),
      expensesByCategory: expenses.byCategory,
    },
    alerts: {
      pendingReceivables: receivables.rows.filter((row) => row.balanceCents > 0).slice(0, 5).map((row) => ({ label: row.customer, amountCents: row.balanceCents })),
      pendingPayables: payablePending.slice(0, 5).map((row) => ({ label: row.supplier.name, amountCents: row.originalCents - row.paidCents, dueDate: row.dueDate })),
      highValuePurchases: [...purchases.rows].sort((left, right) => right.totalCents - left.totalCents).slice(0, 3).map((row) => ({ label: `${row.number} · ${row.supplier.name}`, amountCents: row.totalCents })),
      highValueExpenses: [...expenses.rows].sort((left, right) => right.amountCents - left.amountCents).slice(0, 3).map((row) => ({ label: row.description, amountCents: row.amountCents })),
      lowStock: null,
    },
    limitations: ["Descontos de vendas não estão persistidos no modelo Sale.", "Não existe stock mínimo persistido; alertas de stock baixo permanecem indisponíveis.", "Contas a receber não têm histórico temporal de saldo para calcular vencimentos com segurança."],
  };
}
