export type SalePayments = {
  cashCents: number;
  cardCents: number;
  transferCents: number;
};

export function validateSalePayments(totalCents: number, payments: SalePayments, fiscalType: string) {
  const values = [totalCents, payments.cashCents, payments.cardCents, payments.transferCents];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("invalid_payment_amount");
  if (fiscalType === "PROFORMA") {
    if (payments.cashCents !== 0 || payments.cardCents !== 0 || payments.transferCents !== 0) throw new Error("proforma_payment_not_allowed");
    return;
  }
  if (payments.cashCents + payments.cardCents + payments.transferCents !== totalCents) throw new Error("payment_total_mismatch");
}
