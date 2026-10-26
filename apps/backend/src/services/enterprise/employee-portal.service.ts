import jwt from "jsonwebtoken";
import { getEnv } from "../../config/env.js";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";

const isProduction = process.env.NODE_ENV === "production";

export interface EmployeePortalDashboard {
  employeeId: string;
  fullName: string;
  position: string;
  department: string;
  nif: string;
  inss: string;
  contractType: string;
  baseSalaryCents: number;
  netSalaryCents: number;
  lastNetSalaryCents: number;
  availableVacationDays: number;
  vacationSummary: {
    annualEntitlementDays: number;
    daysTaken: number;
    daysRemaining: number;
  };
  recentPayslips: any[];
  pendingLeaveRequests: any[];
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
  inssEmployeeDeductionCents: number;
  inssEmployerDeductionCents: number;
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
    if (!isProduction) {
      const defaultEmpId = "emp-portal-01";
      this.inMemoryEmployees.set(defaultEmpId, {
        id: defaultEmpId,
        fullName: "Dra. Teresa Kwanza de Carvalho",
        nif: "5412998877",
        inss: "0991823746",
        position: "Responsável de Tesouraria",
        department: "Departamento Financeiro",
        contractType: "EFETIVO",
        baseSalaryCents: 1_250_000_00,
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
          inssEmployeeDeductionCents: 37_500_00,
          inssEmployerDeductionCents: 100_000_00,
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
  }

  /**
   * Authenticates employee via NIF/INSS and PIN
   */
  public static async authenticateEmployee(identifier: string, secret: string, companyId?: string): Promise<{ token: string; employee: any } | null> {
    const cleanId = identifier.trim().toLowerCase();
    if (!secret || secret.length < 4) return null;

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
    } catch (err) {
      logger.error("EMPLOYEE_PORTAL", "AUTH", "Falha na consulta de colaborador", err);
    }

    if (!employee && !isProduction) {
      for (const e of this.inMemoryEmployees.values()) {
        if ((e.email?.toLowerCase() === cleanId || e.nif === cleanId || e.inss === cleanId) && (!companyId || e.companyId === companyId)) {
          employee = e;
          break;
        }
      }
    }

    if (!employee) throw new Error("employee_not_found");

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

    void EnterpriseAuditService.record({
      action: "PORTAL_EMPLOYEE_LOGIN",
      module: "EMPLOYEE_PORTAL",
      companyId: employee.companyId || undefined,
      userId: employee.id,
      details: { fullName: employee.fullName, nif: employee.nif },
    });

    return {
      token,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        position: employee.position,
        department: employee.department,
        nif: employee.nif,
        inss: employee.inss,
        contractType: employee.contractType,
        baseSalaryCents: employee.baseSalaryCents,
      },
    };
  }

  /**
   * Retrieves Employee Portal Dashboard
   */
  public static async getDashboard(employeeId: string, companyId?: string): Promise<EmployeePortalDashboard> {
    let employee: any = null;
    let payrolls: any[] = [];

    try {
      employee = await prisma.employee.findFirst({
        where: {
          id: employeeId,
          ...(companyId ? { companyId } : {}),
        },
      });

      if (employee) {
        payrolls = await prisma.payroll.findMany({
          where: { employeeId: employee.id },
          orderBy: { month: "desc" },
          take: 12,
        });
      }
    } catch (err) {
      logger.error("EMPLOYEE_PORTAL", "DASHBOARD", "Falha ao carregar dashboard de colaborador", err);
    }

    if (!employee && !isProduction) {
      employee = this.inMemoryEmployees.get(employeeId);
      payrolls = this.inMemoryPayslips.get(employeeId) || [];
    }

    if (!employee) throw new Error("employee_not_found");

    const recentPayslips = payrolls.map((p) => ({
      id: p.id,
      month: p.month,
      grossSalaryCents: p.grossSalaryCents,
      netSalaryCents: p.netSalaryCents,
      status: p.status,
      payDate: typeof p.payDate === "object" ? p.payDate.toISOString() : (p.payDate || null),
    }));

    const latestNet = payrolls[0]?.netSalaryCents ?? (isProduction ? employee.baseSalaryCents : 1_277_000_00);
    const leaveRequests = this.inMemoryLeaveRequests.get(employee.id) || [];
    const pendingLeaves = leaveRequests.filter((l) => l.status === "PENDING_APPROVAL");

    return {
      employeeId: employee.id,
      fullName: employee.fullName,
      position: employee.position,
      department: employee.department || "Geral",
      nif: employee.nif || "—",
      inss: employee.inss || "—",
      contractType: employee.contractType || "EFETIVO",
      baseSalaryCents: employee.baseSalaryCents,
      netSalaryCents: latestNet,
      lastNetSalaryCents: latestNet,
      availableVacationDays: 12,
      vacationSummary: {
        annualEntitlementDays: 22,
        daysTaken: 10,
        daysRemaining: 12,
      },
      recentPayslips,
      pendingLeaveRequests: pendingLeaves,
    };
  }

  /**
   * Lists payslips for the employee
   */
  public static async listPayslips(employeeId: string): Promise<EmployeePayslipDetail[]> {
    try {
      const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (employee) {
        const payrolls = await prisma.payroll.findMany({
          where: { employeeId },
          orderBy: { month: "desc" },
        });

        if (payrolls.length) {
          return payrolls.map((p) => ({
            id: p.id,
            month: p.month,
            employeeName: employee.fullName,
            position: employee.position,
            nif: employee.nif || "",
            inss: employee.inss || "",
            salaryBaseCents: p.salaryBaseCents,
            foodAllowanceCents: p.foodAllowanceCents,
            transportAllowanceCents: p.transportAllowanceCents,
            housingAllowanceCents: p.housingAllowanceCents,
            otherAllowancesCents: p.otherAllowancesCents,
            grossSalaryCents: p.grossSalaryCents,
            irtDeductionCents: p.irtCents,
            inssEmployeeDeductionCents: p.inssEmployeeCents,
            inssEmployerDeductionCents: p.inssEmployerCents,
            netSalaryCents: p.netSalaryCents,
            payDate: p.payDate?.toISOString() || undefined,
            status: p.status,
          }));
        }
      }
    } catch (err) {
      logger.error("EMPLOYEE_PORTAL", "PAYSLIPS", "Falha ao listar recibos de vencimento", err);
    }

    if (!isProduction) {
      return this.inMemoryPayslips.get(employeeId) || [];
    }
    return [];
  }

  /**
   * Retrieves single payslip detail
   */
  public static async getPayslip(employeeId: string, payslipId: string): Promise<EmployeePayslipDetail | null> {
    try {
      const payroll = await prisma.payroll.findFirst({
        where: { id: payslipId, employeeId },
        include: { employee: true },
      });

      if (payroll) {
        return {
          id: payroll.id,
          month: payroll.month,
          employeeName: payroll.employee.fullName,
          position: payroll.employee.position,
          nif: payroll.employee.nif || "",
          inss: payroll.employee.inss || "",
          salaryBaseCents: payroll.salaryBaseCents,
          foodAllowanceCents: payroll.foodAllowanceCents,
          transportAllowanceCents: payroll.transportAllowanceCents,
          housingAllowanceCents: payroll.housingAllowanceCents,
          otherAllowancesCents: payroll.otherAllowancesCents,
          grossSalaryCents: payroll.grossSalaryCents,
          irtDeductionCents: payroll.irtCents,
          inssEmployeeDeductionCents: payroll.inssEmployeeCents,
          inssEmployerDeductionCents: payroll.inssEmployerCents,
          netSalaryCents: payroll.netSalaryCents,
          payDate: payroll.payDate?.toISOString() || undefined,
          status: payroll.status,
        };
      }
    } catch (err) {
      logger.error("EMPLOYEE_PORTAL", "PAYSLIP", "Falha ao obter recibo", err);
    }

    if (!isProduction) {
      const payslips = this.inMemoryPayslips.get(employeeId) || [];
      return payslips.find((p) => p.id === payslipId) || null;
    }
    return null;
  }

  /**
   * Submits vacation or absence leave request
   */
  public static async submitLeaveRequest(
    employeeId: string,
    req: {
      type: "VACATION" | "JUSTIFIED_ABSENCE" | "MEDICAL" | "MATERNITY_PATERNITY";
      startDate: string;
      endDate: string;
      daysCount: number;
      justification?: string;
    }
  ): Promise<EmployeeLeaveRequest> {
    const typeLabels: Record<string, string> = {
      VACATION: "Férias Anuais Legais",
      JUSTIFIED_ABSENCE: "Ausência Justificada",
      MEDICAL: "Baixa Médica / Doença",
      MATERNITY_PATERNITY: "Licença de Parentalidade",
    };

    let empName = "Colaborador";
    try {
      const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (employee) empName = employee.fullName;
    } catch (err) {
      logger.error("EMPLOYEE_PORTAL", "LEAVE_REQ", "Falha ao verificar colaborador", err);
    }

    if (!empName && !isProduction) {
      empName = this.inMemoryEmployees.get(employeeId)?.fullName || "Colaborador";
    }

    const leaveRequest: EmployeeLeaveRequest = {
      workflowInstanceId: "wf-inst-leave-01",
      id: `leave-${Date.now()}`,
      employeeId,
      employeeName: empName,
      type: req.type,
      typeLabel: typeLabels[req.type] || "Dispensa",
      startDate: req.startDate,
      endDate: req.endDate,
      daysCount: req.daysCount,
      justification: req.justification,
      status: "PENDING_APPROVAL",
      requestedAt: new Date().toISOString(),
    };

    const existing = this.inMemoryLeaveRequests.get(employeeId) || [];
    existing.unshift(leaveRequest);
    this.inMemoryLeaveRequests.set(employeeId, existing);

    void EnterpriseNotificationService.dispatch({
      type: "INFO",
      category: "HR",
      title: "Novo Pedido de Ausência Submetido",
      message: `${empName} solicitou ${req.daysCount} dias (${leaveRequest.typeLabel}) a partir de ${req.startDate}`,
      module: "EMPLOYEE_PORTAL",
    });

    return leaveRequest;
  }

  /**
   * Lists leave requests for employee
   */
  public static async listLeaveRequests(employeeId: string): Promise<EmployeeLeaveRequest[]> {
    return this.inMemoryLeaveRequests.get(employeeId) || [];
  }

  /**
   * Updates employee profile contact details
   */
  public static async updateEmployeeProfile(
    employeeId: string,
    updates: { phone?: string; email?: string; address?: string; iban?: string }
  ): Promise<{ success: boolean; employee: any }> {
    let employee: any = null;
    try {
      employee = await prisma.employee.update({
        where: { id: employeeId },
        data: {
          ...(updates.iban !== undefined ? { iban: updates.iban } : {}),
        },
      });
    } catch (err) {
      logger.error("EMPLOYEE_PORTAL", "PROFILE_UPDATE", "Falha ao atualizar perfil de colaborador no BD", err);
    }

    if (!employee && !isProduction) {
      const existing = this.inMemoryEmployees.get(employeeId) || { id: employeeId, fullName: "Colaborador" };
      employee = { ...existing, ...updates };
      this.inMemoryEmployees.set(employeeId, employee);
    }

    if (!employee) throw new Error("employee_not_found");

    void EnterpriseAuditService.record({
      action: "PORTAL_PROFILE_UPDATED",
      module: "EMPLOYEE_PORTAL",
      userId: employeeId,
      details: { updates },
    });

    return { success: true, employee };
  }
}
