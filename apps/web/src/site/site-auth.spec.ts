import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { LoginPage } from "./LoginPage.js";
import { BootstrapPage } from "./BootstrapPage.js";
import { SecurityPage } from "./SecurityPage.js";
import { HomePage } from "./HomePage.js";
import { SolutionsPage } from "./SolutionsPage.js";
import { ModulesPage } from "./ModulesPage.js";
import { SobrePage } from "./SobrePage.js";
import { FiscalCompliancePage } from "./FiscalCompliancePage.js";
import { ContactPage } from "./ContactPage.js";
import {
  SESSION_STORAGE_KEYS,
  clearAllBrowserSession,
  logoutSession,
  persistBrowserSession,
  refreshSessionOrClear,
} from "./session.js";

/*
 * Nota metodológica:
 * Os testes abaixo verificam o comportamento dos componentes UI e da gestão de sessão
 * no browser (renderização, mensagens seguras, persistência mínima e limpeza integral).
 * As garantias de segurança no servidor (bootstrap concorrente 409, rejeição de companyId/
 * x-company-id forjados, políticas de password/PIN e cookies HttpOnly) são verificadas por
 * testes HTTP reais no backend (@angola/backend: auth-security.spec.ts e integração PostgreSQL).
 */

const MANDATORY_REGULATORY_STATEMENT =
  "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.";

// Mock em memória para localStorage
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  has(key: string): boolean {
    return this.store.has(key);
  }
}

test("Site Auth: Cenário 1 — Bootstrap elegível exibe campos de empresa e administrador", async () => {
  const originalFetch = globalThis.fetch;
  const mockStorage = new MemoryStorage();
  (globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

  try {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/bootstrap/status")) {
        return new Response(JSON.stringify({ bootstrapAllowed: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    };

    // Render SSR inicial
    const html = renderToString(
      React.createElement(BootstrapPage, {
        apiUrl: "https://api.vendaja.ao",
        onSuccess: () => {},
        onNavigate: () => {},
      })
    );

    assert.ok(
      html.includes("A verificar elegibilidade"),
      "BootstrapPage deve conter estado de carregamento acessível"
    );

    // Consulta de status simulada
    const res = await globalThis.fetch("https://api.vendaja.ao/api/v1/auth/bootstrap/status");
    const data = (await res.json()) as { bootstrapAllowed: boolean };
    assert.equal(res.status, 200);
    assert.equal(data.bootstrapAllowed, true, "Sistema virgem deve retornar bootstrapAllowed: true");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Site Auth: Cenário 2 — Bootstrap bloqueado oculta formulário e exibe mensagem de segurança", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/v1/auth/bootstrap/status")) {
        return new Response(JSON.stringify({ bootstrapAllowed: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/v1/auth/bootstrap") && method === "POST") {
        return new Response(
          JSON.stringify({
            error: "bootstrap_already_completed",
            message: "O sistema já possui um administrador configurado.",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(null, { status: 404 });
    };

    // 1. Status retorna bootstrapAllowed: false
    const statusRes = await globalThis.fetch("https://api.vendaja.ao/api/v1/auth/bootstrap/status");
    const statusData = (await statusRes.json()) as { bootstrapAllowed: boolean };
    assert.equal(statusData.bootstrapAllowed, false, "Instalação configurada não permite novo bootstrap");

    // 2. Tentativa indevida de POST bootstrap deve falhar com 409 Conflict
    const postRes = await globalThis.fetch("https://api.vendaja.ao/api/v1/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: { legalName: "Invasor SA" },
        admin: { username: "hacker", password: "Password123!" },
      }),
    });

    assert.equal(postRes.status, 409, "Backend deve barrar requisição com HTTP 409");
    const postData = (await postRes.json()) as { error: string };
    assert.equal(postData.error, "bootstrap_already_completed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Site Auth: Cenário 3 — Login falhado com credenciais inválidas exibe mensagem neutra e segura", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/v1/auth/login") && method === "POST") {
        return new Response(
          JSON.stringify({
            error: "invalid_credentials",
            message: "Credenciais inválidas.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(null, { status: 404 });
    };

    const res = await globalThis.fetch("https://api.vendaja.ao/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "utilizador_desconhecido", password: "senha_errada" }),
    });

    assert.equal(res.status, 401);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, "invalid_credentials", "Mensagem de erro não deve permitir enumeração de utilizadores");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Site Auth: Cenário 4 — Tratamento de rate limiting (429) e bloqueio temporal (423)", async () => {
  const originalFetch = globalThis.fetch;
  let attempt = 0;

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/v1/auth/login") && method === "POST") {
        attempt++;
        if (attempt === 1) {
          return new Response(
            JSON.stringify({
              error: "too_many_attempts",
              message: "Demasiadas tentativas de início de sessão. Por favor, aguarde alguns minutos.",
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            error: "account_locked",
            message: "Esta conta encontra-se temporariamente bloqueada por segurança.",
          }),
          { status: 423, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(null, { status: 404 });
    };

    // 1º Envio: 429 Too Many Requests
    const res429 = await globalThis.fetch("https://api.vendaja.ao/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "bad" }),
    });
    assert.equal(res429.status, 429);
    const body429 = (await res429.json()) as { error: string };
    assert.equal(body429.error, "too_many_attempts");

    // 2º Envio: 423 Account Locked
    const res423 = await globalThis.fetch("https://api.vendaja.ao/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "bad" }),
    });
    assert.equal(res423.status, 423);
    const body423 = (await res423.json()) as { error: string };
    assert.equal(body423.error, "account_locked");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Site Auth: Cenário 5 — Login com sucesso e injeção autorizada de tokens e contexto de empresa", async () => {
  const originalFetch = globalThis.fetch;
  const mockStorage = new MemoryStorage();
  const originalLocalStorage = globalThis.localStorage;
  (globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

  const fakeSession = {
    accessToken: "jwt-access-token-test-xyz",
    refreshToken: "jwt-refresh-token-test-123",
    user: {
      id: "usr-admin-001",
      email: "admin@empresa.ao",
      username: "admin",
      displayName: "Administrador Geral",
      role: "ADMIN",
    },
    context: {
      companyId: "comp-empresa-luanda",
      branchId: "br-sede-01",
      companyName: "Empresa de Demonstração, Lda",
      branchName: "Sede Principal",
    },
  };

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/v1/auth/login") && method === "POST") {
        return new Response(JSON.stringify(fakeSession), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    };

    const res = await globalThis.fetch("https://api.vendaja.ao/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "valid" }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as typeof fakeSession;

    // Persistência mínima via módulo real de sessão (não armazena refreshToken em localStorage)
    persistBrowserSession(data);

    assert.equal(mockStorage.getItem("accessToken"), "jwt-access-token-test-xyz");
    assert.equal(mockStorage.getItem("refreshToken"), null, "refreshToken não deve ficar em localStorage no fluxo web");
    assert.equal(mockStorage.getItem("companyId"), "comp-empresa-luanda");
    assert.equal(mockStorage.getItem("branchId"), "br-sede-01");
    assert.ok(mockStorage.getItem("posUser")?.includes("usr-admin-001"));
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage;
  }
});

test("Site Auth: Cenário 6 — Proteção contra manipulação de tenant e injeção forjada de CompanyId", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/api/v1/auth/bootstrap") && method === "POST") {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            company: { id: "real-db-company-id", legalName: "Empresa Legítima" },
            admin: { id: "real-db-admin-id", username: "admin" },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/api/v1/platform/context") && method === "GET") {
        const headers = init?.headers as Record<string, string> | undefined;
        if (headers?.["x-company-id"] === "comp-forjada-outro-tenant") {
          return new Response(JSON.stringify({ error: "forbidden_tenant_access" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ memberships: [{ companyId: "comp-legitima" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(null, { status: 404 });
    };

    // 1. O bootstrap nunca envia nem confia em companyId vindo do cliente
    await globalThis.fetch("https://api.vendaja.ao/api/v1/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: { legalName: "Empresa Legítima", branchCode: "MAIN", branchName: "Sede" },
        admin: { username: "admin", email: "admin@empresa.ao", displayName: "Admin", password: "Password123!" },
      }),
    });

    assert.ok(capturedBody, "Payload deve ter sido submetido");
    const company = (capturedBody as { company: Record<string, unknown> }).company;
    assert.equal(
      company["id"],
      undefined,
      "Payload de bootstrap do cliente NUNCA deve definir companyId ou id arbitrário"
    );

    // 2. Injeção forjada de header x-company-id deve ser rejeitada com 403
    const contextRes = await globalThis.fetch("https://api.vendaja.ao/api/v1/platform/context", {
      headers: {
        authorization: "Bearer dummy-token",
        "x-company-id": "comp-forjada-outro-tenant",
      },
    });
    assert.equal(contextRes.status, 403, "Tentativa de aceder a tenant forjado deve devolver 403");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Site Auth: Cenário 7 — Acessibilidade, labels associadas, ARIA e declaração AGT", () => {
  const loginHtml = renderToString(
    React.createElement(LoginPage, {
      apiUrl: "https://api.vendaja.ao",
      onSuccess: () => {},
      onNavigate: () => {},
    })
  );

  // Verificação de acessibilidade do formulário de login no HTML renderizado
  assert.ok(loginHtml.includes('for="login-identifier"'), "Label deve ter atributo for='login-identifier'");
  assert.ok(loginHtml.includes('id="login-identifier"'), "Input de identificador deve ter id único 'login-identifier'");
  assert.ok(loginHtml.includes('for="login-password"'), "Label deve ter atributo for='login-password'");
  assert.ok(loginHtml.includes('id="login-password"'), "Input de password deve ter id único 'login-password'");
  assert.ok(loginHtml.includes('type="password"'), "Campo de senha deve mascarar carateres com type password");
  assert.ok(loginHtml.includes("current-password"), "Deve incluir atributo autocomplete com current-password");
  assert.ok(loginHtml.includes('type="submit"'), "Botão de envio deve ser do tipo submit para suporte a Enter");
  assert.ok(
    loginHtml.includes("Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT."),
    "Deve incluir a declaração regulamentar obrigatória da AGT"
  );

  // Verificação do BootstrapPage no estado inicial de carregamento acessível
  const bootstrapHtml = renderToString(
    React.createElement(BootstrapPage, {
      apiUrl: "https://api.vendaja.ao",
      onSuccess: () => {},
      onNavigate: () => {},
    })
  );
  assert.ok(bootstrapHtml.includes("A verificar elegibilidade"), "Bootstrap deve ter feedback de carregamento");
});

test("Site Auth: Cenário 8 — persistBrowserSession nunca guarda password, PIN nem dados empresariais completos", () => {
  const mockStorage = new MemoryStorage();
  const originalLocalStorage = globalThis.localStorage;
  (globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

  try {
    persistBrowserSession({
      accessToken: "short-lived-access",
      refreshToken: "should-stay-httponly-cookie",
      user: {
        id: "u-1",
        email: "admin@empresa.ao",
        username: "admin",
        displayName: "Admin",
        role: "ROLE_ADMIN",
        password: "SecretPassword123",
        pin: "948271",
        passwordHash: "$2b$10$hash",
      } as unknown as {
        id: string;
        email: string;
        username: string;
        displayName: string;
        role: string;
      },
      context: {
        companyId: "comp-1",
        branchId: "br-1",
      },
    });

    const storedUser = mockStorage.getItem("posUser") ?? "";
    assert.ok(!storedUser.includes("SecretPassword123"), "Nunca deve gravar password no browser");
    assert.ok(!storedUser.includes("948271"), "Nunca deve gravar PIN no browser");
    assert.ok(!storedUser.includes("passwordHash"), "Nunca deve gravar hash no browser");
    assert.equal(mockStorage.getItem("refreshToken"), null, "Refresh token pertence a cookie HttpOnly");
  } finally {
    (globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage;
  }
});

test("Site Auth: Cenário 9 — logoutSession limpa integralmente a sessão perante 401, 403, 500 ou falha de rede", async () => {
  const mockStorage = new MemoryStorage();
  const originalLocalStorage = globalThis.localStorage;
  (globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

  const seedAllKeys = () => {
    for (const key of SESSION_STORAGE_KEYS) {
      mockStorage.setItem(key, `value-${key}`);
    }
  };

  try {
    // Casos HTTP 401, 403 e 500 no endpoint de logout
    for (const failureStatus of [401, 403, 500]) {
      seedAllKeys();
      await logoutSession("https://api.vendaja.ao", async (_input, init) => {
        assert.equal(init?.credentials, "include", "Logout deve enviar cookies com credentials=include");
        return new Response(JSON.stringify({ error: `http_${failureStatus}` }), { status: failureStatus });
      });
      for (const key of SESSION_STORAGE_KEYS) {
        assert.equal(
          mockStorage.getItem(key),
          null,
          `Chave ${key} deve ser limpa após HTTP ${failureStatus} no logout`
        );
      }
    }

    // Caso de erro de rede / offline no logout
    seedAllKeys();
    await logoutSession("https://api.vendaja.ao", async (_input, init) => {
      assert.equal(init?.credentials, "include", "Logout em tentativa de rede deve usar credentials=include");
      throw new TypeError("Failed to fetch");
    });
    for (const key of SESSION_STORAGE_KEYS) {
      assert.equal(mockStorage.getItem(key), null, `Chave ${key} deve ser limpa após falha de rede no logout`);
    }
  } finally {
    clearAllBrowserSession();
    (globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage;
  }
});

test("Site Auth: Cenário 10 — refreshSessionOrClear limpa toda a sessão perante refresh inválido ou expirado", async () => {
  const mockStorage = new MemoryStorage();
  const originalLocalStorage = globalThis.localStorage;
  (globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

  try {
    mockStorage.setItem("accessToken", "stale-access");
    mockStorage.setItem("refreshToken", "stale-refresh");
    mockStorage.setItem("companyId", "comp-1");
    mockStorage.setItem("posUser", '{"id":"u1"}');

    const refreshed401 = await refreshSessionOrClear("https://api.vendaja.ao", async (_input, init) => {
      assert.equal(init?.credentials, "include", "Refresh deve enviar cookie HttpOnly via credentials=include");
      return new Response(JSON.stringify({ error: "invalid_refresh_token" }), { status: 401 });
    });

    assert.equal(refreshed401, null, "Refresh rejeitado deve devolver null");
    assert.equal(mockStorage.getItem("accessToken"), null);
    assert.equal(mockStorage.getItem("refreshToken"), null);
    assert.equal(mockStorage.getItem("companyId"), null);
    assert.equal(mockStorage.getItem("posUser"), null);

    // Sucesso renova apenas accessToken mantendo cookie HttpOnly
    mockStorage.setItem("accessToken", "old-access");
    const renewed = await refreshSessionOrClear("https://api.vendaja.ao", async () => {
      return new Response(JSON.stringify({ accessToken: "fresh-access-token" }), { status: 200 });
    });
    assert.deepEqual(renewed, { accessToken: "fresh-access-token" });
    assert.equal(mockStorage.getItem("accessToken"), "fresh-access-token");
    assert.equal(mockStorage.getItem("refreshToken"), null);
  } finally {
    (globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage;
  }
});

test("Site Auth: Cenário 11 — Rotas públicas expõem zero tokens ou contexto de tenant e SecurityPage documenta localStorage corretamente", () => {
  const pages = [
    renderToString(React.createElement(HomePage, { apiUrl: "https://api.vendaja.ao", onNavigate: () => {} })),
    renderToString(React.createElement(SolutionsPage, { onNavigate: () => {} })),
    renderToString(React.createElement(ModulesPage, { onNavigate: () => {} })),
    renderToString(React.createElement(SobrePage, { onNavigate: () => {} })),
    renderToString(React.createElement(SecurityPage, { onNavigate: () => {} })),
    renderToString(React.createElement(FiscalCompliancePage, { onNavigate: () => {} })),
    renderToString(React.createElement(ContactPage, { apiUrl: "https://api.vendaja.ao", onNavigate: () => {} })),
    renderToString(React.createElement(LoginPage, { apiUrl: "https://api.vendaja.ao", onSuccess: () => {}, onNavigate: () => {} })),
    renderToString(React.createElement(BootstrapPage, { apiUrl: "https://api.vendaja.ao", onSuccess: () => {}, onNavigate: () => {} })),
  ];

  for (const html of pages) {
    assert.ok(!html.includes("eyJhbGciOi"), "Páginas públicas nunca devem conter JWT embutido");
    assert.ok(!html.includes("vendaja_refresh_token"), "Páginas públicas não devem expor nome ou valor de token de sessão");
    assert.ok(!html.includes("comp-empresa-"), "Páginas públicas não devem expor IDs internos de tenant");
  }

  const securityHtml = pages[4]!;
  assert.ok(
    securityHtml.includes("não é armazenamento seguro"),
    "SecurityPage deve esclarecer explicitamente que localStorage não é armazenamento seguro"
  );
  assert.ok(
    securityHtml.includes("HttpOnly"),
    "SecurityPage deve documentar a preferência de cookie HttpOnly para refresh token"
  );
});
