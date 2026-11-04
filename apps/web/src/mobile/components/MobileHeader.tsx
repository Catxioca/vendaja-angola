import type { TenantContext, UserProfile } from "../types";

interface Props {
  user: UserProfile | null;
  tenant: TenantContext | null;
  isOnline: boolean;
  pendingOutboxCount: number;
  onOpenOutbox: () => void;
  onOpenTenantSelector: () => void;
  onQuickLock: () => void;
  onLogout: () => void;
  isTablet: boolean;
  onToggleSidebar?: () => void;
}

export function MobileHeader({
  user,
  tenant,
  isOnline,
  pendingOutboxCount,
  onOpenOutbox,
  onOpenTenantSelector,
  onQuickLock,
  onLogout,
  isTablet,
  onToggleSidebar,
}: Props) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: "#0f172a",
        color: "#ffffff",
        borderBottom: "1px solid #1e293b",
        position: "sticky",
        top: 0,
        zIndex: 100,
        minHeight: "56px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {isTablet && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Alternar menu lateral"
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#f8fafc",
              padding: "8px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "16px",
              minWidth: "44px",
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ☰
          </button>
        )}
        <div>
          <button
            type="button"
            onClick={onOpenTenantSelector}
            style={{
              background: "transparent",
              border: "none",
              color: "#38bdf8",
              fontWeight: 700,
              fontSize: "14px",
              textAlign: "left",
              padding: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Clique para alternar filial ou empresa autorizada"
          >
            <span>🏢 {tenant?.companyName || "VendaJá Angola"}</span>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>▼</span>
          </button>
          <div style={{ fontSize: "11px", color: "#94a3b8", display: "flex", gap: "6px" }}>
            <span>{tenant?.branchName || "Sede"}</span>
            <span>·</span>
            <span>Term: #{tenant?.terminalId || "01"}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Indicador de Conexão Online/Offline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "4px 8px",
            borderRadius: "14px",
            fontSize: "11px",
            fontWeight: 600,
            background: isOnline ? "#064e3b" : "#78350f",
            color: isOnline ? "#34d399" : "#fbbf24",
            border: `1px solid ${isOnline ? "#059669" : "#d97706"}`,
          }}
          title={isOnline ? "Ligação ativa com o servidor" : "Modo offline ativo (mutações retidas localmente)"}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: isOnline ? "#34d399" : "#fbbf24",
              display: "inline-block",
            }}
          />
          <span>{isOnline ? "Online" : "Offline"}</span>
        </div>

        {/* Botão de Diagnóstico de Outbox */}
        <button
          type="button"
          onClick={onOpenOutbox}
          aria-label={`Fila outbox com ${pendingOutboxCount} mutações pendentes`}
          style={{
            background: pendingOutboxCount > 0 ? "#b45309" : "#1e293b",
            color: "#ffffff",
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "6px 10px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            minHeight: "44px",
          }}
          title="Fila de sincronização offline e diagnóstico"
        >
          <span>📦</span>
          <span>{pendingOutboxCount}</span>
        </button>

        {/* Botão de Bloqueio Rápido por PIN */}
        <button
          type="button"
          onClick={onQuickLock}
          aria-label="Bloquear terminal com PIN"
          style={{
            background: "#1e293b",
            color: "#cbd5e1",
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "8px 10px",
            cursor: "pointer",
            fontSize: "14px",
            minHeight: "44px",
            minWidth: "44px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Bloqueio rápido de ecrã (desbloqueio por PIN)"
        >
          🔒
        </button>

        {/* Botão Terminar Sessão */}
        <button
          type="button"
          onClick={onLogout}
          aria-label="Terminar sessão"
          style={{
            background: "#450a0a",
            color: "#fca5a5",
            border: "1px solid #991b1b",
            borderRadius: "8px",
            padding: "8px 10px",
            cursor: "pointer",
            fontSize: "14px",
            minHeight: "44px",
            minWidth: "44px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Terminar sessão com segurança"
        >
          🚪
        </button>
      </div>
    </header>
  );
}
