import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { VendaJaClient, VendaJaApiError } from "./index.js";

describe("VendaJá Enterprise Developer SDK", () => {
  test("instantiates client with normalized baseUrl", () => {
    const client = new VendaJaClient({
      baseUrl: "https://api.vendaja.ao/v1/",
      apiKey: "vj_live_test_123456789",
    });
    assert.ok(client);
    assert.ok(client.customers);
    assert.ok(client.products);
    assert.ok(client.sales);
    assert.ok(client.bi);
    assert.ok(client.dataExchange);
  });

  test("validates webhook HMAC-SHA256 signature correctly", () => {
    const secret = "test-webhook-secret-999";
    const payload = JSON.stringify({ event: "sale.created", saleId: "sale-001", totalKz: 150000 });
    const validSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    const isValid = VendaJaClient.verifyWebhookSignature(payload, validSignature, secret);
    assert.equal(isValid, true);

    const invalidSignature = "deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef";
    assert.equal(VendaJaClient.verifyWebhookSignature(payload, invalidSignature, secret), false);
    assert.equal(VendaJaClient.verifyWebhookSignature(payload, "short-invalid-sig", secret), false);
  });

  test("creates VendaJaApiError with status code and details", () => {
    const error = new VendaJaApiError("Token expirado", 401, "token_expired", { expiredAt: 123456 });
    assert.equal(error.name, "VendaJaApiError");
    assert.equal(error.status, 401);
    assert.equal(error.code, "token_expired");
    assert.deepEqual(error.details, { expiredAt: 123456 });
  });
});
