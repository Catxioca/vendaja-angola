import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyNetworkError,
  ServiceCircuitBreaker,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  resilientRequest,
  AUTOMATION_FALLBACK_DASHBOARD,
  AUTOMATION_FALLBACK_WORKFLOWS,
  AUTOMATION_FALLBACK_RULES,
} from "./resilient-api-client.js";

describe("Resilient API Client & Diagnostics Suite", () => {
  it("translates generic TypeError 'Failed to fetch' into clear Portuguese diagnostic", () => {
    const error = new TypeError("Failed to fetch");
    const classified = classifyNetworkError(error, "http://127.0.0.1:4000/api/v1/automation");

    assert.equal(classified.isNetworkFailure, true);
    assert.equal(classified.category, "CONNECTION_REFUSED");
    assert.match(classified.userMessage, /Serviço de Automação & Workflows/);
    assert.match(classified.userMessage, /Verifique se o serviço VendaJá Backend/);
    assert.equal(classified.url, "http://127.0.0.1:4000/api/v1/automation");
  });

  it("identifies AbortError / timeout and provides actionable timeout diagnostic", () => {
    const abortErr = new Error("The user aborted a request.");
    abortErr.name = "AbortError";
    const classified = classifyNetworkError(abortErr, "http://127.0.0.1:4000/api/v1/automation/queue");

    assert.equal(classified.category, "TIMEOUT");
    assert.equal(classified.isTimeout, true);
    assert.match(classified.userMessage, /Tempo limite de comunicação excedido/);
  });

  it("classifies HTTP 502/503/504 server unavailable status codes", () => {
    const error503 = new Error("HTTP 503: Service Unavailable");
    const classified = classifyNetworkError(error503, "http://127.0.0.1:4000/api/v1/automation");

    assert.equal(classified.category, "SERVICE_UNAVAILABLE");
    assert.equal(classified.statusCode, 503);
    assert.match(classified.userMessage, /Serviço central temporariamente indisponível/);
  });

  it("classifies HTTP 401 and 403 authorization errors", () => {
    const error401 = new Error("HTTP 401: Unauthorized");
    const classified401 = classifyNetworkError(error401);
    assert.equal(classified401.category, "UNAUTHORIZED");
    assert.equal(classified401.statusCode, 401);
    assert.match(classified401.userMessage, /Sessão expirada/);

    const error403 = new Error("HTTP 403: Forbidden");
    const classified403 = classifyNetworkError(error403);
    assert.equal(classified403.category, "FORBIDDEN");
    assert.equal(classified403.statusCode, 403);
    assert.match(classified403.userMessage, /Acesso negado/);
  });

  it("handles offline PIN local session gracefully", async () => {
    const res = await resilientRequest<typeof AUTOMATION_FALLBACK_DASHBOARD>(
      "http://127.0.0.1:4000/api/v1/automation/dashboard",
      "offline-local-session",
      {
        fallbackData: AUTOMATION_FALLBACK_DASHBOARD,
      }
    );

    assert.equal(res.fromFallback, true);
    assert.equal(res.circuitState, "OFFLINE_LOCAL");
    assert.equal(res.data.operationalCockpit.workflows.totalDefinitions, 4);
  });

  it("manages Circuit Breaker state transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)", () => {
    const cb = new ServiceCircuitBreaker("test-service", {
      failureThreshold: 3,
      cooldownPeriodMs: 100,
    });

    assert.equal(cb.getState(), "CLOSED");
    assert.equal(cb.canExecute(), true);

    cb.recordFailure();
    assert.equal(cb.getState(), "CLOSED");

    cb.recordFailure();
    assert.equal(cb.getState(), "CLOSED");

    cb.recordFailure();
    // 3 consecutive failures -> trips open
    assert.equal(cb.getState(), "OPEN");
    assert.equal(cb.canExecute(), false);

    // After cooldown period has elapsed
    const now = Date.now();
    // simulate elapsed time by setting lastFailureTime
    (cb as any).lastFailureTime = now - 150;
    assert.equal(cb.canExecute(), true);
    assert.equal(cb.getState(), "HALF_OPEN");

    // Success in HALF_OPEN resets breaker
    cb.recordSuccess();
    assert.equal(cb.getState(), "CLOSED");
    assert.equal(cb.canExecute(), true);
  });

  it("ensures default enterprise automation fallback records are fully populated", () => {
    assert.ok(AUTOMATION_FALLBACK_DASHBOARD.operationalCockpit.workflows.activeInstances >= 0);
    assert.ok(AUTOMATION_FALLBACK_WORKFLOWS.length > 0);
    assert.ok(AUTOMATION_FALLBACK_RULES.length > 0);

    const purchaseWorkflow = AUTOMATION_FALLBACK_WORKFLOWS.find((w) => w.id === "wf-purchase-approval");
    assert.ok(purchaseWorkflow, "wf-purchase-approval definition must exist in fallback");
    assert.equal(purchaseWorkflow?.active, true);
  });
});
