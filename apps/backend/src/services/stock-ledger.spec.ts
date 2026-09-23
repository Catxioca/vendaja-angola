import assert from "node:assert/strict";
import test from "node:test";
import { calculateNextStock } from "./stock-ledger.js";

test("stock ledger calculates positive and negative movements", () => {
  assert.equal(calculateNextStock(10, 5), 15);
  assert.equal(calculateNextStock(10, -4), 6);
});

test("stock ledger rejects negative balances and zero movements", () => {
  assert.throws(() => calculateNextStock(2, -3), /insufficient_stock/);
  assert.throws(() => calculateNextStock(2, 0), /invalid_stock_quantity/);
});
