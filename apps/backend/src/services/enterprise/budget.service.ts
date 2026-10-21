import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { EnterpriseAuditService } from "./audit.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";

export interface BudgetLineInput {
  accountCode: string;
  accountName: string;
  category: "REVENUE" | "OPERATING_EXPENSE" | "CAPEX" | "FINANCIAL" | "TAX";
  budgetedAmountCents: number;
}

export interface CreateBudgetInput {
  companyId?: string;
  branchId?: string;
  code?: string;
  name: string;
  year: number;
  type?: string;
  costCenterId?: string;
  projectId?: string;
  alertThresholdPercent?: number;
  lines: BudgetLineInput[];
}

export class BudgetService {
  private static inMemoryBudgets = new Map<string, any>();
  private static inMemoryLines = new Map<string, any[]>();

  static {
    // Seed baseline enterprise budget
    const demoBudgetId = "bg-2026-geral";
    const demoBudget = {
      id: demoBudgetId,
      companyId: "default-company",
      code: "ORC-2026-GERAL",
      name: "Orçamento Geral de Exploração 2026",
      year: 2026,
      type: "ANNUAL",
      status: "APPROVED",
      totalBudgetedCents: 500_000_000_00,
      totalActualCents: 395_000_000_00,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date(),
    };

    const demoLines = [
      {
        id: "bgl-01",
        budgetId: demoBudgetId,
        accountCode: "61",
        description: "Custo das Mercadorias Vendidas (CMV)",
        accountName: "Custo das Mercadorias Vendidas (CMV)",
        category: "OPERATING_EXPENSE",
        budgetedCents: 200_000_000_00,
        actualCents: 165_000_000_00,
        budgetedAmountCents: 200_000_000_00,
        actualAmountCents: 165_000_000_00,
      },
      {
        id: "bgl-02",
        budgetId: demoBudgetId,
        accountCode: "62",
        description: "Fornecimentos e Serviços de Terceiros (FST)",
        accountName: "Fornecimentos e Serviços de Terceiros (FST)",
        category: "OPERATING_EXPENSE",
        budgetedCents: 120_000_000_00,
        actualCents: 124_000_000_00,
        budgetedAmountCents: 120_000_000_00,
        actualAmountCents: 124_000_000_00,
      },
      {
        id: "bgl-03",
        budgetId: demoBudgetId,
        accountCode: "63",
        description: "Gastos com o Pessoal (Salários & Encargos)",
        accountName: "Gastos com o Pessoal (Salários & Encargos)",
        category: "OPERATING_EXPENSE",
        budgetedCents: 150_000_000_00,
        actualCents: 98_000_000_00,
        budgetedAmountCents: 150_000_000_00,
        actualAmountCents: 98_000_000_00,
      },
      {
        id: "bgl-04",
        budgetId: demoBudgetId,
        accountCode: "71",
        description: "Vendas e Prestações de Serviços",
        accountName: "Vendas e Prestações de Serviços",
        category: "REVENUE",
        budgetedCents: 600_000_000_00,
        actualCents: 510_000_000_00,
        budgetedAmountCents: 600_000_000_00,
        actualAmountCents: 510_000_000_00,
      },
    ];

    this.inMemoryBudgets.set(demoBudgetId, demoBudget);
    this.inMemoryLines.set(demoBudgetId, demoLines);
  }

  /**
   * Create an annual or operational budget with lines
   */
  static async createBudget(input: CreateBudgetInput) {
    const totalBudgetedCents = input.lines.reduce((sum, l) => sum + l.budgetedAmountCents, 0);

    try {
      const budget = await prisma.budget.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId,
          name: input.name,
          year: input.year,
          type: input.type || "ANNUAL",
          costCenterId: input.costCenterId,
          totalBudgetedCents,
          totalActualCents: 0,
          status: "DRAFT",
          lines: {
            create: input.lines.map((l) => ({
              accountCode: l.accountCode,
              description: l.accountName,
              category: l.category,
              budgetedCents: l.budgetedAmountCents,
              actualCents: 0,
            })),
          },
        },
        include: { lines: true },
      });

      await EnterpriseAuditService.record({
        action: "BUDGET_CREATED",
        module: "FINANCE",
        entity: "Budget",
        entityId: budget.id,
        companyId: input.companyId,
        newValue: { name: budget.name, year: budget.year, totalBudgetedCents },
      });

      return Object.assign(budget, {
        code: input.code || `ORC-${budget.year}-${budget.id.slice(0, 6)}`,
        lines: budget.lines.map((l) => ({
          ...l,
          accountName: l.description,
          budgetedAmountCents: l.budgetedCents,
          actualAmountCents: l.actualCents,
        })),
      });
    } catch {
      const id = "bg-" + crypto.randomUUID();
      const code = input.code || `ORC-${input.year}-${id.slice(0, 6)}`;
      const budget = {
        id,
        companyId: input.companyId,
        branchId: input.branchId,
        code,
        name: input.name,
        year: input.year,
        type: input.type || "ANNUAL",
        costCenterId: input.costCenterId,
        projectId: input.projectId,
        totalBudgetedCents,
        totalActualCents: 0,
        status: "DRAFT",
        lines: input.lines.map((l) => ({
          id: "bgl-" + crypto.randomUUID(),
          budgetId: id,
          accountCode: l.accountCode,
          description: l.accountName,
          accountName: l.accountName,
          category: l.category,
          budgetedCents: l.budgetedAmountCents,
          actualCents: 0,
          budgetedAmountCents: l.budgetedAmountCents,
          actualAmountCents: 0,
        })),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.inMemoryBudgets.set(id, budget);
      this.inMemoryLines.set(id, budget.lines);
      return budget;
    }
  }

  /**
   * List all budgets
   */
  static async listBudgets(companyId?: string, year?: number) {
    try {
      const budgets = await prisma.budget.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          ...(year ? { year } : {}),
        },
        include: { lines: true },
        orderBy: { year: "desc" },
      });
      if (budgets && budgets.length > 0) {
        return budgets.map((b) =>
          Object.assign(b, {
            code: `ORC-${b.year}-${b.id.slice(0, 6)}`,
            lines: b.lines.map((l) => ({
              ...l,
              accountName: l.description,
              budgetedAmountCents: l.budgetedCents,
              actualAmountCents: l.actualCents,
            })),
          })
        );
      }
      return Array.from(this.inMemoryBudgets.values());
    } catch {
      return Array.from(this.inMemoryBudgets.values());
    }
  }

  /**
   * Update actual spent on budget line and check variance alerts
   */
  static async recordActual(companyId: string | undefined, accountCode: string, amountCents: number) {
    try {
      const currentYear = new Date().getFullYear();
      const budgets = await prisma.budget.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          year: currentYear,
          status: { in: ["APPROVED", "DRAFT", "ACTIVE"] },
        },
        include: { lines: true },
      });

      for (const b of budgets) {
        const line = b.lines.find((l) => l.accountCode === accountCode || accountCode.startsWith(l.accountCode));
        if (line) {
          const newActual = line.actualCents + amountCents;
          await prisma.budgetLine.update({
            where: { id: line.id },
            data: { actualCents: newActual },
          });

          await prisma.budget.update({
            where: { id: b.id },
            data: { totalActualCents: { increment: amountCents } },
          });

          const pct = Math.round((newActual / line.budgetedCents) * 100);
          if (pct >= 100) {
            EnterpriseNotificationService.dispatch({
              type: "CRITICAL",
              module: "FINANCE",
              title: `Orçamento Ultrapassado: ${line.description}`,
              message: `A rubrica ${line.accountCode} (${line.description}) atingiu ${pct}% da dotação orçamental prevista.`,
              category: "FINANCIAL",
              priority: "HIGH",
              companyId,
            });
          } else if (pct >= 80) {
            EnterpriseNotificationService.dispatch({
              type: "WARNING",
              module: "FINANCE",
              title: `Alerta Orçamental (80%): ${line.description}`,
              message: `A rubrica ${line.accountCode} consumiu ${pct}% da dotação disponível.`,
              category: "FINANCIAL",
              priority: "NORMAL",
              companyId,
            });
          }
        }
      }
    } catch {
      // In-memory fallback
      for (const [id, lines] of this.inMemoryLines.entries()) {
        const line = lines.find((l) => l.accountCode === accountCode || accountCode.startsWith(l.accountCode));
        if (line) {
          line.actualCents = (line.actualCents || 0) + amountCents;
          line.actualAmountCents = line.actualCents;
          const budget = this.inMemoryBudgets.get(id);
          if (budget) {
            budget.totalActualCents += amountCents;
          }
        }
      }
    }
  }

  /**
   * Detailed Variance Report (Orçado vs Realizado)
   */
  static async getVarianceReport(budgetId: string) {
    let budget: any = null;
    try {
      budget = await prisma.budget.findUnique({
        where: { id: budgetId },
        include: { lines: true },
      });
    } catch {
      budget = this.inMemoryBudgets.get(budgetId);
    }

    if (!budget) {
      budget = this.inMemoryBudgets.get(budgetId);
    }
    if (!budget) {
      budget = Array.from(this.inMemoryBudgets.values())[0];
    }
    if (!budget) throw new Error("Orçamento não encontrado.");

    const lines = budget.lines || this.inMemoryLines.get(budget.id) || [];

    const lineReports = lines.map((l: any) => {
      const budgeted = l.budgetedCents ?? l.budgetedAmountCents ?? 0;
      const actual = l.actualCents ?? l.actualAmountCents ?? 0;
      const name = l.description ?? l.accountName ?? l.accountCode;
      const varianceCents = budgeted - actual;
      const executionPct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;

      let status: "OK" | "WARNING" | "EXCEEDED" = "OK";
      if (executionPct >= 100) {
        status = "EXCEEDED";
      } else if (executionPct >= 80) {
        status = "WARNING";
      }

      return {
        lineId: l.id,
        accountCode: l.accountCode,
        accountName: name,
        category: l.category,
        budgetedAmountCents: budgeted,
        actualAmountCents: actual,
        varianceCents,
        executionPercentage: executionPct,
        status,
      };
    });

    const totalBudgetedCents = lines.reduce((sum: number, l: any) => sum + (l.budgetedCents ?? l.budgetedAmountCents ?? 0), 0);
    const totalActualCents = lines.reduce((sum: number, l: any) => sum + (l.actualCents ?? l.actualAmountCents ?? 0), 0);
    const overallExecutionPct = totalBudgetedCents > 0 ? Math.round((totalActualCents / totalBudgetedCents) * 100) : 0;

    return {
      budgetId: budget.id,
      code: budget.code || `ORC-${budget.year}-${budget.id.slice(0, 6)}`,
      name: budget.name,
      year: budget.year,
      totalBudgetedCents,
      totalActualCents,
      overallVarianceCents: totalBudgetedCents - totalActualCents,
      overallExecutionPercentage: overallExecutionPct,
      warningsCount: lineReports.filter((r: any) => r.status === "WARNING").length,
      exceededCount: lineReports.filter((r: any) => r.status === "EXCEEDED").length,
      lines: lineReports,
    };
  }
}
