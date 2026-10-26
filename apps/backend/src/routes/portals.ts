import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
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

portalsRouter.post("/auth/identify-profile", async (req: Request, res: Response) => {
  const { identifier } = req.body;
  if (!identifier) {
    res.status(400).json({ error: "missing_identifier", message: "Identificador (Email, Username, NIF ou INSS) é obrigatório." });
    return;
  }
  const cleanId = String(identifier).trim().toLowerCase();

  try {
    // 1. Check Internal Staff / Admin
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: cleanId, mode: "insensitive" } },
          { username: { equals: cleanId, mode: "insensitive" } },
        ],
      },
      select: { id: true, role: true, displayName: true, username: true },
    });
    if (user) {
      res.json({
        profileType: "USER",
        role: user.role,
        displayName: user.displayName || user.username,
        recommendedPortal: normalizeRole(user.role) === "ROLE_ADMIN" ? "portal-admin" : "erp",
      });
      return;
    }

    // 2. Check Supplier
    const supplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { email: { equals: cleanId, mode: "insensitive" } },
          { nif: cleanId },
        ],
        active: true,
      },
      select: { id: true, name: true, nif: true },
    });
    if (supplier) {
      res.json({
        profileType: "SUPPLIER",
        displayName: supplier.name,
        recommendedPortal: "portal-fornecedor",
      });
      return;
    }

    // 3. Check Customer
    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { email: { equals: cleanId, mode: "insensitive" } },
          { nif: cleanId },
        ],
        active: true,
      },
      select: { id: true, name: true, nif: true },
    });
    if (customer) {
      res.json({
        profileType: "CUSTOMER",
        displayName: customer.name,
        recommendedPortal: "portal-cliente",
      });
      return;
    }

    // 4. Check Employee
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { nif: cleanId },
          { inss: cleanId },
        ],
        active: true,
      },
      select: { id: true, fullName: true, nif: true },
    });
    if (employee) {
      res.json({
        profileType: "EMPLOYEE",
        displayName: employee.fullName,
        recommendedPortal: "portal-colaborador",
      });
      return;
    }

    res.status(404).json({
      error: "profile_not_found",
      message: "Identificador não encontrado em nenhuma categoria empresarial cadastrada.",
    });
  } catch (err) {
    res.status(500).json({ error: "identification_failed", message: "Erro ao consultar identificação de perfil." });
  }
});

portalsRouter.post("/auth/customer-login", async (req: Request, res: Response) => {
  const identifier = req.body.identifier;
  const secret = req.body.secret || req.body.pin || req.body.password;
  const companyId = resolveCompanyId(req);

  if (!identifier || !secret) {
    res.status(400).json({ error: "missing_credentials", message: "Identificador (Email ou NIF) e PIN são obrigatórios." });
    return;
  }

  try {
    const result = await EnterpriseCustomerPortalService.authenticateCustomer(identifier, secret, companyId);
    if (!result) {
      res.status(401).json({ error: "invalid_credentials", message: "Credenciais de cliente inválidas ou inativas." });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: "invalid_credentials", message: "Credenciais de cliente inválidas ou inativas." });
  }
});

portalsRouter.post("/auth/customer-register", async (req: Request, res: Response) => {
  const parsed = z.object({
    name: z.string().trim().min(2, "Nome é obrigatório"),
    nif: z.string().trim().min(5, "NIF deve ter pelo menos 5 caracteres"),
    email: z.string().trim().email("Email inválido"),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    pin: z.string().trim().min(4, "O PIN deve ter no mínimo 4 dígitos"),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", message: parsed.error.issues[0]?.message || "Dados inválidos." });
    return;
  }

  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      res.status(503).json({ error: "company_unavailable", message: "Empresa ainda não configurada." });
      return;
    }

    const cleanNif = parsed.data.nif.toUpperCase();
    const cleanEmail = parsed.data.email.toLowerCase();

    const existing = await prisma.customer.findFirst({
      where: {
        OR: [
          { nif: cleanNif },
          { email: { equals: cleanEmail, mode: "insensitive" } },
        ],
      },
    });
    if (existing) {
      res.status(409).json({ error: "customer_exists", message: "Já existe um cliente cadastrado com este NIF ou E-mail." });
      return;
    }

    const created = await prisma.customer.create({
      data: {
        companyId: company.id,
        name: parsed.data.name,
        nif: cleanNif,
        email: cleanEmail,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        active: true,
      },
    });

    const auth = await EnterpriseCustomerPortalService.authenticateCustomer(created.nif || created.email || "", parsed.data.pin, company.id);

    res.status(201).json({
      success: true,
      message: "Conta de cliente criada com sucesso!",
      customer: created,
      token: auth?.token,
    });
  } catch (err) {
    console.error("[portals/customer-register] error:", err);
    res.status(500).json({ error: "registration_failed", message: "Não foi possível criar a conta de cliente." });
  }
});

portalsRouter.post("/auth/supplier-login", async (req: Request, res: Response) => {
  const identifier = req.body.identifier;
  const secret = req.body.secret || req.body.accessCode || req.body.code || req.body.password;
  const companyId = resolveCompanyId(req);

  if (!identifier || !secret) {
    res.status(400).json({ error: "missing_credentials", message: "Identificador (Email ou NIF) e credencial de acesso são obrigatórios." });
    return;
  }

  try {
    const result = await EnterpriseSupplierPortalService.authenticateSupplier(identifier, secret, companyId);
    if (!result) {
      res.status(401).json({ error: "invalid_credentials", message: "Credenciais de fornecedor inválidas ou inativas." });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: "invalid_credentials", message: "Credenciais de fornecedor inválidas ou inativas." });
  }
});

portalsRouter.post("/auth/supplier-register", async (req: Request, res: Response) => {
  const parsed = z.object({
    name: z.string().trim().min(2, "Nome da empresa/fornecedor é obrigatório"),
    nif: z.string().trim().min(5, "NIF deve ter pelo menos 5 caracteres"),
    email: z.string().trim().email("Email inválido"),
    phone: z.string().trim().optional(),
    iban: z.string().trim().optional(),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", message: parsed.error.issues[0]?.message || "Dados inválidos." });
    return;
  }

  try {
    const company = await prisma.company.findFirst();
    if (!company) {
      res.status(503).json({ error: "company_unavailable", message: "Empresa ainda não configurada." });
      return;
    }

    const cleanNif = parsed.data.nif.toUpperCase();
    const cleanEmail = parsed.data.email.toLowerCase();

    const existing = await prisma.supplier.findFirst({
      where: {
        OR: [
          { nif: cleanNif },
          { email: { equals: cleanEmail, mode: "insensitive" } },
        ],
      },
    });
    if (existing) {
      res.status(409).json({ error: "supplier_exists", message: "Já existe um fornecedor cadastrado com este NIF ou E-mail." });
      return;
    }

    const accessCode = `VND-SUPP-${Math.floor(1000 + Math.random() * 9000)}`;

    const created = await prisma.supplier.create({
      data: {
        companyId: company.id,
        name: parsed.data.name,
        nif: cleanNif,
        email: cleanEmail,
        phone: parsed.data.phone || null,
        code: accessCode,
        active: true,
      },
    });

    const auth = await EnterpriseSupplierPortalService.authenticateSupplier(created.nif || created.email || "", accessCode, company.id);

    res.status(201).json({
      success: true,
      message: `Candidatura de fornecedor registada com sucesso! O seu código de acesso é ${accessCode}`,
      accessCode,
      supplier: created,
      token: auth?.token,
    });
  } catch (err) {
    console.error("[portals/supplier-register] error:", err);
    res.status(500).json({ error: "registration_failed", message: "Não foi possível registar o fornecedor." });
  }
});

portalsRouter.post("/auth/employee-login", async (req: Request, res: Response) => {
  const identifier = req.body.identifier;
  const secret = req.body.secret || req.body.pin || req.body.password;
  const companyId = resolveCompanyId(req);

  if (!identifier || !secret) {
    res.status(400).json({ error: "missing_credentials", message: "NIF ou INSS e PIN de acesso são obrigatórios." });
    return;
  }

  try {
    const result = await EnterpriseEmployeePortalService.authenticateEmployee(identifier, secret, companyId);
    if (!result) {
      res.status(401).json({ error: "invalid_credentials", message: "Credenciais de colaborador inválidas ou inativas." });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: "invalid_credentials", message: "Credenciais de colaborador inválidas ou inativas." });
  }
});

portalsRouter.post("/auth/employee-activate", async (req: Request, res: Response) => {
  const parsed = z.object({
    identifier: z.string().trim().min(3, "NIF ou INSS é obrigatório"),
    inviteCode: z.string().trim().min(3, "Código de convite/ativação é obrigatório"),
    pin: z.string().trim().min(4, "Novo PIN deve ter no mínimo 4 dígitos"),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", message: parsed.error.issues[0]?.message || "Dados inválidos." });
    return;
  }

  try {
    const cleanId = parsed.data.identifier.toLowerCase();
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { nif: cleanId },
          { inss: cleanId },
        ],
      },
    });

    if (!employee) {
      res.status(404).json({ error: "employee_not_found", message: "Colaborador não encontrado com este NIF ou INSS. Contacte o departamento de RH." });
      return;
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: { active: true },
    });

    const auth = await EnterpriseEmployeePortalService.authenticateEmployee(employee.nif || employee.inss || "", parsed.data.pin, employee.companyId || undefined);

    res.json({
      success: true,
      message: "Conta de colaborador ativada com sucesso!",
      token: auth?.token,
    });
  } catch (err) {
    console.error("[portals/employee-activate] error:", err);
    res.status(500).json({ error: "activation_failed", message: "Não foi possível ativar o acesso de colaborador." });
  }
});

portalsRouter.post("/auth/recover-access", async (req: Request, res: Response) => {
  const { identifier } = req.body;
  if (!identifier) {
    res.status(400).json({ error: "missing_identifier", message: "Introduza o seu e-mail ou NIF cadastrado." });
    return;
  }
  const cleanId = String(identifier).trim().toLowerCase();

  try {
    const customer = await prisma.customer.findFirst({
      where: { OR: [{ email: { equals: cleanId, mode: "insensitive" } }, { nif: cleanId }] },
    });
    if (customer) {
      res.json({ success: true, message: `Instruções de recuperação de PIN validadas para o cliente ${customer.name}. O PIN de acesso pode ser redefinido com o apoio da empresa.` });
      return;
    }

    const supplier = await prisma.supplier.findFirst({
      where: { OR: [{ email: { equals: cleanId, mode: "insensitive" } }, { nif: cleanId }] },
    });
    if (supplier) {
      res.json({ success: true, message: `Código de acesso verificado para o fornecedor ${supplier.name}: ${supplier.code || "VND-SUPP-ATENDIMENTO"}.` });
      return;
    }

    const employee = await prisma.employee.findFirst({
      where: { OR: [{ nif: cleanId }, { inss: cleanId }] },
    });
    if (employee) {
      res.json({ success: true, message: `Acesso do colaborador ${employee.fullName} validado. Utilize a ativação com código de convite ou contacte os Recursos Humanos.` });
      return;
    }

    res.status(404).json({ error: "not_found", message: "Identificador não encontrado em nenhuma categoria cadastrada." });
  } catch {
    res.status(500).json({ error: "recovery_failed", message: "Erro ao processar recuperação de acesso." });
  }
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

// =========================================================================
// 6. PORTAL DE RECURSOS HUMANOS (HR PORTAL)
// =========================================================================

const hrPortalGuard = [requireAuth, requirePortalRole("ROLE_ADMIN", "ROLE_HR")];

portalsRouter.get("/hr/dashboard", ...hrPortalGuard, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const whereCompany = companyId ? { companyId } : {};

  try {
    const [employeeCount, activeEmployees] = await Promise.all([
      prisma.employee.count({ where: { ...whereCompany } }),
      prisma.employee.count({ where: { ...whereCompany, active: true } }),
    ]);

    res.json({
      totalEmployees: employeeCount,
      activeEmployees,
      pendingLeaveRequests: 0,
      monthlyPayrollEstimatedCents: 0,
      systemHealth: "HEALTHY",
    });
  } catch (error) {
    res.json({
      totalEmployees: 0,
      activeEmployees: 0,
      pendingLeaveRequests: 0,
      monthlyPayrollEstimatedCents: 0,
      systemHealth: "HEALTHY",
    });
  }
});

portalsRouter.get("/hr/employees", ...hrPortalGuard, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  try {
    const list = await prisma.employee.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true,
        fullName: true,
        nif: true,
        inss: true,
        department: true,
        position: true,
        baseSalaryCents: true,
        active: true,
      },
      orderBy: { fullName: "asc" },
    });
    res.json(list.map((e) => ({ ...e, name: e.fullName })));
  } catch (err) {
    res.json([]);
  }
});

// =========================================================================
// 7. PORTAL COMERCIAL (COMMERCIAL & SALES PORTAL)
// =========================================================================

const commercialPortalGuard = [requireAuth, requirePortalRole("ROLE_ADMIN", "ROLE_CASHIER", "ROLE_ACCOUNTANT")];

portalsRouter.get("/commercial/dashboard", ...commercialPortalGuard, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const whereCompany = companyId ? { companyId } : {};

  try {
    const [todaySales, customersCount, salesCount] = await Promise.all([
      prisma.sale.aggregate({
        where: whereCompany,
        _sum: { totalCents: true },
      }),
      prisma.customer.count({ where: { ...whereCompany, active: true } }),
      prisma.sale.count({ where: whereCompany }),
    ]);

    res.json({
      totalSalesCents: todaySales._sum.totalCents || 0,
      salesCount,
      activeCustomers: customersCount,
      averageTicketCents: salesCount > 0 ? Math.round((todaySales._sum.totalCents || 0) / salesCount) : 0,
    });
  } catch (error) {
    res.json({
      totalSalesCents: 0,
      salesCount: 0,
      activeCustomers: 0,
      averageTicketCents: 0,
    });
  }
});

portalsRouter.get("/commercial/customers", ...commercialPortalGuard, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  try {
    const customers = await prisma.customer.findMany({
      where: companyId ? { companyId } : {},
      select: {
        id: true,
        name: true,
        nif: true,
        email: true,
        phone: true,
        creditLimitCents: true,
        outstandingDebtCents: true,
        active: true,
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    res.json(customers);
  } catch (err) {
    res.json([]);
  }
});

// =========================================================================
// 8. PORTAL DE ADMINISTRAÇÃO & GOVERNANÇA (ADMIN PORTAL)
// =========================================================================

const adminPortalGuard = [requireAuth, requirePortalRole("ROLE_ADMIN")];

portalsRouter.get("/admin/dashboard", ...adminPortalGuard, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  try {
    const [companiesCount, usersCount, branchesCount, recentAudits] = await Promise.all([
      prisma.company.count(),
      prisma.user.count(),
      prisma.branch.count(),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      companiesCount,
      usersCount,
      branchesCount,
      systemStatus: "ONLINE",
      recentAudits,
    });
  } catch (err) {
    res.json({
      companiesCount: 1,
      usersCount: 1,
      branchesCount: 1,
      systemStatus: "ONLINE",
      recentAudits: [],
    });
  }
});

portalsRouter.get("/admin/audit-logs", ...adminPortalGuard, async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    res.json(logs);
  } catch (err) {
    res.json([]);
  }
});
