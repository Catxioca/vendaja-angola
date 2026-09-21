import { prisma } from "../db.js";
import { sum } from "./report-aggregation.js";
import type { ReportFilters } from "./report-service.js";

export type CashflowFilters = ReportFilters & { direction?: "IN" | "OUT"; origin?: string };
export type CashflowMovement = {
  id: string; date: Date; direction: "IN" | "OUT"; amountCents: number;
  origin: "SALE_PAYMENT" | "RECEIVABLE_PAYMENT" | "PAYABLE_PAYMENT" | "EXPENSE";
  reference: string; method: string; operatorId: string | null; note: string | null;
};

const inRange = (date: Date, filters: CashflowFilters) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
const accepts = (movement: CashflowMovement, filters: CashflowFilters) => (!filters.direction || movement.direction === filters.direction) && (!filters.origin || movement.origin === filters.origin) && (!filters.paymentMethod || movement.method === filters.paymentMethod) && inRange(movement.date, filters);

export function summarizeCashflow(movements: CashflowMovement[]) {
  const entries = sum(movements.filter((movement) => movement.direction === "IN").map((movement) => movement.amountCents));
  const exits = sum(movements.filter((movement) => movement.direction === "OUT").map((movement) => movement.amountCents));
  const byDay = new Map<string, { date: string; entriesCents: number; exitsCents: number }>();
  const byMethod = new Map<string, number>();
  const byOrigin = new Map<string, number>();
  for (const movement of movements) {
    const date = movement.date.toISOString().slice(0, 10);
    const day = byDay.get(date) ?? { date, entriesCents: 0, exitsCents: 0 };
    if (movement.direction === "IN") day.entriesCents += movement.amountCents; else day.exitsCents += movement.amountCents;
    byDay.set(date, day);
    byMethod.set(movement.method, (byMethod.get(movement.method) ?? 0) + movement.amountCents);
    byOrigin.set(movement.origin, (byOrigin.get(movement.origin) ?? 0) + movement.amountCents);
  }
  return { entriesCents: entries, exitsCents: exits, netCents: entries - exits, byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)), byMethod: [...byMethod.entries()].map(([method, amountCents]) => ({ method, amountCents })), byOrigin: [...byOrigin.entries()].map(([origin, amountCents]) => ({ origin, amountCents })) };
}

export async function cashflowReport(filters: CashflowFilters = {}) {
  const [sales, receivables, payables, expenses] = await Promise.all([
    prisma.sale.findMany({ where: { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) }, status: { not: "CANCELLED" }, fiscalType: { not: "PROFORMA" }, paymentMethod: { not: "CREDIT" } }, select: { id: true, number: true, createdAt: true, cashCents: true, cardCents: true, transferCents: true, operatorId: true } }),
    prisma.receivablePayment.findMany({ where: { receivedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }, select: { id: true, receivedAt: true, amountCents: true, paymentMethod: true, idempotencyKey: true, operatorId: true, reference: true, note: true } }),
    prisma.payablePayment.findMany({ where: { paidAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }, select: { id: true, paidAt: true, amountCents: true, paymentMethod: true, reference: true, note: true, operatorId: true, payable: { select: { purchase: { select: { number: true } } } } } }),
    prisma.expense.findMany({ where: { expenseDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) }, status: "ACTIVE", paymentMethod: { not: "CREDIT" } }, select: { id: true, expenseDate: true, amountCents: true, paymentMethod: true, documentNumber: true, description: true, operatorId: true, notes: true } }),
  ]);
  const movements: CashflowMovement[] = [];
  for (const sale of sales) {
    for (const [method, amountCents] of [["CASH", sale.cashCents], ["CARD", sale.cardCents], ["TRANSFER", sale.transferCents] ] as const) {
      if (amountCents > 0) movements.push({ id: `${sale.id}:${method}`, date: sale.createdAt, direction: "IN", amountCents, origin: "SALE_PAYMENT", reference: sale.number, method, operatorId: sale.operatorId, note: null });
    }
  }
  for (const payment of receivables) movements.push({ id: payment.id, date: payment.receivedAt, direction: "IN", amountCents: payment.amountCents, origin: "RECEIVABLE_PAYMENT", reference: payment.reference ?? payment.idempotencyKey, method: payment.paymentMethod, operatorId: payment.operatorId, note: payment.note ?? null });
  for (const payment of payables) movements.push({ id: payment.id, date: payment.paidAt, direction: "OUT", amountCents: payment.amountCents, origin: "PAYABLE_PAYMENT", reference: payment.reference ?? payment.payable.purchase.number, method: payment.paymentMethod, operatorId: payment.operatorId, note: payment.note ?? null });
  for (const expense of expenses) movements.push({ id: expense.id, date: expense.expenseDate, direction: "OUT", amountCents: expense.amountCents, origin: "EXPENSE", reference: expense.documentNumber ?? expense.description, method: expense.paymentMethod, operatorId: expense.operatorId, note: expense.notes ?? null });
  const filtered = movements.filter((movement) => accepts(movement, filters)).sort((a, b) => b.date.getTime() - a.date.getTime());
  return { ...summarizeCashflow(filtered), rows: filtered, limitations: ["Vendas a crédito não são entradas no momento da emissão; entram apenas pelos recebimentos registados.", "Despesas a crédito não são consideradas pagas porque o modelo atual não tem pagamento de despesa separado.", "Não existe saldo inicial/final de caixa nesta etapa."] };
}
