import { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";

interface Props {
  apiUrl: string;
}

export function CommercialPortal({ apiUrl }: Props) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("accessToken") || localStorage.getItem("portal_commercial_token"));
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "customers">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
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
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password: secret }),
      });
      if (!res.ok) {
        setLoginError("Credenciais comerciais inválidas.");
        return;
      }
      const data = await res.json();
      localStorage.setItem("portal_commercial_token", data.accessToken);
      setToken(data.accessToken);
    } catch {
      setLoginError("Erro de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("portal_commercial_token");
    setToken(null);
    setDashboard(null);
  };

  const loadData = async () => {
    if (!token) return;
    try {
      const [dashRes, custRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/portals/commercial/dashboard`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/commercial/customers`, { headers: authHeaders() }),
      ]);
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (custRes.ok) setCustomers(await custRes.json());
    } catch (e) {
      console.warn("Falha ao carregar dados comerciais", e);
    }
  };

  useEffect(() => {
    if (token) void loadData();
  }, [token]);

  if (!token) {
    return (
      <div className="portal-container" style={{ maxWidth: "420px", margin: "40px auto", padding: "24px", background: "#fff", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
        <div style={{ background: "#fee2e2", border: "1px solid #ef4444", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>⚠️</span> <span>Sem autenticação. Inicie sessão com a sua conta comercial para aceder a este portal.</span>
        </div>
        <h2 style={{ color: "#0f172a", marginBottom: "8px" }}>📊 Portal Comercial</h2>
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>Acompanhe o faturamento, carteira de clientes, crédito concedido e vendas.</p>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ fontSize: "12px", fontWeight: "600" }}>
            E-mail ou Username Comercial
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="comercial@empresa.ao ou utilizador"
              required
              style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            />
          </label>
          <label style={{ fontSize: "12px", fontWeight: "600" }}>
            Palavra-passe
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Senha de acesso"
              required
              style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            />
          </label>
          <button type="submit" disabled={loading} style={{ background: "#0284c7", color: "#fff", padding: "10px", border: "none", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
            {loading ? "A entrar..." : "Entrar no Portal Comercial"}
          </button>
          {loginError && <p style={{ color: "#dc2626", fontSize: "13px" }}>{loginError}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="portal-wrapper" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0c4a6e", color: "#fff", padding: "14px 20px", borderRadius: "8px", marginBottom: "20px" }}>
        <div>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#38bdf8" }}>Gestão Comercial & Faturamento</span>
          <h2 style={{ margin: "2px 0 0 0", fontSize: "18px" }}>Portal Comercial</h2>
        </div>
        <button onClick={handleLogout} style={{ background: "transparent", color: "#fca5a5", border: "1px solid #fca5a5", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>
          Sair
        </button>
      </header>

      <nav style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        {[
          { key: "dashboard", label: "📊 Visão Geral de Vendas" },
          { key: "customers", label: "🏢 Carteira de Clientes & Crédito" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === t.key ? "3px solid #0284c7" : "3px solid transparent",
              background: "transparent",
              color: activeTab === t.key ? "#0284c7" : "#64748b",
              fontWeight: activeTab === t.key ? "700" : "500",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab === "dashboard" && dashboard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", padding: "16px", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", color: "#0369a1" }}>Total Faturado</span>
            <h3 style={{ margin: "6px 0", color: "#0c4a6e", fontSize: "22px" }}>{formatKwanza(dashboard.totalSalesCents)}</h3>
            <small style={{ color: "#64748b" }}>Volume acumulado de vendas</small>
          </div>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", color: "#166534" }}>Transações Realizadas</span>
            <h3 style={{ margin: "6px 0", color: "#14532d", fontSize: "22px" }}>{dashboard.salesCount}</h3>
            <small style={{ color: "#64748b" }}>Documentos emitidos</small>
          </div>
          <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", padding: "16px", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", color: "#6b21a8" }}>Clientes Ativos</span>
            <h3 style={{ margin: "6px 0", color: "#581c87", fontSize: "22px" }}>{dashboard.activeCustomers}</h3>
            <small style={{ color: "#64748b" }}>Com conta cadastrada</small>
          </div>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "16px", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", color: "#92400e" }}>Ticket Médio</span>
            <h3 style={{ margin: "6px 0", color: "#78350f", fontSize: "22px" }}>{formatKwanza(dashboard.averageTicketCents)}</h3>
            <small style={{ color: "#64748b" }}>Média por documento</small>
          </div>
        </div>
      )}

      {activeTab === "customers" && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 16px 0" }}>Carteira de Clientes Cadastrados</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#0c4a6e", color: "#fff", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>Nome do Cliente</th>
                <th style={{ padding: "10px" }}>NIF</th>
                <th style={{ padding: "10px" }}>Telefone / E-mail</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Limite de Crédito</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Saldo em Dívida</th>
                <th style={{ padding: "10px" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {customers.length ? (
                customers.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px", fontWeight: "600" }}>{c.name}</td>
                    <td style={{ padding: "10px", color: "#64748b" }}>{c.nif || "Consumidor Final"}</td>
                    <td style={{ padding: "10px" }}>{c.phone || c.email || "—"}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{formatKwanza(c.creditLimitCents || 0)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: c.outstandingDebtCents > 0 ? "#b91c1c" : "#15803d" }}>
                      {formatKwanza(c.outstandingDebtCents || 0)}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ background: c.active ? "#dcfce7" : "#fee2e2", color: c.active ? "#15803d" : "#991b1b", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                        {c.active ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
                    Sem clientes cadastrados. Adicione clientes através do módulo CRM do ERP.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
