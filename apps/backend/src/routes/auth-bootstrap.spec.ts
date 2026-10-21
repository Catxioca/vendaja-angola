import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapInput } from "./auth.js";

const request = {
  company: { legalName: "VendaJá Teste", nif: "500000000", branchCode: "MAIN", branchName: "Sede" },
  admin: { username: "primeiro.admin", email: "admin@example.test", displayName: "Primeiro Administrador", password: "Uma-password-segura-123", pin: "123456" },
};

test("accepts the one-time tenant bootstrap payload", () => {
  const parsed = bootstrapInput.safeParse(request);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.company.branchCode, "MAIN");
});

test("rejects weak bootstrap credentials and an invalid branch code", () => {
  assert.equal(bootstrapInput.safeParse({ ...request, admin: { ...request.admin, password: "short" } }).success, false);
  assert.equal(bootstrapInput.safeParse({ ...request, company: { ...request.company, branchCode: "filial principal" } }).success, false);
});
