const base = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const health = await fetch(`${base}/health`);
if (!health.ok) throw new Error(`health failed: ${health.status}`);
const headers = health.headers;
for (const name of ["x-content-type-options", "x-frame-options", "content-security-policy", "x-correlation-id"]) {
  if (!headers.get(name)) throw new Error(`missing security header: ${name}`);
}
const openapi = await fetch(`${base}/api/v1/openapi.json`);
if (!openapi.ok) throw new Error(`openapi failed: ${openapi.status}`);
const spec = await openapi.json();
if (!spec.paths?.["/platform/context"]) throw new Error("platform API missing from OpenAPI");
const metrics = await fetch(`${base}/metrics`);
if (!metrics.ok) throw new Error(`metrics failed: ${metrics.status}`);
if (process.env.E2E_WEB_URL) {
  const webBase = process.env.E2E_WEB_URL.replace(/\/$/, "");
  for (const asset of ["/manifest.webmanifest", "/sw.js"]) {
    const response = await fetch(`${webBase}${asset}`);
    if (!response.ok) throw new Error(`PWA asset failed: ${asset}`);
  }
}
console.log(JSON.stringify({ status: "ok", checks: ["health", "security-headers", "openapi", "metrics", ...(process.env.E2E_WEB_URL ? ["manifest", "service-worker"] : [])] }));
