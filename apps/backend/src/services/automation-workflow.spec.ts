import test from "node:test";
import assert from "node:assert/strict";
import {
  EnterpriseWorkflowService,
  EnterpriseTaskService,
  EnterpriseRulesService,
  EnterpriseQueueService,
  EnterpriseNotificationService,
} from "./enterprise/index.js";

test("EnterpriseWorkflowService: has default enterprise workflow definitions loaded", async () => {
  const definitions = await EnterpriseWorkflowService.listDefinitions();
  assert.ok(definitions.length >= 4, "Deve carregar no mínimo 4 templates de workflow corporativo");

  const purchaseWf = EnterpriseWorkflowService.getDefinition("Purchase");
  assert.ok(purchaseWf, "Deve existir workflow para Compras (Purchase)");
  assert.equal(purchaseWf.entityName, "Purchase");
  assert.ok(purchaseWf.approvalRules.length >= 3, "Workflow de compras deve ter matriz multinível com 3 escalões");

  const paymentWf = EnterpriseWorkflowService.getDefinition("AccountPayable");
  assert.ok(paymentWf, "Deve existir workflow para Pagamentos e Tesouraria");

  const transferWf = EnterpriseWorkflowService.getDefinition("StockTransfer");
  assert.ok(transferWf, "Deve existir workflow para Transferência de Stock");
});

test("EnterpriseWorkflowService: evaluates multi-level approval thresholds correctly based on value in Kwanza", async () => {
  // Test Level 1: 300.000 Kz (30.000.000 cents) -> 1 level required
  const inst1 = await EnterpriseWorkflowService.createInstance({
    workflowIdOrEntity: "Purchase",
    entityId: "PO-001",
    amountCents: 30_000_000,
    initiatedById: "user-buyer-1",
  });
  assert.equal(inst1.requiredLevels, 1, "Compra de 300.000 Kz deve exigir 1 nível de aprovação");
  assert.equal(inst1.approvalSteps.length, 1);
  assert.equal(inst1.approvalSteps[0]?.requiredRole, "SUPERVISOR");

  // Test Level 2: 2.000.000 Kz (200.000.000 cents) -> 2 levels required
  const inst2 = await EnterpriseWorkflowService.createInstance({
    workflowIdOrEntity: "Purchase",
    entityId: "PO-002",
    amountCents: 200_000_000,
    initiatedById: "user-buyer-1",
  });
  assert.equal(inst2.requiredLevels, 2, "Compra de 2.000.000 Kz deve exigir 2 níveis de aprovação");
  assert.equal(inst2.approvalSteps.length, 2);
  assert.equal(inst2.approvalSteps[1]?.requiredRole, "FINANCIAL_DIRECTOR");

  // Test Level 3: 15.000.000 Kz (1.500.000.000 cents) -> 3 levels required
  const inst3 = await EnterpriseWorkflowService.createInstance({
    workflowIdOrEntity: "Purchase",
    entityId: "PO-003",
    amountCents: 1_500_000_000,
    initiatedById: "user-buyer-1",
  });
  assert.equal(inst3.requiredLevels, 3, "Compra de 15.000.000 Kz deve exigir 3 níveis (Administração)");
  assert.equal(inst3.approvalSteps.length, 3);
  assert.equal(inst3.approvalSteps[2]?.requiredRole, "ADMIN");
});

test("EnterpriseWorkflowService: executes full multi-step approval lifecycle with timeline tracking", async () => {
  // 1. Create a 2-level purchase instance
  const instance = await EnterpriseWorkflowService.createInstance({
    workflowIdOrEntity: "Purchase",
    entityId: "PO-MULTI-01",
    amountCents: 100_000_000, // 1.000.000 Kz
    initiatedById: "initiator-123",
  });
  assert.equal(instance.currentStateCode, "DRAFT");
  assert.equal(instance.status, "IN_PROGRESS");

  // 2. Submit for approval
  const submitted = await EnterpriseWorkflowService.executeAction({
    instanceId: instance.id,
    action: "SUBMIT",
    actorId: "initiator-123",
  });
  assert.equal(submitted.currentStateCode, "IN_APPROVAL");
  assert.equal(submitted.currentApprovalLevel, 1);

  // 3. Level 1 Approval (Supervisor)
  const afterLevel1 = await EnterpriseWorkflowService.executeAction({
    instanceId: instance.id,
    action: "APPROVE",
    actorId: "supervisor-1",
    actorRole: "SUPERVISOR",
    actorName: "Chefe de Compras",
    comments: "Orçamento e cotações verificadas e validadas.",
  });
  // Since requiredLevels is 2, it should remain IN_APPROVAL but advance to level 2
  assert.equal(afterLevel1.currentApprovalLevel, 2);
  assert.equal(afterLevel1.status, "IN_PROGRESS");
  assert.equal(afterLevel1.approvalSteps[0]?.status, "APPROVED");

  // 4. Level 2 Approval (Financial Director)
  const afterLevel2 = await EnterpriseWorkflowService.executeAction({
    instanceId: instance.id,
    action: "APPROVE",
    actorId: "director-1",
    actorRole: "FINANCIAL_DIRECTOR",
    actorName: "Diretor Financeiro",
    comments: "Pagamento aprovado no plano de tesouraria.",
  });
  assert.equal(afterLevel2.status, "APPROVED");
  assert.equal(afterLevel2.currentStateCode, "APPROVED");
  assert.equal(afterLevel2.approvalSteps[1]?.status, "APPROVED");

  // 5. Verify timeline entries
  assert.ok(afterLevel2.timeline.length >= 4, "A timeline deve conter todos os passos registados");
  const actionsInTimeline = afterLevel2.timeline.map((t) => t.action);
  assert.ok(actionsInTimeline.includes("CREATED"));
  assert.ok(actionsInTimeline.includes("SUBMIT"));
  assert.ok(actionsInTimeline.includes("APPROVE"));
});

test("EnterpriseWorkflowService: rejects when required comment is missing and records reason on rejection", async () => {
  const instance = await EnterpriseWorkflowService.createInstance({
    workflowIdOrEntity: "Purchase",
    entityId: "PO-REJ-01",
    amountCents: 50_000_000,
  });

  // Rejection without comments must throw error
  await assert.rejects(
    async () => {
      await EnterpriseWorkflowService.executeAction({
        instanceId: instance.id,
        action: "REJECT",
        actorId: "manager-1",
        comments: "",
      });
    },
    /motivo\/justificação/i,
    "Rejeição sem motivo deve falhar"
  );

  // Rejection with comments succeeds and sets status to REJECTED
  const rejected = await EnterpriseWorkflowService.executeAction({
    instanceId: instance.id,
    action: "REJECT",
    actorId: "manager-1",
    comments: "Preço do fornecedor superior à tabela acordada.",
  });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.currentStateCode, "REJECTED");
  assert.equal(rejected.approvalSteps[0]?.status, "REJECTED");
  assert.equal(rejected.approvalSteps[0]?.comments, "Preço do fornecedor superior à tabela acordada.");
});

test("EnterpriseWorkflowService: supports revision request and delegation", async () => {
  const instance = await EnterpriseWorkflowService.createInstance({
    workflowIdOrEntity: "Purchase",
    entityId: "PO-REV-01",
    amountCents: 50_000_000,
  });

  // Request revision
  const revision = await EnterpriseWorkflowService.executeAction({
    instanceId: instance.id,
    action: "REQUEST_REVISION",
    actorId: "supervisor-1",
    comments: "Favor anexar segunda cotação comparativa de fornecedor.",
  });
  assert.equal(revision.status, "REVISION");
  assert.equal(revision.currentStateCode, "REVISION");

  // Delegate approval
  const delegated = await EnterpriseWorkflowService.executeAction({
    instanceId: instance.id,
    action: "DELEGATE",
    actorId: "supervisor-1",
    delegatedToId: "substitute-manager-99",
    comments: "Delegação durante período de ausência.",
  });
  assert.equal(delegated.approvalSteps[0]?.status, "DELEGATED");
  assert.equal(delegated.approvalSteps[0]?.delegatedToId, "substitute-manager-99");
});

test("EnterpriseTaskService: creates, updates, and tracks internal tasks linked to business entities", async () => {
  const task = await EnterpriseTaskService.createTask({
    title: "Conferência Física de Stock",
    description: "Contagem cíclica da prateleira A2 no Armazém Central",
    priority: "HIGH",
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    assignedToId: "user-stockist-1",
    relatedEntityType: "StockLocation",
    relatedEntityId: "loc-central-a2",
  });

  assert.ok(task.id, "Tarefa deve ter ID gerado");
  assert.equal(task.priority, "HIGH");
  assert.equal(task.status, "PENDING");
  assert.equal(task.progressPercent, 0);

  // Add comment
  const comment = await EnterpriseTaskService.addComment(
    task.id,
    "Iniciada contagem dos primeiros 50 itens.",
    "Operador de Armazém"
  );
  assert.ok(comment.id);
  assert.equal(comment.comment, "Iniciada contagem dos primeiros 50 itens.");

  // Update progress to 100% -> should auto-complete
  const completed = await EnterpriseTaskService.updateTask(task.id, {
    progressPercent: 100,
  });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.progressPercent, 100);
  assert.ok(completed.completedAt, "Deve registar timestamp de conclusão");

  // Verify task metrics
  const metrics = EnterpriseTaskService.getTaskMetrics();
  assert.ok(metrics.total >= 1);
  assert.ok(metrics.completed >= 1);
});

test("EnterpriseRulesService: evaluates triggers, matches conditions, and dispatches actions", async () => {
  // Test trigger: STOCK_BELOW_MINIMUM
  const eventResult = await EnterpriseRulesService.triggerEvent("STOCK_BELOW_MINIMUM", {
    entityName: "Product",
    entityId: "prod-arroz-25kg",
    payload: {
      productName: "Arroz Agulha 25kg",
      currentStock: 3,
      minimumStock: 10,
    },
  });

  assert.ok(eventResult.executed >= 1, "Regra padrão de stock mínimo deve ser executada");
  assert.equal(eventResult.logs[0]?.status, "SUCCESS");
  assert.equal(eventResult.logs[0]?.entityName, "Product");

  // Verify recent execution logs
  const logs = EnterpriseRulesService.getLogs(10);
  assert.ok(logs.length >= 1);
  assert.equal(logs[0]?.triggerEvent, "STOCK_BELOW_MINIMUM");
});

test("EnterpriseQueueService: enqueues background jobs and updates progress through execution", async () => {
  // Enqueue a SAF-T export job
  const job = await EnterpriseQueueService.enqueue("EXPORT_SAFT", {
    period: "2026-10",
    format: "XML_AO",
  });

  assert.ok(job.id);
  assert.equal(job.type, "EXPORT_SAFT");
  assert.equal(job.status, "QUEUED");
  assert.equal(job.progress, 0);

  // Process job
  const processed = await EnterpriseQueueService.processJob(job.id);
  assert.equal(processed.status, "COMPLETED");
  assert.equal(processed.progress, 100);
  assert.ok(processed.result);
  assert.ok(processed.completedAt);

  // Enqueue and cancel job
  const jobToCancel = await EnterpriseQueueService.enqueue("GENERATE_REPORT", { report: "SALES" });
  const cancelled = EnterpriseQueueService.cancelJob(jobToCancel.id);
  assert.equal(cancelled.status, "CANCELLED");

  // Queue metrics
  const metrics = EnterpriseQueueService.getQueueMetrics();
  assert.ok(metrics.total >= 2);
  assert.ok(metrics.completed >= 1);
});

test("EnterpriseNotificationService: supports categories, priorities, filtering and mark-as-read", () => {
  const notif = EnterpriseNotificationService.create({
    title: "Alerta de Faturação",
    message: "Fatura emitida com sucesso.",
    type: "SUCCESS",
    category: "FINANCIAL",
    priority: "NORMAL",
  });

  assert.ok(notif.id);
  assert.equal(notif.read, false);
  assert.equal(notif.category, "FINANCIAL");

  // Mark as read
  const marked = EnterpriseNotificationService.markAsRead(notif.id);
  assert.equal(marked, true);

  // Check stats
  const stats = EnterpriseNotificationService.getStats();
  assert.ok(stats.total >= 1);
});
