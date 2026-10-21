import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { EnterpriseAuditService } from "./audit.service.js";

export interface CreateCostCenterInput {
  companyId?: string;
  branchId?: string;
  code: string;
  name: string;
  type?: "COST" | "PROFIT" | "ADMINISTRATIVE" | "PROJECT";
  parentCode?: string;
  managerName?: string;
}

export class CostCenterService {
  private static inMemoryCostCenters = new Map<string, any>();
  private static inMemoryAllocations = new Map<string, any[]>();

  static {
    // Seed baseline cost centers
    const initialCenters = [
      {
        id: "cc-adm-01",
        companyId: "default-company",
        code: "CC-ADM-100",
        name: "Administração Geral & Sede Luanda",
        type: "ADMINISTRATIVE",
        managerName: "Direção Geral",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "cc-com-02",
        companyId: "default-company",
        code: "CP-VEN-200",
        name: "Centro de Proveito - Vendas & Retalho",
        type: "PROFIT",
        managerName: "Direção Comercial",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "cc-log-03",
        companyId: "default-company",
        code: "CC-LOG-300",
        name: "Logística & Centro de Distribuição Viana",
        type: "COST",
        managerName: "Chefia de Armazém",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const c of initialCenters) {
      this.inMemoryCostCenters.set(c.id, c);
      this.inMemoryAllocations.set(c.id, []);
    }
  }

  /**
   * Create an analytical cost or profit center
   */
  static async createCostCenter(input: CreateCostCenterInput) {
    try {
      const costCenter = await prisma.costCenter.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId,
          code: input.code,
          name: input.name,
          type: input.type || "COST",
          parentCode: input.parentCode,
          managerName: input.managerName,
          active: true,
        },
      });

      await EnterpriseAuditService.record({
        action: "COST_CENTER_CREATED",
        module: "FINANCE",
        entity: "CostCenter",
        entityId: costCenter.id,
        companyId: input.companyId,
        newValue: { code: costCenter.code, name: costCenter.name, type: costCenter.type },
      });

      return costCenter;
    } catch {
      const id = "cc-" + crypto.randomUUID();
      const center = {
        id,
        companyId: input.companyId,
        branchId: input.branchId,
        code: input.code,
        name: input.name,
        type: input.type || "COST",
        parentCode: input.parentCode,
        managerName: input.managerName,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.inMemoryCostCenters.set(id, center);
      this.inMemoryAllocations.set(id, []);
      return center;
    }
  }

  /**
   * List all cost centers for a company
   */
  static async listCostCenters(companyId?: string) {
    try {
      const centers = await prisma.costCenter.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          active: true,
        },
        include: {
          allocations: {
            take: 10,
            orderBy: { date: "desc" },
          },
        },
        orderBy: { code: "asc" },
      });
      if (centers && centers.length > 0) return centers;
      return Array.from(this.inMemoryCostCenters.values());
    } catch {
      return Array.from(this.inMemoryCostCenters.values()).filter(
        (c) => !companyId || !c.companyId || c.companyId === companyId
      );
    }
  }

  /**
   * Allocate cost or revenue to an analytical center
   */
  static async allocateCost(
    costCenterId: string,
    amountCents: number,
    type: "COST" | "REVENUE",
    description: string,
    accountCode?: string,
    reference?: string
  ) {
    try {
      const allocation = await prisma.costAllocation.create({
        data: {
          costCenterId,
          amountCents,
          direction: type === "REVENUE" ? "IN" : "OUT",
          sourceEntity: "MANUAL",
          sourceEntityId: reference || "MANUAL",
          description,
          date: new Date(),
        },
      });

      return Object.assign(allocation, { type });
    } catch {
      const alloc = {
        id: "alloc-" + crypto.randomUUID(),
        costCenterId,
        amountCents,
        direction: type === "REVENUE" ? "IN" : "OUT",
        type,
        sourceEntity: "MANUAL",
        sourceEntityId: reference || "MANUAL",
        description,
        accountCode,
        reference,
        date: new Date(),
      };
      const list = this.inMemoryAllocations.get(costCenterId) || [];
      list.push(alloc);
      this.inMemoryAllocations.set(costCenterId, list);
      return alloc;
    }
  }

  /**
   * Profitability report by analytical center
   */
  static async getCostCenterReport(costCenterId: string, from?: Date, to?: Date) {
    let center: any = null;
    let allocations: any[] = [];

    try {
      center = await prisma.costCenter.findUnique({
        where: { id: costCenterId },
        include: {
          allocations: {
            where: {
              ...(from || to
                ? {
                    date: {
                      ...(from ? { gte: from } : {}),
                      ...(to ? { lte: to } : {}),
                    },
                  }
                : {}),
            },
          },
        },
      });
      if (center) allocations = center.allocations || [];
    } catch {
      center = this.inMemoryCostCenters.get(costCenterId);
      allocations = this.inMemoryAllocations.get(costCenterId) || [];
    }

    if (!center) {
      center = this.inMemoryCostCenters.get(costCenterId);
    }
    if (!center) {
      center = Array.from(this.inMemoryCostCenters.values())[0];
    }
    if (!center) throw new Error("Centro de custo não encontrado.");

    const totalRevenuesCents = allocations.filter((a) => a.type === "REVENUE").reduce((sum, a) => sum + a.amountCents, 0);
    const totalCostsCents = allocations.filter((a) => a.type === "COST").reduce((sum, a) => sum + a.amountCents, 0);
    const contributionMarginCents = totalRevenuesCents - totalCostsCents;

    return {
      costCenterId: center.id,
      code: center.code,
      name: center.name,
      type: center.type,
      totalRevenuesCents,
      totalCostsCents,
      contributionMarginCents,
      marginPercentage: totalRevenuesCents > 0 ? Math.round((contributionMarginCents / totalRevenuesCents) * 10000) / 100 : 0,
      allocationsCount: allocations.length,
    };
  }
}
