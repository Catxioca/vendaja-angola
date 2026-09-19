import assert from "node:assert/strict";
import test from "node:test";
import { equivalentSale } from "./sync-idempotency.js";

const baseSale = {
  fiscalType: "INVOICE_RECEIPT",
  lines: [
    { productId: "product-a", quantity: 2 },
    { productId: "product-b", quantity: 1 },
  ],
};

test("recognizes the same sale when line order differs", () => {
  assert.equal(equivalentSale(baseSale, {
    fiscalType: "INVOICE_RECEIPT",
    lines: [
      { productId: "product-b", quantity: 1 },
      { productId: "product-a", quantity: 2 },
    ],
  }), true);
});

test("rejects a sale with a different product or quantity", () => {
  assert.equal(equivalentSale(baseSale, {
    fiscalType: "INVOICE_RECEIPT",
    lines: [
      { productId: "product-a", quantity: 3 },
      { productId: "product-b", quantity: 1 },
    ],
  }), false);
});

test("rejects a sale with a different fiscal type", () => {
  assert.equal(equivalentSale(baseSale, {
    fiscalType: "PROFORMA",
    lines: baseSale.lines,
  }), false);
});
