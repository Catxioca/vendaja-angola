import { useState } from "react";
import type { MobileOutboxItem, OutboxStatusSummary, TenantContext } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: MobileOutboxItem[];
  summary: OutboxStatusSummary;
  tenant: TenantContext | null;
  onRetryMutation: (id: string) => { success: boolean; message: string };
  onSyncNow: () => Promise<void>;
  isSyncing: boolean;
}

export function OutboxDiagnosticsModal({
  isOpen,
  onClose,
  items,
  summary,
  tenant,
  onRetryMutation,
  onSyncNow,
  isSyncing,
}: Props) {
  if (!isOpen) return null;

  const [filterState, setFilterState] = useState<string>("ALL");
  const [feedback, setFeedback] = useState<string>("");

  const filteredItems = items.filter((item) => {
    if (filterState === "ALL") return true;
    return item.state === filterState;
  });

  const handleRetry = (id: string) => {
    const res = onRetryMutation(id);
    setFeedback(res.message);
    setTimeout(() => setFeedback(""), 4000);
  };

  const stateColors: Record<string, { bg: string; text: string }> = {
    PENDING: { bg: "#78350f", text: "#fde68a" },
    PROCESSING: { bg: "#1e3a8a", text: "#93c5fd" },
    SENT: { bg: "#064e3b", text: "#6ee7b7" },
    RETRYABLE: { bg: "#854d0e", text: "#fef08a" },
    REJECTED: { bg: "#7f1d1d", text: "#fca5a5" },
    CONFLICT: { bg: "#581c87", text: "#d8b4fe" },
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Diagnóstico da fila outbox de sincronização offline"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 450,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "16px",
          padding: "20px",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
              📦 Fila Outbox Offline (Segregação Multi-tenant)
            </h2>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>
              Empresa: {tenant?.companyName || "N/A"} · Terminal: #{tenant?.terminalId || "01"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "18px",
              cursor: "pointer",
              padding: "4px",
              minHeight: "44px",
              minWidth: "44px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Resumo de Estados */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "6px",
            marginBottom: "12px",
            textAlign: "center",
          }}
        >
          <div style={{ background: "#1e293b", padding: "6px 2px", borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fde68a" }}>{summary.pending}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>PENDING</div>
          </div>
          <div style={{ background: "#1e293b", padding: "6px 2px", borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#93c5fd" }}>{summary.processing}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>PROCES.</div>
          </div>
          <div style={{ background: "#1e293b", padding: "6px 2px", borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fef08a" }}>{summary.retryable}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>RETRY</div>
          </div>
          <div style={{ background: "#1e293b", padding: "6px 2px", borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fca5a5" }}>{summary.rejected}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>REJECT</div>
          </div>
          <div style={{ background: "#1e293b", padding: "6px 2px", borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#d8b4fe" }}>{summary.conflict}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>CONFLIT</div>
          </div>
          <div style={{ background: "#1e293b", padding: "6px 2px", borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#6ee7b7" }}>{summary.sent}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>SENT</div>
          </div>
        </div>

        {/* Barra de Filtro e Sincronização Forçada */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            style={{
              flex: 1,
              height: "40px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#ffffff",
              padding: "0 10px",
              fontSize: "12px",
            }}
          >
            <option value="ALL">Todas as Mutações ({items.length})</option>
            <option value="PENDING">Apenas Pendentes ({summary.pending})</option>
            <option value="REJECTED">Apenas Rejeitadas ({summary.rejected})</option>
            <option value="CONFLICT">Apenas Conflitos ({summary.conflict})</option>
            <option value="SENT">Apenas Concluídas ({summary.sent})</option>
          </select>

          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            style={{
              height: "40px",
              padding: "0 16px",
              background: isSyncing ? "#334155" : "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "12px",
              cursor: isSyncing ? "wait" : "pointer",
            }}
          >
            {isSyncing ? "A sincronizar..." : "🔄 Sincronizar Agora"}
          </button>
        </div>

        {feedback && (
          <div
            style={{
              padding: "8px 12px",
              background: "#082f49",
              border: "1px solid #0284c7",
              borderRadius: "6px",
              color: "#7dd3fc",
              fontSize: "12px",
              marginBottom: "10px",
            }}
          >
            {feedback}
          </div>
        )}

        {/* Lista de Mutações */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: "180px" }}>
          {filteredItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#64748b", fontSize: "13px" }}>
              Nenhuma mutação encontrada com o filtro selecionado.
            </div>
          ) : (
            filteredItems.map((item) => {
              const colors = stateColors[item.state] || { bg: "#1e293b", text: "#ffffff" };
              return (
                <div
                  key={item.id}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: colors.bg,
                          color: colors.text,
                        }}
                      >
                        {item.state}
                      </span>
                      <strong style={{ fontSize: "12px", color: "#f8fafc" }}>
                        {item.entity} ({item.operation})
                      </strong>
                    </div>
                    <span style={{ fontSize: "10px", color: "#64748b" }}>
                      {new Date(item.occurredAt).toLocaleTimeString("pt-AO")}
                    </span>
                  </div>

                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                    ID: {item.id} · Tentativas: {item.attempts}
                  </div>

                  {item.errorSanitized && (
                    <div
                      style={{
                        marginTop: "6px",
                        padding: "6px 8px",
                        background: "#450a0a",
                        border: "1px solid #7f1d1d",
                        borderRadius: "4px",
                        fontSize: "11px",
                        color: "#fca5a5",
                        wordBreak: "break-word",
                      }}
                    >
                      ⚠️ Erro sanitizado: {item.errorSanitized}
                    </div>
                  )}

                  {(item.state === "REJECTED" || item.state === "CONFLICT" || item.state === "RETRYABLE") && (
                    <div style={{ marginTop: "8px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleRetry(item.id)}
                        style={{
                          background: "#0284c7",
                          border: "none",
                          borderRadius: "4px",
                          color: "#ffffff",
                          padding: "4px 10px",
                          fontSize: "11px",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        🔁 Reprocessar Mutação
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1e293b", fontSize: "11px", color: "#64748b" }}>
          * Em conformidade com as regras de auditoria, mutações rejeitadas não são apagadas automaticamente.
        </div>
      </div>
    </div>
  );
}
