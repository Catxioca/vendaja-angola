import test from "node:test";
import assert from "node:assert/strict";
import { average, groupByDay, sum } from "./report-aggregation.js";

test("report aggregation returns totals and zero for empty data", () => {
  assert.equal(sum([100, 250, 50]), 400);
  assert.equal(average([100, 250, 50]), 133);
  assert.equal(sum([]), 0);
  assert.equal(average([]), 0);
});

test("dashboard day aggregation groups real amounts and keeps empty periods empty", () => {
  assert.deepEqual(groupByDay([
    { date: new Date("2026-09-21T08:00:00Z"), amountCents: 100 },
    { date: new Date("2026-09-21T12:00:00Z"), amountCents: 250 },
    { date: new Date("2026-09-20T12:00:00Z"), amountCents: 50 },
  ]), [
    { date: "2026-09-20", amountCents: 50 },
    { date: "2026-09-21", amountCents: 350 },
  ]);
  assert.deepEqual(groupByDay([]), []);
});
