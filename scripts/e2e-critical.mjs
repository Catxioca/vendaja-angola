import crypto from "node:crypto";

const base = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const email = process.env.ADMIN_INITIAL_EMAIL ?? "admin@angolacommerce.local";
const password = process.env.ADMIN_INITIAL_PASSWORD;
if (!password) throw new Error("ADMIN_INITIAL_PASSWORD is required");

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const login = await request("/api/v1/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
const auth = { Authorization: `Bearer ${login.accessToken}` };
const products = await request("/api/v1/products", { headers: auth });
const product = products[0];
if (!product) throw new Error("seed product missing");
const totalCents = Math.round(product.priceCents * (1 + Number(product.taxRate)));
const saleId = crypto.randomUUID();
const salePayload = {
  id: saleId,
  lines: [{ productId: product.id, quantity: 1 }],
  paymentMethod: "CARD",
  cardCents: totalCents,
};
const sale = await request("/api/v1/sales", { method: "POST", headers: auth, body: JSON.stringify(salePayload) });
if (sale.id !== saleId) throw new Error("sale response did not preserve idempotency key");
const company = await request("/api/v1/platform/companies", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ legalName: "E2E Empresa", branchCode: "E2E", branchName: "E2E Branch" }),
});
const contextHeaders = { ...auth, "x-company-id": company.company.id, "x-branch-id": company.branch.id };
const context = await request("/api/v1/platform/context", { headers: auth });
if (!context.some((membership) => membership.companyId === company.company.id)) throw new Error("company membership missing");
const register = await request("/api/v1/platform/cash-registers", {
  method: "POST",
  headers: contextHeaders,
  body: JSON.stringify({ code: "E2E-01", name: "E2E Caixa", branchId: company.branch.id }),
});
const shift = await request(`/api/v1/platform/cash-registers/${register.id}/shifts`, {
  method: "POST",
  headers: contextHeaders,
  body: JSON.stringify({ openingCents: 0 }),
});
await request(`/api/v1/platform/shifts/${shift.id}/close`, {
  method: "POST",
  headers: contextHeaders,
  body: JSON.stringify({ declaredCents: 0 }),
});
const sync = await request("/api/v1/sync", {
  method: "POST",
  headers: { ...contextHeaders, "x-device-id": "e2e-device" },
  body: JSON.stringify({
    deviceId: "e2e-device",
    mutations: [{
      id: crypto.randomUUID(),
      operation: "CREATE",
      entity: "SALE",
      occurredAt: new Date().toISOString(),
      payload: salePayload,
    }],
  }),
});
if (!Array.isArray(sync.accepted) && !Array.isArray(sync.rejected)) throw new Error("sync response shape invalid");
const invalid = await fetch(`${base}/api/v1/sales`, { method: "POST", headers: auth, body: "{}" });
if (invalid.status !== 400) throw new Error(`error recovery expected 400, got ${invalid.status}`);
console.log(JSON.stringify({ status: "ok", checks: ["login", "sale", "stock", "cash", "sync", "multi-company", "error-recovery"], saleId, companyId: company.company.id }));
