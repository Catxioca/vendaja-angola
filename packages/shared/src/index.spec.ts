import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserPosStorage, SyncEngine, type Sale, type SyncMutation } from "./index.js";

const sale: Sale = {
  id: "sale-1", number: "local-1", lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0,
  currency: "AOA", createdAt: new Date().toISOString(),
};
const mutation: SyncMutation = { id: "mutation-1", operation: "CREATE", entity: "SALE", payload: sale, occurredAt: sale.createdAt };

test("persists a sale and its outbox mutation together", async () => {
  const storage = createBrowserPosStorage(`test-${crypto.randomUUID()}`);
  await storage.saveSaleAndEnqueue(sale, mutation);
  assert.deepEqual(await storage.getSales(), [sale]);
  assert.deepEqual(await storage.getOutbox(), [mutation]);
});

test("sends bearer credentials and only acknowledges sent mutations", async () => {
  const storage = createBrowserPosStorage(`test-${crypto.randomUUID()}`);
  await storage.enqueue(mutation);
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({ accepted: ["mutation-1", "not-sent"], rejected: [], cursor: "1" }), { status: 200 });
  };
  try {
    const result = await new SyncEngine(storage, { apiUrl: "https://api.example/", token: "token", deviceId: "device" }).flush();
    assert.deepEqual(result?.accepted, ["mutation-1", "not-sent"]);
    assert.equal((request?.headers as Record<string, string>).authorization, "Bearer token");
    assert.equal((await storage.getOutbox()).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports rejected mutations and keeps them for explicit retry", async () => {
  const storage = createBrowserPosStorage(`test-${crypto.randomUUID()}`);
  await storage.enqueue(mutation);
  const originalFetch = globalThis.fetch;
  let rejected: string[] = [];
  globalThis.fetch = async () => new Response(JSON.stringify({
    accepted: [],
    rejected: [{ id: "mutation-1", reason: "Conflict" }],
    cursor: "2",
  }), { status: 200 });
  try {
    const result = await new SyncEngine(storage, {
      apiUrl: "https://api.example/",
      token: "token",
      deviceId: "device",
      onResult: (response) => { rejected = response.rejected.map((item) => item.id); },
    }).flush();
    assert.deepEqual(result?.rejected, [{ id: "mutation-1", reason: "Conflict" }]);
    assert.deepEqual(rejected, ["mutation-1"]);
    assert.deepEqual(await storage.getOutbox(), [mutation]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
