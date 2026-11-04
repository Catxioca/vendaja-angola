import type { TenantContext } from "./types";
import type { MobileOutboxManager } from "./outbox-manager";

export interface CashSessionSummary {
  salesCount: number;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  expectedCashCents: number;
}

export interface ActiveCashSession {
  id: string;
  openedBy: string;
  openedAt: string;
  closedBy?: string | null;
  closedAt?: string | null;
  openingCents: number;
  closingCents?: number | null;
  sangriaCents: number;
  suprimentoCents: number;
  companyId?: string;
  branchId?: string | null;
  terminalId?: string | null;
  operatorName?: string;
  isOfflineIntent?: boolean;
  isServerConfirmed?: boolean;
  status?: "OPEN" | "CLOSED" | "PENDING_CENTRAL_VALIDATION" | "PENDING_CLOSE" | "CONFLICT" | "REJECTED";
  summary?: CashSessionSummary;
}

export type CashActionType = "OPEN" | "CLOSE" | "SANGRIA" | "SUPRIMENTO";
export type CashActionStatus = "PENDING_CENTRAL_VALIDATION" | "CONFIRMED" | "CONFLICT" | "REJECTED";

export const OFFLINE_CASH_UNAVAILABLE_MESSAGE =
  "Venda em numerário indisponível offline: é necessária uma sessão de caixa previamente confirmada pelo servidor.";

export interface OfflineCashValidationContext {
  companyId: string;
  branchId?: string | null;
  terminalId: string;
  userId: string;
}

export interface OfflineCashValidationResult {
  allowed: boolean;
  reason?: string;
}

export interface PendingCashAction {
  idempotencyKey: string;
  type: CashActionType;
  status: CashActionStatus;
  occurredAt: string;
  terminalId: string;
  operatorName: string;
  operatorNif?: string;
  openingCents?: number;
  closingCents?: number;
  amountCents?: number;
  pin?: string;
  notice: "Pendente de validação central";
  errorMessage?: string;
  errorDiagnostic?: string;
  outboxItemId?: string;
}

export interface CashOpenParams {
  openingCents: number;
  operatorName: string;
  operatorNif?: string;
  operatorPhone?: string;
  terminalId: string;
  pin: string; // 6 dígitos
}

export class MobileCashManager {
  private currentSession: ActiveCashSession | null = null;
  private pendingAction: PendingCashAction | null = null;

  public getCurrentSession(): ActiveCashSession | null {
    return this.currentSession;
  }

  public getPendingAction(): PendingCashAction | null {
    return this.pendingAction;
  }

  public setPendingAction(action: PendingCashAction | null): void {
    this.pendingAction = action;
  }

  public clearPendingAction(): void {
    this.pendingAction = null;
  }

  public hasOpenOrPendingSession(): boolean {
    if (this.currentSession) return true;
    if (this.pendingAction && this.pendingAction.type === "OPEN" && this.pendingAction.status === "PENDING_CENTRAL_VALIDATION") {
      return true;
    }
    return false;
  }

  public setCurrentSession(session: ActiveCashSession | null): void {
    this.currentSession = session;
    if (typeof localStorage !== "undefined") {
      if (session) {
        localStorage.setItem("vendaja_active_cash_session", JSON.stringify(session));
      } else {
        localStorage.removeItem("vendaja_active_cash_session");
      }
    }
  }

  public loadCachedSession(): ActiveCashSession | null {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("vendaja_active_cash_session");
      if (raw) {
        try {
          this.currentSession = JSON.parse(raw);
          return this.currentSession;
        } catch {
          // ignore corrupted session
        }
      }
    }
    return null;
  }

  /**
   * Consulta o turno aberto atualmente no servidor.
   */
  public async fetchCurrentServerSession(
    apiUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<ActiveCashSession | null> {
    const res = await fetch(`${apiUrl}/api/v1/fiscal/cash/current`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Falha ao consultar turno no servidor (HTTP ${res.status}).`);
    }

    const session: ActiveCashSession | null = await res.json();
    if (session) {
      session.isServerConfirmed = true;
      session.status = session.closedAt ? "CLOSED" : "OPEN";
      if (!session.companyId) session.companyId = companyId;
      if (session.branchId === undefined) session.branchId = branchId || null;
    }
    this.setCurrentSession(session);
    return session;
  }

  /**
   * Abre um novo turno de caixa com validação de PIN de supervisor/admin.
   */
  public async openSessionOnline(
    apiUrl: string,
    token: string,
    companyId: string,
    params: CashOpenParams,
    branchId?: string | null
  ): Promise<ActiveCashSession> {
    if (!/^\d{6}$/.test(params.pin)) {
      throw new Error("O PIN de autorização para abertura de caixa deve conter exatamente 6 dígitos.");
    }

    const res = await fetch(`${apiUrl}/api/v1/fiscal/cash/open`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
      body: JSON.stringify({
        openingCents: params.openingCents,
        operatorName: params.operatorName,
        operatorNif: params.operatorNif || "999999999",
        operatorPhone: params.operatorPhone || "+244900000000",
        terminalId: params.terminalId,
        pin: params.pin,
      }),
    });

    if (res.status === 409) {
      throw new Error("Já existe um turno de caixa aberto para este operador. Feche o turno anterior antes de abrir um novo.");
    }

    if (res.status === 403) {
      throw new Error("PIN de supervisor inválido ou não autorizado para abertura de turno.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
    }

    const created: ActiveCashSession = await res.json();
    created.isServerConfirmed = true;
    created.status = "OPEN";
    if (!created.companyId) created.companyId = companyId;
    if (created.branchId === undefined) created.branchId = branchId || null;
    if (!created.terminalId) created.terminalId = params.terminalId;
    this.setCurrentSession(created);
    return created;
  }

  /**
   * Regista sangria (saída de dinheiro) ou reforço/suprimento de caixa.
   */
  public async recordAdjustment(
    apiUrl: string,
    token: string,
    companyId: string,
    sessionId: string,
    type: "SANGRIA" | "SUPRIMENTO",
    amountCents: number,
    branchId?: string | null
  ): Promise<ActiveCashSession> {
    if (amountCents <= 0) {
      throw new Error("O valor da operação deve ser superior a zero.");
    }

    const res = await fetch(`${apiUrl}/api/v1/fiscal/cash/${sessionId}/adjustment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
      body: JSON.stringify({ type, amountCents }),
    });

    if (res.status === 409) {
      throw new Error("O turno de caixa já se encontra encerrado.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
    }

    const updated: ActiveCashSession = await res.json();
    this.setCurrentSession(updated);
    return updated;
  }

  /**
   * Encerra o turno de caixa com fecho cego e cálculo de divergência.
   * Trata concorrência e previne fecho duplo.
   */
  public async closeSessionOnline(
    apiUrl: string,
    token: string,
    companyId: string,
    sessionId: string,
    closingCents: number,
    branchId?: string | null
  ): Promise<{ session: ActiveCashSession; divergenceCents: number }> {
    if (closingCents < 0) {
      throw new Error("O valor físico contado não pode ser negativo.");
    }

    const res = await fetch(`${apiUrl}/api/v1/fiscal/cash/${sessionId}/close`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-company-id": companyId,
        ...(branchId ? { "x-branch-id": branchId } : {}),
      },
      body: JSON.stringify({ closingCents }),
    });

    if (res.status === 409) {
      // Concorrência: outro terminal ou operador já fechou este turno
      this.setCurrentSession(null);
      throw new Error("Turno de caixa já se encontrava encerrado no servidor.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
    }

    const closed: ActiveCashSession = await res.json();
    const expected =
      closed.summary?.expectedCashCents ??
      this.currentSession?.summary?.expectedCashCents ??
      ((closed.openingCents || 0) + (closed.suprimentoCents || 0) - (closed.sangriaCents || 0));
    const divergenceCents = closingCents - expected;

    this.setCurrentSession(null);
    return { session: closed, divergenceCents };
  }

  /**
   * Calcula discrepância de fecho de caixa.
   */
  public calculateCashDiscrepancy(
    expectedCents: number,
    countedCents: number
  ): { discrepancyCents: number; hasDiscrepancy: boolean; type: "EXCESS" | "SHORTAGE" | "EXACT" } {
    const discrepancyCents = countedCents - expectedCents;
    return {
      discrepancyCents,
      hasDiscrepancy: discrepancyCents !== 0,
      type: discrepancyCents > 0 ? "EXCESS" : discrepancyCents < 0 ? "SHORTAGE" : "EXACT",
    };
  }

  /**
   * Regista abertura de turno em modo offline.
   * Não pode ser considerado confirmado nem mostrar turno oficialmente aberto.
   * Guarda exclusivamente como mutação auditável PENDING na Outbox.
   */
  public openSessionOffline(
    outbox: MobileOutboxManager,
    tenant: TenantContext,
    params: CashOpenParams,
    userId: string
  ): PendingCashAction {
    if (!/^\d{6}$/.test(params.pin)) {
      throw new Error("O PIN de autorização para abertura de caixa deve conter exatamente 6 dígitos.");
    }

    const idempotencyKey = `cash-open-${params.terminalId}-${Date.now()}`;
    const payload = {
      openingCents: params.openingCents,
      operatorName: params.operatorName,
      operatorNif: params.operatorNif || "999999999",
      operatorPhone: params.operatorPhone || "+244900000000",
      terminalId: params.terminalId,
      pin: params.pin,
    };

    const item = outbox.enqueueMutation({
      entity: "CASH_SESSION",
      operation: "OPEN",
      payload,
      tenant,
      userId,
      idempotencyKey,
    });

    this.pendingAction = {
      idempotencyKey,
      type: "OPEN",
      status: "PENDING_CENTRAL_VALIDATION",
      occurredAt: new Date().toISOString(),
      terminalId: params.terminalId,
      operatorName: params.operatorName,
      operatorNif: params.operatorNif,
      openingCents: params.openingCents,
      notice: "Pendente de validação central",
      outboxItemId: item.id,
    };

    // Não confirma sessão nem mostra turno oficialmente aberto antes do backend
    this.currentSession = null;
    return this.pendingAction;
  }

  /**
   * Regista sangria ou suprimento em modo offline.
   * Guarda mutação auditável PENDING na outbox e não confirma totais definitivos.
   */
  public recordAdjustmentOffline(
    outbox: MobileOutboxManager,
    tenant: TenantContext,
    sessionId: string,
    type: "SANGRIA" | "SUPRIMENTO",
    amountCents: number,
    userId: string
  ): PendingCashAction {
    if (amountCents <= 0) {
      throw new Error("O valor da operação deve ser superior a zero.");
    }

    const idempotencyKey = `cash-adj-${type.toLowerCase()}-${tenant.terminalId}-${Date.now()}`;
    const payload = {
      sessionId,
      type,
      amountCents,
    };

    const item = outbox.enqueueMutation({
      entity: "CASH_SESSION",
      operation: "ADJUSTMENT",
      payload,
      tenant,
      userId,
      idempotencyKey,
    });

    this.pendingAction = {
      idempotencyKey,
      type,
      status: "PENDING_CENTRAL_VALIDATION",
      occurredAt: new Date().toISOString(),
      terminalId: tenant.terminalId,
      operatorName: userId,
      amountCents,
      notice: "Pendente de validação central",
      outboxItemId: item.id,
    };

    return this.pendingAction;
  }

  /**
   * Regista fecho de caixa em modo offline.
   * Não pode apresentar divergência confirmada, totais definitivos ou caixa reconciliada
   * antes da resposta do backend.
   */
  public closeSessionOffline(
    outbox: MobileOutboxManager,
    tenant: TenantContext,
    sessionId: string,
    closingCents: number,
    userId: string
  ): PendingCashAction {
    if (closingCents < 0) {
      throw new Error("O valor físico contado não pode ser negativo.");
    }

    const idempotencyKey = `cash-close-${tenant.terminalId}-${Date.now()}`;
    const payload = {
      sessionId,
      closingCents,
    };

    const item = outbox.enqueueMutation({
      entity: "CASH_SESSION",
      operation: "CLOSE",
      payload,
      tenant,
      userId,
      idempotencyKey,
    });

    this.pendingAction = {
      idempotencyKey,
      type: "CLOSE",
      status: "PENDING_CENTRAL_VALIDATION",
      occurredAt: new Date().toISOString(),
      terminalId: tenant.terminalId,
      operatorName: userId,
      closingCents,
      notice: "Pendente de validação central",
      outboxItemId: item.id,
    };

    // Não mostra fecho definitivo nem reconciliação até confirmação do backend
    this.currentSession = null;
    return this.pendingAction;
  }

  /**
   * Aplica a sessão confirmada oficialmente pelo servidor após sincronização.
   */
  public applyServerSession(session: ActiveCashSession): void {
    const confirmedSession: ActiveCashSession = {
      ...session,
      isServerConfirmed: true,
      status: session.closedAt ? "CLOSED" : "OPEN",
    };
    this.setCurrentSession(confirmedSession);
    this.pendingAction = null;
  }

  /**
   * Aplica o encerramento confirmado oficialmente pelo servidor após sincronização.
   */
  public applyServerClose(_closedSession?: ActiveCashSession): void {
    this.setCurrentSession(null);
    this.pendingAction = null;
  }

  /**
   * Regista conflito reportado pelo servidor (ex: 409 cash_already_open ou cash_session_closed)
   * mantendo a mutação na outbox e apresentando diagnóstico sanitizado.
   */
  public setPendingActionConflict(
    errorMessageOrMutation: string | { id?: string; idempotencyKey?: string },
    sanitizedError?: string
  ): void {
    const errorMsg =
      typeof errorMessageOrMutation === "string"
        ? errorMessageOrMutation
        : sanitizedError || "Conflito detetado no turno pelo servidor central.";
    const outboxId = typeof errorMessageOrMutation === "object" ? errorMessageOrMutation.id : undefined;

    if (this.currentSession) {
      this.currentSession = {
        ...this.currentSession,
        status: "CONFLICT",
      };
    }

    if (this.pendingAction) {
      this.pendingAction.status = "CONFLICT";
      this.pendingAction.errorMessage = errorMsg;
      this.pendingAction.errorDiagnostic = errorMsg;
      if (outboxId) this.pendingAction.outboxItemId = outboxId;
    } else {
      this.pendingAction = {
        idempotencyKey: (typeof errorMessageOrMutation === "object" && errorMessageOrMutation.idempotencyKey) || `conflict-${Date.now()}`,
        type: "OPEN",
        status: "CONFLICT",
        occurredAt: new Date().toISOString(),
        terminalId: "01",
        operatorName: "Operador",
        notice: "Pendente de validação central",
        errorMessage: errorMsg,
        errorDiagnostic: errorMsg,
        outboxItemId: outboxId,
      };
    }
  }

  /**
   * Regista rejeição reportada pelo servidor (ex: 400 ou 422) mantendo a mutação na outbox.
   */
  public setPendingActionRejected(
    errorMessageOrMutation: string | { id?: string; idempotencyKey?: string },
    sanitizedError?: string
  ): void {
    const errorMsg =
      typeof errorMessageOrMutation === "string"
        ? errorMessageOrMutation
        : sanitizedError || "Operação de caixa rejeitada pelo servidor central.";
    const outboxId = typeof errorMessageOrMutation === "object" ? errorMessageOrMutation.id : undefined;

    if (this.currentSession) {
      this.currentSession = {
        ...this.currentSession,
        status: "REJECTED",
      };
    }

    if (this.pendingAction) {
      this.pendingAction.status = "REJECTED";
      this.pendingAction.errorMessage = errorMsg;
      this.pendingAction.errorDiagnostic = errorMsg;
      if (outboxId) this.pendingAction.outboxItemId = outboxId;
    } else {
      this.pendingAction = {
        idempotencyKey: (typeof errorMessageOrMutation === "object" && errorMessageOrMutation.idempotencyKey) || `rejected-${Date.now()}`,
        type: "OPEN",
        status: "REJECTED",
        occurredAt: new Date().toISOString(),
        terminalId: "01",
        operatorName: "Operador",
        notice: "Pendente de validação central",
        errorMessage: errorMsg,
        errorDiagnostic: errorMsg,
        outboxItemId: outboxId,
      };
    }
  }

  /**
   * Valida se uma venda em numerário (CASH) pode ser criada offline.
   * Regra obrigatória:
   * 1. A sessão de caixa deve ter sido previamente confirmada pelo backend (isServerConfirmed === true).
   * 2. Deve pertencer ao mesmo companyId, branchId, terminalId e utilizador (openedBy).
   * 3. Deve estar ativa no último estado sincronizado (status === "OPEN" e closedAt == null).
   * 4. Não pode estar PENDING_CENTRAL_VALIDATION, PENDING_CLOSE, CONFLICT, REJECTED, ausente ou de outro tenant/terminal/utilizador.
   * 5. Se bloqueado, retorna a mensagem oficial exata:
   *    “Venda em numerário indisponível offline: é necessária uma sessão de caixa previamente confirmada pelo servidor.”
   */
  public canCreateOfflineCashSale(context: OfflineCashValidationContext): OfflineCashValidationResult {
    // Sessão ausente
    if (!this.currentSession) {
      return { allowed: false, reason: OFFLINE_CASH_UNAVAILABLE_MESSAGE };
    }

    // Não confirmada pelo servidor ou intenção meramente offline
    if (!this.currentSession.isServerConfirmed || this.currentSession.isOfflineIntent) {
      return { allowed: false, reason: OFFLINE_CASH_UNAVAILABLE_MESSAGE };
    }

    // Estado não aberto (encerrada, pendente, conflito ou rejeição)
    if (this.currentSession.status !== "OPEN" || Boolean(this.currentSession.closedAt)) {
      return { allowed: false, reason: OFFLINE_CASH_UNAVAILABLE_MESSAGE };
    }

    // Isolamento multiempresa e filial
    if (!this.currentSession.companyId || this.currentSession.companyId !== context.companyId) {
      return { allowed: false, reason: OFFLINE_CASH_UNAVAILABLE_MESSAGE };
    }

    const sessionBranch = this.currentSession.branchId || null;
    const contextBranch = context.branchId || null;
    if (sessionBranch !== contextBranch) {
      return { allowed: false, reason: OFFLINE_CASH_UNAVAILABLE_MESSAGE };
    }

    // Terminal e operador
    if (!this.currentSession.terminalId || this.currentSession.terminalId !== context.terminalId) {
      return { allowed: false, reason: OFFLINE_CASH_UNAVAILABLE_MESSAGE };
    }

    if (!this.currentSession.openedBy || this.currentSession.openedBy !== context.userId) {
      return { allowed: false, reason: OFFLINE_CASH_UNAVAILABLE_MESSAGE };
    }

    // Ações pendentes incompatíveis com sessão confirmada ativa
    if (this.pendingAction) {
      if (
        this.pendingAction.status === "CONFLICT" ||
        this.pendingAction.status === "REJECTED" ||
        this.pendingAction.type === "CLOSE" ||
        (this.pendingAction.type === "OPEN" && this.pendingAction.status === "PENDING_CENTRAL_VALIDATION")
      ) {
        return { allowed: false, reason: OFFLINE_CASH_UNAVAILABLE_MESSAGE };
      }
    }

    return { allowed: true };
  }
}
