import { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";

interface Props {
  apiUrl: string;
}

export function MobileErpApp({ apiUrl }: Props) {
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [formFactor, setFormFactor] = useState<"phone" | "tablet-portrait" | "tablet-landscape">("phone");
  const [activeTab, setActiveTab] = useState<"cockpit" | "approvals" | "crm" | "pos-tablet" | "push" | "offline">("cockpit");
  const [isOnline, setIsOnline] = useState(true);

  // Data states
  const [dashboard, setDashboard] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  // Tablet POS Products & Cart State
  const [posProducts] = useState<Array<{ id: string; name: string; sku: string; priceCents: number; category: string }>>([
    { id: "prd-01", name: "Leite UHT Gira 1L", sku: "LEI-001", priceCents: 125000, category: "Alimentar" },
    { id: "prd-02", name: "Arroz Agulha 5Kg", sku: "ARR-001", priceCents: 490000, category: "Alimentar" },
    { id: "prd-03", name: "Óleo Alimentar 1L", sku: "OLE-001", priceCents: 215000, category: "Alimentar" },
    { id: "prd-04", name: "Água Pura Chela 500ml", sku: "AGU-002", priceCents: 35000, category: "Bebidas" },
    { id: "prd-05", name: "Cuca Branca 33cl", sku: "CER-001", priceCents: 45000, category: "Bebidas" },
    { id: "prd-06", name: "Sumo Compal Laranja 1L", sku: "SUM-001", priceCents: 135000, category: "Bebidas" },
  ]);
  const [posCart, setPosCart] = useState<Array<{ id: string; name: string; priceCents: number; quantity: number }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // CRM Form state
  const [visitForm, setVisitForm] = useState({
    customerId: "",
    customerName: "",
    latitude: -8.8147,
    longitude: 13.2302,
    notes: "",
    outcome: "SALE_CLOSED",
  });

  // Push Device state
  const [deviceForm, setDeviceForm] = useState({
    deviceId: "android-pixel-9-uuid-001",
    pushToken: "fcm-token-live-mobile-2026",
    model: "Google Pixel 9 Pro",
    appVersion: "2.2.2-rc.3",
  });

  const authHeaders = () => {
    let token = "";
    if (typeof localStorage !== "undefined") {
      token = localStorage.getItem("accessToken") || "";
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const addToCart = (product: { id: string; name: string; priceCents: number }) => {
    setPosCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    setPosCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const handlePosCheckout = () => {
    if (posCart.length === 0) return;
    const totalCents = posCart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
    const saleIdempotencyKey = `sale-mob-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const saleMutation = {
      idempotencyKey: saleIdempotencyKey,
      entity: "POS_SALE",
      operation: "CREATE",
      payload: {
        totalCents,
        lines: posCart.map((item) => ({ productId: item.id, name: item.name, quantity: item.quantity, priceCents: item.priceCents })),
        occurredAt: new Date().toISOString(),
        paymentMethod: "TPA_MULTICAIXA",
      },
      occurredAt: new Date().toISOString(),
    };

    if (!isOnline) {
      setOfflineQueue((prev) => [...prev, saleMutation]);
      setMessage(`Venda de ${formatKwanza(totalCents)} emitida em modo offline. Gravada na fila de sincronização.`);
    } else {
      setMessage(`Venda de ${formatKwanza(totalCents)} concluída com sucesso via TPA Multicaixa!`);
    }

    setPosCart([]);
    setTimeout(() => setMessage(""), 4500);
  };

  const loadData = async () => {
    try {
      const [dashRes, apprRes, devRes, visitsRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/portals/mobile/executive-dashboard`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/mobile/approvals`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/mobile/devices`, { headers: authHeaders() }),
        fetch(`${apiUrl}/api/v1/portals/mobile/crm/visits`, { headers: authHeaders() }),
      ]);

      if (dashRes.ok) setDashboard(await dashRes.json());
      if (apprRes.ok) setApprovals(await apprRes.json());
      if (devRes.ok) setDevices(await devRes.json());
      if (visitsRes.ok) setVisits(await visitsRes.json());
    } catch (e) {
      console.warn("Failed to load mobile data", e);
    }
  };

  const handleApprovalAction = async (id: string, action: "APPROVE" | "REJECT" | "REQUEST_REVISION") => {
    if (!isOnline) {
      // Queue offline
      const mut = {
        idempotencyKey: `mut-appr-${Date.now()}`,
        entity: "APPROVAL_ACTION",
        operation: "UPDATE",
        payload: { approvalId: id, action, comment: "Aprovado em modo offline" },
        occurredAt: new Date().toISOString(),
      };
      setOfflineQueue((prev) => [...prev, mut]);
      setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: action === "APPROVE" ? "APPROVED" : "REJECTED" } : a)));
      setMessage("Ação gravada na fila offline. Sincronizará quando restabelecer ligação.");
      setTimeout(() => setMessage(""), 4000);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/mobile/approvals/${id}/action`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action, comment: `Ação mobile executada via ${platform.toUpperCase()}` }),
      });
      if (res.ok) {
        const data = await res.json();
        setApprovals((prev) => prev.map((a) => (a.id === id ? data.item : a)));
        setMessage(`Aprovação processada com sucesso: ${action}!`);
        setTimeout(() => setMessage(""), 4000);
      }
    } catch {
      setMessage("Erro ao processar aprovação.");
    }
  };

  const handleRegisterVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      // Queue offline mutation
      const mut = {
        idempotencyKey: `mut-visit-${Date.now()}`,
        entity: "CRM_VISIT",
        operation: "CREATE",
        payload: { ...visitForm },
        occurredAt: new Date().toISOString(),
      };
      setOfflineQueue((prev) => [...prev, mut]);
      setVisits((prev) => [
        {
          id: `off-${Date.now()}`,
          customerName: visitForm.customerName,
          latitude: visitForm.latitude,
          longitude: visitForm.longitude,
          outcome: visitForm.outcome,
          notes: visitForm.notes,
          visitedAt: "Gravado Offline",
        },
        ...prev,
      ]);
      setVisitForm((prev) => ({ ...prev, notes: "" }));
      setMessage("Visita gravada localmente em modo offline. Aguardando sincronização.");
      setTimeout(() => setMessage(""), 4000);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/mobile/crm/visits`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(visitForm),
      });
      if (res.ok) {
        const newVisit = await res.json();
        setVisits((prev) => [newVisit, ...prev]);
        setVisitForm((prev) => ({ ...prev, notes: "" }));
        setMessage("Visita comercial georreferenciada registada com sucesso!");
        setTimeout(() => setMessage(""), 4000);
      }
    } catch {
      setMessage("Falha ao registar visita.");
    }
  };

  const handleRegisterDevice = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/mobile/devices/register`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          ...deviceForm,
          platform,
        }),
      });
      if (res.ok) {
        setMessage(`Dispositivo ${platform.toUpperCase()} registado com sucesso para Notificações Push!`);
        void loadData();
        setTimeout(() => setMessage(""), 4000);
      }
    } catch {
      setMessage("Falha ao registar dispositivo.");
    }
  };

  const handleSyncOffline = async () => {
    if (offlineQueue.length === 0) {
      setMessage("Fila offline vazia. Nenhuma alteração pendente.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/v1/portals/mobile/sync`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ mutations: offlineQueue }),
      });
      if (res.ok) {
        const result = await res.json();
        setMessage(`Sincronização concluída! ${result.accepted.length} mutações integradas com sucesso.`);
        setOfflineQueue([]);
        void loadData();
        setTimeout(() => setMessage(""), 5000);
      }
    } catch {
      setMessage("Falha ao sincronizar lote offline.");
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "20px", background: "#0b132b", minHeight: "85vh" }}>
      {/* Device Frame (Adaptive Smartphone vs Tablet POS) */}
      <div
        style={{
          width: "100%",
          maxWidth: formFactor === "tablet-landscape" ? "1080px" : formFactor === "tablet-portrait" ? "768px" : "414px",
          background: "#fff",
          borderRadius: formFactor === "phone" ? (platform === "ios" ? "42px" : "28px") : "16px",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 10px #1e293b",
          display: "flex",
          flexDirection: "column",
          minHeight: formFactor === "tablet-landscape" ? "680px" : "750px",
          position: "relative",
          transition: "max-width 0.25s ease",
        }}
      >
        {/* Notch / Status Bar */}
        <div style={{ background: "#0f172a", color: "#fff", padding: "10px 16px 6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", fontWeight: "600" }}>
          <span>09:41 · {formFactor === "tablet-landscape" ? "Tablet POS (Paisagem)" : formFactor === "tablet-portrait" ? "Tablet (Retrato)" : "Mobile (414px)"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ background: isOnline ? "#10b981" : "#f59e0b", color: "#000", padding: "1px 6px", borderRadius: "10px", fontSize: "9px", fontWeight: "700" }}>
              {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
            <span>📶 5G</span>
            <span>🔋 100%</span>
          </div>
        </div>

        {/* Simulator Controls Bar */}
        <div style={{ background: "#1e293b", color: "#94a3b8", padding: "8px 14px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "8px", fontSize: "11px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            SO:
            <button
              onClick={() => setPlatform("android")}
              style={{ background: platform === "android" ? "#3b82f6" : "transparent", color: "#fff", border: "1px solid #475569", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}
              aria-label="Plataforma Android"
            >
              Android
            </button>
            <button
              onClick={() => setPlatform("ios")}
              style={{ background: platform === "ios" ? "#3b82f6" : "transparent", color: "#fff", border: "1px solid #475569", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}
              aria-label="Plataforma iOS"
            >
              iOS
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            Formato:
            <button
              onClick={() => setFormFactor("phone")}
              style={{ background: formFactor === "phone" ? "#0284c7" : "transparent", color: "#fff", border: "1px solid #475569", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}
              aria-label="Formato Smartphone"
            >
              📱 Phone
            </button>
            <button
              onClick={() => setFormFactor("tablet-portrait")}
              style={{ background: formFactor === "tablet-portrait" ? "#0284c7" : "transparent", color: "#fff", border: "1px solid #475569", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}
              aria-label="Formato Tablet Retrato"
            >
              📋 Tablet Retrato
            </button>
            <button
              onClick={() => { setFormFactor("tablet-landscape"); setActiveTab("pos-tablet"); }}
              style={{ background: formFactor === "tablet-landscape" ? "#0284c7" : "transparent", color: "#fff", border: "1px solid #475569", padding: "3px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "11px" }}
              aria-label="Formato Tablet POS Paisagem"
            >
              📟 Tablet POS (Paisagem)
            </button>
          </div>
          <div>
            <button
              onClick={() => setIsOnline(!isOnline)}
              style={{ background: isOnline ? "#059669" : "#dc2626", color: "#fff", border: "none", padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontWeight: 600 }}
              aria-label="Alternar estado de rede"
            >
              {isOnline ? "Simular Queda de Rede" : "Restabelecer Ligação"}
            </button>
          </div>
        </div>

        {/* App Header */}
        <div style={{ background: "#1e1b4b", color: "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "#a5b4fc" }}>VendaJá Angola ERP Mobile</span>
            <h3 style={{ margin: "2px 0 0 0", fontSize: "16px" }}>Cockpit Executivo</h3>
          </div>
          {offlineQueue.length > 0 && (
            <span style={{ background: "#f59e0b", color: "#000", padding: "2px 8px", borderRadius: "12px", fontSize: "10px", fontWeight: "700" }}>
              {offlineQueue.length} na fila
            </span>
          )}
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px", background: "#f8fafc" }}>
          {message && (
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", marginBottom: "12px" }}>
              {message}
            </div>
          )}

          {/* TAB 1: COCKPIT */}
          {activeTab === "cockpit" && dashboard && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                <div style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <small style={{ color: "#64748b", fontSize: "11px" }}>Vendas Hoje</small>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "#1e3a8a", marginTop: "2px" }}>
                    {formatKwanza(dashboard.kpis.todaySalesCents)}
                  </div>
                  <span style={{ fontSize: "10px", color: "#059669", fontWeight: "600" }}>+14.2% vs ontem</span>
                </div>
                <div style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <small style={{ color: "#64748b", fontSize: "11px" }}>Vendas do Mês</small>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "#1e3a8a", marginTop: "2px" }}>
                    {formatKwanza(dashboard.kpis.monthSalesCents)}
                  </div>
                  <span style={{ fontSize: "10px", color: "#059669", fontWeight: "600" }}>Margem: {dashboard.kpis.estimatedMarginPercent}%</span>
                </div>
                <div style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <small style={{ color: "#64748b", fontSize: "11px" }}>Caixa Disponível</small>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "#065f46", marginTop: "2px" }}>
                    {formatKwanza(dashboard.kpis.cashAvailableCents)}
                  </div>
                </div>
                <div style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <small style={{ color: "#64748b", fontSize: "11px" }}>A Receber / A Pagar</small>
                  <div style={{ fontSize: "12px", fontWeight: "700", marginTop: "2px" }}>
                    <span style={{ color: "#059669" }}>{formatKwanza(dashboard.kpis.receivablesOpenCents)}</span><br />
                    <span style={{ color: "#b91c1c" }}>{formatKwanza(dashboard.kpis.payablesOpenCents)}</span>
                  </div>
                </div>
              </div>

              {/* Weekly Mini Chart */}
              <div style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a" }}>Evolução Semanal de Vendas</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: "80px", marginTop: "10px", paddingBottom: "6px", borderBottom: "1px solid #e2e8f0" }}>
                  {dashboard.charts.weeklyTrend.map((d: any) => {
                    const heightPercent = Math.max(15, (d.amountCents / 26_900_000_00) * 100);
                    return (
                      <div key={d.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                        <div style={{ width: "22px", height: `${heightPercent}%`, background: "#3b82f6", borderRadius: "3px 3px 0 0" }} />
                        <span style={{ fontSize: "10px", color: "#64748b" }}>{d.day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: APPROVALS */}
          {activeTab === "approvals" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "13px", fontWeight: "700" }}>Aprovações Pendentes ({approvals.filter((a) => a.status === "PENDING").length})</span>
                <small style={{ color: "#64748b" }}>Aprovação direta de 1 clique</small>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {approvals.map((item) => (
                  <div key={item.id} style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                      <span style={{ background: "#e0e7ff", color: "#3730a3", fontSize: "10px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px" }}>
                        {item.categoryLabel}
                      </span>
                      <span style={{ fontSize: "10px", fontWeight: "600", color: item.status === "APPROVED" ? "#166534" : item.status === "REJECTED" ? "#991b1b" : "#b45309" }}>
                        {item.status}
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#0f172a" }}>{item.title}</div>
                    <small style={{ color: "#64748b" }}>Solicitante: {item.requesterName} ({item.department})</small>
                    {item.amountCents && (
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#047857", margin: "4px 0" }}>
                        {formatKwanza(item.amountCents)}
                      </div>
                    )}

                    {item.status === "PENDING" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "8px" }}>
                        <button
                          onClick={() => void handleApprovalAction(item.id, "APPROVE")}
                          style={{ background: "#10b981", color: "#fff", border: "none", padding: "6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
                        >
                          ✓ Aprovar
                        </button>
                        <button
                          onClick={() => void handleApprovalAction(item.id, "REJECT")}
                          style={{ background: "#ef4444", color: "#fff", border: "none", padding: "6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
                        >
                          ✕ Rejeitar
                        </button>
                        <button
                          onClick={() => void handleApprovalAction(item.id, "REQUEST_REVISION")}
                          style={{ background: "#f59e0b", color: "#fff", border: "none", padding: "6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
                        >
                          ✎ Rever
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MOBILE CRM */}
          {activeTab === "crm" && (
            <div>
              <div style={{ background: "#fff", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>📍 Registar Visita a Cliente</span>
                <form onSubmit={handleRegisterVisit} style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                  <label style={{ fontSize: "11px", fontWeight: "600" }}>
                    Cliente:
                    <input
                      type="text"
                      value={visitForm.customerName}
                      onChange={(e) => setVisitForm({ ...visitForm, customerName: e.target.value })}
                      required
                      style={{ width: "100%", padding: "6px", marginTop: "2px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                    />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
                    <div>
                      <small style={{ color: "#64748b" }}>Latitude (GPS):</small>
                      <input
                        type="number"
                        step="any"
                        value={visitForm.latitude}
                        onChange={(e) => setVisitForm({ ...visitForm, latitude: Number(e.target.value) })}
                        style={{ width: "100%", padding: "6px", marginTop: "2px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <small style={{ color: "#64748b" }}>Longitude (GPS):</small>
                      <input
                        type="number"
                        step="any"
                        value={visitForm.longitude}
                        onChange={(e) => setVisitForm({ ...visitForm, longitude: Number(e.target.value) })}
                        style={{ width: "100%", padding: "6px", marginTop: "2px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                      />
                    </div>
                  </div>
                  <label style={{ fontSize: "11px", fontWeight: "600" }}>
                    Resultado da Reunião:
                    <select
                      value={visitForm.outcome}
                      onChange={(e) => setVisitForm({ ...visitForm, outcome: e.target.value as any })}
                      style={{ width: "100%", padding: "6px", marginTop: "2px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                    >
                      <option value="SALE_CLOSED">Venda Fechada / Adjudicada</option>
                      <option value="PROPOSAL_REQUESTED">Proposta Solicitada</option>
                      <option value="FOLLOW_UP_NEEDED">Necessário Follow-up</option>
                      <option value="NOT_INTERESTED">Sem Interesse</option>
                    </select>
                  </label>
                  <label style={{ fontSize: "11px", fontWeight: "600" }}>
                    Notas da Visita:
                    <textarea
                      value={visitForm.notes}
                      onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })}
                      placeholder="Resumo dos pontos tratados com o cliente..."
                      rows={2}
                      required
                      style={{ width: "100%", padding: "6px", marginTop: "2px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                    />
                  </label>
                  <button type="submit" style={{ background: "#2563eb", color: "#fff", border: "none", padding: "8px", borderRadius: "4px", fontWeight: "600", fontSize: "12px", cursor: "pointer", marginTop: "4px" }}>
                    💾 Registar Visita Presencial
                  </button>
                </form>
              </div>

              {/* Recorded Visits */}
              <span style={{ fontSize: "12px", fontWeight: "700" }}>Visitas Registadas Recentemente</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                {visits.map((v) => (
                  <div key={v.id} style={{ background: "#fff", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <b style={{ fontSize: "12px" }}>{v.customerName}</b>
                      <span style={{ fontSize: "10px", background: "#dbeafe", color: "#1e40af", padding: "1px 6px", borderRadius: "4px" }}>
                        {v.outcome}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0", fontSize: "11px", color: "#475569" }}>{v.notes}</p>
                    <small style={{ color: "#94a3b8", fontSize: "10px" }}>GPS: ({v.latitude}, {v.longitude}) · {v.visitedAt}</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: POS TABLET (Touch-First & Accessible) */}
          {activeTab === "pos-tablet" && (
            <div role="region" aria-label="Módulo POS Tablet">
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Terminal de Venda Rápida (Tablet POS)</h4>
                  <small style={{ color: "#64748b" }}>Interface touch com botões ampliados (mín. 44x44px) e acessibilidade WCAG</small>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  {["ALL", "Alimentar", "Bebidas"].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: "6px 12px",
                        minHeight: "44px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: selectedCategory === cat ? "#0284c7" : "#fff",
                        color: selectedCategory === cat ? "#fff" : "#334155",
                        fontWeight: 600,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                      aria-label={`Filtrar categoria ${cat}`}
                    >
                      {cat === "ALL" ? "Todos os Produtos" : cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Responsive Split Layout */}
              <div style={{ display: "grid", gridTemplateColumns: formFactor === "tablet-landscape" ? "1.4fr 1fr" : "1fr", gap: "12px" }}>
                {/* Product Catalog Grid */}
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: formFactor === "tablet-landscape" ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: "10px" }}>
                    {posProducts
                      .filter((p) => selectedCategory === "ALL" || p.category === selectedCategory)
                      .map((product) => (
                        <button
                          key={product.id}
                          onClick={() => addToCart(product)}
                          style={{
                            background: "#fff",
                            border: "2px solid #e2e8f0",
                            borderRadius: "8px",
                            padding: "12px",
                            minHeight: "84px",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            textAlign: "left",
                            cursor: "pointer",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          }}
                          aria-label={`Adicionar ${product.name} ao carrinho por ${formatKwanza(product.priceCents)}`}
                        >
                          <div>
                            <span style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>{product.sku}</span>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>{product.name}</div>
                          </div>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "#0284c7", marginTop: "6px" }}>
                            {formatKwanza(product.priceCents)}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Cart & Ticket Section */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", minHeight: "320px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px", marginBottom: "8px" }}>
                    <strong style={{ fontSize: "13px", color: "#0f172a" }}>Talão Atual ({posCart.reduce((s, i) => s + i.quantity, 0)} itens)</strong>
                    {posCart.length > 0 && (
                      <button
                        onClick={() => setPosCart([])}
                        style={{ border: "none", background: "transparent", color: "#dc2626", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}
                        aria-label="Limpar talão atual"
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {posCart.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#94a3b8", padding: "30px 0", fontSize: "12px" }}>
                        Talão vazio. Toque nos produtos para registar itens.
                      </div>
                    ) : (
                      posCart.map((item) => (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px dashed #f1f5f9" }}>
                          <div style={{ flex: 1, paddingRight: "8px" }}>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{item.name}</div>
                            <small style={{ color: "#64748b" }}>{formatKwanza(item.priceCents)} un.</small>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <button
                              onClick={() => updateCartQty(item.id, -1)}
                              style={{ width: "44px", height: "44px", minWidth: "44px", minHeight: "44px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "18px", fontWeight: 700, cursor: "pointer" }}
                              aria-label={`Diminuir quantidade de ${item.name}`}
                            >
                              -
                            </button>
                            <span style={{ minWidth: "22px", textAlign: "center", fontWeight: 700, fontSize: "13px" }}>{item.quantity}</span>
                            <button
                              onClick={() => updateCartQty(item.id, 1)}
                              style={{ width: "44px", height: "44px", minWidth: "44px", minHeight: "44px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "18px", fontWeight: 700, cursor: "pointer" }}
                              aria-label={`Aumentar quantidade de ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Summary & Checkout */}
                  <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: "10px", marginTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 800, marginBottom: "10px" }}>
                      <span>Total a Cobrar:</span>
                      <span style={{ color: "#047857" }}>
                        {formatKwanza(posCart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0))}
                      </span>
                    </div>

                    <button
                      onClick={handlePosCheckout}
                      disabled={posCart.length === 0}
                      style={{
                        width: "100%",
                        minHeight: "48px",
                        background: posCart.length > 0 ? "#059669" : "#94a3b8",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: 700,
                        cursor: posCart.length > 0 ? "pointer" : "not-allowed",
                        boxShadow: posCart.length > 0 ? "0 4px 6px -1px rgba(5, 150, 105, 0.4)" : "none",
                      }}
                      aria-label="Cobrar talão via TPA Multicaixa"
                    >
                      💳 Cobrar TPA Multicaixa ({formatKwanza(posCart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0))})
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PUSH NOTIFICATIONS */}
          {activeTab === "push" && (
            <div>
              <div style={{ background: "#fff", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                <span style={{ fontSize: "13px", fontWeight: "700" }}>🔔 Registo de Token Push ({platform.toUpperCase()})</span>
                <p style={{ color: "#64748b", fontSize: "11px", margin: "4px 0 10px 0" }}>
                  Associe este telemóvel ao canal APNs (Apple) ou FCM (Google) para receção imediata de aprovações e alertas.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
                  <div>
                    <small style={{ color: "#64748b" }}>Modelo do Smartphone:</small>
                    <input
                      type="text"
                      value={deviceForm.model}
                      onChange={(e) => setDeviceForm({ ...deviceForm, model: e.target.value })}
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <div>
                    <small style={{ color: "#64748b" }}>Token Push:</small>
                    <input
                      type="text"
                      value={deviceForm.pushToken}
                      onChange={(e) => setDeviceForm({ ...deviceForm, pushToken: e.target.value })}
                      style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <button
                    onClick={() => void handleRegisterDevice()}
                    style={{ background: "#7c3aed", color: "#fff", border: "none", padding: "8px", borderRadius: "4px", fontWeight: "600", cursor: "pointer", marginTop: "4px" }}
                  >
                    Registar Dispositivo para Push
                  </button>
                </div>
              </div>

              <span style={{ fontSize: "12px", fontWeight: "700" }}>Dispositivos Móveis Autorizados ({devices.length})</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                {devices.map((d) => (
                  <div key={d.id} style={{ background: "#fff", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "12px" }}>
                    <b>{d.model}</b> <small style={{ color: "#64748b" }}>({d.platform.toUpperCase()})</small>
                    <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>Token: <code>{d.pushToken.slice(0, 20)}...</code></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: OFFLINE SYNC */}
          {activeTab === "offline" && (
            <div>
              <div style={{ background: "#fff", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                <span style={{ fontSize: "13px", fontWeight: "700" }}>🔄 Sincronização e Modo Offline</span>
                <p style={{ color: "#64748b", fontSize: "11px", margin: "4px 0 12px 0" }}>
                  O ERP móvel funciona sem ligação à Internet. As aprovações e visitas são guardadas localmente.
                </p>

                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0", marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "600" }}>
                    <span>Mutações na Fila Offline:</span>
                    <span style={{ color: offlineQueue.length > 0 ? "#b45309" : "#059669" }}>{offlineQueue.length} operações</span>
                  </div>
                </div>

                <button
                  onClick={() => void handleSyncOffline()}
                  disabled={offlineQueue.length === 0}
                  style={{
                    width: "100%",
                    background: offlineQueue.length > 0 ? "#2563eb" : "#94a3b8",
                    color: "#fff",
                    border: "none",
                    padding: "10px",
                    borderRadius: "4px",
                    fontWeight: "600",
                    cursor: offlineQueue.length > 0 ? "pointer" : "not-allowed",
                  }}
                >
                  Sincronizar Fila Offline Imediatamente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Mobile Tab Bar */}
        <nav style={{ background: "#fff", borderTop: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", padding: "6px 0" }}>
          {[
            { key: "cockpit", label: "Cockpit", icon: "📊" },
            { key: "pos-tablet", label: "POS", icon: "📟" },
            { key: "approvals", label: "Aprovações", icon: "✓" },
            { key: "crm", label: "CRM", icon: "📍" },
            { key: "push", label: "Alertas", icon: "🔔" },
            { key: "offline", label: "Sync", icon: "🔄" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              style={{
                background: "transparent",
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                color: activeTab === t.key ? "#2563eb" : "#64748b",
                fontWeight: activeTab === t.key ? "700" : "500",
                fontSize: "10px",
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              <span style={{ fontSize: "16px" }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
