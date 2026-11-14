import React, { useState, useEffect, type FormEvent } from "react";
import { persistBrowserSession } from "./session.js";

export interface LoginPageProps {
  apiUrl: string;
  onSuccess: () => void;
  onNavigate: (view: string) => void;
}

export function LoginPage({ apiUrl, onSuccess, onNavigate }: LoginPageProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bootstrapAllowed, setBootstrapAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/api/v1/auth/bootstrap/status`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("status_error"))))
      .then((data: { bootstrapAllowed?: boolean }) => {
        if (active) setBootstrapAllowed(data.bootstrapAllowed === true);
      })
      .catch(() => {
        if (active) setBootstrapAllowed(false);
      });
    return () => {
      active = false;
    };
  }, [apiUrl]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Por favor, preencha o identificador e a palavra-passe.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });

      if (response.status === 429) {
        setError("Demasiadas tentativas de início de sessão. Por favor, aguarde alguns minutos antes de tentar novamente.");
        setLoading(false);
        return;
      }

      if (response.status === 423) {
        setError("Esta conta encontra-se temporariamente bloqueada por segurança devido a tentativas consecutivas falhadas.");
        setLoading(false);
        return;
      }

      if (response.status === 401 || response.status === 403) {
        // Tentativa de deteção automática de perfil de portal self-service (cliente/fornecedor/colaborador)
        try {
          const profileCheck = await fetch(`${apiUrl}/api/v1/portals/auth/identify-profile`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identifier: identifier.trim() }),
          });

          if (profileCheck.ok) {
            const p = await profileCheck.json() as { profileType?: string };
            if (p.profileType === "SUPPLIER") {
              setError("Esta conta pertence ao Portal do Fornecedor. A redirecionar...");
              setTimeout(() => onNavigate("portal-fornecedor"), 1200);
              return;
            }
            if (p.profileType === "CUSTOMER") {
              setError("Esta conta pertence ao Portal do Cliente. A redirecionar...");
              setTimeout(() => onNavigate("portal-cliente"), 1200);
              return;
            }
            if (p.profileType === "EMPLOYEE") {
              setError("Esta conta pertence ao Portal do Colaborador. A redirecionar...");
              setTimeout(() => onNavigate("portal-colaborador"), 1200);
              return;
            }
          }
        } catch {
          // prosseguir com mensagem genérica segura
        }

        // Mensagem segura: não revela se o utilizador, empresa ou senha existem
        setError("Credenciais inválidas. Verifique o seu identificador e palavra-passe.");
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setError(`O servidor corporativo não está acessível no momento (HTTP ${response.status}). Tente mais tarde.`);
        setLoading(false);
        return;
      }

      const data = await response.json() as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; username: string; displayName?: string; role: string };
        context?: { companyId: string; branchId: string; companyName?: string; branchName?: string };
      };

      // Persistência mínima de sessão no browser (localStorage NÃO é cofre confidencial;
      // refresh token é emitido preferencialmente em cookie HttpOnly pelo backend)
      persistBrowserSession(data);

      setLoading(false);
      onSuccess();
    } catch {
      setError("Não foi possível contactar o servidor. Verifique a ligação à rede ou configure a URL da API.");
      setLoading(false);
    }
  }

  return (
    <div className="login-card-container" style={{ width: "min(460px, 100%)", margin: "32px auto" }}>
      <div
        className="login-card"
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "36px 32px",
          boxShadow: "0 10px 25px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              borderRadius: "10px",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              fontWeight: 900,
              marginBottom: "12px",
            }}
          >
            V<span>J</span>
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0" }}>
            Aceder ao Mutshima
          </h2>
          <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
            Início de sessão no ERP Web e Gestão Comercial
          </p>
        </div>

        {error && (
          <div
            id="login-error"
            role="alert"
            aria-live="polite"
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "18px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: "16px", lineHeight: 1 }}>⚠️</span>
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

        <form onSubmit={(e) => void handleLogin(e)} noValidate>
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="login-identifier"
              style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}
            >
              Identificador (Email ou Utilizador)
            </label>
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              placeholder="ex: admin ou operador@empresa.ao"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "11px 14px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                fontSize: "14px",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ marginBottom: "22px" }}>
            <label
              htmlFor="login-password"
              style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}
            >
              Palavra-passe ou PIN
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Palavra-passe ou PIN numérico"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "11px 14px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                fontSize: "14px",
                fontFamily: "inherit",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              background: loading ? "#94a3b8" : "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(2, 132, 199, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                A autenticar...
              </>
            ) : (
              "Iniciar Sessão no ERP"
            )}
          </button>
        </form>

        {bootstrapAllowed && (
          <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px dashed #cbd5e1", textAlign: "center" }}>
            <button
              type="button"
              onClick={() => onNavigate("criar-conta")}
              style={{
                background: "#f0fdf4",
                color: "#166534",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                padding: "9px 16px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                width: "100%",
              }}
            >
              🔑 Configuração Inicial (Primeiro Administrador)
            </button>
            <small style={{ display: "block", color: "#64748b", marginTop: "6px", fontSize: "11px" }}>
              Disponível apenas na primeira instalação antes da criação de utilizadores.
            </small>
          </div>
        )}

        <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
          <span style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "8px" }}>
            Acesso Rápido aos Portais Self-Service:
          </span>
          <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onNavigate("portal-cliente")}
              style={{
                background: "#f0f9ff",
                color: "#0284c7",
                border: "1px solid #bae6fd",
                borderRadius: "6px",
                padding: "5px 10px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🏢 Cliente
            </button>
            <button
              type="button"
              onClick={() => onNavigate("portal-fornecedor")}
              style={{
                background: "#ecfdf5",
                color: "#059669",
                border: "1px solid #a7f3d0",
                borderRadius: "6px",
                padding: "5px 10px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🚚 Fornecedor
            </button>
            <button
              type="button"
              onClick={() => onNavigate("portal-colaborador")}
              style={{
                background: "#f5f3ff",
                color: "#7c3aed",
                border: "1px solid #ddd6fe",
                borderRadius: "6px",
                padding: "5px 10px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              👥 Colaborador
            </button>
          </div>
        </div>

        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
            Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
          </p>
        </div>
      </div>
    </div>
  );
}
