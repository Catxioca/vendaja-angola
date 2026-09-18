import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
process.env.NODE_ENV = "test";
const { deterministicInvoiceHash, finalAgTQrString, signFiscalPayload, validateVatExemption } = await import("./fiscal.js");

test("invoice hash and AGT QR are deterministic and contain required fields", () => {
  const hash = deterministicInvoiceHash({ number: "A/000001", date: "2026-01-02", totalCents: 11400, taxCents: 1400 });
  assert.equal(hash, deterministicInvoiceHash({ number: "A/000001", date: "2026-01-02", totalCents: 11400, taxCents: 1400 }));
  assert.match(finalAgTQrString({ issuerNif: "123456789", customerNif: "987654321", date: "2026-01-02", totalCents: 11400, taxCents: 1400, hash }), /A:123456789;N:987654321;D:2026-01-02;T:114.00;I:14.00;H:/);
});

test("zero VAT requires a configurable-format exemption code", () => {
  assert.throws(() => validateVatExemption(0), /vat_exemption_code_required/);
  assert.equal(validateVatExemption(0, "M02"), true);
  assert.throws(() => validateVatExemption(0, "invalid"), /invalid_vat_exemption_code/);
});

test("RSA-SHA1 and RSA-SHA256 test signatures verify", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.FISCAL_PRIVATE_KEY = pem;
  for (const algorithm of ["RSA-SHA1", "RSA-SHA256"] as const) {
    const result = signFiscalPayload("invoice-sequence", algorithm);
    assert.equal(crypto.verify(algorithm, Buffer.from("invoice-sequence"), publicKey, Buffer.from(result.signature!, "base64")), true);
  }
  delete process.env.FISCAL_PRIVATE_KEY;
});
