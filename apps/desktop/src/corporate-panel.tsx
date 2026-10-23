import React, { useState, useEffect } from "react";
import { formatKwanza } from "@angola/shared";
import { MODULE_CATALOG, AppModule } from "./modules";
import { LiveUpdateEngine, LivePatchPayload, BroadcastNotification } from "./live-update-engine";

export interface CorporateStore {
  id: string;
  code: string;
  name: string;
  isHeadquarters: boolean;
  online: boolean;
  lastPingAt: string;
  activeUsersCount: number;
  todaySalesCents: number;
  todayDocumentsCount: number;
  cashDrawerCents: number;
  activeModules: AppModule[];
  appVersion: string;
  hardwareId: string;
  terminalId: string;
  pendingSyncCount: number;
}

export interface CorporateUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: "SUPER_ADMIN" | "LOCAL_ADMIN" | "CFO" | "CRO" | "MANAGER" | "SUPERVISOR" | "ACCOUNTANT" | "HR" | "CASHIER";
  branchId?: string;
  branchName?: string;
  active: boolean;
  suspendedReason?: string;
  allowedModules: AppModule[];
}

export interface CorporateEvent {
  id: string;
  timestamp: string;
  actorName: string;
  branchCode?: string;
  eventType: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  description: string;
}

const DEFAULT_STORES: CorporateStore[] = [
  {
    id: "hq-store-01",
    code: "SEDE-KINAXIXI",
    name: "Sede Central Kinaxixi (Loja Mãe)",
    isHeadquarters: true,
    online: true,
    lastPingAt: new Date().toISOString(),
    activeUsersCount: 4,
    todaySalesCents: 4500000, // 45.000 Kz
    todayDocumentsCount: 28,
    cashDrawerCents: 2100000,
    activeModules: ["CORPORATE", "POS", "STOCK", "TREASURY", "HR", "CRM", "BI", "AI", "BIOMETRICS"],
    appVersion: "2.2.4",
    hardwareId: "HQ-HWID-001",
    terminalId: "TERM-HQ-01",
    pendingSyncCount: 0,
  },
  {
    id: "br-talatona-02",
    code: "BR-TALATONA",
    name: "Filial Talatona Shopping",
    isHeadquarters: false,
    online: true,
    lastPingAt: new Date(Date.now() - 30_000).toISOString(),
    activeUsersCount: 3,
    todaySalesCents: 3850000, // 38.500 Kz
    todayDocumentsCount: 19,
    cashDrawerCents: 1400000,
    activeModules: ["POS", "STOCK", "TREASURY", "CRM", "BIOMETRICS"],
    appVersion: "2.2.4",
    hardwareId: "BR-HWID-TALATONA",
    terminalId: "TERM-TAL-01",
    pendingSyncCount: 2,
  },
  {
    id: "br-viana-03",
    code: "BR-VIANA",
    name: "Filial Viana Polo Industrial",
    isHeadquarters: false,
    online: true,
    lastPingAt: new Date(Date.now() - 90_000).toISOString(),
    activeUsersCount: 2,
    todaySalesCents: 2900000, // 29.000 Kz
    todayDocumentsCount: 14,
    cashDrawerCents: 950000,
    activeModules: ["POS", "STOCK", "TREASURY"],
    appVersion: "2.2.4",
    hardwareId: "BR-HWID-VIANA",
    terminalId: "TERM-VIA-01",
    pendingSyncCount: 0,
  },
  {
    id: "br-benguela-04",
    code: "BR-BENGUELA",
    name: "Filial Benguela Marginal",
    isHeadquarters: false,
    online: false,
    lastPingAt: new Date(Date.now() - 480_000).toISOString(), // 8 min ago
    activeUsersCount: 0,
    todaySalesCents: 1200000,
    todayDocumentsCount: 8,
    cashDrawerCents: 600000,
    activeModules: ["POS", "STOCK"],
    appVersion: "2.2.3",
    hardwareId: "BR-HWID-BENGUELA",
    terminalId: "TERM-BEN-01",
    pendingSyncCount: 15,
  },
];

const DEFAULT_USERS: CorporateUser[] = [
  {
    id: "usr-01",
    username: "admin.central",
    displayName: "Dr. Domingos Fernandes (Super Admin)",
    email: "domingos.fernandes@vendaja.ao",
    role: "SUPER_ADMIN",
    branchName: "Sede Central (Global)",
    active: true,
    allowedModules: ["CORPORATE", "POS", "STOCK", "TREASURY", "HR", "CRM", "BI", "AI", "BIOMETRICS"],
  },
  {
    id: "usr-02",
    username: "cfo.corporativo",
    displayName: "Dra. Isabel Kwanza (CFO Grupo)",
    email: "isabel.kwanza@vendaja.ao",
    role: "CFO",
    branchName: "Sede Central (Global)",
    active: true,
    allowedModules: ["CORPORATE", "TREASURY", "ACCOUNTING", "BI", "REPORTS"],
  },
  {
    id: "usr-03",
    username: "local.talatona",
    displayName: "Eng. Pedro Simão (Admin Local Talatona)",
    email: "pedro.simao@vendaja.ao",
    role: "LOCAL_ADMIN",
    branchId: "br-talatona-02",
    branchName: "Filial Talatona Shopping",
    active: true,
    allowedModules: ["POS", "STOCK", "TREASURY", "BIOMETRICS"],
  },
  {
    id: "usr-04",
    username: "caixa.viana",
    displayName: "Helena Manuel (Operadora Caixa)",
    email: "helena.manuel@vendaja.ao",
    role: "CASHIER",
    branchId: "br-viana-03",
    branchName: "Filial Viana Polo Industrial",
    active: true,
    allowedModules: ["POS"],
  },
  {
    id: "usr-05",
    username: "caixa.suspenso",
    displayName: "João Afonso (Ex-Operador)",
    email: "joao.afonso@vendaja.ao",
    role: "CASHIER",
    branchId: "br-benguela-04",
    branchName: "Filial Benguela Marginal",
    active: false,
    suspendedReason: "Suspensão preventiva por auditoria de quebra de caixa.",
    allowedModules: ["POS"],
  },
];

export const CorporatePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "COCKPIT" | "STORES" | "USERS" | "MODULES" | "LIVE_UPDATES" | "LICENSES" | "BROADCASTS" | "AUDIT" | "SYNC_HUB"
  >("COCKPIT");

  const [stores, setStores] = useState<CorporateStore[]>(DEFAULT_STORES);
  const [users, setUsers] = useState<CorporateUser[]>(DEFAULT_USERS);
  const [storeLicenses, setStoreLicenses] = useState<Record<string, { status: "ACTIVE" | "REVOKED"; reason?: string }>>({
    "br-benguela-04": { status: "REVOKED", reason: "Suspensão temporária por auditoria de conciliação fiscal" },
  });
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<CorporateUser | null>(null);
  const [permFormRole, setPermFormRole] = useState<CorporateUser["role"]>("CASHIER");
  const [permFormModules, setPermFormModules] = useState<AppModule[]>(["POS", "STOCK"]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingOutboxCount, setPendingOutboxCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>("Agora mesmo");
  const [cloudHubOnline, setCloudHubOnline] = useState<boolean>(true);

  const [events, setEvents] = useState<CorporateEvent[]>([
    {
      id: "ev-01",
      timestamp: new Date().toLocaleTimeString(),
      actorName: "Super Administrador",
      branchCode: "SEDE-KINAXIXI",
      eventType: "COCKPIT_SYNCHRONIZED",
      severity: "INFO",
      description: "Cockpit Multi-Loja sincronizado com 4 filiais com sucesso.",
    },
    {
      id: "ev-02",
      timestamp: new Date(Date.now() - 120_000).toLocaleTimeString(),
      actorName: "Sistema Corporativo",
      branchCode: "BR-BENGUELA",
      eventType: "HEARTBEAT_TIMEOUT",
      severity: "WARN",
      description: "Filial Benguela Marginal sem telemetria há mais de 5 minutos.",
    },
  ]);

  const [selectedBranchId, setSelectedBranchId] = useState<string>("hq-store-01");
  const [newStoreCode, setNewStoreCode] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreIsHq, setNewStoreIsHq] = useState(false);

  // User form
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<CorporateUser["role"]>("CASHIER");
  const [newUserBranchId, setNewUserBranchId] = useState("br-talatona-02");

  // Live update form
  const [patchVersion, setPatchVersion] = useState("2.2.4-patch.02");
  const [patchTitle, setPatchTitle] = useState("Atualização Dinâmica AGT 2026 & Módulo Biometria");
  const [patchCategory, setPatchCategory] = useState<"MODULE_RELEASE" | "HOTFIX" | "FISCAL_LEGAL" | "SECURITY">("MODULE_RELEASE");
  const [patchPayload, setPatchPayload] = useState(JSON.stringify({ modules: ["BIOMETRICS", "CORPORATE"], minAppVersion: "2.2.0" }, null, 2));

  // Broadcast form
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastContent, setBroadcastContent] = useState("");
  const [broadcastPriority, setBroadcastPriority] = useState<"NORMAL" | "URGENT" | "CRITICAL">("NORMAL");

  // Feedback notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Aggregated totals
  const totalStores = stores.length;
  const onlineStores = stores.filter((s) => s.online).length;
  const offlineStores = totalStores - onlineStores;
  const totalUsers = users.filter((u) => u.active).length;
  const totalTodaySalesCents = stores.reduce((acc, s) => acc + s.todaySalesCents, 0);
  const totalCashDrawerCents = stores.reduce((acc, s) => acc + s.cashDrawerCents, 0);
  const totalDocuments = stores.reduce((acc, s) => acc + s.todayDocumentsCount, 0);

  // Add store handler
  const handleAddStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreCode || !newStoreName) return;

    const newStore: CorporateStore = {
      id: `br-${Date.now().toString(36)}`,
      code: newStoreCode.trim().toUpperCase(),
      name: newStoreName.trim(),
      isHeadquarters: newStoreIsHq,
      online: true,
      lastPingAt: new Date().toISOString(),
      activeUsersCount: 1,
      todaySalesCents: 0,
      todayDocumentsCount: 0,
      cashDrawerCents: 0,
      activeModules: ["POS", "STOCK"],
      appVersion: "2.2.4",
      hardwareId: `HWID-${newStoreCode.trim().toUpperCase()}`,
      terminalId: "TERM-01",
      pendingSyncCount: 0,
    };

    setStores((prev) => [...prev, newStore]);
    setNewStoreCode("");
    setNewStoreName("");
    setNewStoreIsHq(false);

    setEvents((prev) => [
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actorName: "Super Administrador",
        branchCode: newStore.code,
        eventType: "STORE_REGISTERED",
        severity: "INFO",
        description: `Registada nova filial ${newStore.name} (${newStore.code}) no Centro Corporativo.`,
      },
      ...prev,
    ]);

    showToast(`Filial ${newStore.name} cadastrada com sucesso!`);
  };

  // Add user handler
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserUsername || !newUserDisplayName || !newUserEmail) return;

    const targetBranch = stores.find((s) => s.id === newUserBranchId);

    const newUser: CorporateUser = {
      id: `usr-${Date.now().toString(36)}`,
      username: newUserUsername.trim(),
      displayName: newUserDisplayName.trim(),
      email: newUserEmail.trim(),
      role: newUserRole,
      branchId: newUserBranchId,
      branchName: targetBranch ? targetBranch.name : "Global",
      active: true,
      allowedModules: ["POS", "STOCK"],
    };

    setUsers((prev) => [...prev, newUser]);
    setNewUserUsername("");
    setNewUserDisplayName("");
    setNewUserEmail("");

    setEvents((prev) => [
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actorName: "Super Administrador",
        eventType: "USER_CREATED",
        severity: "INFO",
        description: `Criado utilizador ${newUser.displayName} (${newUser.role}) atribuído a ${newUser.branchName}.`,
      },
      ...prev,
    ]);

    showToast(`Utilizador ${newUser.displayName} criado com sucesso!`);
  };

  // Instant remote user suspension
  const handleToggleSuspendUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          const nextActive = !u.active;
          const reason = nextActive ? undefined : "Suspenso remotamente pela Administração Central.";
          setEvents((ePrev) => [
            {
              id: `ev-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              actorName: "Super Administrador",
              eventType: nextActive ? "USER_REACTIVATED" : "USER_SUSPENDED",
              severity: nextActive ? "INFO" : "CRITICAL",
              description: `Utilizador ${u.displayName} [${nextActive ? "REATIVADO" : "SUSPENSO IMEDIATAMENTE"} em toda a rede].`,
            },
            ...ePrev,
          ]);
          return { ...u, active: nextActive, suspendedReason: reason };
        }
        return u;
      })
    );
    showToast("Estado do utilizador atualizado em toda a rede de lojas!");
  };

  // Toggle module for selected branch
  const handleToggleModule = (branchId: string, modCode: AppModule) => {
    setStores((prev) =>
      prev.map((s) => {
        if (s.id === branchId) {
          const isActive = s.activeModules.includes(modCode);
          const nextMods = isActive
            ? s.activeModules.filter((m) => m !== modCode)
            : [...s.activeModules, modCode];

          setEvents((ePrev) => [
            {
              id: `ev-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              actorName: "Super Administrador",
              branchCode: s.code,
              eventType: "MODULE_CONFIG_CHANGED",
              severity: "INFO",
              description: `Módulo ${modCode} [${isActive ? "DESATIVADO" : "ATIVADO"}] remotamente na loja ${s.name}.`,
            },
            ...ePrev,
          ]);

          return { ...s, activeModules: nextMods };
        }
        return s;
      })
    );
    showToast(`Módulo ${modCode} atualizado remotamente sem reinstalação!`);
  };

  // Remote License Revocation & Restoration
  const handleRevokeLicense = (branchId: string, terminalId: string) => {
    const targetStore = stores.find((s) => s.id === branchId);
    const storeName = targetStore ? targetStore.name : branchId;

    setStoreLicenses((prev) => ({
      ...prev,
      [branchId]: {
        status: "REVOKED",
        reason: "Licença revogada pela Loja Mãe (Sede Central) para este terminal.",
      },
    }));

    setEvents((ePrev) => [
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actorName: "Super Administrador",
        branchCode: targetStore?.code || "FILIAL",
        eventType: "LICENSE_REVOKED",
        severity: "CRITICAL",
        description: `Licença do terminal ${terminalId} (${storeName}) foi REVOGADA remotamente. Faturação e POS suspensos nesta filial.`,
      },
      ...ePrev,
    ]);

    showToast(`Licença do terminal ${terminalId} (${storeName}) revogada com sucesso!`);
  };

  const handleRestoreLicense = (branchId: string, terminalId: string) => {
    const targetStore = stores.find((s) => s.id === branchId);
    const storeName = targetStore ? targetStore.name : branchId;

    setStoreLicenses((prev) => ({
      ...prev,
      [branchId]: {
        status: "ACTIVE",
      },
    }));

    setEvents((ePrev) => [
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actorName: "Super Administrador",
        branchCode: targetStore?.code || "FILIAL",
        eventType: "LICENSE_RESTORED",
        severity: "INFO",
        description: `Licença do terminal ${terminalId} (${storeName}) foi REATIVADA pela Loja Mãe. Faturação liberada.`,
      },
      ...ePrev,
    ]);

    showToast(`Licença do terminal ${terminalId} (${storeName}) reativada com sucesso!`);
  };

  // Remote Permissions Editing
  const handleOpenPermissionsModal = (user: CorporateUser) => {
    setEditingPermissionsUser(user);
    setPermFormRole(user.role);
    setPermFormModules(user.allowedModules || ["POS", "STOCK"]);
  };

  const handleSavePermissions = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPermissionsUser) return;

    const uId = editingPermissionsUser.id;
    const uName = editingPermissionsUser.displayName;

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === uId) {
          return {
            ...u,
            role: permFormRole,
            allowedModules: permFormModules,
          };
        }
        return u;
      })
    );

    setEvents((ePrev) => [
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actorName: "Super Administrador",
        eventType: "PERMISSIONS_UPDATED",
        severity: "INFO",
        description: `Atualizadas permissões do utilizador ${uName}: Função [${permFormRole}], Módulos [${permFormModules.join(", ")}].`,
      },
      ...ePrev,
    ]);

    setEditingPermissionsUser(null);
    showToast(`Permissões de ${uName} atualizadas remotamente com sucesso!`);
  };

  const togglePermModule = (modId: AppModule) => {
    setPermFormModules((prev) =>
      prev.includes(modId) ? prev.filter((m) => m !== modId) : [...prev, modId]
    );
  };

  const handleEnqueueTestOutboxItem = () => {
    const engine = LiveUpdateEngine.getInstance();
    engine.queueOutboxItem({
      type: "SALE_DOCUMENT",
      payload: { docNo: `FR-2026/${Date.now().toString(36).toUpperCase()}`, totalCents: 450000 },
    });
    setPendingOutboxCount(engine.getOutboxCount());
    showToast("Novo documento fiscal adicionado à fila Outbox offline.");
  };

  // Real-Time Bidirectional Synchronization (Loja <-> Cloud <-> Sede)
  const handlePerformSync = async () => {
    setIsSyncing(true);
    try {
      const engine = LiveUpdateEngine.getInstance();
      const result = await engine.performBidirectionalSync("http://localhost:4000", {
        todaySalesCents: totalTodaySalesCents,
        todayDocumentsCount: totalDocuments,
        cashDrawerCents: totalCashDrawerCents,
        activeUsersCount: totalUsers,
      });

      setCloudHubOnline(result.online);
      setLastSyncTime(new Date().toLocaleTimeString());
      setPendingOutboxCount(engine.getOutboxCount());

      if (result.success) {
        showToast(`Sincronização corporativa concluída com sucesso! (${result.receivedCommandsCount} comandos processados)`);
        setEvents((prev) => [
          {
            id: `ev-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            actorName: "Sincronizador Automático",
            eventType: "SYNC_COMPLETED",
            severity: "INFO",
            description: `Sincronização bidirecional em tempo real concluída. Comandos aplicados: ${result.appliedCommands.length || "0"}.`,
          },
          ...prev,
        ]);
      } else {
        showToast("Modo Offline: Operações enfileiradas localmente para sincronização posterior.");
      }
    } catch {
      setCloudHubOnline(false);
      showToast("Modo Offline: Operações enfileiradas localmente.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Deploy live patch
  const handleDeployPatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patchVersion || !patchTitle) return;

    // Cryptographic SHA-256 signature
    const engine = LiveUpdateEngine.getInstance();
    const encoder = new TextEncoder();
    const canonical = `default-company:${patchVersion}:${patchCategory}:${patchPayload}`;
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
    const sha256Signature = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const patch: LivePatchPayload = {
      patchId: `patch-${Date.now().toString(36)}`,
      patchVersion,
      category: patchCategory,
      title: patchTitle,
      description: "Atualização dinâmica hot-reload distribuída sem reinstalação.",
      targetBranches: ["ALL"],
      payloadJson: patchPayload,
      sha256Signature,
      isCritical: patchCategory === "SECURITY" || patchCategory === "FISCAL_LEGAL",
      receivedAt: new Date().toISOString(),
    };

    // Hot-apply locally
    const applyResult = await engine.applyLivePatch(patch);

    setEvents((prev) => [
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actorName: "Super Administrador",
        eventType: "LIVE_PATCH_DEPLOYED",
        severity: "INFO",
        description: `Publicada atualização dinâmica ${patchVersion} (${patchCategory}) com assinatura SHA-256 válida.`,
      },
      ...prev,
    ]);

    if (applyResult.success) {
      showToast(`Patch ${patchVersion} publicado e aplicado dinamicamente com sucesso!`);
    } else {
      showToast(`Erro ao aplicar patch: ${applyResult.error}`);
    }
  };

  // Send broadcast
  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle || !broadcastContent) return;

    const engine = LiveUpdateEngine.getInstance();
    engine.receiveBroadcast({
      id: `bc-${Date.now()}`,
      title: broadcastTitle,
      content: broadcastContent,
      priority: broadcastPriority,
      senderName: "Sede Central (Loja Mãe)",
      createdAt: new Date().toISOString(),
    });

    setEvents((prev) => [
      {
        id: `ev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actorName: "Administração Central",
        eventType: "BROADCAST_SENT",
        severity: broadcastPriority === "CRITICAL" ? "CRITICAL" : "INFO",
        description: `Emitido comunicado "${broadcastTitle}" [${broadcastPriority}] para toda a rede.`,
      },
      ...prev,
    ]);

    setBroadcastTitle("");
    setBroadcastContent("");
    showToast("Comunicado transmitido para todas as filiais com sucesso!");
  };

  const selectedStore = stores.find((s) => s.id === selectedBranchId) || stores[0];

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            backgroundColor: "#065f46",
            color: "#ffffff",
            padding: "14px 20px",
            borderRadius: "8px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontWeight: 600,
          }}
        >
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          borderBottom: "2px solid #e2e8f0",
          paddingBottom: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ margin: 0, fontSize: "26px", color: "#0f172a", fontWeight: 800 }}>
              🏢 Centro Corporativo
            </h1>
            <span
              style={{
                backgroundColor: "#0284c7",
                color: "#ffffff",
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }}
            >
              HEADQUARTERS MODE (LOJA MÃE)
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
            Gestão Centralizada Multi-Lojas, Governança de Utilizadores, Telemetria em Tempo Real e Live Updates sem Reinstalação.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              padding: "6px 12px",
              borderRadius: "6px",
              color: "#166534",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            <span style={{ width: "8px", height: "8px", backgroundColor: "#22c55e", borderRadius: "50%", display: "inline-block" }} />
            Rede Conectada (4 Filiais Ativas)
          </div>
          <button
            onClick={() => showToast("Telemetria e Cockpit Corporativo sincronizados com sucesso!")}
            style={{
              backgroundColor: "#0f172a",
              color: "#ffffff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🔄 Sincronizar Rede
          </button>
        </div>
      </div>

      {/* Real-Time Corporate Synchronization Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: cloudHubOnline ? "#f0fdf4" : "#fffbeb",
          border: cloudHubOnline ? "1px solid #bbf7d0" : "1px solid #fde68a",
          borderRadius: "8px",
          padding: "12px 18px",
          marginBottom: "20px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              backgroundColor: cloudHubOnline ? "#16a34a" : "#d97706",
              boxShadow: cloudHubOnline ? "0 0 0 3px rgba(22,163,74,0.2)" : "0 0 0 3px rgba(217,119,6,0.2)",
            }}
          />
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: cloudHubOnline ? "#166534" : "#92400e" }}>
              {cloudHubOnline ? "Sincronização Corporativa em Tempo Real: ONLINE (Loja Mãe ⇄ Cloud Hub ⇄ Filiais)" : "Operação Offline Ativa: Operações enfileiradas para sincronização posterior"}
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
              Última sincronização: <strong>{lastSyncTime}</strong> • Fila de envio pendente: <strong>{pendingOutboxCount} itens</strong> • Hub Cloud: <code>api.vendaja.ao</code>
            </div>
          </div>
        </div>
        <button
          onClick={handlePerformSync}
          disabled={isSyncing}
          style={{
            backgroundColor: "#0284c7",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            padding: "8px 14px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: isSyncing ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {isSyncing ? "A sincronizar..." : "🔄 Forçar Sincronização Agora"}
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Lojas na Rede</div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {totalStores} <span style={{ fontSize: "14px", fontWeight: 600, color: "#16a34a" }}>({onlineStores} Online)</span>
          </div>
          <div style={{ fontSize: "12px", color: offlineStores > 0 ? "#dc2626" : "#64748b", marginTop: "4px" }}>
            {offlineStores > 0 ? `⚠️ ${offlineStores} filial offline` : "✓ 100% das lojas operacionais"}
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Faturação Global (Hoje)</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {formatKwanza(totalTodaySalesCents)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            Total consolidado em toda a rede
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Saldo Caixas Centralizado</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {formatKwanza(totalCashDrawerCents)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            Liquidez imediata em gavetas
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Documentos Fiscais (Hoje)</div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {totalDocuments}
          </div>
          <div style={{ fontSize: "12px", color: "#16a34a", marginTop: "4px" }}>
            ✓ Assinados com RSA-SHA256
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Operadores Ativos</div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {totalUsers}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            Sessões autorizadas em curso
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          gap: "8px",
          marginBottom: "24px",
          overflowX: "auto",
        }}
      >
        {[
          { key: "COCKPIT", label: "📊 Cockpit Global Multi-Loja" },
          { key: "STORES", label: "🏢 Rede de Lojas & Filiais" },
          { key: "USERS", label: "👥 Gestão de Utilizadores" },
          { key: "MODULES", label: "⚙️ Controlo Remoto de Módulos" },
          { key: "LIVE_UPDATES", label: "⚡ Live Updates (Sem Instalador)" },
          { key: "LICENSES", label: "🔑 Licenciamento Corporativo" },
          { key: "SYNC_HUB", label: "🔄 Sincronização Cloud & Filiais" },
          { key: "BROADCASTS", label: "📢 Comunicados (Broadcast)" },
          { key: "AUDIT", label: "🛡️ Trilha de Auditoria & Eventos" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === tab.key ? "3px solid #0284c7" : "3px solid transparent",
              backgroundColor: "transparent",
              color: activeTab === tab.key ? "#0284c7" : "#64748b",
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: "14px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Cockpit Multi-Loja */}
      {activeTab === "COCKPIT" && (
        <div>
          <h2 style={{ fontSize: "18px", color: "#0f172a", marginBottom: "16px", fontWeight: 700 }}>
            Visão Consolidada de Todas as Filiais
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
              marginBottom: "32px",
            }}
          >
            {stores.map((s) => (
              <div
                key={s.id}
                style={{
                  backgroundColor: "#ffffff",
                  border: s.isHeadquarters ? "2px solid #0284c7" : "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
                  position: "relative",
                }}
              >
                {s.isHeadquarters && (
                  <span
                    style={{
                      position: "absolute",
                      top: "14px",
                      right: "14px",
                      backgroundColor: "#e0f2fe",
                      color: "#0369a1",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    LOJA MÃE (SEDE)
                  </span>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span
                    style={{
                      width: "10px",
                      height: "10px",
                      backgroundColor: s.online ? "#22c55e" : "#ef4444",
                      borderRadius: "50%",
                      display: "inline-block",
                    }}
                  />
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    {s.name}
                  </h3>
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "16px" }}>
                  Código: <strong>{s.code}</strong> • Terminal: {s.terminalId} • Versão: {s.appVersion}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                    backgroundColor: "#f8fafc",
                    padding: "12px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Faturação Hoje</div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                      {formatKwanza(s.todaySalesCents)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Saldo em Caixa</div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                      {formatKwanza(s.cashDrawerCents)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Documentos</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                      {s.todayDocumentsCount} emitidos
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Operadores</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                      {s.activeUsersCount} online
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>
                    Módulos Ativos na Filial:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {s.activeModules.map((m) => (
                      <span
                        key={m}
                        style={{
                          backgroundColor: "#f1f5f9",
                          color: "#334155",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 600,
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid #f1f5f9",
                    paddingTop: "10px",
                    fontSize: "11px",
                    color: "#64748b",
                  }}
                >
                  <span>
                    {s.online ? "🟢 Conectado" : "🔴 Desconectado"} • Último ping: {new Date(s.lastPingAt).toLocaleTimeString()}
                  </span>
                  {s.pendingSyncCount > 0 && (
                    <span style={{ color: "#d97706", fontWeight: 600 }}>
                      ⚠️ {s.pendingSyncCount} pendentes
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Rede de Lojas */}
      {activeTab === "STORES" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
          {/* Form */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Cadastrar Nova Filial
            </h3>
            <form onSubmit={handleAddStore}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Código da Filial:
                </label>
                <input
                  type="text"
                  placeholder="Ex: BR-HUAMBO-01"
                  value={newStoreCode}
                  onChange={(e) => setNewStoreCode(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Nome da Filial:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Filial Huambo Cidade Alta"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  id="chkHq"
                  checked={newStoreIsHq}
                  onChange={(e) => setNewStoreIsHq(e.target.checked)}
                />
                <label htmlFor="chkHq" style={{ fontSize: "13px", color: "#334155" }}>
                  Designar como Loja Mãe (Sede Central)
                </label>
              </div>

              <button
                type="submit"
                style={{
                  width: "100%",
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                + Adicionar Filial à Rede
              </button>
            </form>
          </div>

          {/* Table */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Rede de Lojas do Grupo ({stores.length})
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "8px" }}>Código</th>
                  <th style={{ padding: "8px" }}>Nome</th>
                  <th style={{ padding: "8px" }}>Tipo</th>
                  <th style={{ padding: "8px" }}>Estado</th>
                  <th style={{ padding: "8px" }}>Hardware ID</th>
                  <th style={{ padding: "8px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>{s.code}</td>
                    <td style={{ padding: "10px 8px" }}>{s.name}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {s.isHeadquarters ? (
                        <span style={{ backgroundColor: "#e0f2fe", color: "#0369a1", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                          SEDE MÃE
                        </span>
                      ) : (
                        <span style={{ color: "#64748b", fontSize: "12px" }}>Filial Remota</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ color: s.online ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                        {s.online ? "● Online" : "○ Offline"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px", fontFamily: "monospace", fontSize: "11px" }}>{s.hardwareId}</td>
                    <td style={{ padding: "10px 8px" }}>
                      <button
                        onClick={() => {
                          setSelectedBranchId(s.id);
                          setActiveTab("MODULES");
                        }}
                        style={{
                          backgroundColor: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          borderRadius: "4px",
                          padding: "4px 8px",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        Gerir Módulos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Gestão de Utilizadores */}
      {activeTab === "USERS" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
          {/* Form */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Criar Utilizador Centralizado
            </h3>
            <form onSubmit={handleAddUser}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Nome Completo:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Carlos António Silva"
                  value={newUserDisplayName}
                  onChange={(e) => setNewUserDisplayName(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Nome de Utilizador:
                </label>
                <input
                  type="text"
                  placeholder="Ex: carlos.silva"
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Email:
                </label>
                <input
                  type="email"
                  placeholder="Ex: carlos.silva@vendaja.ao"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Perfil Corporativo:
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as any)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                >
                  <option value="SUPER_ADMIN">SUPER_ADMIN - Super Administrador Global</option>
                  <option value="LOCAL_ADMIN">LOCAL_ADMIN - Administrador Local da Loja</option>
                  <option value="CFO">CFO - Diretor Financeiro</option>
                  <option value="CRO">CRO - Diretor de Risco / Auditor</option>
                  <option value="MANAGER">MANAGER - Gerente de Loja</option>
                  <option value="SUPERVISOR">SUPERVISOR - Supervisor de Turno</option>
                  <option value="ACCOUNTANT">ACCOUNTANT - Contabilista PGCA</option>
                  <option value="HR">HR - Recursos Humanos & Processamento</option>
                  <option value="CASHIER">CASHIER - Operador de Caixa</option>
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Filial Alvo:
                </label>
                <select
                  value={newUserBranchId}
                  onChange={(e) => setNewUserBranchId(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) {s.isHeadquarters ? "[SEDE]" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                style={{
                  width: "100%",
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                + Criar Utilizador na Rede
              </button>
            </form>
          </div>

          {/* List */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Utilizadores do Grupo ({users.length})
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "8px" }}>Nome / Login</th>
                  <th style={{ padding: "8px" }}>Função</th>
                  <th style={{ padding: "8px" }}>Filial</th>
                  <th style={{ padding: "8px" }}>Estado</th>
                  <th style={{ padding: "8px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{u.displayName}</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>{u.username} • {u.email}</div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span
                        style={{
                          backgroundColor: u.role.includes("ADMIN") ? "#fef3c7" : "#f1f5f9",
                          color: u.role.includes("ADMIN") ? "#92400e" : "#334155",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>{u.branchName || "Global"}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {u.active ? (
                        <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Ativo</span>
                      ) : (
                        <div>
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>✗ Suspenso</span>
                          {u.suspendedReason && (
                            <div style={{ fontSize: "10px", color: "#b91c1c", maxWidth: "180px" }}>
                              {u.suspendedReason}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => handleOpenPermissionsModal(u)}
                          style={{
                            backgroundColor: "#f0f9ff",
                            color: "#0369a1",
                            border: "1px solid #bae6fd",
                            borderRadius: "4px",
                            padding: "4px 8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          ⚙️ Permissões
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleSuspendUser(u.id)}
                          style={{
                            backgroundColor: u.active ? "#fee2e2" : "#dcfce7",
                            color: u.active ? "#991b1b" : "#166534",
                            border: "none",
                            borderRadius: "4px",
                            padding: "4px 8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {u.active ? "Suspender" : "Reativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Controlo de Módulos */}
      {activeTab === "MODULES" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                Gestão Remota de Módulos por Filial
              </h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                Ative, desative ou suspenda funcionalidades em qualquer loja da rede sem reinstalação do ERP.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Filial Selecionada:</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                style={{ padding: "8px 14px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px", fontWeight: 600 }}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}) {s.isHeadquarters ? "[SEDE]" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {MODULE_CATALOG.map((mod) => {
              const isEnabled = selectedStore ? selectedStore.activeModules.includes(mod.code) : false;
              return (
                <div
                  key={mod.code}
                  style={{
                    backgroundColor: "#ffffff",
                    border: isEnabled ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <span style={{ fontSize: "24px" }}>{mod.icon}</span>
                      <span
                        style={{
                          backgroundColor: isEnabled ? "#dcfce7" : "#f1f5f9",
                          color: isEnabled ? "#15803d" : "#64748b",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        {isEnabled ? "ATIVO" : "DESATIVADO"}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>
                      {mod.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#0284c7", fontWeight: 600, marginBottom: "8px" }}>
                      {mod.category} • Mínimo: {mod.minimumPlan}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.4" }}>
                      {mod.description}
                    </div>
                  </div>

                  <div style={{ marginTop: "16px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                    <button
                      onClick={() => handleToggleModule(selectedBranchId, mod.code)}
                      style={{
                        width: "100%",
                        backgroundColor: isEnabled ? "#fee2e2" : "#0284c7",
                        color: isEnabled ? "#991b1b" : "#ffffff",
                        border: "none",
                        padding: "8px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {isEnabled ? "Desativar na Filial" : "Ativar na Filial Remotamente"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 5: Live Updates */}
      {activeTab === "LIVE_UPDATES" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Patch Form */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Publicar Atualização Dinâmica (Sem Instalador)
            </h3>
            <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "16px" }}>
              Envie módulos, hotfixes e tabelas fiscais AGT diretamente aos terminais remotos com assinatura digital SHA-256.
            </p>
            <form onSubmit={handleDeployPatch}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Versão do Patch:
                </label>
                <input
                  type="text"
                  value={patchVersion}
                  onChange={(e) => setPatchVersion(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Título / Finalidade do Patch:
                </label>
                <input
                  type="text"
                  value={patchTitle}
                  onChange={(e) => setPatchTitle(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Categoria:
                </label>
                <select
                  value={patchCategory}
                  onChange={(e) => setPatchCategory(e.target.value as any)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                >
                  <option value="MODULE_RELEASE">MODULE_RELEASE - Lançamento / Ativação de Novo Módulo</option>
                  <option value="HOTFIX">HOTFIX - Correção Dinâmica de Erro</option>
                  <option value="FISCAL_LEGAL">FISCAL_LEGAL - Atualização Regras AGT / Impostos</option>
                  <option value="SECURITY">SECURITY - Política de Segurança & Chaves</option>
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Payload de Configuração (JSON):
                </label>
                <textarea
                  rows={6}
                  value={patchPayload}
                  onChange={(e) => setPatchPayload(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", fontFamily: "monospace" }}
                  required
                />
              </div>

              <button
                type="submit"
                style={{
                  width: "100%",
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                🚀 Assinar e Distribuir Patch em Tempo Real
              </button>
            </form>
          </div>

          {/* Patches Status */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Patches Ativos no Terminal Local
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px", backgroundColor: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>2.2.4-patch.01 (FISCAL_LEGAL)</span>
                  <span style={{ backgroundColor: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                    APLICADO ✓
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#334155", marginBottom: "4px" }}>
                  Atualização de Regras Fiscais AGT 2026 e Módulo Biometria
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace" }}>
                  SHA-256: 6798fdadd3ca5ec84e30c4a0cb8e6226bca29d3618d82389b663d1d22d7bc941
                </div>
              </div>

              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px", backgroundColor: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>2.2.4-patch.02 (MODULE_RELEASE)</span>
                  <span style={{ backgroundColor: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                    APLICADO ✓
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#334155", marginBottom: "4px" }}>
                  Ativação Dinâmica: Módulo Centro Corporativo (Loja Mãe)
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace" }}>
                  SHA-256: a1e29c882103f5da4bb7291176bfa254091dafe22904bc018155e4299b821094
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Licenciamento */}
      {activeTab === "LICENSES" && (
        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
            Licenciamento Centralizado por Terminal & Hardware ID
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "8px" }}>Loja / Filial</th>
                <th style={{ padding: "8px" }}>Hardware ID (DRM)</th>
                <th style={{ padding: "8px" }}>Terminal Code</th>
                <th style={{ padding: "8px" }}>Plano Modular</th>
                <th style={{ padding: "8px" }}>Estado da Licença</th>
                <th style={{ padding: "8px" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: "10px 8px", fontFamily: "monospace", fontSize: "11px" }}>{s.hardwareId}</td>
                  <td style={{ padding: "10px 8px" }}>{s.terminalId}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{ backgroundColor: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                      ENTERPRISE MODULAR
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    {storeLicenses[s.id]?.status === "REVOKED" ? (
                      <div>
                        <span style={{ backgroundColor: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                          ⛔ REVOGADA (POS Bloqueado)
                        </span>
                        {storeLicenses[s.id]?.reason && (
                          <div style={{ fontSize: "10px", color: "#b91c1c", marginTop: "2px", maxWidth: "200px" }}>
                            {storeLicenses[s.id]?.reason}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Autorizada e Ativa</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    {storeLicenses[s.id]?.status === "REVOKED" ? (
                      <button
                        type="button"
                        onClick={() => handleRestoreLicense(s.id, s.terminalId)}
                        style={{
                          backgroundColor: "#dcfce7",
                          color: "#166534",
                          border: "1px solid #86efac",
                          borderRadius: "4px",
                          padding: "4px 10px",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ✅ Reativar Licença
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRevokeLicense(s.id, s.terminalId)}
                        style={{
                          backgroundColor: "#fee2e2",
                          color: "#991b1b",
                          border: "1px solid #fca5a5",
                          borderRadius: "4px",
                          padding: "4px 10px",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        🛑 Revogar Licença
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Sincronização Cloud & Filiais (Loja <-> Cloud <-> Sede) */}
      {activeTab === "SYNC_HUB" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Top Status & Controls */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
            }}
          >
            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
              <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Estado Cloud Hub</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: cloudHubOnline ? "#16a34a" : "#dc2626", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>{cloudHubOnline ? "🟢 Conectado (Cloud Online)" : "🔴 Modo Offline Local"}</span>
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                {cloudHubOnline ? "Comunicação em tempo real com api.vendaja.ao" : "Operações salvas em buffer SQLite local"}
              </div>
            </div>

            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
              <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Fila Outbox Local (Offline)</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: pendingOutboxCount > 0 ? "#ea580c" : "#16a34a", marginTop: "4px" }}>
                {pendingOutboxCount} {pendingOutboxCount === 1 ? "item pendente" : "itens pendentes"}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                {pendingOutboxCount > 0 ? "Aguardando envio para a Cloud Hub" : "✓ Todos os dados sincronizados"}
              </div>
            </div>

            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
              <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase" }}>Última Sincronização</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                {lastSyncTime}
              </div>
              <div style={{ fontSize: "12px", color: "#16a34a", marginTop: "4px" }}>
                ✓ Telemetria & Comandos Atualizados
              </div>
            </div>

            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={handlePerformSync}
                disabled={isSyncing}
                style={{
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: isSyncing ? "not-allowed" : "pointer",
                }}
              >
                {isSyncing ? "A sincronizar com a Cloud..." : "🔄 Executar Sincronização Agora"}
              </button>
              <button
                type="button"
                onClick={handleEnqueueTestOutboxItem}
                style={{
                  backgroundColor: "#f1f5f9",
                  color: "#475569",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                📥 Simular Venda Offline na Outbox
              </button>
            </div>
          </div>

          {/* Topology Hub Diagram */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Topologia da Rede Corporativa VendaJá Angola
            </h3>
            <div
              style={{
                backgroundColor: "#f8fafc",
                border: "1px dashed #cbd5e1",
                borderRadius: "8px",
                padding: "20px",
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr auto 1fr",
                alignItems: "center",
                textAlign: "center",
                gap: "12px",
              }}
            >
              <div style={{ backgroundColor: "#ffffff", border: "2px solid #0284c7", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "20px", marginBottom: "4px" }}>🏢</div>
                <div style={{ fontWeight: 800, color: "#0284c7", fontSize: "14px" }}>LOJA MÃE (SEDE)</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Kinaxixi HQ • Luanda</div>
                <div style={{ fontSize: "10px", backgroundColor: "#e0f2fe", color: "#0369a1", borderRadius: "4px", padding: "2px 4px", marginTop: "6px", fontWeight: 600 }}>
                  Emissão de Comandos & Controlo Global
                </div>
              </div>

              <div style={{ color: "#0284c7", fontWeight: 800, fontSize: "18px" }}>
                ⇄
              </div>

              <div style={{ backgroundColor: "#ffffff", border: "2px solid #16a34a", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "20px", marginBottom: "4px" }}>☁️</div>
                <div style={{ fontWeight: 800, color: "#16a34a", fontSize: "14px" }}>CLOUD HUB</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>api.vendaja.ao</div>
                <div style={{ fontSize: "10px", backgroundColor: "#dcfce7", color: "#15803d", borderRadius: "4px", padding: "2px 4px", marginTop: "6px", fontWeight: 600 }}>
                  Fila Bidirecional Segura & Idempotente
                </div>
              </div>

              <div style={{ color: "#0284c7", fontWeight: 800, fontSize: "18px" }}>
                ⇄
              </div>

              <div style={{ backgroundColor: "#ffffff", border: "2px solid #7c3aed", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontSize: "20px", marginBottom: "4px" }}>🏬</div>
                <div style={{ fontWeight: 800, color: "#7c3aed", fontSize: "14px" }}>FILIAIS & LOJAS</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Talatona, Viana, Benguela, etc.</div>
                <div style={{ fontSize: "10px", backgroundColor: "#f3e8ff", color: "#7e22ce", borderRadius: "4px", padding: "2px 4px", marginTop: "6px", fontWeight: 600 }}>
                  Operação Offline Total + Sincronização Posterior
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
              <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontWeight: 700, color: "#166534", fontSize: "13px", marginBottom: "4px" }}>
                  Fluxo 1: Loja ➔ Cloud ➔ Sede
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#15803d" }}>
                  <li>Telemetria de vendas e faturas emitidas em tempo real.</li>
                  <li>Reconciliação e fecho centralizado de gavetas de dinheiro.</li>
                  <li>Buffer Outbox offline: Vendas sem internet são enviadas automaticamente ao reconectar.</li>
                </ul>
              </div>

              <div style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontWeight: 700, color: "#1e40af", fontSize: "13px", marginBottom: "4px" }}>
                  Fluxo 2: Sede ➔ Cloud ➔ Filiais
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#1d4ed8" }}>
                  <li>Criação e suspensão imediata de operadores em qualquer loja.</li>
                  <li>Alteração remota de papéis e módulos autorizados por filial.</li>
                  <li>Revogação ou restauração de licenças com bloqueio imediato do POS.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Comunicados (Broadcast) */}
      {activeTab === "BROADCASTS" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
          {/* Send Broadcast */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Emitir Circular / Comunicado
            </h3>
            <form onSubmit={handleSendBroadcast}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Título do Comunicado:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Fecho de Mês Fiscal Outubro 2026"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Prioridade:
                </label>
                <select
                  value={broadcastPriority}
                  onChange={(e) => setBroadcastPriority(e.target.value as any)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                >
                  <option value="NORMAL">NORMAL - Informativo Geral</option>
                  <option value="URGENT">URGENT - Importante (Alerta em Destaque)</option>
                  <option value="CRITICAL">CRITICAL - Bloqueio / Ação Imediata Obrigatória</option>
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                  Mensagem aos Operadores:
                </label>
                <textarea
                  rows={5}
                  placeholder="Escreva a circular corporativa..."
                  value={broadcastContent}
                  onChange={(e) => setBroadcastContent(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                  required
                />
              </div>

              <button
                type="submit"
                style={{
                  width: "100%",
                  backgroundColor: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                📢 Transmitir Comunicado em Tempo Real
              </button>
            </form>
          </div>

          {/* Active Broadcasts */}
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Circulares e Comunicados Recentes
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ border: "1px solid #fde047", backgroundColor: "#fefce8", borderRadius: "8px", padding: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#854d0e" }}>
                    Instrução de Fecho de Mês Fiscal - Outubro 2026
                  </span>
                  <span style={{ backgroundColor: "#ca8a04", color: "#ffffff", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                    URGENT
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#713f12" }}>
                  Todos os caixas devem emitir os mapas de fecho de turno e reconciliação até às 21:00 para consolidação centralizada na Loja Mãe.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Trilha de Auditoria */}
      {activeTab === "AUDIT" && (
        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
            Corporate Event Stream & Auditoria em Tempo Real
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                <th style={{ padding: "8px" }}>Hora</th>
                <th style={{ padding: "8px" }}>Severidade</th>
                <th style={{ padding: "8px" }}>Ator</th>
                <th style={{ padding: "8px" }}>Tipo de Evento</th>
                <th style={{ padding: "8px" }}>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 8px", color: "#64748b", fontFamily: "monospace", fontSize: "11px" }}>{ev.timestamp}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        backgroundColor:
                          ev.severity === "CRITICAL" ? "#fee2e2" : ev.severity === "WARN" ? "#fef3c7" : "#e0f2fe",
                        color:
                          ev.severity === "CRITICAL" ? "#991b1b" : ev.severity === "WARN" ? "#92400e" : "#0369a1",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      {ev.severity}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 600 }}>{ev.actorName}</td>
                  <td style={{ padding: "10px 8px", fontFamily: "monospace", fontSize: "11px" }}>{ev.eventType}</td>
                  <td style={{ padding: "10px 8px" }}>{ev.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Permissions Modal */}
      {editingPermissionsUser && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              maxWidth: "520px",
              width: "100%",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                ⚙️ Alterar Permissões Remotas
              </h3>
              <button
                type="button"
                onClick={() => setEditingPermissionsUser(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#64748b",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "16px", padding: "10px", backgroundColor: "#f8fafc", borderRadius: "8px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                {editingPermissionsUser.displayName}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                Utilizador: <strong>@{editingPermissionsUser.username}</strong> • Filial: {editingPermissionsUser.branchName || "Sede"}
              </div>
            </div>

            <form onSubmit={handleSavePermissions}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  Função / Papel no Sistema:
                </label>
                <select
                  value={permFormRole}
                  onChange={(e) => setPermFormRole(e.target.value as any)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px" }}
                >
                  <option value="SUPER_ADMIN">SUPER_ADMIN - Administrador Global Matriz</option>
                  <option value="LOCAL_ADMIN">LOCAL_ADMIN - Administrador da Filial</option>
                  <option value="MANAGER">MANAGER - Gerente Operacional</option>
                  <option value="SUPERVISOR">SUPERVISOR - Supervisor de Loja</option>
                  <option value="CASHIER">CASHIER - Operador de Caixa / POS</option>
                  <option value="ACCOUNTANT">ACCOUNTANT - Contabilista / Fiscal</option>
                  <option value="HR">HR - Recursos Humanos & Ponto</option>
                </select>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
                  Módulos Autorizados para este Operador:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {(["POS", "STOCK", "TREASURY", "HR", "CRM", "BI", "AI", "BIOMETRICS", "CORPORATE"] as AppModule[]).map((modKey) => {
                    const isChecked = permFormModules.includes(modKey);
                    return (
                      <label
                        key={modKey}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px",
                          borderRadius: "6px",
                          border: isChecked ? "1px solid #0284c7" : "1px solid #e2e8f0",
                          backgroundColor: isChecked ? "#f0f9ff" : "#ffffff",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermModule(modKey)}
                        />
                        <span style={{ fontWeight: isChecked ? 600 : 400, color: isChecked ? "#0369a1" : "#475569" }}>
                          {MODULE_CATALOG.find((m) => m.code === modKey)?.name || modKey}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setEditingPermissionsUser(null)}
                  style={{
                    backgroundColor: "#f1f5f9",
                    color: "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  💾 Salvar Permissões Remotamente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default CorporatePanel;
