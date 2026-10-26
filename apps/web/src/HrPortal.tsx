import { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";

interface Props {
  apiUrl: string;
}

export function HrPortal({ apiUrl }: Props) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("accessToken") || localStorage.getItem("portal_hr_token"));
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "employees" | "vacations">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
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
        setLoginError("Credenciais de Recursos Humanos inválidas.");
        return;
      }
      const data = await res.json();
      localStorage.setItem("portal_hr_token", data.accessToken);
      setToken(data.accessToken);
    } catch {
      setLoginError("Erro de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("portal_hr_token");
    setToken(null);
    setDashboard(null);
  };

  const loadData = async () => {
    if (!token) return;
    try {
      const [dashRes, empRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/portals/hr/dashboard`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/hr/employees`, { headers: authHeaders() }),
      ]);
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
    } catch (e) {
      console.warn("Falha ao carregar dados de RH", e);
    }
  };

  useEffect(() => {
    if (token) void loadData();
  }, [token]);

  if (!token) {
    return (
      <div className="portal-container" style={{ maxWidth: "420px", margin: "40px auto", padding: "24px", background: "#fff", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
        <div style={{ background: "#fee2e2", border: "1px solid #ef4444", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>⚠️</span> <span>Sem autenticação. Inicie sessão com credenciais de RH para aceder a este portal.</span>
        </div>
        <h2 style={{ color: "#0f172a", marginBottom: "8px" }}>👥 Portal de Recursos Humanos</h2>
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>Gestão de pessoal, contratos, assiduidade e processamento salarial.</p>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ fontSize: "12px", fontWeight: "600" }}>
            E-mail ou Username (RH)
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="rh@empresa.ao ou utilizador"
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
          <button type="submit" disabled={loading} style={{ background: "#4f46e5", color: "#fff", padding: "10px", border: "none", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
            {loading ? "A entrar..." : "Entrar no Portal RH"}
          </button>
          {loginError && <p style={{ color: "#dc2626", fontSize: "13px" }}>{loginError}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="portal-wrapper" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#312e81", color: "#fff", padding: "14px 20px", borderRadius: "8px", marginBottom: "20px" }}>
        <div>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#a5b4fc" }}>Gestão de Pessoas & Capital Humano</span>
          <h2 style={{ margin: "2px 0 0 0", fontSize: "18px" }}>Portal de Recursos Humanos</h2>
        </div>
        <button onClick={handleLogout} style={{ background: "transparent", color: "#fca5a5", border: "1px solid #fca5a5", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>
          Sair
        </button>
      </header>

      <nav style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        {[
          { key: "dashboard", label: "📊 Indicadores de Pessoal" },
          { key: "employees", label: "👥 Fichas de Colaboradores" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === t.key ? "3px solid #4f46e5" : "3px solid transparent",
              background: "transparent",
              color: activeTab === t.key ? "#4f46e5" : "#64748b",
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
          <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", padding: "16px", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", color: "#3730a3" }}>Total de Colaboradores</span>
            <h3 style={{ margin: "6px 0", color: "#312e81", fontSize: "24px" }}>{dashboard.totalEmployees}</h3>
            <small style={{ color: "#64748b" }}>Cadastrados na empresa</small>
          </div>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", color: "#166534" }}>Colaboradores Ativos</span>
            <h3 style={{ margin: "6px 0", color: "#14532d", fontSize: "24px" }}>{dashboard.activeEmployees}</h3>
            <small style={{ color: "#64748b" }}>Contratos em vigor</small>
          </div>
          <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", padding: "16px", borderRadius: "8px" }}>
            <span style={{ fontSize: "12px", color: "#6b21a8" }}>Pedidos de Férias Pendentes</span>
            <h3 style={{ margin: "6px 0", color: "#581c87", fontSize: "24px" }}>{dashboard.pendingLeaveRequests}</h3>
            <small style={{ color: "#64748b" }}>Aguardando validação da direção</small>
          </div>
        </div>
      )}

      {activeTab === "employees" && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 16px 0" }}>Quadro Oficial de Pessoal</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#312e81", color: "#fff", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>Nome do Colaborador</th>
                <th style={{ padding: "10px" }}>NIF / INSS</th>
                <th style={{ padding: "10px" }}>Cargo / Função</th>
                <th style={{ padding: "10px" }}>Departamento</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Salário Base</th>
                <th style={{ padding: "10px" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {employees.length ? (
                employees.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px", fontWeight: "600" }}>{e.fullName || e.name}</td>
                    <td style={{ padding: "10px", color: "#64748b" }}>{e.nif || e.inss || "—"}</td>
                    <td style={{ padding: "10px" }}>{e.position || "—"}</td>
                    <td style={{ padding: "10px" }}>{e.department || "Geral"}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: "600" }}>{formatKwanza(e.baseSalaryCents || 0)}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ background: e.active ? "#dcfce7" : "#fee2e2", color: e.active ? "#15803d" : "#991b1b", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                        {e.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
                    Sem colaboradores cadastrados. Adicione colaboradores através do módulo RH do ERP.
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
