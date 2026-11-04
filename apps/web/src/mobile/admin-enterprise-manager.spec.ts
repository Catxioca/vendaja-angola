import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AdminEnterpriseManager } from "./admin-enterprise-manager.js";

describe("AdminEnterpriseManager (Fase 5 - Mobile ERP)", () => {
  let manager: AdminEnterpriseManager;

  beforeEach(() => {
    manager = AdminEnterpriseManager.getInstance();
  });

  it("1. Gestão de utilizadores autorizada para ADMIN e bloqueada para perfis comuns", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("/api/v1/auth/users")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "usr-1",
              username: "admin.luanda",
              email: "admin@empresa.ao",
              displayName: "Administrador Central",
              role: "ROLE_ADMIN",
              createdAt: "2026-10-29T00:00:00Z",
            },
            {
              id: "usr-2",
              username: "operador.caixa",
              email: "caixa1@empresa.ao",
              displayName: "Operador de Caixa",
              role: "OPERATOR",
              createdAt: "2026-10-29T00:00:00Z",
            },
          ],
        };
      }
      return originalFetch(url);
    };

    try {
      // 1.1 Administrador tem acesso
      const users = await manager.getUsers(
        "http://localhost:4000",
        "mock-token",
        "empresa-1",
        "sede",
        "ROLE_ADMIN"
      );
      assert.equal(users.length, 2);
      assert.equal(users[0]!.username, "admin.luanda");

      // 1.2 Operador comum é bloqueado
      await assert.rejects(
        async () => {
          await manager.getUsers(
            "http://localhost:4000",
            "mock-token",
            "empresa-1",
            "sede",
            "OPERATOR"
          );
        },
        /admin_permission_required/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("2. Consulta de audit logs isolada por tenant e restrita a ADMIN", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      if (url.includes("/api/v1/platform/audit-logs")) {
        assert.equal(opts.headers["x-company-id"], "empresa-1");
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "log-1",
                action: "SALE_CREATED",
                entity: "SALE",
                entityId: "sale-101",
                companyId: "empresa-1",
                createdAt: "2026-10-29T10:00:00Z",
              },
            ],
          }),
        };
      }
      return originalFetch(url, opts);
    };

    try {
      const logs = await manager.getAuditLogs(
        "http://localhost:4000",
        "mock-token",
        "empresa-1",
        "sede",
        "ADMIN",
        10
      );
      assert.equal(logs.length, 1);
      assert.equal(logs[0]!.action, "SALE_CREATED");
      assert.equal(logs[0]!.companyId, "empresa-1");

      // Bloqueio para perfil não administrador
      await assert.rejects(
        async () => {
          await manager.getAuditLogs(
            "http://localhost:4000",
            "mock-token",
            "empresa-1",
            "sede",
            "OPERATOR",
            10
          );
        },
        /audit_permission_denied/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. Headquarters Cockpit bloqueia tentativa de consolidação cross-tenant", async () => {
    // Tentativa de consolidar lojas de empresa externa sem autorização
    await assert.rejects(
      async () => {
        await manager.getHeadquartersCockpit(
          "http://localhost:4000",
          "mock-token",
          "empresa-externa-999", // Alvo diferente
          "empresa-1" // Empresa do utilizador
        );
      },
      /headquarters_cross_tenant_forbidden/
    );

    // Consulta para a própria empresa autorizada
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("/api/v1/corporate/cockpit")) {
        return {
          ok: true,
          json: async () => ({
            companyId: "empresa-1",
            stores: [
              { id: "str-1", code: "HQ", name: "Sede Kinaxixi", isHeadquarters: true, active: true },
              { id: "str-2", code: "TALATONA", name: "Filial Talatona", isHeadquarters: false, active: true },
            ],
          }),
        };
      }
      return originalFetch(url);
    };

    try {
      const cockpit = await manager.getHeadquartersCockpit(
        "http://localhost:4000",
        "mock-token",
        "empresa-1",
        "empresa-1"
      );
      assert.equal(cockpit.storesCount, 2);
      assert.equal(cockpit.stores[0]!.name, "Sede Kinaxixi");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("4. IA Copilot exige sessão autenticada e rejeita execução em modo offline", async () => {
    // 4.1 Rejeita offline
    await assert.rejects(
      async () => {
        await manager.queryAiCopilot(
          "http://localhost:4000",
          "mock-token",
          "empresa-1",
          "Como está o stock de cimento?",
          false // isOnline = false
        );
      },
      /ai_offline_unavailable/
    );

    // 4.2 Rejeita sem token / sem sessão
    await assert.rejects(
      async () => {
        await manager.queryAiCopilot(
          "http://localhost:4000",
          null, // token nulo
          "empresa-1",
          "Resumo de faturação",
          true
        );
      },
      /ai_unauthorized/
    );

    // 4.3 Sucesso online com sessão ativa
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("/api/v1/ai/chat")) {
        return {
          ok: true,
          json: async () => ({
            textAnswer: "O stock atual do produto está dentro do nível de segurança.",
          }),
        };
      }
      return originalFetch(url);
    };

    try {
      const res = await manager.queryAiCopilot(
        "http://localhost:4000",
        "mock-token",
        "empresa-1",
        "Estado do stock",
        true
      );
      assert.ok(res.answer.includes("nível de segurança"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("5. Configuração protegida da API esconde tokens e integrações não configuradas são declaradas", () => {
    const config = manager.getProtectedApiConfig(
      "http://localhost:4000",
      "empresa-1",
      "filial-1",
      "POS-01",
      "token-secreto-muito-longo-jwt-1234567890",
      3
    );

    // O objeto NUNCA expõe o token real ou palavras-passe
    assert.equal((config as any).token, undefined);
    assert.equal((config as any).password, undefined);
    assert.equal(config.hasActiveSession, true);
    assert.equal(config.terminalId, "POS-01");
    assert.equal(config.offlineOutboxPendingCount, 3);

    // Integrações externas não configuradas são explícitas
    const integrations = manager.getIntegrationsStatus();
    assert.ok(integrations.length >= 3);
    for (const item of integrations) {
      assert.equal(item.configured, false);
      assert.ok(item.message.length > 5);
    }
  });
});
