import React, { useState, useEffect, type FormEvent } from "react";
import { persistBrowserSession } from "./session.js";

export interface BootstrapPageProps {
  apiUrl: string;
  onSuccess: () => void;
  onNavigate: (view: string) => void;
}

export function BootstrapPage({ apiUrl, onSuccess, onNavigate }: BootstrapPageProps) {
  const [checking, setChecking] = useState(true);
  const [eligible, setEligible] = useState<boolean | null>(null);

  // Form states
  const [form, setForm] = useState({
    legalName: "",
    nif: "",
    branchCode: "MAIN",
    branchName: "Sede",
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    pin: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/api/v1/auth/bootstrap/status`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("status_error"))))
      .then((data: { bootstrapAllowed?: boolean }) => {
        if (!active) return;
        setEligible(data.bootstrapAllowed === true);
      })
      .catch(() => {
        if (!active) return;
        setEligible(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [apiUrl]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.legalName.trim()) {
      setError("O nome da empresa é obrigatório.");
      return;
    }
    if (!form.displayName.trim() || !form.username.trim() || !form.email.trim()) {
      setError("Todos os dados do administrador são obrigatórios.");
      return;
    }
    if (form.password.length < 8 || !/[a-z]/i.test(form.password) || !/\d/.test(form.password)) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres, combinando letras e números.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    if (form.pin && (!/^\d{4,6}$/.test(form.pin) || /^(\d)\1+$/.test(form.pin))) {
      setError("O PIN de autorização rápida deve ter entre 4 e 6 dígitos numéricos sem repetição total.");
      return;
    }

    setSaving(true);

    try {
      // Criação atómica: não envia nem confia em companyId vindo do cliente
      const payload = {
        company: {
          legalName: form.legalName.trim(),
          nif: form.nif.trim() || undefined,
          branchCode: form.branchCode.trim().toUpperCase() || "MAIN",
          branchName: form.branchName.trim() || "Sede",
        },
        admin: {
          username: form.username.trim().toLowerCase(),
          email: form.email.trim().toLowerCase(),
          displayName: form.displayName.trim(),
          password: form.password,
          pin: form.pin.trim() || undefined,
        },
      };

      const response = await fetch(`${apiUrl}/api/v1/auth/bootstrap`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        setEligible(false);
        setError("A instalação já possui um administrador configurado. Não é permitida nova inicialização.");
        setSaving(false);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError((data as { message?: string }).message ?? "Não foi possível concluir a configuração inicial.");
        setSaving(false);
        return;
      }

      const data = await response.json() as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; username: string; displayName?: string; role: string };
        context?: { companyId: string; branchId: string };
      };

      // Persistência mínima da sessão inicial no browser (refresh token gerido por cookie HttpOnly)
      persistBrowserSession(data);

      setSaving(false);
      onSuccess();
    } catch {
      setError("Erro ao comunicar com o servidor para criar a conta inicial.");
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px auto" }} />
        <p style={{ color: "#64748b" }}>A verificar elegibilidade de configuração inicial...</p>
      </div>
    );
  }

  // Se o bootstrap NÃO for permitido (sistema já inicializado)
  if (!eligible) {
    return (
      <div style={{ width: "min(560px, 100%)", margin: "40px auto" }}>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "36px 32px",
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.08)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>🔒</div>
          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: "0 0 10px 0" }}>
            Configuração Inicial Não Disponível
          </h2>
          <p style={{ fontSize: "14px", color: "#475467", lineHeight: 1.6, marginBottom: "24px" }}>
            Esta instalação do <strong>Mutshima</strong> já se encontra inicializada com uma empresa
            e um administrador configurados. Por imperativo de segurança, a criação de novos utilizadores
            ou filiais adicionais é realizada internamente pelo Administrador através do Centro Corporativo.
          </p>

          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => onNavigate("entrar")}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <span>💼</span> Ir para Início de Sessão
          </button>
        </div>
      </div>
    );
  }

  // Se o bootstrap FOR permitido (instalação virgem)
  return (
    <div style={{ width: "min(680px, 100%)", margin: "32px auto" }}>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "36px 32px",
          boxShadow: "0 10px 25px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <span style={{ fontSize: "32px" }}>🔑</span>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: "8px 0 6px 0" }}>
            Configuração Inicial do Primeiro Administrador
          </h2>
          <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
            Inicialização atómica da empresa sede, filial principal e conta mestre de administração.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "20px",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)}>
          {/* Seção Empresa */}
          <fieldset style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "16px 20px", marginBottom: "20px" }}>
            <legend style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", padding: "0 8px" }}>
              🏢 Dados da Empresa Sede
            </legend>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "8px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Nome da Empresa / Razão Social *
                </label>
                <input
                  type="text"
                  placeholder="ex: Comercial Luanda, Lda"
                  value={form.legalName}
                  onChange={(e) => updateField("legalName", e.target.value)}
                  required
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  NIF da Empresa (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="ex: 5412345678"
                  value={form.nif}
                  onChange={(e) => updateField("nif", e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Código da Filial Sede *
                </label>
                <input
                  type="text"
                  value={form.branchCode}
                  onChange={(e) => updateField("branchCode", e.target.value)}
                  required
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Nome da Filial *
                </label>
                <input
                  type="text"
                  value={form.branchName}
                  onChange={(e) => updateField("branchName", e.target.value)}
                  required
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>
            </div>
          </fieldset>

          {/* Seção Administrador */}
          <fieldset style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "16px 20px", marginBottom: "24px" }}>
            <legend style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", padding: "0 8px" }}>
              👤 Conta do Administrador Mestre (ROLE_ADMIN)
            </legend>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "8px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Nome Completo *
                </label>
                <input
                  type="text"
                  placeholder="ex: João Manuel Silva"
                  value={form.displayName}
                  onChange={(e) => updateField("displayName", e.target.value)}
                  required
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Nome de Utilizador *
                </label>
                <input
                  type="text"
                  placeholder="ex: admin"
                  value={form.username}
                  onChange={(e) => updateField("username", e.target.value)}
                  required
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  E-mail Institucional *
                </label>
                <input
                  type="email"
                  placeholder="admin@empresa.ao"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  required
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Palavra-passe (Mínimo 8 carateres) *
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  required
                  minLength={8}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Confirmar Palavra-passe *
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.confirmPassword}
                  onChange={(e) => updateField("confirmPassword", e.target.value)}
                  required
                  minLength={8}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  PIN de Autorização Rápida (Opcional, 4 a 6 dígitos)
                </label>
                <input
                  type="password"
                  placeholder="ex: 123456"
                  maxLength={6}
                  value={form.pin}
                  onChange={(e) => updateField("pin", e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                />
              </div>
            </div>
          </fieldset>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary-lg"
              style={{ flex: 1, justifyContent: "center" }}
            >
              {saving ? "A criar empresa e administrador..." : "Criar Empresa e Administrador Inicial"}
            </button>
            <button
              type="button"
              className="btn-secondary-lg"
              onClick={() => onNavigate("entrar")}
            >
              Cancelar
            </button>
          </div>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
            Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
          </p>
        </div>
      </div>
    </div>
  );
}
