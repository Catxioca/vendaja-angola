import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import type { Request } from "express";
import { EnterpriseAuditService } from "./audit.service.js";

export interface SessionClientDetails {
  ipAddress?: string;
  deviceName?: string;
  operatingSystem?: string;
  browser?: string;
}

export class EnterpriseSessionService {
  /**
   * Hashes session token for secure database indexing
   */
  public static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Creates an active session tracking record upon successful login
   */
  public static async createSession(
    userId: string,
    rawToken: string,
    client: SessionClientDetails,
    expiresAt: Date
  ) {
    const tokenHash = this.hashToken(rawToken);

    // Check if this IP is new for this user (anomaly/suspicious detection)
    let isSuspicious = false;
    if (client.ipAddress && client.ipAddress !== "127.0.0.1" && client.ipAddress !== "::1") {
      const priorSession = await prisma.activeSession.findFirst({
        where: { userId, ipAddress: client.ipAddress },
      });
      if (!priorSession) {
        // First login from this IP address
        const totalSessions = await prisma.activeSession.count({ where: { userId } });
        if (totalSessions > 0) {
          isSuspicious = true;
          logger.warn(
            "SECURITY",
            "SUSPICIOUS_LOGIN_IP",
            `Novo endereço IP detetado para o utilizador ${userId}: ${client.ipAddress}`,
            { userId, metadata: { ipAddress: client.ipAddress, browser: client.browser } }
          );
        }
      }
    }

    return prisma.activeSession.create({
      data: {
        userId,
        tokenHash,
        ipAddress: client.ipAddress ?? null,
        deviceName: client.deviceName ?? null,
        operatingSystem: client.operatingSystem ?? null,
        browser: client.browser ?? null,
        expiresAt,
        isSuspicious,
      },
    });
  }

  /**
   * Touches/updates the last active timestamp of a session
   */
  public static async touchSession(rawToken: string): Promise<boolean> {
    const tokenHash = this.hashToken(rawToken);
    try {
      const updated = await prisma.activeSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { lastActiveAt: new Date() },
      });
      return updated.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Validates if a session token is still active (not revoked and not expired)
   */
  public static async isSessionValid(rawToken: string): Promise<boolean> {
    const tokenHash = this.hashToken(rawToken);
    const session = await prisma.activeSession.findUnique({
      where: { tokenHash },
    });

    if (!session) return true; // Fallback for tokens issued before session tracking
    if (session.revokedAt) return false;
    if (session.expiresAt < new Date()) return false;

    return true;
  }

  /**
   * Lists active sessions for a user or for a company
   */
  public static async listActiveSessions(options: { userId?: string; companyId?: string }) {
    const now = new Date();
    const where: Record<string, unknown> = {
      revokedAt: null,
      expiresAt: { gt: now },
    };

    if (options.userId) {
      where.userId = options.userId;
    } else if (options.companyId) {
      where.user = {
        memberships: {
          some: { companyId: options.companyId, active: true },
        },
      };
    }

    const sessions = await prisma.activeSession.findMany({
      where,
      orderBy: { lastActiveAt: "desc" },
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
      take: 100,
    });

    return sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      user: s.user,
      ipAddress: s.ipAddress || "Localhost",
      deviceName: s.deviceName || "Desktop PC",
      operatingSystem: s.operatingSystem || "Windows",
      browser: s.browser || "VendaJá App",
      lastActiveAt: s.lastActiveAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isSuspicious: s.isSuspicious,
    }));
  }

  /**
   * Revokes / terminates a specific session remotely
   */
  public static async revokeSession(sessionId: string, actorUserId?: string): Promise<boolean> {
    const session = await prisma.activeSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return false;

    await prisma.activeSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    logger.info("SECURITY", "SESSION_REVOKED", `Sessão ${sessionId} terminada remotamente por ${actorUserId ?? "admin"}`, {
      userId: session.userId,
      metadata: { sessionId, revokedBy: actorUserId },
    });

    return true;
  }

  /**
   * Terminates all other active sessions for a user, keeping only the current one
   */
  public static async revokeAllOtherSessions(userId: string, currentToken: string): Promise<number> {
    const currentHash = this.hashToken(currentToken);
    const result = await prisma.activeSession.updateMany({
      where: {
        userId,
        tokenHash: { not: currentHash },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }

  /**
   * Checks whether the current time falls within allowed working hours
   */
  public static isWithinAllowedHours(startHour?: string | null, endHour?: string | null): boolean {
    if (!startHour || !endHour) return true;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [sh, sm] = startHour.split(":").map(Number);
    const [eh, em] = endHour.split(":").map(Number);

    if (isNaN(sh!) || isNaN(sm!) || isNaN(eh!) || isNaN(em!)) return true;

    const startMinutes = sh! * 60 + sm!;
    const endMinutes = eh! * 60 + em!;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Checks whether an IP address is allowed based on an IP whitelist
   */
  public static isIpAllowed(ipAddress: string, whitelist?: string[] | null): boolean {
    if (!whitelist || !whitelist.length) return true;
    if (ipAddress === "127.0.0.1" || ipAddress === "::1") return true;

    return whitelist.includes(ipAddress);
  }
}
