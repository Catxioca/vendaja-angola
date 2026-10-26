import { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";

interface Props {
  apiUrl: string;
}

export function CustomerPortal({ apiUrl }: Props) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("portal_customer_token"));
  const [nif, setNif] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "statement" | "payments" | "profile">("dashboard");

  const [dashboard, setDashboard] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [generatedRef, setGeneratedRef] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({ phone: "", email: "", address: "" });
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
        body: JSON.stringify({ identifier: nif, secret: pin }),
      });
      if (!res.ok) {
        setLoginError("Credenciais de cliente inválidas.");
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

  const handleGenerateReference = async (docId = "doc-ft-2026-001", amountCents = 8_500_000_00) => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/customer/payment-reference`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ documentId: docId, amountCents }),
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
      <div className="portal-container" style={{ maxWidth: "420px", margin: "40px auto", padding: "24px", background: "#fff", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
        <h2 style={{ color: "#0f172a", marginBottom: "8px" }}>🏢 Portal do Cliente</h2>
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>Aceda às suas faturas, extrato de conta corrente e referências de pagamento.</p>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ fontSize: "12px", fontWeight: "600" }}>
            NIF ou E-mail do Cliente
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              placeholder="Ex: 5401992831"
              required
              style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            />
          </label>
          <label style={{ fontSize: "12px", fontWeight: "600" }}>
            PIN / Palavra-passe de Segurança
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN de 4 ou mais dígitos"
              required
              style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            />
          </label>
          <button type="submit" disabled={loading} style={{ background: "#2563eb", color: "#fff", padding: "10px", border: "none", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
            {loading ? "A entrar..." : "Entrar no Portal"}
          </button>
          {loginError && <p style={{ color: "#dc2626", fontSize: "13px" }}>{loginError}</p>}
        </form>
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
                  {dashboard.recentDocuments.map((doc: any) => (
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
                  ))}
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
                  {dashboard.recentPayments.map((p: any) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px", color: "#64748b" }}>{new Date(p.receivedAt).toLocaleDateString("pt-AO")}</td>
                      <td style={{ padding: "8px" }}>
                        <b>{p.paymentMethod}</b> <small style={{ color: "#64748b" }}>({p.reference || "N/A"})</small>
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: "700", color: "#047857" }}>{formatKwanza(p.amountCents)}</td>
                    </tr>
                  ))}
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
              {statement.entries.map((e: any) => (
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
              ))}
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
            <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Gere uma referência oficial para liquidação no ATM Multicaixa ou via Multicaixa Express.</p>
            <button
              onClick={() => void handleGenerateReference("doc-ft-2026-001", 8_500_000_00)}
              style={{ background: "#059669", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "4px", fontWeight: "600", cursor: "pointer" }}
            >
              Gerar Referência Multicaixa (8.500.000 Kz)
            </button>

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
            <h3 style={{ margin: "0 0 8px 0" }}>🏦 Transferência Bancária Direta</h3>
            <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Pode liquidar as suas faturas diretamente para as contas institucionais:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <b>Banco Angolano de Investimentos (BAI)</b>
                <div style={{ fontSize: "13px", color: "#334155", marginTop: "4px" }}>IBAN: <code>AO06.0040.0000.1234.5678.9012.3</code></div>
                <small style={{ color: "#64748b" }}>Titular: VendaJá Angola Enterprise Lda.</small>
              </div>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <b>Banco de Fomento Angola (BFA)</b>
                <div style={{ fontSize: "13px", color: "#334155", marginTop: "4px" }}>IBAN: <code>AO06.0006.0000.9876.5432.1098.7</code></div>
                <small style={{ color: "#64748b" }}>Titular: VendaJá Angola Enterprise Lda.</small>
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
