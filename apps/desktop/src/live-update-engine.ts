/**
 * LiveUpdateEngine - Client-Side Engine for ERP VendaJá Angola
 *
 * Implements real-time dynamic patching, hot module activation,
 * asymmetric digital signature verification (RSA-4096 / SHA-256), signed manifests,
 * version compatibility guards, and telemetry synchronization with Headquarters (Loja Mãe).
 */

import cryptoNode from "node:crypto";
import { AppModule, MODULE_CATALOG } from "./modules.js";
import { LICENSE_PUBLIC_KEY } from "./licensePublicKey.js";

export interface LivePatchPayload {
  patchId: string;
  patchVersion: string;
  category: "MODULE_RELEASE" | "HOTFIX" | "FISCAL_LEGAL" | "UI_ENHANCEMENT" | "SECURITY";
  title: string;
  description: string;
  targetModules?: string[];
  targetBranches?: string[];
  payloadJson: string;
  sha256Signature?: string;
  rsaSha256Signature?: string;
  channel?: "stable" | "beta" | "enterprise";
  minimumAppVersion?: string;
  isCritical: boolean;
  receivedAt?: string;
  appliedAt?: string;
}

export interface SignedUpdateManifest {
  manifestVersion: string;
  version: string;
  releaseDate: string;
  channel: "stable" | "beta" | "enterprise";
  minimumPreviousVersion: string;
  targetSchemaVersion: string;
  checksumSha256: string;
  mandatoryMigrations: string[];
  releaseNotes: string;
  publisher: string;
  signatureRsaSha256?: string;
  canonicalPayload?: string;
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

  // Terminal Identity (Clean initialization without hardcoded placeholders)
  private companyId: string = "";
  private branchId: string = "";
  private branchCode: string = "";
  private branchName: string = "";
  private isHeadquarters: boolean = false;
  private appVersion: string = "2.2.2-rc.3";
  private hardwareId: string = "";
  private terminalId: string = "";

  // Channel & Security Governance
  private updateChannel: "stable" | "beta" | "enterprise" = "stable";
  private authorizedUpdateEndpoint?: string;
  private autoUpdateEnabled: boolean = false; // Strictly manual/authorized by default

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
    updateChannel?: "stable" | "beta" | "enterprise";
    authorizedUpdateEndpoint?: string;
    autoUpdateEnabled?: boolean;
  }): void {
    if (config.companyId !== undefined) this.companyId = config.companyId;
    if (config.branchId !== undefined) this.branchId = config.branchId;
    if (config.branchCode !== undefined) this.branchCode = config.branchCode;
    if (config.branchName !== undefined) this.branchName = config.branchName;
    if (config.isHeadquarters !== undefined) this.isHeadquarters = config.isHeadquarters;
    if (config.appVersion !== undefined) this.appVersion = config.appVersion;
    if (config.hardwareId !== undefined) this.hardwareId = config.hardwareId;
    if (config.terminalId !== undefined) this.terminalId = config.terminalId;
    if (config.updateChannel !== undefined) this.updateChannel = config.updateChannel;
    if (config.authorizedUpdateEndpoint !== undefined) this.authorizedUpdateEndpoint = config.authorizedUpdateEndpoint;
    if (config.autoUpdateEnabled !== undefined) this.autoUpdateEnabled = config.autoUpdateEnabled;
  }

  /**
   * Cryptographically verifies the authenticity of a signed update manifest using RSA-4096 / SHA-256.
   * Enforces asymmetric signature validation, publication channel matching, and version rollback guards.
   */
  public verifyAsymmetricManifest(
    manifest: SignedUpdateManifest,
    publicKeyPem: string = LICENSE_PUBLIC_KEY
  ): { valid: boolean; reason?: string } {
    if (!manifest.signatureRsaSha256) {
      return {
        valid: false,
        reason: "Assinatura assimétrica digital ausente. O manifesto contém apenas checksum simples.",
      };
    }

    try {
      const canonical =
        manifest.canonicalPayload ||
        `${manifest.version}:${manifest.channel}:${manifest.minimumPreviousVersion}:${manifest.targetSchemaVersion}:${manifest.checksumSha256}`;

      const verifier = cryptoNode.createVerify("RSA-SHA256");
      verifier.update(canonical);
      verifier.end();

      const isValid = verifier.verify(
        publicKeyPem,
        Buffer.from(manifest.signatureRsaSha256, "base64")
      );

      if (!isValid) {
        return {
          valid: false,
          reason: "Assinatura assimétrica RSA-SHA256 inválida ou adulterada.",
        };
      }

      // Check version rollback constraint
      if (manifest.minimumPreviousVersion && this.appVersion) {
        const partsCurrent = this.appVersion.split(".").map((n) => parseInt(n, 10) || 0);
        const partsMin = manifest.minimumPreviousVersion.split(".").map((n) => parseInt(n, 10) || 0);
        const cMajor = partsCurrent[0] ?? 0;
        const cMinor = partsCurrent[1] ?? 0;
        const cPatch = partsCurrent[2] ?? 0;
        const mMajor = partsMin[0] ?? 0;
        const mMinor = partsMin[1] ?? 0;
        const mPatch = partsMin[2] ?? 0;

        const isCurrentLower =
          cMajor < mMajor ||
          (cMajor === mMajor && cMinor < mMinor) ||
          (cMajor === mMajor && cMinor === mMinor && cPatch < mPatch);

        if (isCurrentLower) {
          return {
            valid: false,
            reason: `Versão atual (${this.appVersion}) inferior à versão mínima exigida (${manifest.minimumPreviousVersion}). Atualização abortada.`,
          };
        }
      }

      // Channel compatibility
      if (manifest.channel !== this.updateChannel && manifest.channel !== "enterprise") {
        return {
          valid: false,
          reason: `Manifesto direcionado ao canal '${manifest.channel}', mas o terminal está configurado para '${this.updateChannel}'.`,
        };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `Erro na validação criptográfica: ${err.message}` };
    }
  }

  /**
   * Verifies the payload integrity and cryptographic authenticity of a patch.
   * If an asymmetric signature is present, verifies with RSA-SHA256; otherwise verifies checksum hash.
   */
  public async verifyPatchSignature(patch: {
    companyId?: string;
    patchVersion: string;
    category: string;
    payloadJson: string;
    sha256Signature?: string;
    rsaSha256Signature?: string;
  }): Promise<boolean> {
    const compId = patch.companyId || this.companyId;
    const canonicalString = `${compId}:${patch.patchVersion}:${patch.category}:${patch.payloadJson}`;

    // 1. Asymmetric digital signature verification (RSA-SHA256)
    if (patch.rsaSha256Signature) {
      try {
        const verifier = cryptoNode.createVerify("RSA-SHA256");
        verifier.update(canonicalString);
        verifier.end();
        return verifier.verify(LICENSE_PUBLIC_KEY, Buffer.from(patch.rsaSha256Signature, "base64"));
      } catch {
        return false;
      }
    }

    // 2. Checksum hash verification
    if (patch.sha256Signature) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(canonicalString);
        let computedHex = "";
        if (typeof crypto !== "undefined" && crypto.subtle) {
          const hashBuffer = await crypto.subtle.digest("SHA-256", data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          computedHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        } else {
          computedHex = cryptoNode.createHash("sha256").update(canonicalString).digest("hex");
        }
        return computedHex.toLowerCase() === patch.sha256Signature.toLowerCase();
      } catch {
        return false;
      }
    }

    return false;
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
    apiUrl?: string,
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
    const targetUrl = apiUrl || this.authorizedUpdateEndpoint;
    if (!targetUrl) {
      return {
        success: false,
        online: false,
        syncedOutboxCount: 0,
        receivedCommandsCount: 0,
        appliedCommands: [],
        error: "Nenhum canal ou servidor corporativo autorizado foi configurado. Sincronização bloqueada por segurança.",
      };
    }

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
      const res = await fetch(`${targetUrl}/api/v1/corporate/sync/bidirectional`, {
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
