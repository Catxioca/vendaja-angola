import { Router, Request, Response } from "express";
import {
  EnterpriseTenantService,
  EnterpriseSubscriptionService,
  EnterpriseMultiStoreService,
  EnterpriseCloudStorageService,
  EnterprisePlatformMonitoringService,
  EnterpriseDisasterRecoveryService,
  EnterpriseCloudSyncService,
  EnterpriseCloudUpdateService,
  type SubscriptionPlanCode,
  type TenantStatus,
  type CloudFileCategory,
} from "../services/enterprise/index.js";
import { requireAuth } from "../middleware/auth.js";

export const cloudSaasRouter = Router();

// =========================================================
// 1. SAAS TENANT MANAGEMENT (SUPERADMIN & ONBOARDING)
// =========================================================

cloudSaasRouter.post("/tenants", async (req: Request, res: Response) => {
  try {
    const { name, tradeName, nif, email, phone, address, city, province, plan, billingCycle } = req.body;
    if (!name || !nif || !email) {
      return res.status(400).json({ error: "Nome da empresa, NIF e email são obrigatórios." });
    }
    const result = await EnterpriseTenantService.createTenant({
      name,
      tradeName,
      nif,
      email,
      phone: phone || "+244 923 000 000",
      address: address || "Angola",
      city: city || "Luanda",
      province: province || "Luanda",
      plan: plan as SubscriptionPlanCode,
      billingCycle,
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/tenants", async (req: Request, res: Response) => {
  try {
    const { status, plan, search } = req.query;
    const tenants = await EnterpriseTenantService.listTenants({
      status: status as TenantStatus,
      plan: plan as SubscriptionPlanCode,
      search: search as string,
    });
    return res.json(tenants);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/tenants/:id", async (req: Request, res: Response) => {
  try {
    const tenant = await EnterpriseTenantService.getTenant(req.params.id as string);
    if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });
    return res.json(tenant);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.patch("/tenants/:id/status", async (req: Request, res: Response) => {
  try {
    const { status, reason } = req.body;
    if (!status) return res.status(400).json({ error: "Status é obrigatório." });
    const updated = await EnterpriseTenantService.updateTenantStatus(req.params.id as string, status as TenantStatus, reason);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.patch("/tenants/:id/plan", async (req: Request, res: Response) => {
  try {
    const { plan, billingCycle } = req.body;
    if (!plan) return res.status(400).json({ error: "Plano é obrigatório." });
    const updated = await EnterpriseTenantService.updateTenantPlan(req.params.id as string, plan as SubscriptionPlanCode, billingCycle);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/tenants/:id/usage", async (req: Request, res: Response) => {
  try {
    const usage = await EnterpriseTenantService.getTenantUsageSummary(req.params.id as string);
    return res.json(usage);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/overview", async (_req: Request, res: Response) => {
  try {
    const metrics = await EnterpriseTenantService.getGlobalMetrics();
    return res.json(metrics);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// =========================================================
// 2. SUBSCRIPTION PLANS & BILLING
// =========================================================

cloudSaasRouter.get("/plans", (_req: Request, res: Response) => {
  const plans = EnterpriseSubscriptionService.getPlans();
  return res.json(plans);
});

cloudSaasRouter.post("/invoices", async (req: Request, res: Response) => {
  try {
    const { tenantId, plan, billingCycle } = req.body;
    if (!tenantId || !plan) return res.status(400).json({ error: "tenantId e plan são obrigatórios." });
    const invoice = await EnterpriseSubscriptionService.issueSubscriptionInvoice({
      tenantId,
      plan: plan as SubscriptionPlanCode,
      billingCycle: billingCycle || "MONTHLY",
    });
    return res.status(201).json(invoice);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/invoices", (req: Request, res: Response) => {
  const { tenantId } = req.query;
  const invoices = EnterpriseSubscriptionService.listInvoices(tenantId as string);
  return res.json(invoices);
});

cloudSaasRouter.post("/invoices/:id/pay", async (req: Request, res: Response) => {
  try {
    const { paymentMethod } = req.body;
    const invoice = await EnterpriseSubscriptionService.recordPayment(req.params.id as string, paymentMethod);
    return res.json(invoice);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// =========================================================
// 3. MULTI-STORE (FILIAIS) & INTER-BRANCH TRANSFERS
// =========================================================

cloudSaasRouter.post("/branches", async (req: Request, res: Response) => {
  try {
    const companyId = (req.headers["x-company-id"] as string) || req.body.companyId || "default-company";
    const { code, name, address, province, phone, isHeadquarters } = req.body;
    if (!code || !name) return res.status(400).json({ error: "Código e nome da filial são obrigatórios." });

    const branch = await EnterpriseMultiStoreService.createBranch({
      companyId,
      code,
      name,
      address,
      province,
      phone,
      isHeadquarters,
    });
    return res.status(201).json(branch);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/branches", async (req: Request, res: Response) => {
  try {
    const companyId = (req.headers["x-company-id"] as string) || (req.query.companyId as string) || "default-company";
    const branches = await EnterpriseMultiStoreService.listBranches(companyId);
    return res.json(branches);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/branches/performance", async (req: Request, res: Response) => {
  try {
    const companyId = (req.headers["x-company-id"] as string) || (req.query.companyId as string) || "default-company";
    const report = await EnterpriseMultiStoreService.getBranchPerformance(companyId);
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.post("/transfers", async (req: Request, res: Response) => {
  try {
    const companyId = (req.headers["x-company-id"] as string) || req.body.companyId || "default-company";
    const { sourceBranchId, sourceWarehouseId, destinationBranchId, destinationWarehouseId, items, operatorName } = req.body;

    const transfer = await EnterpriseMultiStoreService.requestTransfer({
      companyId,
      sourceBranchId,
      sourceWarehouseId,
      destinationBranchId,
      destinationWarehouseId,
      items,
      operatorName,
    });
    return res.status(201).json(transfer);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/transfers", (req: Request, res: Response) => {
  const companyId = (req.headers["x-company-id"] as string) || (req.query.companyId as string) || "default-company";
  const { branchId } = req.query;
  const list = EnterpriseMultiStoreService.listTransfers(companyId, branchId as string);
  return res.json(list);
});

cloudSaasRouter.post("/transfers/:id/dispatch", async (req: Request, res: Response) => {
  try {
    const { approvedBy, driverName, vehiclePlate } = req.body;
    if (!driverName || !vehiclePlate) {
      return res.status(400).json({ error: "Nome do motorista e matrícula da viatura são obrigatórios para emissão da Guia de Transporte." });
    }
    const transfer = await EnterpriseMultiStoreService.approveAndDispatchTransfer({
      transferId: req.params.id as string,
      approvedBy: approvedBy || "Gerente Logística",
      driverName,
      vehiclePlate,
    });
    return res.json(transfer);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.post("/transfers/:id/receive", async (req: Request, res: Response) => {
  try {
    const { receivedBy } = req.body;
    const transfer = await EnterpriseMultiStoreService.receiveTransfer({
      transferId: req.params.id as string,
      receivedBy: receivedBy || "Rececionista Loja",
    });
    return res.json(transfer);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.post("/transfers/:id/reject", async (req: Request, res: Response) => {
  try {
    const { rejectedBy, reason } = req.body;
    const transfer = await EnterpriseMultiStoreService.rejectTransfer({
      transferId: req.params.id as string,
      rejectedBy: rejectedBy || "Gerente Loja Destino",
      reason: reason || "Mercadoria não conforme",
    });
    return res.json(transfer);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// =========================================================
// 4. CLOUD STORAGE (S3 / BLOB)
// =========================================================

cloudSaasRouter.post("/storage/upload", async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers["x-company-id"] as string) || req.body.tenantId || "default-company";
    const { category, fileName, mimeType, content, uploadedBy, metadata } = req.body;
    if (!fileName || !content) return res.status(400).json({ error: "fileName e content são obrigatórios." });

    const file = await EnterpriseCloudStorageService.uploadFile({
      tenantId,
      category: (category as CloudFileCategory) || "MISC_ATTACHMENT",
      fileName,
      mimeType: mimeType || "application/octet-stream",
      content,
      uploadedBy,
      metadata,
    });
    return res.status(201).json(file);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/storage/files", (req: Request, res: Response) => {
  const tenantId = (req.headers["x-company-id"] as string) || (req.query.tenantId as string) || "default-company";
  const { category } = req.query;
  const files = EnterpriseCloudStorageService.listFiles(tenantId, category as CloudFileCategory);
  return res.json(files);
});

cloudSaasRouter.get("/storage/files/:id/url", async (req: Request, res: Response) => {
  try {
    const presigned = await EnterpriseCloudStorageService.generatePresignedDownloadUrl(req.params.id as string);
    return res.json(presigned);
  } catch (err) {
    return res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// =========================================================
// 5. PLATFORM MONITORING & ALERTS
// =========================================================

cloudSaasRouter.get("/monitoring/health", (_req: Request, res: Response) => {
  const health = EnterprisePlatformMonitoringService.getHealthStatus();
  return res.json(health);
});

cloudSaasRouter.get("/monitoring/alerts", (req: Request, res: Response) => {
  const { severity, resolved } = req.query;
  const alerts = EnterprisePlatformMonitoringService.listAlerts({
    severity: severity as string,
    resolved: resolved !== undefined ? resolved === "true" : undefined,
  });
  return res.json(alerts);
});

cloudSaasRouter.post("/monitoring/alerts/:id/resolve", (req: Request, res: Response) => {
  const ok = EnterprisePlatformMonitoringService.resolveAlert(req.params.id as string);
  if (!ok) return res.status(404).json({ error: "Alerta não encontrado." });
  return res.json({ success: true });
});

// =========================================================
// 6. DISASTER RECOVERY & BACKUPS
// =========================================================

cloudSaasRouter.post("/dr/snapshots", async (req: Request, res: Response) => {
  try {
    const { type, sizeBytes, primaryRegion, replicatedRegions } = req.body;
    const snapshot = await EnterpriseDisasterRecoveryService.createSnapshot({
      type: type || "FULL_DAILY",
      sizeBytes: sizeBytes || 104857600, // 100 MB default
      primaryRegion,
      replicatedRegions,
    });
    return res.status(201).json(snapshot);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/dr/snapshots", (_req: Request, res: Response) => {
  const list = EnterpriseDisasterRecoveryService.listSnapshots();
  return res.json(list);
});

cloudSaasRouter.post("/dr/drills", async (req: Request, res: Response) => {
  try {
    const { drillType, executedBy } = req.body;
    const drill = await EnterpriseDisasterRecoveryService.executeDrill({ drillType, executedBy });
    return res.status(201).json(drill);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/dr/drills", (_req: Request, res: Response) => {
  const list = EnterpriseDisasterRecoveryService.listDrills();
  return res.json(list);
});

// =========================================================
// 7. HYBRID CLOUD SYNC (ONLINE / OFFLINE)
// =========================================================

cloudSaasRouter.post("/sync/push", async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers["x-company-id"] as string) || req.body.tenantId || "default-company";
    const branchId = (req.headers["x-branch-id"] as string) || req.body.branchId || "default-branch";
    const { terminalId, mutations } = req.body;

    const result = await EnterpriseCloudSyncService.pushMutations({
      tenantId,
      branchId,
      terminalId: terminalId || "TERM-01",
      mutations: mutations || [],
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

cloudSaasRouter.get("/sync/pull", async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers["x-company-id"] as string) || (req.query.tenantId as string) || "default-company";
    const { since } = req.query;
    const catalog = await EnterpriseCloudSyncService.pullCatalog(tenantId, since as string);
    return res.json(catalog);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// =========================================================
// 8. OTA UPDATES CHECK
// =========================================================

cloudSaasRouter.get("/updates/check", (req: Request, res: Response) => {
  const currentVersion = (req.query.currentVersion as string) || "2.2.2";
  const channel = (req.query.channel as any) || "stable";
  const result = EnterpriseCloudUpdateService.checkForUpdate(currentVersion, channel);
  return res.json(result);
});
