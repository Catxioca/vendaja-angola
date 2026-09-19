import assert from "node:assert/strict";
import test from "node:test";
import { validateSalePayments } from "./payment-integrity.js";

test("accepts exact and mixed payments", () => {
  assert.doesNotThrow(() => validateSalePayments(1000, { cashCents: 400, cardCents: 600, transferCents: 0 }, "INVOICE_RECEIPT"));
});

test("rejects underpayment, overpayment, and negative values", () => {
  assert.throws(() => validateSalePayments(1000, { cashCents: 400, cardCents: 0, transferCents: 0 }, "INVOICE_RECEIPT"), /payment_total_mismatch/);
  assert.throws(() => validateSalePayments(1000, { cashCents: 1001, cardCents: 0, transferCents: 0 }, "INVOICE_RECEIPT"), /payment_total_mismatch/);
  assert.throws(() => validateSalePayments(1000, { cashCents: -1, cardCents: 1001, transferCents: 0 }, "INVOICE_RECEIPT"), /invalid_payment_amount/);
});

test("does not allow payments on proformas", () => {
  assert.doesNotThrow(() => validateSalePayments(1000, { cashCents: 0, cardCents: 0, transferCents: 0 }, "PROFORMA"));
  assert.throws(() => validateSalePayments(1000, { cashCents: 1000, cardCents: 0, transferCents: 0 }, "PROFORMA"), /proforma_payment_not_allowed/);
});
