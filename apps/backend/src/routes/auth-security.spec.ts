import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";

process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://vendaja_test:pass@127.0.0.1:5432/vendaja_test?schema=public";
process.env.JWT_SECRET ??= "k9X0m2P9vL5nQ8rT1wY4bZ7cE0aD3fG6h8K1";
process.env.FISCAL_CONFIG_KEY ??= "j8V0n3Q9wM6oR9sU2xZ5cA8dF1bE4gH7m3J2";

const { prisma } = await import("../db.js");
const {
  authRouter,
  extractCookie,
  passwordPolicySchema,
  pinPolicySchema,
  REFRESH_COOKIE_NAME,
  resolveRefreshCookieOptions,
} = await import("./auth.js");
const { requireAuth, requireCompanyContext } = await import("../middleware/auth.js");

const rateLimitDelegate = prisma.rateLimitBucket as unknown as {
  upsert: (args: unknown) => Promise<{ count: number }>;
};
const originalRateLimitUpsert = rateLimitDelegate.upsert;
test.beforeEach(() => {
  rateLimitDelegate.upsert = async () => ({ count: 1 });
});
test.afterEach(() => {
  rateLimitDelegate.upsert = originalRateLimitUpsert;
});

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRouter);
  app.post("/api/v1/protected-tenant", requireAuth, requireCompanyContext, (_req, res) => {
    res.json({ ok: true });
  });
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "test_internal_error", message });
  });
  return app;
}

interface HttpDispatchResult {
  status: number;
  headers: Record<string, string | string[]>;
  bodyText: string;
  json<T = unknown>(): T;
}

async function dispatchApp(
  app: express.Express,
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<HttpDispatchResult> {
  const socketStream = new PassThrough() as PassThrough & {
    remoteAddress?: string;
    encrypted?: boolean;
    writable?: boolean;
  };
  socketStream.remoteAddress = "127.0.0.1";
  socketStream.writable = true;

  const rawBody = options.body !== undefined ? JSON.stringify(options.body) : "";
  const reqHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    reqHeaders[key.toLowerCase()] = value;
  }
  if (rawBody && !reqHeaders["content-length"]) {
    reqHeaders["content-length"] = String(Buffer.byteLength(rawBody));
  }

  const req = new IncomingMessage(socketStream as unknown as Socket);
  req.method = options.method.toUpperCase();
  req.url = options.path;
  req.headers = reqHeaders;
  if (rawBody) {
    req.push(rawBody);
  }
  req.push(null);

  const res = new ServerResponse(req);
  const chunks: Buffer[] = [];
  const sink = new PassThrough();
  sink.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.assignSocket(sink as unknown as Socket);

  await new Promise<void>((resolve, reject) => {
    res.on("finish", () => resolve());
    res.on("error", reject);
    app(req, res);
  });

  const rawWire = Buffer.concat(chunks).toString("utf8");
  const splitIdx = rawWire.indexOf("\r\n\r\n");
  const bodyText = splitIdx >= 0 ? rawWire.slice(splitIdx + 4) : rawWire;
  const headers: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(res.getHeaders())) {
    if (v !== undefined) {
      headers[k.toLowerCase()] = Array.isArray(v) ? v.map(String) : String(v);
    }
  }

  return {
    status: res.statusCode,
    headers,
    bodyText,
    json<T = unknown>() {
      return JSON.parse(bodyText) as T;
    },
  };
}

function signTestToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "15m" });
}

test("Backend Auth Security: Política de password e PIN imposta pelo backend", async () => {
  assert.equal(passwordPolicySchema.safeParse("1234567").success, false, "Password < 8 chars deve falhar");
  assert.equal(passwordPolicySchema.safeParse("onlyletters").success, false, "Password sem números deve falhar");
  assert.equal(passwordPolicySchema.safeParse("123456789").success, false, "Password só com números deve falhar");
  assert.equal(passwordPolicySchema.safeParse("Segura2026!").success, true);

  assert.equal(pinPolicySchema.safeParse("123").success, false, "PIN < 4 dígitos deve falhar");
  assert.equal(pinPolicySchema.safeParse("1234567").success, false, "PIN > 6 dígitos deve falhar");
  assert.equal(pinPolicySchema.safeParse("abcd").success, false, "PIN não numérico deve falhar");
  assert.equal(pinPolicySchema.safeParse("111111").success, false, "PIN com dígito repetido deve falhar");
  assert.equal(pinPolicySchema.safeParse("482910").success, true);

  const app = createTestApp();

  // 1. Bootstrap com password sem números é rejeitado pelo endpoint Express real
  const weakPwdRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/auth/bootstrap",
    headers: { "content-type": "application/json" },
    body: {
      company: { legalName: "Empresa Teste", branchCode: "MAIN", branchName: "Sede" },
      admin: {
        username: "admin.teste",
        email: "admin@teste.ao",
        displayName: "Admin Teste",
        password: "semnumeros",
        pin: "482910",
      },
    },
  });
  assert.equal(weakPwdRes.status, 400);

  // 2. Bootstrap com PIN repetido é rejeitado pelo endpoint Express real
  const weakPinRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/auth/bootstrap",
    headers: { "content-type": "application/json" },
    body: {
      company: { legalName: "Empresa Teste", branchCode: "MAIN", branchName: "Sede" },
      admin: {
        username: "admin.teste",
        email: "admin@teste.ao",
        displayName: "Admin Teste",
        password: "PasswordForte123",
        pin: "222222",
      },
    },
  });
  assert.equal(weakPinRes.status, 400);

  // 3. Criação de utilizador por admin valida política (>= 12 chars + letras + números) no backend
  const adminToken = signTestToken({
    id: "admin-1",
    role: "ROLE_ADMIN",
    context: { companyId: "comp-1", branchId: "br-1", membershipId: "mem-1", role: "ROLE_ADMIN" },
  });
  const weakManagedUserRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/auth/users",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken}`,
    },
    body: {
      username: "caixa.1",
      email: "caixa1@teste.ao",
      displayName: "Caixa Um",
      role: "ROLE_CASHIER",
      password: "Curta123",
    },
  });
  assert.equal(weakManagedUserRes.status, 400);
});

test("Backend Auth Security: /bootstrap rejeita companyId no body e x-company-id forjado via Express", async () => {
  const app = createTestApp();
  const basePayload = {
    company: { legalName: "Empresa Teste", branchCode: "MAIN", branchName: "Sede" },
    admin: {
      username: "admin.teste",
      email: "admin@teste.ao",
      displayName: "Admin Teste",
      password: "PasswordForte123",
      pin: "482910",
    },
  };

  // 1. x-company-id forjado no bootstrap deve ser rejeitado com 403
  const forgedHeaderRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/auth/bootstrap",
    headers: {
      "content-type": "application/json",
      "x-company-id": "comp-forged-999",
    },
    body: basePayload,
  });
  assert.equal(forgedHeaderRes.status, 403);
  assert.equal(forgedHeaderRes.json<{ error: string }>().error, "company_context_forbidden");

  // 2. companyId no body (topo ou aninhado) deve ser rejeitado com 400
  const forgedBodyRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/auth/bootstrap",
    headers: { "content-type": "application/json" },
    body: { ...basePayload, companyId: "comp-forged-top" },
  });
  assert.equal(forgedBodyRes.status, 400);
  assert.equal(forgedBodyRes.json<{ error: string }>().error, "company_id_forbidden");

  const nestedIdRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/auth/bootstrap",
    headers: { "content-type": "application/json" },
    body: {
      ...basePayload,
      company: { ...basePayload.company, id: "comp-forged-nested" },
    },
  });
  assert.equal(nestedIdRes.status, 400);
});

test("Backend Auth Security: requireCompanyContext rejeita x-company-id forjado e companyId divergente no body com 403", async () => {
  const app = createTestApp();
  const token = signTestToken({
    id: "user-1",
    role: "ROLE_ADMIN",
    context: { companyId: "comp-legitima", branchId: "br-legitima", membershipId: "mem-1", role: "ROLE_ADMIN" },
  });

  // Contexto coerente passa
  const okRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/protected-tenant",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-company-id": "comp-legitima",
    },
    body: { amount: 100 },
  });
  assert.equal(okRes.status, 200);

  // Header x-company-id forjado é barrado com 403 mesmo quando JWT já traz contexto
  const forgedHeaderRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/protected-tenant",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-company-id": "comp-forged-other-tenant",
    },
    body: { amount: 100 },
  });
  assert.equal(forgedHeaderRes.status, 403);

  // companyId forjado no body é barrado com 403
  const forgedBodyRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/protected-tenant",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: { companyId: "comp-forged-other-tenant", amount: 100 },
  });
  assert.equal(forgedBodyRes.status, 403);
});

test("Backend Auth Security: Cookie HttpOnly de refresh é limpo em logout 401 e em refresh malformado", async () => {
  assert.equal(
    extractCookie(`foo=bar; ${REFRESH_COOKIE_NAME}=tok-abc-123; theme=dark`, REFRESH_COOKIE_NAME),
    "tok-abc-123"
  );

  const app = createTestApp();

  // 1. Logout sem token válido retorna 401 E instrui browser a expirar cookie HttpOnly
  const logoutRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/auth/logout",
    headers: { "content-type": "application/json" },
    body: {},
  });
  assert.equal(logoutRes.status, 401);
  const logoutCookies = ([] as string[]).concat(logoutRes.headers["set-cookie"] ?? []).join("; ");
  assert.ok(logoutCookies.includes(`${REFRESH_COOKIE_NAME}=`), "Deve limpar cookie vendaja_refresh_token");
  assert.ok(logoutCookies.includes("HttpOnly"), "Cookie deve incluir flag HttpOnly");

  // 2. Refresh sem token válido retorna 400 e limpa cookie HttpOnly
  const refreshRes = await dispatchApp(app, {
    method: "POST",
    path: "/api/v1/auth/refresh",
    headers: { "content-type": "application/json" },
    body: {},
  });
  assert.equal(refreshRes.status, 400);
  const refreshCookies = ([] as string[]).concat(refreshRes.headers["set-cookie"] ?? []).join("; ");
  assert.ok(refreshCookies.includes(`${REFRESH_COOKIE_NAME}=`), "Deve expirar cookie em refresh inválido");
});

test("Backend Auth Security: resolveRefreshCookieOptions aplica SameSite=Lax em same-site e None+Secure em cross-site", () => {
  const prevSameSite = process.env.COOKIE_SAME_SITE;
  const prevCrossSite = process.env.COOKIE_CROSS_SITE;
  const prevNodeEnv = process.env.NODE_ENV;

  try {
    delete process.env.COOKIE_SAME_SITE;
    delete process.env.COOKIE_CROSS_SITE;
    process.env.NODE_ENV = "test";

    const fakeHttpReq = {
      secure: false,
      header: () => undefined,
    } as unknown as express.Request;
    const sameSiteHttp = resolveRefreshCookieOptions(fakeHttpReq);
    assert.equal(sameSiteHttp.httpOnly, true);
    assert.equal(sameSiteHttp.sameSite, "lax");
    assert.equal(sameSiteHttp.secure, false);

    const fakeHttpsReq = {
      secure: false,
      header: (name: string) => (name.toLowerCase() === "x-forwarded-proto" ? "https" : undefined),
    } as unknown as express.Request;
    const sameSiteHttps = resolveRefreshCookieOptions(fakeHttpsReq);
    assert.equal(sameSiteHttps.sameSite, "lax");
    assert.equal(sameSiteHttps.secure, true, "HTTPS deve ativar Secure no cookie");

    process.env.COOKIE_SAME_SITE = "none";
    const crossSite = resolveRefreshCookieOptions(fakeHttpReq);
    assert.equal(crossSite.sameSite, "none");
    assert.equal(crossSite.secure, true, "SameSite=None tem obrigatoriamente de ativar Secure");
  } finally {
    if (prevSameSite === undefined) delete process.env.COOKIE_SAME_SITE;
    else process.env.COOKIE_SAME_SITE = prevSameSite;
    if (prevCrossSite === undefined) delete process.env.COOKIE_CROSS_SITE;
    else process.env.COOKIE_CROSS_SITE = prevCrossSite;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  }
});
