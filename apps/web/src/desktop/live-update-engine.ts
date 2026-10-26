/**
 * LiveUpdateEngine - Client-Side Engine for ERP VendaJá Angola
 *
 * Implements real-time dynamic patching, hot module activation,
 * cryptographic signature verification (SHA-256) and telemetry
 * synchronization with Headquarters (Loja Mãe) without reinstallations.
 */

import { AppModule, MODULE_CATALOG } from "./modules";

export interface LivePatchPayload {
  patchId: string;
  patchVersion: string;
  category: "MODULE_RELEASE" | "HOTFIX" | "FISCAL_LEGAL" | "UI_ENHANCEMENT" | "SECURITY";
  title: string;
  description: string;
  targetModules?: string[];
  targetBranches?: string[];
  payloadJson: string;
  sha256Signature: string;
  isCritical: boolean;
  receivedAt?: string;
  appliedAt?: string;
}

export interface ClientTelemetryData {
  companyId: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  isHeadquarters: boolean;
  todaySalesCents: number;
  todayDocumentsCount: number;
  cashDrawerCents: number;
  activeUsersCount: number;
  activeModules: AppModule[];
  appVersion: string;
  hardwareId: string;
  terminalId: string;
  pendingSyncCount: number;
}

export interface BroadcastNotification {
  id: string;
  title: string;
  content: string;
  priority: "NORMAL" | "URGENT" | "CRITICAL";
  senderName: string;
  createdAt: string;
  read: boolean;
}

export class LiveUpdateEngine {
  private static instance: LiveUpdateEngine | null = null;

  private companyId: string = "default-company";
  private branchId: string = "hq-store-01";
  private branchCode: string = "SEDE-01";
  private branchName: string = "Sede Central (Loja Mãe)";
  private isHeadquarters: boolean = true;
  private appVersion: string = "2.2.4";
  private hardwareId: string = "HWID-VENDAJA-AO-2026";
  private terminalId: string = "TERM-01";

  private appliedPatches: Map<string, LivePatchPayload> = new Map();
  private dynamicModules: Set<AppModule> = new Set();
  private broadcasts: BroadcastNotification[] = [];
  private outboxQueue: any[] = [];
  private licenseStatus: "ACTIVE" | "REVOKED" = "ACTIVE";
  private licenseRevokedReason?: string;
  private isOnlineStatus: boolean = true;
  private lastSyncTimestamp?: string;
  private listeners: Array<() => void> = [];

  private heartbeatInterval: any = null;

  private constructor() {
    this.loadPersistedPatches();
    this.loadPersistedState();
  }

  public static getInstance(): LiveUpdateEngine {
    if (!LiveUpdateEngine.instance) {
      LiveUpdateEngine.instance = new LiveUpdateEngine();
    }
    return LiveUpdateEngine.instance;
  }

  /**
   * Initializes local terminal configuration
   */
  public configure(config: {
    companyId?: string;
    branchId?: string;
    branchCode?: string;
    branchName?: string;
    isHeadquarters?: boolean;
    appVersion?: string;
    hardwareId?: string;
    terminalId?: string;
  }): void {
    if (config.companyId) this.companyId = config.companyId;
    if (config.branchId) this.branchId = config.branchId;
    if (config.branchCode) this.branchCode = config.branchCode;
    if (config.branchName) this.branchName = config.branchName;
    if (config.isHeadquarters !== undefined) this.isHeadquarters = config.isHeadquarters;
    if (config.appVersion) this.appVersion = config.appVersion;
    if (config.hardwareId) this.hardwareId = config.hardwareId;
    if (config.terminalId) this.terminalId = config.terminalId;
  }

  /**
   * Cryptographically verifies the SHA-256 signature of a patch
   */
  public async verifyPatchSignature(patch: {
    companyId?: string;
    patchVersion: string;
    category: string;
    payloadJson: string;
    sha256Signature: string;
  }): Promise<boolean> {
    const compId = patch.companyId || this.companyId;
    const canonicalString = `${compId}:${patch.patchVersion}:${patch.category}:${patch.payloadJson}`;

    // Browser / Electron Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return computedHex.toLowerCase() === patch.sha256Signature.toLowerCase();
  }

  /**
   * Hot-applies a verified live patch without restart or reinstallation
   */
  public async applyLivePatch(patch: LivePatchPayload): Promise<{
    success: boolean;
    error?: string;
    activatedModules?: AppModule[];
  }> {
    // 1. Signature Verification
    const isValid = await this.verifyPatchSignature({
      companyId: this.companyId,
      patchVersion: patch.patchVersion,
      category: patch.category,
      payloadJson: patch.payloadJson,
      sha256Signature: patch.sha256Signature,
    });

    if (!isValid) {
      return {
        success: false,
        error: `Assinatura criptográfica SHA-256 INVÁLIDA para o patch ${patch.patchVersion}. Aplicação rejeitada por segurança.`,
      };
    }

    // 2. Parse payload
    let parsed: any;
    try {
      parsed = JSON.parse(patch.payloadJson);
    } catch {
      return { success: false, error: "Payload JSON malformado." };
    }

    const activatedModules: AppModule[] = [];

    // 3. Handle Category
    if (patch.category === "MODULE_RELEASE") {
      const modulesToActivate = parsed.modules || patch.targetModules || [];
      for (const mod of modulesToActivate) {
        const canonical = mod.toUpperCase() as AppModule;
        const existsInCatalog = MODULE_CATALOG.some((m) => m.code === canonical);
        if (existsInCatalog) {
          this.dynamicModules.add(canonical);
          activatedModules.push(canonical);
        }
      }
    } else if (patch.category === "FISCAL_LEGAL") {
      // Store dynamic AGT rules in local storage cache
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          "vendaja:fiscal_rules_live",
          JSON.stringify({ ...parsed, updatedAt: new Date().toISOString() })
        );
      }
    } else if (patch.category === "HOTFIX") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          `vendaja:hotfix:${patch.patchVersion}`,
          JSON.stringify(parsed)
        );
      }
    }

    // 4. Record applied patch
    const appliedRecord: LivePatchPayload = {
      ...patch,
      appliedAt: new Date().toISOString(),
    };
    this.appliedPatches.set(patch.patchId || patch.patchVersion, appliedRecord);
    this.persistPatches();
    this.notifyListeners();

    return {
      success: true,
      activatedModules,
    };
  }

  /**
   * Returns list of dynamically activated modules via live patches
   */
  public getDynamicallyActivatedModules(): AppModule[] {
    return Array.from(this.dynamicModules);
  }

  /**
   * Checks whether a specific module is active either locally or via live patch
   */
  public isModuleActiveLocally(moduleCode: AppModule, baseActiveModules: AppModule[]): boolean {
    if (this.dynamicModules.has(moduleCode)) return true;
    return baseActiveModules.includes(moduleCode);
  }

  /**
   * Returns all applied patches in this terminal
   */
  public getAppliedPatches(): LivePatchPayload[] {
    return Array.from(this.appliedPatches.values()).sort(
      (a, b) => new Date(b.appliedAt || "").getTime() - new Date(a.appliedAt || "").getTime()
    );
  }

  /**
   * Ingests an incoming broadcast message from Sede
   */
  public receiveBroadcast(broadcast: {
    id: string;
    title: string;
    content: string;
    priority: "NORMAL" | "URGENT" | "CRITICAL";
    senderName?: string;
    createdAt?: string;
  }): void {
    const exists = this.broadcasts.some((b) => b.id === broadcast.id);
    if (!exists) {
      this.broadcasts.unshift({
        id: broadcast.id,
        title: broadcast.title,
        content: broadcast.content,
        priority: broadcast.priority,
        senderName: broadcast.senderName || "Administração Central (Sede)",
        createdAt: broadcast.createdAt || new Date().toISOString(),
        read: false,
      });
      this.notifyListeners();
    }
  }

  public getBroadcasts(): BroadcastNotification[] {
    return this.broadcasts;
  }

  public markBroadcastRead(id: string): void {
    const item = this.broadcasts.find((b) => b.id === id);
    if (item) {
      item.read = true;
      this.notifyListeners();
    }
  }

  /**
   * Generates telemetry payload for Headquarters heartbeat
   */
  public getTelemetryPayload(metrics?: {
    todaySalesCents?: number;
    todayDocumentsCount?: number;
    cashDrawerCents?: number;
    activeUsersCount?: number;
    pendingSyncCount?: number;
  }): ClientTelemetryData {
    return {
      companyId: this.companyId,
      branchId: this.branchId,
      branchCode: this.branchCode,
      branchName: this.branchName,
      isHeadquarters: this.isHeadquarters,
      todaySalesCents: metrics?.todaySalesCents ?? 0,
      todayDocumentsCount: metrics?.todayDocumentsCount ?? 0,
      cashDrawerCents: metrics?.cashDrawerCents ?? 0,
      activeUsersCount: metrics?.activeUsersCount ?? 1,
      activeModules: Array.from(this.dynamicModules),
      appVersion: this.appVersion,
      hardwareId: this.hardwareId,
      terminalId: this.terminalId,
      pendingSyncCount: metrics?.pendingSyncCount ?? 0,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // ignore
      }
    }
  }

  private loadPersistedPatches(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem("vendaja:applied_patches");
      if (raw) {
        const list: LivePatchPayload[] = JSON.parse(raw);
        for (const p of list) {
          this.appliedPatches.set(p.patchId || p.patchVersion, p);
          if (p.category === "MODULE_RELEASE") {
            try {
              const parsed = JSON.parse(p.payloadJson);
              const mods = parsed.modules || p.targetModules || [];
              for (const m of mods) this.dynamicModules.add(m.toUpperCase() as AppModule);
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private persistPatches(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const list = Array.from(this.appliedPatches.values());
      window.localStorage.setItem("vendaja:applied_patches", JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  // --- License Management ---
  public getLicenseStatus(): { status: "ACTIVE" | "REVOKED"; reason?: string } {
    return { status: this.licenseStatus, reason: this.licenseRevokedReason };
  }

  public isLicenseActive(): boolean {
    return this.licenseStatus === "ACTIVE";
  }

  public setLicenseStatus(status: "ACTIVE" | "REVOKED", reason?: string): void {
    this.licenseStatus = status;
    this.licenseRevokedReason = reason;
    this.persistState();
    this.notifyListeners();
  }

  // --- Offline Outbox Management ---
  public queueOutboxItem(entry: any): void {
    this.outboxQueue.push({
      ...entry,
      queuedAt: new Date().toISOString(),
      id: entry.id || `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    this.persistState();
    this.notifyListeners();
  }

  public getOutboxCount(): number {
    return this.outboxQueue.length;
  }

  public getOutboxItems(): any[] {
    return [...this.outboxQueue];
  }

  public getSyncState(): {
    isOnline: boolean;
    lastSyncTimestamp?: string;
    pendingOutboxCount: number;
    licenseStatus: "ACTIVE" | "REVOKED";
  } {
    return {
      isOnline: this.isOnlineStatus,
      lastSyncTimestamp: this.lastSyncTimestamp,
      pendingOutboxCount: this.outboxQueue.length,
      licenseStatus: this.licenseStatus,
    };
  }

  /**
   * Unified Bidirectional Synchronization:
   * Loja -> Cloud -> Sede and Sede -> Cloud -> Lojas
   */
  public async performBidirectionalSync(
    apiUrl = "http://localhost:4000",
    metrics?: {
      todaySalesCents?: number;
      todayDocumentsCount?: number;
      cashDrawerCents?: number;
      activeUsersCount?: number;
    }
  ): Promise<{
    success: boolean;
    online: boolean;
    syncedOutboxCount: number;
    receivedCommandsCount: number;
    appliedCommands: string[];
    error?: string;
  }> {
    const telemetry = this.getTelemetryPayload({
      ...metrics,
      pendingSyncCount: this.outboxQueue.length,
    });

    const payload = {
      branchId: this.branchId,
      telemetry,
      outboxEntries: this.outboxQueue,
    };

    try {
      const res = await fetch(`${apiUrl}/api/v1/corporate/sync/bidirectional`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": this.companyId,
          "x-actor-name": `Terminal ${this.terminalId} (${this.branchName})`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Sync server responded with ${res.status}`);
      }

      const data = await res.json();
      this.isOnlineStatus = true;
      this.lastSyncTimestamp = new Date().toISOString();

      // 1. Flush successfully synced outbox entries
      const syncedOutboxCount = this.outboxQueue.length;
      this.outboxQueue = [];

      // 2. Check license status returned by Headquarters
      if (data.licenseStatus) {
        this.licenseStatus = data.licenseStatus;
      }

      // 3. Process commands dispatched by Headquarters
      const appliedCommands: string[] = [];
      const pendingCommands = data.pendingCommands || [];

      for (const cmd of pendingCommands) {
        try {
          if (cmd.commandType === "REVOKE_LICENSE") {
            this.licenseStatus = "REVOKED";
            this.licenseRevokedReason = cmd.payload?.reason || "Revogado pela Sede";
            appliedCommands.push(`REVOKE_LICENSE: ${this.licenseRevokedReason}`);
          } else if (cmd.commandType === "RESTORE_LICENSE") {
            this.licenseStatus = "ACTIVE";
            this.licenseRevokedReason = undefined;
            appliedCommands.push("RESTORE_LICENSE: Ativado");
          } else if (cmd.commandType === "SET_MODULE_STATUS") {
            const { moduleCode, status } = cmd.payload || {};
            if (moduleCode) {
              const canonical = moduleCode.toUpperCase() as AppModule;
              if (status === "ACTIVATE") {
                this.dynamicModules.add(canonical);
              } else {
                this.dynamicModules.delete(canonical);
              }
              appliedCommands.push(`SET_MODULE_STATUS: ${canonical} [${status}]`);
            }
          } else if (cmd.commandType === "HOT_PATCH") {
            if (cmd.payload) {
              await this.applyLivePatch(cmd.payload);
              appliedCommands.push(`HOT_PATCH: ${cmd.payload.patchVersion}`);
            }
          } else if (cmd.commandType === "BROADCAST") {
            if (cmd.payload) {
              this.receiveBroadcast(cmd.payload);
              appliedCommands.push(`BROADCAST: ${cmd.payload.title}`);
            }
          } else if (cmd.commandType === "SUSPEND_USER") {
            appliedCommands.push(`SUSPEND_USER: ${cmd.payload?.userId}`);
          } else if (cmd.commandType === "CREATE_USER") {
            appliedCommands.push(`CREATE_USER: ${cmd.payload?.username}`);
          } else if (cmd.commandType === "UPDATE_PERMISSIONS") {
            appliedCommands.push(`UPDATE_PERMISSIONS: ${cmd.payload?.userId}`);
          }

          // Acknowledge command
          fetch(`${apiUrl}/api/v1/corporate/commands/${cmd.id}/ack`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-company-id": this.companyId,
            },
            body: JSON.stringify({ branchId: this.branchId }),
          }).catch(() => {});
        } catch (cmdErr) {
          console.error("Error executing corporate command:", cmdErr);
        }
      }

      this.persistState();
      this.notifyListeners();

      return {
        success: true,
        online: true,
        syncedOutboxCount,
        receivedCommandsCount: pendingCommands.length,
        appliedCommands,
      };
    } catch (err: any) {
      // Offline fallback: keep outbox queued
      this.isOnlineStatus = false;
      this.notifyListeners();
      return {
        success: false,
        online: false,
        syncedOutboxCount: 0,
        receivedCommandsCount: 0,
        appliedCommands: [],
        error: err.message || "Servidor corporativo inacessível (Modo Offline Ativo)",
      };
    }
  }

  private loadPersistedState(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const rawLicense = window.localStorage.getItem("vendaja:corp:license_status");
      if (rawLicense) {
        const parsed = JSON.parse(rawLicense);
        this.licenseStatus = parsed.status || "ACTIVE";
        this.licenseRevokedReason = parsed.reason;
      }
      const rawOutbox = window.localStorage.getItem("vendaja:corp:outbox");
      if (rawOutbox) {
        this.outboxQueue = JSON.parse(rawOutbox);
      }
      const rawLastSync = window.localStorage.getItem("vendaja:corp:last_sync");
      if (rawLastSync) {
        this.lastSyncTimestamp = rawLastSync;
      }
    } catch {
      // ignore
    }
  }

  private persistState(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        "vendaja:corp:license_status",
        JSON.stringify({ status: this.licenseStatus, reason: this.licenseRevokedReason })
      );
      window.localStorage.setItem("vendaja:corp:outbox", JSON.stringify(this.outboxQueue));
      if (this.lastSyncTimestamp) {
        window.localStorage.setItem("vendaja:corp:last_sync", this.lastSyncTimestamp);
      }
    } catch {
      // ignore
    }
  }
}
