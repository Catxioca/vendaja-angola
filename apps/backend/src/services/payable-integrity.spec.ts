import test from "node:test";
import assert from "node:assert/strict";
import { payableStatus, validatePaymentAmount } from "./payable-integrity.js";

test("payable status reflects partial, paid and overdue balances", () => {
  assert.equal(payableStatus(1000, 0, new Date("2030-01-01"), new Date("2029-01-01")), "PENDING");
  assert.equal(payableStatus(1000, 200, new Date("2030-01-01"), new Date("2029-01-01")), "PARTIAL");
  assert.equal(payableStatus(1000, 1000, new Date("2020-01-01"), new Date("2029-01-01")), "PAID");
  assert.equal(payableStatus(1000, 0, new Date("2020-01-01"), new Date("2029-01-01")), "OVERDUE");
});

test("payable payment rejects invalid and excessive amounts", () => {
  assert.doesNotThrow(() => validatePaymentAmount(1000, 400, 600));
  assert.throws(() => validatePaymentAmount(1000, 400, 601), /payment_exceeds_outstanding/);
  assert.throws(() => validatePaymentAmount(1000, 400, 0), /invalid_payment_amount/);
});
