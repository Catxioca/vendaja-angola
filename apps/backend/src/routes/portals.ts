import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import {
  requireAuth,
  normalizeRole,
  type AuthRequest,
} from "../middleware/auth.js";
import {
  EnterpriseCustomerPortalService,
  EnterpriseSupplierPortalService,
  EnterpriseEmployeePortalService,
  EnterpriseMobileErpService,
} from "../services/enterprise/index.js";

export const portalsRouter = Router();

function resolveCompanyId(req: Request): string | undefined {
  const auth = req as AuthRequest;
  const headerVal = req.header ? req.header("x-company-id") : (req.headers && req.headers["x-company-id"]);
  return (
    auth.context?.companyId ??
    (typeof headerVal === "string" ? headerVal : undefined)
  );
}

function getParam(req: Request, paramName: string): string {
  const val = req.params[paramName];
  if (Array.isArray(val)) return val[0] || "";
  return val ? String(val) : "";
}

/**
 * Strict RBAC middleware for portal-specific endpoints
 */
function requirePortalRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req as AuthRequest;
    const userRole = normalizeRole(auth.user?.role || auth.context?.role);

    // Administrative overrides
    if (userRole === "ROLE_ADMIN" || allowedRoles.includes(userRole)) {
      next();
      return;
    }

    res.status(403).json({
      error: "forbidden",
      message: "Acesso não autorizado para o seu perfil.",
    });
  };
}

// =========================================================================
// 1. AUTENTICAÇÃO DOS PORTAIS SELF-SERVICE (PUBLIC ROUTES)
// =========================================================================

portalsRouter.post("/auth/customer-login", async (req: Request, res: Response) => {
  const { identifier, secret } = req.body;
  const companyId = resolveCompanyId(req);

  if (!identifier || !secret) {
    res.status(400).json({ error: "missing_credentials", message: "Identificador (Email ou NIF) e PIN são obrigatórios." });
    return;
  }

  const result = await EnterpriseCustomerPortalService.authenticateCustomer(identifier, secret, companyId);
  if (!result) {
    res.status(401).json({ error: "invalid_credentials", message: "Credenciais de cliente inválidas ou inativas." });
    return;
  }

  res.json(result);
});

portalsRouter.post("/auth/supplier-login", async (req: Request, res: Response) => {
  const { identifier, secret } = req.body;
  const companyId = resolveCompanyId(req);

  if (!identifier || !secret) {
    res.status(400).json({ error: "missing_credentials", message: "Identificador (Email ou NIF) e credencial de acesso são obrigatórios." });
    return;
  }

  const result = await EnterpriseSupplierPortalService.authenticateSupplier(identifier, secret, companyId);
  if (!result) {
    res.status(401).json({ error: "invalid_credentials", message: "Credenciais de fornecedor inválidas ou inativas." });
    return;
  }

  res.json(result);
});

portalsRouter.post("/auth/employee-login", async (req: Request, res: Response) => {
  const { identifier, secret } = req.body;
  const companyId = resolveCompanyId(req);

  if (!identifier || !secret) {
    res.status(400).json({ error: "missing_credentials", message: "NIF ou INSS e PIN de acesso são obrigatórios." });
    return;
  }

  const result = await EnterpriseEmployeePortalService.authenticateEmployee(identifier, secret, companyId);
  if (!result) {
    res.status(401).json({ error: "invalid_credentials", message: "Credenciais de colaborador inválidas ou inativas." });
    return;
  }

  res.json(result);
});

// =========================================================================
// 2. PORTAL DO CLIENTE (CUSTOMER SELF-SERVICE)
// =========================================================================

const customerGuard = [requireAuth, requirePortalRole("ROLE_PORTAL_CUSTOMER", "ROLE_ACCOUNTANT")];

portalsRouter.get("/customer/dashboard", ...customerGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const customerId = (auth.user as any)?.customerId || auth.user?.id;
  const companyId = resolveCompanyId(req);

  if (!customerId) {
    res.status(400).json({ error: "customer_id_required" });
    return;
  }

  const dashboard = await EnterpriseCustomerPortalService.getDashboard(customerId, companyId);
  if (!dashboard) {
    res.status(404).json({ error: "customer_not_found", message: "Conta de cliente não encontrada." });
    return;
  }
  res.json(dashboard);
});

portalsRouter.get("/customer/statement", ...customerGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const customerId = (auth.user as any)?.customerId || auth.user?.id;
  const { from, to } = req.query;

  if (!customerId) {
    res.status(400).json({ error: "customer_id_required" });
    return;
  }

  const statement = await EnterpriseCustomerPortalService.getStatement(customerId, {
    from: typeof from === "string" ? from : undefined,
    to: typeof to === "string" ? to : undefined,
  });
  res.json(statement);
});

portalsRouter.post("/customer/payment-reference", ...customerGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const customerId = (auth.user as any)?.customerId || auth.user?.id;
  const { documentId, amountCents } = req.body;

  if (!customerId || !documentId) {
    res.status(400).json({ error: "document_id_required" });
    return;
  }

  const reference = await EnterpriseCustomerPortalService.generatePaymentReference(customerId, documentId, amountCents);
  if (!reference) {
    res.status(404).json({ error: "document_not_found", message: "Documento de faturação não encontrado para este cliente." });
    return;
  }
  res.json(reference);
});

portalsRouter.patch("/customer/profile", ...customerGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const customerId = (auth.user as any)?.customerId || auth.user?.id;
  const { phone, email, address } = req.body;

  if (!customerId) {
    res.status(400).json({ error: "customer_id_required" });
    return;
  }

  const result = await EnterpriseCustomerPortalService.updateCustomerProfile(customerId, { phone, email, address });
  if (!result) {
    res.status(404).json({ error: "customer_not_found", message: "Não foi possível atualizar o perfil do cliente." });
    return;
  }
  res.json(result);
});

// =========================================================================
// 3. PORTAL DO FORNECEDOR (SUPPLIER SELF-SERVICE)
// =========================================================================

const supplierGuard = [requireAuth, requirePortalRole("ROLE_PORTAL_SUPPLIER", "ROLE_ACCOUNTANT")];

portalsRouter.get("/supplier/dashboard", ...supplierGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const supplierId = (auth.user as any)?.supplierId || auth.user?.id;
  const companyId = resolveCompanyId(req);

  if (!supplierId) {
    res.status(400).json({ error: "supplier_id_required" });
    return;
  }

  const dashboard = await EnterpriseSupplierPortalService.getDashboard(supplierId, companyId);
  if (!dashboard) {
    res.status(404).json({ error: "supplier_not_found", message: "Conta de fornecedor não encontrada." });
    return;
  }
  res.json(dashboard);
});

portalsRouter.get("/supplier/orders", ...supplierGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const supplierId = (auth.user as any)?.supplierId || auth.user?.id;
  const orders = await EnterpriseSupplierPortalService.listPurchaseOrders(supplierId);
  res.json(orders);
});

portalsRouter.get("/supplier/receipts", ...supplierGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const supplierId = (auth.user as any)?.supplierId || auth.user?.id;
  const receipts = await EnterpriseSupplierPortalService.listGoodsReceipts(supplierId);
  res.json(receipts);
});

portalsRouter.get("/supplier/payments", ...supplierGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const supplierId = (auth.user as any)?.supplierId || auth.user?.id;
  const payments = await EnterpriseSupplierPortalService.listPayments(supplierId);
  res.json(payments);
});

portalsRouter.post("/supplier/submit-document", ...supplierGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const supplierId = (auth.user as any)?.supplierId || auth.user?.id;
  const { documentType, documentNumber, amountCents, issueDate, notes, fileAttachmentUrl } = req.body;

  if (!supplierId || !documentNumber || !amountCents || !issueDate) {
    res.status(400).json({ error: "missing_document_fields" });
    return;
  }

  const submitted = await EnterpriseSupplierPortalService.submitDocument(supplierId, {
    documentType: documentType || "SUPPLIER_INVOICE",
    documentNumber,
    amountCents: Number(amountCents),
    issueDate,
    notes,
    fileAttachmentUrl,
  });

  res.status(201).json(submitted);
});

portalsRouter.patch("/supplier/profile", ...supplierGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const supplierId = (auth.user as any)?.supplierId || auth.user?.id;
  const { phone, email, address, contactName, iban } = req.body;

  if (!supplierId) {
    res.status(400).json({ error: "supplier_id_required" });
    return;
  }

  const result = await EnterpriseSupplierPortalService.updateSupplierProfile(supplierId, { phone, email, address, contactName, iban });
  if (!result) {
    res.status(404).json({ error: "supplier_not_found", message: "Não foi possível atualizar o perfil do fornecedor." });
    return;
  }
  res.json(result);
});

// =========================================================================
// 4. PORTAL DO COLABORADOR (RH SELF-SERVICE)
// =========================================================================

const employeeGuard = [requireAuth, requirePortalRole("ROLE_PORTAL_EMPLOYEE", "ROLE_HR")];

portalsRouter.get("/employee/dashboard", ...employeeGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const employeeId = (auth.user as any)?.employeeId || auth.user?.id;
  const companyId = resolveCompanyId(req);

  if (!employeeId) {
    res.status(400).json({ error: "employee_id_required" });
    return;
  }

  const dashboard = await EnterpriseEmployeePortalService.getDashboard(employeeId, companyId);
  if (!dashboard) {
    res.status(404).json({ error: "employee_not_found", message: "Ficha de colaborador não encontrada." });
    return;
  }
  res.json(dashboard);
});

portalsRouter.get("/employee/payslips", ...employeeGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const employeeId = (auth.user as any)?.employeeId || auth.user?.id;
  const payslips = await EnterpriseEmployeePortalService.listPayslips(employeeId);
  res.json(payslips);
});

portalsRouter.get("/employee/payslips/:id", ...employeeGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const employeeId = (auth.user as any)?.employeeId || auth.user?.id;
  const payslipId = getParam(req, "id");
  const payslip = await EnterpriseEmployeePortalService.getPayslip(employeeId, payslipId);
  if (!payslip) {
    res.status(404).json({ error: "payslip_not_found", message: "Recibo de vencimento não encontrado." });
    return;
  }
  res.json(payslip);
});

portalsRouter.post("/employee/leave-requests", ...employeeGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const employeeId = (auth.user as any)?.employeeId || auth.user?.id;
  const { type, startDate, endDate, daysCount, justification } = req.body;

  if (!employeeId || !startDate || !endDate || !daysCount) {
    res.status(400).json({ error: "missing_leave_fields" });
    return;
  }

  const request = await EnterpriseEmployeePortalService.submitLeaveRequest(employeeId, {
    type: type || "VACATION",
    startDate,
    endDate,
    daysCount: Number(daysCount),
    justification,
  });

  if (!request) {
    res.status(400).json({ error: "leave_request_failed", message: "Não foi possível registar o pedido de ausência." });
    return;
  }

  res.status(201).json(request);
});

portalsRouter.get("/employee/leave-requests", ...employeeGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const employeeId = (auth.user as any)?.employeeId || auth.user?.id;
  const list = await EnterpriseEmployeePortalService.listLeaveRequests(employeeId);
  res.json(list);
});

portalsRouter.patch("/employee/profile", ...employeeGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const employeeId = (auth.user as any)?.employeeId || auth.user?.id;
  const { phone, email, address, iban } = req.body;

  if (!employeeId) {
    res.status(400).json({ error: "employee_id_required" });
    return;
  }

  const result = await EnterpriseEmployeePortalService.updateEmployeeProfile(employeeId, { phone, email, address, iban });
  if (!result) {
    res.status(404).json({ error: "employee_not_found", message: "Não foi possível atualizar os dados do colaborador." });
    return;
  }
  res.json(result);
});

// =========================================================================
// 5. APLICAÇÃO MOBILE ERP (EXCLUSIVO UTILIZADORES ERP INTERNOS)
// =========================================================================

const mobileGuard = [requireAuth, requirePortalRole("ROLE_ADMIN", "ROLE_CASHIER", "ROLE_ACCOUNTANT", "ROLE_HR")];

portalsRouter.get("/mobile/executive-dashboard", ...mobileGuard, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const dashboard = await EnterpriseMobileErpService.getExecutiveDashboard(companyId);
  res.json(dashboard);
});

portalsRouter.get("/mobile/approvals", ...mobileGuard, async (req: Request, res: Response) => {
  const { status } = req.query;
  const approvals = await EnterpriseMobileErpService.listApprovals(typeof status === "string" ? status : undefined);
  res.json(approvals);
});

portalsRouter.post("/mobile/approvals/:id/action", ...mobileGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const approvalId = getParam(req, "id");
  const { action, comment } = req.body;

  if (!approvalId || !["APPROVE", "REJECT", "REQUEST_REVISION"].includes(action)) {
    res.status(400).json({ error: "invalid_approval_action" });
    return;
  }

  const result = await EnterpriseMobileErpService.processApprovalAction(
    approvalId,
    action,
    auth.user?.id || "exec-mobile-user",
    comment
  );

  res.json(result);
});

portalsRouter.post("/mobile/crm/visits", ...mobileGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const { customerId, customerName, latitude, longitude, notes, outcome, customerSignature, visitedAt } = req.body;

  if (!customerId || latitude === undefined || longitude === undefined || !notes) {
    res.status(400).json({ error: "missing_visit_fields" });
    return;
  }

  const visit = await EnterpriseMobileErpService.registerVisit(auth.user?.id || "sales-agent-01", {
    customerId,
    customerName: customerName || "Cliente Visitado",
    latitude: Number(latitude),
    longitude: Number(longitude),
    notes,
    outcome: outcome || "FOLLOW_UP_NEEDED",
    customerSignature,
    visitedAt,
  });

  res.status(201).json(visit);
});

portalsRouter.get("/mobile/crm/visits", ...mobileGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const visits = await EnterpriseMobileErpService.listVisits(auth.user?.id);
  res.json(visits);
});

portalsRouter.post("/mobile/crm/calls", ...mobileGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const { customerId, customerName, phone, durationSeconds, notes, calledAt } = req.body;

  if (!customerId || !phone || !notes) {
    res.status(400).json({ error: "missing_call_fields" });
    return;
  }

  const call = await EnterpriseMobileErpService.registerCall(auth.user?.id || "sales-agent-01", {
    customerId,
    customerName: customerName || "Cliente Contactado",
    phone,
    durationSeconds: Number(durationSeconds) || 60,
    notes,
    calledAt,
  });

  res.status(201).json(call);
});

portalsRouter.post("/mobile/devices/register", ...mobileGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const { deviceId, platform, pushToken, model, appVersion, preferences } = req.body;

  if (!deviceId || !platform || !pushToken) {
    res.status(400).json({ error: "missing_device_info" });
    return;
  }

  const device = await EnterpriseMobileErpService.registerDevice({
    userId: auth.user?.id || "user-mobile-01",
    deviceId,
    platform,
    pushToken,
    model: model || "Smartphone",
    appVersion: appVersion || "2.2.2",
    preferences,
  });

  res.status(201).json(device);
});

portalsRouter.get("/mobile/devices", ...mobileGuard, async (_req: Request, res: Response) => {
  const devices = await EnterpriseMobileErpService.listRegisteredDevices();
  res.json(devices);
});

portalsRouter.post("/mobile/sync", ...mobileGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const { mutations } = req.body;

  if (!Array.isArray(mutations)) {
    res.status(400).json({ error: "mutations_array_required" });
    return;
  }

  const result = await EnterpriseMobileErpService.syncOfflineBatch(auth.user?.id || "user-mobile-01", mutations);
  res.json(result);
});

portalsRouter.get("/mobile/offline-snapshot", ...mobileGuard, async (req: Request, res: Response) => {
  const auth = req as AuthRequest;
  const companyId = resolveCompanyId(req);
  const snapshot = await EnterpriseMobileErpService.getOfflineSnapshot(auth.user?.id || "user-mobile-01", companyId);
  res.json(snapshot);
});
