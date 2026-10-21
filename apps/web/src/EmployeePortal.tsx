import { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";

interface Props {
  apiUrl: string;
}

export function EmployeePortal({ apiUrl }: Props) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("portal_employee_token"));
  const [nif, setNif] = useState("5412998877");
  const [pin, setPin] = useState("pin2026");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "payslips" | "leave" | "profile">("dashboard");

  const [dashboard, setDashboard] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [leaveForm, setLeaveForm] = useState({
    type: "VACATION",
    startDate: "2026-12-01",
    endDate: "2026-12-05",
    daysCount: 5,
    justification: "",
  });
  const [profileForm, setProfileForm] = useState({ phone: "", email: "", address: "", iban: "" });
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
      const res = await fetch(`${apiUrl}/api/v1/portals/auth/employee-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: nif, secret: pin }),
      });
      if (!res.ok) {
        setLoginError("Credenciais de colaborador inválidas.");
        return;
      }
      const data = await res.json();
      localStorage.setItem("portal_employee_token", data.token);
      setToken(data.token);
    } catch {
      setLoginError("Erro de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("portal_employee_token");
    setToken(null);
    setDashboard(null);
  };

  const loadData = async () => {
    if (!token) return;
    try {
      const [dashRes, payslipsRes, leaveRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/portals/employee/dashboard`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/employee/payslips`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/employee/leave-requests`, { headers: authHeaders() }),
      ]);

      if (dashRes.ok) {
        const d = await dashRes.json();
        setDashboard(d);
        setProfileForm({
          phone: "+244 923 111 999",
          email: "teresa.carvalho@empresa.ao",
          address: "Condomínio Kinaxixi, Torre B, Luanda",
          iban: d.iban || "AO06.0040.0000.9988.7766.5544.3",
        });
      }
      if (payslipsRes.ok) {
        const p = await payslipsRes.json();
        setPayslips(p);
        if (p.length > 0) setSelectedPayslip(p[0]);
      }
      if (leaveRes.ok) setLeaveRequests(await leaveRes.json());
    } catch (e) {
      console.warn("Failed to load employee data", e);
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/employee/leave-requests`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(leaveForm),
      });

      if (res.ok) {
        setMessage("Pedido de férias submetido e encaminhado para aprovação da chefia!");
        void loadData();
        setTimeout(() => setMessage(""), 5000);
      }
    } catch {
      setMessage("Falha ao submeter pedido de férias.");
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/employee/profile`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        setMessage("Dados pessoais atualizados com sucesso!");
        setTimeout(() => setMessage(""), 4000);
      }
    } catch {
      setMessage("Falha ao atualizar dados.");
    }
  };

  useEffect(() => {
    if (token) void loadData();
  }, [token]);

  if (!token) {
    return (
      <div className="portal-container" style={{ maxWidth: "420px", margin: "40px auto", padding: "24px", background: "#fff", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
        <h2 style={{ color: "#0f172a", marginBottom: "8px" }}>👥 Portal do Colaborador (RH)</h2>
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>Aceda aos seus recibos de vencimento, saldo de férias e solicite ausências.</p>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ fontSize: "12px", fontWeight: "600" }}>
            NIF ou N.º de Segurança Social (INSS)
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              placeholder="Ex: 5412998877"
              required
              style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            />
          </label>
          <label style={{ fontSize: "12px", fontWeight: "600" }}>
            PIN Pessoal de Acesso (RH)
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN de acesso pessoal"
              required
              style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            />
          </label>
          <button type="submit" disabled={loading} style={{ background: "#7c3aed", color: "#fff", padding: "10px", border: "none", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
            {loading ? "A entrar..." : "Entrar no Portal RH"}
          </button>
          {loginError && <p style={{ color: "#dc2626", fontSize: "13px" }}>{loginError}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="portal-wrapper" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Top Bar */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#4c1d95", color: "#fff", padding: "14px 20px", borderRadius: "8px", marginBottom: "20px" }}>
        <div>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#c4b5fd" }}>Portal do Colaborador · Self-Service RH</span>
          <h2 style={{ margin: "2px 0 0 0", fontSize: "18px" }}>{dashboard?.fullName || "Colaborador"}</h2>
          <small style={{ color: "#ddd6fe" }}>{dashboard?.position} · {dashboard?.department}</small>
        </div>
        <button onClick={handleLogout} style={{ background: "transparent", color: "#fca5a5", border: "1px solid #fca5a5", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>
          Sair
        </button>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        {[
          { key: "dashboard", label: "📊 Meu Painel & Férias" },
          { key: "payslips", label: "💰 Recibos de Vencimento" },
          { key: "leave", label: "🏖️ Solicitação de Férias" },
          { key: "profile", label: "⚙️ Dados Pessoais & IBAN" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === t.key ? "3px solid #7c3aed" : "3px solid transparent",
              background: "transparent",
              color: activeTab === t.key ? "#7c3aed" : "#64748b",
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
            <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#5b21b6" }}>Vencimento Base</span>
              <h3 style={{ margin: "6px 0", color: "#4c1d95", fontSize: "20px" }}>{formatKwanza(dashboard.baseSalaryCents)}</h3>
              <small style={{ color: "#64748b" }}>Salário base contratual</small>
            </div>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#166534" }}>Último Salário Líquido</span>
              <h3 style={{ margin: "6px 0", color: "#14532d", fontSize: "20px" }}>{formatKwanza(dashboard.lastNetSalaryCents)}</h3>
              <small style={{ color: "#64748b" }}>Após deduções de IRT e INSS 3%</small>
            </div>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#1e40af" }}>Dias de Férias Restantes</span>
              <h3 style={{ margin: "6px 0", color: "#1e3a8a", fontSize: "20px" }}>{dashboard.vacationSummary.daysRemaining} dias</h3>
              <small style={{ color: "#64748b" }}>De 22 dias úteis legais anuais</small>
            </div>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#92400e" }}>Férias Gozadas / Agendadas</span>
              <h3 style={{ margin: "6px 0", color: "#78350f", fontSize: "20px" }}>{dashboard.vacationSummary.daysTaken} / {dashboard.vacationSummary.daysScheduled}</h3>
              <small style={{ color: "#64748b" }}>Gozados / Agendados</small>
            </div>
          </div>
        </div>
      )}

      {/* 2. Payslips Tab */}
      {activeTab === "payslips" && (
        <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "20px" }}>
          {/* List of Payslips */}
          <div style={{ background: "#fff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <h4 style={{ margin: "0 0 12px 0" }}>Histórico de Recibos de Vencimento</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {payslips.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPayslip(p)}
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: selectedPayslip?.id === p.id ? "2px solid #7c3aed" : "1px solid #e2e8f0",
                    background: selectedPayslip?.id === p.id ? "#f5f3ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "600" }}>
                    <span>{p.month}</span>
                    <span style={{ color: "#047857" }}>{formatKwanza(p.netSalaryCents)}</span>
                  </div>
                  <small style={{ color: "#64748b" }}>Líquido a receber</small>
                </div>
              ))}
            </div>
          </div>

          {/* Payslip Detail */}
          {selectedPayslip && (
            <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Recibo de Vencimento · {selectedPayslip.month}</h3>
                  <small style={{ color: "#64748b" }}>Processado nos termos da legislação fiscal e laboral angolana</small>
                </div>
                <span style={{ background: "#dcfce7", color: "#15803d", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>
                  Liquidado
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px", fontSize: "13px" }}>
                <div>
                  <b>Colaborador:</b> {selectedPayslip.employeeName}<br />
                  <b>Cargo:</b> {selectedPayslip.position}<br />
                  <b>NIF:</b> {selectedPayslip.nif}
                </div>
                <div>
                  <b>INSS:</b> {selectedPayslip.inss}<br />
                  <b>Mês Referência:</b> {selectedPayslip.month}<br />
                  <b>Data Pagamento:</b> {selectedPayslip.payDate || "—"}
                </div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>Rubrica Remuneratória</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Rendimento Bruto</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Descontos Legais</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px" }}>Vencimento Base</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatKwanza(selectedPayslip.salaryBaseCents)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>—</td>
                  </tr>
                  {selectedPayslip.foodAllowanceCents > 0 && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px" }}>Subsídio de Alimentação</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{formatKwanza(selectedPayslip.foodAllowanceCents)}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>—</td>
                    </tr>
                  )}
                  {selectedPayslip.transportAllowanceCents > 0 && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px" }}>Subsídio de Transporte</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{formatKwanza(selectedPayslip.transportAllowanceCents)}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>—</td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: "1px solid #f1f5f9", color: "#b91c1c" }}>
                    <td style={{ padding: "8px" }}>INSS - Segurança Social Trabalhador (3%)</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>—</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatKwanza(selectedPayslip.inssEmployeeDeductionCents)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9", color: "#b91c1c" }}>
                    <td style={{ padding: "8px" }}>IRT - Imposto sobre Rendimentos do Trabalho</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>—</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatKwanza(selectedPayslip.irtDeductionCents)}</td>
                  </tr>
                  <tr style={{ background: "#f5f3ff", fontWeight: "700" }}>
                    <td style={{ padding: "10px" }}>Total Líquido Creditado em Conta</td>
                    <td colSpan={2} style={{ padding: "10px", textAlign: "right", color: "#4c1d95", fontSize: "16px" }}>
                      {formatKwanza(selectedPayslip.netSalaryCents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. Leave Tab */}
      {activeTab === "leave" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 8px 0" }}>🏖️ Pedido de Férias ou Ausência</h3>
            <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>O seu pedido será integrado no Workflow Engine para homologação pela chefia e RH.</p>
            <form onSubmit={handleSubmitLeave} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600" }}>
                Tipo de Ausência
                <select
                  value={leaveForm.type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  <option value="VACATION">Férias Anuais Legais</option>
                  <option value="JUSTIFIED_ABSENCE">Falta Justificada</option>
                  <option value="MEDICAL">Baixa Médica / Motivo de Saúde</option>
                  <option value="MATERNITY_PATERNITY">Licença Parental</option>
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600" }}>
                  Data Início
                  <input
                    type="date"
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                    required
                    style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                  />
                </label>
                <label style={{ fontSize: "13px", fontWeight: "600" }}>
                  Data Fim
                  <input
                    type="date"
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                    required
                    style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                  />
                </label>
              </div>
              <label style={{ fontSize: "13px", fontWeight: "600" }}>
                Número de Dias Úteis
                <input
                  type="number"
                  min="1"
                  max="22"
                  value={leaveForm.daysCount}
                  onChange={(e) => setLeaveForm({ ...leaveForm, daysCount: Number(e.target.value) })}
                  required
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <label style={{ fontSize: "13px", fontWeight: "600" }}>
                Justificação / Observações
                <textarea
                  value={leaveForm.justification}
                  onChange={(e) => setLeaveForm({ ...leaveForm, justification: e.target.value })}
                  rows={3}
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <button type="submit" style={{ background: "#7c3aed", color: "#fff", border: "none", padding: "10px", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
                Submeter Pedido à Chefia
              </button>
              {message && <p style={{ color: "#166534", fontSize: "13px", fontWeight: "600" }}>{message}</p>}
            </form>
          </div>

          <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 16px 0" }}>📋 Meus Pedidos Recentes</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>Período</th>
                  <th style={{ padding: "8px" }}>Tipo</th>
                  <th style={{ padding: "8px" }}>Dias</th>
                  <th style={{ padding: "8px" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {leaveRequests.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px" }}>{r.startDate} a {r.endDate}</td>
                    <td style={{ padding: "8px" }}>{r.typeLabel}</td>
                    <td style={{ padding: "8px", fontWeight: "600" }}>{r.daysCount} d</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ background: r.status === "APPROVED" ? "#dcfce7" : "#fef3c7", color: r.status === "APPROVED" ? "#166534" : "#b45309", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                        {r.status === "APPROVED" ? "Aprovado" : "Pendente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Profile Tab */}
      {activeTab === "profile" && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0", maxWidth: "600px" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Dados Pessoais e IBAN de Vencimento</h3>
          <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Mantenha as suas informações de contacto e conta bancária atualizadas junto do RH.</p>
          <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              Telefone
              <input
                type="text"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              E-mail
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              Endereço Residencial
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              IBAN para Pagamento de Salário
              <input
                type="text"
                value={profileForm.iban}
                onChange={(e) => setProfileForm({ ...profileForm, iban: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <button type="submit" style={{ background: "#7c3aed", color: "#fff", border: "none", padding: "10px", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
              Guardar Alterações
            </button>
            {message && <p style={{ color: "#166534", fontSize: "13px", fontWeight: "600" }}>{message}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
