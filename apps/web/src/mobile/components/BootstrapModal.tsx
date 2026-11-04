import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  onSuccess: () => void;
}

export function BootstrapModal({ isOpen, onClose, apiUrl, onSuccess }: Props) {
  if (!isOpen) return null;

  const [companyName, setCompanyName] = useState("");
  const [nif, setNif] = useState("");
  const [branchName, setBranchName] = useState("Sede");
  const [username, setUsername] = useState("admin");
  const [displayName, setDisplayName] = useState("Administrador Principal");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("1234");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: {
            legalName: companyName.trim(),
            nif: nif.trim() || undefined,
            branchName: branchName.trim() || "Sede",
            branchCode: "MAIN",
          },
          admin: {
            username: username.trim().toLowerCase(),
            displayName: displayName.trim(),
            email: email.trim().toLowerCase(),
            password,
            pin: pin.trim() || undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `Erro HTTP ${res.status}`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar administrador inicial.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Criação inicial da conta de administrador"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "16px",
          padding: "24px 20px",
          color: "#f8fafc",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#38bdf8" }}>
              🔑 Administrador Inicial
            </h2>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>
              Criação atómica do primeiro administrador do sistema
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

        {error && (
          <div
            role="alert"
            style={{
              background: "#450a0a",
              border: "1px solid #991b1b",
              borderRadius: "8px",
              padding: "10px",
              color: "#fca5a5",
              fontSize: "12px",
              marginBottom: "14px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
              Nome da Empresa: *
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex: Comercial do Futuro Lda"
              style={{
                width: "100%",
                height: "42px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#ffffff",
                padding: "0 10px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
                NIF: (opcional)
              </label>
              <input
                type="text"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                placeholder="Ex: 5000000000"
                style={{
                  width: "100%",
                  height: "42px",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#ffffff",
                  padding: "0 10px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
                Nome da Filial:
              </label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Ex: Sede"
                style={{
                  width: "100%",
                  height: "42px",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#ffffff",
                  padding: "0 10px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
                Username: *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: admin"
                style={{
                  width: "100%",
                  height: "42px",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#ffffff",
                  padding: "0 10px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
                PIN Rápido (4-6 dígitos):
              </label>
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Ex: 1234"
                style={{
                  width: "100%",
                  height: "42px",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#ffffff",
                  padding: "0 10px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
              Nome Completo do Administrador: *
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: Manuel António"
              style={{
                width: "100%",
                height: "42px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#ffffff",
                padding: "0 10px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
              E-mail do Administrador: *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@empresa.co.ao"
              style={{
                width: "100%",
                height: "42px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#ffffff",
                padding: "0 10px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
              Password de Acesso: * (mínimo 8 caracteres)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{
                width: "100%",
                height: "42px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#ffffff",
                padding: "0 10px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              marginTop: "8px",
              height: "48px",
              background: isSubmitting ? "#334155" : "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "14px",
              cursor: isSubmitting ? "wait" : "pointer",
            }}
          >
            {isSubmitting ? "A inicializar..." : "Criar Administrador & Empresa"}
          </button>
        </form>
      </div>
    </div>
  );
}
