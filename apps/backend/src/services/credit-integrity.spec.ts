import assert from "node:assert/strict";
import test from "node:test";
import { receivableStatus, validateCreditSale } from "./credit-integrity.js";

test("requires customer, future due date, and no immediate payment for credit", () => {
  assert.throws(() => validateCreditSale({ totalCents: 100, cashCents: 0, cardCents: 0, transferCents: 0 }), /credit_customer_due_date_required/);
  assert.throws(() => validateCreditSale({ customerId: "c", dueDate: "2020-01-01T00:00:00.000Z", totalCents: 100, cashCents: 0, cardCents: 0, transferCents: 0 }), /credit_customer_due_date_required/);
  assert.throws(() => validateCreditSale({ customerId: "c", dueDate: "2099-01-01T00:00:00.000Z", totalCents: 100, cashCents: 100, cardCents: 0, transferCents: 0 }), /credit_payment_not_allowed/);
});

test("reports receivable status from balance and due date", () => {
  assert.equal(receivableStatus(0, null), "PAGO");
  assert.equal(receivableStatus(100, new Date("2099-01-01")), "PENDENTE");
  assert.equal(receivableStatus(100, new Date("2020-01-01")), "VENCIDO");
});
