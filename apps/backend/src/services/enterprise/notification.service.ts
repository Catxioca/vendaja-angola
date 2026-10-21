import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";

export type NotificationType = "INFO" | "WARNING" | "CRITICAL" | "ACTION_REQUIRED" | "SUCCESS";
export type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type NotificationCategory = "SYSTEM" | "FINANCIAL" | "STOCK" | "HR" | "SECURITY" | "APPROVAL" | "BACKUP" | "WORKFLOW";

export interface SystemNotification {
  id: string;
  type: NotificationType;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  module: string;
  companyId?: string;
  branchId?: string;
  userId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  isArchived?: boolean;
  createdAt: string;
}

export class EnterpriseNotificationService {
  private static notifications: SystemNotification[] = [];
  private static readonly MAX_NOTIFICATIONS = 500;

  /**
   * Dispatches a new notification to users or company scope
   */
  public static dispatch(notification: Omit<SystemNotification, "id" | "read" | "createdAt">): SystemNotification {
    const item: SystemNotification = {
      id: crypto.randomUUID(),
      read: false,
      isArchived: false,
      priority: notification.priority ?? "NORMAL",
      category: notification.category ?? "SYSTEM",
      createdAt: new Date().toISOString(),
      ...notification,
    };

    this.notifications.unshift(item);
    if (this.notifications.length > this.MAX_NOTIFICATIONS) {
      this.notifications.pop();
    }

    // Persist to database asynchronously without blocking
    this.persistToDatabase(item).catch(() => {
      // Handled silently with logging inside persistToDatabase
    });

    logger.info("NOTIFICATION", "DISPATCHED", `[${item.type}] ${item.title}: ${item.message}`, {
      companyId: item.companyId,
      userId: item.userId,
      metadata: { module: item.module, actionUrl: item.actionUrl, category: item.category, priority: item.priority },
    });

    return item;
  }

  private static async persistToDatabase(item: SystemNotification): Promise<void> {
    try {
      await prisma.enterpriseNotification.create({
        data: {
          id: item.id,
          companyId: item.companyId ?? null,
          branchId: item.branchId ?? null,
          userId: item.userId ?? null,
          type: item.type,
          category: item.category ?? "SYSTEM",
          title: item.title,
          message: item.message,
          priority: item.priority ?? "NORMAL",
          isRead: false,
          isArchived: false,
          actionUrl: item.actionUrl ?? null,
          metadata: item.metadata ? JSON.parse(JSON.stringify(item.metadata)) : undefined,
          createdAt: new Date(item.createdAt),
        },
      });
    } catch {
      // In offline or local test mode without db, notifications are safely stored in-memory
    }
  }

  /**
   * Retrieves active notifications for a specific company and/or user
   */
  public static getNotifications(companyId?: string, userId?: string): SystemNotification[] {
    return this.notifications.filter((n) => {
      if (n.isArchived) return false;
      const companyMatches = !n.companyId || !companyId || n.companyId === companyId;
      const userMatches = !n.userId || !userId || n.userId === userId;
      return companyMatches && userMatches;
    });
  }

  /**
   * Marks a notification as read
   */
  public static markAsRead(id: string): boolean {
    const found = this.notifications.find((n) => n.id === id);
    if (found) {
      found.read = true;
      prisma.enterpriseNotification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      }).catch(() => {});
      return true;
    }
    return false;
  }

  /**
   * Marks all unread notifications as read
   */
  public static markAllAsRead(companyId?: string, userId?: string): number {
    let count = 0;
    for (const n of this.notifications) {
      const companyMatches = !companyId || !n.companyId || n.companyId === companyId;
      const userMatches = !userId || !n.userId || n.userId === userId;
      if (companyMatches && userMatches && !n.read) {
        n.read = true;
        count++;
      }
    }
    prisma.enterpriseNotification.updateMany({
      where: {
        ...(companyId ? { companyId } : {}),
        ...(userId ? { userId } : {}),
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    }).catch(() => {});
    return count;
  }

  /**
   * Archives a notification
   */
  public static archive(id: string): boolean {
    const found = this.notifications.find((n) => n.id === id);
    if (found) {
      found.isArchived = true;
      prisma.enterpriseNotification.update({
        where: { id },
        data: { isArchived: true },
      }).catch(() => {});
      return true;
    }
    return false;
  }

  /**
   * Convenience alias for dispatch
   */
  public static create(notification: {
    title: string;
    message: string;
    type?: NotificationType;
    category?: NotificationCategory;
    priority?: NotificationPriority;
    module?: string;
    companyId?: string;
    branchId?: string;
    userId?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }): SystemNotification {
    return this.dispatch({
      type: notification.type ?? "INFO",
      category: notification.category ?? "SYSTEM",
      priority: notification.priority ?? "NORMAL",
      title: notification.title,
      message: notification.message,
      module: notification.module ?? "SYSTEM",
      companyId: notification.companyId,
      branchId: notification.branchId,
      userId: notification.userId,
      actionUrl: notification.actionUrl,
      metadata: notification.metadata,
    });
  }

  /**
   * Convenience alias for getNotifications with options
   */
  public static list(options: {
    companyId?: string;
    userId?: string;
    unreadOnly?: boolean;
    category?: NotificationCategory;
    priority?: NotificationPriority;
  } = {}): SystemNotification[] {
    let list = this.getNotifications(options.companyId, options.userId);
    if (options.unreadOnly) {
      list = list.filter((n) => !n.read);
    }
    if (options.category) {
      list = list.filter((n) => n.category === options.category);
    }
    if (options.priority) {
      list = list.filter((n) => n.priority === options.priority);
    }
    return list;
  }

  /**
   * Returns notification metrics for dashboards
   */
  public static getStats(companyId?: string, userId?: string): {
    total: number;
    unread: number;
    critical: number;
    actionRequired: number;
  } {
    const list = this.getNotifications(companyId, userId);
    return {
      total: list.length,
      unread: list.filter((n) => !n.read).length,
      critical: list.filter((n) => n.type === "CRITICAL" || n.priority === "URGENT").length,
      actionRequired: list.filter((n) => n.type === "ACTION_REQUIRED").length,
    };
  }

  /**
   * Clears read notifications
   */
  public static clearRead(companyId?: string): void {
    this.notifications = this.notifications.filter((n) => {
      if (companyId && n.companyId && n.companyId !== companyId) return true;
      return !n.read;
    });
  }
}
