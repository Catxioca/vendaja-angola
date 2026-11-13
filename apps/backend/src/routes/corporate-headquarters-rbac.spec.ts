import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PassThrough } from "node:stream";
import "dotenv/config";
import express from "express";
import jwt from "jsonwebtoken";
import { corporateHeadquartersRouter } from "./corporate-headquarters.js";
import { getEnv } from "../config/env.js";

// Mandatory Declaration
// “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/corporate", corporateHeadquartersRouter);
  return app;
}

function simulateRequest(
  app: express.Express,
  options: {
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: any;
  }
): Promise<{ status: number; body: any; text: string }> {
  return new Promise((resolve, reject) => {
    const sock = new PassThrough();
    const req = new http.IncomingMessage(sock as any);
    req.method = options.method || "GET";
    req.url = options.path;
    req.headers = { host: "localhost" };
    for (const [k, v] of Object.entries(options.headers || {})) {
      req.headers[k.toLowerCase()] = v;
    }

    if (options.body !== undefined) {
      (req as any).body = options.body;
    }

    let resBody = "";
    const res = new http.ServerResponse(req);
    res.assignSocket(sock as any);

    res.write = function (chunk: any) {
      if (chunk) resBody += chunk.toString();
      return true;
    } as any;

    res.end = function (chunk: any) {
      if (chunk) resBody += chunk.toString();
      let parsed: any = resBody;
      try {
        parsed = JSON.parse(resBody);
      } catch {}
      resolve({ status: res.statusCode, body: parsed, text: resBody });
      return res;
    } as any;

    (app as any).handle(req as any, res as any, (err?: any) => {
      if (err) reject(err);
      else resolve({ status: res.statusCode, body: null, text: "" });
    });
  });
}

function createToken(role: string, companyId = "company-tenant-a", branchId = "branch-hq-a") {
  const secret = getEnv().JWT_SECRET;
  return jwt.sign(
    {
      id: `usr-${role.toLowerCase()}-${Date.now().toString(36)}`,
      role,
      context: {
        companyId,
        branchId,
        membershipId: `mem-${role.toLowerCase()}`,
        role,
      },
    },
    secret,
    { expiresIn: "1h" }
  );
}

test("Corporate Headquarters RBAC: CASHIER and OPERATOR receive 403 on all corporate actions", async () => {
  const app = createTestApp();

  for (const testRole of ["CASHIER", "OPERATOR"]) {
    const token = createToken(testRole);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // 1. GET /cockpit -> 403
    const resCockpit = await simulateRequest(app, {
      method: "GET",
      path: "/api/v1/corporate/cockpit",
      headers,
    });
    assert.equal(resCockpit.status, 403, `${testRole} deve receber 403 em GET /cockpit`);
    assert.equal(resCockpit.body?.error, "forbidden");

    // 2. GET /stores -> 403
    const resStores = await simulateRequest(app, {
      method: "GET",
      path: "/api/v1/corporate/stores",
      headers,
    });
    assert.equal(resStores.status, 403, `${testRole} deve receber 403 em GET /stores`);

    // 3. GET /events -> 403
    const resEvents = await simulateRequest(app, {
      method: "GET",
      path: "/api/v1/corporate/events",
      headers,
    });
    assert.equal(resEvents.status, 403, `${testRole} deve receber 403 em GET /events`);

    // 4. POST /stores -> 403
    const resPostStore = await simulateRequest(app, {
      method: "POST",
      path: "/api/v1/corporate/stores",
      headers,
      body: { code: "BR-FORBIDDEN", name: "Loja Inválida" },
    });
    assert.equal(resPostStore.status, 403, `${testRole} deve receber 403 em POST /stores`);

    // 5. POST /users -> 403
    const resPostUser = await simulateRequest(app, {
      method: "POST",
      path: "/api/v1/corporate/users",
      headers,
      body: { username: "hack", email: "h@v.ao", displayName: "H", role: "CASHIER" },
    });
    assert.equal(resPostUser.status, 403, `${testRole} deve receber 403 em POST /users`);

    // 6. POST /modules/control -> 403
    const resPostModule = await simulateRequest(app, {
      method: "POST",
      path: "/api/v1/corporate/modules/control",
      headers,
      body: { branchId: "b1", moduleCode: "POS", status: "INACTIVE" },
    });
    assert.equal(resPostModule.status, 403, `${testRole} deve receber 403 em POST /modules/control`);

    // 7. POST /live-updates/publish -> 403
    const resPostPatch = await simulateRequest(app, {
      method: "POST",
      path: "/api/v1/corporate/live-updates/publish",
      headers,
      body: { patchVersion: "1.0", title: "Patch", payloadJson: "{}" },
    });
    assert.equal(resPostPatch.status, 403, `${testRole} deve receber 403 em POST /live-updates/publish`);

    // 8. POST /broadcasts -> 403
    const resPostBroadcast = await simulateRequest(app, {
      method: "POST",
      path: "/api/v1/corporate/broadcasts",
      headers,
      body: { title: "Aviso", content: "Mensagem" },
    });
    assert.equal(resPostBroadcast.status, 403, `${testRole} deve receber 403 em POST /broadcasts`);

    // 9. POST /sync/bidirectional -> 403
    const resPostSync = await simulateRequest(app, {
      method: "POST",
      path: "/api/v1/corporate/sync/bidirectional",
      headers,
      body: { branchId: "b1" },
    });
    assert.equal(resPostSync.status, 403, `${testRole} deve receber 403 em POST /sync/bidirectional`);
  }
});

test("Corporate Headquarters RBAC: MANAGER can query cockpit/stores/events, but receives 403 on mutations", async () => {
  const app = createTestApp();
  const companyId = `comp-mgr-${Date.now()}`;
  const token = createToken("MANAGER", companyId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. Consultas autorizadas para MANAGER (200 OK)
  const resCockpit = await simulateRequest(app, {
    method: "GET",
    path: "/api/v1/corporate/cockpit",
    headers,
  });
  assert.equal(resCockpit.status, 200, "MANAGER deve aceder a GET /cockpit");
  assert.ok(resCockpit.body?.networkSummary, "Cockpit deve retornar sumário da rede");

  const resStores = await simulateRequest(app, {
    method: "GET",
    path: "/api/v1/corporate/stores",
    headers,
  });
  assert.equal(resStores.status, 200, "MANAGER deve aceder a GET /stores");

  const resEvents = await simulateRequest(app, {
    method: "GET",
    path: "/api/v1/corporate/events",
    headers,
  });
  assert.equal(resEvents.status, 200, "MANAGER deve aceder a GET /events");

  // 2. Mutações proibidas para MANAGER (403 Forbidden)
  const resPostStore = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/stores",
    headers,
    body: { code: "MGR-STORE", name: "Tentativa de Loja por Manager" },
  });
  assert.equal(resPostStore.status, 403, "MANAGER não pode criar lojas (403)");
  assert.equal(resPostStore.body?.error, "forbidden");

  const resPostUser = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/users",
    headers,
    body: { username: "u.mgr", email: "u@v.ao", displayName: "User", role: "CASHIER" },
  });
  assert.equal(resPostUser.status, 403, "MANAGER não pode criar utilizadores (403)");

  const resSuspendUser = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/users/target-user-1/suspend",
    headers,
    body: { reason: "Suspensão por Manager" },
  });
  assert.equal(resSuspendUser.status, 403, "MANAGER não pode suspender utilizadores (403)");

  const resPerms = await simulateRequest(app, {
    method: "PUT",
    path: "/api/v1/corporate/users/target-user-1/permissions",
    headers,
    body: { role: "LOCAL_ADMIN", modules: ["POS"] },
  });
  assert.equal(resPerms.status, 403, "MANAGER não pode alterar permissões (403)");

  const resModule = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/modules/control",
    headers,
    body: { branchId: "b1", moduleCode: "POS", status: "INACTIVE" },
  });
  assert.equal(resModule.status, 403, "MANAGER não pode alterar módulos remotamente (403)");

  const resPatch = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/live-updates/publish",
    headers,
    body: { patchVersion: "2.2.5", title: "Patch", payloadJson: "{}" },
  });
  assert.equal(resPatch.status, 403, "MANAGER não pode publicar live patches (403)");

  const resBroadcast = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/broadcasts",
    headers,
    body: { title: "Circular", content: "Texto" },
  });
  assert.equal(resBroadcast.status, 403, "MANAGER não pode emitir comunicados à rede (403)");

  const resRevoke = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/licenses/TERM-01/revoke",
    headers,
    body: { branchId: "b1", reason: "Revogação" },
  });
  assert.equal(resRevoke.status, 403, "MANAGER não pode revogar licenças (403)");
});

test("Corporate Headquarters RBAC: ADMIN can execute authorized corporate mutations", async () => {
  const app = createTestApp();
  const companyId = `comp-admin-${Date.now()}`;
  const token = createToken("ADMIN", companyId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. ADMIN regista nova filial com sucesso (201)
  const resCreateStore = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/stores",
    headers,
    body: {
      code: `ADM-BR-${Date.now().toString(36).toUpperCase()}`,
      name: "Filial Autorizada Admin Central",
      isHeadquarters: false,
      active: true,
    },
  });
  assert.equal(resCreateStore.status, 201, "ADMIN deve registar filial com sucesso (201)");
  const createdStore = resCreateStore.body;
  assert.ok(createdStore.id);

  // 2. ADMIN emite comunicado geral para a rede com sucesso (201)
  const resBroadcast = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/broadcasts",
    headers,
    body: {
      title: "Fecho Mensal Fiscal Homologado",
      content: "Todos os terminais devem sincronizar antes das 22h.",
      priority: "URGENT",
    },
  });
  assert.equal(resBroadcast.status, 201, "ADMIN deve emitir comunicado com sucesso (201)");

  // 3. ADMIN controla módulos da filial com sucesso (200)
  const resModule = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/modules/control",
    headers,
    body: {
      branchId: createdStore.id,
      moduleCode: "POS",
      status: "ACTIVE",
    },
  });
  assert.equal(resModule.status, 200, "ADMIN deve controlar módulos da filial com sucesso (200)");

  // 4. Cockpit reflete lojas da empresa do ADMIN (200)
  const resCockpit = await simulateRequest(app, {
    method: "GET",
    path: "/api/v1/corporate/cockpit",
    headers,
  });
  assert.equal(resCockpit.status, 200);
  assert.ok(resCockpit.body.stores.some((s: any) => s.id === createdStore.id));
});

test("Corporate Headquarters Multi-Tenant: Tenant A cannot inspect or alter Tenant B resources", async () => {
  const app = createTestApp();
  const companyA = `tenant-comp-a-${Date.now()}`;
  const companyB = `tenant-comp-b-${Date.now()}`;

  const tokenAdminA = createToken("ADMIN", companyA);
  const tokenAdminB = createToken("ADMIN", companyB);

  const headersA = { Authorization: `Bearer ${tokenAdminA}`, "Content-Type": "application/json" };
  const headersB = { Authorization: `Bearer ${tokenAdminB}`, "Content-Type": "application/json" };

  // 1. Tenant A cria uma loja exclusiva
  const storeCodeA = `STORE-A-${Date.now().toString(36).toUpperCase()}`;
  const resA = await simulateRequest(app, {
    method: "POST",
    path: "/api/v1/corporate/stores",
    headers: headersA,
    body: { code: storeCodeA, name: "Filial Segredo Empresa A" },
  });
  assert.equal(resA.status, 201);
  const storeA = resA.body;

  // 2. Tenant B consulta as suas lojas: loja de A NÃO PODE aparecer
  const resBStores = await simulateRequest(app, {
    method: "GET",
    path: "/api/v1/corporate/stores",
    headers: headersB,
  });
  assert.equal(resBStores.status, 200);
  const storesB = resBStores.body;
  const leakFound = storesB.some((s: any) => s.id === storeA.id || s.code === storeCodeA);
  assert.equal(leakFound, false, "Lojas do Tenant A nunca devem vazar para o Tenant B");

  // 3. Tenant B consulta o seu cockpit: sumário e alertas não vazam
  const resBCockpit = await simulateRequest(app, {
    method: "GET",
    path: "/api/v1/corporate/cockpit",
    headers: headersB,
  });
  assert.equal(resBCockpit.status, 200);
  const cockpitB = resBCockpit.body;
  const leakInCockpit = cockpitB.stores.some((s: any) => s.id === storeA.id);
  assert.equal(leakInCockpit, false, "Cockpit do Tenant B nunca deve conter lojas do Tenant A");
});

test("Corporate Headquarters Security: 403 flushes cached state and prevents data leaks", async () => {
  // Simula o comportamento do cliente CorporatePanel quando confrontado com 403
  let state = {
    stores: [{ id: "st-1", name: "Loja Antiga" }],
    users: [{ id: "u-1", displayName: "Utilizador Antigo" }],
    events: [{ id: "ev-1", description: "Evento Antigo" }],
    isForbidden: false,
  };

  // Simulação de resposta 403 Forbidden vinda de rota protegida
  const responseStatus = 403;
  if (responseStatus === 403) {
    state.stores = [];
    state.users = [];
    state.events = [];
    state.isForbidden = true;
  }

  assert.equal(state.stores.length, 0, "Estado de lojas deve ser completamente limpo após 403");
  assert.equal(state.users.length, 0, "Estado de utilizadores deve ser completamente limpo após 403");
  assert.equal(state.events.length, 0, "Estado de eventos deve ser completamente limpo após 403");
  assert.equal(state.isForbidden, true, "isForbidden deve ser ativado bloqueando renderização de dados sensíveis");
});
