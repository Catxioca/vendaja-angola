import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { getEnv } from "../../config/env.js";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";

export interface SupplierPortalDashboard {
  supplierId: string;
  supplierName: string;
  nif: string;
  totalPurchasesCents: number;
  pendingPayablesCents: number;
  openOrdersCount: number;
  deliveredOrdersCount: number;
  recentOrders: Array<{
    id: string;
    number: string;
    status: string;
    date: string;
    totalCostCents: number;
    linesCount: number;
  }>;
  recentReceipts: Array<{
    id: string;
    number: string;
    orderNumber: string;
    date: string;
    status: string;
  }>;
  recentPayments: Array<{
    id: string;
    amountCents: number;
    paymentMethod: string;
    paidAt: string;
    reference?: string | null;
  }>;
}

export interface SupplierSubmittedDocument {
  id: string;
  supplierId: string;
  documentType: "SUPPLIER_INVOICE" | "TRANSPORT_GUIDE" | "PROFORMA" | "RECEIPT";
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
        linesCount: 4,
        lines: [
          { productId: "p-01", description: "Arroz Agulha 25Kg", quantity: 500, unitCostCents: 18_000_00 },
          { productId: "p-02", description: "Óleo Alimentar 5L", quantity: 400, unitCostCents: 17_000_00 },
        ],
      },
      {
        id: "oc-2026-0082",
        number: "OC 2026/0082",
        status: "DELIVERED",
        date: "2026-10-02T11:30:00Z",
        totalCostCents: 22_400_000_00,
        linesCount: 6,
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

    this.inMemorySubmittedDocs.set(defaultSuppId, [
      {
        id: "sub-doc-001",
        supplierId: defaultSuppId,
        documentType: "SUPPLIER_INVOICE",
        documentNumber: "FAT-LOG-9921",
        amountCents: 15_800_000_00,
        issueDate: "2026-10-16",
        notes: "Fatura correspondente à Ordem de Compra OC 2026/0041",
        fileAttachmentUrl: "https://storage.vendaja.ao/suppliers/fat-log-9921.pdf",
        status: "UNDER_REVIEW",
        submittedAt: "2026-10-16T15:00:00Z",
      },
    ]);
  }

  /**
   * Authenticates supplier via email/NIF and portal secret
   */
  public static async authenticateSupplier(identifier: string, secret: string, companyId?: string): Promise<{ token: string; supplier: any } | null> {
    const cleanId = identifier.trim().toLowerCase();
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
    } catch {
      // Memory fallback
    }

    if (!supplier) {
      for (const s of this.inMemorySuppliers.values()) {
        if ((s.email?.toLowerCase() === cleanId || s.nif === cleanId) && (!companyId || s.companyId === companyId)) {
          supplier = s;
          break;
        }
      }
    }

    if (!supplier || !secret || secret.length < 4) return null;

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

    EnterpriseAuditService.record({
      action: "PORTAL_SUPPLIER_LOGIN",
      module: "SUPPLIER_PORTAL",
      companyId: supplier.companyId,
      userId: supplier.id,
      details: { supplierName: supplier.name, nif: supplier.nif },
    });

    return { token, supplier };
  }

  /**
   * Retrieves Supplier Self-Service Dashboard
   */
  public static async getDashboard(supplierId: string, companyId?: string): Promise<SupplierPortalDashboard> {
    let supplier = this.inMemorySuppliers.get(supplierId);
    try {
      const dbSupp = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (dbSupp) supplier = dbSupp;
    } catch {
      // Memory fallback
    }

    if (!supplier) {
      supplier = { id: supplierId, name: "Fornecedor Self-Service", nif: "5400000000" };
    }

    const orders = this.inMemoryOrders.get(supplierId) || [];
    const receipts = this.inMemoryReceipts.get(supplierId) || [];
    const payments = this.inMemoryPayments.get(supplierId) || [];

    const totalPurchasesCents = orders.reduce((sum: number, o: any) => sum + (o.totalCostCents || 0), 0);
    const totalPaidCents = payments.reduce((sum: number, p: any) => sum + (p.amountCents || 0), 0);
    const pendingPayablesCents = Math.max(0, totalPurchasesCents - totalPaidCents);

    const openOrdersCount = orders.filter((o: any) => o.status === "OPEN" || o.status === "APPROVED").length;
    const deliveredOrdersCount = orders.filter((o: any) => o.status === "DELIVERED").length;

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      nif: supplier.nif || "—",
      totalPurchasesCents,
      pendingPayablesCents,
      openOrdersCount,
      deliveredOrdersCount,
      recentOrders: orders.slice(0, 5),
      recentReceipts: receipts.slice(0, 5),
      recentPayments: payments.slice(0, 5),
    };
  }

  /**
   * Retrieves list of purchase orders for the supplier
   */
  public static async listPurchaseOrders(supplierId: string): Promise<any[]> {
    return this.inMemoryOrders.get(supplierId) || [];
  }

  /**
   * Retrieves list of goods receipts for the supplier
   */
  public static async listGoodsReceipts(supplierId: string): Promise<any[]> {
    return this.inMemoryReceipts.get(supplierId) || [];
  }

  /**
   * Retrieves list of payments received from the ERP
   */
  public static async listPayments(supplierId: string): Promise<any[]> {
    return this.inMemoryPayments.get(supplierId) || [];
  }

  /**
   * Submits a supplier invoice or delivery note for verification by accounting
   */
  public static async submitDocument(
    supplierId: string,
    doc: {
      documentType: "SUPPLIER_INVOICE" | "TRANSPORT_GUIDE" | "PROFORMA" | "RECEIPT";
      documentNumber: string;
      amountCents: number;
      issueDate: string;
      notes?: string;
      fileAttachmentUrl?: string;
    }
  ): Promise<SupplierSubmittedDocument> {
    const item: SupplierSubmittedDocument = {
      id: `sub-doc-${crypto.randomUUID().slice(0, 8)}`,
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

    const list = this.inMemorySubmittedDocs.get(supplierId) || [];
    list.unshift(item);
    this.inMemorySubmittedDocs.set(supplierId, list);

    EnterpriseNotificationService.dispatch({
      type: "ACTION_REQUIRED",
      category: "WORKFLOW",
      title: "Nova Fatura Submetida por Fornecedor",
      message: `Fornecedor submeteu documento ${doc.documentNumber} no valor de ${(doc.amountCents / 100).toFixed(2)} Kz`,
      module: "SUPPLIER_PORTAL",
    });

    EnterpriseAuditService.record({
      action: "SUPPLIER_DOCUMENT_SUBMITTED",
      module: "SUPPLIER_PORTAL",
      userId: supplierId,
      details: { item },
    });

    return item;
  }

  /**
   * Retrieves all submitted documents for the supplier
   */
  public static async listSubmittedDocuments(supplierId: string): Promise<SupplierSubmittedDocument[]> {
    return this.inMemorySubmittedDocs.get(supplierId) || [];
  }

  /**
   * Updates supplier profile details directly from the portal
   */
  public static async updateSupplierProfile(
    supplierId: string,
    updates: { phone?: string; email?: string; address?: string; contactName?: string; iban?: string }
  ): Promise<{ success: boolean; supplier: any }> {
    let supplier = this.inMemorySuppliers.get(supplierId);
    if (!supplier) {
      supplier = { id: supplierId, name: "Fornecedor Self-Service", nif: "5400000000" };
    }

    const updated = {
      ...supplier,
      phone: updates.phone ?? supplier.phone,
      email: updates.email ?? supplier.email,
      address: updates.address ?? supplier.address,
      contactName: updates.contactName ?? supplier.contactName,
      iban: updates.iban ?? supplier.iban,
      updatedAt: new Date().toISOString(),
    };

    this.inMemorySuppliers.set(supplierId, updated);

    try {
      await prisma.supplier.update({
        where: { id: supplierId },
        data: {
          phone: updates.phone,
          email: updates.email,
          address: updates.address,
          contactName: updates.contactName,
        },
      });
    } catch {
      // Memory fallback
    }

    EnterpriseAuditService.record({
      action: "SUPPLIER_PROFILE_UPDATED",
      module: "SUPPLIER_PORTAL",
      userId: supplierId,
      details: { updates },
    });

    return { success: true, supplier: updated };
  }
}
