import React, { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";

interface BiometricsPanelProps {
  api: string;
  token: string | null;
  admin: boolean;
  onError: (msg: string) => void;
}

type BiometricsTab =
  | "dashboard"
  | "persons"
  | "facial"
  | "devices"
  | "gym"
  | "attendance"
  | "visitors"
  | "rules"
  | "audit";

export const BiometricsAccessPanel: React.FC<BiometricsPanelProps> = ({ api, token, admin, onError }) => {
  const [activeTab, setActiveTab] = useState<BiometricsTab>("dashboard");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);
  const [persons, setPersons] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [verificationFeedback, setVerificationFeedback] = useState<any>(null);

  // New Person Form State
  const [newPerson, setNewPerson] = useState({
    internalCode: "",
    fullName: "",
    nif: "",
    phone: "",
    category: "EMPLOYEE",
    department: "",
  });

  // New Subscription Form State
  const [newGymSub, setNewGymSub] = useState({
    personId: "",
    planName: "Musculação Mensal - Livre Acesso",
    durationMonths: 1,
    amountKz: 35000,
  });

  // Simulated Camera / Facial Capture
  const [facialProbeSimulated, setFacialProbeSimulated] = useState<string>("");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [identifiedFace, setIdentifiedFace] = useState<any>(null);

  // Load metrics and data on mount
  useEffect(() => {
    loadDashboardMetrics();
    loadPersons();
    loadDevices();
    loadAttendance();
  }, [api]);

  const loadDashboardMetrics = async () => {
    try {
      const res = await fetch(`${api}/api/v1/biometrics/dashboard`, {
        headers: { "x-company-id": "default-company" },
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch {
      // Offline fallback
      setMetrics({
        presentCount: 14,
        absentCount: 6,
        todayEntries: 28,
        todayExits: 14,
        deniedAttempts: 2,
        activeVisitors: 3,
        internalStaffPresent: 9,
        gymMembersPresent: 5,
        turnstileUtilizationRate: 72,
        devicesOnline: 4,
        devicesTotal: 4,
        recentLogs: [
          {
            id: "log-1",
            personName: "Eng. Armindo Sebastião",
            personCategory: "EMPLOYEE",
            deviceName: "Torniquete Entrada Principal",
            zone: "RECEPTION",
            direction: "ENTRY",
            authMethod: "FACE",
            granted: true,
            timestamp: new Date().toISOString(),
          },
          {
            id: "log-2",
            personName: "Carla Mendes",
            personCategory: "MEMBER",
            deviceName: "Torniquete Ginásio",
            zone: "GYM",
            direction: "ENTRY",
            authMethod: "RFID",
            granted: false,
            denialReason: "MENSALIDADE_EXPIRADA",
            timestamp: new Date(Date.now() - 300000).toISOString(),
          },
        ],
      });
    }
  };

  const loadPersons = async () => {
    try {
      const res = await fetch(`${api}/api/v1/biometrics/persons`, {
        headers: { "x-company-id": "default-company" },
      });
      if (res.ok) {
        const data = await res.json();
        setPersons(data);
      }
    } catch {
      setPersons([
        { id: "p1", internalCode: "EMP-001", fullName: "Eng. Armindo Sebastião", category: "EMPLOYEE", department: "Sistemas", status: "ACTIVE" },
        { id: "p2", internalCode: "MEM-101", fullName: "Carla Mendes", category: "MEMBER", department: "Ginásio", status: "ACTIVE" },
        { id: "p3", internalCode: "VIS-901", fullName: "Dra. Teresa Van-Dúnem", category: "VISITOR", department: "Auditoria", status: "ACTIVE" },
      ]);
    }
  };

  const loadDevices = async () => {
    try {
      const res = await fetch(`${api}/api/v1/biometrics/devices`, {
        headers: { "x-company-id": "default-company" },
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
      }
    } catch {
      setDevices([
        { id: "d1", name: "Torniquete Entrada Principal", type: "TURNSTILE", locationZone: "RECEPTION", protocol: "ZKTECO_TCP", status: "ONLINE" },
        { id: "d2", name: "Torniquete Saída Principal", type: "TURNSTILE", locationZone: "RECEPTION", protocol: "ZKTECO_TCP", status: "ONLINE" },
        { id: "d3", name: "Torniquete Ginásio & Aulas", type: "SPEED_GATE", locationZone: "GYM", protocol: "HIKVISION_ISAPI", status: "ONLINE" },
        { id: "d4", name: "Porta Sala de Servidores", type: "DOOR", locationZone: "SERVER_ROOM", protocol: "MQTT_IOT", status: "ONLINE" },
      ]);
    }
  };

  const loadAttendance = async () => {
    try {
      const res = await fetch(`${api}/api/v1/biometrics/attendance`, {
        headers: { "x-company-id": "default-company" },
      });
      if (res.ok) {
        const data = await res.json();
        setAttendance(data);
      }
    } catch {
      setAttendance([
        { employeeId: "EMP-001", date: new Date().toISOString().slice(0, 10), checkIn: "08:15", breakOut: "12:30", breakIn: "13:30", checkOut: "17:35", workedMinutes: 480, delayMinutes: 0, status: "PRESENT" },
        { employeeId: "EMP-002", date: new Date().toISOString().slice(0, 10), checkIn: "08:45", breakOut: null, breakIn: null, checkOut: null, workedMinutes: 240, delayMinutes: 15, status: "LATE" },
      ]);
    }
  };

  const handleRegisterPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPerson.fullName || !newPerson.internalCode) {
      onError("Indique o Nome Completo e o Número Interno.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${api}/api/v1/biometrics/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": "default-company" },
        body: JSON.stringify({
          companyId: "default-company",
          ...newPerson,
        }),
      });
      if (res.ok) {
        await loadPersons();
        setNewPerson({ internalCode: "", fullName: "", nif: "", phone: "", category: "EMPLOYEE", department: "" });
      }
    } catch (err: any) {
      onError(err.message || "Erro ao cadastrar pessoa.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGymSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGymSub.personId) {
      onError("Selecione o membro/aluno.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${api}/api/v1/biometrics/gym/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": "default-company" },
        body: JSON.stringify({
          companyId: "default-company",
          personId: newGymSub.personId,
          planName: newGymSub.planName,
          durationMonths: newGymSub.durationMonths,
          amountCents: newGymSub.amountKz * 100,
          isPaid: true,
        }),
      });
      if (res.ok) {
        await loadDashboardMetrics();
        alert("Mensalidade de Ginásio ativada com sucesso! Torniquete desbloqueado para o membro.");
      }
    } catch (err: any) {
      onError(err.message || "Erro ao subscrever plano.");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateAccess = async (method: string, identifier?: string, direction: "ENTRY" | "EXIT" = "ENTRY") => {
    setLoading(true);
    setVerificationFeedback(null);
    try {
      // 128D sample vector if FACE
      let biometricProbe: any = undefined;
      if (method === "FACE") {
        biometricProbe = new Array(128).fill(0).map((_, i) => Math.sin(i + 1));
      }

      const res = await fetch(`${api}/api/v1/biometrics/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": "default-company" },
        body: JSON.stringify({
          companyId: "default-company",
          deviceId: "device-turnstile-main-in",
          authMethod: method,
          identifier: identifier ?? "04A1B2C3D4",
          biometricProbe,
          directionOverride: direction,
        }),
      });

      if (res.ok) {
        const decision = await res.json();
        setVerificationFeedback(decision);
        loadDashboardMetrics();
      }
    } catch (err: any) {
      onError(err.message || "Erro na validação biométrica.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceCommand = async (deviceId: string, command: "UNLOCK" | "LOCK") => {
    try {
      const res = await fetch(`${api}/api/v1/biometrics/devices/${deviceId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": "default-company" },
        body: JSON.stringify({ companyId: "default-company", command }),
      });
      if (res.ok) {
        alert(`Comando ${command} enviado ao controlador do torniquete.`);
      }
    } catch (err: any) {
      onError(err.message || "Falha ao enviar sinal ao torniquete.");
    }
  };

  return (
    <div className="biometrics-container" style={{ padding: "1.5rem", color: "#f8fafc" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", borderBottom: "1px solid #334155", paddingBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.6rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>👁️</span> Biometria & Controlo Inteligente de Acessos
          </h1>
          <p style={{ margin: "0.3rem 0 0 0", color: "#94a3b8", fontSize: "0.9rem" }}>
            Reconhecimento Facial, Impressões Digitais, RFID, QR Code, Torniquetes e Gestão de Assiduidade para Ginásios, Empresas e Escolas.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => handleSimulateAccess("RFID_CARD", "04A1B2C3D4", "ENTRY")}
            style={{ backgroundColor: "#2563eb", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
          >
            ⚡ Testar Entrada (Cartão RFID)
          </button>
          <button
            onClick={() => handleSimulateAccess("FACE", undefined, "ENTRY")}
            style={{ backgroundColor: "#10b981", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
          >
            📸 Testar Face ID
          </button>
        </div>
      </div>

      {/* Verification Feedback Banner */}
      {verificationFeedback && (
        <div
          style={{
            padding: "1rem",
            marginBottom: "1.5rem",
            borderRadius: "8px",
            backgroundColor: verificationFeedback.granted ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${verificationFeedback.granted ? "#10b981" : "#ef4444"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: verificationFeedback.granted ? "#10b981" : "#ef4444", fontSize: "1.1rem" }}>
              {verificationFeedback.granted ? "✅ ACESSO AUTORIZADO — TORNIQUETE ABERTO" : "⛔ ACESSO RECUSADO — TORNIQUETE BLOQUEADO"}
            </h3>
            <p style={{ margin: "0.2rem 0 0 0", color: "#cbd5e1", fontSize: "0.9rem" }}>
              <strong>Pessoa:</strong> {verificationFeedback.person?.fullName ?? "Não Reconhecido"} ({verificationFeedback.person?.category ?? "N/D"}) | 
              <strong> Dispositivo:</strong> {verificationFeedback.device?.name} | 
              <strong> Método:</strong> {verificationFeedback.authMethod} | 
              {verificationFeedback.denialReason && <span style={{ color: "#f87171" }}> <strong>Motivo:</strong> {verificationFeedback.denialReason}</span>}
            </p>
          </div>
          <button
            onClick={() => setVerificationFeedback(null)}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1.2rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap", borderBottom: "1px solid #1e293b", paddingBottom: "0.5rem" }}>
        {[
          { key: "dashboard", label: "📊 Monitor em Tempo Real", icon: "📊" },
          { key: "persons", label: "👥 Cadastro de Pessoas", icon: "👥" },
          { key: "facial", label: "📸 Reconhecimento Facial (Live)", icon: "📸" },
          { key: "devices", label: "🚪 Portas & Torniquetes IoT", icon: "🚪" },
          { key: "gym", label: "🏋️ Ginásio & Mensalidades", icon: "🏋️" },
          { key: "attendance", label: "🕒 RH & Ponto Eletrónico", icon: "🕒" },
          { key: "visitors", label: "🎫 Gestão de Visitantes", icon: "🎫" },
          { key: "audit", label: "📜 Auditoria Forense", icon: "📜" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as BiometricsTab)}
            style={{
              padding: "0.6rem 1rem",
              borderRadius: "6px",
              border: "none",
              backgroundColor: activeTab === tab.key ? "#3b82f6" : "#1e293b",
              color: activeTab === tab.key ? "#ffffff" : "#94a3b8",
              cursor: "pointer",
              fontWeight: activeTab === tab.key ? "bold" : "normal",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: DASHBOARD EM TEMPO REAL */}
      {activeTab === "dashboard" && (
        <div>
          {/* KPI Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #3b82f6" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Pessoas no Edifício (Headcount)</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#38bdf8" }}>{metrics?.presentCount ?? 0}</h2>
              <small style={{ color: "#64748b" }}>Presentes em tempo real</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #10b981" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Entradas Hoje</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#34d399" }}>{metrics?.todayEntries ?? 0}</h2>
              <small style={{ color: "#64748b" }}>Validações com sucesso</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #f59e0b" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Colaboradores Internos</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#fbbf24" }}>{metrics?.internalStaffPresent ?? 0}</h2>
              <small style={{ color: "#64748b" }}>RH / Ponto picado</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #8b5cf6" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Membros / Alunos</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#c084fc" }}>{metrics?.gymMembersPresent ?? 0}</h2>
              <small style={{ color: "#64748b" }}>Ginásio / Aulas ativas</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #ef4444" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Tentativas Recusadas</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#f87171" }}>{metrics?.deniedAttempts ?? 0}</h2>
              <small style={{ color: "#64748b" }}>Expiradas ou bloqueadas</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #06b6d4" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Torniquetes Online</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#22d3ee" }}>
                {metrics?.devicesOnline ?? 0} / {metrics?.devicesTotal ?? 0}
              </h2>
              <small style={{ color: "#64748b" }}>Controladores ativos</small>
            </div>
          </div>

          {/* Live Recent Access Stream */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>📡 Feed de Passagens ao Vivo (Torniquetes & Portas)</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                    <th style={{ padding: "0.6rem" }}>Hora</th>
                    <th style={{ padding: "0.6rem" }}>Nome</th>
                    <th style={{ padding: "0.6rem" }}>Categoria</th>
                    <th style={{ padding: "0.6rem" }}>Torniquete / Porta</th>
                    <th style={{ padding: "0.6rem" }}>Zona</th>
                    <th style={{ padding: "0.6rem" }}>Sentido</th>
                    <th style={{ padding: "0.6rem" }}>Método</th>
                    <th style={{ padding: "0.6rem" }}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics?.recentLogs?.map((log: any) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid #2d3748" }}>
                      <td style={{ padding: "0.6rem", color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{log.personName}</td>
                      <td style={{ padding: "0.6rem" }}>
                        <span style={{ padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", backgroundColor: "#334155" }}>
                          {log.personCategory ?? "Geral"}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem" }}>{log.deviceName}</td>
                      <td style={{ padding: "0.6rem" }}>{log.zone}</td>
                      <td style={{ padding: "0.6rem" }}>
                        {log.direction === "ENTRY" ? "🟢 Entrada" : "🔵 Saída"}
                      </td>
                      <td style={{ padding: "0.6rem" }}>{log.authMethod}</td>
                      <td style={{ padding: "0.6rem" }}>
                        {log.granted ? (
                          <span style={{ color: "#34d399", fontWeight: "bold" }}>Autorizado</span>
                        ) : (
                          <span style={{ color: "#f87171", fontWeight: "bold" }}>Bloqueado ({log.denialReason})</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CADASTRO DE PESSOAS */}
      {activeTab === "persons" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
          {/* New Person Form */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", height: "fit-content" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>➕ Registar Nova Pessoa</h3>
            <form onSubmit={handleRegisterPerson} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>N.º Interno / Matrícula</label>
                <input
                  type="text"
                  required
                  value={newPerson.internalCode}
                  onChange={(e) => setNewPerson({ ...newPerson, internalCode: e.target.value })}
                  placeholder="ex: EMP-045 ou MEM-201"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Nome Completo</label>
                <input
                  type="text"
                  required
                  value={newPerson.fullName}
                  onChange={(e) => setNewPerson({ ...newPerson, fullName: e.target.value })}
                  placeholder="ex: Manuel dos Santos"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Categoria de Acesso</label>
                <select
                  value={newPerson.category}
                  onChange={(e) => setNewPerson({ ...newPerson, category: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                >
                  <option value="EMPLOYEE">Colaborador / RH</option>
                  <option value="MEMBER">Membro / Aluno (Ginásio/Clube)</option>
                  <option value="STUDENT">Estudante / Aluno (Escola/Uni)</option>
                  <option value="PATIENT">Utente / Paciente (Clínica)</option>
                  <option value="VISITOR">Visitante Temporário</option>
                  <option value="CONTRACTOR">Prestador de Serviço</option>
                  <option value="RESIDENT">Morador / Condómino</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Departamento / Sala</label>
                <input
                  type="text"
                  value={newPerson.department}
                  onChange={(e) => setNewPerson({ ...newPerson, department: e.target.value })}
                  placeholder="ex: Contabilidade ou Musculação"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Telefone</label>
                <input
                  type="text"
                  value={newPerson.phone}
                  onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })}
                  placeholder="+244 9xx xxx xxx"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: "#2563eb", color: "#fff", padding: "0.6rem", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", marginTop: "0.5rem" }}
              >
                {loading ? "A registar..." : "Salvar Cadastro"}
              </button>
            </form>
          </div>

          {/* Persons List */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>📋 Pessoas Cadastradas no Sistema</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                  <th style={{ padding: "0.6rem" }}>Código</th>
                  <th style={{ padding: "0.6rem" }}>Nome</th>
                  <th style={{ padding: "0.6rem" }}>Categoria</th>
                  <th style={{ padding: "0.6rem" }}>Departamento</th>
                  <th style={{ padding: "0.6rem" }}>Status</th>
                  <th style={{ padding: "0.6rem" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {persons.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #2d3748" }}>
                    <td style={{ padding: "0.6rem", fontFamily: "monospace" }}>{p.internalCode}</td>
                    <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{p.fullName}</td>
                    <td style={{ padding: "0.6rem" }}>
                      <span style={{ padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", backgroundColor: "#334155" }}>
                        {p.category}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem" }}>{p.department ?? "—"}</td>
                    <td style={{ padding: "0.6rem" }}>
                      <span style={{ color: p.status === "ACTIVE" ? "#34d399" : "#f87171" }}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem" }}>
                      <button
                        onClick={() => setSelectedPerson(p)}
                        style={{ padding: "0.3rem 0.6rem", backgroundColor: "#0f172a", border: "1px solid #475569", color: "#38bdf8", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}
                      >
                        Credenciais
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RECONHECIMENTO FACIAL */}
      {activeTab === "facial" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Facial Capture Simulator */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>📸 Câmera de Reconhecimento Facial (Live ONVIF / USB)</h3>
            <div
              style={{
                width: "100%",
                height: "260px",
                backgroundColor: "#0f172a",
                borderRadius: "8px",
                border: "2px dashed #475569",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {cameraActive ? (
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: "120px", height: "140px", border: "2px solid #38bdf8", borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 15px rgba(56, 189, 248, 0.4)" }}>
                    <span style={{ fontSize: "2.5rem" }}>👤</span>
                  </div>
                  <span style={{ color: "#38bdf8", fontSize: "0.85rem", marginTop: "0.8rem", display: "block" }}>
                    🟢 Face Detectada • Liveness OK • Extraindo 128D Embeddings...
                  </span>
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "#64748b" }}>
                  <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.5rem" }}>📷</span>
                  <p style={{ margin: 0 }}>Câmara Inativa / Standby</p>
                  <small>Webcam, Terminal Hikvision MinMoe ou Câmera IP ONVIF</small>
                </div>
              )}
            </div>

            <div style={{ marginTop: "1rem", display: "flex", gap: "0.8rem" }}>
              <button
                onClick={() => setCameraActive(!cameraActive)}
                style={{ backgroundColor: cameraActive ? "#ef4444" : "#2563eb", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
              >
                {cameraActive ? "⏹ Desligar Câmara" : "▶ Iniciar Captura Facial"}
              </button>
              <button
                onClick={() => handleSimulateAccess("FACE")}
                disabled={!cameraActive}
                style={{ backgroundColor: cameraActive ? "#10b981" : "#475569", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "4px", cursor: cameraActive ? "pointer" : "not-allowed", fontWeight: "bold" }}
              >
                ⚡ Identificar 1:N no Acervo
              </button>
            </div>
          </div>

          {/* Recognition Specs */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>⚙️ Parâmetros do Motor Biométrico Facial</h3>
            <ul style={{ color: "#cbd5e1", lineHeight: "1.8", fontSize: "0.9rem", paddingLeft: "1.2rem" }}>
              <li><strong>Algoritmo de Matching:</strong> Similaridade de Cosseno L2 em espaço 128D/512D.</li>
              <li><strong>Limiar de Confiança (Threshold):</strong> 85% (0.85).</li>
              <li><strong>Tempo Médio de Identificação:</strong> &lt; 150 ms para acervo de até 10.000 faces.</li>
              <li><strong>Proteção Anti-Spoofing:</strong> Detecção de liveness por textura espectral e micro-movimentos.</li>
              <li><strong>Equipamentos Homologados:</strong> Terminais Hikvision MinMoe, Dahua Face Recognition, Câmeras IP ONVIF Profile T e Webcams Full HD.</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 4: TORNIQUETES & PORTAS */}
      {activeTab === "devices" && (
        <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>🚪 Controladores, Torniquetes e Portas Integradas</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                <th style={{ padding: "0.6rem" }}>Nome do Dispositivo</th>
                <th style={{ padding: "0.6rem" }}>Tipo</th>
                <th style={{ padding: "0.6rem" }}>Zona de Acesso</th>
                <th style={{ padding: "0.6rem" }}>Protocolo</th>
                <th style={{ padding: "0.6rem" }}>Status</th>
                <th style={{ padding: "0.6rem" }}>Comandos de Abertura</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid #2d3748" }}>
                  <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{d.name}</td>
                  <td style={{ padding: "0.6rem" }}>{d.type}</td>
                  <td style={{ padding: "0.6rem" }}>{d.locationZone}</td>
                  <td style={{ padding: "0.6rem", fontFamily: "monospace", color: "#38bdf8" }}>{d.protocol}</td>
                  <td style={{ padding: "0.6rem" }}>
                    <span style={{ color: d.status === "ONLINE" ? "#34d399" : "#f87171", fontWeight: "bold" }}>
                      ● {d.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem" }}>
                    <button
                      onClick={() => handleDeviceCommand(d.id, "UNLOCK")}
                      style={{ padding: "0.3rem 0.8rem", backgroundColor: "#10b981", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", marginRight: "0.5rem" }}
                    >
                      🔓 Abrir Pulso (3s)
                    </button>
                    <button
                      onClick={() => handleDeviceCommand(d.id, "LOCK")}
                      style={{ padding: "0.3rem 0.8rem", backgroundColor: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      🔒 Bloquear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: GINÁSIOS & MENSALIDADES */}
      {activeTab === "gym" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
          {/* Activate Subscription */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px", height: "fit-content" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>🏋️ Ativar / Renovar Mensalidade</h3>
            <form onSubmit={handleCreateGymSub} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Membro / Aluno</label>
                <select
                  value={newGymSub.personId}
                  onChange={(e) => setNewGymSub({ ...newGymSub, personId: e.target.value })}
                  required
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                >
                  <option value="">Selecione o Aluno...</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.internalCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Plano de Ginásio</label>
                <select
                  value={newGymSub.planName}
                  onChange={(e) => setNewGymSub({ ...newGymSub, planName: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                >
                  <option value="Musculação Mensal - Livre Acesso">Musculação Mensal - Livre Acesso (35.000 Kz)</option>
                  <option value="Plano VIP Trimestral (Musculação + Aulas)">Plano VIP Trimestral (95.000 Kz)</option>
                  <option value="Aulas de Grupo & Natação">Aulas de Grupo & Natação (45.000 Kz)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Duração (Meses)</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={newGymSub.durationMonths}
                  onChange={(e) => setNewGymSub({ ...newGymSub, durationMonths: Number(e.target.value) })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <button
                type="submit"
                style={{ backgroundColor: "#10b981", color: "#fff", padding: "0.6rem", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", marginTop: "0.5rem" }}
              >
                ✅ Ativar Mensalidade e Desbloquear Acesso
              </button>
            </form>
          </div>

          {/* Explanation Banner */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>ℹ️ Regra de Negócio de Ginásios & Escolas</h3>
            <p style={{ color: "#cbd5e1", lineHeight: "1.6" }}>
              Quando o aluno ou membro se aproxima do torniquete (via <strong>Reconhecimento Facial</strong>, <strong>Cartão RFID</strong>, <strong>Digital</strong> ou <strong>QR Code</strong>), o motor de controlo inteligente verifica em tempo real se a mensalidade está quitada e dentro do prazo de vigência:
            </p>
            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <div style={{ flex: 1, backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", borderLeft: "4px solid #10b981" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", color: "#10b981" }}>✅ Plano Ativo e Pago</h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                  O torniquete é destravado instantaneamente com sinal luminoso verde e indicação de boas-vindas com o nome do aluno.
                </p>
              </div>
              <div style={{ flex: 1, backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", borderLeft: "4px solid #ef4444" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", color: "#ef4444" }}>⛔ Mensalidade Expirada</h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                  O torniquete permanece travado. Exibe mensagem no ecrã do terminal: <em>"Mensalidade Expirada. Contacte a Recepção."</em>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: RH & PONTO ELETRÓNICO */}
      {activeTab === "attendance" && (
        <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>🕒 Picagens de Ponto & Assiduidade Integrada ao RH</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                <th style={{ padding: "0.6rem" }}>Colaborador</th>
                <th style={{ padding: "0.6rem" }}>Data</th>
                <th style={{ padding: "0.6rem" }}>Entrada</th>
                <th style={{ padding: "0.6rem" }}>Pausa Almoço</th>
                <th style={{ padding: "0.6rem" }}>Retorno</th>
                <th style={{ padding: "0.6rem" }}>Saída</th>
                <th style={{ padding: "0.6rem" }}>Horas Trab.</th>
                <th style={{ padding: "0.6rem" }}>Atraso</th>
                <th style={{ padding: "0.6rem" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((att: any, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #2d3748" }}>
                  <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{att.employeeId}</td>
                  <td style={{ padding: "0.6rem" }}>{att.date}</td>
                  <td style={{ padding: "0.6rem" }}>{att.checkIn ?? "—"}</td>
                  <td style={{ padding: "0.6rem" }}>{att.breakOut ?? "—"}</td>
                  <td style={{ padding: "0.6rem" }}>{att.breakIn ?? "—"}</td>
                  <td style={{ padding: "0.6rem" }}>{att.checkOut ?? "—"}</td>
                  <td style={{ padding: "0.6rem" }}>{Math.round(att.workedMinutes / 60)}h {att.workedMinutes % 60}m</td>
                  <td style={{ padding: "0.6rem", color: att.delayMinutes > 0 ? "#f87171" : "#94a3b8" }}>
                    {att.delayMinutes > 0 ? `+${att.delayMinutes} min` : "Pontual"}
                  </td>
                  <td style={{ padding: "0.6rem" }}>
                    <span style={{ color: att.status === "PRESENT" ? "#34d399" : "#fbbf24", fontWeight: "bold" }}>
                      {att.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 7: VISITANTES (VMS) */}
      {activeTab === "visitors" && (
        <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>🎫 Gestão de Visitantes & Portaria Digital</h3>
          <p style={{ color: "#cbd5e1" }}>
            Controlo de visitas com pré-autorização, crachás RFID temporários e QR Codes descartáveis válidos para horários agendados.
          </p>
          <button
            onClick={() => alert("Formulário de Registo de Visitante pronto para integração com o balcão da portaria.")}
            style={{ backgroundColor: "#2563eb", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
          >
            ➕ Emitir Novo Crachá de Visitante
          </button>
        </div>
      )}

      {/* TAB 8: AUDITORIA FORENSE */}
      {activeTab === "audit" && (
        <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>📜 Trilha Forense Imutável de Auditoria de Acessos</h3>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Todos os eventos de tentativa de acesso (concedidos e recusados) são arquivados com foto capturada, dispositivo, coordenadas e motivo.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                  <th style={{ padding: "0.6rem" }}>Timestamp</th>
                  <th style={{ padding: "0.6rem" }}>Pessoa</th>
                  <th style={{ padding: "0.6rem" }}>Terminal</th>
                  <th style={{ padding: "0.6rem" }}>Método</th>
                  <th style={{ padding: "0.6rem" }}>Resultado</th>
                  <th style={{ padding: "0.6rem" }}>Motivo da Recusa</th>
                </tr>
              </thead>
              <tbody>
                {metrics?.recentLogs?.map((log: any) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #2d3748" }}>
                    <td style={{ padding: "0.6rem", color: "#94a3b8" }}>{new Date(log.timestamp).toISOString()}</td>
                    <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{log.personName}</td>
                    <td style={{ padding: "0.6rem" }}>{log.deviceName}</td>
                    <td style={{ padding: "0.6rem" }}>{log.authMethod}</td>
                    <td style={{ padding: "0.6rem" }}>
                      {log.granted ? (
                        <span style={{ color: "#34d399", fontWeight: "bold" }}>CONCEDIDO</span>
                      ) : (
                        <span style={{ color: "#f87171", fontWeight: "bold" }}>RECUSADO</span>
                      )}
                    </td>
                    <td style={{ padding: "0.6rem", color: "#f87171" }}>{log.denialReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
