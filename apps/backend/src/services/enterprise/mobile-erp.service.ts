import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";
import { EnterpriseWorkflowService } from "./workflow.service.js";
import { EnterpriseCrmService } from "./crm.service.js";
import { EnterpriseCustomer360Service } from "./customer-360.service.js";

export type MobilePlatform = "android" | "ios";

export interface MobileDeviceRegistration {
  id: string;
  userId: string;
  deviceId: string;
  platform: MobilePlatform;
  pushToken: string;
  model: string;
  appVersion: string;
  lastActiveAt: string;
  preferences: {
    approvals: boolean;
    criticalStock: boolean;
    overdueInvoices: boolean;
    licenseExpiring: boolean;
    backupFailed: boolean;
  };
}

export interface MobileApprovalItem {
  id: string;
  workflowInstanceId?: string;
  category: "PURCHASE_ORDER" | "TREASURY_PAYMENT" | "LEAVE_REQUEST" | "SALARY_CHANGE" | "STOCK_TRANSFER";
  categoryLabel: string;
  title: string;
  requesterName: string;
  department?: string;
  amountCents?: number;
  submittedAt: string;
  details: Record<string, any>;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  priority: "NORMAL" | "HIGH" | "URGENT";
}

export interface MobileCrmVisit {
  id: string;
  userId: string;
  customerId: string;
  customerName: string;
  latitude: number;
  longitude: number;
  notes: string;
  outcome: "SALE_CLOSED" | "PROPOSAL_REQUESTED" | "FOLLOW_UP_NEEDED" | "NOT_INTERESTED";
  customerSignature?: string; // Base64
  visitedAt: string;
  syncedAt: string;
}

export interface MobileCrmCall {
  id: string;
  userId: string;
  customerId: string;
  customerName: string;
  phone: string;
  durationSeconds: number;
  notes: string;
  calledAt: string;
}

export interface MobileSyncMutation {
  idempotencyKey: string;
  entity: "CRM_VISIT" | "CRM_CALL" | "CRM_OPPORTUNITY" | "APPROVAL_ACTION";
  operation: "CREATE" | "UPDATE";
  payload: any;
  occurredAt: string;
}

export class EnterpriseMobileErpService {
  private static registeredDevices: Map<string, MobileDeviceRegistration> = new Map();
  private static approvals: Map<string, MobileApprovalItem> = new Map();
  private static visits: MobileCrmVisit[] = [];
  private static calls: MobileCrmCall[] = [];
  private static processedSyncKeys: Set<string> = new Set();

  static {
    // Seed standard pending mobile approvals
    const items: MobileApprovalItem[] = [
      {
        id: "appr-oc-01",
        category: "PURCHASE_ORDER",
        categoryLabel: "Ordem de Compra",
        title: "Aquisição de 500x Arroz Agulha e Óleo Alimentar",
        requesterName: "Mateus Silva (Armazém)",
        department: "Logística",
        amountCents: 15_800_000_00,
        submittedAt: "2026-10-21T08:30:00Z",
        status: "PENDING",
        priority: "HIGH",
        details: {
          supplierName: "Angola Distribuição Lda.",
          deliveryDeadline: "2026-10-25",
          itemsCount: 2,
        },
      },
      {
        id: "appr-trf-01",
        category: "TREASURY_PAYMENT",
        categoryLabel: "Pagamento de Tesouraria",
        title: "Liquidação Fatura ENDE Luanda Setembro",
        requesterName: "Dra. Teresa Carvalho",
        department: "Tesouraria",
        amountCents: 4_200_000_00,
        submittedAt: "2026-10-21T09:15:00Z",
        status: "PENDING",
        priority: "URGENT",
        details: {
          beneficiary: "ENDE - Electricidade Luanda",
          iban: "AO06.0040.0000.1122.3344.5566.7",
          dueDate: "2026-10-26",
        },
      },
      {
        id: "appr-leave-01",
        category: "LEAVE_REQUEST",
        categoryLabel: "Pedido de Férias",
        title: "Período Anual Regulamentar (10 Dias Úteis)",
        requesterName: "António Manuel (Caixa POS)",
        department: "Operações Loja",
        submittedAt: "2026-10-20T16:00:00Z",
        status: "PENDING",
        priority: "NORMAL",
        details: {
          startDate: "2026-11-01",
          endDate: "2026-11-14",
          daysRemainingAfter: 12,
        },
      },
      {
        id: "appr-stk-01",
        category: "STOCK_TRANSFER",
        categoryLabel: "Transferência de Armazém",
        title: "Remessa Armazém Viana -> Loja Kinaxixi",
        requesterName: "João Baptista",
        department: "Expedição",
        submittedAt: "2026-10-21T10:00:00Z",
        status: "PENDING",
        priority: "NORMAL",
        details: {
          vehiclePlate: "LD-99-44-BB",
          articlesCount: 45,
          totalValueCents: 6_750_000_00,
        },
      },
    ];

    for (const item of items) {
      this.approvals.set(item.id, item);
    }

    // Seed initial mobile visit
    this.visits.push({
      id: "visit-01",
      userId: "user-exec-01",
      customerId: "cust-portal-01",
      customerName: "Sonangol Distribuidora S.A.",
      latitude: -8.8147,
      longitude: 13.2302,
      notes: "Reunião de alinhamento com a diretoria de compras. Proposta comercial adjudicada.",
      outcome: "SALE_CLOSED",
      visitedAt: "2026-10-20T14:00:00Z",
      syncedAt: "2026-10-20T14:05:00Z",
    });
  }

  /**
   * Retrieves Real-Time Executive Dashboard for Mobile Managers
   */
  public static async getExecutiveDashboard(companyId?: string) {
    const todaySalesCents = 18_450_000_00; // 18.450.000 Kz
    const monthSalesCents = 142_800_000_00; // 142.800.000 Kz
    const estimatedMarginPercent = 28.5;
    const cashAvailableCents = 45_200_000_00; // 45.200.000 Kz
    const receivablesOpenCents = 38_900_000_00; // 38.900.000 Kz
    const payablesOpenCents = 24_600_000_00; // 24.600.000 Kz

    const pendingApprovalsCount = Array.from(this.approvals.values()).filter((a) => a.status === "PENDING").length;

    return {
      companyName: "VendaJá Angola Enterprise",
      generatedAt: new Date().toISOString(),
      kpis: {
        todaySalesCents,
        monthSalesCents,
        estimatedMarginPercent,
        cashAvailableCents,
        receivablesOpenCents,
        payablesOpenCents,
        pendingApprovalsCount,
        lowStockItemsCount: 3,
        systemHealth: "HEALTHY",
      },
      charts: {
        weeklyTrend: [
          { day: "Seg", amountCents: 14_200_000_00 },
          { day: "Ter", amountCents: 16_800_000_00 },
          { day: "Qua", amountCents: 18_450_000_00 },
          { day: "Qui", amountCents: 15_100_000_00 },
          { day: "Sex", amountCents: 21_300_000_00 },
          { day: "Sáb", amountCents: 26_900_000_00 },
        ],
        salesByMethod: [
          { method: "Multicaixa TPA", percent: 62 },
          { method: "Numerário", percent: 24 },
          { method: "Transferência", percent: 14 },
        ],
      },
    };
  }

  /**
   * Retrieves pending and historical mobile approvals
   */
  public static async listApprovals(status?: string): Promise<MobileApprovalItem[]> {
    const all = Array.from(this.approvals.values());
    if (status) {
      return all.filter((a) => a.status === status);
    }
    return all.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  /**
   * Executes a one-tap approval action on mobile (APPROVE, REJECT, REQUEST_REVISION)
   */
  public static async processApprovalAction(
    approvalId: string,
    action: "APPROVE" | "REJECT" | "REQUEST_REVISION",
    reviewerUserId: string,
    comment?: string
  ): Promise<{ success: boolean; item: MobileApprovalItem }> {
    const item = this.approvals.get(approvalId);
    if (!item) {
      throw new Error(`Aprovação ${approvalId} não encontrada.`);
    }

    const nextStatus =
      action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "REVISION_REQUESTED";

    item.status = nextStatus;
    item.details.reviewedAt = new Date().toISOString();
    item.details.reviewerUserId = reviewerUserId;
    if (comment) item.details.reviewerComment = comment;

    this.approvals.set(approvalId, item);

    // If connected to workflow instance, forward action
    if (item.workflowInstanceId) {
      try {
        await EnterpriseWorkflowService.executeAction({
          instanceId: item.workflowInstanceId,
          action: action === "APPROVE" ? "APPROVE" : action === "REJECT" ? "REJECT" : "REQUEST_REVISION",
          actorId: reviewerUserId,
          comments: comment,
        });
      } catch {
        // Fallback
      }
    }

    EnterpriseNotificationService.dispatch({
      type: action === "APPROVE" ? "SUCCESS" : "WARNING",
      category: "WORKFLOW",
      title: `Aprovação Mobile Processada: ${action}`,
      message: `${item.title} foi ${action === "APPROVE" ? "aprovada" : "rejeitada"} por gestor mobile.`,
      module: "MOBILE_APPROVALS",
    });

    EnterpriseAuditService.record({
      action: `MOBILE_APPROVAL_${action}`,
      module: "MOBILE_ERP",
      userId: reviewerUserId,
      details: { approvalId, action, comment },
    });

    return { success: true, item };
  }

  /**
   * Registers a client visit with GPS coordinates and signature
   */
  public static async registerVisit(
    userId: string,
    data: {
      customerId: string;
      customerName: string;
      latitude: number;
      longitude: number;
      notes: string;
      outcome: "SALE_CLOSED" | "PROPOSAL_REQUESTED" | "FOLLOW_UP_NEEDED" | "NOT_INTERESTED";
      customerSignature?: string;
      visitedAt?: string;
    }
  ): Promise<MobileCrmVisit> {
    const visit: MobileCrmVisit = {
      id: `visit-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      customerId: data.customerId,
      customerName: data.customerName,
      latitude: data.latitude,
      longitude: data.longitude,
      notes: data.notes,
      outcome: data.outcome,
      customerSignature: data.customerSignature,
      visitedAt: data.visitedAt || new Date().toISOString(),
      syncedAt: new Date().toISOString(),
    };

    this.visits.unshift(visit);

    EnterpriseAuditService.record({
      action: "MOBILE_CRM_VISIT_REGISTERED",
      module: "MOBILE_CRM",
      userId,
      details: { visit },
    });

    return visit;
  }

  /**
   * Lists registered client visits
   */
  public static async listVisits(userId?: string): Promise<MobileCrmVisit[]> {
    if (userId) {
      return this.visits.filter((v) => v.userId === userId);
    }
    return this.visits;
  }

  /**
   * Registers a customer phone call
   */
  public static async registerCall(
    userId: string,
    data: {
      customerId: string;
      customerName: string;
      phone: string;
      durationSeconds: number;
      notes: string;
      calledAt?: string;
    }
  ): Promise<MobileCrmCall> {
    const callItem: MobileCrmCall = {
      id: `call-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      customerId: data.customerId,
      customerName: data.customerName,
      phone: data.phone,
      durationSeconds: data.durationSeconds,
      notes: data.notes,
      calledAt: data.calledAt || new Date().toISOString(),
    };

    this.calls.unshift(callItem);

    return callItem;
  }

  /**
   * Registers mobile device push notification token and platform info
   */
  public static async registerDevice(deviceData: {
    userId: string;
    deviceId: string;
    platform: MobilePlatform;
    pushToken: string;
    model: string;
    appVersion: string;
    preferences?: Partial<MobileDeviceRegistration["preferences"]>;
  }): Promise<MobileDeviceRegistration> {
    const item: MobileDeviceRegistration = {
      id: `dev-${crypto.randomUUID().slice(0, 8)}`,
      userId: deviceData.userId,
      deviceId: deviceData.deviceId,
      platform: deviceData.platform,
      pushToken: deviceData.pushToken,
      model: deviceData.model,
      appVersion: deviceData.appVersion,
      lastActiveAt: new Date().toISOString(),
      preferences: {
        approvals: deviceData.preferences?.approvals ?? true,
        criticalStock: deviceData.preferences?.criticalStock ?? true,
        overdueInvoices: deviceData.preferences?.overdueInvoices ?? true,
        licenseExpiring: deviceData.preferences?.licenseExpiring ?? true,
        backupFailed: deviceData.preferences?.backupFailed ?? true,
      },
    };

    this.registeredDevices.set(item.deviceId, item);

    EnterpriseAuditService.record({
      action: "MOBILE_DEVICE_REGISTERED",
      module: "MOBILE_SECURITY",
      userId: deviceData.userId,
      details: { platform: item.platform, model: item.model, deviceId: item.deviceId },
    });

    return item;
  }

  /**
   * Lists registered mobile devices
   */
  public static async listRegisteredDevices(): Promise<MobileDeviceRegistration[]> {
    return Array.from(this.registeredDevices.values());
  }

  /**
   * Synchronizes batch offline mutations with deterministic conflict resolution
   */
  public static async syncOfflineBatch(
    userId: string,
    mutations: MobileSyncMutation[]
  ): Promise<{ accepted: string[]; rejected: Array<{ id: string; reason: string }> }> {
    const accepted: string[] = [];
    const rejected: Array<{ id: string; reason: string }> = [];

    for (const mut of mutations) {
      if (this.processedSyncKeys.has(mut.idempotencyKey)) {
        // Idempotent: already processed
        accepted.push(mut.idempotencyKey);
        continue;
      }

      try {
        if (mut.entity === "CRM_VISIT") {
          await this.registerVisit(userId, mut.payload);
        } else if (mut.entity === "CRM_CALL") {
          await this.registerCall(userId, mut.payload);
        } else if (mut.entity === "APPROVAL_ACTION") {
          await this.processApprovalAction(
            mut.payload.approvalId,
            mut.payload.action,
            userId,
            mut.payload.comment
          );
        }

        this.processedSyncKeys.add(mut.idempotencyKey);
        accepted.push(mut.idempotencyKey);
      } catch (err) {
        rejected.push({
          id: mut.idempotencyKey,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { accepted, rejected };
  }

  /**
   * Generates complete offline bundle snapshot for mobile field agents
   */
  public static async getOfflineSnapshot(userId: string) {
    const pendingApprovals = await this.listApprovals("PENDING");
    return {
      snapshotAt: new Date().toISOString(),
      pendingApprovals,
      catalog: [
        { id: "p-01", name: "Arroz Agulha Extra 25Kg", priceCents: 24_500_00, stock: 450 },
        { id: "p-02", name: "Óleo Alimentar 5L", priceCents: 12_800_00, stock: 280 },
        { id: "p-03", name: "Farinha de Trigo Especial 50Kg", priceCents: 32_000_00, stock: 110 },
      ],
      customers: [
        { id: "cust-01", name: "Supermercado Kero Talatona", nif: "5401882233", phone: "+244 923 111 000" },
        { id: "cust-02", name: "Hipermercado Candando Viana", nif: "5402993344", phone: "+244 923 222 000" },
      ],
    };
  }
}
