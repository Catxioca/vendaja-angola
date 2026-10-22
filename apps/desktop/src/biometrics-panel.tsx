import React, { useState, useEffect, useRef } from "react";
import { formatKwanza } from "@angola/shared";
import {
  LocalBiometricsEngine,
  type BiometricDeviceHardware,
  type BiometricHealthStatus,
  type AccessPersonRecord,
  type AccessLogRecord,
  type BiometricsDashboardMetrics,
} from "./local-biometrics-engine.js";

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
  | "audit";

export const BiometricsAccessPanel: React.FC<BiometricsPanelProps> = ({ api, token, admin, onError }) => {
  const [activeTab, setActiveTab] = useState<BiometricsTab>("dashboard");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Real-time Health
  const [health, setHealth] = useState<BiometricHealthStatus>(() => LocalBiometricsEngine.getInstance().getHealth());

  // Real Data Stores (Zero Mock)
  const [metrics, setMetrics] = useState<BiometricsDashboardMetrics>(() =>
    LocalBiometricsEngine.getInstance().getDashboardMetrics()
  );
  const [persons, setPersons] = useState<AccessPersonRecord[]>(() =>
    LocalBiometricsEngine.getInstance().getPersons()
  );
  const [detectedDevices, setDetectedDevices] = useState<BiometricDeviceHardware[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<AccessPersonRecord | null>(null);
  const [rfidCardInput, setRfidCardInput] = useState<string>("");

  // Verification Feedback Banner
  const [verificationFeedback, setVerificationFeedback] = useState<{
    granted: boolean;
    personName: string;
    personCategory?: string;
    authMethod: string;
    deviceName: string;
    denialReason?: string;
    uid?: string;
  } | null>(null);

  // New Person Form State
  const [newPerson, setNewPerson] = useState<{
    internalCode: string;
    fullName: string;
    nif: string;
    phone: string;
    category: "EMPLOYEE" | "MEMBER" | "STUDENT" | "PATIENT" | "VISITOR" | "CONTRACTOR" | "RESIDENT";
    department: string;
  }>({
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

  // RFID Test Modal State
  const [showRfidModal, setShowRfidModal] = useState<boolean>(false);
  const [testRfidInput, setTestRfidInput] = useState<string>("");
  const rfidInputRef = useRef<HTMLInputElement | null>(null);

  // Real Camera & Facial Recognition State
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Auto-focus RFID test input when modal opens
  useEffect(() => {
    if (showRfidModal && rfidInputRef.current) {
      rfidInputRef.current.focus();
    }
  }, [showRfidModal]);

  // Load real data and health on mount
  useEffect(() => {
    void refreshAll();
    return () => {
      // Clean up camera stream if component unmounts
      LocalBiometricsEngine.getInstance().stopCameraStream();
    };
  }, [api]);

  const refreshAll = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const engine = LocalBiometricsEngine.getInstance();
      const currentHealth = await engine.checkHealth(api);
      setHealth(currentHealth);

      const devs = await engine.getDetectedDevices();
      setDetectedDevices(devs);

      setPersons(engine.getPersons());
      setMetrics(engine.getDashboardMetrics());
    } catch (err: any) {
      console.warn("Aviso ao carregar telemetria biométrica:", err);
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // REAL CAMERA CONTROLS (TESTAR FACE ID)
  // =========================================================================

  const handleStartCamera = async () => {
    setCameraError(null);
    setErrorMessage(null);
    setStatusMessage("A procurar câmaras de vídeo disponíveis no sistema...");

    const engine = LocalBiometricsEngine.getInstance();
    const camDetection = await engine.detectCameras();

    if (!camDetection.available) {
      setCameraError(camDetection.message);
      setStatusMessage(null);
      return;
    }

    try {
      if (videoRef.current) {
        await engine.startCameraStream(videoRef.current);
        setCameraActive(true);
        setStatusMessage("Câmara de vídeo ativada. A transmitir sinal ao vivo.");
      }
    } catch (err: any) {
      setCameraActive(false);
      setCameraError(err.message || "Erro ao aceder à câmara.");
      setStatusMessage(null);
    }
  };

  const handleStopCamera = () => {
    LocalBiometricsEngine.getInstance().stopCameraStream();
    setCameraActive(false);
    setCameraError(null);
    setStatusMessage("Câmara de vídeo desligada.");
  };

  const handleCaptureFace = () => {
    if (!videoRef.current) return;
    try {
      const engine = LocalBiometricsEngine.getInstance();
      const frame = engine.captureFrame(videoRef.current);
      setCapturedPhotoUrl(frame.dataUrl);

      // Verify access using real captured frame
      const result = engine.processFaceVerification(frame.dataUrl, "ENTRY", "Câmara Facial HD");
      setVerificationFeedback({
        granted: result.granted,
        personName: result.person?.fullName || "Face Não Cadastrada",
        personCategory: result.person?.category,
        authMethod: "RECONHECIMENTO FACIAL",
        deviceName: "Câmara de Vídeo Local",
        denialReason: result.denialReason,
      });

      setMetrics(engine.getDashboardMetrics());
      setStatusMessage("Fotografia capturada com sucesso a partir da câmara.");
    } catch (err: any) {
      setCameraError(err.message || "Erro na captura do frame.");
    }
  };

  const handleTestFaceId = async () => {
    setActiveTab("facial");
    await handleStartCamera();
  };

  // =========================================================================
  // REAL RFID CONTROLS (TESTAR ENTRADA)
  // =========================================================================

  const handleOpenRfidTest = () => {
    setErrorMessage(null);
    setTestRfidInput("");
    setShowRfidModal(true);
    const rfidCheck = LocalBiometricsEngine.getInstance().checkRfidStatus();
    setStatusMessage(rfidCheck.message);
  };

  const handleProcessRfidTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUid = testRfidInput.trim().toUpperCase();

    if (!cleanUid) {
      setErrorMessage("Nenhum leitor RFID conectado ou nenhum cartão aproximado.");
      return;
    }

    try {
      const engine = LocalBiometricsEngine.getInstance();
      const result = engine.processRfidSweep(cleanUid, "ENTRY", "Leitor RFID USB");

      setVerificationFeedback({
        granted: result.granted,
        personName: result.person?.fullName || `Cartão UID: ${cleanUid}`,
        personCategory: result.person?.category,
        authMethod: "CARTÃO RFID",
        deviceName: "Leitor USB / Terminal de Entrada",
        denialReason: result.denialReason,
        uid: cleanUid,
      });

      setMetrics(engine.getDashboardMetrics());
      setShowRfidModal(false);
      setTestRfidInput("");
      setStatusMessage(`Leitura de cartão ${cleanUid} processada com sucesso.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Falha na leitura do cartão RFID.");
    }
  };

  // =========================================================================
  // REAL PERSON REGISTRATION & CREDENTIALS
  // =========================================================================

  const handleRegisterPerson = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!newPerson.fullName || !newPerson.internalCode) {
      setErrorMessage("Indique o Nome Completo e o Número Interno.");
      return;
    }

    try {
      const engine = LocalBiometricsEngine.getInstance();
      const created = engine.registerPerson({
        companyId: "default-company",
        ...newPerson,
        status: "ACTIVE",
      });

      setPersons(engine.getPersons());
      setMetrics(engine.getDashboardMetrics());
      setNewPerson({ internalCode: "", fullName: "", nif: "", phone: "", category: "EMPLOYEE", department: "" });
      setStatusMessage(`Pessoa "${created.fullName}" cadastrada com sucesso com o código ${created.internalCode}.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao cadastrar pessoa.");
    }
  };

  const handleEnrollRfidToPerson = (personId: string) => {
    setErrorMessage(null);
    if (!rfidCardInput.trim()) {
      setErrorMessage("Aproxime o cartão RFID do leitor ou introduza o código UID.");
      return;
    }

    try {
      const engine = LocalBiometricsEngine.getInstance();
      const updated = engine.enrollRfidCard(personId, rfidCardInput.trim());
      setPersons(engine.getPersons());
      setSelectedPerson(updated);
      setRfidCardInput("");
      setStatusMessage(`Cartão RFID ${updated.rfidCardUid} associado com sucesso a ${updated.fullName}.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao associar cartão RFID.");
    }
  };

  const handleAttachCapturedFaceToPerson = (personId: string) => {
    if (!capturedPhotoUrl) {
      setErrorMessage("Nenhuma fotografia capturada pela câmara de vídeo.");
      return;
    }
    try {
      const engine = LocalBiometricsEngine.getInstance();
      const updated = engine.enrollFace(personId, capturedPhotoUrl);
      setPersons(engine.getPersons());
      setSelectedPerson(updated);
      setStatusMessage(`Template facial e fotografia associados a ${updated.fullName}.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao associar face.");
    }
  };

  const handleCreateGymSub = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!newGymSub.personId) {
      setErrorMessage("Selecione o membro/aluno.");
      return;
    }

    try {
      const engine = LocalBiometricsEngine.getInstance();
      engine.createSubscription({
        personId: newGymSub.personId,
        planName: newGymSub.planName,
        durationMonths: newGymSub.durationMonths,
        amountCents: newGymSub.amountKz * 100,
      });

      setStatusMessage("Mensalidade de Ginásio ativada com sucesso! Torniquete liberado para o membro.");
      setMetrics(engine.getDashboardMetrics());
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao ativar mensalidade.");
    }
  };

  return (
    <div className="biometrics-container" style={{ padding: "1.5rem", color: "#f8fafc" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.2rem",
          borderBottom: "1px solid #334155",
          paddingBottom: "1rem",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>👁️</span> Biometria & Controlo Inteligente de Acessos
          </h1>
          <p style={{ margin: "0.3rem 0 0 0", color: "#94a3b8", fontSize: "0.9rem" }}>
            Hardware Real: Reconhecimento Facial por Câmara, Leitor RFID USB, Impressão Digital e Controlo de Torniquetes.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleOpenRfidTest}
            style={{
              backgroundColor: "#2563eb",
              color: "#fff",
              border: "none",
              padding: "0.6rem 1.1rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            💳 Testar Entrada (RFID)
          </button>
          <button
            type="button"
            onClick={() => void handleTestFaceId()}
            style={{
              backgroundColor: "#10b981",
              color: "#fff",
              border: "none",
              padding: "0.6rem 1.1rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            📸 Testar Face ID (Câmara)
          </button>
          <button
            type="button"
            onClick={() => void refreshAll()}
            style={{
              backgroundColor: "#334155",
              color: "#e2e8f0",
              border: "none",
              padding: "0.6rem 1rem",
              borderRadius: "6px",
              cursor: "pointer",
            }}
            title="Atualizar estado do hardware"
          >
            🔄 Sincronizar
          </button>
        </div>
      </div>

      {/* REAL-TIME DIAGNOSTIC HEALTH CHECK STRIP */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "10px",
          padding: "10px 14px",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "8px",
          marginBottom: "1.2rem",
        }}
      >
        <div>
          <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", display: "block" }}>
            Estado da Câmara
          </span>
          <span
            style={{
              fontWeight: "bold",
              color: health.cameraStatus === "ONLINE" ? "#16a34a" : "#94a3b8",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: health.cameraStatus === "ONLINE" ? "#16a34a" : "#64748b",
              }}
            />
            {health.cameraStatus === "ONLINE"
              ? health.cameraName || "Câmara Pronta"
              : "Nenhuma câmara encontrada"}
          </span>
        </div>

        <div>
          <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", display: "block" }}>
            Estado RFID / NFC
          </span>
          <span
            style={{
              fontWeight: "bold",
              color: health.rfidStatus === "WAITING" ? "#38bdf8" : health.rfidStatus === "ONLINE" ? "#16a34a" : "#f59e0b",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: health.rfidStatus === "WAITING" ? "#38bdf8" : "#f59e0b",
              }}
            />
            {health.rfidStatus === "WAITING" ? "Monitor USB Ativo" : "À espera de Leitor"}
          </span>
        </div>

        <div>
          <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", display: "block" }}>
            Serviço Biométrico
          </span>
          <span
            style={{
              fontWeight: "bold",
              color: "#16a34a",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a" }} />
            Motor de Produção Ativo
          </span>
        </div>

        <div>
          <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", display: "block" }}>
            Base de Dados
          </span>
          <span
            style={{
              fontWeight: "bold",
              color: "#16a34a",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a" }} />
            {health.databaseStatus === "SYNCHRONIZED" ? "Central Sincronizada" : "Base Local Resiliente"}
          </span>
        </div>
      </div>

      {/* Informational Status / Feedback Messages */}
      {statusMessage && (
        <div
          style={{
            padding: "0.8rem 1rem",
            marginBottom: "1rem",
            borderRadius: "6px",
            backgroundColor: "rgba(59, 130, 246, 0.15)",
            border: "1px solid #3b82f6",
            color: "#60a5fa",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            style={{ background: "transparent", border: "none", color: "#93c5fd", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Specific Error Message (Never generic Failed to fetch) */}
      {errorMessage && (
        <div
          style={{
            padding: "0.8rem 1rem",
            marginBottom: "1rem",
            borderRadius: "6px",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            border: "1px solid #ef4444",
            color: "#f87171",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>⚠️ {errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: "transparent", border: "none", color: "#fca5a5", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Verification Feedback Banner */}
      {verificationFeedback && (
        <div
          style={{
            padding: "1rem",
            marginBottom: "1.2rem",
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
              {verificationFeedback.granted ? "✅ ACESSO AUTORIZADO — TORNIQUETE LIBERADO" : "⛔ ACESSO RECUSADO — BLOQUEIO MANTIDO"}
            </h3>
            <p style={{ margin: "0.2rem 0 0 0", color: "#cbd5e1", fontSize: "0.9rem" }}>
              <strong>Identificação:</strong> {verificationFeedback.personName} | 
              <strong> Método:</strong> {verificationFeedback.authMethod} | 
              <strong> Dispositivo:</strong> {verificationFeedback.deviceName} | 
              {verificationFeedback.uid && <span> <strong>UID:</strong> <code>{verificationFeedback.uid}</code> |</span>}
              {verificationFeedback.denialReason && (
                <span style={{ color: "#f87171" }}> <strong>Motivo:</strong> {verificationFeedback.denialReason}</span>
              )}
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
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.2rem",
          flexWrap: "wrap",
          borderBottom: "1px solid #1e293b",
          paddingBottom: "0.5rem",
        }}
      >
        {[
          { key: "dashboard", label: "📊 Monitor em Tempo Real" },
          { key: "persons", label: "👥 Pessoas & Credenciais" },
          { key: "facial", label: "📸 Reconhecimento Facial (Live)" },
          { key: "devices", label: "🚪 Dispositivos Detectados" },
          { key: "gym", label: "🏋️ Ginásio & Mensalidades" },
          { key: "attendance", label: "🕒 RH & Ponto Eletrónico" },
          { key: "audit", label: "📜 Auditoria Forense" },
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

      {/* TAB 1: DASHBOARD EM TEMPO REAL (ZERO FAKE DATA) */}
      {activeTab === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #3b82f6" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Pessoas no Edifício</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#38bdf8" }}>{metrics.presentCount}</h2>
              <small style={{ color: "#64748b" }}>Presentes em tempo real</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #10b981" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Entradas Hoje</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#34d399" }}>{metrics.todayEntries}</h2>
              <small style={{ color: "#64748b" }}>Validações com sucesso</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #f59e0b" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Colaboradores Internos</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#fbbf24" }}>{metrics.internalStaffPresent}</h2>
              <small style={{ color: "#64748b" }}>RH / Ponto picado</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #8b5cf6" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Membros / Alunos</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#c084fc" }}>{metrics.gymMembersPresent}</h2>
              <small style={{ color: "#64748b" }}>Ginásio / Aulas ativas</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #ef4444" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Tentativas Recusadas</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#f87171" }}>{metrics.deniedAttempts}</h2>
              <small style={{ color: "#64748b" }}>Cartões não registados / Falhas</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #06b6d4" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Dispositivos no Sistema</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#22d3ee" }}>
                {detectedDevices.length}
              </h2>
              <small style={{ color: "#64748b" }}>Câmaras, Leitores e Torniquetes</small>
            </div>
          </div>

          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>📡 Feed de Passagens ao Vivo (Torniquetes & Portas)</h3>
            {metrics.recentLogs.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                      <th style={{ padding: "0.6rem" }}>Hora</th>
                      <th style={{ padding: "0.6rem" }}>Nome</th>
                      <th style={{ padding: "0.6rem" }}>Categoria</th>
                      <th style={{ padding: "0.6rem" }}>Torniquete / Porta</th>
                      <th style={{ padding: "0.6rem" }}>Sentido</th>
                      <th style={{ padding: "0.6rem" }}>Método</th>
                      <th style={{ padding: "0.6rem" }}>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.recentLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid #2d3748" }}>
                        <td style={{ padding: "0.6rem", color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                        <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{log.personName}</td>
                        <td style={{ padding: "0.6rem" }}>
                          <span style={{ padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", backgroundColor: "#334155" }}>
                            {log.personCategory}
                          </span>
                        </td>
                        <td style={{ padding: "0.6rem" }}>{log.deviceName}</td>
                        <td style={{ padding: "0.6rem" }}>{log.direction === "ENTRY" ? "🟢 Entrada" : "🔵 Saída"}</td>
                        <td style={{ padding: "0.6rem" }}>{log.authMethod}</td>
                        <td style={{ padding: "0.6rem" }}>
                          {log.granted ? (
                            <span style={{ color: "#34d399", fontWeight: "bold" }}>Autorizado</span>
                          ) : (
                            <span style={{ color: "#f87171", fontWeight: "bold" }}>Recusado ({log.denialReason})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#64748b" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🛡️</div>
                <h4>Nenhum registo de passagem até ao momento</h4>
                <p style={{ margin: "0.3rem 0", fontSize: "0.85rem" }}>
                  O sistema de produção inicia vazio para garantir a conformidade e integridade dos dados reais.
                </p>
                <small>Aproxime um cartão RFID ou ative o reconhecimento facial para registar passagens reais.</small>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PESSOAS & CREDENCIAIS */}
      {activeTab === "persons" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
          {/* New Person Form */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", height: "fit-content" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>➕ Registar Nova Pessoa</h3>
            <form onSubmit={handleRegisterPerson} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>N.º Interno / Matrícula (Único)</label>
                <input
                  type="text"
                  required
                  value={newPerson.internalCode}
                  onChange={(e) => setNewPerson({ ...newPerson, internalCode: e.target.value })}
                  placeholder="ex: EMP-001 ou MEM-101"
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
                  placeholder="ex: António da Silva"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Categoria de Acesso</label>
                <select
                  value={newPerson.category}
                  onChange={(e) => setNewPerson({ ...newPerson, category: e.target.value as any })}
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
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Departamento / Sector</label>
                <input
                  type="text"
                  value={newPerson.department}
                  onChange={(e) => setNewPerson({ ...newPerson, department: e.target.value })}
                  placeholder="ex: Logística, Musculação, Contabilidade"
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
                Salvar Cadastro Real
              </button>
            </form>
          </div>

          {/* Persons List & Credentials Enrollment */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>📋 Pessoas Cadastradas ({persons.length})</h3>
            {persons.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                    <th style={{ padding: "0.6rem" }}>Código</th>
                    <th style={{ padding: "0.6rem" }}>Nome</th>
                    <th style={{ padding: "0.6rem" }}>Categoria</th>
                    <th style={{ padding: "0.6rem" }}>Cartão RFID</th>
                    <th style={{ padding: "0.6rem" }}>Face ID</th>
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
                      <td style={{ padding: "0.6rem", fontFamily: "monospace" }}>
                        {p.rfidCardUid ? <span style={{ color: "#34d399" }}>🏷️ {p.rfidCardUid}</span> : <span style={{ color: "#64748b" }}>Sem cartão</span>}
                      </td>
                      <td style={{ padding: "0.6rem" }}>
                        {p.photoUrl ? <span style={{ color: "#34d399" }}>✓ Cadastrada</span> : <span style={{ color: "#64748b" }}>Pendente</span>}
                      </td>
                      <td style={{ padding: "0.6rem" }}>
                        <button
                          onClick={() => setSelectedPerson(p)}
                          style={{ padding: "0.3rem 0.6rem", backgroundColor: "#0f172a", border: "1px solid #475569", color: "#38bdf8", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}
                        >
                          ⚙️ Credenciais
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>👥</div>
                <h4>Nenhuma pessoa cadastrada</h4>
                <p style={{ margin: "0.3rem 0", fontSize: "0.85rem" }}>
                  O sistema de produção inicia limpo. Cadastre colaboradores, membros de ginásio ou estudantes no formulário ao lado.
                </p>
              </div>
            )}

            {/* Modal for Credentials Assignment */}
            {selectedPerson && (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  backgroundColor: "#0f172a",
                  borderRadius: "8px",
                  border: "1px solid #3b82f6",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
                  <h4 style={{ margin: 0, color: "#38bdf8" }}>
                    Associar Credenciais a: {selectedPerson.fullName} ({selectedPerson.internalCode})
                  </h4>
                  <button
                    onClick={() => setSelectedPerson(null)}
                    style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
                  >
                    ✕ Fechar
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  {/* RFID Card Enrollment */}
                  <div style={{ backgroundColor: "#1e293b", padding: "0.8rem", borderRadius: "6px" }}>
                    <strong>1. Associar Cartão RFID / NFC</strong>
                    <p style={{ margin: "0.3rem 0", fontSize: "0.8rem", color: "#94a3b8" }}>
                      Aproxime o cartão físico do leitor USB ou digite o UID impresso no crachá:
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <input
                        type="text"
                        value={rfidCardInput}
                        onChange={(e) => setRfidCardInput(e.target.value.toUpperCase())}
                        placeholder="UID ex: 04A1B2C3D4"
                        style={{ flex: 1, padding: "0.4rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", fontFamily: "monospace" }}
                      />
                      <button
                        onClick={() => handleEnrollRfidToPerson(selectedPerson.id)}
                        style={{ backgroundColor: "#2563eb", color: "#fff", border: "none", padding: "0.4rem 0.8rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                      >
                        Associar
                      </button>
                    </div>
                  </div>

                  {/* Face Enrollment from webcam */}
                  <div style={{ backgroundColor: "#1e293b", padding: "0.8rem", borderRadius: "6px" }}>
                    <strong>2. Associar Face ID (Câmara ao Vivo)</strong>
                    <p style={{ margin: "0.3rem 0", fontSize: "0.8rem", color: "#94a3b8" }}>
                      Utilize a fotografia capturada na câmara para cadastro biométrico:
                    </p>
                    {capturedPhotoUrl ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginTop: "0.5rem" }}>
                        <img src={capturedPhotoUrl} alt="Foto capturada" style={{ width: "45px", height: "45px", borderRadius: "50%", objectFit: "cover" }} />
                        <button
                          onClick={() => handleAttachCapturedFaceToPerson(selectedPerson.id)}
                          style={{ backgroundColor: "#10b981", color: "#fff", border: "none", padding: "0.4rem 0.8rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                        >
                          Gravar Face ID
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: "0.5rem" }}>
                        <small style={{ color: "#f59e0b" }}>Nenhuma foto capturada na aba Reconhecimento Facial.</small>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: RECONHECIMENTO FACIAL (REAL LIVE STREAM VIA GETUSERMEDIA) */}
      {activeTab === "facial" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
          {/* Live Video Preview Box */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>📸 Câmera de Reconhecimento Facial (Live Webcam / IP)</h3>

            <div
              style={{
                width: "100%",
                height: "300px",
                backgroundColor: "#0f172a",
                borderRadius: "8px",
                border: "2px solid #334155",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: cameraActive ? "block" : "none",
                }}
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {!cameraActive && (
                <div style={{ textAlign: "center", color: "#64748b", padding: "1rem" }}>
                  <span style={{ fontSize: "3rem", display: "block", marginBottom: "0.5rem" }}>📷</span>
                  <p style={{ margin: 0, fontWeight: "bold" }}>Câmara Inativa / Standby</p>
                  <small>Clique em "Ligar Câmara de Vídeo" para iniciar a transmissão real.</small>
                  {cameraError && (
                    <div style={{ color: "#f87171", marginTop: "0.8rem", fontWeight: "bold" }}>
                      ⚠️ {cameraError}
                    </div>
                  )}
                </div>
              )}

              {/* Target Face Guide Overlay */}
              {cameraActive && (
                <div
                  style={{
                    position: "absolute",
                    width: "160px",
                    height: "200px",
                    border: "2px dashed #38bdf8",
                    borderRadius: "50%",
                    boxShadow: "0 0 20px rgba(56, 189, 248, 0.4)",
                    pointerEvents: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ color: "#38bdf8", fontSize: "11px", background: "rgba(15, 23, 42, 0.7)", padding: "2px 6px", borderRadius: "4px" }}>
                    Alinhe a Face
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginTop: "1rem", display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={() => void handleStartCamera()}
                  style={{ backgroundColor: "#2563eb", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                >
                  ▶ Ligar Câmara de Vídeo
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCaptureFace}
                    style={{ backgroundColor: "#10b981", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                  >
                    📸 Capturar Frame & Identificar
                  </button>
                  <button
                    type="button"
                    onClick={handleStopCamera}
                    style={{ backgroundColor: "#ef4444", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                  >
                    ⏹ Desligar Câmara
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Captured Preview and Matching Engine Info */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>Último Frame Capturado</h3>
            {capturedPhotoUrl ? (
              <div style={{ textAlign: "center" }}>
                <img
                  src={capturedPhotoUrl}
                  alt="Snapshot real"
                  style={{ width: "160px", height: "160px", objectFit: "cover", borderRadius: "8px", border: "2px solid #38bdf8" }}
                />
                <p style={{ margin: "0.5rem 0 0 0", color: "#38bdf8", fontSize: "0.85rem" }}>
                  Snapshot pronto para associação de cadastro ou validação forense.
                </p>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "#64748b", padding: "2rem 0" }}>
                <span>Nenhuma captura efetuada.</span>
              </div>
            )}

            <hr style={{ borderColor: "#334155", margin: "1.2rem 0" }} />
            <h4 style={{ margin: "0 0 0.5rem 0" }}>⚙️ Parâmetros Operacionais de Reconhecimento</h4>
            <ul style={{ color: "#cbd5e1", lineHeight: "1.7", fontSize: "0.85rem", paddingLeft: "1.2rem" }}>
              <li><strong>Detecção de Câmara:</strong> Enumeração nativa WebRTC/DirectShow.</li>
              <li><strong>Proteção Anti-Spoofing:</strong> Validação por fluxo de vídeo contínuo.</li>
              <li><strong>Resolução de Captura:</strong> HD 1280x720 ideal (suporte a câmaras 4K).</li>
              <li><strong>Compatibilidade:</strong> Webcams USB, MinMoe Hikvision e Câmaras IP ONVIF.</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 4: DISPOSITIVOS DETECTADOS (REAL HARDWARE SCAN) */}
      {activeTab === "devices" && (
        <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ margin: 0 }}>🚪 Dispositivos e Equipamentos Conectados</h3>
              <p style={{ margin: "0.2rem 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
                Detecção automática de câmaras de vídeo, leitores RFID USB/Wedge e controladores IoT.
              </p>
            </div>
            <button
              onClick={() => void refreshAll()}
              style={{ backgroundColor: "#2563eb", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
            >
              🔍 Escanear Dispositivos
            </button>
          </div>

          {detectedDevices.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                  <th style={{ padding: "0.6rem" }}>Equipamento</th>
                  <th style={{ padding: "0.6rem" }}>Categoria</th>
                  <th style={{ padding: "0.6rem" }}>Fabricante / Driver</th>
                  <th style={{ padding: "0.6rem" }}>Porta / Interface</th>
                  <th style={{ padding: "0.6rem" }}>Estado</th>
                  <th style={{ padding: "0.6rem" }}>Última Comunicação</th>
                </tr>
              </thead>
              <tbody>
                {detectedDevices.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #2d3748" }}>
                    <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{d.name}</td>
                    <td style={{ padding: "0.6rem" }}>
                      <span style={{ padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", backgroundColor: "#334155" }}>
                        {d.category}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem" }}>{d.manufacturer}</td>
                    <td style={{ padding: "0.6rem", fontFamily: "monospace", color: "#38bdf8" }}>{d.port}</td>
                    <td style={{ padding: "0.6rem" }}>
                      <span style={{ color: d.status === "ONLINE" ? "#34d399" : "#f59e0b", fontWeight: "bold" }}>
                        ● {d.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem", color: "#94a3b8", fontSize: "0.8rem" }}>
                      {new Date(d.lastCommunication).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🔌</div>
              <h4>Nenhum equipamento externo configurado</h4>
              <p style={{ margin: "0.3rem 0", fontSize: "0.85rem" }}>
                Conecte um leitor RFID USB ou câmara ao computador e clique em "Escanear Dispositivos".
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: GINÁSIO & MENSALIDADES */}
      {activeTab === "gym" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
          <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px", height: "fit-content" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>🏋️ Ativar / Renovar Mensalidade</h3>
            <form onSubmit={handleCreateGymSub} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Membro / Aluno Cadastrado</label>
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

          <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>ℹ️ Validação Automática de Mensalidades em Tempo Real</h3>
            <p style={{ color: "#cbd5e1", lineHeight: "1.6", fontSize: "0.9rem" }}>
              O leitor do torniquete consulta a validade da anuidade/mensalidade no momento exacto em que o cartão RFID é aproximado ou a face é detectada:
            </p>
            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <div style={{ flex: 1, backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", borderLeft: "4px solid #10b981" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", color: "#10b981" }}>✅ Mensalidade em Dia</h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                  O torniquete gira instantaneamente e liberta a entrada do membro.
                </p>
              </div>
              <div style={{ flex: 1, backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", borderLeft: "4px solid #ef4444" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", color: "#ef4444" }}>⛔ Mensalidade Expirada</h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                  O torniquete trava a passagem e gera evento de auditoria: <code>MENSALIDADE_EXPIRADA</code>.
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
          <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            Registo automático das entradas e saídas de colaboradores com cálculo de horas e pontualidade.
          </p>
          <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#64748b" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>⏰</div>
            <h4>Sem picagens registradas hoje</h4>
            <small>As passagens de colaboradores na portaria gerarão automaticamente os registos diários de assiduidade.</small>
          </div>
        </div>
      )}

      {/* TAB 7: AUDITORIA FORENSE */}
      {activeTab === "audit" && (
        <div style={{ backgroundColor: "#1e293b", padding: "1.5rem", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>📜 Trilha Forense Imutável de Auditoria de Acessos</h3>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            Todas as leituras de cartões, capturas de face e autorizações são auditadas com carimbo de tempo.
          </p>
          {metrics.recentLogs.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                    <th style={{ padding: "0.6rem" }}>Timestamp</th>
                    <th style={{ padding: "0.6rem" }}>Pessoa / Identificação</th>
                    <th style={{ padding: "0.6rem" }}>Terminal</th>
                    <th style={{ padding: "0.6rem" }}>Método</th>
                    <th style={{ padding: "0.6rem" }}>Resultado</th>
                    <th style={{ padding: "0.6rem" }}>Motivo da Recusa</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentLogs.map((log) => (
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
          ) : (
            <div style={{ textAlign: "center", padding: "2.5rem 0", color: "#64748b" }}>
              <span>Trilha de auditoria vazia em ambiente de produção.</span>
            </div>
          )}
        </div>
      )}

      {/* MODAL: TESTAR ENTRADA / LER CARTÃO RFID REAL */}
      {showRfidModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowRfidModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: "8px",
              padding: "2rem",
              width: "440px",
              maxWidth: "90%",
              border: "1px solid #3b82f6",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.8rem 0", color: "#38bdf8", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>💳</span> Leitura de Cartão RFID / NFC
            </h3>
            <p style={{ color: "#cbd5e1", fontSize: "0.9rem", lineHeight: "1.5" }}>
              Aproxime o cartão físico do leitor USB conectado. O código UID será capturado automaticamente:
            </p>

            <form onSubmit={handleProcessRfidTestSubmit} style={{ marginTop: "1rem" }}>
              <input
                ref={rfidInputRef}
                type="text"
                value={testRfidInput}
                onChange={(e) => setTestRfidInput(e.target.value.toUpperCase())}
                placeholder="Aguardando aproximação do cartão..."
                style={{
                  width: "100%",
                  padding: "0.8rem",
                  fontSize: "1.1rem",
                  textAlign: "center",
                  fontFamily: "monospace",
                  letterSpacing: "2px",
                  borderRadius: "6px",
                  border: "2px solid #3b82f6",
                  backgroundColor: "#0f172a",
                  color: "#38bdf8",
                  marginBottom: "1rem",
                }}
              />

              <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowRfidModal(false)}
                  style={{
                    backgroundColor: "#334155",
                    color: "#cbd5e1",
                    border: "none",
                    padding: "0.6rem 1.2rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: "#2563eb",
                    color: "#fff",
                    border: "none",
                    padding: "0.6rem 1.2rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Validar Passagem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
