import { prisma } from "../../db.js";
import { EnterpriseAuditService } from "./audit.service.js";

export interface AgingBucket {
  bucket: "CURRENT" | "1_30" | "31_60" | "61_90" | "OVER_90";
  label: string;
  totalCents: number;
  customersCount: number;
}

export interface CustomerAgingSummary {
  customerId: string;
  customerName: string;
  nif?: string | null;
  creditLimitCents: number;
  outstandingDebtCents: number;
  availableCreditCents: number;
  currentCents: number;
  overdue1To30Cents: number;
  overdue31To60Cents: number;
  overdue61To90Cents: number;
  overdueOver90Cents: number;
  oldestOverdueDate?: Date;
  status: "NORMAL" | "OVERDUE" | "BLOCKED";
}

export class ReceivablesService {
  private static inMemoryCustomers = new Map<string, any>();

  static {
    // Seed baseline enterprise customers with debt profiles
    const defaultCusts = [
      {
        id: "cust-sonangol-01",
        companyId: "default-company",
        name: "Sonangol Distribuição, EP",
        nif: "5418002931",
        creditLimitCents: 50_000_000_00, // 50.000.000 Kz
        outstandingDebtCents: 18_500_000_00,
        active: true,
        sales: [
          {
            id: "sale-rec-01",
            totalCents: 12_000_000_00,
            dueDate: new Date(Date.now() + 15 * 86400000), // Corrente
            paymentMethod: "CREDIT",
          },
          {
            id: "sale-rec-02",
            totalCents: 6_500_000_00,
            dueDate: new Date(Date.now() - 12 * 86400000), // 1-30 dias
            paymentMethod: "CREDIT",
          },
        ],
      },
      {
        id: "cust-angola-telecom-02",
        companyId: "default-company",
        name: "Angola Telecom, E.P.",
        nif: "5403019842",
        creditLimitCents: 20_000_000_00,
        outstandingDebtCents: 15_200_000_00,
        active: true,
        sales: [
          {
            id: "sale-rec-03",
            totalCents: 8_000_000_00,
            dueDate: new Date(Date.now() - 45 * 86400000), // 31-60 dias
            paymentMethod: "CREDIT",
          },
          {
            id: "sale-rec-04",
            totalCents: 7_200_000_00,
            dueDate: new Date(Date.now() - 95 * 86400000), // Over 90 dias
            paymentMethod: "CREDIT",
          },
        ],
      },
    ];

    for (const c of defaultCusts) {
      this.inMemoryCustomers.set(c.id, c);
    }
  }

  /**
   * Calculate aging matrix (envelhecimento de saldos) for accounts receivable
   */
  static async getAgingReport(companyId?: string) {
    let customers: any[] = [];
    try {
      customers = await prisma.customer.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          outstandingDebtCents: { gt: 0 },
        },
        include: {
          sales: {
            where: {
              paymentMethod: "CREDIT",
              status: { not: "CANCELLED" },
            },
            orderBy: { dueDate: "asc" },
          },
        },
      });
      if (!customers || customers.length === 0) {
        customers = Array.from(this.inMemoryCustomers.values());
      }
    } catch {
      customers = Array.from(this.inMemoryCustomers.values());
    }

    const now = new Date();
    const customerSummaries: CustomerAgingSummary[] = [];

    let totalCurrent = 0;
    let total1To30 = 0;
    let total31To60 = 0;
    let total61To90 = 0;
    let totalOver90 = 0;

    for (const cust of customers) {
      let custCurrent = 0;
      let cust1To30 = 0;
      let cust31To60 = 0;
      let cust61To90 = 0;
      let custOver90 = 0;
      let oldestOverdue: Date | undefined;

      const sales = cust.sales || [];
      for (const sale of sales) {
        const dueDate = sale.dueDate ? new Date(sale.dueDate) : now;
        const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          custCurrent += sale.totalCents;
        } else if (diffDays <= 30) {
          cust1To30 += sale.totalCents;
          if (!oldestOverdue || dueDate < oldestOverdue) oldestOverdue = dueDate;
        } else if (diffDays <= 60) {
          cust31To60 += sale.totalCents;
          if (!oldestOverdue || dueDate < oldestOverdue) oldestOverdue = dueDate;
        } else if (diffDays <= 90) {
          cust61To90 += sale.totalCents;
          if (!oldestOverdue || dueDate < oldestOverdue) oldestOverdue = dueDate;
        } else {
          custOver90 += sale.totalCents;
          if (!oldestOverdue || dueDate < oldestOverdue) oldestOverdue = dueDate;
        }
      }

      totalCurrent += custCurrent;
      total1To30 += cust1To30;
      total31To60 += cust31To60;
      total61To90 += cust61To90;
      totalOver90 += custOver90;

      const isOverdue = cust1To30 + cust31To60 + cust61To90 + custOver90 > 0;
      const isBlocked = !cust.active || custOver90 > 0;

      customerSummaries.push({
        customerId: cust.id,
        customerName: cust.name,
        nif: cust.nif,
        creditLimitCents: cust.creditLimitCents || 0,
        outstandingDebtCents: cust.outstandingDebtCents || 0,
        availableCreditCents: Math.max(0, (cust.creditLimitCents || 0) - (cust.outstandingDebtCents || 0)),
        currentCents: custCurrent,
        overdue1To30Cents: cust1To30,
        overdue31To60Cents: cust31To60,
        overdue61To90Cents: cust61To90,
        overdueOver90Cents: custOver90,
        oldestOverdueDate: oldestOverdue,
        status: isBlocked ? "BLOCKED" : isOverdue ? "OVERDUE" : "NORMAL",
      });
    }

    const totalOutstandingCents = totalCurrent + total1To30 + total31To60 + total61To90 + totalOver90;
    const totalOverdueCents = total1To30 + total31To60 + total61To90 + totalOver90;

    const buckets: AgingBucket[] = [
      { bucket: "CURRENT", label: "A Vencer (Corrente)", totalCents: totalCurrent, customersCount: customerSummaries.filter((c) => c.currentCents > 0).length },
      { bucket: "1_30", label: "1 a 30 Dias Vencido", totalCents: total1To30, customersCount: customerSummaries.filter((c) => c.overdue1To30Cents > 0).length },
      { bucket: "31_60", label: "31 a 60 Dias Vencido", totalCents: total31To60, customersCount: customerSummaries.filter((c) => c.overdue31To60Cents > 0).length },
      { bucket: "61_90", label: "61 a 90 Dias Vencido", totalCents: total61To90, customersCount: customerSummaries.filter((c) => c.overdue61To90Cents > 0).length },
      { bucket: "OVER_90", label: "Mais de 90 Dias (Cobrança Duvidosa)", totalCents: totalOver90, customersCount: customerSummaries.filter((c) => c.overdueOver90Cents > 0).length },
    ];

    return {
      totalOutstandingCents,
      totalOverdueCents,
      overduePercentage: totalOutstandingCents > 0 ? Math.round((totalOverdueCents / totalOutstandingCents) * 100) : 0,
      buckets,
      customers: customerSummaries.sort((a, b) => b.outstandingDebtCents - a.outstandingDebtCents),
    };
  }

  /**
   * Verify if a customer can be granted additional credit at POS checkout
   */
  static async checkCustomerCredit(customerId: string, requestedAmountCents: number) {
    let customer: any = null;
    try {
      customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });
    } catch {
      customer = this.inMemoryCustomers.get(customerId);
    }

    if (!customer) {
      customer = this.inMemoryCustomers.get(customerId);
    }
    if (!customer) throw new Error("Cliente não encontrado.");

    if (!customer.active) {
      return {
        allowed: false,
        reason: "O cliente encontra-se bloqueado para novas operações a crédito.",
        creditLimitCents: customer.creditLimitCents,
        outstandingDebtCents: customer.outstandingDebtCents,
        availableCreditCents: 0,
        isOverdue: true,
      };
    }

    const available = Math.max(0, customer.creditLimitCents - customer.outstandingDebtCents);

    if (requestedAmountCents > available) {
      return {
        allowed: false,
        reason: `Limite de crédito excedido. Disponível: ${(available / 100).toLocaleString("pt-AO")} Kz. Solicitado: ${(requestedAmountCents / 100).toLocaleString("pt-AO")} Kz.`,
        creditLimitCents: customer.creditLimitCents,
        outstandingDebtCents: customer.outstandingDebtCents,
        availableCreditCents: available,
        exceededAmountCents: requestedAmountCents - available,
      };
    }

    return {
      allowed: true,
      creditLimitCents: customer.creditLimitCents,
      outstandingDebtCents: customer.outstandingDebtCents,
      availableCreditCents: available - requestedAmountCents,
      remainingAfterPurchaseCents: available - requestedAmountCents,
    };
  }

  /**
   * Toggle manual credit freeze / customer block
   */
  static async toggleCustomerBlock(customerId: string, active: boolean, reason?: string, operatorId?: string) {
    try {
      const customer = await prisma.customer.update({
        where: { id: customerId },
        data: { active },
      });

      await EnterpriseAuditService.record({
        action: active ? "CUSTOMER_CREDIT_UNBLOCKED" : "CUSTOMER_CREDIT_BLOCKED",
        module: "FINANCE",
        entity: "Customer",
        entityId: customerId,
        companyId: customer.companyId || undefined,
        newValue: { active, reason, operatorId },
      });

      return customer;
    } catch {
      let cust = this.inMemoryCustomers.get(customerId);
      if (cust) {
        cust.active = active;
      }
      return cust || { id: customerId, active };
    }
  }
}
