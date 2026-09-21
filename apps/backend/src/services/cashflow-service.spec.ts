import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCashflow, type CashflowMovement } from "./cashflow-service.js";

const movement = (direction: "IN" | "OUT", amountCents: number, date: string, origin: CashflowMovement["origin"]): CashflowMovement => ({ id: crypto.randomUUID(), date: new Date(date), direction, amountCents, origin, reference: "R", method: "CASH", operatorId: null, note: null });

test("cashflow summarizes entries, exits, net and grouped days", () => {
  const result = summarizeCashflow([movement("IN", 1000, "2026-09-21T08:00:00Z", "SALE_PAYMENT"), movement("IN", 500, "2026-09-21T09:00:00Z", "RECEIVABLE_PAYMENT"), movement("OUT", 300, "2026-09-21T10:00:00Z", "EXPENSE")]);
  assert.equal(result.entriesCents, 1500);
  assert.equal(result.exitsCents, 300);
  assert.equal(result.netCents, 1200);
  assert.deepEqual(result.byDay, [{ date: "2026-09-21", entriesCents: 1500, exitsCents: 300 }]);
});

test("cashflow has zero totals for no movements and separates origins", () => {
  const result = summarizeCashflow([]);
  assert.deepEqual(result, { entriesCents: 0, exitsCents: 0, netCents: 0, byDay: [], byMethod: [], byOrigin: [] });
  const grouped = summarizeCashflow([movement("IN", 100, "2026-09-21T00:00:00Z", "SALE_PAYMENT"), movement("IN", 200, "2026-09-21T00:00:00Z", "RECEIVABLE_PAYMENT")]);
  assert.deepEqual(grouped.byOrigin, [{ origin: "SALE_PAYMENT", amountCents: 100 }, { origin: "RECEIVABLE_PAYMENT", amountCents: 200 }]);
});
