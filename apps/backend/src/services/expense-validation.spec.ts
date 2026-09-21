import test from "node:test";
import assert from "node:assert/strict";
import { isExpenseCategory, isExpensePaymentMethod } from "./expense-validation.js";

test("accepts configured expense categories and payment methods", () => {
  assert.equal(isExpenseCategory("ENERGY"), true);
  assert.equal(isExpensePaymentMethod("TRANSFER"), true);
  assert.equal(isExpenseCategory(""), false);
  assert.equal(isExpensePaymentMethod("CHEQUE"), false);
});
