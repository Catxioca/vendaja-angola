import { sanitizeSyncError } from "@angola/shared";
import type {
  MobileOutboxItem,
  MutationLifecycleState,
  OutboxOperation,
  OutboxStatusSummary,
  TenantContext,
} from "./types";

const OUTBOX_STORAGE_KEY = "vendaja_mobile_outbox_queue_v2";

export interface OutboxEnqueueParams {
  entity: string;
  operation: OutboxOperation;
  payload: unknown;
  companyId: string;
  branchId: string;
  userId: string;
  terminalId: string;
  idempotencyKey?: string;
}

export class MobileOutboxManager {
  private items: MobileOutboxItem[] = [];
  public onCashSessionSynced?: (mutation: MobileOutboxItem, responseData: any) => void;
  public onCashSessionConflict?: (mutation: MobileOutboxItem, sanitizedError: string, status: number) => void;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof localStorage === "undefined") {
      this.items = [];
      return;
    }
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (raw) {
      try {
        this.items = JSON.parse(raw);
      } catch {
        this.items = [];
      }
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(this.items));
  }

  /**
   * Enfileira uma nova mutação com estrita segregação por tenant.
   * Não permite enfileiramento com dados de tenant vazios.
   */
  public enqueue(params: OutboxEnqueueParams): MobileOutboxItem {
    if (!params.companyId || !params.userId || !params.terminalId) {
      throw new Error("Mutações offline requerem companyId, userId e terminalId autorizados.");
    }

    // Se já existir mutação pendente ou em fila com a mesma chave de idempotência para o mesmo tenant,
    // reutiliza a entrada existente sem gerar mutações duplicadas.
    if (params.idempotencyKey) {
      const existing = this.items.find(
        (i) => i.companyId === params.companyId && i.idempotencyKey === params.idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    const id = `mob-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const idempotencyKey =
      params.idempotencyKey || `idem-${params.companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const correlationId = `corr-${params.companyId}-${Date.now()}`;

    const item: MobileOutboxItem = {
      id,
      idempotencyKey,
      correlationId,
      entity: params.entity,
      operation: params.operation,
      companyId: params.companyId,
      branchId: params.branchId,
      userId: params.userId,
      terminalId: params.terminalId,
      payload: params.payload,
      state: "PENDING",
      attempts: 0,
      occurredAt: new Date().toISOString(),
    };

    this.items.push(item);
    this.saveToStorage();
    return item;
  }

  public enqueueMutation(params: {
    entity: string;
    operation: OutboxOperation;
    payload: unknown;
    tenant: TenantContext;
    userId: string;
    idempotencyKey?: string;
    correlationId?: string;
  }): MobileOutboxItem {
    return this.enqueue({
      entity: params.entity,
      operation: params.operation,
      payload: params.payload,
      companyId: params.tenant.companyId,
      branchId: params.tenant.branchId || "default",
      userId: params.userId,
      terminalId: params.tenant.terminalId,
      idempotencyKey: params.idempotencyKey,
    });
  }

  public getStatusSummary(companyId?: string): OutboxStatusSummary {
    return this.getSummary(companyId);
  }

  public async syncPending(
    apiUrl: string,
    token: string,
    tenant: TenantContext
  ): Promise<{ sent: number; failed: number }> {
    const pendingItems = this.items.filter(
      (item) => item.companyId === tenant.companyId && (item.state === "PENDING" || item.state === "RETRYABLE")
    );

    let sent = 0;
    let failed = 0;

    for (const item of pendingItems) {
      this.updateState(item.id, "PROCESSING");
      try {
        let endpoint = `${apiUrl}/api/v1/sync`;
        let requestBody: any;

        if (item.entity === "INVENTORY_COUNT") {
          endpoint = `${apiUrl}/api/v1/stock/inventory-counts`;
          requestBody = item.payload;
        } else if (item.entity === "STOCK_TRANSFER") {
          endpoint = `${apiUrl}/api/v1/stock/transfers`;
          requestBody = item.payload;
        } else if (item.entity === "PURCHASE_RECEIPT") {
          const payload = item.payload as any;
          endpoint = `${apiUrl}/api/v1/purchases/${payload.purchaseId}/receipts`;
          requestBody = {
            reference: payload.reference,
            locationId: payload.locationId,
            lines: payload.lines,
          };
        } else if (item.entity === "CUSTOMER") {
          endpoint = `${apiUrl}/api/v1/customers`;
          requestBody = item.payload;
        } else if (item.entity === "RECEIVABLE_PAYMENT") {
          const payload = item.payload as any;
          endpoint = `${apiUrl}/api/v1/customers/${payload.customerId}/payments`;
          requestBody = payload.payment;
        } else if (item.entity === "CASH_SESSION") {
          const payload = item.payload as any;
          if (item.operation === "OPEN") {
            endpoint = `${apiUrl}/api/v1/fiscal/cash/open`;
            requestBody = payload;
          } else if (item.operation === "ADJUSTMENT" || item.operation === "SANGRIA" || item.operation === "SUPRIMENTO") {
            endpoint = `${apiUrl}/api/v1/fiscal/cash/${payload.sessionId}/adjustment`;
            requestBody = { type: payload.type || item.operation, amountCents: payload.amountCents };
          } else if (item.operation === "CLOSE") {
            endpoint = `${apiUrl}/api/v1/fiscal/cash/${payload.sessionId}/close`;
            requestBody = { closingCents: payload.closingCents };
          }
        } else {
          // Padrão para vendas e sincronização central idempotente
          endpoint = `${apiUrl}/api/v1/sync`;
          requestBody = {
            deviceId: `terminal-${tenant.terminalId}`,
            mutations: [
              {
                id: item.idempotencyKey,
                operation: item.operation,
                entity: item.entity,
                payload: item.payload,
                occurredAt: item.occurredAt,
              },
            ],
          };
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-company-id": tenant.companyId,
            ...(tenant.branchId ? { "x-branch-id": tenant.branchId } : {}),
            "x-idempotency-key": item.idempotencyKey,
            "x-terminal-id": item.terminalId,
          },
          body: JSON.stringify(requestBody),
        });

        if (res.ok) {
          const resData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          this.updateState(item.id, "SENT");
          sent++;
          if (item.entity === "CASH_SESSION" && this.onCashSessionSynced) {
            this.onCashSessionSynced(item, resData);
          }
        } else {
          const errData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          const rawErrStr = `${JSON.stringify(errData)} ${res.status} ${res.statusText || ""}`.toLowerCase();
          const errMsg =
            (typeof errData.message === "string" ? errData.message : "") ||
            (typeof errData.error === "string" ? errData.error : "") ||
            `HTTP ${res.status}`;

          const isAlreadyProcessed =
            rawErrStr.includes("already_processed") ||
            rawErrStr.includes("idempotent") ||
            rawErrStr.includes("duplicate") ||
            rawErrStr.includes("processad") ||
            rawErrStr.includes("duplicad");

          if (isAlreadyProcessed) {
            this.updateState(item.id, "SENT");
            sent++;
          } else if (res.status === 409 || res.status === 422 || res.status === 400) {
            const sanitizedMsg = sanitizeSyncError(errMsg);
            this.updateState(item.id, "REJECTED", sanitizedMsg);
            failed++;
            if (item.entity === "CASH_SESSION" && this.onCashSessionConflict) {
              this.onCashSessionConflict(item, sanitizedMsg, res.status);
            }
          } else {
            this.updateState(item.id, "RETRYABLE", errMsg);
            failed++;
          }
        }
      } catch (err: unknown) {
        this.updateState(item.id, "RETRYABLE", (err as Error).message || "Erro de rede");
        failed++;
      }
    }

    return { sent, failed };
  }

  /**
   * Retorna os itens filtrados pelo contexto do tenant ativo.
   * Impede cruzamento de dados entre empresas.
   */
  public getItemsForTenant(companyId: string, branchId?: string | null): MobileOutboxItem[] {
    return this.items.filter((item) => {
      const matchCompany = item.companyId === companyId;
      if (!matchCompany) return false;
      if (branchId) return item.branchId === branchId;
      return true;
    });
  }

  /**
   * Valida se a transição de estado da mutação é válida.
   */
  public updateState(
    id: string,
    state: MutationLifecycleState,
    error?: unknown
  ): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;

    item.state = state;
    item.attempts += 1;
    item.lastAttemptAt = new Date().toISOString();

    if (error) {
      item.errorSanitized = sanitizeSyncError(error);
    } else if (state === "SENT") {
      item.errorSanitized = null;
    }

    this.saveToStorage();
  }

  /**
   * Tenta reprocessar uma mutação REJECTED, RETRYABLE ou CONFLICT.
   * A mutação NUNCA é apagada na rejeição.
   */
  public retryMutation(id: string, currentTenant: TenantContext): { success: boolean; message: string } {
    const item = this.items.find((i) => i.id === id);
    if (!item) {
      return { success: false, message: "Mutação não encontrada na fila." };
    }

    // Regra mandatória: Não permitir alteração arbitrária de tenant offline
    if (item.companyId !== currentTenant.companyId) {
      return {
        success: false,
        message: `Bloqueado: mutação pertence à empresa ${item.companyId}; contexto ativo é ${currentTenant.companyId}.`,
      };
    }

    item.state = "PENDING";
    item.errorSanitized = null;
    this.saveToStorage();
    return { success: true, message: "Mutação recolocada na fila de sincronização (PENDING)." };
  }

  /**
   * Gera relatório de diagnóstico com erros sanitizados.
   */
  public getSummary(companyId?: string): OutboxStatusSummary {
    const relevant = companyId ? this.items.filter((i) => i.companyId === companyId) : this.items;
    return {
      total: relevant.length,
      pending: relevant.filter((i) => i.state === "PENDING").length,
      processing: relevant.filter((i) => i.state === "PROCESSING").length,
      retryable: relevant.filter((i) => i.state === "RETRYABLE").length,
      rejected: relevant.filter((i) => i.state === "REJECTED").length,
      conflict: relevant.filter((i) => i.state === "CONFLICT").length,
      sent: relevant.filter((i) => i.state === "SENT").length,
    };
  }

  /**
   * Retorna todas as mutações da fila em memória.
   */
  public getItems(): MobileOutboxItem[] {
    return [...this.items];
  }

  /**
   * Obtém a lista completa para o ecrã de diagnóstico.
   */
  public getAllDiagnostics(companyId?: string): MobileOutboxItem[] {
    return companyId ? this.items.filter((i) => i.companyId === companyId) : [...this.items];
  }

  /**
   * Limpa apenas mutações SENT após confirmação explícita de sincronização concluída.
   * Mutações REJECTED ou CONFLICT NUNCA são eliminadas automaticamente.
   */
  public purgeSent(companyId: string): number {
    const beforeCount = this.items.length;
    this.items = this.items.filter((i) => !(i.companyId === companyId && i.state === "SENT"));
    this.saveToStorage();
    return beforeCount - this.items.length;
  }
}
