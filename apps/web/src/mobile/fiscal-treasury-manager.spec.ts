import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FiscalTreasuryManager, AccountingPeriod } from "./fiscal-treasury-manager.js";

describe("FiscalTreasuryManager (Fase 5 - Mobile ERP)", () => {
  let manager: FiscalTreasuryManager;

  beforeEach(() => {
    manager = FiscalTreasuryManager.getInstance();
  });

  it("1. Consulta de configuração fiscal autorizada para ADMIN e bloqueada para outros papéis", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("/api/v1/fiscal/config")) {
        return {
          ok: true,
          json: async () => ({
            configured: true,
            companyName: "Luanda Comércio Geral Lda",
            companyNif: "5412345678",
            invoiceSeries: "A",
            baseCurrency: "AOA",
            timezone: "Africa/Luanda",
            roundingMode: "HALF_UP",
            fiscalArchiveRetentionYears: 10,
            saftSchedule: "0 0 1 * *",
            updatedAt: "2026-10-29T00:00:00Z",
          }),
        };
      }
      return originalFetch(url);
    };

    try {
      // 1.1 Administrador tem acesso
      const config = await manager.getFiscalConfig(
        "http://localhost:4000",
        "mock-token",
        "empresa-1",
        "ADMIN"
      );
      assert.equal(config.configured, true);
      assert.equal(config.invoiceSeries, "A");
      assert.equal(config.companyNif, "5412345678");

      // 1.2 Não-administrador é bloqueado
      await assert.rejects(
        async () => {
          await manager.getFiscalConfig(
            "http://localhost:4000",
            "mock-token",
            "empresa-1",
            "OPERATOR"
          );
        },
        /fiscal_admin_required/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("2. Exportação de SAF-T exige sessão online e permissão autorizada", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      if (url.includes("/api/v1/fiscal/saft")) {
        assert.equal(opts.headers["x-company-id"], "empresa-1");
        return {
          ok: true,
          text: async () => "<AuditFile xmlns=\"urn:OECD:StandardAuditFile-Tax:AO_1.01_01\"><Header></Header></AuditFile>",
        };
      }
      return originalFetch(url, opts);
    };

    try {
      // 2.1 Online e com papel ADMIN -> Sucesso
      const xml = await manager.exportSaftXml(
        "http://localhost:4000",
        "mock-token",
        "empresa-1",
        "2026-10-01",
        "2026-10-31",
        "ADMIN",
        true // isOnline = true
      );
      assert.ok(xml.includes("<AuditFile"));

      // 2.2 Bloqueio de exportação offline
      await assert.rejects(
        async () => {
          await manager.exportSaftXml(
            "http://localhost:4000",
            "mock-token",
            "empresa-1",
            "2026-10-01",
            "2026-10-31",
            "ADMIN",
            false // isOnline = false
          );
        },
        /saft_offline_blocked/
      );

      // 2.3 Bloqueio de operador sem perfil contabilístico ou administrativo
      await assert.rejects(
        async () => {
          await manager.exportSaftXml(
            "http://localhost:4000",
            "mock-token",
            "empresa-1",
            "2026-10-01",
            "2026-10-31",
            "OPERATOR",
            true
          );
        },
        /saft_permission_denied/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. Validação SAF-T reporta dependência explícita de XSD oficial AGT e nota regulatória", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      if (url.includes("/api/v1/fiscal/saft/validation")) {
        return {
          ok: true,
          json: async () => ({
            mode: "configured-xsd",
            caveat: "This is not official AGT legal homologation. Configure the current official XSD to validate against it.",
          }),
        };
      }
      return originalFetch(url);
    };

    try {
      const status = await manager.getSaftValidationStatus("http://localhost:4000");
      assert.equal(status.mode, "configured-xsd");
      assert.ok(status.caveat.includes("not official AGT legal homologation"));
      assert.equal(
        manager.getRegulatoryDisclaimer(),
        "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT."
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("4. Guarda de períodos contabilísticos bloqueia operações em períodos fechados", () => {
    const periods: AccountingPeriod[] = [
      {
        id: "p-1",
        name: "Janeiro 2026",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2026-01-31T23:59:59Z",
        status: "CLOSED",
      },
      {
        id: "p-2",
        name: "Outubro 2026",
        startsAt: "2026-10-01T00:00:00Z",
        endsAt: "2026-10-31T23:59:59Z",
        status: "OPEN",
      },
    ];

    // Operação em período aberto -> Deve passar
    assert.doesNotThrow(() => {
      manager.assertPeriodNotClosed(periods, new Date("2026-10-15T10:00:00Z"));
    });

    // Operação com data em período fechado -> Deve lançar erro
    assert.throws(() => {
      manager.assertPeriodNotClosed(periods, new Date("2026-01-15T10:00:00Z"));
    }, /accounting_period_closed/);
  });

  it("5. Guarda de contabilidade proíbe expressamente lançamentos contabilísticos locais offline", () => {
    // Online -> permitido prosseguir para validação do backend
    assert.doesNotThrow(() => {
      manager.assertNoOfflineAccountingEntry(true);
    });

    // Offline -> lançamento proibido
    assert.throws(() => {
      manager.assertNoOfflineAccountingEntry(false);
    }, /offline_accounting_forbidden/);
  });
});
