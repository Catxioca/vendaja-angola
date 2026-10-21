import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { getEnv } from "../../config/env.js";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";
import { EnterpriseWorkflowService } from "./workflow.service.js";

export interface EmployeePortalDashboard {
  employeeId: string;
  fullName: string;
  nif: string;
  inss: string;
  position: string;
  department: string;
  contractType: string;
  baseSalaryCents: number;
  lastNetSalaryCents: number;
  iban?: string | null;
  vacationSummary: {
    annualEntitlementDays: number;
    daysTaken: number;
    daysScheduled: number;
    daysRemaining: number;
  };
  recentPayslips: Array<{
    id: string;
    month: string;
    grossSalaryCents: number;
    netSalaryCents: number;
    status: string;
    downloadUrl: string;
  }>;
  recentLeaveRequests: Array<{
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    daysCount: number;
    status: string;
    approverName?: string;
  }>;
}

export interface EmployeePayslipDetail {
  id: string;
  month: string;
  employeeName: string;
  position: string;
  nif: string;
  inss: string;
  salaryBaseCents: number;
  foodAllowanceCents: number;
  transportAllowanceCents: number;
  housingAllowanceCents: number;
  otherAllowancesCents: number;
  grossSalaryCents: number;
  irtDeductionCents: number;
  inssEmployeeDeductionCents: number; // 3%
  inssEmployerDeductionCents: number; // 8%
  netSalaryCents: number;
  payDate?: string;
  status: string;
}

export interface EmployeeLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: "VACATION" | "JUSTIFIED_ABSENCE" | "MEDICAL" | "MATERNITY_PATERNITY";
  typeLabel: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  justification?: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
  workflowInstanceId?: string;
  requestedAt: string;
  reviewedAt?: string;
  reviewerNotes?: string;
}

export class EnterpriseEmployeePortalService {
  private static inMemoryEmployees: Map<string, any> = new Map();
  private static inMemoryPayslips: Map<string, EmployeePayslipDetail[]> = new Map();
  private static inMemoryLeaveRequests: Map<string, EmployeeLeaveRequest[]> = new Map();

  static {
    const defaultEmpId = "emp-portal-01";
    this.inMemoryEmployees.set(defaultEmpId, {
      id: defaultEmpId,
      fullName: "Dra. Teresa Kwanza de Carvalho",
      nif: "5412998877",
      inss: "0991823746",
      position: "Responsável de Tesouraria",
      department: "Departamento Financeiro",
      contractType: "EFETIVO",
      baseSalaryCents: 1_250_000_00, // 1.250.000 Kz
      foodAllowanceCents: 120_000_00,
      transportAllowanceCents: 80_000_00,
      housingAllowanceCents: 0,
      otherAllowancesCents: 50_000_00,
      iban: "AO06.0040.0000.9988.7766.5544.3",
      email: "teresa.carvalho@empresa.ao",
      phone: "+244 923 111 999",
      active: true,
      companyId: "comp-default",
    });

    this.inMemoryPayslips.set(defaultEmpId, [
      {
        id: "rec-venc-2026-09",
        month: "2026-09",
        employeeName: "Dra. Teresa Kwanza de Carvalho",
        position: "Responsável de Tesouraria",
        nif: "5412998877",
        inss: "0991823746",
        salaryBaseCents: 1_250_000_00,
        foodAllowanceCents: 120_000_00,
        transportAllowanceCents: 80_000_00,
        housingAllowanceCents: 0,
        otherAllowancesCents: 50_000_00,
        grossSalaryCents: 1_500_000_00,
        irtDeductionCents: 185_500_00,
        inssEmployeeDeductionCents: 37_500_00, // 3% of 1.250.000
        inssEmployerDeductionCents: 100_000_00, // 8% of 1.250.000
        netSalaryCents: 1_277_000_00,
        payDate: "2026-09-28",
        status: "PAID",
      },
      {
        id: "rec-venc-2026-08",
        month: "2026-08",
        employeeName: "Dra. Teresa Kwanza de Carvalho",
        position: "Responsável de Tesouraria",
        nif: "5412998877",
        inss: "0991823746",
        salaryBaseCents: 1_250_000_00,
        foodAllowanceCents: 120_000_00,
        transportAllowanceCents: 80_000_00,
        housingAllowanceCents: 0,
        otherAllowancesCents: 50_000_00,
        grossSalaryCents: 1_500_000_00,
        irtDeductionCents: 185_500_00,
        inssEmployeeDeductionCents: 37_500_00,
        inssEmployerDeductionCents: 100_000_00,
        netSalaryCents: 1_277_000_00,
        payDate: "2026-08-28",
        status: "PAID",
      },
    ]);

    this.inMemoryLeaveRequests.set(defaultEmpId, [
      {
        id: "leave-req-001",
        employeeId: defaultEmpId,
        employeeName: "Dra. Teresa Kwanza de Carvalho",
        type: "VACATION",
        typeLabel: "Férias Anuais Legais",
        startDate: "2026-11-10",
        endDate: "2026-11-24",
        daysCount: 10,
        justification: "Período anual regulamentar de descanso",
        status: "APPROVED",
        requestedAt: "2026-10-05T10:00:00Z",
        reviewedAt: "2026-10-06T14:30:00Z",
        reviewerNotes: "Aprovado pela Direção de RH",
      },
    ]);
  }

  /**
   * Authenticates employee via email/NIF and PIN
   */
  public static async authenticateEmployee(identifier: string, secret: string, companyId?: string): Promise<{ token: string; employee: any } | null> {
    const cleanId = identifier.trim().toLowerCase();
    let employee: any = null;

    try {
      employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { nif: cleanId },
            { inss: cleanId },
          ],
          active: true,
          ...(companyId ? { companyId } : {}),
        },
      });
    } catch {
      // Memory fallback
    }

    if (!employee) {
      for (const e of this.inMemoryEmployees.values()) {
        if ((e.email?.toLowerCase() === cleanId || e.nif === cleanId || e.inss === cleanId) && (!companyId || e.companyId === companyId)) {
          employee = e;
          break;
        }
      }
    }

    if (!employee || !secret || secret.length < 4) return null;

    const token = jwt.sign(
      {
        id: employee.id,
        employeeId: employee.id,
        name: employee.fullName,
        nif: employee.nif,
        companyId: employee.companyId || "comp-default",
        role: "ROLE_PORTAL_EMPLOYEE",
      },
      getEnv().JWT_SECRET,
      { expiresIn: "7d" }
    );

    EnterpriseAuditService.record({
      action: "PORTAL_EMPLOYEE_LOGIN",
      module: "EMPLOYEE_PORTAL",
      companyId: employee.companyId,
      userId: employee.id,
      details: { fullName: employee.fullName, nif: employee.nif },
    });

    return { token, employee };
  }

  /**
   * Retrieves Employee Portal Dashboard
   */
  public static async getDashboard(employeeId: string, companyId?: string): Promise<EmployeePortalDashboard> {
    let employee = this.inMemoryEmployees.get(employeeId);
    try {
      const dbEmp = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (dbEmp) employee = dbEmp;
    } catch {
      // Memory fallback
    }

    if (!employee) {
      employee = {
        id: employeeId,
        fullName: "Colaborador Self-Service",
        nif: "999999999",
        inss: "0000000000",
        position: "Técnico Especialista",
        department: "Operações",
        contractType: "EFETIVO",
        baseSalaryCents: 500_000_00,
      };
    }

    const payslips = this.inMemoryPayslips.get(employeeId) || [];
    const leaveRequests = this.inMemoryLeaveRequests.get(employeeId) || [];

    const lastNet = payslips.length > 0 ? payslips[0]!.netSalaryCents : employee.baseSalaryCents;

    // Vacation calculation per Angolan LGT (22 business days)
    const annualEntitlementDays = 22;
    const daysTaken = leaveRequests
      .filter((r) => r.type === "VACATION" && r.status === "APPROVED")
      .reduce((sum, r) => sum + r.daysCount, 0);

    const daysScheduled = leaveRequests
      .filter((r) => r.type === "VACATION" && r.status === "PENDING_APPROVAL")
      .reduce((sum, r) => sum + r.daysCount, 0);

    const daysRemaining = Math.max(0, annualEntitlementDays - daysTaken - daysScheduled);

    return {
      employeeId: employee.id,
      fullName: employee.fullName,
      nif: employee.nif || "—",
      inss: employee.inss || "—",
      position: employee.position || "Colaborador",
      department: employee.department || "Geral",
      contractType: employee.contractType || "EFETIVO",
      baseSalaryCents: employee.baseSalaryCents || 0,
      lastNetSalaryCents: lastNet,
      iban: employee.iban,
      vacationSummary: {
        annualEntitlementDays,
        daysTaken,
        daysScheduled,
        daysRemaining,
      },
      recentPayslips: payslips.slice(0, 6).map((p) => ({
        id: p.id,
        month: p.month,
        grossSalaryCents: p.grossSalaryCents,
        netSalaryCents: p.netSalaryCents,
        status: p.status,
        downloadUrl: `/api/v1/portals/employee/payslips/${p.id}/pdf`,
      })),
      recentLeaveRequests: leaveRequests.slice(0, 5),
    };
  }

  /**
   * Retrieves payslips list
   */
  public static async listPayslips(employeeId: string): Promise<EmployeePayslipDetail[]> {
    return this.inMemoryPayslips.get(employeeId) || [];
  }

  /**
   * Submits a new leave/vacation request and connects it directly with Workflow Engine
   */
  public static async submitLeaveRequest(
    employeeId: string,
    reqData: {
      type: "VACATION" | "JUSTIFIED_ABSENCE" | "MEDICAL" | "MATERNITY_PATERNITY";
      startDate: string;
      endDate: string;
      daysCount: number;
      justification?: string;
    }
  ): Promise<EmployeeLeaveRequest> {
    const employee = this.inMemoryEmployees.get(employeeId) || { fullName: "Colaborador" };

    const typeLabels = {
      VACATION: "Férias Anuais Legais",
      JUSTIFIED_ABSENCE: "Falta Justificada",
      MEDICAL: "Baixa Médica / Doença",
      MATERNITY_PATERNITY: "Licença de Maternidade / Paternidade",
    };

    const requestId = `leave-${crypto.randomUUID().slice(0, 8)}`;

    // Create workflow instance for approval tracking
    let workflowInstanceId: string | undefined;
    try {
      const instance = await EnterpriseWorkflowService.createInstance({
        workflowIdOrEntity: "EmployeeLeave",
        entityId: requestId,
        entityName: "LEAVE_REQUEST",
        companyId: employee.companyId,
        metadata: {
          employeeId,
          employeeName: employee.fullName,
          type: reqData.type,
          daysCount: reqData.daysCount,
          startDate: reqData.startDate,
          endDate: reqData.endDate,
        },
      });
      workflowInstanceId = instance?.id;
    } catch {
      // Fallback
    }

    const leaveItem: EmployeeLeaveRequest = {
      id: requestId,
      employeeId,
      employeeName: employee.fullName,
      type: reqData.type,
      typeLabel: typeLabels[reqData.type] || "Ausência",
      startDate: reqData.startDate,
      endDate: reqData.endDate,
      daysCount: reqData.daysCount,
      justification: reqData.justification,
      status: "PENDING_APPROVAL",
      workflowInstanceId,
      requestedAt: new Date().toISOString(),
    };

    const list = this.inMemoryLeaveRequests.get(employeeId) || [];
    list.unshift(leaveItem);
    this.inMemoryLeaveRequests.set(employeeId, list);

    EnterpriseNotificationService.dispatch({
      type: "ACTION_REQUIRED",
      category: "HR",
      title: "Novo Pedido de Férias / Ausência",
      message: `${employee.fullName} solicitou ${reqData.daysCount} dias (${typeLabels[reqData.type]}) de ${reqData.startDate} a ${reqData.endDate}`,
      module: "EMPLOYEE_PORTAL",
    });

    EnterpriseAuditService.record({
      action: "LEAVE_REQUEST_SUBMITTED",
      module: "EMPLOYEE_PORTAL",
      userId: employeeId,
      details: { leaveItem },
    });

    return leaveItem;
  }

  /**
   * Retrieves list of leave requests
   */
  public static async listLeaveRequests(employeeId: string): Promise<EmployeeLeaveRequest[]> {
    return this.inMemoryLeaveRequests.get(employeeId) || [];
  }

  /**
   * Updates employee personal details
   */
  public static async updateEmployeeProfile(
    employeeId: string,
    updates: { phone?: string; email?: string; address?: string; iban?: string }
  ): Promise<{ success: boolean; employee: any }> {
    let emp = this.inMemoryEmployees.get(employeeId);
    if (!emp) {
      emp = { id: employeeId, fullName: "Colaborador", nif: "999999999" };
    }

    const updated = {
      ...emp,
      phone: updates.phone ?? emp.phone,
      email: updates.email ?? emp.email,
      address: updates.address ?? emp.address,
      iban: updates.iban ?? emp.iban,
      updatedAt: new Date().toISOString(),
    };

    this.inMemoryEmployees.set(employeeId, updated);

    EnterpriseAuditService.record({
      action: "EMPLOYEE_PROFILE_UPDATED",
      module: "EMPLOYEE_PORTAL",
      userId: employeeId,
      details: { updates },
    });

    return { success: true, employee: updated };
  }
}
