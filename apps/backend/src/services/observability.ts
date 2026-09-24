import crypto from "node:crypto";

const counters = new Map<string, number>();
const startedAt = Date.now();

export function correlationId(value?: string) {
  return value?.trim().slice(0, 128) || crypto.randomUUID();
}

export function countMetric(name: string, increment = 1) {
  counters.set(name, (counters.get(name) ?? 0) + increment);
}

export function metricsSnapshot() {
  return { uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), counters: Object.fromEntries(counters) };
}

export function logJson(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields })}\n`);
}
