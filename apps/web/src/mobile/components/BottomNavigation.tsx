import type { MobileTab } from "../types";

interface Props {
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
}

export function BottomNavigation({ activeTab, onChangeTab }: Props) {
  const tabs: Array<{ id: MobileTab; label: string; icon: string }> = [
    { id: "pos", label: "POS", icon: "🛒" },
    { id: "products", label: "Produtos", icon: "🏷️" },
    { id: "stock", label: "Stock", icon: "📦" },
    { id: "cash", label: "Caixa", icon: "💵" },
    { id: "more", label: "Mais", icon: "⚙️" },
  ];

  return (
    <nav
      aria-label="Navegação móvel principal"
      style={{
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        background: "#0f172a",
        borderTop: "1px solid #1e293b",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        height: "64px",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeTab(tab.id)}
            aria-selected={isActive}
            role="tab"
            style={{
              flex: 1,
              height: "100%",
              minHeight: "48px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: isActive ? "#38bdf8" : "#94a3b8",
              cursor: "pointer",
              padding: "4px 0",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "20px", marginBottom: "2px" }}>{tab.icon}</span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: isActive ? 700 : 500,
                letterSpacing: "0.2px",
              }}
            >
              {tab.label}
            </span>
            {isActive && (
              <span
                style={{
                  width: "16px",
                  height: "3px",
                  background: "#38bdf8",
                  borderRadius: "2px",
                  marginTop: "2px",
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
