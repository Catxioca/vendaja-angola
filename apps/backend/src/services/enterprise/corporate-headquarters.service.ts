import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../db.js";
import { EnterpriseLogger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";
import { EnterpriseRbacService } from "./rbac.service.js";
import { formatKwanza } from "@angola/shared";

export type CorporateRole =
  | "SUPER_ADMIN"
  | "LOCAL_ADMIN"
  | "CFO"
  | "CRO"
  | "MANAGER"
  | "SUPERVISOR"
  | "ACCOUNTANT"
  | "HR"
  | "CASHIER";

export type PatchCategory =
  | "MODULE_RELEASE"
  | "HOTFIX"
  | "FISCAL_LEGAL"
  | "UI_ENHANCEMENT"
  | "SECURITY";

export interface CorporateStoreSummary {
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
  activeModules: string[];
  appVersion: string;
  hardwareId?: string;
  terminalId?: string;
  pendingSyncCount: number;
}

export interface HeadquartersCockpit {
  companyId: string;
  companyName: string;
  evaluatedAt: string;
  networkSummary: {
    totalStores: number;
    onlineStores: number;
    offlineStores: number;
    totalActiveUsers: number;
    totalTodaySalesCents: number;
    totalTodayDocuments: number;
    totalCashInDrawersCents: number;
  };
  stores: CorporateStoreSummary[];
  activeAlerts: Array<{
    id: string;
    storeCode: string;
    storeName: string;
    severity: "INFO" | "WARN" | "CRITICAL";
    title: string;
    message: string;
    timestamp: string;
  }>;
  recentEvents: Array<{
    id: string;
    eventType: string;
    actorName: string;
    description: string;
    severity: string;
    createdAt: string;
  }>;
  pendingPatchesCount: number;
}

export interface CreateCorporateUserDTO {
  email: string;
  username: string;
  displayName: string;
  password?: string;
  role: CorporateRole;
  branchId?: string;
  department?: string;
  phone?: string;
  nif?: string;
  modules?: string[];
}

export interface PublishLivePatchDTO {
  patchVersion: string;
  title: string;
  description: string;
  category: PatchCategory;
  targetModules?: string[];
  targetBranches?: string[];
  payloadJson: string;
  isCritical?: boolean;
}

export class EnterpriseCorporateHeadquartersService {
  // In-memory fallback stores for test and offline environments
  private static inMemoryBranches = new Map<string, any>();
  private static inMemoryStoreStatuses = new Map<string, any>();
  private static inMemoryUsers = new Map<string, any>();
  private static inMemoryMemberships = new Map<string, any>();
  private static inMemoryLivePatches = new Map<string, any>();
  private static inMemoryBroadcasts = new Map<string, any>();
  private static inMemoryEvents: any[] = [];
  private static isDbAvailable: boolean | null = null;

  public static async isDbConnected(): Promise<boolean> {
    if (this.isDbAvailable !== null) return this.isDbAvailable;
    try {
      const probe = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB_OFFLINE")), 120)
      );
      await Promise.race([prisma.$queryRaw`SELECT 1`, probe]);
      this.isDbAvailable = true;
    } catch {
      this.isDbAvailable = false;
    }
    return this.isDbAvailable;
  }

  /**
   * Evaluates the central consolidated cockpit for the Headquarters (Loja Mãe)
   */
  public static async getHeadquartersCockpit(companyId: string): Promise<HeadquartersCockpit> {
    const isDb = await this.isDbConnected();
    let company: any = null;
    let branches: any[] = [];
    let statuses: any[] = [];

    if (isDb) {
      try {
        company = await prisma.company.findUnique({
          where: { id: companyId },
          include: { branches: true },
        });
        branches = company?.branches || [];
        statuses = await prisma.corporateStoreStatus.findMany({
          where: { companyId },
          orderBy: { isHeadquarters: "desc" },
        });
      } catch {
        this.isDbAvailable = false;
      }
    }

    if (branches.length === 0) {
      branches = Array.from(this.inMemoryBranches.values()).filter((b) => b.companyId === companyId);
    }
    if (statuses.length === 0) {
      statuses = Array.from(this.inMemoryStoreStatuses.values()).filter((s) => s.companyId === companyId);
    }

    const companyName = company?.legalName || "VendaJá Enterprise Group (Sede Central)";
    const now = Date.now();

    // Merge registered branches with live telemetry
    const stores: CorporateStoreSummary[] = branches.map((b) => {
      const live = statuses.find((s) => s.branchId === b.id || s.branchCode === b.code);
      const isOnline = live ? now - new Date(live.lastPingAt).getTime() < 300_000 : false;

      return {
        id: b.id,
        code: b.code,
        name: b.name,
        isHeadquarters: b.isHeadquarters,
        online: isOnline,
        lastPingAt: live?.lastPingAt ? new Date(live.lastPingAt).toISOString() : new Date().toISOString(),
        activeUsersCount: live?.activeUsersCount || (isOnline ? 1 : 0),
        todaySalesCents: live?.todaySalesCents || 0,
        todayDocumentsCount: live?.todayDocumentsCount || 0,
        cashDrawerCents: live?.cashDrawerCents || 0,
        activeModules: live?.activeModules || ["POS", "STOCK", "TREASURY"],
        appVersion: live?.appVersion || "2.2.4",
        hardwareId: live?.hardwareId || undefined,
        terminalId: live?.terminalId || undefined,
        pendingSyncCount: live?.pendingSyncCount || 0,
      };
    });

    if (stores.length === 0) {
      stores.push({
        id: "hq-store-01",
        code: "SEDE-01",
        name: "Sede Central (Loja Mãe)",
        isHeadquarters: true,
        online: true,
        lastPingAt: new Date().toISOString(),
        activeUsersCount: 2,
        todaySalesCents: 4500000,
        todayDocumentsCount: 15,
        cashDrawerCents: 2500000,
        activeModules: ["CORPORATE", "POS", "STOCK", "TREASURY", "HR", "CRM", "BI", "AI", "BIOMETRICS"],
        appVersion: "2.2.4",
        hardwareId: "HQ-HWID-001",
        terminalId: "TERM-HQ-01",
        pendingSyncCount: 0,
      });
    }

    const totalStores = stores.length;
    const onlineStores = stores.filter((s) => s.online).length;
    const offlineStores = totalStores - onlineStores;
    const totalActiveUsers = stores.reduce((acc, s) => acc + s.activeUsersCount, 0);
    const totalTodaySalesCents = stores.reduce((acc, s) => acc + s.todaySalesCents, 0);
    const totalTodayDocuments = stores.reduce((acc, s) => acc + s.todayDocumentsCount, 0);
    const totalCashInDrawersCents = stores.reduce((acc, s) => acc + s.cashDrawerCents, 0);

    const activeAlerts: HeadquartersCockpit["activeAlerts"] = [];
    for (const s of stores) {
      if (!s.online) {
        activeAlerts.push({
          id: `alt-off-${s.id}`,
          storeCode: s.code,
          storeName: s.name,
          severity: "WARN",
          title: "Filial Inacessível / Offline",
          message: `A loja ${s.name} (${s.code}) não emite sinal de telemetria há mais de 5 minutos.`,
          timestamp: s.lastPingAt,
        });
      }
      if (s.pendingSyncCount > 20) {
        activeAlerts.push({
          id: `alt-sync-${s.id}`,
          storeCode: s.code,
          storeName: s.name,
          severity: "INFO",
          title: "Fila de Sincronização Elevada",
          message: `Existem ${s.pendingSyncCount} transações locais aguardando envio para o repositório central.`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    let recentEvents = this.inMemoryEvents.filter((e) => e.companyId === companyId).slice(0, 10);
    if (recentEvents.length === 0) {
      recentEvents = [
        {
          id: "ev-01",
          eventType: "HQ_INITIALIZED",
          actorName: "Super Administrador",
          description: "Painel de Controlo Corporativo iniciado com sucesso.",
          severity: "INFO",
          createdAt: new Date().toISOString(),
        },
      ];
    }

    const pendingPatchesCount = Array.from(this.inMemoryLivePatches.values()).filter(
      (p) => p.companyId === companyId && p.status === "PUBLISHED"
    ).length;

    return {
      companyId,
      companyName,
      evaluatedAt: new Date().toISOString(),
      networkSummary: {
        totalStores,
        onlineStores,
        offlineStores,
        totalActiveUsers,
        totalTodaySalesCents,
        totalTodayDocuments,
        totalCashInDrawersCents,
      },
      stores,
      activeAlerts,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actorName: e.actorName,
        description: e.description,
        severity: e.severity,
        createdAt: new Date(e.createdAt).toISOString(),
      })),
      pendingPatchesCount,
    };
  }

  /**
   * Registers a store or updates store attributes
   */
  public static async registerOrUpdateStore(
    companyId: string,
    data: {
      code: string;
      name: string;
      isHeadquarters?: boolean;
      active?: boolean;
    },
    actorName = "Super Administrador"
  ): Promise<{ id: string; code: string; name: string; isHeadquarters: boolean }> {
    let branch: any = null;
    const isDb = await this.isDbConnected();

    if (isDb) {
      try {
        const existing = await prisma.branch.findUnique({
          where: {
            companyId_code: { companyId, code: data.code },
          },
        });

        if (existing) {
          branch = await prisma.branch.update({
            where: { id: existing.id },
            data: {
              name: data.name,
              active: data.active ?? existing.active,
              isHeadquarters: data.isHeadquarters ?? existing.isHeadquarters,
            },
          });
        } else {
          branch = await prisma.branch.create({
            data: {
              companyId,
              code: data.code,
              name: data.name,
              isHeadquarters: data.isHeadquarters ?? false,
              active: data.active ?? true,
            },
          });
        }
      } catch {
        this.isDbAvailable = false;
      }
    }

    if (!branch) {
      const key = `${companyId}:${data.code}`;
      const existing = this.inMemoryBranches.get(key);
      if (existing) {
        branch = {
          ...existing,
          name: data.name,
          active: data.active ?? existing.active,
          isHeadquarters: data.isHeadquarters ?? existing.isHeadquarters,
        };
      } else {
        branch = {
          id: `br-${crypto.randomUUID().slice(0, 8)}`,
          companyId,
          code: data.code,
          name: data.name,
          isHeadquarters: data.isHeadquarters ?? false,
          active: data.active ?? true,
        };
      }
      this.inMemoryBranches.set(key, branch);
      this.inMemoryBranches.set(branch.id, branch);
    }

    await this.publishCorporateEvent({
      companyId,
      branchId: branch.id,
      actorName,
      eventType: branch.isHeadquarters ? "HQ_STORE_REGISTERED" : "STORE_UPDATED",
      severity: "INFO",
      description: `Registada/Atualizada filial ${branch.name} (${branch.code}) ${branch.isHeadquarters ? "[SEDE]" : ""}`,
      metadata: { code: branch.code, isHeadquarters: branch.isHeadquarters },
    });

    return {
      id: branch.id,
      code: branch.code,
      name: branch.name,
      isHeadquarters: branch.isHeadquarters,
    };
  }

  /**
   * Ingests store heartbeat and operational telemetry
   */
  public static async heartbeatStoreStatus(
    companyId: string,
    telemetry: {
      branchId: string;
      branchCode: string;
      branchName: string;
      isHeadquarters?: boolean;
      todaySalesCents?: number;
      todayDocumentsCount?: number;
      cashDrawerCents?: number;
      activeUsersCount?: number;
      activeModules?: string[];
      appVersion?: string;
      hardwareId?: string;
      terminalId?: string;
      pendingSyncCount?: number;
    }
  ): Promise<void> {
    const isDb = await this.isDbConnected();
    if (isDb) {
      try {
        await prisma.corporateStoreStatus.upsert({
          where: {
            companyId_branchId: {
              companyId,
              branchId: telemetry.branchId,
            },
          },
          create: {
            companyId,
            branchId: telemetry.branchId,
            branchCode: telemetry.branchCode,
            branchName: telemetry.branchName,
            isHeadquarters: telemetry.isHeadquarters ?? false,
            online: true,
            lastPingAt: new Date(),
            activeUsersCount: telemetry.activeUsersCount ?? 1,
            todaySalesCents: telemetry.todaySalesCents ?? 0,
            todayDocumentsCount: telemetry.todayDocumentsCount ?? 0,
            cashDrawerCents: telemetry.cashDrawerCents ?? 0,
            activeModules: telemetry.activeModules ?? ["POS", "STOCK"],
            appVersion: telemetry.appVersion ?? "2.2.4",
            hardwareId: telemetry.hardwareId,
            terminalId: telemetry.terminalId,
            pendingSyncCount: telemetry.pendingSyncCount ?? 0,
          },
          update: {
            online: true,
            lastPingAt: new Date(),
            activeUsersCount: telemetry.activeUsersCount ?? 1,
            todaySalesCents: telemetry.todaySalesCents ?? 0,
            todayDocumentsCount: telemetry.todayDocumentsCount ?? 0,
            cashDrawerCents: telemetry.cashDrawerCents ?? 0,
            activeModules: telemetry.activeModules ?? undefined,
            appVersion: telemetry.appVersion ?? undefined,
            pendingSyncCount: telemetry.pendingSyncCount ?? 0,
          },
        });
        return;
      } catch {
        this.isDbAvailable = false;
      }
    }

    // In-memory fallback
    const key = `${companyId}:${telemetry.branchId}`;
    this.inMemoryStoreStatuses.set(key, {
      companyId,
      branchId: telemetry.branchId,
      branchCode: telemetry.branchCode,
      branchName: telemetry.branchName,
      isHeadquarters: telemetry.isHeadquarters ?? false,
      online: true,
      lastPingAt: new Date(),
      activeUsersCount: telemetry.activeUsersCount ?? 1,
      todaySalesCents: telemetry.todaySalesCents ?? 0,
      todayDocumentsCount: telemetry.todayDocumentsCount ?? 0,
      cashDrawerCents: telemetry.cashDrawerCents ?? 0,
      activeModules: telemetry.activeModules ?? ["POS", "STOCK"],
      appVersion: telemetry.appVersion ?? "2.2.4",
      hardwareId: telemetry.hardwareId,
      terminalId: telemetry.terminalId,
      pendingSyncCount: telemetry.pendingSyncCount ?? 0,
    });
  }

  /**
   * Centralized User Management: Create User from Sede (Headquarters)
   */
  public static async createCorporateUser(
    companyId: string,
    data: CreateCorporateUserDTO,
    actorName = "Super Administrador"
  ): Promise<{ id: string; email: string; username: string; role: string; branchId?: string }> {
    const rawPass = data.password || "VendaJa@2026";
    const passwordHash = await bcrypt.hash(rawPass, 10);
    const pinHash = await bcrypt.hash("1234", 10);

    let user: any = null;
    const isDb = await this.isDbConnected();

    if (isDb) {
      try {
        user = await prisma.user.create({
          data: {
            email: data.email,
            username: data.username,
            displayName: data.displayName,
            passwordHash,
            pinHash,
            role: `ROLE_${data.role}`,
            phone: data.phone,
            nif: data.nif,
          },
        });

        await prisma.companyMembership.create({
          data: {
            userId: user.id,
            companyId,
            branchId: data.branchId ?? null,
            role: `ROLE_${data.role}`,
            modules: data.modules ?? [],
            active: true,
          },
        });
      } catch {
        this.isDbAvailable = false;
      }
    }

    if (!user) {
      const userId = `usr-${crypto.randomUUID().slice(0, 8)}`;
      user = {
        id: userId,
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        role: `ROLE_${data.role}`,
        lockedUntil: null,
      };
      this.inMemoryUsers.set(userId, user);

      const memId = `mem-${crypto.randomUUID().slice(0, 8)}`;
      this.inMemoryMemberships.set(memId, {
        id: memId,
        userId,
        companyId,
        branchId: data.branchId ?? null,
        role: `ROLE_${data.role}`,
        modules: data.modules ?? [],
        active: true,
      });
    }

    await this.publishCorporateEvent({
      companyId,
      branchId: data.branchId,
      userId: user.id,
      actorName,
      eventType: "USER_CREATED",
      severity: "INFO",
      description: `Criado utilizador ${data.displayName} (${data.username}) com função ${data.role} para a filial ${data.branchId || "GLOBAL"}.`,
      metadata: { username: data.username, role: data.role, email: data.email },
    });

    return {
      id: user.id,
      email: user.email,
      username: user.username || data.username,
      role: data.role,
      branchId: data.branchId,
    };
  }

  /**
   * Centralized User Management: Suspend User Immediately Across All Branches
   */
  public static async suspendCorporateUser(
    companyId: string,
    userId: string,
    reason: string,
    actorName = "Super Administrador"
  ): Promise<{ suspended: boolean; userId: string; reason: string }> {
    const isDb = await this.isDbConnected();
    if (isDb) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            lockedUntil: new Date("2099-12-31T23:59:59.999Z"),
          },
        });

        await prisma.companyMembership.updateMany({
          where: { userId, companyId },
          data: { active: false },
        });

        try {
          await prisma.activeSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        } catch {
          // ignore
        }
      } catch {
        this.isDbAvailable = false;
      }
    }

    const user = this.inMemoryUsers.get(userId);
    if (user) {
      user.lockedUntil = new Date("2099-12-31T23:59:59.999Z");
    }
    for (const mem of this.inMemoryMemberships.values()) {
      if (mem.userId === userId && mem.companyId === companyId) {
        mem.active = false;
      }
    }

    await this.publishCorporateEvent({
      companyId,
      userId,
      actorName,
      eventType: "USER_SUSPENDED",
      severity: "CRITICAL",
      description: `Utilizador ${userId} SUSPENSO imediatamente em toda a rede de lojas. Motivo: ${reason}`,
      metadata: { userId, reason },
    });

    return {
      suspended: true,
      userId,
      reason,
    };
  }

  /**
   * Centralized User Management: Reassign Store and Role
   */
  public static async assignStoreAndRole(
    companyId: string,
    userId: string,
    data: { branchId?: string; role: CorporateRole; modules?: string[] },
    actorName = "Super Administrador"
  ): Promise<{ userId: string; role: CorporateRole; branchId?: string }> {
    const isDb = await this.isDbConnected();
    if (isDb) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { role: `ROLE_${data.role}` },
        });

        const existingMembership = await prisma.companyMembership.findFirst({
          where: { userId, companyId },
        });

        if (existingMembership) {
          await prisma.companyMembership.update({
            where: { id: existingMembership.id },
            data: {
              branchId: data.branchId ?? null,
              role: `ROLE_${data.role}`,
              modules: data.modules ?? existingMembership.modules,
              active: true,
            },
          });
        } else {
          await prisma.companyMembership.create({
            data: {
              userId,
              companyId,
              branchId: data.branchId ?? null,
              role: `ROLE_${data.role}`,
              modules: data.modules ?? [],
              active: true,
            },
          });
        }
      } catch {
        this.isDbAvailable = false;
      }
    }

    const u = this.inMemoryUsers.get(userId);
    if (u) u.role = `ROLE_${data.role}`;

    let found = false;
    for (const m of this.inMemoryMemberships.values()) {
      if (m.userId === userId && m.companyId === companyId) {
        m.branchId = data.branchId ?? null;
        m.role = `ROLE_${data.role}`;
        m.modules = data.modules ?? m.modules;
        m.active = true;
        found = true;
        break;
      }
    }
    if (!found) {
      const memId = `mem-${crypto.randomUUID().slice(0, 8)}`;
      this.inMemoryMemberships.set(memId, {
        id: memId,
        userId,
        companyId,
        branchId: data.branchId ?? null,
        role: `ROLE_${data.role}`,
        modules: data.modules ?? [],
        active: true,
      });
    }

    await this.publishCorporateEvent({
      companyId,
      branchId: data.branchId,
      userId,
      actorName,
      eventType: "ROLE_CHANGED",
      severity: "INFO",
      description: `Alterada função do utilizador ${userId} para ${data.role} na filial ${data.branchId || "GLOBAL"}.`,
      metadata: { role: data.role, branchId: data.branchId },
    });

    return {
      userId,
      role: data.role,
      branchId: data.branchId,
    };
  }

  /**
   * Local Admin Enforcement: Validates if actor has permission to manage requested store
   */
  public static validateLocalAdminAuthority(
    actorRole: string,
    actorBranchId: string | null | undefined,
    targetBranchId: string | null | undefined
  ): void {
    const isSuper = actorRole.toUpperCase().includes("SUPER_ADMIN") || actorRole.toUpperCase() === "ROLE_ADMIN";
    if (isSuper) return;

    if (actorRole.toUpperCase().includes("LOCAL_ADMIN")) {
      if (!actorBranchId || actorBranchId !== targetBranchId) {
        throw new Error(
          `Acesso Recusado: O Administrador Local tem autoridade restrita à sua própria filial (${actorBranchId || "N/A"}).`
        );
      }
      return;
    }

    throw new Error("Acesso Recusado: Apenas Super Administradores ou Administradores Locais podem gerir utilizadores.");
  }

  /**
   * LiveUpdateService: Publish Live Hot-Patch / Module Component Without New Installer
   */
  public static async publishLivePatch(
    companyId: string,
    data: PublishLivePatchDTO,
    actorName = "Super Administrador"
  ): Promise<{
    id: string;
    patchVersion: string;
    sha256Signature: string;
    status: string;
    publishedAt: string;
  }> {
    const canonicalString = `${companyId}:${data.patchVersion}:${data.category}:${data.payloadJson}`;
    const sha256Signature = crypto.createHash("sha256").update(canonicalString).digest("hex");

    let patch: any = null;
    const isDb = await this.isDbConnected();

    if (isDb) {
      try {
        patch = await prisma.corporateLivePatch.create({
          data: {
            companyId,
            patchVersion: data.patchVersion,
            title: data.title,
            description: data.description,
            category: data.category,
            targetModules: data.targetModules ?? [],
            targetBranches: data.targetBranches ?? ["ALL"],
            payloadJson: data.payloadJson,
            sha256Signature,
            isCritical: data.isCritical ?? false,
            status: "PUBLISHED",
          },
        });
      } catch {
        this.isDbAvailable = false;
      }
    }

    if (!patch) {
      patch = {
        id: `patch-${crypto.randomUUID().slice(0, 8)}`,
        companyId,
        patchVersion: data.patchVersion,
        title: data.title,
        description: data.description,
        category: data.category,
        targetModules: data.targetModules ?? [],
        targetBranches: data.targetBranches ?? ["ALL"],
        payloadJson: data.payloadJson,
        sha256Signature,
        isCritical: data.isCritical ?? false,
        status: "PUBLISHED",
        createdAt: new Date(),
      };
      this.inMemoryLivePatches.set(patch.id, patch);
    }

    await this.publishCorporateEvent({
      companyId,
      actorName,
      eventType: "PATCH_DEPLOYED",
      severity: "INFO",
      description: `Publicada atualização dinâmica ${data.patchVersion} (${data.category}): "${data.title}" sem necessidade de novo instalador.`,
      metadata: { patchVersion: data.patchVersion, category: data.category, signature: sha256Signature },
    });

    return {
      id: patch.id,
      patchVersion: patch.patchVersion,
      sha256Signature: patch.sha256Signature,
      status: patch.status,
      publishedAt: new Date(patch.createdAt).toISOString(),
    };
  }

  /**
   * LiveUpdateService: Check Pending Patches for a Branch Terminal
   */
  public static async checkPendingPatches(
    companyId: string,
    branchId: string,
    _currentVersion?: string
  ): Promise<Array<{
    id: string;
    patchVersion: string;
    title: string;
    description: string;
    category: string;
    payloadJson: string;
    sha256Signature: string;
    isCritical: boolean;
  }>> {
    const isDb = await this.isDbConnected();
    if (isDb) {
      try {
        const patches = await prisma.corporateLivePatch.findMany({
          where: {
            companyId,
            status: "PUBLISHED",
            OR: [
              { targetBranches: { has: "ALL" } },
              { targetBranches: { has: branchId } },
            ],
          },
          orderBy: { createdAt: "asc" },
        });

        return patches.map((p) => ({
          id: p.id,
          patchVersion: p.patchVersion,
          title: p.title,
          description: p.description,
          category: p.category,
          payloadJson: p.payloadJson,
          sha256Signature: p.sha256Signature,
          isCritical: p.isCritical,
        }));
      } catch {
        this.isDbAvailable = false;
      }
    }

    return Array.from(this.inMemoryLivePatches.values())
      .filter(
        (p) =>
          p.companyId === companyId &&
          p.status === "PUBLISHED" &&
          (p.targetBranches?.includes("ALL") || p.targetBranches?.includes(branchId))
      )
      .map((p) => ({
        id: p.id,
        patchVersion: p.patchVersion,
        title: p.title,
        description: p.description,
        category: p.category,
        payloadJson: p.payloadJson,
        sha256Signature: p.sha256Signature,
        isCritical: p.isCritical,
      }));
  }

  /**
   * Remote Module Control: Activate, Deactivate or Suspend a Module for a Branch
   */
  public static async setStoreModuleStatus(
    companyId: string,
    branchId: string,
    moduleCode: string,
    status: "ACTIVATE" | "DEACTIVATE" | "SUSPEND",
    actorName = "Super Administrador"
  ): Promise<{ branchId: string; moduleCode: string; status: string }> {
    let currentModules: string[] = ["POS", "STOCK", "TREASURY"];
    const isDb = await this.isDbConnected();

    if (isDb) {
      try {
        const store = await prisma.corporateStoreStatus.findUnique({
          where: { companyId_branchId: { companyId, branchId } },
        });
        if (store?.activeModules) currentModules = [...store.activeModules];
      } catch {
        this.isDbAvailable = false;
      }
    }

    const memStore = this.inMemoryStoreStatuses.get(`${companyId}:${branchId}`);
    if (memStore?.activeModules) currentModules = [...memStore.activeModules];

    if (status === "ACTIVATE") {
      if (!currentModules.includes(moduleCode)) currentModules.push(moduleCode);
    } else {
      currentModules = currentModules.filter((m) => m !== moduleCode);
    }

    if (isDb && this.isDbAvailable) {
      try {
        await prisma.corporateStoreStatus.upsert({
          where: { companyId_branchId: { companyId, branchId } },
          create: {
            companyId,
            branchId,
            branchCode: "STORE",
            branchName: "Filial Remota",
            activeModules: currentModules,
          },
          update: { activeModules: currentModules },
        });
      } catch {
        this.isDbAvailable = false;
      }
    }

    const key = `${companyId}:${branchId}`;
    const existing = this.inMemoryStoreStatuses.get(key) || {
      companyId,
      branchId,
      branchCode: "STORE",
      branchName: "Filial Remota",
    };
    this.inMemoryStoreStatuses.set(key, {
      ...existing,
      activeModules: currentModules,
    });

    await this.publishCorporateEvent({
      companyId,
      branchId,
      actorName,
      eventType: "MODULE_STATUS_CHANGED",
      severity: "INFO",
      description: `Módulo ${moduleCode} alterado para [${status}] remotamente na filial ${branchId}.`,
      metadata: { moduleCode, status },
    });

    return {
      branchId,
      moduleCode,
      status,
    };
  }

  /**
   * Internal Communications: Publish Corporate Broadcast / Circular
   */
  public static async sendBroadcast(
    companyId: string,
    data: {
      title: string;
      content: string;
      priority?: "NORMAL" | "URGENT" | "CRITICAL";
      targetBranches?: string[];
      senderUserId: string;
    },
    actorName = "Administração Central"
  ): Promise<{ id: string; title: string; createdAt: string }> {
    let broadcast: any = null;
    const isDb = await this.isDbConnected();

    if (isDb) {
      try {
        broadcast = await prisma.corporateBroadcast.create({
          data: {
            companyId,
            title: data.title,
            content: data.content,
            priority: data.priority ?? "NORMAL",
            senderUserId: data.senderUserId,
            targetBranches: data.targetBranches ?? ["ALL"],
          },
        });
      } catch {
        this.isDbAvailable = false;
      }
    }

    if (!broadcast) {
      broadcast = {
        id: `bc-${crypto.randomUUID().slice(0, 8)}`,
        companyId,
        title: data.title,
        content: data.content,
        priority: data.priority ?? "NORMAL",
        senderUserId: data.senderUserId,
        targetBranches: data.targetBranches ?? ["ALL"],
        createdAt: new Date(),
      };
      this.inMemoryBroadcasts.set(broadcast.id, broadcast);
    }

    await this.publishCorporateEvent({
      companyId,
      actorName,
      eventType: "BROADCAST_SENT",
      severity: data.priority === "CRITICAL" ? "CRITICAL" : "INFO",
      description: `Emitido comunicado "${data.title}" com prioridade ${data.priority ?? "NORMAL"}.`,
      metadata: { broadcastId: broadcast.id, title: broadcast.title },
    });

    return {
      id: broadcast.id,
      title: broadcast.title,
      createdAt: new Date(broadcast.createdAt).toISOString(),
    };
  }

  /**
   * Event Stream: Register Corporate Audit Event
   */
  public static async publishCorporateEvent(data: {
    companyId: string;
    branchId?: string | null;
    userId?: string | null;
    actorName: string;
    eventType: string;
    severity?: "INFO" | "WARN" | "CRITICAL";
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const eventObj = {
      id: `ev-${crypto.randomUUID().slice(0, 8)}`,
      companyId: data.companyId,
      branchId: data.branchId ?? null,
      userId: data.userId ?? null,
      actorName: data.actorName,
      eventType: data.eventType,
      severity: data.severity ?? "INFO",
      description: data.description,
      metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
      createdAt: new Date(),
    };

    const isDb = await this.isDbConnected();
    if (isDb) {
      try {
        await prisma.corporateEventStream.create({
          data: {
            companyId: data.companyId,
            branchId: data.branchId ?? null,
            userId: data.userId ?? null,
            actorName: data.actorName,
            eventType: data.eventType,
            severity: data.severity ?? "INFO",
            description: data.description,
            metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
          },
        });
      } catch {
        this.isDbAvailable = false;
      }
    }

    this.inMemoryEvents.unshift(eventObj);
    if (this.inMemoryEvents.length > 500) this.inMemoryEvents.pop();

    EnterpriseLogger.info(
      "CORPORATE_HQ",
      data.eventType,
      `[${data.severity || "INFO"}] ${data.description}`,
      { ...data.metadata, branchId: data.branchId, actor: data.actorName }
    );
  }

  /**
   * Returns Corporate Event Stream for live monitoring
   */
  public static async getEventStream(companyId: string, limit = 50): Promise<any[]> {
    const isDb = await this.isDbConnected();
    if (isDb) {
      try {
        return await prisma.corporateEventStream.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
      } catch {
        this.isDbAvailable = false;
      }
    }

    return this.inMemoryEvents.filter((e) => e.companyId === companyId).slice(0, limit);
  }
}
