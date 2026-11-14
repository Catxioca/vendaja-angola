import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  MutshimaClient,
  MutshimaClientConfig,
  MutshimaApiError,
  VendaJaClient,
  VendaJaClientConfig,
  VendaJaApiError,
} from "./index.js";

describe("Mutshima Enterprise Developer SDK", () => {
  test("instantiates client with normalized baseUrl", () => {
    const client = new MutshimaClient({
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

    const isValid = MutshimaClient.verifyWebhookSignature(payload, validSignature, secret);
    assert.equal(isValid, true);

    const invalidSignature = "deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef";
    assert.equal(MutshimaClient.verifyWebhookSignature(payload, invalidSignature, secret), false);
    assert.equal(MutshimaClient.verifyWebhookSignature(payload, "short-invalid-sig", secret), false);
  });

  test("creates VendaJaApiError with status code and details", () => {
    const error = new MutshimaApiError("Token expirado", 401, "token_expired", { expiredAt: 123456 });
    assert.equal(error.name, "MutshimaApiError");
    assert.equal(error.status, 401);
    assert.equal(error.code, "token_expired");
    assert.deepEqual(error.details, { expiredAt: 123456 });
  });

  test("SDK Backward Compatibility: Exports MutshimaClient, MutshimaApiError, and retains aliases", () => {
    assert.equal(typeof MutshimaClient, "function");
    assert.equal(typeof VendaJaClient, "function");
    assert.equal(MutshimaClient, VendaJaClient);

    assert.equal(typeof MutshimaApiError, "function");
    assert.equal(typeof VendaJaApiError, "function");
    assert.equal(MutshimaApiError, VendaJaApiError);

    const config: VendaJaClientConfig = {
      baseUrl: "https://api.mutshima.ao",
      apiKey: "test-key",
      companyId: "comp-123",
      timeoutMs: 5000,
      maxRetries: 2,
    };
    const mutshimaConfig: MutshimaClientConfig = config;
    assert.equal(mutshimaConfig.baseUrl, "https://api.mutshima.ao");

    const client = new MutshimaClient(config);
    assert.ok(client instanceof MutshimaClient);
    assert.ok(client instanceof VendaJaClient);

    const legacyClient = new VendaJaClient(config);
    assert.ok(legacyClient instanceof MutshimaClient);
    assert.ok(legacyClient instanceof VendaJaClient);

    const legacyError = new VendaJaApiError("Erro de teste", 400, "bad_request");
    assert.ok(legacyError instanceof MutshimaApiError);
    assert.ok(legacyError instanceof VendaJaApiError);
  });
});
