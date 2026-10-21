import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import type { Request } from "express";

export interface AuditRecordOptions {
  action: string;
  module?: string;
  entity?: string;
  entityId?: string;
  userId?: string;
  roleId?: string;
  companyId?: string;
  branchId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  deviceName?: string;
  operatingSystem?: string;
  browser?: string;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export interface AuditQueryOptions {
  companyId?: string;
  branchId?: string;
  userId?: string;
  module?: string;
  entity?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  skip?: number;
}

export class EnterpriseAuditService {
  /**
   * Helper to parse client environment (IP, OS, Browser, Device) from Express Request
   */
  public static extractClientInfo(req: Request): {
    ipAddress: string;
    userAgent: string;
    operatingSystem: string;
    browser: string;
    deviceName: string;
  } {
    const rawIp =
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.socket.remoteAddress ||
      "127.0.0.1";
    const ipAddress = Array.isArray(rawIp)
      ? rawIp[0]!
      : String(rawIp).split(",")[0]!.trim();
    const userAgent = req.headers["user-agent"] || "Unknown";

    let operatingSystem = "Unknown OS";
    if (/windows nt 10/i.test(userAgent)) operatingSystem = "Windows 10/11";
    else if (/windows/i.test(userAgent)) operatingSystem = "Windows";
    else if (/macintosh|mac os x/i.test(userAgent)) operatingSystem = "macOS";
    else if (/android/i.test(userAgent)) operatingSystem = "Android";
    else if (/iphone|ipad|ipod/i.test(userAgent)) operatingSystem = "iOS";
    else if (/linux/i.test(userAgent)) operatingSystem = "Linux";

    let browser = "Unknown Browser";
    if (/edg/i.test(userAgent)) browser = "Microsoft Edge";
    else if (/chrome|crios/i.test(userAgent)) browser = "Google Chrome";
    else if (/firefox|fxios/i.test(userAgent)) browser = "Mozilla Firefox";
    else if (/safari/i.test(userAgent)) browser = "Apple Safari";
    else if (/electron/i.test(userAgent)) browser = "VendaJá Desktop (Electron)";

    let deviceName = "PC / Desktop";
    if (/mobile/i.test(userAgent)) deviceName = "Mobile Device";
    else if (/tablet|ipad/i.test(userAgent)) deviceName = "Tablet";

    return { ipAddress, userAgent, operatingSystem, browser, deviceName };
  }

  /**
   * Records an immutable audit log entry in the database and structured logger
   */
  public static async record(options: AuditRecordOptions): Promise<void> {
    try {
      const metadata = options.metadata ? JSON.parse(JSON.stringify(options.metadata)) : undefined;
      const oldValue = options.oldValue ? JSON.parse(JSON.stringify(options.oldValue)) : undefined;
      const newValue = options.newValue ? JSON.parse(JSON.stringify(options.newValue)) : undefined;

      await prisma.auditLog.create({
        data: {
          action: options.action,
          module: options.module ?? "SYSTEM",
          entity: options.entity ?? null,
          entityId: options.entityId ?? null,
          userId: options.userId ?? null,
          roleId: options.roleId ?? null,
          companyId: options.companyId ?? null,
          branchId: options.branchId ?? null,
          oldValue: oldValue ?? undefined,
          newValue: newValue ?? undefined,
          ipAddress: options.ipAddress ?? null,
          deviceName: options.deviceName ?? null,
          operatingSystem: options.operatingSystem ?? null,
          browser: options.browser ?? null,
          metadata: metadata ?? undefined,
        },
      });

      logger.info(
        options.module ?? "AUDIT",
        options.action,
        `Audit: ${options.action} on ${options.entity ?? "SYSTEM"}:${options.entityId ?? "N/A"} by user ${options.userId ?? "anonymous"}`,
        {
          userId: options.userId,
          companyId: options.companyId,
          metadata: {
            ...options.metadata,
            ipAddress: options.ipAddress,
            browser: options.browser,
          },
        }
      );
    } catch (error) {
      // Never let audit failure crash the primary business transaction, but log with CRITICAL severity
      logger.critical(
        options.module ?? "AUDIT",
        "AUDIT_RECORD_FAILED",
        "Failed to persist audit log to database",
        error,
        {
          userId: options.userId,
          companyId: options.companyId,
          metadata: { action: options.action, entity: options.entity, entityId: options.entityId },
        }
      );
    }
  }

  /**
   * Convenience method to record audit with Express request context
   */
  public static async recordFromRequest(
    req: Request,
    action: string,
    options: Omit<AuditRecordOptions, "action" | "ipAddress" | "deviceName" | "operatingSystem" | "browser">
  ): Promise<void> {
    const client = this.extractClientInfo(req);
    return this.record({
      ...options,
      action,
      ipAddress: client.ipAddress,
      deviceName: client.deviceName,
      operatingSystem: client.operatingSystem,
      browser: client.browser,
    });
  }

  /**
   * Queries audit logs with tenancy filtering, date ranges, and pagination
   */
  public static async query(options: AuditQueryOptions) {
    const limit = Math.min(Math.max(1, options.limit ?? 50), 200);
    const skip = Math.max(0, options.skip ?? 0);

    const where: Record<string, unknown> = {
      ...(options.companyId ? { companyId: options.companyId } : {}),
      ...(options.branchId ? { branchId: options.branchId } : {}),
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.module ? { module: { equals: options.module, mode: "insensitive" } } : {}),
      ...(options.entity ? { entity: options.entity } : {}),
      ...(options.action ? { action: { contains: options.action, mode: "insensitive" } } : {}),
    };

    if (options.startDate || options.endDate) {
      where.createdAt = {
        ...(options.startDate ? { gte: new Date(options.startDate) } : {}),
        ...(options.endDate ? { lte: new Date(options.endDate) } : {}),
      };
    }

    const [total, records] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    return {
      records: records.map((log) => ({
        ...log,
        timestamp: log.createdAt.toISOString(),
      })),
      total,
      limit,
      skip,
      hasMore: skip + records.length < total,
    };
  }

  /**
   * Generates a CSV export string of filtered audit logs
   */
  public static async exportCsv(options: Omit<AuditQueryOptions, "limit" | "skip">): Promise<string> {
    const result = await this.query({ ...options, limit: 1000, skip: 0 });
    const header = [
      "ID",
      "Data/Hora",
      "Módulo",
      "Ação",
      "Entidade",
      "ID Entidade",
      "Utilizador",
      "IP",
      "Sistema Operativo",
      "Navegador",
    ].join(";");

    const rows = result.records.map((r) => {
      const userDisplay = r.user ? `${r.user.displayName || r.user.username} (${r.user.role})` : "Sistema";
      return [
        `"${r.id}"`,
        `"${r.timestamp}"`,
        `"${r.module ?? "SYSTEM"}"`,
        `"${r.action}"`,
        `"${r.entity ?? ""}"`,
        `"${r.entityId ?? ""}"`,
        `"${userDisplay}"`,
        `"${r.ipAddress ?? ""}"`,
        `"${r.operatingSystem ?? ""}"`,
        `"${r.browser ?? ""}"`,
      ].join(";");
    });

    return [header, ...rows].join("\r\n");
  }
}
