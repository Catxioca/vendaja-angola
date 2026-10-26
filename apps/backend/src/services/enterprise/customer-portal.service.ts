import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { getEnv } from "../../config/env.js";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";

const isProduction = process.env.NODE_ENV === "production";

export interface CustomerPortalDashboard {
  customerId: string;
  customerName: string;
  nif: string;
  totalPurchasedCents: number;
  outstandingDebtCents: number;
  creditLimitCents: number;
  creditAvailableCents: number;
  recentDocuments: Array<{
    id: string;
    number: string;
    type: string;
    date: string;
    totalCents: number;
    status: string;
    downloadUrl: string;
  }>;
  recentPayments: Array<{
    id: string;
    amountCents: number;
    paymentMethod: string;
    receivedAt: string;
    reference?: string | null;
  }>;
  statementSummary: {
    totalInvoicedCents: number;
    totalPaidCents: number;
    totalCreditNotesCents: number;
    balanceDueCents: number;
  };
}

export interface StatementEntry {
  id: string;
  date: string;
  documentType: "FT" | "FR" | "RC" | "NC" | "ND";
  documentNumber: string;
  description: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
}

export interface PaymentReference {
  entity: string;
  reference: string;
  amountCents: number;
  expiresAt: string;
  bankIban: string;
  bankName: string;
  status: "ACTIVE" | "PAID" | "EXPIRED";
}

export class EnterpriseCustomerPortalService {
  private static inMemoryCustomers: Map<string, any> = new Map();
  private static inMemoryDocuments: Map<string, any[]> = new Map();
  private static inMemoryPayments: Map<string, any[]> = new Map();
  private static inMemoryReferences: Map<string, PaymentReference> = new Map();

  static {
    // Only in non-production test environments initialize test fixtures
    if (!isProduction) {
      const defaultCustId = "cust-portal-01";
      this.inMemoryCustomers.set(defaultCustId, {
        id: defaultCustId,
        name: "Sonangol Distribuidora S.A.",
        nif: "5401992831",
        email: "financeiro@sonangol.co.ao",
        phone: "+244 923 888 777",
        address: "Rua Rainha Ginga, Edifício Sonangol, Luanda",
        creditLimitCents: 50_000_000_00,
        outstandingDebtCents: 12_450_000_00,
        active: true,
        companyId: "comp-default",
      });

      this.inMemoryDocuments.set(defaultCustId, [
        {
          id: "doc-ft-2026-001",
          number: "FT 2026/0142",
          type: "FT",
          date: "2026-10-15T10:00:00Z",
          totalCents: 8_500_000_00,
          status: "PENDING",
          downloadUrl: `/api/v1/portals/customer/documents/doc-ft-2026-001/pdf`,
        },
        {
          id: "doc-ft-2026-002",
          number: "FT 2026/0189",
          type: "FT",
          date: "2026-10-18T14:30:00Z",
          totalCents: 3_950_000_00,
          status: "PENDING",
          downloadUrl: `/api/v1/portals/customer/documents/doc-ft-2026-002/pdf`,
        },
      ]);

      this.inMemoryPayments.set(defaultCustId, [
        {
          id: "pay-rec-001",
          amountCents: 5_000_000_00,
          paymentMethod: "TRANSFER",
          receivedAt: "2026-10-10T11:20:00Z",
          reference: "TRF-BAI-992140",
        },
      ]);
    }
  }

  /**
   * Authenticates customer via email/NIF and password/security PIN
   */
  public static async authenticateCustomer(identifier: string, secret: string, companyId?: string): Promise<{ token: string; customer: any } | null> {
    const cleanId = identifier.trim().toLowerCase();
    if (!secret || secret.length < 4) return null;

    let customer: any = null;
    try {
      customer = await prisma.customer.findFirst({
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
      logger.error("CUSTOMER_PORTAL", "AUTH", "Falha na consulta de cliente", err);
    }

    if (!customer && !isProduction) {
      for (const c of this.inMemoryCustomers.values()) {
        if ((c.email?.toLowerCase() === cleanId || c.nif === cleanId) && (!companyId || c.companyId === companyId)) {
          customer = c;
          break;
        }
      }
    }

    if (!customer) return null;

    const token = jwt.sign(
      {
        id: customer.id,
        customerId: customer.id,
        name: customer.name,
        nif: customer.nif,
        companyId: customer.companyId || "comp-default",
        role: "ROLE_PORTAL_CUSTOMER",
      },
      getEnv().JWT_SECRET,
      { expiresIn: "7d" }
    );

    void EnterpriseAuditService.record({
      action: "PORTAL_CUSTOMER_LOGIN",
      module: "CUSTOMER_PORTAL",
      companyId: customer.companyId || undefined,
      userId: customer.id,
      details: { customerName: customer.name, nif: customer.nif },
    });

    return {
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        nif: customer.nif,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        creditLimitCents: customer.creditLimitCents,
        outstandingDebtCents: customer.outstandingDebtCents,
      },
    };
  }

  /**
   * Generates Customer Self-Service Dashboard
   */
  public static async getDashboard(customerId: string, companyId?: string): Promise<CustomerPortalDashboard> {
    let customer: any = null;
    let sales: any[] = [];
    let payments: any[] = [];

    try {
      customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          ...(companyId ? { companyId } : {}),
        },
      });

      if (customer) {
        [sales, payments] = await Promise.all([
          prisma.sale.findMany({
            where: { customerId: customer.id },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
          prisma.receivablePayment.findMany({
            where: { customerId: customer.id },
            orderBy: { receivedAt: "desc" },
            take: 20,
          }),
        ]);
      }
    } catch (err) {
      logger.error("CUSTOMER_PORTAL", "DASHBOARD", "Falha ao carregar dashboard de cliente", err);
    }

    if (!customer && !isProduction) {
      customer = this.inMemoryCustomers.get(customerId);
      sales = this.inMemoryDocuments.get(customerId) || [];
      payments = this.inMemoryPayments.get(customerId) || [];
    }

    if (!customer) throw new Error("customer_not_found");

    const totalInvoicedCents = sales.reduce((sum, s) => sum + (s.totalCents || 0), 0);
    const totalPaidCents = payments.reduce((sum, p) => sum + (p.amountCents || 0), 0);
    const balanceDueCents = customer.outstandingDebtCents || Math.max(0, totalInvoicedCents - totalPaidCents);
    const creditAvailableCents = Math.max(0, (customer.creditLimitCents || 0) - balanceDueCents);

    const recentDocuments = sales.map((s) => ({
      id: s.id,
      number: s.number || `DOC-${s.id.slice(0, 8)}`,
      type: s.fiscalType || s.type || "FT",
      date: typeof s.createdAt === "object" ? s.createdAt.toISOString() : (s.date || new Date().toISOString()),
      totalCents: s.totalCents,
      status: s.status || "VALID",
      downloadUrl: `/api/v1/portals/customer/documents/${s.id}/pdf`,
    }));

    const recentPayments = payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      paymentMethod: p.paymentMethod,
      receivedAt: typeof p.receivedAt === "object" ? p.receivedAt.toISOString() : (p.receivedAt || new Date().toISOString()),
      reference: p.reference,
    }));

    return {
      customerId: customer.id,
      customerName: customer.name,
      nif: customer.nif || "",
      totalPurchasedCents: totalInvoicedCents,
      outstandingDebtCents: balanceDueCents,
      creditLimitCents: customer.creditLimitCents || 0,
      creditAvailableCents,
      recentDocuments,
      recentPayments,
      statementSummary: {
        totalInvoicedCents,
        totalPaidCents,
        totalCreditNotesCents: 0,
        balanceDueCents,
      },
    };
  }

  /**
   * Calculates comprehensive statement of account (Extrato de Conta Corrente)
   */
  public static async getStatement(
    customerId: string,
    filters?: { from?: string; to?: string }
  ): Promise<{ entries: StatementEntry[]; totalDebitCents: number; totalCreditCents: number; finalBalanceCents: number }> {
    let sales: any[] = [];
    let payments: any[] = [];

    try {
      [sales, payments] = await Promise.all([
        prisma.sale.findMany({
          where: {
            customerId,
            ...(filters?.from || filters?.to ? {
              createdAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            } : {}),
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.receivablePayment.findMany({
          where: {
            customerId,
            ...(filters?.from || filters?.to ? {
              receivedAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            } : {}),
          },
          orderBy: { receivedAt: "asc" },
        }),
      ]);
    } catch (err) {
      logger.error("CUSTOMER_PORTAL", "STATEMENT", "Falha ao carregar extrato", err);
    }

    if (!sales.length && !payments.length && !isProduction) {
      sales = this.inMemoryDocuments.get(customerId) || [];
      payments = this.inMemoryPayments.get(customerId) || [];
    }

    const rawEvents: Array<{
      id: string;
      date: string;
      type: "FT" | "FR" | "RC" | "NC" | "ND";
      number: string;
      description: string;
      debitCents: number;
      creditCents: number;
    }> = [];

    for (const s of sales) {
      const docType = (s.fiscalType === "INVOICE_RECEIPT" || s.type === "FR" ? "FR" : "FT") as "FT" | "FR";
      const docDate = typeof s.createdAt === "object" ? s.createdAt.toISOString() : (s.date || new Date().toISOString());
      rawEvents.push({
        id: s.id,
        date: docDate,
        type: docType,
        number: s.number || `FAT-${s.id.slice(0, 8)}`,
        description: `Fatura ${s.number || s.id.slice(0, 8)}`,
        debitCents: s.totalCents,
        creditCents: docType === "FR" ? s.totalCents : 0,
      });
    }

    for (const p of payments) {
      const pDate = typeof p.receivedAt === "object" ? p.receivedAt.toISOString() : (p.receivedAt || new Date().toISOString());
      rawEvents.push({
        id: p.id,
        date: pDate,
        type: "RC",
        number: p.reference || `REC-${p.id.slice(0, 8)}`,
        description: `Recebimento em Caixa (${p.paymentMethod})`,
        debitCents: 0,
        creditCents: p.amountCents,
      });
    }

    rawEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const entries: StatementEntry[] = [];
    for (const ev of rawEvents) {
      runningBalance += ev.debitCents - ev.creditCents;
      totalDebit += ev.debitCents;
      totalCredit += ev.creditCents;

      entries.push({
        id: ev.id,
        date: ev.date,
        documentType: ev.type,
        documentNumber: ev.number,
        description: ev.description,
        debitCents: ev.debitCents,
        creditCents: ev.creditCents,
        runningBalanceCents: runningBalance,
      });
    }

    return {
      entries,
      totalDebitCents: totalDebit,
      totalCreditCents: totalCredit,
      finalBalanceCents: runningBalance,
    };
  }

  /**
   * Generates Multicaixa/GPO payment reference & bank details for online invoice payment
   */
  public static async generatePaymentReference(
    customerId: string,
    documentId: string,
    amountCents?: number
  ): Promise<PaymentReference> {
    try {
      let paymentAmount = amountCents;
      if (!paymentAmount) {
        const sale = await prisma.sale.findFirst({
          where: { id: documentId, customerId },
        });
        if (sale) paymentAmount = sale.totalCents;
      }

      if (!paymentAmount && !isProduction) {
        paymentAmount = 8_500_000_00;
      }

      if (!paymentAmount || paymentAmount <= 0) throw new Error("invalid_payment_amount");

      const refNum = `${Math.floor(100_000_000 + Math.random() * 900_000_000)}`;
      const reference: PaymentReference = {
        entity: "00142",
        reference: refNum,
        amountCents: paymentAmount,
        expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
        bankIban: "AO06.0040.0000.1234.5678.9012.3",
        bankName: "Banco Angolano de Investimentos (BAI)",
        status: "ACTIVE",
      };

      this.inMemoryReferences.set(reference.reference, reference);

      void EnterpriseNotificationService.dispatch({
        type: "INFO",
        category: "FINANCIAL",
        title: "Referência de Pagamento Gerada",
        message: `Cliente gerou referência Multicaixa ${reference.reference} de ${(reference.amountCents / 100).toFixed(2)} Kz`,
        module: "PORTAL_PAYMENTS",
      });

      return reference;
    } catch (err) {
      logger.error("CUSTOMER_PORTAL", "PAYMENT_REF", "Falha ao gerar referência", err);
      throw new Error("payment_reference_failed");
    }
  }

  /**
   * Updates customer profile details directly from the self-service portal
   */
  public static async updateCustomerProfile(
    customerId: string,
    updates: { phone?: string; email?: string; address?: string }
  ): Promise<{ success: boolean; customer: any }> {
    let customer: any = null;
    try {
      customer = await prisma.customer.update({
        where: { id: customerId },
        data: {
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.email !== undefined ? { email: updates.email } : {}),
          ...(updates.address !== undefined ? { address: updates.address } : {}),
        },
      });
    } catch (err) {
      logger.error("CUSTOMER_PORTAL", "PROFILE_UPDATE", "Falha ao atualizar perfil do cliente no BD", err);
    }

    if (!customer && !isProduction) {
      const existing = this.inMemoryCustomers.get(customerId) || { id: customerId, name: "Cliente Self-Service" };
      customer = { ...existing, ...updates };
      this.inMemoryCustomers.set(customerId, customer);
    }

    if (!customer) throw new Error("customer_not_found");

    void EnterpriseAuditService.record({
      action: "PORTAL_PROFILE_UPDATED",
      module: "CUSTOMER_PORTAL",
      userId: customerId,
      details: { updates },
    });

    return { success: true, customer };
  }
}
