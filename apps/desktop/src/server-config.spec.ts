import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readServerConfigFile, testServerConnection, validateServerConfig, validateServerUrl, writeServerConfigFile } from "./server-config.js";

test("accepts HTTPS and localhost loopback HTTP without pilot override", () => {
  assert.equal(validateServerUrl("https://pilot.example.com/"), "https://pilot.example.com");
  assert.equal(validateServerUrl("http://localhost:4000/"), "http://localhost:4000");
  assert.equal(validateServerUrl("http://127.0.0.1:4000/"), "http://127.0.0.1:4000");
  assert.equal(validateServerUrl("http://[::1]:4000/"), "http://[::1]:4000");
});

test("blocks public HTTP and permits private LAN HTTP only with explicit pilot override", () => {
  for (const url of [
    "http://pilot.example.com",
    "http://192.168.1.20:4000",
    "http://10.0.0.8:4000",
    "http://172.16.0.8:4000",
    "http://backend.pilot.lan:4000",
  ]) assert.throws(() => validateServerUrl(url), /HTTPS/);

  assert.throws(() => validateServerUrl("http://pilot.example.com", true), /HTTPS/);
  assert.equal(validateServerUrl("http://192.168.1.20:4000", true), "http://192.168.1.20:4000");
  assert.equal(validateServerUrl("http://10.0.0.8:4000", true), "http://10.0.0.8:4000");
  assert.equal(validateServerUrl("http://172.16.0.8:4000", true), "http://172.16.0.8:4000");
  assert.equal(validateServerUrl("http://backend.pilot.lan:4000", true), "http://backend.pilot.lan:4000");
});

test("rejects credentials, fragments and malformed URLs", () => {
  for (const url of [
    "not a URL",
    "ftp://localhost:4000",
    "http://user:pass@localhost:4000",
    "http://@localhost:4000",
    "http://localhost:4000/#",
  ]) assert.throws(() => validateServerUrl(url, true));
});

test("validates and persists API URL and terminalId", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vendaja-server-config-"));
  const path = join(directory, "server-config.json");
  const config = { apiUrl: "http://localhost:4000/", terminalId: "caixa-01" };
  try {
    assert.deepEqual(validateServerConfig(config), { apiUrl: "http://localhost:4000", terminalId: "caixa-01" });
    assert.throws(() => validateServerConfig({ apiUrl: "https://pilot.example.com", terminalId: "caixa 01" }));
    const saved = await writeServerConfigFile(path, config);
    assert.deepEqual(saved, { apiUrl: "http://localhost:4000", terminalId: "caixa-01" });
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), saved);
    assert.deepEqual(await readServerConfigFile(path), saved);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports unavailable backend and recovers after health endpoint returns", async () => {
  const originalFetch = globalThis.fetch;
  let available = false;
  globalThis.fetch = async () => { if (!available) throw new Error("failed to fetch"); return new Response("ok", { status: 200 }); };
  try {
    assert.equal((await testServerConnection("https://pilot.example.com")).ok, false);
    available = true;
    assert.equal((await testServerConnection("https://pilot.example.com")).message, "Ligação ao backend confirmada.");
  } finally { globalThis.fetch = originalFetch; }
});
