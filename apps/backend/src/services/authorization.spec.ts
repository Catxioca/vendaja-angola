import assert from "node:assert/strict";
import test from "node:test";
import { canManageCashSession } from "./authorization.js";

test("allows the owner or an administrator to manage a cash session", () => {
  assert.equal(canManageCashSession("user-1", "user-1", "ROLE_CASHIER"), true);
  assert.equal(canManageCashSession("user-1", "user-2", "ROLE_ADMIN"), true);
  assert.equal(canManageCashSession("user-1", "user-2", "ROLE_CASHIER"), false);
});
