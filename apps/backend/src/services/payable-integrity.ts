export type PayableStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE";

export function payableStatus(originalCents: number, paidCents: number, dueDate: Date | null, now = new Date()): PayableStatus {
  if (paidCents >= originalCents) return "PAID";
  if (dueDate && dueDate < now) return "OVERDUE";
  return paidCents > 0 ? "PARTIAL" : "PENDING";
}

export function validatePaymentAmount(originalCents: number, paidCents: number, amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("invalid_payment_amount");
  if (amountCents > originalCents - paidCents) throw new Error("payment_exceeds_outstanding");
}
