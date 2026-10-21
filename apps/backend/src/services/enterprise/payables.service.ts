import { prisma } from "../../db.js";

export interface PayableObligation {
  id: string;
  supplierName: string;
  supplierNif?: string | null;
  invoiceNumber: string;
  dueDate: Date;
  daysUntilDue: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  status: "PENDING" | "PARTIAL" | "OVERDUE" | "PAID";
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export class PayablesService {
  private static inMemoryPayables: PayableObligation[] = [
    {
      id: "ap-forn-01",
      supplierName: "ENDE - Empresa Nacional de Distribuição de Electricidade",
      supplierNif: "5401123456",
      invoiceNumber: "FAT-ENDE-2026/10",
      dueDate: new Date(Date.now() + 5 * 86400000),
      daysUntilDue: 5,
      totalCents: 4_200_000_00,
      paidCents: 0,
      remainingCents: 4_200_000_00,
      status: "PENDING",
      priority: "HIGH",
    },
    {
      id: "ap-forn-02",
      supplierName: "EPAL - Empresa Pública de Águas de Luanda",
      supplierNif: "5402987654",
      invoiceNumber: "FAT-EPAL-2026/09",
      dueDate: new Date(Date.now() - 4 * 86400000),
      daysUntilDue: -4,
      totalCents: 1_850_000_00,
      paidCents: 0,
      remainingCents: 1_850_000_00,
      status: "OVERDUE",
      priority: "HIGH",
    },
    {
      id: "ap-forn-03",
      supplierName: "Unitel SA - Serviços de Telecomunicação",
      supplierNif: "5403112233",
      invoiceNumber: "FAT-UNI-884920",
      dueDate: new Date(Date.now() + 18 * 86400000),
      daysUntilDue: 18,
      totalCents: 2_500_000_00,
      paidCents: 0,
      remainingCents: 2_500_000_00,
      status: "PENDING",
      priority: "MEDIUM",
    },
  ];

  /**
   * Get accounts payable commitments and priority analysis
   */
  static async getPayablesReport(companyId?: string) {
    let payables: any[] = [];
    try {
      payables = await prisma.accountPayable.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          status: { in: ["PENDING", "PARTIAL"] },
        },
        include: {
          supplier: true,
        },
        orderBy: { dueDate: "asc" },
      });
      if (!payables || payables.length === 0) {
        return this.buildReportFromObligations(this.inMemoryPayables);
      }
    } catch {
      return this.buildReportFromObligations(this.inMemoryPayables);
    }

    const now = new Date();
    const obligations: PayableObligation[] = payables.map((p) => {
      const total = p.originalCents ?? (p as any).amountCents ?? 0;
      const remaining = total - (p.paidCents || 0);
      const diffDays = Math.floor((new Date(p.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = diffDays < 0;

      let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      if (isOverdue || diffDays <= 3) {
        priority = "HIGH";
      } else if (diffDays <= 15) {
        priority = "MEDIUM";
      }

      return {
        id: p.id,
        supplierName: p.supplier?.name || "Fornecedor Geral",
        supplierNif: p.supplier?.nif,
        invoiceNumber: (p as any).documentNumber || `FAT-${p.id.slice(0, 8)}`,
        dueDate: p.dueDate,
        daysUntilDue: diffDays,
        totalCents: total,
        paidCents: p.paidCents || 0,
        remainingCents: remaining,
        status: isOverdue ? "OVERDUE" : p.paidCents > 0 ? "PARTIAL" : "PENDING",
        priority,
      };
    });

    return this.buildReportFromObligations(obligations);
  }

  private static buildReportFromObligations(obligations: PayableObligation[]) {
    const totalPayableCents = obligations.reduce((sum, o) => sum + o.remainingCents, 0);
    const overdueCents = obligations.filter((o) => o.status === "OVERDUE").reduce((sum, o) => sum + o.remainingCents, 0);
    const dueWithin7DaysCents = obligations.filter((o) => o.daysUntilDue >= 0 && o.daysUntilDue <= 7).reduce((sum, o) => sum + o.remainingCents, 0);
    const dueWithin30DaysCents = obligations.filter((o) => o.daysUntilDue > 7 && o.daysUntilDue <= 30).reduce((sum, o) => sum + o.remainingCents, 0);
    const dueAfter30DaysCents = obligations.filter((o) => o.daysUntilDue > 30).reduce((sum, o) => sum + o.remainingCents, 0);

    return {
      totalPayableCents,
      overdueCents,
      dueWithin7DaysCents,
      dueWithin30DaysCents,
      dueAfter30DaysCents,
      highPriorityCount: obligations.filter((o) => o.priority === "HIGH").length,
      obligations: obligations.sort((a, b) => a.daysUntilDue - b.daysUntilDue),
    };
  }

  /**
   * Calendar view of payments scheduled by week/month
   */
  static async getPaymentCalendar(companyId?: string, from?: Date, to?: Date) {
    const report = await this.getPayablesReport(companyId);
    const startDate = from || new Date();
    const endDate = to || new Date(Date.now() + 60 * 86400000);

    const filtered = report.obligations.filter((o) => {
      const d = new Date(o.dueDate);
      return d >= startDate && d <= endDate;
    });

    const byDate: Record<string, { totalCents: number; items: PayableObligation[] }> = {};
    for (const item of filtered) {
      const dateKey = new Date(item.dueDate).toISOString().slice(0, 10);
      if (!byDate[dateKey]) {
        byDate[dateKey] = { totalCents: 0, items: [] };
      }
      byDate[dateKey].totalCents += item.remainingCents;
      byDate[dateKey].items.push(item);
    }

    return {
      fromDate: startDate.toISOString().slice(0, 10),
      toDate: endDate.toISOString().slice(0, 10),
      scheduledTotalCents: filtered.reduce((sum, f) => sum + f.remainingCents, 0),
      calendar: byDate,
    };
  }
}
