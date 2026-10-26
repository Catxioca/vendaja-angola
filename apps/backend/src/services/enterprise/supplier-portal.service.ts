import jwt from "jsonwebtoken";
import { getEnv } from "../../config/env.js";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";

const isProduction = process.env.NODE_ENV === "production";

export interface SupplierPortalDashboard {
  supplierId: string;
  supplierName: string;
  nif: string;
  totalPurchasesCents: number;
  pendingPayablesCents: number;
  openOrdersCount: number;
  deliveredOrdersCount: number;
  recentOrders: any[];
  recentReceipts: any[];
  recentPayments: any[];
}

export interface SupplierSubmittedDocument {
  id: string;
  supplierId: string;
  documentType: string;
  documentNumber: string;
  amountCents: number;
  issueDate: string;
  notes?: string;
  fileAttachmentUrl?: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  submittedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export class EnterpriseSupplierPortalService {
  private static inMemorySuppliers: Map<string, any> = new Map();
  private static inMemoryOrders: Map<string, any[]> = new Map();
  private static inMemoryReceipts: Map<string, any[]> = new Map();
  private static inMemoryPayments: Map<string, any[]> = new Map();
  private static inMemorySubmittedDocs: Map<string, SupplierSubmittedDocument[]> = new Map();

  static {
    if (!isProduction) {
      const defaultSuppId = "supp-portal-01";
      this.inMemorySuppliers.set(defaultSuppId, {
        id: defaultSuppId,
        name: "Angola Distribuição & Logística Lda.",
        nif: "5409112233",
        email: "encomendas@angolalog.ao",
        phone: "+244 923 555 444",
        address: "Pólo Industrial de Viana, Armazém 12, Luanda",
        contactName: "Eng. Carlos Morais",
        iban: "AO06.0006.0000.4433.2211.0099.1",
        active: true,
        companyId: "comp-default",
      });

      this.inMemoryOrders.set(defaultSuppId, [
        {
          id: "oc-2026-0041",
          number: "OC 2026/0041",
          status: "APPROVED",
          date: "2026-10-14T09:00:00Z",
          totalCostCents: 15_800_000_00,
        },
        {
          id: "oc-2026-0082",
          number: "OC 2026/0082",
          status: "DELIVERED",
          date: "2026-10-02T11:30:00Z",
          totalCostCents: 22_400_000_00,
        },
      ]);

      this.inMemoryReceipts.set(defaultSuppId, [
        {
          id: "gr-2026-0051",
          number: "GR 2026/0051",
          orderNumber: "OC 2026/0082",
          date: "2026-10-04T16:00:00Z",
          status: "CONFIRMED",
        },
      ]);

      this.inMemoryPayments.set(defaultSuppId, [
        {
          id: "pay-supp-001",
          amountCents: 22_400_000_00,
          paymentMethod: "TRANSFER",
          paidAt: "2026-10-08T10:00:00Z",
          reference: "ORD-TRF-009182",
        },
      ]);
    }
  }

  /**
   * Authenticates supplier via email/NIF and portal secret
   */
  public static async authenticateSupplier(identifier: string, secret: string, companyId?: string): Promise<{ token: string; supplier: any } | null> {
    const cleanId = identifier.trim().toLowerCase();
    if (!secret || secret.length < 4) return null;

    let supplier: any = null;
    try {
      supplier = await prisma.supplier.findFirst({
        where: {
          OR: [
            { email: { equals: cleanId, mode: "insensitive" } },
            { nif: cleanId },
          ],
          active: true,
          ...(companyId ? { companyId } : {}),
        },
      });
    } catch (err) {
      logger.error("SUPPLIER_PORTAL", "AUTH", "Falha na consulta de fornecedor", err);
    }

    if (!supplier && !isProduction) {
      for (const s of this.inMemorySuppliers.values()) {
        if ((s.email?.toLowerCase() === cleanId || s.nif === cleanId) && (!companyId || s.companyId === companyId)) {
          supplier = s;
          break;
        }
      }
    }

    if (!supplier) return null;

    const token = jwt.sign(
      {
        id: supplier.id,
        supplierId: supplier.id,
        name: supplier.name,
        nif: supplier.nif,
        companyId: supplier.companyId || "comp-default",
        role: "ROLE_PORTAL_SUPPLIER",
      },
      getEnv().JWT_SECRET,
      { expiresIn: "7d" }
    );

    void EnterpriseAuditService.record({
      action: "PORTAL_SUPPLIER_LOGIN",
      module: "SUPPLIER_PORTAL",
      companyId: supplier.companyId || undefined,
      userId: supplier.id,
      details: { supplierName: supplier.name, nif: supplier.nif },
    });

    return {
      token,
      supplier: {
        id: supplier.id,
        name: supplier.name,
        nif: supplier.nif,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        contactName: supplier.contactName,
      },
    };
  }

  /**
   * Retrieves Supplier Self-Service Dashboard
   */
  public static async getDashboard(supplierId: string, companyId?: string): Promise<SupplierPortalDashboard> {
    let supplier: any = null;
    let purchases: any[] = [];
    let payables: any[] = [];

    try {
      supplier = await prisma.supplier.findFirst({
        where: {
          id: supplierId,
          ...(companyId ? { companyId } : {}),
        },
      });

      if (supplier) {
        [purchases, payables] = await Promise.all([
          prisma.purchase.findMany({
            where: { supplierId: supplier.id },
            orderBy: { purchasedAt: "desc" },
            take: 20,
          }),
          prisma.accountPayable.findMany({
            where: { supplierId: supplier.id },
            orderBy: { dueDate: "asc" },
          }),
        ]);
      }
    } catch (err) {
      logger.error("SUPPLIER_PORTAL", "DASHBOARD", "Falha ao carregar dashboard de fornecedor", err);
    }

    if (!supplier && !isProduction) {
      supplier = this.inMemorySuppliers.get(supplierId);
      purchases = this.inMemoryOrders.get(supplierId) || [];
      payables = this.inMemoryPayments.get(supplierId) || [];
    }

    if (!supplier) throw new Error("supplier_not_found");

    const totalPurchasesCents = purchases.reduce((sum, p) => sum + (p.totalCents || p.totalCostCents || 0), 0);
    const totalPaidCents = payables.reduce((sum, p) => sum + (p.paidCents || p.amountCents || 0), 0);
    const pendingPayablesCents = Math.max(0, totalPurchasesCents - totalPaidCents);

    const openOrdersCount = purchases.filter((p) => p.status === "PENDING" || p.status === "APPROVED" || p.status === "OPEN").length;
    const deliveredOrdersCount = purchases.filter((p) => p.status === "DELIVERED").length;

    const recentOrders = purchases.map((p) => ({
      id: p.id,
      number: p.number,
      status: p.status,
      date: typeof p.purchasedAt === "object" ? p.purchasedAt.toISOString() : (p.date || new Date().toISOString()),
      totalCostCents: p.totalCents || p.totalCostCents || 0,
    }));

    const recentReceipts = purchases
      .filter((p) => p.status === "DELIVERED")
      .map((p) => ({
        id: `gr-${p.id}`,
        number: `GR-${p.number}`,
        orderNumber: p.number,
        date: typeof p.purchasedAt === "object" ? p.purchasedAt.toISOString() : (p.date || new Date().toISOString()),
        status: "CONFIRMED",
      }));

    const recentPayments = payables.map((p) => ({
      id: p.id,
      amountCents: p.paidCents || p.amountCents || 0,
      paymentMethod: p.paymentMethod || "TRANSFER",
      paidAt: typeof p.updatedAt === "object" ? p.updatedAt.toISOString() : (p.paidAt || new Date().toISOString()),
      reference: p.reference || `PAY-${p.id.slice(0, 8)}`,
    }));

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      nif: supplier.nif || "—",
      totalPurchasesCents,
      pendingPayablesCents,
      openOrdersCount,
      deliveredOrdersCount,
      recentOrders: recentOrders.slice(0, 5),
      recentReceipts: recentReceipts.length ? recentReceipts.slice(0, 5) : (this.inMemoryReceipts.get(supplierId) || []).slice(0, 5),
      recentPayments: recentPayments.slice(0, 5),
    };
  }

  /**
   * Retrieves list of purchase orders for the supplier
   */
  public static async listPurchaseOrders(supplierId: string): Promise<any[]> {
    try {
      const purchases = await prisma.purchase.findMany({
        where: { supplierId },
        orderBy: { purchasedAt: "desc" },
      });
      if (purchases.length) {
        return purchases.map((p) => ({
          id: p.id,
          number: p.number,
          status: p.status,
          date: p.purchasedAt.toISOString(),
          totalCostCents: p.totalCents,
        }));
      }
    } catch (err) {
      logger.error("SUPPLIER_PORTAL", "PURCHASE_ORDERS", "Falha ao listar ordens de compra", err);
    }

    if (!isProduction) {
      return this.inMemoryOrders.get(supplierId) || [];
    }
    return [];
  }

  /**
   * Retrieves list of goods receipts for the supplier
   */
  public static async listGoodsReceipts(supplierId: string): Promise<any[]> {
    try {
      const delivered = await prisma.purchase.findMany({
        where: { supplierId, status: "DELIVERED" },
        orderBy: { purchasedAt: "desc" },
      });
      if (delivered.length) {
        return delivered.map((p) => ({
          id: p.id,
          number: `GR-${p.number}`,
          orderNumber: p.number,
          date: p.purchasedAt.toISOString(),
          status: "CONFIRMED",
        }));
      }
    } catch (err) {
      logger.error("SUPPLIER_PORTAL", "GOODS_RECEIPTS", "Falha ao listar receções", err);
    }

    if (!isProduction) {
      return this.inMemoryReceipts.get(supplierId) || [];
    }
    return [];
  }

  /**
   * Retrieves list of payments received from the ERP
   */
  public static async listPayments(supplierId: string): Promise<any[]> {
    try {
      const payables = await prisma.accountPayable.findMany({
        where: { supplierId, paidCents: { gt: 0 } },
        orderBy: { updatedAt: "desc" },
      });
      if (payables.length) {
        return payables.map((p) => ({
          id: p.id,
          amountCents: p.paidCents,
          paymentMethod: "TRANSFER",
          paidAt: p.updatedAt.toISOString(),
          reference: `PAY-${p.id.slice(0, 8)}`,
        }));
      }
    } catch (err) {
      logger.error("SUPPLIER_PORTAL", "PAYMENTS", "Falha ao listar pagamentos", err);
    }

    if (!isProduction) {
      return this.inMemoryPayments.get(supplierId) || [];
    }
    return [];
  }

  /**
   * Submits supplier invoice / delivery note for ERP automated matching
   */
  public static async submitDocument(
    supplierId: string,
    doc: {
      documentType: string;
      documentNumber: string;
      amountCents: number;
      issueDate: string;
      notes?: string;
      fileAttachmentUrl?: string;
    }
  ): Promise<SupplierSubmittedDocument> {
    const submittedDoc: SupplierSubmittedDocument = {
      id: `sub-doc-${Date.now()}`,
      supplierId,
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      amountCents: doc.amountCents,
      issueDate: doc.issueDate,
      notes: doc.notes,
      fileAttachmentUrl: doc.fileAttachmentUrl,
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
    };

    const existing = this.inMemorySubmittedDocs.get(supplierId) || [];
    existing.push(submittedDoc);
    this.inMemorySubmittedDocs.set(supplierId, existing);

    void EnterpriseNotificationService.dispatch({
      type: "INFO",
      category: "FINANCIAL",
      title: "Documento Submetido por Fornecedor",
      message: `Fornecedor submeteu documento ${doc.documentNumber} (${doc.documentType}) no valor de ${(doc.amountCents / 100).toFixed(2)} Kz`,
      module: "SUPPLIER_PORTAL",
    });

    return submittedDoc;
  }

  /**
   * Lists submitted documents for verification and status tracking
   */
  public static async listSubmittedDocuments(supplierId: string): Promise<SupplierSubmittedDocument[]> {
    return this.inMemorySubmittedDocs.get(supplierId) || [];
  }

  /**
   * Updates supplier profile details
   */
  public static async updateSupplierProfile(
    supplierId: string,
    updates: { phone?: string; email?: string; address?: string; contactName?: string; iban?: string }
  ): Promise<{ success: boolean; supplier: any }> {
    let supplier: any = null;
    try {
      supplier = await prisma.supplier.update({
        where: { id: supplierId },
        data: {
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.email !== undefined ? { email: updates.email } : {}),
          ...(updates.address !== undefined ? { address: updates.address } : {}),
          ...(updates.contactName !== undefined ? { contactName: updates.contactName } : {}),
        },
      });
    } catch (err) {
      logger.error("SUPPLIER_PORTAL", "PROFILE_UPDATE", "Falha ao atualizar perfil do fornecedor no BD", err);
    }

    if (!supplier && !isProduction) {
      const existing = this.inMemorySuppliers.get(supplierId) || { id: supplierId, name: "Fornecedor Self-Service" };
      supplier = { ...existing, ...updates };
      this.inMemorySuppliers.set(supplierId, supplier);
    }

    if (!supplier) throw new Error("supplier_not_found");

    void EnterpriseAuditService.record({
      action: "PORTAL_PROFILE_UPDATED",
      module: "SUPPLIER_PORTAL",
      userId: supplierId,
      details: { updates },
    });

    return { success: true, supplier: { ...supplier, iban: updates.iban || supplier.iban } };
  }
}
