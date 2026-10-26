import { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";

interface Props {
  apiUrl: string;
}

export function SupplierPortal({ apiUrl }: Props) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("portal_supplier_token"));
  const [authMode, setAuthMode] = useState<"login" | "register" | "recover">("login");
  const [registerForm, setRegisterForm] = useState({
    name: "",
    nif: "",
    email: "",
    phone: "",
    contactName: "",
    iban: "",
    address: "",
  });
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [recoverIdentifier, setRecoverIdentifier] = useState("");
  const [recoverMessage, setRecoverMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "orders" | "receipts" | "submit" | "profile">("dashboard");

  const [dashboard, setDashboard] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [submitForm, setSubmitForm] = useState({
    documentType: "SUPPLIER_INVOICE",
    documentNumber: "",
    amountKz: "",
    issueDate: new Date().toISOString().slice(0, 10),
    notes: "",
    fileAttachmentUrl: "",
  });
  const [profileForm, setProfileForm] = useState({
    contactName: "",
    phone: "",
    email: "",
    address: "",
    iban: "",
  });
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
      const res = await fetch(`${apiUrl}/api/v1/portals/auth/supplier-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: nif, secret }),
      });
      if (!res.ok) {
        setLoginError("Credenciais de fornecedor inválidas.");
        return;
      }
      const data = await res.json();
      localStorage.setItem("portal_supplier_token", data.token);
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
      const res = await fetch(`${apiUrl}/api/v1/portals/auth/supplier-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Falha no registo de fornecedor.");
        return;
      }
      if (data.token) {
        localStorage.setItem("portal_supplier_token", data.token);
        setToken(data.token);
      }
      if (data.supplier?.accessCode) {
        setGeneratedCode(data.supplier.accessCode);
      }
    } catch {
      setLoginError("Erro de comunicação com o servidor ao submeter candidatura.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverMessage("");
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/auth/recover-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: recoverIdentifier, portalType: "supplier" }),
      });
      const data = await res.json();
      if (data.message) {
        setRecoverMessage(data.message);
      } else {
        setRecoverMessage("Pedido de recuperação processado com sucesso.");
      }
    } catch {
      setRecoverMessage("Falha ao contactar servidor de recuperação.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("portal_supplier_token");
    setToken(null);
    setDashboard(null);
  };

  const loadData = async () => {
    if (!token) return;
    try {
      const [dashRes, ordersRes, receiptsRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/portals/supplier/dashboard`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/supplier/orders`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/supplier/receipts`, { headers: authHeaders() }),
      ]);

      if (dashRes.ok) {
        const d = await dashRes.json();
        setDashboard(d);
        setProfileForm({
          contactName: d.contactName || "",
          phone: d.phone || "",
          email: d.email || "",
          address: d.address || "",
          iban: d.iban || "",
        });
      }
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (receiptsRes.ok) setReceipts(await receiptsRes.json());
    } catch (e) {
      console.warn("Failed to load supplier data", e);
    }
  };

  const handleSubmitDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    try {
      const amountCents = Math.round(Number(submitForm.amountKz.replace(/\./g, "").replace(",", ".")) * 100);
      const res = await fetch(`${apiUrl}/api/v1/portals/supplier/submit-document`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          documentType: submitForm.documentType,
          documentNumber: submitForm.documentNumber,
          amountCents,
          issueDate: submitForm.issueDate,
          notes: submitForm.notes,
          fileAttachmentUrl: submitForm.fileAttachmentUrl || undefined,
        }),
      });

      if (res.ok) {
        setMessage("Documento submetido com sucesso para conferência contabilística!");
        setSubmitForm({
          documentType: "SUPPLIER_INVOICE",
          documentNumber: "",
          amountKz: "",
          issueDate: new Date().toISOString().slice(0, 10),
          notes: "",
          fileAttachmentUrl: "",
        });
        setTimeout(() => setMessage(""), 5000);
      }
    } catch {
      setMessage("Falha ao submeter documento.");
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/supplier/profile`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        setMessage("Perfil de fornecedor atualizado com sucesso!");
        setTimeout(() => setMessage(""), 4000);
      }
    } catch {
      setMessage("Falha ao atualizar perfil.");
    }
  };

  useEffect(() => {
    if (token) void loadData();
  }, [token]);

  if (!token) {
    return (
      <div className="portal-container" style={{ maxWidth: "480px", margin: "40px auto", padding: "24px", background: "#fff", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
        <div style={{ background: "#ecfdf5", border: "1px solid #10b981", color: "#065f46", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🚛</span> <span>Portal do Fornecedor · Self-Service B2B VendaJá</span>
        </div>

        <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={() => { setAuthMode("login"); setLoginError(""); }}
            style={{
              padding: "8px 12px",
              background: authMode === "login" ? "#059669" : "transparent",
              color: authMode === "login" ? "#fff" : "#64748b",
              border: "none",
              borderRadius: "4px 4px 0 0",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode("register"); setLoginError(""); }}
            style={{
              padding: "8px 12px",
              background: authMode === "register" ? "#059669" : "transparent",
              color: authMode === "register" ? "#fff" : "#64748b",
              border: "none",
              borderRadius: "4px 4px 0 0",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Candidatura / Registo
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode("recover"); setRecoverMessage(""); }}
            style={{
              padding: "8px 12px",
              background: authMode === "recover" ? "#059669" : "transparent",
              color: authMode === "recover" ? "#fff" : "#64748b",
              border: "none",
              borderRadius: "4px 4px 0 0",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Recuperar Código
          </button>
        </div>

        {authMode === "login" && (
          <div>
            <h2 style={{ color: "#0f172a", marginBottom: "8px" }}>Entrar como Fornecedor</h2>
            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>Aceda às suas ordens de compra, receções e faturas.</p>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                NIF ou E-mail da Empresa
                <input
                  type="text"
                  value={nif}
                  onChange={(e) => setNif(e.target.value)}
                  placeholder="Ex: 5409112233"
                  required
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                Código de Acesso (Ex: VND-SUPP-XXXX) ou Palavra-passe
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Código de acesso do fornecedor"
                  required
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <button type="submit" disabled={loading} style={{ background: "#059669", color: "#fff", padding: "10px", border: "none", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
                {loading ? "A entrar..." : "Entrar no Portal"}
              </button>
              {loginError && <p style={{ color: "#dc2626", fontSize: "13px" }}>{loginError}</p>}
            </form>
          </div>
        )}

        {authMode === "register" && (
          <div>
            <h2 style={{ color: "#0f172a", marginBottom: "8px" }}>Registo de Fornecedor</h2>
            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>Cadastre a sua empresa para receber encomendas e submeter faturas.</p>
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                Razão Social / Nome da Empresa *
                <input
                  type="text"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  placeholder="Ex: Luanda Distribuidora Lda"
                  required
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                NIF da Empresa *
                <input
                  type="text"
                  value={registerForm.nif}
                  onChange={(e) => setRegisterForm({ ...registerForm, nif: e.target.value })}
                  placeholder="Ex: 5418902123"
                  required
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                E-mail Comercial *
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  placeholder="vendas@fornecedor.ao"
                  required
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600" }}>
                  Telefone / WhatsApp
                  <input
                    type="text"
                    value={registerForm.phone}
                    onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                    placeholder="+244 923 000 000"
                    style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600" }}>
                  Contacto Principal
                  <input
                    type="text"
                    value={registerForm.contactName}
                    onChange={(e) => setRegisterForm({ ...registerForm, contactName: e.target.value })}
                    placeholder="Nome do Gestor"
                    style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                  />
                </label>
              </div>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                IBAN Bancário (para liquidação de faturas)
                <input
                  type="text"
                  value={registerForm.iban}
                  onChange={(e) => setRegisterForm({ ...registerForm, iban: e.target.value })}
                  placeholder="AO06 0040 ..."
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                Endereço / Província
                <input
                  type="text"
                  value={registerForm.address}
                  onChange={(e) => setRegisterForm({ ...registerForm, address: e.target.value })}
                  placeholder="Ex: Viana, Luanda"
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <button type="submit" disabled={loading} style={{ background: "#059669", color: "#fff", padding: "10px", border: "none", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
                {loading ? "A registar fornecedor..." : "Concluir Candidatura de Fornecedor"}
              </button>
              {loginError && <p style={{ color: "#dc2626", fontSize: "13px" }}>{loginError}</p>}
            </form>
          </div>
        )}

        {authMode === "recover" && (
          <div>
            <h2 style={{ color: "#0f172a", marginBottom: "8px" }}>Recuperar Código de Acesso</h2>
            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>Introduza o NIF ou e-mail da sua empresa fornecedora.</p>
            <form onSubmit={handleRecover} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600" }}>
                NIF ou E-mail da Empresa
                <input
                  type="text"
                  value={recoverIdentifier}
                  onChange={(e) => setRecoverIdentifier(e.target.value)}
                  placeholder="Ex: 5409112233 ou empresa@exemplo.ao"
                  required
                  style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <button type="submit" disabled={loading} style={{ background: "#059669", color: "#fff", padding: "10px", border: "none", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
                {loading ? "A recuperar..." : "Recuperar Código de Fornecedor"}
              </button>
              {recoverMessage && <p style={{ color: "#065f46", background: "#d1fae5", padding: "8px", borderRadius: "4px", fontSize: "13px" }}>{recoverMessage}</p>}
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="portal-wrapper" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      {generatedCode && (
        <div style={{ background: "#dcfce7", border: "2px solid #22c55e", color: "#14532d", padding: "14px 18px", borderRadius: "8px", marginBottom: "20px" }}>
          <h3 style={{ margin: "0 0 6px 0", fontSize: "16px" }}>🎉 Candidatura Registada com Sucesso!</h3>
          <p style={{ margin: "0 0 6px 0", fontSize: "14px" }}>
            O seu Código de Acesso Exclusivo de Fornecedor é: <strong style={{ fontSize: "16px", letterSpacing: "1px", background: "#fff", padding: "3px 8px", borderRadius: "4px", border: "1px solid #86efac" }}>{generatedCode}</strong>
          </p>
          <small>Guarde este código em local seguro. Precisará dele para futuros inícios de sessão no Portal do Fornecedor.</small>
        </div>
      )}
      {/* Top Bar */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#064e3b", color: "#fff", padding: "14px 20px", borderRadius: "8px", marginBottom: "20px" }}>
        <div>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#6ee7b7" }}>Portal do Fornecedor Self-Service</span>
          <h2 style={{ margin: "2px 0 0 0", fontSize: "18px" }}>{dashboard?.supplierName || "Fornecedor"}</h2>
          <small style={{ color: "#a7f3d0" }}>NIF: {dashboard?.nif}</small>
        </div>
        <button onClick={handleLogout} style={{ background: "transparent", color: "#fca5a5", border: "1px solid #fca5a5", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>
          Sair
        </button>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        {[
          { key: "dashboard", label: "📊 Resumo Comercial" },
          { key: "orders", label: "📦 Encomendas de Compra (OC)" },
          { key: "receipts", label: "🚚 Receções de Mercadoria (GR)" },
          { key: "submit", label: "📤 Submeter Fatura de Fornecedor" },
          { key: "profile", label: "⚙️ Dados Cadastrais & IBAN" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === t.key ? "3px solid #059669" : "3px solid transparent",
              background: "transparent",
              color: activeTab === t.key ? "#059669" : "#64748b",
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
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#065f46" }}>Compras Totais Realizadas</span>
              <h3 style={{ margin: "6px 0", color: "#064e3b", fontSize: "20px" }}>{formatKwanza(dashboard.totalPurchasesCents)}</h3>
              <small style={{ color: "#64748b" }}>Volume de negócios transacionado</small>
            </div>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#92400e" }}>Pagamentos a Receber</span>
              <h3 style={{ margin: "6px 0", color: "#78350f", fontSize: "20px" }}>{formatKwanza(dashboard.pendingPayablesCents)}</h3>
              <small style={{ color: "#64748b" }}>Valor em processo de tesouraria</small>
            </div>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#1e40af" }}>Ordens de Compra em Aberto</span>
              <h3 style={{ margin: "6px 0", color: "#1e3a8a", fontSize: "20px" }}>{dashboard.openOrdersCount}</h3>
              <small style={{ color: "#64748b" }}>Aguardando expedição/entrega</small>
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "16px", borderRadius: "8px" }}>
              <span style={{ fontSize: "12px", color: "#475569" }}>Encomendas Entregues</span>
              <h3 style={{ margin: "6px 0", color: "#334155", fontSize: "20px" }}>{dashboard.deliveredOrdersCount}</h3>
              <small style={{ color: "#64748b" }}>Rececionadas no armazém</small>
            </div>
          </div>
        </div>
      )}

      {/* 2. Purchase Orders Tab */}
      {activeTab === "orders" && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 16px 0" }}>📦 Ordens de Compra Emitidas (OC)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#064e3b", color: "#fff", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>N.º Ordem</th>
                <th style={{ padding: "10px" }}>Data de Emissão</th>
                <th style={{ padding: "10px" }}>Linhas</th>
                <th style={{ padding: "10px", textAlign: "right" }}>Total da Ordem</th>
                <th style={{ padding: "10px" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.length ? (
                orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px", fontWeight: "600" }}>{o.number}</td>
                    <td style={{ padding: "10px", color: "#64748b" }}>{new Date(o.date).toLocaleDateString("pt-AO")}</td>
                    <td style={{ padding: "10px" }}>{o.linesCount} artigos</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: "700" }}>{formatKwanza(o.totalCostCents)}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ background: o.status === "DELIVERED" ? "#dcfce7" : "#dbeafe", color: o.status === "DELIVERED" ? "#166534" : "#1e40af", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                        {o.status === "DELIVERED" ? "Entregue" : "Aprovada / Em Aberto"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>Sem ordens de compra emitidas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Goods Receipts Tab */}
      {activeTab === "receipts" && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 16px 0" }}>🚚 Guias de Receção de Mercadoria em Armazém</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#064e3b", color: "#fff", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>N.º Guia / Receção</th>
                <th style={{ padding: "10px" }}>Ordem de Compra Origem</th>
                <th style={{ padding: "10px" }}>Data de Entrada</th>
                <th style={{ padding: "10px" }}>Estado da Receção</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length ? (
                receipts.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px", fontWeight: "600" }}>{r.number}</td>
                    <td style={{ padding: "10px" }}>{r.orderNumber}</td>
                    <td style={{ padding: "10px", color: "#64748b" }}>{new Date(r.date).toLocaleDateString("pt-AO")}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                        Conferida e Registada
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>Sem receções de mercadoria registadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Submit Invoice Tab */}
      {activeTab === "submit" && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0", maxWidth: "600px" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>📤 Submissão Eletrónica de Fatura de Fornecedor</h3>
          <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Submeta a sua fatura ou nota fiscal emitida para validação pela equipa de compras e contabilidade.</p>
          <form onSubmit={handleSubmitDocument} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              N.º da Sua Fatura
              <input
                type="text"
                value={submitForm.documentNumber}
                onChange={(e) => setSubmitForm({ ...submitForm, documentNumber: e.target.value })}
                placeholder="Ex: FAT-FORN-2026/0491"
                required
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              Valor Total da Fatura (Kz)
              <input
                type="text"
                value={submitForm.amountKz}
                onChange={(e) => setSubmitForm({ ...submitForm, amountKz: e.target.value })}
                placeholder="Ex: 15.800.000,00"
                required
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              Data de Emissão
              <input
                type="date"
                value={submitForm.issueDate}
                onChange={(e) => setSubmitForm({ ...submitForm, issueDate: e.target.value })}
                required
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              Observações / N.º da Ordem de Compra (OC)
              <textarea
                value={submitForm.notes}
                onChange={(e) => setSubmitForm({ ...submitForm, notes: e.target.value })}
                placeholder="Indique a que Ordem de Compra ou Guia corresponde esta fatura..."
                rows={3}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <button type="submit" style={{ background: "#059669", color: "#fff", border: "none", padding: "10px", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
              Submeter Documento para Validação
            </button>
            {message && <p style={{ color: "#166534", fontSize: "13px", fontWeight: "600" }}>{message}</p>}
          </form>
        </div>
      )}

      {/* 5. Profile Tab */}
      {activeTab === "profile" && (
        <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0", maxWidth: "600px" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>Dados Cadastrais e Coordenadas Bancárias</h3>
          <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Mantenha as coordenadas bancárias atualizadas para transferências automáticas de tesouraria.</p>
          <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "13px", fontWeight: "600" }}>
              Nome do Contacto Comercial
              <input
                type="text"
                value={profileForm.contactName}
                onChange={(e) => setProfileForm({ ...profileForm, contactName: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
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
              IBAN para Liquidação Bancária
              <input
                type="text"
                value={profileForm.iban}
                onChange={(e) => setProfileForm({ ...profileForm, iban: e.target.value })}
                style={{ width: "100%", padding: "8px", marginTop: "4px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </label>
            <button type="submit" style={{ background: "#059669", color: "#fff", border: "none", padding: "10px", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "8px" }}>
              Guardar Alterações
            </button>
            {message && <p style={{ color: "#166534", fontSize: "13px", fontWeight: "600" }}>{message}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
