import type { PeripheralType } from "../types";

interface Props {
  isOpen: boolean;
  type: PeripheralType;
  onConfirm: () => void;
  onCancel: () => void;
  rationale: string;
}

export function PermissionModal({ isOpen, type, onConfirm, onCancel, rationale }: Props) {
  if (!isOpen) return null;

  const titles: Record<PeripheralType, { icon: string; title: string }> = {
    camera: { icon: "📷", title: "Permissão de Câmara Requerida" },
    bluetooth: { icon: "📶", title: "Permissão Bluetooth Requerida" },
    hid: { icon: "⌨️", title: "Leitor de Código de Barras HID" },
    printer: { icon: "🖨️", title: "Impressora Térmica" },
    scale: { icon: "⚖️", title: "Balança de Check-out" },
    tpa: { icon: "💳", title: "Terminal TPA Multicaixa" },
    biometrics: { icon: "👆", title: "Autenticação Biométrica" },
  };

  const meta = titles[type] || { icon: "⚙️", title: "Permissão de Dispositivo" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(4px)",
        zIndex: 550,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "360px",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "16px",
          padding: "20px",
          color: "#f8fafc",
          textAlign: "center",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "8px" }}>{meta.icon}</div>
        <h3 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 8px 0" }}>{meta.title}</h3>
        <p style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: 1.5, margin: "0 0 20px 0" }}>
          {rationale}
        </p>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              height: "44px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "10px",
              color: "#cbd5e1",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Agora Não
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              height: "44px",
              background: "#0284c7",
              border: "none",
              borderRadius: "10px",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Autorizar
          </button>
        </div>
      </div>
    </div>
  );
}
