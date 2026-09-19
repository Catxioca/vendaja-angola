import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = crypto.randomBytes(32).toString("base64url");
process.env.FISCAL_CONFIG_KEY = crypto.randomBytes(32).toString("base64url");
process.env.COMPANY_NIF = "000000000";
process.env.COMPANY_NAME = "Empresa de Teste";
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FISCAL_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const { calculateSale } = await import("./sale-calculation.js");
const { deterministicInvoiceHash, qrPayload, signFiscalPayload } = await import("./fiscal.js");

const product = {
  id: "p-1",
  sku: "SKU-1",
  name: "Produto",
  priceCents: 1000,
  taxRate: { toString: () => "0.14" } as never,
  taxCategory: "GENERAL",
  exemptionCode: null,
  active: true,
};

test("calculation ignores client price and tax values", async () => {
  const result = await calculateSale(
    { product: { findMany: async () => [product] } },
    [{ productId: "p-1", quantity: 2 }],
  );
  assert.deepEqual(result.lines[0], { productId: "p-1", quantity: 2, unitPriceCents: 1000, taxRate: 0.14 });
  assert.equal(result.subtotalCents, 2000);
  assert.equal(result.taxCents, 280);
  assert.equal(result.totalCents, 2280);
});

test("calculation rejects missing or inactive products", async () => {
  await assert.rejects(
    () => calculateSale({ product: { findMany: async () => [] } }, [{ productId: "missing", quantity: 1 }]),
    /invalid_product/,
  );
});

test("calculation ignores legacy client discount and keeps the official gross total", async () => {
  const result = await calculateSale(
    { product: { findMany: async () => [product] } },
    [{ productId: "p-1", quantity: 1 }],
    50000,
  );
  assert.equal(result.discountCents, 0);
  assert.equal(result.subtotalCents, 1000);
  assert.equal(result.taxCents, 140);
  assert.equal(result.totalCents, 1140);
});

test("fiscal payloads use the undiscounted official total", () => {
  const issuedAt = new Date("2026-09-19T20:00:00.000Z");
  const hash = deterministicInvoiceHash({ number: "A/000001", date: issuedAt, subtotalCents: 1000, taxCents: 140, totalCents: 1140 });
  const signature = signFiscalPayload(`A/000001|2026-09-19|1000|1140|140|${hash}`);
  const qr = qrPayload({ number: "A/000001", issuedAt, totalCents: 1140, taxCents: 140, hash });
  assert.match(signature.signature ?? "", /^[A-Za-z0-9+/]+=*$/);
  assert.match(qr, /T:11\.40/);
  assert.doesNotMatch(qr, /T:0\.00/);
});
