import { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";

interface Props {
  apiUrl: string;
}

export function CustomerPortal({ apiUrl }: Props) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("portal_customer_token"));
  const [authMode, setAuthMode] = useState<"login" | "register" | "recover">("login");
  const [nif, setNif] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "statement" | "payments" | "profile">("dashboard");

  // Registration Form State
  const [regForm, setRegForm] = useState({
    name: "",
    nif: "",
    email: "",
    phone: "",
    address: "",
    pin: "",
  });
  const [recoverIdentifier, setRecoverIdentifier] = useState("");

  const [dashboard, setDashboard] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [generatedRef, setGeneratedRef] = useState<any>(null);
  const [refDocId, setRefDocId] = useState("");
  const [refAmountKz, setRefAmountKz] = useState("");
  const [profileForm, setProfileForm] = useState({ phone: "", email: "", address: "", currentPin: "", newPin: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token || ""}`,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/auth/customer-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: nif, pin }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLoginError(err.message || "Credenciais de cliente inválidas.");
        return;
      }
      const data = await res.json();
      localStorage.setItem("portal_customer_token", data.token);
      setToken(data.token);
    } catch {
      setLoginError("Erro de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/auth/customer-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.message || "Não foi possível criar a conta de cliente.");
        return;
      }
      if (data.token) {
        localStorage.setItem("portal_customer_token", data.token);
        setToken(data.token);
      } else {
        setAuthMode("login");
        setNif(regForm.nif);
        setPin(regForm.pin);
        setMessage("Conta criada com sucesso! Introduza o seu PIN para aceder.");
      }
    } catch {
      setLoginError("Erro de comunicação ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/auth/recover-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: recoverIdentifier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.message || "Não foi possível localizar o identificador.");
        return;
      }
      setMessage(data.message || "Instruções de recuperação enviadas com sucesso.");
      setAuthMode("login");
    } catch {
      setLoginError("Falha ao comunicar com o serviço de recuperação.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("portal_customer_token");
    setToken(null);
    setDashboard(null);
  };

  const loadDashboard = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/customer/dashboard`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
        setProfileForm({
          phone: data.phone || "",
          email: data.email || "",
          address: data.address || "",
        });
      }
    } catch (e) {
      console.warn("Failed to load customer dashboard", e);
    }
  };

  const loadStatement = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/customer/statement`, { headers: authHeaders() });
      if (res.ok) {
        setStatement(await res.json());
      }
    } catch (e) {
      console.warn("Failed to load customer statement", e);
    }
  };

  const handleGenerateReference = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!refDocId || !refAmountKz) return;
    const amountCents = Math.round(Number(refAmountKz.replace(/\./g, "").replace(",", ".")) * 100);
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/customer/payment-reference`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ documentId: refDocId, amountCents }),
      });
      if (res.ok) {
        setGeneratedRef(await res.json());
      }
    } catch (e) {
      console.warn("Failed to generate payment reference", e);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/customer/profile`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        setMessage("Dados de contacto atualizados com sucesso!");
        setTimeout(() => setMessage(""), 4000);
      }
    } catch {
      setMessage("Falha ao atualizar dados.");
    }
  };

  useEffect(() => {
    if (token) {
      void loadDashboard();
      void loadStatement();
    }
  }, [token]);

  if (!token) {
    return (
      <div className="portal-container" style={{ maxWidth: "480px", margin: "40px auto", padding: "28px", background: "#fff", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0" }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <span style={{ fontSize: "36px" }}>🏢</span>
          <h2 style={{ color: "#0f172a", margin: "8px 0 4px 0" }}>Portal do Cliente</h2>
          <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Área exclusiva de clientes para consulta de faturas, extratos e pagamentos EMIS.</p>
        </div>

        {/* Auth Mode Toggle */}
        <div style={{ display: "flex", gap: "6px", background: "#f1f5f9", padding: "4px", borderRadius: "8px", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={() => { setAuthMode("login"); setLoginError(""); setMessage(""); }}
            style={{ flex: 1, padding: "8px", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "13px", background: authMode === "login" ? "#2563eb" : "transparent", color: authMode === "login" ? "#fff" : "#64748b" }}
          >
            Iniciar Sessão
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode("register"); setLoginError(""); setMessage(""); }}
            style={{ flex: 1, padding: "8px", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "13px", background: authMode === "register" ? "#059669" : "transparent", color: authMode === "register" ? "#fff" : "#64748b" }}
          >
            Criar Conta
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode("recover"); setLoginError(""); setMessage(""); }}
            style={{ flex: 1, padding: "8px", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "13px", background: authMode === "recover" ? "#0284c7" : "transparent", color: authMode === "recover" ? "#fff" : "#64748b" }}
          >
            Recuperar PIN
          </button>
        </div>

        {message && <div style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#166534", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "13px", fontWeight: "600" }}>{message}</div>}
        {loginError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "13px" }}>{loginError}</div>}

        {/* 1. Login Mode */}
        {authMode === "login" && (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
              NIF ou E-mail do Cliente
              <input
                type="text"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                placeholder="Ex: 5401992831 ou cliente@empresa.ao"
                required
                style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
              PIN de Acesso
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Introduza o seu PIN (4+ dígitos)"
                required
                style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
              />
            </label>
            <button type="submit" disabled={loading} style={{ background: "#2563eb", color: "#fff", padding: "12px", border: "none", borderRadius: "6px", fontWeight: "700", cursor: "pointer", marginTop: "6px" }}>
              {loading ? "A autenticar..." : "Entrar no Portal do Cliente"}
            </button>
          </form>
        )}

        {/* 2. Self-Registration Mode */}
        {authMode === "register" && (
          <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
              Nome Completo / Razão Social
              <input
                type="text"
                value={regForm.name}
                onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                placeholder="Ex: Manuel António Domingos ou Empresa Lda"
                required
                style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
                NIF / B.I.
                <input
                  type="text"
                  value={regForm.nif}
                  onChange={(e) => setRegForm({ ...regForm, nif: e.target.value })}
                  placeholder="Ex: 5419998877"
                  required
                  style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
                Telemóvel
                <input
                  type="tel"
                  value={regForm.phone}
                  onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                  placeholder="+244 9..."
                  style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </label>
            </div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
              Endereço de E-mail
              <input
                type="email"
                value={regForm.email}
                onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                placeholder="cliente@exemplo.ao"
                required
                style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
              Morada / Província
              <input
                type="text"
                value={regForm.address}
                onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                placeholder="Ex: Maianga, Luanda"
                style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
              Definir PIN de Acesso (4 a 6 dígitos numéricos)
              <input
                type="password"
                inputMode="numeric"
                value={regForm.pin}
                onChange={(e) => setRegForm({ ...regForm, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                placeholder="••••••"
                required
                minLength={4}
                maxLength={6}
                style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
              />
            </label>
            <button type="submit" disabled={loading} style={{ background: "#059669", color: "#fff", padding: "12px", border: "none", borderRadius: "6px", fontWeight: "700", cursor: "pointer", marginTop: "6px" }}>
              {loading ? "A criar conta..." : "Criar Conta de Cliente Imediatamente"}
            </button>
          </form>
        )}

        {/* 3. Recovery Mode */}
        {authMode === "recover" && (
          <form onSubmit={handleRecover} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
              NIF ou E-mail Cadastrado
              <input
                type="text"
                value={recoverIdentifier}
                onChange={(e) => setRecoverIdentifier(e.target.value)}
                placeholder="Introduza o NIF ou e-mail da sua conta"
                required
                style={{ width: "100%", padding: "10px", marginTop: "4px", borderRadius: "6px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
              />
            </label>
            <button type="submit" disabled={loading} style={{ background: "#0284c7", color: "#fff", padding: "12px", border: "none", borderRadius: "6px", fontWeight: "700", cursor: "pointer", marginTop: "6px" }}>
              {loading ? "A verificar..." : "Recuperar Acesso / PIN"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="portal-wrapper" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Top Bar */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", color: "#fff", padding: "14px 20px", borderRadius: "8px", marginBottom: "20px" }}>
        <div>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#38bdf8" }}>Portal do Cliente Self-Service</span>
          <h2 style={{ margin: "2px 0 0 0", fontSize: "18px" }}>{dashboard?.customerName || "Cliente"}</h2>
          <small style={{ color: "#94a3b8" }}>NIF: {dashboard?.nif}</small>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={handleLogout} style={{ background: "transparent", color: "#f87171", border: "1px solid #f87171", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>
            Sair
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        {[
          { key: "dashboard", label: "📊 Resumo Financeiro" },
          { key: "statement", label: "📜 Extrato de Conta Corrente" },
          { key: "payments", label: "💳 Pagamentos & Multicaixa" },
          { key: "profile", label: "⚙️ Dados de Contacto" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === t.key ? "3px solid #2563eb" : "3px solid transparent",
              background: "transparent",
              color: activeTab === t.key ? "#2563eb" : "#64748b",
              fontWeight: activeTab === t.key ? "700" : "500",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* 1. Dashboard Tab */}
      {activeTab === "dashboard" && dashboard && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#1e40af" }}>Total Comprado</span>
              <h3 style={{ margin: "6px 0", color: "#1e3a8a", fontSize: "20px" }}>{formatKwanza(dashboard.totalPurchasedCents)}</h3>
              <small style={{ color: "#64748b" }}>Volume de faturas emitidas</small>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#991b1b" }}>Saldo em Dívida</span>
              <h3 style={{ margin: "6px 0", color: "#7f1d1d", fontSize: "20px" }}>{formatKwanza(dashboard.outstandingDebtCents)}</h3>
              <small style={{ color: "#64748b" }}>Pendente de liquidação</small>
            </div>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#166534" }}>Limite de Crédito Concedido</span>
              <h3 style={{ margin: "6px 0", color: "#14532d", fontSize: "20px" }}>{formatKwanza(dashboard.creditLimitCents)}</h3>
              <small style={{ color: "#64748b" }}>Plafond contratual aprovado</small>
            </div>
            <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#6b21a8" }}>Crédito Disponível</span>
              <h3 style={{ margin: "6px 0", color: "#581c87", fontSize: "20px" }}>{formatKwanza(dashboard.creditAvailableCents)}</h3>
              <small style={{ color: "#64748b" }}>Margem para novas encomendas</small>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Recent Documents */}
            <div style={{ background: "#fff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: "0 0 12px 0", color: "#0f172a" }}>📄 Faturas e Documentos Comerciais Recentes</h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>N.º</th>
                    <th style={{ padding: "8px" }}>Data</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Total</th>
                    <th style={{ padding: "8px" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentDocuments?.length ? (
                    dashboard.recentDocuments.map((doc: any) => (
                      <tr key={doc.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px", fontWeight: "600" }}>{doc.number}</td>
                        <td style={{ padding: "8px", color: "#64748b" }}>{new Date(doc.date).toLocaleDateString("pt-AO")}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "600" }}>{formatKwanza(doc.totalCents)}</td>
                        <td style={{ padding: "8px" }}>
                          <span style={{ background: doc.status === "SETTLED" ? "#dcfce7" : "#fef3c7", color: doc.status === "SETTLED" ? "#15803d" : "#b45309", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                            {doc.status === "SETTLED" ? "Liquidado" : "Pendente"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>Sem faturas ou documentos comerciais emitidos.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Recent Payments */}
            <div style={{ background: "#fff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: "0 0 12px 0", color: "#0f172a" }}>💳 Pagamentos Recebidos em Conta</h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>Data</th>
                    <th style={{ padding: "8px" }}>Método / Ref.</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Valor Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentPayments?.length ? (
                    dashboard.recentPayments.map((p: any) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px", color: "#64748b" }}>{new Date(p.receivedAt).toLocaleDateString("pt-AO")}</td>
                        <td style={{ padding: "8px" }}>
                          <b>{p.paymentMethod}</b> <small style={{ color: "#64748b" }}>({p.reference || "N/A"})</small>
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "700", color: "#047857" }}>{formatKwanza(p.amountCents)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>Sem pagamentos recebidos registados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Statement of Account Tab */}
      {activeTab === "statement" && statement && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0 }}>Extrato de Conta Corrente Detalhado</h3>
              <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "13px" }}>Histórico de débitos, créditos e evolução do saldo corrente</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "12px", color: "#64748b" }}>Saldo Devedor Atual:</span>
              <h3 style={{ margin: 0, color: "#991b1b" }}>{formatKwanza(statement.finalBalanceCents)}</h3>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#0f172a", color: "#fff", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>Data</th>
                <th style={{ padding: "10px" }}>Tipo</th>
                <th style={{ padding: "10px" }}>N.º Documento</th>
                <th style={{ padding: "10px" }}>Descrição</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Débito (+)</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Crédito (-)</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {statement.entries?.length ? (
                statement.entries.map((e: any) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px" }}>{new Date(e.date).toLocaleDateString("pt-AO")}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>{e.documentType}</span>
                    </td>
                    <td style={{ padding: "10px", fontWeight: "600" }}>{e.documentNumber}</td>
                    <td style={{ padding: "10px", color: "#475569" }}>{e.description}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: e.debitCents > 0 ? "#b91c1c" : "#94a3b8" }}>
                      {e.debitCents > 0 ? formatKwanza(e.debitCents) : "—"}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right", color: e.creditCents > 0 ? "#15803d" : "#94a3b8" }}>
                      {e.creditCents > 0 ? formatKwanza(e.creditCents) : "—"}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: "700" }}>{formatKwanza(e.runningBalanceCents)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>Sem movimentos na conta corrente.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Payments Tab */}
      {activeTab === "payments" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Multicaixa GPO Generator */}
          <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 8px 0" }}>💳 Pagamento por Referência Multicaixa</h3>
            <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Gere uma referência oficial EMIS para liquidação no ATM Multicaixa ou via Multicaixa Express.</p>
            <form onSubmit={handleGenerateReference} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                Documento Comercial
                {dashboard?.recentDocuments?.length ? (
                  <select
                    value={refDocId}
                    onChange={(e) => {
                      setRefDocId(e.target.value);
                      const selected = dashboard.recentDocuments.find((d: any) => d.id === e.target.value);
                      if (selected) setRefAmountKz((selected.totalCents / 100).toLocaleString("pt-AO"));
                    }}
                    style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    required
                  >
                    <option value="">Selecione o documento...</option>
                    {dashboard.recentDocuments.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.number} - {formatKwanza(d.totalCents)} ({d.status === "SETTLED" ? "Liquidado" : "Pendente"})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={refDocId}
                    onChange={(e) => setRefDocId(e.target.value)}
                    placeholder="N.º ou identificador do documento"
                    required
                    style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                  />
                )}
              </label>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                Montante a Liquidar (Kz)
                <input
                  type="text"
                  value={refAmountKz}
                  onChange={(e) => setRefAmountKz(e.target.value)}
                  placeholder="Ex: 8500000"
                  required
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <button
                type="submit"
                style={{ background: "#059669", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "4px", fontWeight: "600", cursor: "pointer", alignSelf: "flex-start" }}
              >
                Gerar Referência Multicaixa
              </button>
            </form>

            {generatedRef && (
              <div style={{ marginTop: "20px", padding: "16px", background: "#f0fdf4", border: "1px dashed #059669", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#065f46" }}>Dados de Pagamento EMIS / Multicaixa</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px", fontSize: "14px" }}>
                  <div>
                    <small style={{ color: "#64748b" }}>Entidade:</small>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#065f46" }}>{generatedRef.entity}</div>
                  </div>
                  <div>
                    <small style={{ color: "#64748b" }}>Referência:</small>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#065f46", letterSpacing: "1px" }}>{generatedRef.reference}</div>
                  </div>
                  <div>
                    <small style={{ color: "#64748b" }}>Montante:</small>
                    <div style={{ fontWeight: "700" }}>{formatKwanza(generatedRef.amountCents)}</div>
                  </div>
                  <div>
                    <small style={{ color: "#64748b" }}>Válido até:</small>
                    <div style={{ fontWeight: "600", fontSize: "12px" }}>{new Date(generatedRef.expiresAt).toLocaleString("pt-AO")}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bank Transfer Details */}
          <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 8px 0" }}>🏦 Transferência Bancária</h3>
            <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Coordenadas bancárias institucionais:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <b>Contas Institucionais</b>
                <div style={{ fontSize: "13px", color: "#334155", marginTop: "4px" }}>
                  Por razões de segurança e validação documental, consulte o IBAN oficial impresso na sua fatura pró-forma / comercial ou solicite a confirmação direta à tesouraria da empresa licenciada.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Profile Tab */}
      {activeTab === "profile" && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0", maxWidth: "600px" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Atualização de Contactos do Cliente</h3>
          <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Mantenha os contactos da sua empresa atualizados para receção imediata de faturas eletrónicas.</p>
          <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              Telefone de Contacto
              <input
                type="text"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              E-mail Financeiro / Faturação
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              Endereço Físico / Sede
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <button type="submit" style={{ background: "#2563eb", color: "#fff", border: "none", padding: "10px", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
              Guardar Alterações
            </button>
            {message && <p style={{ color: "#166534", fontSize: "13px", fontWeight: "600" }}>{message}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
