import { useState } from "react";
import type { CompanyMembershipOption, TenantContext } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  memberships: CompanyMembershipOption[];
  currentTenant: TenantContext | null;
  onSelectTenant: (membership: CompanyMembershipOption, terminalId: string) => void;
  isLoading: boolean;
}

export function TenantSelectorModal({
  isOpen,
  onClose,
  memberships,
  currentTenant,
  onSelectTenant,
  isLoading,
}: Props) {
  if (!isOpen) return null;

  const [selectedMembershipId, setSelectedMembershipId] = useState(
    currentTenant?.membershipId || (memberships[0]?.id ?? "")
  );
  const [terminalId, setTerminalId] = useState(currentTenant?.terminalId || "01");

  const handleConfirm = () => {
    const chosen = memberships.find((m) => m.id === selectedMembershipId);
    if (chosen) {
      onSelectTenant(chosen, terminalId.trim() || "01");
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Seleção de empresa e filial autorizada"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(4px)",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "16px",
          padding: "20px",
          color: "#f8fafc",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>🏢 Selecionar Empresa / Filial</h2>
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

        <p style={{ color: "#94a3b8", fontSize: "12px", margin: "0 0 14px 0" }}>
          Selecione uma das associações autorizadas pelo servidor para o seu perfil.
        </p>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: "24px", color: "#38bdf8" }}>
            A carregar empresas autorizadas...
          </div>
        ) : memberships.length === 0 ? (
          <div style={{ padding: "16px", background: "#450a0a", borderRadius: "8px", color: "#fca5a5", fontSize: "13px" }}>
            Nenhuma associação a empresa ativa foi encontrada para a sua conta.
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", marginBottom: "16px" }}>
            {memberships.map((m) => {
              const isSelected = selectedMembershipId === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMembershipId(m.id)}
                  style={{
                    padding: "12px 14px",
                    marginBottom: "8px",
                    borderRadius: "10px",
                    border: `2px solid ${isSelected ? "#0284c7" : "#1e293b"}`,
                    background: isSelected ? "#082f49" : "#1e293b",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "14px", color: "#f8fafc" }}>{m.company.legalName}</strong>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "#0369a1",
                        color: "#e0f2fe",
                        fontWeight: 600,
                      }}
                    >
                      {m.role}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                    Filial: {m.branch?.name || "Todas as filiais"} {m.branch?.code ? `(${m.branch.code})` : ""}
                  </div>
                  {m.company.nif && (
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                      NIF: {m.company.nif}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Identificador do Terminal */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
            Identificador do Terminal POS:
          </label>
          <input
            type="text"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            placeholder="Ex: 01, BALCAO-02, TAB-01"
            maxLength={20}
            style={{
              width: "100%",
              height: "44px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#ffffff",
              padding: "0 12px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedMembershipId}
          style={{
            height: "48px",
            background: selectedMembershipId ? "#0284c7" : "#334155",
            color: "#ffffff",
            border: "none",
            borderRadius: "10px",
            fontWeight: 700,
            fontSize: "14px",
            cursor: selectedMembershipId ? "pointer" : "not-allowed",
          }}
        >
          Confirmar Contexto
        </button>
      </div>
    </div>
  );
}
