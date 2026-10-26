import React, { useState, useEffect, useRef } from "react";
import { formatKwanza } from "@angola/shared";
import {
  LocalBiometricsEngine,
  type BiometricDeviceHardware,
  type BiometricHealthStatus,
  type AccessPersonRecord,
  type AccessLogRecord,
  type AttendanceHRRecord,
  type BiometricsDashboardMetrics,
  type BiometricPolicyConfig,
  type BiometricMethod,
  type FingerprintVendor,
  type FingerIndex,
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
  | "fingerprint"
  | "facial"
  | "devices"
  | "config"
  | "gym"
  | "attendance"
  | "audit";

export const BiometricsAccessPanel: React.FC<BiometricsPanelProps> = ({ api, token, admin, onError }) => {
  const [activeTab, setActiveTab] = useState<BiometricsTab>("dashboard");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Real-time Health
  const [health, setHealth] = useState<BiometricHealthStatus>(() => LocalBiometricsEngine.getInstance().getHealth());

  // Policy State
  const [policy, setPolicy] = useState<BiometricPolicyConfig>(() => LocalBiometricsEngine.getInstance().getAccessPolicy());

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

  // Fingerprint Test & Enrollment Modal State
  const [showFpTestModal, setShowFpTestModal] = useState<boolean>(false);
  const [showFpEnrollModal, setShowFpEnrollModal] = useState<boolean>(false);
  const [fpPersonToEnroll, setFpPersonToEnroll] = useState<AccessPersonRecord | null>(null);
  const [fpFingerIndex, setFpFingerIndex] = useState<FingerIndex>("RIGHT_INDEX");
  const [fpVendorSelect, setFpVendorSelect] = useState<FingerprintVendor>("ZKTECO");
  const [fpTemplateInput, setFpTemplateInput] = useState<string>("");
  const [fpTestFeedback, setFpTestFeedback] = useState<string | null>(null);

  // New Hardware Device Form State
  const [newDevice, setNewDevice] = useState<{
    name: string;
    category: "CAMERA" | "RFID" | "FINGERPRINT" | "TURNSTILE" | "DOOR" | "RELAY";
    manufacturer: string;
    model: string;
    port: string;
    details: string;
  }>({
    name: "Torniquete Entrada Principal",
    category: "TURNSTILE",
    manufacturer: "ZKTeco",
    model: "TS2000 Pro",
    port: "TCP: 192.168.1.201:4370",
    details: "Torniquete com relé de disparo e sensor de passagem",
  });

  // Real Camera & Facial Recognition State
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
      setPolicy(engine.getAccessPolicy());

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
  // CAMERA CONTROLS (TESTAR FACE ID)
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
  // RFID TESTING (TESTAR RFID / WEDGE)
  // =========================================================================

  const handleOpenRfidTest = () => {
    setTestRfidInput("");
    setErrorMessage(null);
    setShowRfidModal(true);
  };

  const handleProcessRfidTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = testRfidInput.trim();
    if (!clean) {
      setErrorMessage("Por favor aproxime o cartão do leitor ou introduza o UID.");
      return;
    }

    try {
      const engine = LocalBiometricsEngine.getInstance();
      const result = engine.processRfidSweep(clean, "ENTRY", "Leitor USB Recepção");

      setVerificationFeedback({
        granted: result.granted,
        personName: result.person?.fullName || `Cartão Desconhecido (${clean})`,
        personCategory: result.person?.category,
        authMethod: "CARTÃO RFID / NFC",
        deviceName: "Leitor USB Wedge",
        denialReason: result.denialReason,
        uid: clean,
      });

      setMetrics(engine.getDashboardMetrics());
      setShowRfidModal(false);
      setTestRfidInput("");
    } catch (err: any) {
      setErrorMessage(err.message || "Erro na validação do cartão RFID.");
    }
  };

  // =========================================================================
  // FINGERPRINT TESTING & ENROLLMENT (TESTAR IMPRESSÃO DIGITAL)
  // =========================================================================

  const handleOpenFpTest = async () => {
    const engine = LocalBiometricsEngine.getInstance();
    const testResult = await engine.testFingerprintHardware();
    setFpTestFeedback(testResult.message + (testResult.details ? ` (${testResult.details})` : ""));
    setShowFpTestModal(true);
  };

  const handleSimulateFpScan = (fingerprintProbe: string) => {
    try {
      const engine = LocalBiometricsEngine.getInstance();
      const result = engine.processFingerprintSweep(
        fingerprintProbe,
        "ENTRY",
        "Leitor Biométrico USB",
        "NORMAL"
      );

      setVerificationFeedback({
        granted: result.granted,
        personName: result.person?.fullName || "Digital Não Reconhecida",
        personCategory: result.person?.category,
        authMethod: "IMPRESSÃO DIGITAL",
        deviceName: "Leitor Biométrico Digital",
        denialReason: result.denialReason,
      });

      setMetrics(engine.getDashboardMetrics());
      setShowFpTestModal(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro na validação biométrica digital.");
    }
  };

  const handleStartEnrollFingerprint = (person: AccessPersonRecord) => {
    setFpPersonToEnroll(person);
    setFpFingerIndex("RIGHT_INDEX");
    setFpVendorSelect("ZKTECO");
    setFpTemplateInput(`FP-ISO19794-${person.internalCode}-${Date.now().toString(36).toUpperCase()}`);
    setShowFpEnrollModal(true);
  };

  const handleSaveFingerprint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fpPersonToEnroll) return;

    try {
      const engine = LocalBiometricsEngine.getInstance();
      engine.enrollFingerprint(fpPersonToEnroll.id, fpTemplateInput, {
        fingerIndex: fpFingerIndex,
        vendor: fpVendorSelect,
        qualityScore: 95,
      });

      setPersons(engine.getPersons());
      setStatusMessage(`Impressão digital (${fpFingerIndex}) cadastrada com sucesso para ${fpPersonToEnroll.fullName}.`);
      setShowFpEnrollModal(false);
      setFpPersonToEnroll(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao associar impressão digital.");
    }
  };

  const handleRemoveFingerprint = (personId: string) => {
    try {
      const engine = LocalBiometricsEngine.getInstance();
      engine.removeFingerprint(personId);
      setPersons(engine.getPersons());
      setStatusMessage("Impressão digital removida do perfil.");
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao remover impressão digital.");
    }
  };

  // =========================================================================
  // PERSON REGISTRATION & CREDENTIAL ASSIGNMENT
  // =========================================================================

  const handleRegisterPerson = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const engine = LocalBiometricsEngine.getInstance();
      const created = engine.registerPerson({
        companyId: "default-company",
        internalCode: newPerson.internalCode,
        fullName: newPerson.fullName,
        nif: newPerson.nif || undefined,
        phone: newPerson.phone || undefined,
        category: newPerson.category,
        department: newPerson.department || undefined,
        status: "ACTIVE",
      });

      setPersons(engine.getPersons());
      setMetrics(engine.getDashboardMetrics());
      setStatusMessage(`Pessoa "${created.fullName}" registada com sucesso.`);
      setNewPerson({
        internalCode: "",
        fullName: "",
        nif: "",
        phone: "",
        category: "EMPLOYEE",
        department: "",
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao registar pessoa.");
    }
  };

  const handleEnrollRfidToPerson = (personId: string) => {
    if (!rfidCardInput.trim()) {
      setErrorMessage("Introduza o número UID do cartão RFID.");
      return;
    }
    try {
      const engine = LocalBiometricsEngine.getInstance();
      engine.enrollRfidCard(personId, rfidCardInput.trim());
      setPersons(engine.getPersons());
      setRfidCardInput("");
      setStatusMessage("Cartão RFID associado com sucesso.");
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao associar cartão RFID.");
    }
  };

  const handleAttachCapturedFaceToPerson = (personId: string) => {
    if (!capturedPhotoUrl) {
      setErrorMessage("Por favor capture primeiro uma fotografia na aba Reconhecimento Facial.");
      return;
    }
    try {
      const engine = LocalBiometricsEngine.getInstance();
      engine.enrollFace(personId, capturedPhotoUrl);
      setPersons(engine.getPersons());
      setStatusMessage("Face ID associado com sucesso ao perfil.");
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao associar face.");
    }
  };

  // =========================================================================
  // ACCESS POLICY UPDATE
  // =========================================================================

  const handleToggleAllowedMethod = (method: BiometricMethod) => {
    const current = policy.allowedMethods;
    let next: BiometricMethod[];
    if (current.includes(method)) {
      if (current.length === 1) {
        setErrorMessage("Deve manter pelo menos um método de acesso ativo.");
        return;
      }
      next = current.filter((m) => m !== method);
    } else {
      next = [...current, method];
    }

    try {
      const engine = LocalBiometricsEngine.getInstance();
      const updated = engine.updateAccessPolicy({ allowedMethods: next });
      setPolicy(updated);
      setStatusMessage("Política de métodos de entrada atualizada.");
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleUpdatePolicyPriority = (key: "primaryMethod" | "secondaryMethod" | "backupMethod", val: any) => {
    try {
      const engine = LocalBiometricsEngine.getInstance();
      const updated = engine.updateAccessPolicy({ [key]: val });
      setPolicy(updated);
      setStatusMessage("Prioridade de autenticação salva.");
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // =========================================================================
  // GYM SUBSCRIPTION
  // =========================================================================

  const handleCreateGymSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGymSub.personId) {
      setErrorMessage("Selecione um membro/aluno para registar o plano.");
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

      setStatusMessage("Plano de ginásio ativado com sucesso para o membro.");
      setMetrics(engine.getDashboardMetrics());
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao registar plano.");
    }
  };

  // =========================================================================
  // HARDWARE DEVICE MANAGEMENT
  // =========================================================================

  const handleAddDevice = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const engine = LocalBiometricsEngine.getInstance();
      engine.addDevice({
        name: newDevice.name,
        category: newDevice.category,
        manufacturer: newDevice.manufacturer,
        model: newDevice.model,
        port: newDevice.port,
        status: "ONLINE",
        details: newDevice.details,
      });

      void refreshAll();
      setStatusMessage(`Dispositivo "${newDevice.name}" instalado e adicionado ao sistema.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao adicionar dispositivo.");
    }
  };

  const handleRemoveDevice = (devId: string) => {
    const engine = LocalBiometricsEngine.getInstance();
    if (engine.removeDevice(devId)) {
      void refreshAll();
      setStatusMessage("Dispositivo removido da configuração.");
    }
  };

  return (
    <div style={{ color: "#e2e8f0", padding: "1rem", fontFamily: "sans-serif" }}>
      {/* HEADER SECTION */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #1e293b",
          paddingBottom: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>👁️</span> Biometria & Controlo Inteligente de Acessos
          </h1>
          <p style={{ margin: "0.3rem 0 0 0", color: "#94a3b8", fontSize: "0.9rem" }}>
            Plataforma Corporativa Multimétodo: Reconhecimento Facial, RFID, Impressão Digital, Torniquetes e RH.
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
            💳 Testar RFID
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
            📸 Testar Face ID
          </button>
          <button
            type="button"
            onClick={() => void handleOpenFpTest()}
            style={{
              backgroundColor: "#8b5cf6",
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
            👆 Testar Impressão Digital
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
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
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
            {health.cameraStatus === "ONLINE" ? health.cameraName || "Câmara Pronta" : "Nenhuma câmara"}
          </span>
        </div>

        <div>
          <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", display: "block" }}>
            Estado RFID (USB)
          </span>
          <span
            style={{
              fontWeight: "bold",
              color: health.rfidStatus !== "OFFLINE" ? "#16a34a" : "#ef4444",
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
                background: health.rfidStatus !== "OFFLINE" ? "#16a34a" : "#ef4444",
              }}
            />
            {health.rfidStatus !== "OFFLINE" ? "Leitor USB Conectado" : "Nenhum leitor conectado"}
          </span>
        </div>

        <div>
          <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", display: "block" }}>
            Impressão Digital
          </span>
          <span
            style={{
              fontWeight: "bold",
              color: health.fingerprintStatus === "ONLINE" ? "#16a34a" : "#94a3b8",
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
                background: health.fingerprintStatus === "ONLINE" ? "#16a34a" : "#64748b",
              }}
            />
            {health.fingerprintStatus === "ONLINE"
              ? health.fingerprintName || "Scanner Ativo"
              : "Nenhum scanner conectado"}
          </span>
        </div>

        <div>
          <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", display: "block" }}>
            API Central
          </span>
          <span
            style={{
              fontWeight: "bold",
              color: health.apiStatus === "ONLINE" ? "#16a34a" : "#38bdf8",
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
                background: health.apiStatus === "ONLINE" ? "#16a34a" : "#0284c7",
              }}
            />
            {health.apiStatus === "ONLINE" ? "Central Conectada" : "Controlador Local Ativo"}
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
            {health.databaseStatus === "SYNCHRONIZED" ? "Central Sincronizada" : "Local Resiliente"}
          </span>
        </div>
      </div>

      {/* Status Messages */}
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

      {/* Error Messages */}
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
          { key: "dashboard", label: "📊 Monitor & Dashboard" },
          { key: "persons", label: "👥 Pessoas & Credenciais" },
          { key: "fingerprint", label: "👆 Impressões Digitais" },
          { key: "facial", label: "📸 Reconhecimento Facial" },
          { key: "devices", label: "🚪 Dispositivos Instalados" },
          { key: "config", label: "⚙️ Configurações de Acesso" },
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

      {/* TAB 1: DASHBOARD & ACESSOS COM BREAKDOWN DE MÉTODOS */}
      {activeTab === "dashboard" && (
        <div>
          {/* Main Counter Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "1rem", marginBottom: "1.2rem" }}>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #3b82f6" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Pessoas no Edifício</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#38bdf8" }}>{metrics.presentCount}</h2>
              <small style={{ color: "#64748b" }}>Presentes em tempo real</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #10b981" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Total Entradas Hoje</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#34d399" }}>{metrics.todayEntries}</h2>
              <small style={{ color: "#64748b" }}>Validações com sucesso</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #ef4444" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Tentativas Recusadas</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#f87171" }}>{metrics.deniedAttempts}</h2>
              <small style={{ color: "#64748b" }}>Sem permissão / Expirados</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #8b5cf6" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Membros de Ginásio</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#c084fc" }}>{metrics.gymMembersPresent}</h2>
              <small style={{ color: "#64748b" }}>Com plano ativo e pago</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #f59e0b" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Colaboradores (RH)</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#fbbf24" }}>{metrics.internalStaffPresent}</h2>
              <small style={{ color: "#64748b" }}>Em horário de serviço</small>
            </div>
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", borderLeft: "4px solid #06b6d4" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Pessoas Ausentes</span>
              <h2 style={{ margin: "0.4rem 0 0 0", fontSize: "2rem", color: "#22d3ee" }}>{metrics.absentCount}</h2>
              <small style={{ color: "#64748b" }}>Cadastradas sem entrada</small>
            </div>
          </div>

          {/* Breakdown By Authentication Method */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.05rem", color: "#93c5fd" }}>
              📊 Distribuição de Entradas por Método de Autenticação
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <div style={{ backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", textAlign: "center" }}>
                <span style={{ fontSize: "1.5rem" }}>📸</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#10b981", marginTop: "4px" }}>
                  {metrics.entriesByFace}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Entradas por Face ID</div>
              </div>

              <div style={{ backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", textAlign: "center" }}>
                <span style={{ fontSize: "1.5rem" }}>💳</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#38bdf8", marginTop: "4px" }}>
                  {metrics.entriesByRfid}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Entradas por RFID / NFC</div>
              </div>

              <div style={{ backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", textAlign: "center" }}>
                <span style={{ fontSize: "1.5rem" }}>👆</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#c084fc", marginTop: "4px" }}>
                  {metrics.entriesByFingerprint}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Entradas por Impressão Digital</div>
              </div>

              <div style={{ backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", textAlign: "center" }}>
                <span style={{ fontSize: "1.5rem" }}>🔢</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#f59e0b", marginTop: "4px" }}>
                  {metrics.entriesByPin}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Entradas por PIN / Teclado</div>
              </div>

              <div style={{ backgroundColor: "#0f172a", padding: "1rem", borderRadius: "6px", textAlign: "center" }}>
                <span style={{ fontSize: "1.5rem" }}>📱</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#06b6d4", marginTop: "4px" }}>
                  {metrics.entriesByQr}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Entradas por QR Code</div>
              </div>
            </div>
          </div>

          {/* Live Access Feed */}
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
                        <td style={{ padding: "0.6rem" }}>
                          {log.authMethod === "FACE" ? "📸 Face ID" : log.authMethod === "FINGERPRINT" ? "👆 Digital" : "💳 RFID"}
                        </td>
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
                <small>Aproxime um cartão RFID, use o leitor de impressão digital ou ative a câmara facial para registar passagens reais.</small>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PESSOAS & CREDENCIAIS SIMULTÂNEAS */}
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
                style={{
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  border: "none",
                  padding: "0.7rem",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginTop: "0.5rem",
                }}
              >
                Cadastrar Pessoa
              </button>
            </form>
          </div>

          {/* Persons List & Multi-Credentials Management */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>👥 Acervo de Pessoas & Credenciais Biométricas Simultâneas</h3>
            {persons.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {persons.map((person) => (
                  <div
                    key={person.id}
                    style={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      padding: "1rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.8rem" }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc" }}>
                          {person.fullName}
                          <span style={{ fontSize: "0.8rem", color: "#94a3b8", marginLeft: "8px" }}>
                            ({person.internalCode})
                          </span>
                        </h4>
                        <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "4px" }}>
                          Categoria: <span style={{ color: "#38bdf8" }}>{person.category}</span>
                          {person.department && ` | Sector: ${person.department}`}
                          {person.phone && ` | Tel: ${person.phone}`}
                        </div>
                      </div>

                      {/* Multi-Credential Badges */}
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            backgroundColor: person.photoUrl ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.2)",
                            color: person.photoUrl ? "#34d399" : "#64748b",
                            border: `1px solid ${person.photoUrl ? "#10b981" : "#475569"}`,
                          }}
                        >
                          📸 Face ID: {person.photoUrl ? "Ativo" : "Não cadastrado"}
                        </span>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            backgroundColor: person.rfidCardUid ? "rgba(56, 189, 248, 0.2)" : "rgba(100, 116, 139, 0.2)",
                            color: person.rfidCardUid ? "#38bdf8" : "#64748b",
                            border: `1px solid ${person.rfidCardUid ? "#38bdf8" : "#475569"}`,
                          }}
                        >
                          💳 RFID: {person.rfidCardUid ? person.rfidCardUid : "Sem Cartão"}
                        </span>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            backgroundColor: person.fingerprintEnrolled ? "rgba(192, 132, 252, 0.2)" : "rgba(100, 116, 139, 0.2)",
                            color: person.fingerprintEnrolled ? "#c084fc" : "#64748b",
                            border: `1px solid ${person.fingerprintEnrolled ? "#c084fc" : "#475569"}`,
                          }}
                        >
                          👆 Digital: {person.fingerprintEnrolled ? person.fingerIndex || "Cadastrada" : "Não cadastrada"}
                        </span>
                      </div>
                    </div>

                    {/* Credential Action Toolbar */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", borderTop: "1px solid #1e293b", paddingTop: "0.8rem" }}>
                      <button
                        type="button"
                        onClick={() => handleStartEnrollFingerprint(person)}
                        style={{
                          backgroundColor: "#6b21a8",
                          color: "#fff",
                          border: "none",
                          padding: "4px 10px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        👆 {person.fingerprintEnrolled ? "Recapturar Digital" : "Registar Impressão Digital"}
                      </button>

                      {person.fingerprintEnrolled && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFingerprint(person.id)}
                          style={{
                            backgroundColor: "#334155",
                            color: "#f87171",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                          }}
                        >
                          Remover Digital
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAttachCapturedFaceToPerson(person.id)}
                        style={{
                          backgroundColor: "#065f46",
                          color: "#fff",
                          border: "none",
                          padding: "4px 10px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        📸 Associar Face Capturada
                      </button>

                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        <input
                          type="text"
                          placeholder="Ler/Digitar Cartão UID..."
                          value={selectedPerson?.id === person.id ? rfidCardInput : ""}
                          onFocus={() => setSelectedPerson(person)}
                          onChange={(e) => setRfidCardInput(e.target.value.toUpperCase())}
                          style={{
                            padding: "4px 8px",
                            fontSize: "12px",
                            borderRadius: "4px",
                            backgroundColor: "#1e293b",
                            border: "1px solid #334155",
                            color: "#fff",
                            width: "140px",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleEnrollRfidToPerson(person.id)}
                          style={{
                            backgroundColor: "#1d4ed8",
                            color: "#fff",
                            border: "none",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            cursor: "pointer",
                          }}
                        >
                          Associar RFID
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "2.5rem 0", color: "#64748b" }}>
                <span>Nenhuma pessoa cadastrada. Utilize o formulário ao lado para adicionar registos reais.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: IMPRESSÕES DIGITAIS (NOVA ABA DEDICADA) */}
      {activeTab === "fingerprint" && (
        <div>
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ margin: 0, color: "#c084fc", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>👆</span> Gestão de Impressões Digitais & Leitores Biométricos
                </h3>
                <p style={{ margin: "0.3rem 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
                  Suporte nativo a dispositivos de mercado: <strong>ZKTeco, DigitalPersona (HID Global), Suprema, Nitgen e Futronic</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleOpenFpTest()}
                style={{
                  backgroundColor: "#8b5cf6",
                  color: "#fff",
                  border: "none",
                  padding: "0.6rem 1.2rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                🔍 Testar Leitor Digital Físico
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            {/* Supported Brands & Drivers Info */}
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
              <h4 style={{ margin: "0 0 0.8rem 0", color: "#38bdf8" }}>🔌 Marcas e Modelos Homologados</h4>
              <ul style={{ color: "#cbd5e1", fontSize: "0.85rem", lineHeight: "1.6", paddingLeft: "1.2rem" }}>
                <li><strong>ZKTeco:</strong> SLK20R, ZK9500, LiveID USB / SilkID Ótico</li>
                <li><strong>DigitalPersona / HID:</strong> U.are.U 4500, U.are.U 5160, U.are.U 5300 (WebAPI / USB)</li>
                <li><strong>Suprema:</strong> BioMini, BioMini Plus 2, BioMini Slim (SDK BioStar)</li>
                <li><strong>Nitgen:</strong> eNBioScan-C1, Fingkey Hamster I & II</li>
                <li><strong>Futronic:</strong> FS80H, FS88H, FS26 USB Optical Sensor</li>
              </ul>
              <div style={{ marginTop: "1rem", padding: "0.8rem", backgroundColor: "#0f172a", borderRadius: "6px", border: "1px solid #334155" }}>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Padrões Criptográficos de Minúcias:</span>
                <div style={{ color: "#10b981", fontSize: "0.85rem", fontWeight: "bold", marginTop: "4px" }}>
                  ISO/IEC 19794-2 & ANSI-378 Standard Compliant
                </div>
              </div>
            </div>

            {/* Enrolled Fingerprints Summary */}
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
              <h4 style={{ margin: "0 0 0.8rem 0", color: "#34d399" }}>📋 Pessoas com Digital Ativa</h4>
              {persons.filter((p) => p.fingerprintEnrolled).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {persons.filter((p) => p.fingerprintEnrolled).map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: "0.6rem 0.8rem",
                        backgroundColor: "#0f172a",
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong style={{ color: "#f8fafc" }}>{p.fullName}</strong>
                        <span style={{ color: "#94a3b8", fontSize: "0.8rem", marginLeft: "6px" }}>({p.internalCode})</span>
                        <div style={{ fontSize: "0.75rem", color: "#c084fc" }}>
                          Dedo: {p.fingerIndex || "Indicador Direito"} | Qualidade: {p.fingerprintQuality || 95}% ({p.fingerprintVendor || "ZKTeco"})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFingerprint(p.id)}
                        style={{
                          backgroundColor: "#334155",
                          color: "#f87171",
                          border: "none",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "2rem 0", color: "#64748b" }}>
                  <span>Nenhuma impressão digital registada. Acesse a aba "Pessoas & Credenciais" para cadastrar.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RECONHECIMENTO FACIAL (LIVE WEBRTC) */}
      {activeTab === "facial" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>📹 Câmaras de Vídeo e Sinal ao Vivo</h3>
            <div
              style={{
                width: "100%",
                height: "320px",
                backgroundColor: "#000",
                borderRadius: "8px",
                overflow: "hidden",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #334155",
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraActive ? "block" : "none" }}
              />
              {!cameraActive && (
                <div style={{ textAlign: "center", color: "#64748b", padding: "1rem" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>📷</div>
                  <p style={{ margin: 0, fontWeight: "bold" }}>Sinal de Vídeo Desligado</p>
                  <small>Clique em "Ativar Câmara" para iniciar a transmissão WebRTC real.</small>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.8rem", marginTop: "1rem" }}>
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={() => void handleStartCamera()}
                  style={{
                    backgroundColor: "#10b981",
                    color: "#fff",
                    border: "none",
                    padding: "0.6rem 1.2rem",
                    borderRadius: "6px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  🟢 Ativar Câmara de Vídeo
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCaptureFace}
                    style={{
                      backgroundColor: "#3b82f6",
                      color: "#fff",
                      border: "none",
                      padding: "0.6rem 1.2rem",
                      borderRadius: "6px",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    📸 Capturar Frame & Identificar
                  </button>
                  <button
                    type="button"
                    onClick={handleStopCamera}
                    style={{
                      backgroundColor: "#ef4444",
                      color: "#fff",
                      border: "none",
                      padding: "0.6rem 1.2rem",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Parar Sinal
                  </button>
                </>
              )}
            </div>
            {cameraError && <div style={{ color: "#f87171", marginTop: "0.6rem", fontSize: "0.85rem" }}>⚠️ {cameraError}</div>}
          </div>

          {/* Captured Preview */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>🖼️ Último Fotograma Capturado</h3>
            {capturedPhotoUrl ? (
              <div>
                <img
                  src={capturedPhotoUrl}
                  alt="Captured Face"
                  style={{ width: "100%", maxHeight: "240px", objectFit: "contain", borderRadius: "6px", border: "1px solid #334155" }}
                />
                <div style={{ marginTop: "1rem", color: "#10b981", fontSize: "0.9rem" }}>
                  ✓ Fotograma pronto para ser associado a uma pessoa na aba <strong>Pessoas & Credenciais</strong>.
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                <span>Nenhuma captura realizada nesta sessão.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: DISPOSITIVOS INSTALADOS (HARDWARE REAL) */}
      {activeTab === "devices" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
            {/* Install New Device Form */}
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", height: "fit-content" }}>
              <h3 style={{ margin: "0 0 1rem 0" }}>➕ Instalar Novo Equipamento</h3>
              <form onSubmit={handleAddDevice} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Nome do Dispositivo</label>
                  <input
                    type="text"
                    required
                    value={newDevice.name}
                    onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Categoria de Hardware</label>
                  <select
                    value={newDevice.category}
                    onChange={(e) => setNewDevice({ ...newDevice, category: e.target.value as any })}
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                  >
                    <option value="TURNSTILE">Torniquete de Entrada/Saída</option>
                    <option value="FINGERPRINT">Leitor Biométrico de Impressão Digital</option>
                    <option value="CAMERA">Câmara de Vídeo / Reconhecimento Facial</option>
                    <option value="RFID">Leitor de Cartões RFID / NFC USB</option>
                    <option value="DOOR">Trinco Elétrico / Porta Automática</option>
                    <option value="RELAY">Controlador de Relé Disparador</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Fabricante / Marca</label>
                  <input
                    type="text"
                    required
                    value={newDevice.manufacturer}
                    onChange={(e) => setNewDevice({ ...newDevice, manufacturer: e.target.value })}
                    placeholder="ex: ZKTeco, Hikvision, DigitalPersona, Suprema, Futronic"
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Porta / Endereço IP / Comunicação</label>
                  <input
                    type="text"
                    required
                    value={newDevice.port}
                    onChange={(e) => setNewDevice({ ...newDevice, port: e.target.value })}
                    placeholder="ex: USB HID, COM3, TCP: 192.168.1.201:4370"
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    backgroundColor: "#2563eb",
                    color: "#fff",
                    border: "none",
                    padding: "0.7rem",
                    borderRadius: "4px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    marginTop: "0.5rem",
                  }}
                >
                  Registar Dispositivo Instalado
                </button>
              </form>
            </div>

            {/* List of Detected & Installed Devices */}
            <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>🚪 Dispositivos Instalados na Unidade</h3>
                <button
                  type="button"
                  onClick={() => void refreshAll()}
                  style={{
                    backgroundColor: "#334155",
                    color: "#e2e8f0",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Re-escanear Barramento
                </button>
              </div>

              {detectedDevices.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                  {detectedDevices.map((dev) => (
                    <div
                      key={dev.id}
                      style={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: "6px",
                        padding: "0.8rem 1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "1.2rem" }}>
                            {dev.category === "CAMERA" ? "📸" : dev.category === "FINGERPRINT" ? "👆" : dev.category === "RFID" ? "💳" : "🚪"}
                          </span>
                          <strong style={{ fontSize: "1rem", color: "#f8fafc" }}>{dev.name}</strong>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: "bold",
                              backgroundColor: dev.status === "ONLINE" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                              color: dev.status === "ONLINE" ? "#10b981" : "#f87171",
                            }}
                          >
                            {dev.status === "ONLINE" ? "✓ ONLINE" : "✗ OFFLINE"}
                          </span>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "4px" }}>
                          Fabricante: <strong>{dev.manufacturer}</strong> | Porta: <code>{dev.port}</code>
                          {dev.details && ` | ${dev.details}`}
                        </div>
                      </div>

                      {dev.id.startsWith("dev-") && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDevice(dev.id)}
                          style={{
                            backgroundColor: "transparent",
                            border: "1px solid #ef4444",
                            color: "#f87171",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                          }}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "2.5rem 0", color: "#64748b" }}>
                  <span>Nenhum dispositivo detetado. Conecte leitores USB ou registe um torniquete.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: CONFIGURAÇÕES BIOMÉTRICAS (MÉTODOS ATIVOS, PRIORIDADES & 2FA) */}
      {activeTab === "config" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Allowed Methods Checkboxes */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0", color: "#38bdf8" }}>☑️ Métodos de Entrada Permitidos na Unidade</h3>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Marque quais as credenciais que os torniquetes e portas aceitam para validação nesta instalação:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              {[
                { id: "FACE", label: "Reconhecimento Facial (Face ID)", icon: "📸" },
                { id: "RFID_CARD", label: "Cartão RFID / NFC", icon: "💳" },
                { id: "FINGERPRINT", label: "Impressão Digital (Minúcias Biométricas)", icon: "👆" },
                { id: "PIN", label: "Código PIN (Teclado Numérico)", icon: "🔢" },
                { id: "QR_CODE", label: "QR Code Dinâmico / Digital", icon: "📱" },
              ].map((m) => {
                const active = policy.allowedMethods.includes(m.id as BiometricMethod);
                return (
                  <label
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "0.6rem 0.8rem",
                      backgroundColor: active ? "rgba(59, 130, 246, 0.15)" : "#0f172a",
                      border: `1px solid ${active ? "#3b82f6" : "#334155"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => handleToggleAllowedMethod(m.id as BiometricMethod)}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "1.2rem" }}>{m.icon}</span>
                    <strong style={{ color: active ? "#ffffff" : "#94a3b8" }}>{m.label}</strong>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Priority Hierarchy & Policy Settings */}
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0", color: "#34d399" }}>⚙️ Hierarquia de Métodos & Regras de Acesso</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                  Método Principal de Autenticação
                </label>
                <select
                  value={policy.primaryMethod}
                  onChange={(e) => handleUpdatePolicyPriority("primaryMethod", e.target.value)}
                  style={{ width: "100%", padding: "0.6rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                >
                  <option value="FACE">📸 Reconhecimento Facial</option>
                  <option value="FINGERPRINT">👆 Impressão Digital</option>
                  <option value="RFID_CARD">💳 Cartão RFID / NFC</option>
                  <option value="PIN">🔢 Código PIN</option>
                  <option value="QR_CODE">📱 QR Code</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                  Método Secundário
                </label>
                <select
                  value={policy.secondaryMethod}
                  onChange={(e) => handleUpdatePolicyPriority("secondaryMethod", e.target.value)}
                  style={{ width: "100%", padding: "0.6rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                >
                  <option value="FINGERPRINT">👆 Impressão Digital</option>
                  <option value="RFID_CARD">💳 Cartão RFID / NFC</option>
                  <option value="FACE">📸 Reconhecimento Facial</option>
                  <option value="PIN">🔢 Código PIN</option>
                  <option value="QR_CODE">📱 QR Code</option>
                  <option value="NONE">Nenhum</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                  Método de Backup / Contingência
                </label>
                <select
                  value={policy.backupMethod}
                  onChange={(e) => handleUpdatePolicyPriority("backupMethod", e.target.value)}
                  style={{ width: "100%", padding: "0.6rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                >
                  <option value="RFID_CARD">💳 Cartão RFID / NFC</option>
                  <option value="PIN">🔢 Código PIN</option>
                  <option value="QR_CODE">📱 QR Code</option>
                  <option value="FINGERPRINT">👆 Impressão Digital</option>
                  <option value="NONE">Nenhum</option>
                </select>
              </div>

              <div style={{ borderTop: "1px solid #334155", paddingTop: "1rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={policy.twoFactorRequired}
                    onChange={(e) => {
                      const engine = LocalBiometricsEngine.getInstance();
                      setPolicy(engine.updateAccessPolicy({ twoFactorRequired: e.target.checked }));
                    }}
                    style={{ width: "18px", height: "18px" }}
                  />
                  <span>
                    <strong>Exigir Duplo Fator (2FA)</strong>
                    <small style={{ display: "block", color: "#94a3b8" }}>Ex: Cartão RFID + Impressão Digital obrigatórios para passar no torniquete.</small>
                  </span>
                </label>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                  Tempo de Abertura do Relé do Torniquete (Segundos)
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={policy.turnstileRelaySeconds}
                  onChange={(e) => {
                    const sec = parseInt(e.target.value, 10) || 3;
                    const engine = LocalBiometricsEngine.getInstance();
                    setPolicy(engine.updateAccessPolicy({ turnstileRelaySeconds: sec }));
                  }}
                  style={{ width: "100%", padding: "0.6rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: GINÁSIO & SUBSCRIÇÕES */}
      {activeTab === "gym" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px", height: "fit-content" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>🏋️ Ativar Plano de Ginásio</h3>
            <form onSubmit={handleCreateGymSub} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Selecionar Aluno / Membro</label>
                <select
                  value={newGymSub.personId}
                  onChange={(e) => setNewGymSub({ ...newGymSub, personId: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                >
                  <option value="">-- Selecione o Aluno --</option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.internalCode}) - {p.category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Nome do Plano</label>
                <input
                  type="text"
                  value={newGymSub.planName}
                  onChange={(e) => setNewGymSub({ ...newGymSub, planName: e.target.value })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Duração (Meses)</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={newGymSub.durationMonths}
                  onChange={(e) => setNewGymSub({ ...newGymSub, durationMonths: parseInt(e.target.value, 10) || 1 })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Valor Mensal (Kz)</label>
                <input
                  type="number"
                  value={newGymSub.amountKz}
                  onChange={(e) => setNewGymSub({ ...newGymSub, amountKz: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                />
              </div>
              <button
                type="submit"
                style={{
                  backgroundColor: "#8b5cf6",
                  color: "#fff",
                  border: "none",
                  padding: "0.7rem",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginTop: "0.5rem",
                }}
              >
                Ativar Mensalidade & Liberar Torniquete
              </button>
            </form>
          </div>

          <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
            <h3 style={{ margin: "0 0 1rem 0" }}>📋 Validação Automática de Mensalidades (Face, RFID ou Digital)</h3>
            <p style={{ color: "#cbd5e1", fontSize: "0.9rem", lineHeight: "1.5" }}>
              Quando qualquer aluno ou membro de ginásio valida a passagem por <strong>Reconhecimento Facial, Cartão RFID ou Impressão Digital</strong>, o torniquete verifica em tempo real se o plano está pago e dentro do prazo de validade.
            </p>
            <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#0f172a", borderRadius: "6px" }}>
              <h4 style={{ margin: "0 0 0.5rem 0", color: "#10b981" }}>Regra de Bloqueio em Produção</h4>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
                Alunos com mensalidades vencidas recebem o bloqueio imediato do torniquete com o motivo: <code>MENSALIDADE_EXPIRADA</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: RH & PONTO ELETRÓNICO (EMPRESAS) */}
      {activeTab === "attendance" && (
        <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ margin: 0, color: "#fbbf24" }}>🕒 Espelho de Ponto Eletrónico Integrado com RH</h3>
              <p style={{ margin: "0.3rem 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
                Picagens biométricas de <strong>Entrada, Saída, Pausas e Horas Extras</strong> via Face ID, RFID ou Impressão Digital.
              </p>
            </div>
          </div>

          {LocalBiometricsEngine.getInstance().getAttendanceHRLogs().length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                    <th style={{ padding: "0.6rem" }}>Data/Hora</th>
                    <th style={{ padding: "0.6rem" }}>Colaborador</th>
                    <th style={{ padding: "0.6rem" }}>Sector</th>
                    <th style={{ padding: "0.6rem" }}>Evento de RH</th>
                    <th style={{ padding: "0.6rem" }}>Método Utilizado</th>
                    <th style={{ padding: "0.6rem" }}>Dispositivo</th>
                  </tr>
                </thead>
                <tbody>
                  {LocalBiometricsEngine.getInstance().getAttendanceHRLogs().map((hr) => (
                    <tr key={hr.id} style={{ borderBottom: "1px solid #2d3748" }}>
                      <td style={{ padding: "0.6rem", color: "#94a3b8" }}>{new Date(hr.timestamp).toLocaleString()}</td>
                      <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{hr.personName} ({hr.internalCode})</td>
                      <td style={{ padding: "0.6rem" }}>{hr.department || "Geral"}</td>
                      <td style={{ padding: "0.6rem" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            backgroundColor: hr.eventType.includes("ENTRY") ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                            color: hr.eventType.includes("ENTRY") ? "#34d399" : "#fbbf24",
                          }}
                        >
                          {hr.eventType === "ENTRY" ? "Entrada de Turno" : hr.eventType === "EXIT" ? "Saída de Turno" : hr.eventType}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem" }}>
                        {hr.authMethod === "FACE" ? "📸 Face ID" : hr.authMethod === "FINGERPRINT" ? "👆 Impressão Digital" : "💳 Cartão RFID"}
                      </td>
                      <td style={{ padding: "0.6rem", color: "#94a3b8" }}>{hr.deviceName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "2.5rem 0", color: "#64748b" }}>
              <span>Nenhum registo de ponto registado até ao momento em ambiente de produção.</span>
            </div>
          )}
        </div>
      )}

      {/* TAB 9: AUDITORIA FORENSE */}
      {activeTab === "audit" && (
        <div style={{ backgroundColor: "#1e293b", padding: "1.2rem", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>📜 Trilha de Auditoria Forense Completa</h3>
          {metrics.recentLogs.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                    <th style={{ padding: "0.6rem" }}>Timestamp</th>
                    <th style={{ padding: "0.6rem" }}>ID Evento</th>
                    <th style={{ padding: "0.6rem" }}>Identificação</th>
                    <th style={{ padding: "0.6rem" }}>Método</th>
                    <th style={{ padding: "0.6rem" }}>Sentido</th>
                    <th style={{ padding: "0.6rem" }}>Dispositivo</th>
                    <th style={{ padding: "0.6rem" }}>Resultado</th>
                    <th style={{ padding: "0.6rem" }}>Motivo / Código</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid #2d3748" }}>
                      <td style={{ padding: "0.6rem", color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ padding: "0.6rem", fontFamily: "monospace", color: "#64748b" }}>{log.id}</td>
                      <td style={{ padding: "0.6rem", fontWeight: "bold" }}>{log.personName}</td>
                      <td style={{ padding: "0.6rem" }}>{log.authMethod}</td>
                      <td style={{ padding: "0.6rem" }}>{log.direction}</td>
                      <td style={{ padding: "0.6rem" }}>{log.deviceName}</td>
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
              <span>Trilha de auditoria vazia em ambiente de produção limpo.</span>
            </div>
          )}
        </div>
      )}

      {/* MODAL: TESTAR RFID / WEDGE */}
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
              <span>💳</span> Leitura de Cartão RFID / NFC Físico
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

      {/* MODAL: TESTAR LEITOR BIOMÉTRICO DIGITAL */}
      {showFpTestModal && (
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
          onClick={() => setShowFpTestModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: "8px",
              padding: "2rem",
              width: "480px",
              maxWidth: "90%",
              border: "1px solid #8b5cf6",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.8rem 0", color: "#c084fc", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>👆</span> Diagnóstico de Leitor de Impressão Digital
            </h3>

            <div style={{ padding: "0.8rem", backgroundColor: "#0f172a", borderRadius: "6px", marginBottom: "1rem" }}>
              <div style={{ color: "#38bdf8", fontSize: "0.9rem", fontWeight: "bold" }}>Estado do Sensor Físico:</div>
              <div style={{ color: "#cbd5e1", fontSize: "0.85rem", marginTop: "4px" }}>
                {fpTestFeedback || "Aguardando verificação do driver USB..."}
              </div>
            </div>

            <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
              Selecione uma das opções abaixo para validar a passagem biométrica no torniquete:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
              {persons.filter((p) => p.fingerprintEnrolled).length > 0 ? (
                persons.filter((p) => p.fingerprintEnrolled).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSimulateFpScan(p.fingerprintTemplate!)}
                    style={{
                      padding: "0.6rem 1rem",
                      backgroundColor: "#0f172a",
                      border: "1px solid #6b21a8",
                      color: "#f8fafc",
                      borderRadius: "4px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>👆 Validar Digital de: <strong>{p.fullName}</strong></span>
                    <span style={{ color: "#c084fc", fontSize: "11px" }}>{p.fingerIndex}</span>
                  </button>
                ))
              ) : (
                <div style={{ color: "#f87171", fontSize: "0.85rem", padding: "0.5rem 0" }}>
                  Nenhuma pessoa cadastrada com impressão digital ainda. Cadastre primeiro uma pessoa para testar a leitura.
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={() => setShowFpTestModal(false)}
                style={{
                  backgroundColor: "#334155",
                  color: "#cbd5e1",
                  border: "none",
                  padding: "0.6rem 1.2rem",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ENROLL FINGERPRINT TO PERSON */}
      {showFpEnrollModal && fpPersonToEnroll && (
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
          onClick={() => setShowFpEnrollModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: "8px",
              padding: "2rem",
              width: "480px",
              maxWidth: "90%",
              border: "1px solid #6b21a8",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.8rem 0", color: "#c084fc", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>👆</span> Registar Impressão Digital: {fpPersonToEnroll.fullName}
            </h3>

            <form onSubmit={handleSaveFingerprint} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Dedo a Registar</label>
                <select
                  value={fpFingerIndex}
                  onChange={(e) => setFpFingerIndex(e.target.value as FingerIndex)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                >
                  <option value="RIGHT_INDEX">Indicador Direito</option>
                  <option value="RIGHT_THUMB">Polegar Direito</option>
                  <option value="RIGHT_MIDDLE">Médio Direito</option>
                  <option value="LEFT_INDEX">Indicador Esquerdo</option>
                  <option value="LEFT_THUMB">Polegar Esquerdo</option>
                  <option value="LEFT_MIDDLE">Médio Esquerdo</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Dispositivo / Fabricante do Sensor</label>
                <select
                  value={fpVendorSelect}
                  onChange={(e) => setFpVendorSelect(e.target.value as FingerprintVendor)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#fff", marginTop: "0.2rem" }}
                >
                  <option value="ZKTECO">ZKTeco (SLK20R / ZK9500 / LiveID)</option>
                  <option value="DIGITAL_PERSONA">DigitalPersona / HID (U.are.U 4500/5160)</option>
                  <option value="SUPREMA">Suprema (BioMini / BioMini Plus 2)</option>
                  <option value="FUTRONIC">Futronic (FS80H / FS88H)</option>
                  <option value="NITGEN">Nitgen (Fingkey Hamster / eNBioScan)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Template Biométrico (ISO/IEC 19794-2 ou ANSI-378)</label>
                <input
                  type="text"
                  required
                  value={fpTemplateInput}
                  onChange={(e) => setFpTemplateInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "4px",
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    color: "#38bdf8",
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    marginTop: "0.2rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => setShowFpEnrollModal(false)}
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
                    backgroundColor: "#7e22ce",
                    color: "#fff",
                    border: "none",
                    padding: "0.6rem 1.2rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Salvar Impressão Digital
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
