import type { MobileTab, TenantContext, UserProfile } from "../types";

interface Props {
  isOpen: boolean;
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
  onClose: () => void;
  user: UserProfile | null;
  tenant: TenantContext | null;
  onOpenOutbox: () => void;
  onOpenTenantSelector: () => void;
  onLogout: () => void;
}

export function TabletSidebar({
  isOpen,
  activeTab,
  onChangeTab,
  onClose,
  user,
  tenant,
  onOpenOutbox,
  onOpenTenantSelector,
  onLogout,
}: Props) {
  if (!isOpen) return null;

  const menuItems: Array<{ id: MobileTab; label: string; icon: string; desc: string }> = [
    { id: "pos", label: "POS de Balcão", icon: "🛒", desc: "Venda rápida e carrinho tátil" },
    { id: "products", label: "Catálogo de Produtos", icon: "🏷️", desc: "Preços, IVA e categorias" },
    { id: "stock", label: "Gestão de Stock", icon: "📦", desc: "Inventário físico e armazéns" },
    { id: "cash", label: "Caixa & Turnos", icon: "💵", desc: "Abertura, fecho e sangrias" },
    { id: "more", label: "Mais Módulos & Definições", icon: "⚙️", desc: "Configurações, clientes e rede" },
  ];

  return (
    <aside
      aria-label="Menu lateral para tablet"
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        width: "300px",
        background: "#0f172a",
        color: "#ffffff",
        borderRight: "1px solid #1e293b",
        zIndex: 150,
        display: "flex",
        flexDirection: "column",
        boxShadow: "4px 0 24px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#38bdf8" }}>
            🇦🇴 VendaJá Tablet POS
          </h2>
          <small style={{ color: "#94a3b8" }}>Terminal Operacional Certificado</small>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar menu lateral"
          style={{
            background: "#1e293b",
            border: "none",
            color: "#f8fafc",
            borderRadius: "6px",
            padding: "8px",
            minWidth: "44px",
            minHeight: "44px",
            cursor: "pointer",
            fontSize: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>

      {/* Cartão de Contexto e Operador */}
      <div style={{ padding: "14px 16px", background: "#1e293b", margin: "12px", borderRadius: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>
          👤 {user?.displayName || "Operador"}
        </div>
        <div style={{ fontSize: "11px", color: "#38bdf8", marginBottom: "8px" }}>
          Papel: {tenant?.role || user?.role || "OPERADOR"}
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenTenantSelector();
          }}
          style={{
            width: "100%",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#cbd5e1",
            padding: "8px",
            fontSize: "12px",
            textAlign: "left",
            cursor: "pointer",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>🏢 {tenant?.companyName || "Empresa"}</span>
          <span>Alterar ❯</span>
        </button>
      </div>

      {/* Lista de Navegação */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}>
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChangeTab(item.id);
                onClose();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                marginBottom: "8px",
                borderRadius: "8px",
                border: "none",
                background: isActive ? "#0284c7" : "transparent",
                color: isActive ? "#ffffff" : "#cbd5e1",
                cursor: "pointer",
                textAlign: "left",
                minHeight: "48px",
              }}
            >
              <span style={{ fontSize: "22px" }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>{item.label}</div>
                <div style={{ fontSize: "11px", opacity: 0.8 }}>{item.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Rodapé do Menu */}
      <div style={{ padding: "12px", borderTop: "1px solid #1e293b", display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenOutbox();
          }}
          style={{
            flex: 1,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            color: "#f8fafc",
            padding: "10px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            minHeight: "44px",
          }}
        >
          📦 Outbox
        </button>
        <button
          type="button"
          onClick={onLogout}
          style={{
            flex: 1,
            background: "#7f1d1d",
            border: "1px solid #991b1b",
            borderRadius: "8px",
            color: "#ffffff",
            padding: "10px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            minHeight: "44px",
          }}
        >
          🚪 Sair
        </button>
      </div>
    </aside>
  );
}
