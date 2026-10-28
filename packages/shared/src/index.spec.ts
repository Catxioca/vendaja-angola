import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserPosStorage,
  deleteBrowserPosStorage,
  POS_DB_VERSION,
  SyncEngine,
  computeIdempotencyKey,
  computeSaleIdempotencyKey,
  computePaymentIdempotencyKey,
  computeRefundIdempotencyKey,
  computeStockMovementIdempotencyKey,
  computeFiscalDocumentIdempotencyKey,
  sanitizeSyncError,
  createSecureCredentialVault,
  type Sale,
  type SyncMutation,
} from "./index.js";

const sale: Sale = {
  id: "sale-1",
  number: "local-1",
  lines: [],
  subtotalCents: 10000,
  taxCents: 1400,
  totalCents: 11400,
  currency: "AOA",
  createdAt: new Date().toISOString(),
};

const baseMutation: SyncMutation = {
  id: "mutation-1",
  operation: "CREATE",
  entity: "SALE",
  payload: sale,
  occurredAt: sale.createdAt,
  companyId: "empresa-1",
  branchId: "sede-luanda",
  userId: "user-op-1",
  terminalId: "pos-term-01",
  state: "PENDING",
};

test("exports POS_DB_VERSION equal to 2 for updated IndexedDB schema", () => {
  assert.equal(POS_DB_VERSION, 2);
});

test("persists a sale and its outbox mutation together with initial state PENDING", async () => {
  const dbName = `test-${crypto.randomUUID()}`;
  const storage = createBrowserPosStorage(dbName);
  await storage.saveSaleAndEnqueue(sale, baseMutation);
  assert.deepEqual(await storage.getSales(), [sale]);
  const outbox = await storage.getOutbox();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.id, "mutation-1");
  assert.equal(outbox[0]?.state, "PENDING");
  assert.equal(outbox[0]?.companyId, "empresa-1");
  await deleteBrowserPosStorage(dbName);
});

test("clears storage and deletes database without throwing", async () => {
  const dbName = `test-${crypto.randomUUID()}`;
  const storage = createBrowserPosStorage(dbName);
  await storage.saveSaleAndEnqueue(sale, baseMutation);
  assert.equal((await storage.getSales()).length, 1);
  if (storage.clear) {
    await storage.clear();
    assert.equal((await storage.getSales()).length, 0);
    assert.equal((await storage.getOutbox()).length, 0);
  }
  await deleteBrowserPosStorage(dbName);
});

test("sends bearer credentials and only acknowledges sent mutations", async () => {
  const dbName = `test-${crypto.randomUUID()}`;
  const storage = createBrowserPosStorage(dbName);
  await storage.enqueue({ ...baseMutation });
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({ accepted: ["mutation-1", "not-sent"], rejected: [], cursor: "1" }), { status: 200 });
  };
  try {
    const result = await new SyncEngine(storage, {
      apiUrl: "https://api.example/",
      token: "token-secret",
      deviceId: "device-pos-01",
      companyId: "empresa-1",
      branchId: "sede-luanda",
    }).flush();
    assert.deepEqual(result?.accepted, ["mutation-1", "not-sent"]);
    assert.equal((request?.headers as Record<string, string>).authorization, "Bearer token-secret");
    assert.equal((request?.headers as Record<string, string>)["x-company-id"], "empresa-1");
    assert.equal((await storage.getOutbox()).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await deleteBrowserPosStorage(dbName);
  }
});

test("reports rejected mutations and preserves them in CONFLICT without automatic deletion", async () => {
  const dbName = `test-${crypto.randomUUID()}`;
  const storage = createBrowserPosStorage(dbName);
  await storage.enqueue({ ...baseMutation });
  const originalFetch = globalThis.fetch;
  let rejected: string[] = [];
  globalThis.fetch = async () => new Response(JSON.stringify({
    accepted: [],
    rejected: [{ id: "mutation-1", reason: "Conflict: document already exists with different payload" }],
    cursor: "2",
  }), { status: 200 });
  try {
    const result = await new SyncEngine(storage, {
      apiUrl: "https://api.example/",
      token: "token",
      deviceId: "device",
      companyId: "empresa-1",
      branchId: "sede-luanda",
      onResult: (response) => { rejected = response.rejected.map((item) => item.id); },
    }).flush();
    assert.deepEqual(result?.rejected.length, 1);
    assert.deepEqual(rejected, ["mutation-1"]);

    // Mutation MUST NOT be deleted
    const outbox = await storage.getOutbox();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.id, "mutation-1");
    assert.equal(outbox[0]?.state, "CONFLICT");
    assert.match(outbox[0]?.errorSanitized ?? "", /Conflict/);
  } finally {
    globalThis.fetch = originalFetch;
    await deleteBrowserPosStorage(dbName);
  }
});

test("handles network outage: transitions mutations to RETRYABLE without losing data", async () => {
  const dbName = `test-${crypto.randomUUID()}`;
  const storage = createBrowserPosStorage(dbName);
  await storage.enqueue({ ...baseMutation });
  const originalFetch = globalThis.fetch;
  let errorNotified: Error | undefined;

  // Simulate network blackout / offline failure
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch: net::ERR_INTERNET_DISCONNECTED");
  };

  try {
    const engine = new SyncEngine(storage, {
      apiUrl: "https://api.example/",
      token: "token",
      deviceId: "device",
      companyId: "empresa-1",
      branchId: "sede-luanda",
      onError: (err) => { errorNotified = err; },
    });
    const result = await engine.flush();
    assert.equal(result, undefined);
    assert.ok(errorNotified);

    // Mutation is safe, not deleted, and transitioned to RETRYABLE
    const outbox = await storage.getOutbox();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.id, "mutation-1");
    assert.equal(outbox[0]?.state, "RETRYABLE");
    assert.match(outbox[0]?.errorSanitized ?? "", /net::ERR_INTERNET_DISCONNECTED/);
  } finally {
    globalThis.fetch = originalFetch;
    await deleteBrowserPosStorage(dbName);
  }
});

test("reconnect recovery: automatically flushes RETRYABLE mutations upon network restoration", async () => {
  const dbName = `test-${crypto.randomUUID()}`;
  const storage = createBrowserPosStorage(dbName);
  await storage.enqueue({ ...baseMutation, state: "RETRYABLE", attempts: 1 });
  const originalFetch = globalThis.fetch;

  // Server is back online
  globalThis.fetch = async () => new Response(JSON.stringify({
    accepted: ["mutation-1"],
    rejected: [],
    cursor: "rec-1",
  }), { status: 200 });

  try {
    const engine = new SyncEngine(storage, {
      apiUrl: "https://api.example/",
      token: "token",
      deviceId: "device",
      companyId: "empresa-1",
      branchId: "sede-luanda",
    });
    const result = await engine.flush();
    assert.deepEqual(result?.accepted, ["mutation-1"]);

    // Queue is cleared of acknowledged items
    const remaining = await storage.getOutbox();
    assert.equal(remaining.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await deleteBrowserPosStorage(dbName);
  }
});

test("strictly enforces multi-tenant isolation: does not flush mutations belonging to other companies", async () => {
  const dbName = `test-${crypto.randomUUID()}`;
  const storage = createBrowserPosStorage(dbName);

  // Mutation for Company A
  await storage.enqueue({
    ...baseMutation,
    id: "mut-company-a",
    companyId: "company-alpha",
    branchId: "branch-1",
  });

  // Mutation for Company B
  await storage.enqueue({
    ...baseMutation,
    id: "mut-company-b",
    companyId: "company-beta",
    branchId: "branch-2",
  });

  const originalFetch = globalThis.fetch;
  let sentBody: string | undefined;
  globalThis.fetch = async (_input, init) => {
    sentBody = init?.body as string;
    return new Response(JSON.stringify({ accepted: ["mut-company-a"], rejected: [], cursor: "t-1" }), { status: 200 });
  };

  try {
    // Sync configured strictly for Company Alpha
    const engine = new SyncEngine(storage, {
      apiUrl: "https://api.example/",
      token: "token",
      deviceId: "device",
      companyId: "company-alpha",
      branchId: "branch-1",
    });
    await engine.flush();

    // Verify Company Beta was NEVER included in the payload
    assert.ok(sentBody);
    assert.match(sentBody, /mut-company-a/);
    assert.doesNotMatch(sentBody, /mut-company-b/);

    // Filtered outbox verification
    const alphaOutbox = await storage.getOutbox({ companyId: "company-alpha" });
    assert.equal(alphaOutbox.length, 0); // acknowledged

    const betaOutbox = await storage.getOutbox({ companyId: "company-beta" });
    assert.equal(betaOutbox.length, 1);
    assert.equal(betaOutbox[0]?.id, "mut-company-b");
    assert.equal(betaOutbox[0]?.companyId, "company-beta");
  } finally {
    globalThis.fetch = originalFetch;
    await deleteBrowserPosStorage(dbName);
  }
});

test("diagnostic interface: provides accurate queue counts and authorized operator retry", async () => {
  const dbName = `test-${crypto.randomUUID()}`;
  const storage = createBrowserPosStorage(dbName);

  await storage.enqueue({
    ...baseMutation,
    id: "mut-conflict-1",
    state: "CONFLICT",
    errorSanitized: "Document number duplicate",
  });
  await storage.enqueue({
    ...baseMutation,
    id: "mut-pending-1",
    state: "PENDING",
  });

  // Diagnostic report
  const diag = await storage.getOutboxDiagnostics();
  assert.equal(diag.total, 2);
  assert.equal(diag.counts.conflict, 1);
  assert.equal(diag.counts.pending, 1);
  assert.equal(diag.counts.rejected, 0);
  assert.equal(diag.items[0]?.correlationId.length! > 0, true);

  // Unauthorized operator retry rejected
  const unauthorizedRetry = await storage.retryMutation("mut-conflict-1", {
    userId: "guest",
    role: "GUEST",
  });
  assert.equal(unauthorizedRetry.success, false);
  assert.equal(unauthorizedRetry.error, "unauthorized_operator");

  // Authorized manager retry approved
  const authorizedRetry = await storage.retryMutation("mut-conflict-1", {
    userId: "manager-1",
    role: "MANAGER",
  });
  assert.equal(authorizedRetry.success, true);
  assert.equal(authorizedRetry.mutation?.state, "PENDING");
  assert.equal(authorizedRetry.mutation?.errorSanitized, null);

  const diagAfter = await storage.getOutboxDiagnostics();
  assert.equal(diagAfter.counts.conflict, 0);
  assert.equal(diagAfter.counts.pending, 2);

  await deleteBrowserPosStorage(dbName);
});

test("idempotency key generation: deterministic across sales, payments, refunds, stock, and fiscal documents", () => {
  const context = { companyId: "emp-100", branchId: "fil-01", terminalId: "pos-05" };

  const keySale1 = computeSaleIdempotencyKey({ id: "sale-uuid-1", number: "FT 2026/1", totalCents: 50000 }, context);
  const keySale2 = computeSaleIdempotencyKey({ id: "sale-uuid-1", number: "FT 2026/1", totalCents: 50000 }, context);
  assert.equal(keySale1, keySale2);
  assert.match(keySale1, /^emp-100:fil-01:pos-05:SALE:CREATE:FT 2026\/1:50000/);

  const keyPayment = computePaymentIdempotencyKey({ paymentId: "pay-1", amountCents: 50000, saleId: "sale-uuid-1" }, context);
  assert.match(keyPayment, /^emp-100:fil-01:pos-05:PAYMENT:CREATE:pay-1:50000/);

  const keyRefund = computeRefundIdempotencyKey({ refundId: "ref-1", saleId: "sale-uuid-1", amountCents: 20000 }, context);
  assert.match(keyRefund, /^emp-100:fil-01:pos-05:REFUND:CREATE:sale-uuid-1:ref-1:20000/);

  const keyStock = computeStockMovementIdempotencyKey({ productId: "prod-1", quantity: -2, type: "SALE", reference: "sale-uuid-1" }, context);
  assert.match(keyStock, /^emp-100:fil-01:pos-05:STOCK:CREATE:prod-1:SALE:sale-uuid-1:-2/);

  const keyDoc = computeFiscalDocumentIdempotencyKey({ documentType: "INVOICE", documentNumber: "1002", series: "A", totalCents: 50000 }, context);
  assert.match(keyDoc, /^emp-100:fil-01:pos-05:DOCUMENT:CREATE:A-INVOICE-1002:50000/);
});

test("sanitizes sync error messages: purges bearer tokens, passwords, and connection strings", () => {
  const dirty = "Error: Bearer eyJhbGciOiJIUzI1NiJ9.secret failed with password=supersecret at postgresql://user:pass@127.0.0.1:5432/db";
  const sanitized = sanitizeSyncError(dirty);
  assert.doesNotMatch(sanitized, /eyJhbGci/);
  assert.doesNotMatch(sanitized, /supersecret/);
  assert.doesNotMatch(sanitized, /user:pass/);
  assert.match(sanitized, /Bearer \[REDACTED\]/);
  assert.match(sanitized, /postgres:\/\/\[REDACTED\]/);
});

test("secure credential vault: transparently reports capabilities without false encryption claims", async () => {
  // Test browser fallback environment
  const browserVault = createSecureCredentialVault({ platform: "browser" });
  const browserCaps = await browserVault.getCapabilities();
  assert.equal(browserCaps.platform, "browser");
  assert.equal(browserCaps.isEncrypted, false);
  assert.equal(browserCaps.isHardwareBacked, false);
  assert.equal(browserCaps.encryptionAlgorithm, "NONE");
  assert.ok(browserCaps.warning?.includes("sandbox"));

  // Test Electron DPAPI mock
  const electronVault = createSecureCredentialVault({
    platform: "electron",
    electronBridge: {
      getSecureCapabilities: async () => ({
        platform: "electron",
        isHardwareBacked: true,
        isEncrypted: true,
        encryptionAlgorithm: "DPAPI",
        adapter: "ELECTRON_SAFESTORAGE_DPAPI",
      }),
      protectSecret: async (t) => Buffer.from(t).toString("base64"),
      unprotectSecret: async (c) => Buffer.from(c, "base64").toString("utf8"),
    },
  });
  const electronCaps = await electronVault.getCapabilities();
  assert.equal(electronCaps.platform, "electron");
  assert.equal(electronCaps.isEncrypted, true);
  assert.equal(electronCaps.encryptionAlgorithm, "DPAPI");
  const protectedText = await electronVault.protectCredential("master-token");
  const recovered = await electronVault.unprotectCredential(protectedText);
  assert.equal(recovered, "master-token");
});
