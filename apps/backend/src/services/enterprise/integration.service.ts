import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";

export interface SyncMutationPayload {
  id: string;
  operation: "CREATE" | "UPDATE";
  entity: "SALE" | "PRODUCT";
  payload: Record<string, unknown>;
  occurredAt: string;
}

export class EnterpriseIntegrationService {
  /**
   * Returns current sync outbox backlog and queue metrics
   */
  public static async getSyncMetrics(companyId?: string) {
    try {
      const pendingSalesCount = await prisma.sale.count({
        where: {
          ...(companyId ? { companyId } : {}),
          status: "DRAFT",
        },
      });

      return {
        status: "ok",
        pendingSalesCount,
        lastSyncedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("INTEGRATION", "METRICS_ERROR", "Failed to retrieve sync metrics", error);
      return {
        status: "degraded",
        pendingSalesCount: 0,
        error: error instanceof Error ? error.message : "metrics_unavailable",
      };
    }
  }

  /**
   * Validates idempotency key for incoming external or offline mutations
   */
  public static async isDuplicateMutation(id: string): Promise<boolean> {
    try {
      const existingSale = await prisma.sale.findUnique({
        where: { id },
        select: { id: true },
      });
      return !!existingSale;
    } catch {
      return false;
    }
  }
}
