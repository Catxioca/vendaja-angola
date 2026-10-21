import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";
import { EnterpriseAuditService } from "./audit.service.js";

export type WorkflowAction = "SUBMIT" | "APPROVE" | "REJECT" | "REQUEST_REVISION" | "DELEGATE" | "CANCEL";

export interface WorkflowDefinitionData {
  id: string;
  companyId?: string;
  module: string;
  entityName: string;
  name: string;
  description?: string;
  active: boolean;
  states: WorkflowStateData[];
  transitions: WorkflowTransitionData[];
  approvalRules: WorkflowApprovalRuleData[];
}

export interface WorkflowStateData {
  id: string;
  code: string;
  name: string;
  isInitial: boolean;
  isFinal: boolean;
  color: string;
  order: number;
}

export interface WorkflowTransitionData {
  id: string;
  fromStateCode: string;
  toStateCode: string;
  name: string;
  actionCode: WorkflowAction;
  requiredRole?: string;
  requiresComment?: boolean;
}

export interface WorkflowApprovalRuleData {
  id: string;
  minValueCents: bigint | number;
  maxValueCents?: bigint | number;
  requiredLevel: number;
  approverRole: string;
  description?: string;
}

export interface WorkflowInstanceData {
  id: string;
  workflowId: string;
  companyId?: string;
  entityName: string;
  entityId: string;
  currentStateCode: string;
  status: "IN_PROGRESS" | "APPROVED" | "REJECTED" | "CANCELLED" | "REVISION";
  currentApprovalLevel: number;
  requiredLevels: number;
  initiatedById?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  timeline: WorkflowTimelineEntry[];
  approvalSteps: WorkflowApprovalStepData[];
}

export interface WorkflowApprovalStepData {
  id: string;
  level: number;
  requiredRole?: string;
  requiredUserId?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED" | "DELEGATED";
  decisionById?: string;
  delegatedToId?: string;
  comments?: string;
  decidedAt?: string;
}

export interface WorkflowTimelineEntry {
  id: string;
  action: string;
  fromState: string;
  toState: string;
  actorId?: string;
  actorName?: string;
  comments?: string;
  createdAt: string;
}

export class EnterpriseWorkflowService {
  private static inMemoryDefinitions: Map<string, WorkflowDefinitionData> = new Map();
  private static inMemoryInstances: Map<string, WorkflowInstanceData> = new Map();

  static {
    // Initialize default enterprise workflow templates
    this.seedDefaultTemplates();
  }

  /**
   * Seeds standard ERP enterprise workflows: Compras, Pagamentos, Transferências, Férias, Descontos
   */
  public static seedDefaultTemplates(): void {
    // 1. Purchase Order Multi-Level Approval (Compras)
    const purchaseWf: WorkflowDefinitionData = {
      id: "wf-purchase-approval",
      module: "PURCHASES",
      entityName: "Purchase",
      name: "Aprovação Multinível de Compras",
      description: "Fluxo de aprovação hierárquica por escalões de valor em Kwanzas (Kz)",
      active: true,
      states: [
        { id: "s-po-draft", code: "DRAFT", name: "Rascunho", isInitial: true, isFinal: false, color: "#94a3b8", order: 1 },
        { id: "s-po-submitted", code: "SUBMITTED", name: "Submetido", isInitial: false, isFinal: false, color: "#3b82f6", order: 2 },
        { id: "s-po-approval", code: "IN_APPROVAL", name: "Em Aprovação", isInitial: false, isFinal: false, color: "#f59e0b", order: 3 },
        { id: "s-po-approved", code: "APPROVED", name: "Aprovado", isInitial: false, isFinal: true, color: "#10b981", order: 4 },
        { id: "s-po-rejected", code: "REJECTED", name: "Rejeitado", isInitial: false, isFinal: true, color: "#ef4444", order: 5 },
        { id: "s-po-revision", code: "REVISION", name: "Revisão Solicitada", isInitial: false, isFinal: false, color: "#8b5cf6", order: 6 },
        { id: "s-po-cancelled", code: "CANCELLED", name: "Cancelado", isInitial: false, isFinal: true, color: "#64748b", order: 7 },
      ],
      transitions: [
        { id: "t-po-1", fromStateCode: "DRAFT", toStateCode: "SUBMITTED", name: "Submeter para Aprovação", actionCode: "SUBMIT" },
        { id: "t-po-2", fromStateCode: "SUBMITTED", toStateCode: "IN_APPROVAL", name: "Iniciar Revisão", actionCode: "SUBMIT" },
        { id: "t-po-3", fromStateCode: "IN_APPROVAL", toStateCode: "APPROVED", name: "Aprovar Compra", actionCode: "APPROVE", requiredRole: "MANAGER" },
        { id: "t-po-4", fromStateCode: "IN_APPROVAL", toStateCode: "REJECTED", name: "Rejeitar Compra", actionCode: "REJECT", requiresComment: true },
        { id: "t-po-5", fromStateCode: "IN_APPROVAL", toStateCode: "REVISION", name: "Solicitar Revisão", actionCode: "REQUEST_REVISION", requiresComment: true },
        { id: "t-po-6", fromStateCode: "REVISION", toStateCode: "SUBMITTED", name: "Ressubmeter", actionCode: "SUBMIT" },
        { id: "t-po-7", fromStateCode: "DRAFT", toStateCode: "CANCELLED", name: "Cancelar", actionCode: "CANCEL" },
      ],
      approvalRules: [
        // Level 1: Up to 500.000 Kz (50.000.000 centavos) -> Supervisor / Manager
        { id: "r-po-1", minValueCents: 0, maxValueCents: 50_000_000, requiredLevel: 1, approverRole: "SUPERVISOR", description: "Compras até 500.000 Kz autorizadas por Supervisor" },
        // Level 2: 500.000 Kz to 5.000.000 Kz (500.000.000 centavos) -> Financial Director
        { id: "r-po-2", minValueCents: 50_000_001, maxValueCents: 500_000_000, requiredLevel: 2, approverRole: "FINANCIAL_DIRECTOR", description: "Compras entre 500.000 Kz e 5.000.000 Kz autorizadas pela Direção Financeira" },
        // Level 3: Above 5.000.000 Kz -> Administration / Board
        { id: "r-po-3", minValueCents: 500_000_001, maxValueCents: undefined, requiredLevel: 3, approverRole: "ADMIN", description: "Compras acima de 5.000.000 Kz exigem autorização da Administração" },
      ],
    };

    // 2. Payment & Treasury Authorization (Pagamentos)
    const paymentWf: WorkflowDefinitionData = {
      id: "wf-payment-authorization",
      module: "TREASURY",
      entityName: "AccountPayable",
      name: "Autorização de Pagamentos e Liquidação",
      description: "Controlo de pagamentos a fornecedores com validação de tesouraria",
      active: true,
      states: [
        { id: "s-pay-draft", code: "DRAFT", name: "Agendado", isInitial: true, isFinal: false, color: "#94a3b8", order: 1 },
        { id: "s-pay-pending", code: "PENDING_TREASURY", name: "Pendente Tesouraria", isInitial: false, isFinal: false, color: "#f59e0b", order: 2 },
        { id: "s-pay-authorized", code: "APPROVED", name: "Autorizado", isInitial: false, isFinal: true, color: "#10b981", order: 3 },
        { id: "s-pay-rejected", code: "REJECTED", name: "Recusado", isInitial: false, isFinal: true, color: "#ef4444", order: 4 },
      ],
      transitions: [
        { id: "t-pay-1", fromStateCode: "DRAFT", toStateCode: "PENDING_TREASURY", name: "Submeter para Tesouraria", actionCode: "SUBMIT" },
        { id: "t-pay-2", fromStateCode: "PENDING_TREASURY", toStateCode: "APPROVED", name: "Autorizar Saída de Caixa", actionCode: "APPROVE", requiredRole: "FINANCIAL_DIRECTOR" },
        { id: "t-pay-3", fromStateCode: "PENDING_TREASURY", toStateCode: "REJECTED", name: "Recusar Pagamento", actionCode: "REJECT", requiresComment: true },
      ],
      approvalRules: [
        { id: "r-pay-1", minValueCents: 0, requiredLevel: 1, approverRole: "FINANCIAL_DIRECTOR", description: "Aprovação mandatória de tesouraria" },
      ],
    };

    // 3. Stock Inter-Warehouse Transfer (Transferências)
    const transferWf: WorkflowDefinitionData = {
      id: "wf-stock-transfer",
      module: "STOCK",
      entityName: "StockTransfer",
      name: "Transferência entre Armazéns",
      description: "Validação cruzada de expedição e receção física de inventário",
      active: true,
      states: [
        { id: "s-tr-draft", code: "DRAFT", name: "Rascunho", isInitial: true, isFinal: false, color: "#94a3b8", order: 1 },
        { id: "s-tr-dispatch", code: "PENDING_DISPATCH", name: "Aguardando Expedição", isInitial: false, isFinal: false, color: "#3b82f6", order: 2 },
        { id: "s-tr-transit", code: "IN_TRANSIT", name: "Em Trânsito", isInitial: false, isFinal: false, color: "#f59e0b", order: 3 },
        { id: "s-tr-completed", code: "APPROVED", name: "Recebido e Concluído", isInitial: false, isFinal: true, color: "#10b981", order: 4 },
        { id: "s-tr-rejected", code: "REJECTED", name: "Cancelado / Rejeitado", isInitial: false, isFinal: true, color: "#ef4444", order: 5 },
      ],
      transitions: [
        { id: "t-tr-1", fromStateCode: "DRAFT", toStateCode: "PENDING_DISPATCH", name: "Solicitar Transferência", actionCode: "SUBMIT" },
        { id: "t-tr-2", fromStateCode: "PENDING_DISPATCH", toStateCode: "IN_TRANSIT", name: "Confirmar Saída do Armazém Origem", actionCode: "APPROVE" },
        { id: "t-tr-3", fromStateCode: "IN_TRANSIT", toStateCode: "APPROVED", name: "Confirmar Entrada no Destino", actionCode: "APPROVE" },
        { id: "t-tr-4", fromStateCode: "PENDING_DISPATCH", toStateCode: "REJECTED", name: "Rejeitar Pedido", actionCode: "REJECT", requiresComment: true },
      ],
      approvalRules: [
        { id: "r-tr-1", minValueCents: 0, requiredLevel: 1, approverRole: "STOCK_MANAGER", description: "Confirmação do gestor de armazém" },
      ],
    };

    // 4. Employee Leave / Férias (RH)
    const leaveWf: WorkflowDefinitionData = {
      id: "wf-employee-leave",
      module: "HR",
      entityName: "EmployeeLeave",
      name: "Marcação e Gozo de Férias",
      description: "Aprovação de férias com escalonamento por chefia e Recursos Humanos",
      active: true,
      states: [
        { id: "s-lv-draft", code: "DRAFT", name: "Solicitado", isInitial: true, isFinal: false, color: "#94a3b8", order: 1 },
        { id: "s-lv-mgr", code: "IN_APPROVAL", name: "Parecer da Chefia Direta", isInitial: false, isFinal: false, color: "#f59e0b", order: 2 },
        { id: "s-lv-appr", code: "APPROVED", name: "Férias Homologadas", isInitial: false, isFinal: true, color: "#10b981", order: 3 },
        { id: "s-lv-rej", code: "REJECTED", name: "Indeferido", isInitial: false, isFinal: true, color: "#ef4444", order: 4 },
      ],
      transitions: [
        { id: "t-lv-1", fromStateCode: "DRAFT", toStateCode: "IN_APPROVAL", name: "Enviar para Chefia", actionCode: "SUBMIT" },
        { id: "t-lv-2", fromStateCode: "IN_APPROVAL", toStateCode: "APPROVED", name: "Homologar Férias", actionCode: "APPROVE", requiredRole: "HR_MANAGER" },
        { id: "t-lv-3", fromStateCode: "IN_APPROVAL", toStateCode: "REJECTED", name: "Recusar Período", actionCode: "REJECT", requiresComment: true },
      ],
      approvalRules: [
        { id: "r-lv-1", minValueCents: 0, requiredLevel: 1, approverRole: "HR_MANAGER", description: "Parecer e homologação por RH" },
      ],
    };

    this.inMemoryDefinitions.set(purchaseWf.id, purchaseWf);
    this.inMemoryDefinitions.set(paymentWf.id, paymentWf);
    this.inMemoryDefinitions.set(transferWf.id, transferWf);
    this.inMemoryDefinitions.set(leaveWf.id, leaveWf);
  }

  /**
   * Lists all configured workflow definitions
   */
  public static async listDefinitions(companyId?: string): Promise<WorkflowDefinitionData[]> {
    try {
      const dbDefinitions = await prisma.workflowDefinition.findMany({
        where: {
          active: true,
          ...(companyId ? { companyId } : {}),
        },
        include: {
          states: { orderBy: { order: "asc" } },
          transitions: true,
          approvalRules: { orderBy: { requiredLevel: "asc" } },
        },
      });

      if (dbDefinitions && dbDefinitions.length > 0) {
        return dbDefinitions.map((d) => ({
          id: d.id,
          companyId: d.companyId ?? undefined,
          module: d.module,
          entityName: d.entityName,
          name: d.name,
          description: d.description ?? undefined,
          active: d.active,
          states: d.states.map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            isInitial: s.isInitial,
            isFinal: s.isFinal,
            color: s.color,
            order: s.order,
          })),
          transitions: d.transitions.map((t) => ({
            id: t.id,
            fromStateCode: t.fromStateId, // In db linked by ID, represented by code
            toStateCode: t.toStateId,
            name: t.name,
            actionCode: t.actionCode as WorkflowAction,
            requiredRole: t.requiredRole ?? undefined,
            requiresComment: t.requiresComment,
          })),
          approvalRules: d.approvalRules.map((r) => ({
            id: r.id,
            minValueCents: r.minValueCents,
            maxValueCents: r.maxValueCents ?? undefined,
            requiredLevel: r.requiredLevel,
            approverRole: r.approverRole,
            description: r.description ?? undefined,
          })),
        }));
      }
    } catch {
      // In-memory fallback
    }

    return Array.from(this.inMemoryDefinitions.values());
  }

  /**
   * Retrieves a workflow definition by ID or Entity Name
   */
  public static getDefinition(idOrEntity: string): WorkflowDefinitionData | undefined {
    let def = this.inMemoryDefinitions.get(idOrEntity);
    if (!def) {
      for (const item of this.inMemoryDefinitions.values()) {
        if (item.entityName.toLowerCase() === idOrEntity.toLowerCase()) {
          def = item;
          break;
        }
      }
    }
    return def;
  }

  /**
   * Creates a new workflow instance for an entity
   */
  public static async createInstance(options: {
    workflowIdOrEntity: string;
    entityId: string;
    entityName?: string;
    companyId?: string;
    amountCents?: bigint | number;
    initiatedById?: string;
    metadata?: Record<string, unknown>;
  }): Promise<WorkflowInstanceData> {
    const definition = this.getDefinition(options.workflowIdOrEntity);
    if (!definition) {
      throw new Error(`Definição de workflow não encontrada para '${options.workflowIdOrEntity}'`);
    }

    const initialState = definition.states.find((s) => s.isInitial) || definition.states[0]!;
    const amount = options.amountCents !== undefined ? BigInt(options.amountCents) : BigInt(0);

    // Calculate how many approval levels are required based on amount threshold rules
    let requiredLevels = 1;
    for (const rule of definition.approvalRules) {
      const min = BigInt(rule.minValueCents);
      const max = rule.maxValueCents !== undefined ? BigInt(rule.maxValueCents) : undefined;
      if (amount >= min && (max === undefined || amount <= max)) {
        if (rule.requiredLevel > requiredLevels) {
          requiredLevels = rule.requiredLevel;
        }
      }
    }

    const initialSteps: WorkflowApprovalStepData[] = [];
    for (let lvl = 1; lvl <= requiredLevels; lvl++) {
      const rule = definition.approvalRules.find((r) => r.requiredLevel === lvl);
      initialSteps.push({
        id: crypto.randomUUID(),
        level: lvl,
        requiredRole: rule?.approverRole ?? "MANAGER",
        status: "PENDING",
      });
    }

    const instanceId = crypto.randomUUID();
    const now = new Date().toISOString();

    const instance: WorkflowInstanceData = {
      id: instanceId,
      workflowId: definition.id,
      companyId: options.companyId,
      entityName: options.entityName ?? definition.entityName,
      entityId: options.entityId,
      currentStateCode: initialState.code,
      status: "IN_PROGRESS",
      currentApprovalLevel: 1,
      requiredLevels,
      initiatedById: options.initiatedById,
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now,
      timeline: [
        {
          id: crypto.randomUUID(),
          action: "CREATED",
          fromState: "NONE",
          toState: initialState.code,
          actorId: options.initiatedById,
          comments: `Instância iniciada para ${definition.entityName} #${options.entityId}`,
          createdAt: now,
        },
      ],
      approvalSteps: initialSteps,
    };

    this.inMemoryInstances.set(instanceId, instance);

    // Persist to database if available
    try {
      await prisma.workflowInstance.create({
        data: {
          id: instance.id,
          workflowId: definition.id,
          companyId: options.companyId ?? null,
          entityName: instance.entityName,
          entityId: instance.entityId,
          currentStateId: initialState.id,
          status: "IN_PROGRESS",
          currentApprovalLevel: 1,
          metadata: options.metadata ? JSON.parse(JSON.stringify(options.metadata)) : undefined,
          initiatedById: options.initiatedById ?? null,
        },
      });
    } catch {
      // Handled gracefully in offline mode
    }

    EnterpriseNotificationService.dispatch({
      type: "INFO",
      category: "WORKFLOW",
      title: `Workflow Iniciado: ${definition.name}`,
      message: `Novo processo aberto para ${instance.entityName} #${instance.entityId}. Nível de aprovação requerido: ${requiredLevels}.`,
      module: definition.module,
      companyId: options.companyId,
      userId: options.initiatedById,
      actionUrl: `/workflows/${instance.id}`,
    });

    return instance;
  }

  /**
   * Executes a transition or approval action on an existing workflow instance
   */
  public static async executeAction(options: {
    instanceId: string;
    action: WorkflowAction;
    actorId: string;
    actorRole?: string;
    actorName?: string;
    comments?: string;
    delegatedToId?: string;
  }): Promise<WorkflowInstanceData> {
    const instance = this.inMemoryInstances.get(options.instanceId);
    if (!instance) {
      throw new Error(`Instância de workflow não encontrada: ${options.instanceId}`);
    }

    const definition = this.inMemoryDefinitions.get(instance.workflowId);
    if (!definition) {
      throw new Error(`Definição do workflow não encontrada: ${instance.workflowId}`);
    }

    const fromState = instance.currentStateCode;
    let toState = fromState;
    const now = new Date().toISOString();

    if (options.action === "SUBMIT") {
      toState = "IN_APPROVAL";
      instance.status = "IN_PROGRESS";
    } else if (options.action === "APPROVE") {
      const currentStep = instance.approvalSteps.find((s) => s.level === instance.currentApprovalLevel);
      if (currentStep) {
        currentStep.status = "APPROVED";
        currentStep.decisionById = options.actorId;
        currentStep.decidedAt = now;
        currentStep.comments = options.comments;
      }

      // Check if more approval levels are required
      if (instance.currentApprovalLevel < instance.requiredLevels) {
        instance.currentApprovalLevel += 1;
        toState = "IN_APPROVAL";
      } else {
        toState = "APPROVED";
        instance.status = "APPROVED";
      }
    } else if (options.action === "REJECT") {
      if (!options.comments || options.comments.trim().length === 0) {
        throw new Error("A rejeição de um processo exige a inserção obrigatória de um motivo/justificação.");
      }
      const currentStep = instance.approvalSteps.find((s) => s.level === instance.currentApprovalLevel);
      if (currentStep) {
        currentStep.status = "REJECTED";
        currentStep.decisionById = options.actorId;
        currentStep.decidedAt = now;
        currentStep.comments = options.comments;
      }
      toState = "REJECTED";
      instance.status = "REJECTED";
    } else if (options.action === "REQUEST_REVISION") {
      if (!options.comments || options.comments.trim().length === 0) {
        throw new Error("O pedido de revisão exige comentários detalhados dos pontos a corrigir.");
      }
      toState = "REVISION";
      instance.status = "REVISION";
    } else if (options.action === "DELEGATE") {
      if (!options.delegatedToId) {
        throw new Error("A delegação exige a especificação do utilizador delegado.");
      }
      const currentStep = instance.approvalSteps.find((s) => s.level === instance.currentApprovalLevel);
      if (currentStep) {
        currentStep.status = "DELEGATED";
        currentStep.delegatedToId = options.delegatedToId;
        currentStep.comments = options.comments;
      }
    } else if (options.action === "CANCEL") {
      toState = "CANCELLED";
      instance.status = "CANCELLED";
    }

    instance.currentStateCode = toState;
    instance.updatedAt = now;

    const timelineEntry: WorkflowTimelineEntry = {
      id: crypto.randomUUID(),
      action: options.action,
      fromState,
      toState,
      actorId: options.actorId,
      actorName: options.actorName ?? "Utilizador",
      comments: options.comments,
      createdAt: now,
    };
    instance.timeline.unshift(timelineEntry);

    // Audit log
    EnterpriseAuditService.record({
      action: `WORKFLOW_${options.action}`,
      module: definition.module,
      entity: instance.entityName,
      entityId: instance.entityId,
      userId: options.actorId,
      companyId: instance.companyId,
      oldValue: { state: fromState },
      newValue: { state: toState, action: options.action, step: instance.currentApprovalLevel },
      metadata: { comments: options.comments, workflowId: instance.workflowId },
    }).catch(() => {});

    // Notification
    EnterpriseNotificationService.dispatch({
      type: options.action === "APPROVE" ? "SUCCESS" : options.action === "REJECT" ? "CRITICAL" : "INFO",
      category: "APPROVAL",
      priority: options.action === "REJECT" ? "URGENT" : "NORMAL",
      title: `Workflow ${definition.name}: Ação ${options.action}`,
      message: `O processo referente a ${instance.entityName} #${instance.entityId} transitou para '${toState}' por ${options.actorName ?? "Utilizador"}.`,
      module: definition.module,
      companyId: instance.companyId,
      actionUrl: `/workflows/${instance.id}`,
    });

    return instance;
  }

  /**
   * Retrieves an instance by ID
   */
  public static getInstance(id: string): WorkflowInstanceData | undefined {
    return this.inMemoryInstances.get(id);
  }

  /**
   * Lists workflow instances with filters
   */
  public static listInstances(filters: {
    companyId?: string;
    entityName?: string;
    status?: string;
    workflowId?: string;
  } = {}): WorkflowInstanceData[] {
    let list = Array.from(this.inMemoryInstances.values());
    if (filters.companyId) {
      list = list.filter((i) => !i.companyId || i.companyId === filters.companyId);
    }
    if (filters.entityName) {
      list = list.filter((i) => i.entityName.toLowerCase() === filters.entityName!.toLowerCase());
    }
    if (filters.status) {
      list = list.filter((i) => i.status === filters.status);
    }
    if (filters.workflowId) {
      list = list.filter((i) => i.workflowId === filters.workflowId);
    }
    return list;
  }

  /**
   * Retrieves pending approvals waiting for a specific user role or ID
   */
  public static getPendingApprovals(options: {
    userRole?: string;
    userId?: string;
    companyId?: string;
  }): WorkflowInstanceData[] {
    return Array.from(this.inMemoryInstances.values()).filter((inst) => {
      if (inst.status !== "IN_PROGRESS") return false;
      if (options.companyId && inst.companyId && inst.companyId !== options.companyId) return false;
      const currentStep = inst.approvalSteps.find((s) => s.level === inst.currentApprovalLevel);
      if (!currentStep || currentStep.status !== "PENDING") return false;
      if (options.userRole && currentStep.requiredRole && currentStep.requiredRole !== options.userRole && options.userRole !== "ADMIN") {
        return false;
      }
      if (options.userId && currentStep.requiredUserId && currentStep.requiredUserId !== options.userId) {
        return false;
      }
      return true;
    });
  }
}
