import test from "node:test";
import assert from "node:assert/strict";
import { calculatePurchase } from "./purchase-calculation.js";

test("calculates subtotal, tax and total for a purchase", () => {
  assert.deepEqual(calculatePurchase([{ quantity: 2, unitCostCents: 1000, taxRate: 0.14 }]), { subtotalCents: 2000, taxCents: 280, totalCents: 2280 });
});
test("rejects invalid purchase lines and excessive discount", () => {
  assert.throws(() => calculatePurchase([{ quantity: 0, unitCostCents: 100, taxRate: 0 }]));
  assert.throws(() => calculatePurchase([{ quantity: 1, unitCostCents: 100, taxRate: 0 }], 101));
});
