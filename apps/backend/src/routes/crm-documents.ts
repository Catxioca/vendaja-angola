import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  requireAuth,
  normalizeRole,
  type AuthRequest,
} from "../middleware/auth.js";
import {
  EnterpriseCrmService,
  EnterpriseCustomer360Service,
  EnterpriseDocumentService,
  EnterpriseSearchService,
  type CrmStage,
  type ActivityType,
  type ProposalStatus,
  type TicketType,
  type DocumentCategory,
} from "../services/enterprise/index.js";

export const crmDocumentsRouter = Router();

// Helper to extract companyId from request header or auth context
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

// =========================================================================
// 1. DASHBOARD COMERCIAL EXECUTIVO
// =========================================================================

crmDocumentsRouter.get("/dashboard", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const metrics = EnterpriseCrmService.getCommercialDashboardMetrics(companyId);
  res.json(metrics);
});

// =========================================================================
// 2. GESTÃO DE LEADS
// =========================================================================

crmDocumentsRouter.get("/leads", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { stage, status } = req.query;
  const leads = EnterpriseCrmService.listLeads({
    companyId,
    stage: typeof stage === "string" ? (stage as CrmStage) : undefined,
    status: typeof status === "string" ? status : undefined,
  });
  res.json(leads);
});

crmDocumentsRouter.get("/leads/:id", requireAuth, async (req: Request, res: Response) => {
  const lead = EnterpriseCrmService.getLead(getParam(req, "id"));
  if (!lead) return res.status(404).json({ error: "lead_not_found" });
  res.json(lead);
});

const createLeadSchema = z.object({
  title: z.string().min(2),
  companyName: z.string().optional(),
  contactName: z.string().min(2),
  nif: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  segment: z.string().optional(),
  potentialValueCents: z.union([z.number(), z.string()]).default(0),
  stage: z.enum(["LEAD", "CONTACT", "OPPORTUNITY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]).default("LEAD"),
  probabilityPercent: z.number().min(0).max(100).default(10),
  source: z.string().optional(),
  assignedToUserId: z.string().optional(),
  notes: z.string().optional(),
});

crmDocumentsRouter.post("/leads", requireAuth, async (req: Request, res: Response) => {
  const parse = createLeadSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  const companyId = resolveCompanyId(req);
  const lead = await EnterpriseCrmService.createLead({
    ...parse.data,
    potentialValueCents: BigInt(parse.data.potentialValueCents),
    companyId,
  });

  res.status(201).json(lead);
});

crmDocumentsRouter.patch("/leads/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const updated = await EnterpriseCrmService.updateLead(getParam(req, "id"), req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

const convertLeadSchema = z.object({
  createCustomer: z.boolean().default(true),
  createOpportunity: z.boolean().default(true),
  customerId: z.string().optional(),
});

crmDocumentsRouter.post("/leads/:id/convert", requireAuth, async (req: Request, res: Response) => {
  const parse = convertLeadSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  try {
    const result = await EnterpriseCrmService.convertLead(getParam(req, "id"), parse.data);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: "conversion_error", message: err.message });
  }
});

// =========================================================================
// 3. PIPELINE KANBAN & OPORTUNIDADES
// =========================================================================

crmDocumentsRouter.get("/pipeline", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const pipeline = EnterpriseCrmService.getKanbanPipeline(companyId);
  res.json(pipeline);
});

crmDocumentsRouter.get("/opportunities", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { stage, status, customerId } = req.query;
  const opps = EnterpriseCrmService.listOpportunities({
    companyId,
    stage: typeof stage === "string" ? (stage as CrmStage) : undefined,
    status: typeof status === "string" ? status : undefined,
    customerId: typeof customerId === "string" ? customerId : undefined,
  });
  res.json(opps);
});

crmDocumentsRouter.get("/opportunities/:id", requireAuth, async (req: Request, res: Response) => {
  const opp = EnterpriseCrmService.getOpportunity(getParam(req, "id"));
  if (!opp) return res.status(404).json({ error: "opportunity_not_found" });
  res.json(opp);
});

const createOppSchema = z.object({
  title: z.string().min(2),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  leadId: z.string().optional(),
  stage: z.enum(["LEAD", "CONTACT", "OPPORTUNITY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]).default("OPPORTUNITY"),
  expectedRevenueCents: z.union([z.number(), z.string()]).default(0),
  probabilityPercent: z.number().min(0).max(100).default(20),
  expectedCloseDate: z.string().optional(),
  assignedToUserId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

crmDocumentsRouter.post("/opportunities", requireAuth, async (req: Request, res: Response) => {
  const parse = createOppSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  const companyId = resolveCompanyId(req);
  const opp = await EnterpriseCrmService.createOpportunity({
    ...parse.data,
    expectedRevenueCents: BigInt(parse.data.expectedRevenueCents),
    companyId,
  });

  res.status(201).json(opp);
});

const moveStageSchema = z.object({
  stage: z.enum(["LEAD", "CONTACT", "OPPORTUNITY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]),
  lostReason: z.string().optional(),
});

crmDocumentsRouter.post("/opportunities/:id/stage", requireAuth, async (req: Request, res: Response) => {
  const parse = moveStageSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  try {
    const opp = await EnterpriseCrmService.moveOpportunityStage(
      getParam(req, "id"),
      parse.data.stage,
      parse.data.lostReason
    );
    res.json(opp);
  } catch (err: any) {
    res.status(400).json({ error: "move_stage_error", message: err.message });
  }
});

// =========================================================================
// 4. AGENDA COMERCIAL
// =========================================================================

crmDocumentsRouter.get("/activities", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { customerId, opportunityId, status, assignedToUserId } = req.query;

  const activities = EnterpriseCrmService.listActivities({
    companyId,
    customerId: typeof customerId === "string" ? customerId : undefined,
    opportunityId: typeof opportunityId === "string" ? opportunityId : undefined,
    status: typeof status === "string" ? status : undefined,
    assignedToUserId: typeof assignedToUserId === "string" ? assignedToUserId : undefined,
  });

  res.json(activities);
});

const scheduleActivitySchema = z.object({
  type: z.enum(["CALL", "MEETING", "VISIT", "REMINDER", "EMAIL", "NOTE"]).default("CALL"),
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  scheduledAt: z.string(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  leadId: z.string().optional(),
  opportunityId: z.string().optional(),
  assignedToUserId: z.string().optional(),
});

crmDocumentsRouter.post("/activities", requireAuth, async (req: Request, res: Response) => {
  const parse = scheduleActivitySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  const companyId = resolveCompanyId(req);
  const activity = await EnterpriseCrmService.scheduleActivity({
    ...parse.data,
    companyId,
  });

  res.status(201).json(activity);
});

crmDocumentsRouter.post("/activities/:id/complete", requireAuth, async (req: Request, res: Response) => {
  const { resultNotes } = req.body;
  try {
    const completed = await EnterpriseCrmService.completeActivity(
      getParam(req, "id"),
      resultNotes || "Atividade concluída com sucesso"
    );
    res.json(completed);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

// =========================================================================
// 5. PROPOSTAS & COTAÇÕES COMERCIAIS
// =========================================================================

crmDocumentsRouter.get("/proposals", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { customerId, opportunityId, status } = req.query;

  const proposals = EnterpriseCrmService.listProposals({
    companyId,
    customerId: typeof customerId === "string" ? customerId : undefined,
    opportunityId: typeof opportunityId === "string" ? opportunityId : undefined,
    status: typeof status === "string" ? (status as ProposalStatus) : undefined,
  });

  res.json(proposals);
});

crmDocumentsRouter.get("/proposals/:id", requireAuth, async (req: Request, res: Response) => {
  const prop = EnterpriseCrmService.getProposal(getParam(req, "id"));
  if (!prop) return res.status(404).json({ error: "proposal_not_found" });
  res.json(prop);
});

const createProposalSchema = z.object({
  title: z.string().min(2),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  leadId: z.string().optional(),
  opportunityId: z.string().optional(),
  currency: z.string().default("AOA"),
  validUntil: z.string().optional(),
  termsAndConditions: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().optional(),
      description: z.string().min(1),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
      discountCents: z.number().int().nonnegative().optional(),
      taxRate: z.number().optional(),
      totalCents: z.number().int().nonnegative(),
    })
  ).min(1),
});

crmDocumentsRouter.post("/proposals", requireAuth, async (req: Request, res: Response) => {
  const parse = createProposalSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  const companyId = resolveCompanyId(req);
  const prop = await EnterpriseCrmService.createProposal({
    ...parse.data,
    companyId,
  });

  res.status(201).json(prop);
});

crmDocumentsRouter.patch("/proposals/:id/status", requireAuth, async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status_required" });

  const auth = req as AuthRequest;
  const actorId = auth.user?.id;

  try {
    const updated = await EnterpriseCrmService.updateProposalStatus(
      getParam(req, "id"),
      status as ProposalStatus,
      actorId
    );
    res.json(updated);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

// =========================================================================
// 6. HELPDESK & RECLAMAÇÕES / OCORRÊNCIAS
// =========================================================================

crmDocumentsRouter.get("/tickets", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { customerId, status, type } = req.query;

  const tickets = EnterpriseCrmService.listTickets({
    companyId,
    customerId: typeof customerId === "string" ? customerId : undefined,
    status: typeof status === "string" ? (status as any) : undefined,
    type: typeof type === "string" ? (type as TicketType) : undefined,
  });

  res.json(tickets);
});

const createTicketSchema = z.object({
  customerId: z.string().min(1),
  customerName: z.string().optional(),
  type: z.enum(["COMPLAINT", "SUGGESTION", "INQUIRY", "INCIDENT"]).default("COMPLAINT"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  title: z.string().min(3),
  description: z.string().min(5),
  assignedToUserId: z.string().optional(),
  dueDate: z.string().optional(),
});

crmDocumentsRouter.post("/tickets", requireAuth, async (req: Request, res: Response) => {
  const parse = createTicketSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  const companyId = resolveCompanyId(req);
  const ticket = await EnterpriseCrmService.createTicket({
    ...parse.data,
    companyId,
  });

  res.status(201).json(ticket);
});

crmDocumentsRouter.post("/tickets/:id/resolve", requireAuth, async (req: Request, res: Response) => {
  const { resolutionNotes } = req.body;
  if (!resolutionNotes) return res.status(400).json({ error: "resolution_notes_required" });

  try {
    const resolved = await EnterpriseCrmService.resolveTicket(getParam(req, "id"), resolutionNotes);
    res.json(resolved);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

// =========================================================================
// 7. HISTÓRICO 360° DO CLIENTE
// =========================================================================

crmDocumentsRouter.get("/customers/:id/360", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const profile = await EnterpriseCustomer360Service.getCustomer360(getParam(req, "id"), companyId);
  if (!profile) return res.status(404).json({ error: "customer_not_found" });
  res.json(profile);
});

// =========================================================================
// 8. GESTÃO DOCUMENTAL CORPORATIVA (GED / DMS)
// =========================================================================

crmDocumentsRouter.get("/documents", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const { category, status, relatedEntityType, relatedEntityId } = req.query;

  const docs = EnterpriseDocumentService.listDocuments({
    companyId,
    category: typeof category === "string" ? (category as DocumentCategory) : undefined,
    status: typeof status === "string" ? status : undefined,
    relatedEntityType: typeof relatedEntityType === "string" ? relatedEntityType : undefined,
    relatedEntityId: typeof relatedEntityId === "string" ? relatedEntityId : undefined,
  });

  res.json(docs);
});

crmDocumentsRouter.get("/documents/:id", requireAuth, async (req: Request, res: Response) => {
  const doc = EnterpriseDocumentService.getDocument(getParam(req, "id"));
  if (!doc) return res.status(404).json({ error: "document_not_found" });
  res.json(doc);
});

const uploadDocumentSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  category: z.enum([
    "CONTRACT",
    "LICENSE",
    "INVOICE",
    "RECEIPT",
    "CUSTOMER_ATTACHMENT",
    "SUPPLIER_ATTACHMENT",
    "HR_DOCUMENT",
    "LEGAL",
    "OTHER",
  ]).default("OTHER"),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  fileExtension: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  rawContent: z.string().optional(),
  tags: z.array(z.string()).optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  expiryDate: z.string().optional(),
});

crmDocumentsRouter.post("/documents", requireAuth, async (req: Request, res: Response) => {
  const parse = uploadDocumentSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  const companyId = resolveCompanyId(req);
  const auth = req as AuthRequest;
  const createdById = auth.user?.id;

  const doc = await EnterpriseDocumentService.uploadDocument({
    ...parse.data,
    createdById,
    companyId,
  });

  res.status(201).json(doc);
});

const uploadNewVersionSchema = z.object({
  fileName: z.string().min(1),
  rawContent: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  mimeType: z.string().optional(),
  changeNotes: z.string().optional(),
});

crmDocumentsRouter.post("/documents/:id/versions", requireAuth, async (req: Request, res: Response) => {
  const parse = uploadNewVersionSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "bad_request", details: parse.error.issues });

  const auth = req as AuthRequest;
  const uploadedById = auth.user?.id;

  try {
    const version = await EnterpriseDocumentService.uploadNewVersion(getParam(req, "id"), {
      ...parse.data,
      uploadedById,
    });
    res.status(201).json(version);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

crmDocumentsRouter.post("/documents/:id/archive", requireAuth, async (req: Request, res: Response) => {
  try {
    const archived = EnterpriseDocumentService.archiveDocument(getParam(req, "id"));
    res.json(archived);
  } catch (err: any) {
    res.status(404).json({ error: "not_found", message: err.message });
  }
});

// =========================================================================
// 9. MOTOR DE PESQUISA GLOBAL
// =========================================================================

crmDocumentsRouter.get("/search", requireAuth, async (req: Request, res: Response) => {
  const companyId = resolveCompanyId(req);
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const results = await EnterpriseSearchService.search(q, companyId);
  res.json(results);
});
