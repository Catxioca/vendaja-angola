import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";
import { EnterpriseTaskService } from "./task.service.js";

export type TriggerEventType =
  | "STOCK_BELOW_MINIMUM"
  | "INVOICE_DUE_IN_DAYS"
  | "PURCHASE_APPROVED"
  | "PURCHASE_CREATED"
  | "EMPLOYEE_ADMITTED"
  | "DISCOUNT_EXCEEDED"
  | "DAILY_CLOSING_COMPLETED"
  | "BACKUP_FAILED";

export type RuleActionType =
  | "DISPATCH_NOTIFICATION"
  | "CREATE_TASK"
  | "QUEUE_JOB"
  | "TRIGGER_WORKFLOW";

export interface AutomationRuleData {
  id: string;
  companyId?: string;
  name: string;
  description?: string;
  triggerEvent: TriggerEventType;
  conditionExpression?: Record<string, unknown>;
  actionType: RuleActionType;
  actionConfig: Record<string, unknown>;
  active: boolean;
  executionCount: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationExecutionLogData {
  id: string;
  ruleId: string;
  ruleName?: string;
  companyId?: string;
  triggerEvent: string;
  entityName?: string;
  entityId?: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  details?: Record<string, unknown>;
  executedAt: string;
}

export class EnterpriseRulesService {
  private static inMemoryRules: Map<string, AutomationRuleData> = new Map();
  private static inMemoryLogs: AutomationExecutionLogData[] = [];
  private static readonly MAX_LOGS = 500;

  static {
    this.seedDefaultRules();
  }

  /**
   * Seeds standard enterprise automation rules
   */
  public static seedDefaultRules(): void {
    const rules: AutomationRuleData[] = [
      {
        id: "rule-stock-minimum",
        name: "Alerta de Stock Crítico e Reposição",
        description: "Dispara notificação urgente e cria tarefa de requisição quando o stock atinge o nível mínimo",
        triggerEvent: "STOCK_BELOW_MINIMUM",
        actionType: "CREATE_TASK",
        actionConfig: {
          title: "Reposição Urgente de Stock",
          priority: "URGENT",
          assignedToRole: "PURCHASER",
          description: "O artigo atingiu o stock mínimo de segurança. Proceder à emissão de cotação a fornecedores.",
        },
        active: true,
        executionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "rule-invoice-due",
        name: "Aviso de Faturas a Vencer",
        description: "Notifica a Tesouraria e Direção Financeira de faturas pendentes de liquidação a vencer em 3 dias",
        triggerEvent: "INVOICE_DUE_IN_DAYS",
        actionType: "DISPATCH_NOTIFICATION",
        actionConfig: {
          category: "FINANCIAL",
          priority: "HIGH",
          title: "Vencimento de Fatura de Fornecedor",
          module: "TREASURY",
        },
        active: true,
        executionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "rule-discount-exceeded",
        name: "Notificação de Desconto Excedido no PDV",
        description: "Emite alerta quando um operador concede desconto comercial superior à margem autorizada",
        triggerEvent: "DISCOUNT_EXCEEDED",
        actionType: "DISPATCH_NOTIFICATION",
        actionConfig: {
          category: "APPROVAL",
          priority: "URGENT",
          title: "Desconto Extraordinário no Balcão",
          module: "POS",
        },
        active: true,
        executionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "rule-closing-backup",
        name: "Backup Automático ao Fecho Diário de Caixa",
        description: "Enfileira job de backup da base de dados e integridade fiscal após fecho do dia",
        triggerEvent: "DAILY_CLOSING_COMPLETED",
        actionType: "QUEUE_JOB",
        actionConfig: {
          jobType: "DATABASE_BACKUP",
        },
        active: true,
        executionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const r of rules) {
      this.inMemoryRules.set(r.id, r);
    }
  }

  /**
   * Registers a new automation rule
   */
  public static async registerRule(data: {
    name: string;
    description?: string;
    triggerEvent: TriggerEventType;
    conditionExpression?: Record<string, unknown>;
    actionType: RuleActionType;
    actionConfig: Record<string, unknown>;
    companyId?: string;
    active?: boolean;
  }): Promise<AutomationRuleData> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const rule: AutomationRuleData = {
      id,
      name: data.name,
      description: data.description,
      triggerEvent: data.triggerEvent,
      conditionExpression: data.conditionExpression,
      actionType: data.actionType,
      actionConfig: data.actionConfig,
      companyId: data.companyId,
      active: data.active ?? true,
      executionCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.inMemoryRules.set(id, rule);

    try {
      await prisma.automationRule.create({
        data: {
          id: rule.id,
          name: rule.name,
          description: rule.description ?? null,
          triggerEvent: rule.triggerEvent,
          conditionExpression: rule.conditionExpression ? JSON.parse(JSON.stringify(rule.conditionExpression)) : undefined,
          actionType: rule.actionType,
          actionConfig: JSON.parse(JSON.stringify(rule.actionConfig)),
          companyId: rule.companyId ?? null,
          active: rule.active,
        },
      });
    } catch {
      // In-memory fallback
    }

    return rule;
  }

  /**
   * Updates an existing rule
   */
  public static updateRule(id: string, updates: Partial<AutomationRuleData>): AutomationRuleData {
    const rule = this.inMemoryRules.get(id);
    if (!rule) {
      throw new Error(`Regra de automação não encontrada: ${id}`);
    }

    Object.assign(rule, updates, { updatedAt: new Date().toISOString() });
    return rule;
  }

  /**
   * Lists configured automation rules
   */
  public static listRules(companyId?: string): AutomationRuleData[] {
    let list = Array.from(this.inMemoryRules.values());
    if (companyId) {
      list = list.filter((r) => !r.companyId || r.companyId === companyId);
    }
    return list;
  }

  /**
   * Evaluates rules matching an event and executes their actions
   */
  public static async triggerEvent(
    triggerEvent: TriggerEventType,
    context: {
      companyId?: string;
      entityName?: string;
      entityId?: string;
      payload: Record<string, any>;
    }
  ): Promise<{ executed: number; logs: AutomationExecutionLogData[] }> {
    const matchingRules = Array.from(this.inMemoryRules.values()).filter(
      (r) => r.active && r.triggerEvent === triggerEvent && (!r.companyId || !context.companyId || r.companyId === context.companyId)
    );

    const executionResults: AutomationExecutionLogData[] = [];

    for (const rule of matchingRules) {
      let isMatch = true;

      // Evaluate condition expressions if present
      if (rule.conditionExpression) {
        for (const [key, expectedValue] of Object.entries(rule.conditionExpression)) {
          const actualValue = context.payload[key];
          if (typeof expectedValue === "object" && expectedValue !== null) {
            const exp = expectedValue as any;
            if (exp.$lt !== undefined && actualValue >= exp.$lt) isMatch = false;
            if (exp.$gt !== undefined && actualValue <= exp.$gt) isMatch = false;
            if (exp.$lte !== undefined && actualValue > exp.$lte) isMatch = false;
            if (exp.$gte !== undefined && actualValue < exp.$gte) isMatch = false;
          } else if (actualValue !== expectedValue) {
            isMatch = false;
          }
        }
      }

      const logId = crypto.randomUUID();
      const now = new Date().toISOString();

      if (!isMatch) {
        executionResults.push({
          id: logId,
          ruleId: rule.id,
          ruleName: rule.name,
          companyId: context.companyId,
          triggerEvent,
          entityName: context.entityName,
          entityId: context.entityId,
          status: "SKIPPED",
          details: { reason: "Condition expression not met" },
          executedAt: now,
        });
        continue;
      }

      // Execute action
      try {
        if (rule.actionType === "DISPATCH_NOTIFICATION") {
          EnterpriseNotificationService.dispatch({
            type: (rule.actionConfig.type as any) ?? "WARNING",
            category: (rule.actionConfig.category as any) ?? "SYSTEM",
            priority: (rule.actionConfig.priority as any) ?? "NORMAL",
            title: (rule.actionConfig.title as string) || `Automação: ${rule.name}`,
            message: `${context.payload.message || `Disparado por evento ${triggerEvent} em ${context.entityName ?? "Sistema"}`}`,
            module: (rule.actionConfig.module as string) || "AUTOMATION",
            companyId: context.companyId,
          });
        } else if (rule.actionType === "CREATE_TASK") {
          await EnterpriseTaskService.createTask({
            title: `${rule.actionConfig.title || rule.name}: ${context.payload.productName || context.entityName || "Item"}`,
            description: (rule.actionConfig.description as string) || `Tarefa gerada automaticamente pelo motor de regras corporativo. Detalhes: ${JSON.stringify(context.payload)}`,
            priority: (rule.actionConfig.priority as any) ?? "HIGH",
            relatedEntityType: context.entityName,
            relatedEntityId: context.entityId,
            companyId: context.companyId,
          });
        }

        rule.executionCount += 1;
        rule.lastExecutedAt = now;

        const logItem: AutomationExecutionLogData = {
          id: logId,
          ruleId: rule.id,
          ruleName: rule.name,
          companyId: context.companyId,
          triggerEvent,
          entityName: context.entityName,
          entityId: context.entityId,
          status: "SUCCESS",
          details: { payload: context.payload, actionExecuted: rule.actionType },
          executedAt: now,
        };

        executionResults.push(logItem);
        this.inMemoryLogs.unshift(logItem);
        if (this.inMemoryLogs.length > this.MAX_LOGS) this.inMemoryLogs.pop();
      } catch (err: any) {
        const errorLog: AutomationExecutionLogData = {
          id: logId,
          ruleId: rule.id,
          ruleName: rule.name,
          companyId: context.companyId,
          triggerEvent,
          entityName: context.entityName,
          entityId: context.entityId,
          status: "FAILED",
          details: { error: err.message },
          executedAt: now,
        };
        executionResults.push(errorLog);
        this.inMemoryLogs.unshift(errorLog);
      }
    }

    return {
      executed: executionResults.filter((l) => l.status === "SUCCESS").length,
      logs: executionResults,
    };
  }

  /**
   * Returns recent automation execution logs
   */
  public static getLogs(limit = 100): AutomationExecutionLogData[] {
    return this.inMemoryLogs.slice(0, limit);
  }
}
