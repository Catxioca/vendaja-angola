import assert from "node:assert/strict";
import test from "node:test";
import { assertImmutableFiscalMutation } from "./fiscal-integrity.js";

test("rejects fiscal Sale fields while allowing cancellation fields", () => {
  assert.throws(() => assertImmutableFiscalMutation("Sale", "update", { totalCents: 1 }), /immutable_fiscal_sale_fields/);
  assert.throws(() => assertImmutableFiscalMutation("Sale", "update", { fiscalHash: "changed" }), /immutable_fiscal_sale_fields/);
  assert.doesNotThrow(() => assertImmutableFiscalMutation("Sale", "updateMany", { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "admin" }));
});

test("rejects SaleLine fiscal mutations", () => {
  assert.throws(() => assertImmutableFiscalMutation("SaleLine", "update", { quantity: 3 }), /immutable_fiscal_sale_line_fields/);
  assert.throws(() => assertImmutableFiscalMutation("SaleLine", "update", { taxRate: 0.14 }), /immutable_fiscal_sale_line_fields/);
  assert.throws(() => assertImmutableFiscalMutation("SaleLine", "delete", {}), /immutable_fiscal_sale_line/);
});

test("allows creation and rejects Sale deletion", () => {
  assert.doesNotThrow(() => assertImmutableFiscalMutation("Sale", "create", { totalCents: 100 }));
  assert.throws(() => assertImmutableFiscalMutation("Sale", "delete", {}), /immutable_fiscal_sale/);
});
