import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobileCashManager, ActiveCashSession } from "./cash-manager";
import { MobileOutboxManager } from "./outbox-manager";
import type { TenantContext } from "./types";

class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe("MobileCashManager", () => {
  let cash: MobileCashManager;

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    cash = new MobileCashManager();
  });

  it("deve gerir a sessão de caixa ativa em memória e localStorage", () => {
    assert.equal(cash.getCurrentSession(), null);

    const mockSession: ActiveCashSession = {
      id: "cash-123",
      openedBy: "user-1",
      openedAt: new Date().toISOString(),
      openingCents: 1000000, // 10.000,00 Kz
      sangriaCents: 0,
      suprimentoCents: 0,
      operatorName: "Operador Teste",
      terminalId: "01",
    };

    cash.setCurrentSession(mockSession);
    assert.equal(cash.getCurrentSession()?.id, "cash-123");

    const reloaded = cash.loadCachedSession();
    assert.equal(reloaded?.id, "cash-123");
    assert.equal(reloaded?.openingCents, 1000000);

    cash.setCurrentSession(null);
    assert.equal(cash.getCurrentSession(), null);
    assert.equal(cash.loadCachedSession(), null);
  });

  it("deve exigir PIN de autorização estritamente com 6 dígitos", async () => {
    await assert.rejects(
      async () => {
        await cash.openSessionOnline("http://localhost:3000", "tok", "comp-1", {
          openingCents: 500000,
          operatorName: "Operador",
          terminalId: "01",
          pin: "1234", // menos de 6 dígitos
        });
      },
      { message: /6 dígitos/i }
    );

    await assert.rejects(
      async () => {
        await cash.openSessionOnline("http://localhost:3000", "tok", "comp-1", {
          openingCents: 500000,
          operatorName: "Operador",
          terminalId: "01",
          pin: "abcdef", // não numérico
        });
      },
      { message: /6 dígitos/i }
    );
  });

  it("deve enviar requisição correta para abertura de turno e tratar sucesso", async () => {
    const fakeCreated: ActiveCashSession = {
      id: "sess-new",
      openedBy: "usr-1",
      openedAt: new Date().toISOString(),
      openingCents: 500000,
      sangriaCents: 0,
      suprimentoCents: 0,
      terminalId: "01",
      operatorName: "Operador",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 201,
        json: async () => fakeCreated,
      } as unknown as Response);

    try {
      const created = await cash.openSessionOnline("http://localhost:3000", "tok", "comp-1", {
        openingCents: 500000,
        operatorName: "Operador",
        terminalId: "01",
        pin: "123456",
      });

      assert.equal(created.id, "sess-new");
      assert.equal(cash.getCurrentSession()?.id, "sess-new");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve tratar erro 409 quando o operador já tem turno aberto", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 409,
        json: async () => ({ error: "cash_already_open" }),
      } as unknown as Response);

    try {
      await assert.rejects(
        async () => {
          await cash.openSessionOnline("http://localhost:3000", "tok", "comp-1", {
            openingCents: 500000,
            operatorName: "Operador",
            terminalId: "01",
            pin: "123456",
          });
        },
        { message: /Já existe um turno de caixa aberto/i }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve validar e processar fecho cego de caixa com apuramento de divergência", async () => {
    const closedSession: ActiveCashSession = {
      id: "sess-closed",
      openedBy: "usr-1",
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      openingCents: 1000000, // 10.000 Kz
      closingCents: 1500000, // Declarou 15.000 Kz
      sangriaCents: 0,
      suprimentoCents: 0,
      summary: {
        salesCount: 5,
        totalCents: 500000,
        cashCents: 500000, // Vendas a dinheiro: 5.000 Kz
        cardCents: 0,
        transferCents: 0,
        expectedCashCents: 1500000, // Esperado: 10.000 + 5.000 = 15.000 Kz
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => closedSession,
      } as unknown as Response);

    try {
      const res = await cash.closeSessionOnline(
        "http://localhost:3000",
        "tok",
        "comp-1",
        "sess-closed",
        1500000
      );

      assert.equal(res.divergenceCents, 0); // Sem divergência
      assert.equal(cash.getCurrentSession(), null); // Sessão limpa
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deve calcular quebra e excedente no fecho cego", async () => {
    const closedSession: ActiveCashSession = {
      id: "sess-div",
      openedBy: "usr-1",
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      openingCents: 1000000,
      closingCents: 1200000, // Declarou 12.000 Kz
      sangriaCents: 0,
      suprimentoCents: 0,
      summary: {
        salesCount: 5,
        totalCents: 500000,
        cashCents: 500000,
        cardCents: 0,
        transferCents: 0,
        expectedCashCents: 1500000, // Esperado 15.000 Kz
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => closedSession,
      } as unknown as Response);

    try {
      const res = await cash.closeSessionOnline(
        "http://localhost:3000",
        "tok",
        "comp-1",
        "sess-div",
        1200000
      );

      assert.equal(res.divergenceCents, -300000); // Quebra de 3.000 Kz
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  const mockTenant: TenantContext = {
    companyId: "comp-ao-1",
    branchId: "branch-luanda",
    companyName: "Loja Luanda Lda",
    terminalId: "POS-01",
    role: "OPERATOR",
    membershipId: "mem-1",
    modules: ["POS", "STOCK", "CASH"],
  };

  it("abertura offline pendente: enfileira na outbox, marca como pendente de validação central e não confirma sessão offline", () => {
    const outbox = new MobileOutboxManager();
    const action = cash.openSessionOffline(
      outbox,
      mockTenant,
      {
        openingCents: 500000,
        operatorName: "Operador Móvel",
        operatorNif: "5412345678",
        terminalId: "POS-01",
        pin: "123456",
      },
      "user-op-1"
    );

    assert.equal(action.status, "PENDING_CENTRAL_VALIDATION");
    assert.equal(action.notice, "Pendente de validação central");
    assert.equal(action.type, "OPEN");
    assert.equal(action.openingCents, 500000);
    assert.ok(action.outboxItemId);

    // O turno NÃO é considerado oficialmente aberto
    assert.equal(cash.getCurrentSession(), null);

    // Verifica que a mutação está na outbox com estado PENDING
    const items = outbox.getItems();
    assert.equal(items.length, 1);
    assert.equal(items[0]?.entity, "CASH_SESSION");
    assert.equal(items[0]?.operation, "OPEN");
    assert.equal(items[0]?.state, "PENDING");
    assert.equal(items[0]?.companyId, "comp-ao-1");
  });

  it("fecho offline pendente: enfileira na outbox, não calcula divergência definitiva nem reconcilia caixa", () => {
    const outbox = new MobileOutboxManager();
    const action = cash.closeSessionOffline(
      outbox,
      mockTenant,
      "session-prev-1",
      1500000, // 15.000 Kz contados
      "user-op-1"
    );

    assert.equal(action.status, "PENDING_CENTRAL_VALIDATION");
    assert.equal(action.notice, "Pendente de validação central");
    assert.equal(action.type, "CLOSE");
    assert.equal(action.closingCents, 1500000);
    assert.equal(cash.getCurrentSession(), null);

    // Verifica mutação na outbox
    const items = outbox.getItems();
    assert.equal(items.length, 1);
    assert.equal(items[0]?.entity, "CASH_SESSION");
    assert.equal(items[0]?.operation, "CLOSE");
    assert.equal(items[0]?.state, "PENDING");
  });

  it("movimento de sangria/suprimento offline pendente: enfileira na outbox com aviso de validação central", () => {
    const outbox = new MobileOutboxManager();
    const action = cash.recordAdjustmentOffline(
      outbox,
      mockTenant,
      "session-prev-1",
      "SANGRIA",
      200000,
      "user-op-1"
    );

    assert.equal(action.status, "PENDING_CENTRAL_VALIDATION");
    assert.equal(action.notice, "Pendente de validação central");
    assert.equal(action.type, "SANGRIA");
    assert.equal(action.amountCents, 200000);

    const items = outbox.getItems();
    assert.equal(items.length, 1);
    assert.equal(items[0]?.operation, "ADJUSTMENT");
    assert.equal(items[0]?.state, "PENDING");
  });

  it("rejeição de abertura/fecho após sincronização: retém mutação na outbox e apresenta diagnóstico sanitizado", async () => {
    const outbox = new MobileOutboxManager();
    const action = cash.openSessionOffline(
      outbox,
      mockTenant,
      {
        openingCents: 500000,
        operatorName: "Operador Móvel",
        terminalId: "POS-01",
        pin: "123456",
      },
      "user-op-1"
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 400,
        json: async () => ({ message: "PIN inválido ou terminal não autorizado" }),
      } as unknown as Response);

    let conflictReported = false;
    outbox.onCashSessionConflict = (mut, err) => {
      conflictReported = true;
      cash.setPendingActionRejected(mut, err);
    };

    try {
      await outbox.syncPending("http://localhost:3000", "tok", mockTenant);

      // Mutação DEVE permanecer retida na outbox com estado REJECTED (nunca descartada silenciosamente)
      const items = outbox.getItems();
      assert.equal(items.length, 1);
      assert.equal(items[0]?.state, "REJECTED");
      assert.ok(conflictReported);

      // Estado do cashManager reflete REJECTED com diagnóstico sanitizado
      const pending = cash.getPendingAction();
      assert.equal(pending?.status, "REJECTED");
      assert.match(pending?.errorDiagnostic || "", /PIN inválido/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("conflito de turno (cash_already_open): retém mutação na outbox e atualiza diagnóstico de conflito", async () => {
    const outbox = new MobileOutboxManager();
    cash.openSessionOffline(
      outbox,
      mockTenant,
      {
        openingCents: 500000,
        operatorName: "Operador Móvel",
        terminalId: "POS-01",
        pin: "123456",
      },
      "user-op-1"
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 409,
        json: async () => ({ error: "cash_already_open", message: "Turno já aberto" }),
      } as unknown as Response);

    let conflictReported = false;
    outbox.onCashSessionConflict = (mut, err) => {
      conflictReported = true;
      cash.setPendingActionConflict(mut, err);
    };

    try {
      await outbox.syncPending("http://localhost:3000", "tok", mockTenant);

      // Mutação permanece na outbox
      const items = outbox.getItems();
      assert.equal(items.length, 1);
      assert.equal(items[0]?.state, "REJECTED");
      assert.ok(conflictReported);

      // Pending action com estado CONFLICT
      const pending = cash.getPendingAction();
      assert.equal(pending?.status, "CONFLICT");
      assert.match(pending?.errorDiagnostic || "", /Turno já aberto|cash_already_open/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sincronização bem-sucedida atualiza o estado oficial com a resposta do servidor", async () => {
    const outbox = new MobileOutboxManager();
    cash.openSessionOffline(
      outbox,
      mockTenant,
      {
        openingCents: 500000,
        operatorName: "Operador",
        terminalId: "POS-01",
        pin: "123456",
      },
      "user-op-1"
    );

    const serverSession: ActiveCashSession = {
      id: "server-cash-888",
      openedBy: "user-op-1",
      openedAt: new Date().toISOString(),
      openingCents: 500000,
      sangriaCents: 0,
      suprimentoCents: 0,
      operatorName: "Operador",
      terminalId: "POS-01",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 201,
        json: async () => serverSession,
      } as unknown as Response);

    outbox.onCashSessionSynced = (mut, res) => {
      if (mut.operation === "OPEN") {
        cash.applyServerSession(res);
      }
    };

    try {
      await outbox.syncPending("http://localhost:3000", "tok", mockTenant);

      // Outbox item completado com sucesso
      const items = outbox.getItems();
      assert.equal(items.length, 1);
      assert.equal(items[0]?.state, "SENT");

      // Sessão agora é oficialmente confirmada e pendingAction é limpo
      assert.equal(cash.getCurrentSession()?.id, "server-cash-888");
      assert.equal(cash.getPendingAction(), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  describe("Regra de Segurança de Venda CASH Offline", () => {
    const baseContext = {
      companyId: mockTenant.companyId,
      branchId: mockTenant.branchId,
      terminalId: mockTenant.terminalId,
      userId: "user-op-1",
    };

    const confirmedSession: ActiveCashSession = {
      id: "sess-server-validated",
      openedBy: "user-op-1",
      openedAt: new Date().toISOString(),
      openingCents: 500000,
      sangriaCents: 0,
      suprimentoCents: 0,
      operatorName: "Operador 1",
      terminalId: mockTenant.terminalId,
      companyId: mockTenant.companyId,
      branchId: mockTenant.branchId,
      isServerConfirmed: true,
      status: "OPEN",
    };

    const EXPECTED_BLOCKED_MSG =
      "Venda em numerário indisponível offline: é necessária uma sessão de caixa previamente confirmada pelo servidor.";

    it("1. venda CASH offline com sessão previamente confirmada pelo servidor (autorizada)", () => {
      cash.applyServerSession(confirmedSession);

      const check = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(check.allowed, true);
      assert.equal(check.reason, undefined);
    });

    it("2. venda CASH offline sem sessão (bloqueada com mensagem exata)", () => {
      cash.setCurrentSession(null);

      const check = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(check.allowed, false);
      assert.equal(check.reason, EXPECTED_BLOCKED_MSG);
    });

    it("3. venda CASH offline com sessão pendente (bloqueada com mensagem exata)", () => {
      const outbox = new MobileOutboxManager();
      cash.openSessionOffline(
        outbox,
        mockTenant,
        {
          openingCents: 500000,
          operatorName: "Operador 1",
          terminalId: mockTenant.terminalId,
          pin: "123456",
        },
        "user-op-1"
      );

      // Sessão é intenção PENDING, não confirmada pelo backend
      const check = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(check.allowed, false);
      assert.equal(check.reason, EXPECTED_BLOCKED_MSG);

      // Testar também sessão existente mas com status PENDING_CENTRAL_VALIDATION
      cash.setCurrentSession({
        ...confirmedSession,
        status: "PENDING_CENTRAL_VALIDATION",
        isServerConfirmed: false,
      });
      const check2 = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(check2.allowed, false);
      assert.equal(check2.reason, EXPECTED_BLOCKED_MSG);
    });

    it("4. sessão de outro terminal, tenant ou utilizador (bloqueada)", () => {
      // Outro terminal
      cash.applyServerSession({
        ...confirmedSession,
        terminalId: "OTHER-TERM-99",
      });
      const checkTerminal = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(checkTerminal.allowed, false);
      assert.equal(checkTerminal.reason, EXPECTED_BLOCKED_MSG);

      // Outro utilizador
      cash.applyServerSession({
        ...confirmedSession,
        openedBy: "another-user-999",
      });
      const checkUser = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(checkUser.allowed, false);
      assert.equal(checkUser.reason, EXPECTED_BLOCKED_MSG);

      // Outro tenant / empresa
      cash.applyServerSession({
        ...confirmedSession,
        companyId: "another-company-xyz",
      });
      const checkCompany = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(checkCompany.allowed, false);
      assert.equal(checkCompany.reason, EXPECTED_BLOCKED_MSG);
    });

    it("5. sessão encerrada (bloqueada)", () => {
      // Encerramento prévio no servidor
      cash.applyServerSession({
        ...confirmedSession,
        closedAt: new Date().toISOString(),
      });
      const checkClosed = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(checkClosed.allowed, false);
      assert.equal(checkClosed.reason, EXPECTED_BLOCKED_MSG);

      // Encerramento offline pendente (closeSessionOffline)
      cash.applyServerSession(confirmedSession);
      const outbox = new MobileOutboxManager();
      cash.closeSessionOffline(outbox, mockTenant, confirmedSession.id, 500000, "user-op-1");
      const checkPendingClose = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(checkPendingClose.allowed, false);
      assert.equal(checkPendingClose.reason, EXPECTED_BLOCKED_MSG);
    });

    it("6. sessão rejeitada ou em conflito (bloqueada)", () => {
      // Rejeição
      cash.applyServerSession(confirmedSession);
      cash.setPendingActionRejected("Operação rejeitada por concorrência");
      const checkRejected = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(checkRejected.allowed, false);
      assert.equal(checkRejected.reason, EXPECTED_BLOCKED_MSG);

      // Conflito
      cash.applyServerSession(confirmedSession);
      cash.setPendingActionConflict("Turno já fechado no servidor central");
      const checkConflict = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(checkConflict.allowed, false);
      assert.equal(checkConflict.reason, EXPECTED_BLOCKED_MSG);
    });

    it("7. recuperação após confirmação central (autorizada após sync com servidor)", () => {
      // Estado inicial com rejeição/bloqueio
      cash.applyServerSession(confirmedSession);
      cash.setPendingActionRejected("Turno em estado inconsistente");
      assert.equal(cash.canCreateOfflineCashSale(baseContext).allowed, false);

      // Backend confirma nova sessão oficial
      const freshServerSession: ActiveCashSession = {
        id: "server-session-recovered-101",
        openedBy: "user-op-1",
        openedAt: new Date().toISOString(),
        openingCents: 1000000,
        sangriaCents: 0,
        suprimentoCents: 0,
        operatorName: "Operador 1",
        terminalId: mockTenant.terminalId,
        companyId: mockTenant.companyId,
        branchId: mockTenant.branchId,
        isServerConfirmed: true,
        status: "OPEN",
      };

      cash.applyServerSession(freshServerSession);

      // Após confirmação central, venda CASH offline é liberada
      const checkRecovered = cash.canCreateOfflineCashSale(baseContext);
      assert.equal(checkRecovered.allowed, true);
      assert.equal(checkRecovered.reason, undefined);
      assert.equal(cash.getCurrentSession()?.id, "server-session-recovered-101");
      assert.equal(cash.getPendingAction(), null);
    });
  });
});
