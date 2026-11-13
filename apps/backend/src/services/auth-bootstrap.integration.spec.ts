import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import cors from "cors";
import express from "express";
import { getEffectiveTestDatabaseUrl } from "./db-test-helper.js";

const PSQL_PATH =
  process.platform === "win32"
    ? fs.existsSync("C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe")
      ? "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
      : "psql.exe"
    : "psql";

async function dispatchExpress(
  app: express.Express,
  options: { method: string; path: string; headers?: Record<string, string>; body?: unknown }
): Promise<{ status: number; headers: Record<string, string | string[]>; json<T = unknown>(): T }> {
  const socketStream = new PassThrough() as PassThrough & { remoteAddress?: string; writable?: boolean };
  socketStream.remoteAddress = "127.0.0.1";
  socketStream.writable = true;

  const rawBody = options.body !== undefined ? JSON.stringify(options.body) : "";
  const reqHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    reqHeaders[k.toLowerCase()] = v;
  }
  if (rawBody && !reqHeaders["content-length"]) {
    reqHeaders["content-length"] = String(Buffer.byteLength(rawBody));
  }

  const req = new IncomingMessage(socketStream as unknown as Socket);
  req.method = options.method.toUpperCase();
  req.url = options.path;
  req.headers = reqHeaders;
  if (rawBody) req.push(rawBody);
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
    if (v !== undefined) headers[k.toLowerCase()] = Array.isArray(v) ? v.map(String) : String(v);
  }
  return {
    status: res.statusCode,
    headers,
    json<T = unknown>() {
      return JSON.parse(bodyText) as T;
    },
  };
}

function getSetCookies(headers: Record<string, string | string[]>): string[] {
  const raw = headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve("prisma/migrations"),
    path.resolve("apps/backend/prisma/migrations"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("prisma/migrations directory not found");
}

test("Autenticação, Sessão e Bootstrap Concorrente Determinístico em PostgreSQL 17 Real", async (t) => {
  const baseDatabaseUrl = await getEffectiveTestDatabaseUrl();
  assert.ok(baseDatabaseUrl, "PostgreSQL 17 real obrigatório para suite auth-bootstrap.integration.spec.ts (zero skips)");

  const urlObj = new URL(baseDatabaseUrl);
  const host = urlObj.hostname;
  const port = urlObj.port || "5432";
  const pgUser = urlObj.username || "vendaja_test";
  const pgPassword = decodeURIComponent(urlObj.password || "VendaJ@2309");
  const baseDb = urlObj.pathname.slice(1).split("?")[0] || "vendaja_test";

  const psqlEnv = { ...process.env, PGPASSWORD: pgPassword };
  const execPsql = (dbName: string, sql: string) =>
    execFileSync(
      PSQL_PATH,
      ["-h", host, "-p", port, "-U", pgUser, "-d", dbName, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
      { env: psqlEnv, stdio: "pipe" }
    ).toString();

  const tempDbName = `vendaja_auth_it_${Date.now()}_${randomUUID().slice(0, 6)}`;
  execPsql(baseDb, `DROP DATABASE IF EXISTS "${tempDbName}";`);
  execPsql(baseDb, `CREATE DATABASE "${tempDbName}";`);

  const tempUrlObj = new URL(baseDatabaseUrl);
  tempUrlObj.pathname = `/${tempDbName}`;
  const tempDbUrl = tempUrlObj.toString();

  // Aplicar sequencialmente as migrações oficiais na base temporária exclusiva (0 registos pré-existentes)
  const migrationsDir = resolveMigrationsDir();
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((entry) => fs.existsSync(path.join(migrationsDir, entry, "migration.sql")))
    .sort()
    .map((entry) => path.join(migrationsDir, entry, "migration.sql"));

  assert.ok(migrationFiles.length >= 35, "Devem existir as migrações Prisma completas para aprovisionar a base isolada");

  const fileArgs: string[] = [];
  for (const file of migrationFiles) {
    fileArgs.push("-f", file);
  }
  execFileSync(
    PSQL_PATH,
    ["-h", host, "-p", port, "-U", pgUser, "-d", tempDbName, "-v", "ON_ERROR_STOP=1", ...fileArgs],
    { env: psqlEnv, stdio: "pipe" }
  );

  // Remover quaisquer registos legados semeados por migrações históricas apenas nesta base descartável exclusiva
  execPsql(
    tempDbName,
    'TRUNCATE TABLE "SystemBootstrap", "CompanyMembership", "RefreshToken", "ActiveSession", "Branch", "Company", "User" RESTART IDENTITY CASCADE;'
  );

  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = tempDbUrl;

  const { prisma } = await import("../db.js");
  await prisma.$disconnect();

  const { authRouter, extractCookie, REFRESH_COOKIE_NAME } = await import("../routes/auth.js");
  const { platformRouter } = await import("../routes/platform.js");
  const { isAllowedOrigin } = await import("./cors-policy.js");
  const { tokenHash } = await import("./security.js");

  const app = express();
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    })
  );
  app.use(express.json());
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/platform", platformRouter);

  const adminSuffix = randomUUID().slice(0, 8);
  const adminEmail = `admin-${adminSuffix}@integration.invalid`;
  const adminPassword = "PasswordForte123!";
  let bootstrappedCompanyId = "";
  let bootstrappedUserId = "";

  try {
    await t.test("1. Concorrência de POST /api/v1/auth/bootstrap gera exatamente 1 resposta 201, restantes 409, 1 SystemBootstrap e 1 ADMIN", async () => {
      const initialStatusRes = await dispatchExpress(app, {
        method: "GET",
        path: "/api/v1/auth/bootstrap/status",
      });
      assert.equal(initialStatusRes.status, 200);
      assert.equal(initialStatusRes.json<{ bootstrapAllowed: boolean }>().bootstrapAllowed, true);

      const responses = await Promise.all(
        [1, 2, 3, 4, 5].map((index) =>
          dispatchExpress(app, {
            method: "POST",
            path: "/api/v1/auth/bootstrap",
            headers: {
              "content-type": "application/json",
              "x-forwarded-proto": "https",
              origin: "https://vendaja.ao",
            },
            body: {
              company: {
                legalName: `Empresa Concorrente ${adminSuffix} ${index}`,
                nif: `500000${index}${adminSuffix.slice(0, 2)}`,
                branchCode: "MAIN",
                branchName: "Sede",
              },
              admin: {
                username: index === 1 ? `admin.${adminSuffix}` : `admin.${adminSuffix}.${index}`,
                email: index === 1 ? adminEmail : `admin-${adminSuffix}-${index}@integration.invalid`,
                displayName: `Admin ${index}`,
                password: adminPassword,
                pin: "482910",
              },
            },
          })
        )
      );

      const created = responses.filter((res) => res.status === 201);
      const conflicts = responses.filter((res) => res.status === 409);

      assert.equal(created.length, 1, "Exatamente 1 requisição concorrente pode retornar 201");
      assert.equal(conflicts.length, 4, "Todas as restantes 4 requisições concorrentes devem retornar 409");

      const winner = created[0]!;
      const winnerBody = winner.json<{
        accessToken: string;
        user: { id: string; email: string; role: string };
        context: { companyId: string; branchId: string };
      }>();
      bootstrappedCompanyId = winnerBody.context.companyId;
      bootstrappedUserId = winnerBody.user.id;

      // Garantir que o vencedor passa a ter credenciais conhecidas para o teste de ciclo de sessão
      await prisma.user.update({
        where: { id: bootstrappedUserId },
        data: { email: adminEmail },
      });

      const systemBootstraps = await prisma.systemBootstrap.findMany();
      assert.equal(systemBootstraps.length, 1, "Deve existir exatamente 1 SystemBootstrap no PostgreSQL");
      assert.equal(systemBootstraps[0]!.id, "primary");
      assert.equal(systemBootstraps[0]!.companyId, bootstrappedCompanyId);
      assert.equal(systemBootstraps[0]!.userId, bootstrappedUserId);

      const admins = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "admin", "ROLE_ADMIN"] } },
      });
      assert.equal(admins.length, 1, "Deve existir exatamente 1 utilizador ADMIN no PostgreSQL");

      const companiesCount = await prisma.company.count();
      assert.equal(companiesCount, 1, "Transações perdedoras devem sofrer rollback integral sem deixar empresas órfãs");

      const lockedStatusRes = await dispatchExpress(app, {
        method: "GET",
        path: "/api/v1/auth/bootstrap/status",
      });
      assert.equal(lockedStatusRes.status, 200);
      assert.equal(lockedStatusRes.json<{ bootstrapAllowed: boolean }>().bootstrapAllowed, false);

      const forgedContextRes = await dispatchExpress(app, {
        method: "GET",
        path: "/api/v1/platform/context",
        headers: {
          authorization: `Bearer ${winnerBody.accessToken}`,
          "x-company-id": "00000000-0000-4000-8000-000000000000",
        },
      });
      assert.equal(forgedContextRes.status, 403);

      const validContextRes = await dispatchExpress(app, {
        method: "GET",
        path: "/api/v1/platform/context",
        headers: { authorization: `Bearer ${winnerBody.accessToken}` },
      });
      assert.equal(validContextRes.status, 200);
    });

    await t.test("2. Ciclo completo em PostgreSQL: login → refresh via cookie HttpOnly → logout → refresh rejeitado", async () => {
      // Login com HTTPS proxy e Origin explícita permitida
      const loginRes = await dispatchExpress(app, {
        method: "POST",
        path: "/api/v1/auth/login",
        headers: {
          "content-type": "application/json",
          "x-forwarded-proto": "https",
          origin: "https://vendaja.ao",
        },
        body: {
          identifier: adminEmail,
          password: adminPassword,
        },
      });
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.headers["access-control-allow-origin"], "https://vendaja.ao", "CORS deve refletir origin explícita e nunca wildcard");
      assert.equal(loginRes.headers["access-control-allow-credentials"], "true");

      const loginCookies = getSetCookies(loginRes.headers).join("; ");
      assert.ok(loginCookies.includes(`${REFRESH_COOKIE_NAME}=`), "Login deve definir cookie de refresh");
      assert.ok(loginCookies.includes("HttpOnly"), "Cookie deve conter HttpOnly");
      assert.ok(loginCookies.includes("Secure"), "Cookie em HTTPS deve conter Secure");
      assert.ok(/SameSite=Lax/i.test(loginCookies), "Deployment same-site padrão deve usar SameSite=Lax");

      const firstRefreshToken = extractCookie(loginCookies, REFRESH_COOKIE_NAME);
      assert.ok(firstRefreshToken && firstRefreshToken.length >= 20);

      // Refresh usando exclusivamente Cookie (sem refreshToken no body)
      const refreshRes = await dispatchExpress(app, {
        method: "POST",
        path: "/api/v1/auth/refresh",
        headers: {
          "content-type": "application/json",
          "x-forwarded-proto": "https",
          origin: "https://vendaja.ao",
          cookie: `${REFRESH_COOKIE_NAME}=${encodeURIComponent(firstRefreshToken)}`,
        },
        body: {},
      });
      assert.equal(refreshRes.status, 200, "Refresh via cookie HttpOnly deve renovar sessão");
      const refreshData = refreshRes.json<{ accessToken: string; refreshToken: string }>();
      assert.ok(refreshData.accessToken);

      const rotatedCookies = getSetCookies(refreshRes.headers).join("; ");
      const secondRefreshToken = extractCookie(rotatedCookies, REFRESH_COOKIE_NAME);
      assert.ok(secondRefreshToken && secondRefreshToken !== firstRefreshToken, "Refresh deve rotacionar o cookie");

      const oldDbRow = await prisma.refreshToken.findUnique({ where: { tokenHash: tokenHash(firstRefreshToken) } });
      assert.ok(oldDbRow?.revokedAt, "Refresh token anterior deve ser revogado na rotação");

      // Replay do token já rodado deve ser rejeitado com 401
      const replayRes = await dispatchExpress(app, {
        method: "POST",
        path: "/api/v1/auth/refresh",
        headers: {
          "content-type": "application/json",
          cookie: `${REFRESH_COOKIE_NAME}=${encodeURIComponent(firstRefreshToken)}`,
        },
        body: {},
      });
      assert.equal(replayRes.status, 401);

      // Logout revoga refresh token do cookie e sessão ativa em PostgreSQL
      const logoutRes = await dispatchExpress(app, {
        method: "POST",
        path: "/api/v1/auth/logout",
        headers: {
          "content-type": "application/json",
          "x-forwarded-proto": "https",
          origin: "https://vendaja.ao",
          authorization: `Bearer ${refreshData.accessToken}`,
          cookie: `${REFRESH_COOKIE_NAME}=${encodeURIComponent(secondRefreshToken)}`,
        },
        body: {},
      });
      assert.equal(logoutRes.status, 200);
      assert.equal(logoutRes.json<{ loggedOut: boolean }>().loggedOut, true);

      const logoutCookies = getSetCookies(logoutRes.headers).join("; ");
      assert.ok(logoutCookies.includes(`${REFRESH_COOKIE_NAME}=;`), "Logout deve expirar cookie no cliente");
      assert.ok(/Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(logoutCookies), "Logout deve definir expiração imediata do cookie");

      const secondDbRow = await prisma.refreshToken.findUnique({ where: { tokenHash: tokenHash(secondRefreshToken) } });
      assert.ok(secondDbRow?.revokedAt, "Refresh token revogado no logout deve ter revokedAt persistido");

      // Refresh após logout deve ser rejeitado com 401 e instruir limpeza do cookie
      const postLogoutRefreshRes = await dispatchExpress(app, {
        method: "POST",
        path: "/api/v1/auth/refresh",
        headers: {
          "content-type": "application/json",
          cookie: `${REFRESH_COOKIE_NAME}=${encodeURIComponent(secondRefreshToken)}`,
        },
        body: {},
      });
      assert.equal(postLogoutRefreshRes.status, 401);
      assert.equal(postLogoutRefreshRes.json<{ error: string }>().error, "invalid_refresh_token");
    });

    await t.test("3. Configuração cross-site (SameSite=None + Secure) e bloqueio rigoroso de CORS wildcard em produção", async () => {
      const prevSameSite = process.env.COOKIE_SAME_SITE;
      const prevNodeEnv = process.env.NODE_ENV;
      const prevCorsOrigin = process.env.CORS_ORIGIN;

      try {
        process.env.COOKIE_SAME_SITE = "none";
        process.env.NODE_ENV = "production";
        process.env.CORS_ORIGIN = "*";

        // Em produção mesmo com CORS_ORIGIN='*', origin arbitrária não recebe Access-Control-Allow-Origin
        const evilRes = await dispatchExpress(app, {
          method: "POST",
          path: "/api/v1/auth/login",
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.example",
          },
          body: { identifier: adminEmail, password: adminPassword },
        });
        assert.equal(evilRes.headers["access-control-allow-origin"], undefined, "Wildcard em produção não pode autorizar origem desconhecida");

        // Origin explícita/canónica em produção recebe origem exata (nunca '*') e cookie cross-site emite SameSite=None; Secure
        process.env.CORS_ORIGIN = "https://app.vendaja.ao";
        const crossSiteLogin = await dispatchExpress(app, {
          method: "POST",
          path: "/api/v1/auth/login",
          headers: {
            "content-type": "application/json",
            origin: "https://app.vendaja.ao",
          },
          body: { identifier: adminEmail, password: adminPassword },
        });
        assert.equal(crossSiteLogin.status, 200);
        assert.equal(crossSiteLogin.headers["access-control-allow-origin"], "https://app.vendaja.ao");
        assert.equal(crossSiteLogin.headers["access-control-allow-credentials"], "true");
        assert.notEqual(crossSiteLogin.headers["access-control-allow-origin"], "*");

        const crossSiteCookies = getSetCookies(crossSiteLogin.headers).join("; ");
        assert.ok(/SameSite=None/i.test(crossSiteCookies), "Implantação cross-site configurada deve emitir SameSite=None");
        assert.ok(crossSiteCookies.includes("Secure"), "SameSite=None deve obrigatoriamente incluir Secure");
        assert.ok(crossSiteCookies.includes("HttpOnly"));
      } finally {
        if (prevSameSite === undefined) delete process.env.COOKIE_SAME_SITE;
        else process.env.COOKIE_SAME_SITE = prevSameSite;
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNodeEnv;
        if (prevCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
        else process.env.CORS_ORIGIN = prevCorsOrigin;
      }
    });
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    process.env.DATABASE_URL = originalDatabaseUrl;
    try {
      execPsql(
        baseDb,
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${tempDbName}' AND pid <> pg_backend_pid();`
      );
      execPsql(baseDb, `DROP DATABASE IF EXISTS "${tempDbName}";`);
    } catch (cleanupErr) {
      console.warn("[auth-bootstrap.integration] temp DB cleanup notice:", cleanupErr);
    }
  }
});
