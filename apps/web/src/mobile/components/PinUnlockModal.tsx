import { useState } from "react";
import type { UserProfile } from "../types";

interface Props {
  user: UserProfile | null;
  onUnlock: (pin: string) => Promise<boolean>;
  onLogout: () => void;
}

export function PinUnlockModal({ user, onUnlock, onLogout }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const next = pin + digit;
      setPin(next);
      setError("");
      if (next.length >= 4) {
        // Tenta auto-verificar ao atingir tamanho mínimo se configurado
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  const handleClear = () => {
    setPin("");
    setError("");
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError("O PIN deve ter pelo menos 4 dígitos numéricos.");
      return;
    }
    setIsVerifying(true);
    setError("");
    try {
      const ok = await onUnlock(pin);
      if (!ok) {
        setError("PIN incorreto. Tente novamente.");
        setPin("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao validar PIN.");
      setPin("");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Desbloqueio de sessão por PIN"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        backdropFilter: "blur(8px)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "340px",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "16px",
          padding: "24px 20px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          textAlign: "center",
          color: "#f8fafc",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "8px" }}>🔒</div>
        <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px 0" }}>Terminal Bloqueado</h2>
        <p style={{ color: "#94a3b8", fontSize: "13px", margin: "0 0 16px 0" }}>
          Sessão ativa de <strong>{user?.displayName || "Operador"}</strong>
        </p>

        {/* Indicadores Visuais de Dígitos */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div
              key={index}
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                border: "2px solid #38bdf8",
                backgroundColor: index < pin.length ? "#38bdf8" : "transparent",
                transition: "all 0.15s ease",
              }}
            />
          ))}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              color: "#f87171",
              fontSize: "12px",
              background: "#450a0a",
              border: "1px solid #991b1b",
              borderRadius: "6px",
              padding: "8px",
              marginBottom: "14px",
            }}
          >
            {error}
          </div>
        )}

        {/* Teclado Numérico Touch */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((key) => {
            const isAction = key === "C" || key === "⌫";
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === "C") handleClear();
                  else if (key === "⌫") handleBackspace();
                  else handleDigit(key);
                }}
                disabled={isVerifying}
                style={{
                  height: "56px",
                  fontSize: isAction ? "16px" : "22px",
                  fontWeight: 600,
                  borderRadius: "12px",
                  border: "1px solid #1e293b",
                  background: isAction ? "#1e293b" : "#334155",
                  color: isAction ? "#cbd5e1" : "#ffffff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "48px",
                  minWidth: "48px",
                }}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Botão de Confirmação */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pin.length < 4 || isVerifying}
          style={{
            width: "100%",
            height: "48px",
            borderRadius: "10px",
            border: "none",
            background: pin.length >= 4 ? "#0284c7" : "#1e293b",
            color: pin.length >= 4 ? "#ffffff" : "#64748b",
            fontWeight: 700,
            fontSize: "14px",
            cursor: pin.length >= 4 ? "pointer" : "not-allowed",
            marginBottom: "12px",
          }}
        >
          {isVerifying ? "A verificar..." : "Desbloquear Terminal"}
        </button>

        <button
          type="button"
          onClick={onLogout}
          style={{
            background: "transparent",
            border: "none",
            color: "#94a3b8",
            fontSize: "12px",
            cursor: "pointer",
            textDecoration: "underline",
            padding: "8px",
          }}
        >
          Esqueceu o PIN? Terminar Sessão
        </button>
      </div>
    </div>
  );
}
