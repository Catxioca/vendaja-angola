import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  requireAuth,
  normalizeRole,
  type AuthRequest,
} from "../middleware/auth.js";
import {
  EnterpriseWorkflowService,
  EnterpriseTaskService,
  EnterpriseRulesService,
  EnterpriseQueueService,
  EnterpriseNotificationService,
  type WorkflowAction,
  type TaskPriority,
  type TaskStatus,
  type TriggerEventType,
  type JobType,
} from "../services/enterprise/index.js";

export const automationWorkflowRouter = Router();

// Helper to extract companyId from request header or auth context
function resolveCompanyId(req: Request): string | undefined {
  const auth = req as AuthRequest;
  const headerVal = req.header ? req.header("x-company-id") : (req.headers && req.headers["x-company-id"]);
  return (
    auth.context?.companyId ??
    (typeof headerVal === "string" ? headerVal : undefined)
  );
}

// Helper to safely extract string param from req.params
function getParam(req: Request, paramName: string): string {
  const val = req.params[paramName];
  if (Array.isArray(val)) return val[0] || "";
  return val ? String(val) : "";
}

// =========================================================================
// 1. DASHBOARD OPERACIONAL & COCKPIT DE AUTOMAÇÃO
// =========================================================================

automationWorkflowRouter.get("/dashboard", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const auth = req as AuthRequest;
  const userRole = normalizeRole(auth.context?.role ?? auth.user?.role);
  const userId = auth.user?.id;

  const workflows = await EnterpriseWorkflowService.listDefinitions(companyId);
  const instances = EnterpriseWorkflowService.listInstances({ companyId });
  const pendingApprovals = EnterpriseWorkflowService.getPendingApprovals({
    userRole,
    userId,
    companyId,
  });

  const taskMetrics = EnterpriseTaskService.getTaskMetrics(companyId);
  const notificationStats = EnterpriseNotificationService.getStats(companyId, userId);
  const queueMetrics = EnterpriseQueueService.getQueueMetrics(companyId);
  const rules = EnterpriseRulesService.listRules(companyId);

  res.json({
    operationalCockpit: {
      workflows: {
        totalDefinitions: workflows.length,
        activeInstances: instances.filter((i) => i.status === "IN_PROGRESS").length,
        pendingApprovalsForUser: pendingApprovals.length,
        completedInstances: instances.filter((i) => i.status === "APPROVED").length,
      },
      tasks: taskMetrics,
      notifications: notificationStats,
      queue: queueMetrics,
      rules: {
        activeRules: rules.filter((r) => r.active).length,
        totalRules: rules.length,
      },
    },
    pendingApprovals,
    recentTasks: EnterpriseTaskService.listTasks({ companyId }).slice(0, 5),
    recentNotifications: EnterpriseNotificationService.list({ companyId, userId }).slice(0, 5),
  });
});

// =========================================================================
// 2. MOTOR DE WORKFLOW CORPORATIVO & APROVAÇÕES MULTINÍVEL
// =========================================================================

// List workflow definitions
automationWorkflowRouter.get("/workflows", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const definitions = await EnterpriseWorkflowService.listDefinitions(companyId);
  res.json(definitions);
});

// Get workflow definition by ID
automationWorkflowRouter.get("/workflows/:id", requireAuth, async (req: Request, res: Response) => {
  const def = EnterpriseWorkflowService.getDefinition(getParam(req, "id"));
  if (!def) {
    return res.status(404).json({ error: "not_found", message: "Definição de workflow não encontrada" });
  }
  res.json(def);
});

// List workflow instances
automationWorkflowRouter.get("/instances", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { entityName, status, workflowId } = req.query;

  const instances = EnterpriseWorkflowService.listInstances({
    companyId,
    entityName: typeof entityName === "string" ? entityName : undefined,
    status: typeof status === "string" ? status : undefined,
    workflowId: typeof workflowId === "string" ? workflowId : undefined,
  });

  res.json(instances);
});

// Pending approvals for currently logged in user / role
automationWorkflowRouter.get("/approvals/pending", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const auth = req as AuthRequest;
  const userRole = normalizeRole(auth.context?.role ?? auth.user?.role);
  const userId = auth.user?.id;

  const pending = EnterpriseWorkflowService.getPendingApprovals({
    userRole,
    userId,
    companyId,
  });

  res.json(pending);
});

// Get workflow instance by ID with timeline & approval steps
automationWorkflowRouter.get("/instances/:id", requireAuth, async (req: Request, res: Response) => {
  const instance = EnterpriseWorkflowService.getInstance(getParam(req, "id"));
  if (!instance) {
    return res.status(404).json({ error: "not_found", message: "Instância de workflow não encontrada" });
  }
  res.json(instance);
});

// Create / Start a workflow instance
const createInstanceSchema = z.object({
  workflowIdOrEntity: z.string().min(1),
  entityId: z.string().min(1),
  entityName: z.string().optional(),
  amountCents: z.union([z.number(), z.string()]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

automationWorkflowRouter.post("/instances", requireAuth, async (req: Request, res: Response) => {
  const parse = createInstanceSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "bad_request", details: parse.error.issues });
  }

  const companyId = resolveCompanyId(req);
  const auth = req as AuthRequest;
  const initiatedById = auth.user?.id;

  try {
    const instance = await EnterpriseWorkflowService.createInstance({
      workflowIdOrEntity: parse.data.workflowIdOrEntity,
      entityId: parse.data.entityId,
      entityName: parse.data.entityName,
      companyId,
      amountCents: parse.data.amountCents !== undefined ? BigInt(parse.data.amountCents) : undefined,
      initiatedById,
      metadata: parse.data.metadata,
    });
    res.status(201).json(instance);
  } catch (err: any) {
    res.status(400).json({ error: "workflow_error", message: err.message });
  }
});

// Execute action on workflow instance (APPROVE, REJECT, REQUEST_REVISION, DELEGATE, CANCEL, SUBMIT)
const executeActionSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "REJECT", "REQUEST_REVISION", "DELEGATE", "CANCEL"]),
  comments: z.string().optional(),
  delegatedToId: z.string().optional(),
});

automationWorkflowRouter.post("/instances/:id/actions", requireAuth, async (req: Request, res: Response) => {
  const parse = executeActionSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "bad_request", details: parse.error.issues });
  }

  const auth = req as AuthRequest;
  const actorId = auth.user?.id ?? "unknown";
  const actorName = "Operador";
  const actorRole = normalizeRole(auth.context?.role ?? auth.user?.role);

  try {
    const updated = await EnterpriseWorkflowService.executeAction({
      instanceId: getParam(req, "id"),
      action: parse.data.action as WorkflowAction,
      actorId,
      actorRole,
      actorName,
      comments: parse.data.comments,
      delegatedToId: parse.data.delegatedToId,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: "workflow_action_error", message: err.message });
  }
});

// =========================================================================
// 3. GESTÃO DE TAREFAS & ATIVIDADES INTERNAS (ODOO-STYLE)
// =========================================================================

// List internal tasks
automationWorkflowRouter.get("/tasks", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { status, priority, assignedToId, relatedEntityType, relatedEntityId } = req.query;

  const tasks = EnterpriseTaskService.listTasks({
    companyId,
    status: typeof status === "string" ? (status as TaskStatus) : undefined,
    priority: typeof priority === "string" ? (priority as TaskPriority) : undefined,
    assignedToId: typeof assignedToId === "string" ? assignedToId : undefined,
    relatedEntityType: typeof relatedEntityType === "string" ? relatedEntityType : undefined,
    relatedEntityId: typeof relatedEntityId === "string" ? relatedEntityId : undefined,
  });

  res.json(tasks);
});

// Task cockpit metrics
automationWorkflowRouter.get("/tasks/metrics", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const metrics = EnterpriseTaskService.getTaskMetrics(companyId);
  res.json(metrics);
});

// Create internal task
const createTaskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().optional(),
  assignedToId: z.string().optional(),
  assignedToName: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
});

automationWorkflowRouter.post("/tasks", requireAuth, async (req: Request, res: Response) => {
  const parse = createTaskSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "bad_request", details: parse.error.issues });
  }

  const companyId = resolveCompanyId(req);
  const auth = req as AuthRequest;
  const createdById = auth.user?.id;

  const task = await EnterpriseTaskService.createTask({
    ...parse.data,
    companyId,
    createdById,
  });

  res.status(201).json(task);
});

// Update task
const updateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  dueDate: z.string().optional(),
  assignedToId: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
});

automationWorkflowRouter.patch("/tasks/:id", requireAuth, async (req: Request, res: Response) => {
  const parse = updateTaskSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "bad_request", details: parse.error.issues });
  }

  try {
    const updated = await EnterpriseTaskService.updateTask(getParam(req, "id"), parse.data);
    res.json(updated);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

// Add comment to task
const addCommentSchema = z.object({
  comment: z.string().min(1),
});

automationWorkflowRouter.post("/tasks/:id/comments", requireAuth, async (req: Request, res: Response) => {
  const parse = addCommentSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "bad_request", details: parse.error.issues });
  }

  const auth = req as AuthRequest;
  const userId = auth.user?.id;
  const authorName = "Colaborador";

  try {
    const comment = await EnterpriseTaskService.addComment(
      getParam(req, "id"),
      parse.data.comment,
      authorName,
      userId
    );
    res.status(201).json(comment);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

// =========================================================================
// 4. CENTRO DE NOTIFICAÇÕES CORPORATIVAS
// =========================================================================

automationWorkflowRouter.get("/notifications", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const auth = req as AuthRequest;
  const userId = auth.user?.id;
  const { unreadOnly, category, priority } = req.query;

  const notifications = EnterpriseNotificationService.list({
    companyId,
    userId,
    unreadOnly: unreadOnly === "true",
    category: typeof category === "string" ? (category as any) : undefined,
    priority: typeof priority === "string" ? (priority as any) : undefined,
  });

  res.json(notifications);
});

automationWorkflowRouter.get("/notifications/stats", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const auth = req as AuthRequest;
  const userId = auth.user?.id;
  res.json(EnterpriseNotificationService.getStats(companyId, userId));
});

automationWorkflowRouter.post("/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
  const ok = EnterpriseNotificationService.markAsRead(getParam(req, "id"));
  res.json({ success: ok });
});

automationWorkflowRouter.post("/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const auth = req as AuthRequest;
  const userId = auth.user?.id;
  const count = EnterpriseNotificationService.markAllAsRead(companyId, userId);
  res.json({ markedRead: count });
});

automationWorkflowRouter.post("/notifications/:id/archive", requireAuth, async (req: Request, res: Response) => {
  const ok = EnterpriseNotificationService.archive(getParam(req, "id"));
  res.json({ archived: ok });
});

// =========================================================================
// 5. MOTOR DE REGRAS & AUTOMAÇÃO DE EVENTOS
// =========================================================================

automationWorkflowRouter.get("/rules", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  res.json(EnterpriseRulesService.listRules(companyId));
});

const registerRuleSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  triggerEvent: z.enum([
    "STOCK_BELOW_MINIMUM",
    "INVOICE_DUE_IN_DAYS",
    "PURCHASE_APPROVED",
    "PURCHASE_CREATED",
    "EMPLOYEE_ADMITTED",
    "DISCOUNT_EXCEEDED",
    "DAILY_CLOSING_COMPLETED",
    "BACKUP_FAILED",
  ]),
  conditionExpression: z.record(z.unknown()).optional(),
  actionType: z.enum(["DISPATCH_NOTIFICATION", "CREATE_TASK", "QUEUE_JOB", "TRIGGER_WORKFLOW"]),
  actionConfig: z.record(z.unknown()),
  active: z.boolean().optional(),
});

automationWorkflowRouter.post("/rules", requireAuth, async (req: Request, res: Response) => {
  const parse = registerRuleSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "bad_request", details: parse.error.issues });
  }

  const companyId = resolveCompanyId(req);
  const rule = await EnterpriseRulesService.registerRule({
    ...parse.data,
    companyId,
  });

  res.status(201).json(rule);
});

automationWorkflowRouter.patch("/rules/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const updated = EnterpriseRulesService.updateRule(getParam(req, "id"), req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

const triggerEventSchema = z.object({
  triggerEvent: z.string().min(1),
  entityName: z.string().optional(),
  entityId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

automationWorkflowRouter.post("/rules/trigger", requireAuth, async (req: Request, res: Response) => {
  const parse = triggerEventSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "bad_request", details: parse.error.issues });
  }

  const companyId = resolveCompanyId(req);
  const result = await EnterpriseRulesService.triggerEvent(
    parse.data.triggerEvent as TriggerEventType,
    {
      companyId,
      entityName: parse.data.entityName,
      entityId: parse.data.entityId,
      payload: parse.data.payload,
    }
  );

  res.json(result);
});

automationWorkflowRouter.get("/rules/logs", requireAuth, async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json(EnterpriseRulesService.getLogs(limit));
});

// =========================================================================
// 6. FILA DE PROCESSAMENTO ASSÍNCRONO (JOB QUEUE)
// =========================================================================

automationWorkflowRouter.get("/queue", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { type, status } = req.query;

  const jobs = EnterpriseQueueService.listJobs({
    companyId,
    type: typeof type === "string" ? (type as JobType) : undefined,
    status: typeof status === "string" ? (status as any) : undefined,
  });

  res.json(jobs);
});

automationWorkflowRouter.get("/queue/metrics", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  res.json(EnterpriseQueueService.getQueueMetrics(companyId));
});

const enqueueJobSchema = z.object({
  type: z.enum([
    "EXPORT_SAFT",
    "GENERATE_REPORT",
    "DATABASE_BACKUP",
    "PAYROLL_CALCULATION",
    "STOCK_REVALUATION",
    "DATA_SYNC",
  ]),
  payload: z.record(z.unknown()).optional(),
});

automationWorkflowRouter.post("/queue", requireAuth, async (req: Request, res: Response) => {
  const parse = enqueueJobSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "bad_request", details: parse.error.issues });
  }

  const companyId = resolveCompanyId(req);
  const job = await EnterpriseQueueService.enqueue(
    parse.data.type,
    parse.data.payload ?? {},
    companyId
  );

  res.status(202).json(job);
});

automationWorkflowRouter.post("/queue/:id/process", requireAuth, async (req: Request, res: Response) => {
  try {
    const processed = await EnterpriseQueueService.processJob(getParam(req, "id"));
    res.json(processed);
  } catch (err: any) {
    res.status(400).json({ error: "job_processing_error", message: err.message });
  }
});

automationWorkflowRouter.post("/queue/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const cancelled = EnterpriseQueueService.cancelJob(getParam(req, "id"));
    res.json(cancelled);
  } catch (err: any) {
    res.status(400).json({ error: "job_cancellation_error", message: err.message });
  }
});
