export type CreditSaleInput = {
  customerId?: string | null;
  dueDate?: string | Date | null;
  totalCents?: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
};

export function validateCreditSale(input: CreditSaleInput, now = new Date()): void {
  if (!input.customerId || !input.dueDate || new Date(input.dueDate) <= now) throw new Error("credit_customer_due_date_required");
  if (![input.totalCents, input.cashCents, input.cardCents, input.transferCents].every(Number.isSafeInteger) || (input.totalCents ?? -1) < 0) throw new Error("invalid_credit_amount");
  if (input.cashCents !== 0 || input.cardCents !== 0 || input.transferCents !== 0) throw new Error("credit_payment_not_allowed");
}

export function receivableStatus(outstandingCents: number, dueDate: Date | null, now = new Date()): "PENDENTE" | "PARCIAL" | "PAGO" | "VENCIDO" {
  if (outstandingCents <= 0) return "PAGO";
  if (dueDate && dueDate < now) return "VENCIDO";
  return "PENDENTE";
}
