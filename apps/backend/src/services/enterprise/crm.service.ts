import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";
import { EnterpriseAuditService } from "./audit.service.js";

export type CrmStage =
  | "LEAD"
  | "CONTACT"
  | "OPPORTUNITY"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "WON"
  | "LOST";

export type ActivityType = "CALL" | "MEETING" | "VISIT" | "REMINDER" | "EMAIL" | "NOTE";
export type ProposalStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED";
export type TicketType = "COMPLAINT" | "SUGGESTION" | "INQUIRY" | "INCIDENT";
export type TicketStatus = "NEW" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";

export interface CrmLeadData {
  id: string;
  companyId?: string;
  branchId?: string;
  title: string;
  companyName?: string;
  contactName: string;
  nif?: string;
  email?: string;
  phone?: string;
  address?: string;
  segment?: string;
  potentialValueCents: bigint | number;
  stage: CrmStage;
  status: "OPEN" | "WON" | "LOST";
  probabilityPercent: number;
  source?: string;
  assignedToUserId?: string;
  assignedToName?: string;
  notes?: string;
  lostReason?: string;
  convertedCustomerId?: string;
  convertedOpportunityId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmOpportunityData {
  id: string;
  companyId?: string;
  branchId?: string;
  title: string;
  customerId?: string;
  customerName?: string;
  leadId?: string;
  stage: CrmStage;
  status: "OPEN" | "WON" | "LOST";
  expectedRevenueCents: bigint | number;
  probabilityPercent: number;
  expectedCloseDate?: string;
  assignedToUserId?: string;
  assignedToName?: string;
  tags?: string[];
  notes?: string;
  lostReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmActivityData {
  id: string;
  companyId?: string;
  branchId?: string;
  type: ActivityType;
  title: string;
  description?: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  scheduledAt: string;
  completedAt?: string;
  customerId?: string;
  customerName?: string;
  leadId?: string;
  opportunityId?: string;
  assignedToUserId?: string;
  resultNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalItemData {
  productId?: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountCents?: number;
  taxRate?: number;
  totalCents: number;
}

export interface CrmProposalData {
  id: string;
  companyId?: string;
  branchId?: string;
  number: string;
  title: string;
  customerId?: string;
  customerName?: string;
  leadId?: string;
  opportunityId?: string;
  status: ProposalStatus;
  totalAmountCents: bigint | number;
  currency: string;
  validUntil?: string;
  termsAndConditions?: string;
  notes?: string;
  items: ProposalItemData[];
  approvedById?: string;
  approvedAt?: string;
  convertedSaleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmTicketData {
  id: string;
  companyId?: string;
  branchId?: string;
  ticketNumber: string;
  customerId: string;
  customerName?: string;
  type: TicketType;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: TicketStatus;
  title: string;
  description: string;
  assignedToUserId?: string;
  dueDate?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export class EnterpriseCrmService {
  private static inMemoryLeads: Map<string, CrmLeadData> = new Map();
  private static inMemoryOpportunities: Map<string, CrmOpportunityData> = new Map();
  private static inMemoryActivities: Map<string, CrmActivityData> = new Map();
  private static inMemoryProposals: Map<string, CrmProposalData> = new Map();
  private static inMemoryTickets: Map<string, CrmTicketData> = new Map();

  static {
    this.seedDemoData();
  }

  private static seedDemoData(): void {
    const now = new Date().toISOString();
    // Demo Lead
    const lead: CrmLeadData = {
      id: "lead-luanda-logistics",
      title: "Fornecimento Equipamento PDV & Scanner",
      companyName: "Luanda Logística e Transportes Lda",
      contactName: "Eng. Manuel dos Santos",
      nif: "5418029312",
      email: "m.santos@luandalog.ao",
      phone: "+244 923 456 789",
      address: "Viana, Estrada de Catete km 18",
      segment: "Transportes & Logística",
      potentialValueCents: 4_500_000_00, // 4.500.000 Kz
      stage: "LEAD",
      status: "OPEN",
      probabilityPercent: 20,
      source: "REFERRAL",
      notes: "Interesse em equipar 5 armazéns com o VendaJá Angola Desktop e leitores de código de barras.",
      createdAt: now,
      updatedAt: now,
    };
    this.inMemoryLeads.set(lead.id, lead);

    // Demo Opportunity
    const opp: CrmOpportunityData = {
      id: "opp-supermercado-benguela",
      title: "Expansão 8 Caixas PDV - Supermercado Benguela",
      customerName: "Hipermercados do Sul, SA",
      stage: "PROPOSAL",
      status: "OPEN",
      expectedRevenueCents: 12_800_000_00, // 12.800.000 Kz
      probabilityPercent: 65,
      expectedCloseDate: new Date(Date.now() + 15 * 86400000).toISOString(),
      tags: ["PDV", "Retalho", "Grande Conta"],
      notes: "Proposta técnica e financeira enviada com integração SAF-T e impressoras térmicas ESC/POS.",
      createdAt: now,
      updatedAt: now,
    };
    this.inMemoryOpportunities.set(opp.id, opp);

    // Demo Proposal
    const proposal: CrmProposalData = {
      id: "prop-2026-001",
      number: "PROP-2026-0001",
      title: "Proposta Comercial Solução VendaJá Enterprise",
      opportunityId: opp.id,
      customerName: "Hipermercados do Sul, SA",
      status: "SENT",
      totalAmountCents: 12_800_000_00,
      currency: "AOA",
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
      items: [
        { description: "Licenciamento ERP VendaJá Angola v2.2.4 (8 Postos)", quantity: 8, unitPriceCents: 1_200_000_00, totalCents: 9_600_000_00 },
        { description: "Serviço de Implantação, Formação de Caixas e Certificação AGT", quantity: 1, unitPriceCents: 3_200_000_00, totalCents: 3_200_000_00 },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.inMemoryProposals.set(proposal.id, proposal);
  }

  // =========================================================================
  // 1. LEADS
  // =========================================================================

  public static async createLead(data: Omit<CrmLeadData, "id" | "createdAt" | "updatedAt" | "status">): Promise<CrmLeadData> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const lead: CrmLeadData = {
      id,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    this.inMemoryLeads.set(id, lead);

    try {
      await prisma.crmLead.create({
        data: {
          id: lead.id,
          companyId: lead.companyId ?? null,
          branchId: lead.branchId ?? null,
          title: lead.title,
          companyName: lead.companyName ?? null,
          contactName: lead.contactName,
          nif: lead.nif ?? null,
          email: lead.email ?? null,
          phone: lead.phone ?? null,
          address: lead.address ?? null,
          segment: lead.segment ?? null,
          potentialValueCents: BigInt(lead.potentialValueCents),
          stage: lead.stage,
          status: lead.status,
          probabilityPercent: lead.probabilityPercent,
          source: lead.source ?? null,
          assignedToUserId: lead.assignedToUserId ?? null,
          notes: lead.notes ?? null,
        },
      });
    } catch {
      // In-memory fallback
    }

    EnterpriseNotificationService.dispatch({
      type: "INFO",
      category: "SYSTEM",
      priority: "NORMAL",
      title: `Novo Lead Comercial: ${lead.title}`,
      message: `${lead.companyName || lead.contactName} registado como potencial cliente no funil comercial.`,
      module: "CRM",
      companyId: lead.companyId,
    });

    return lead;
  }

  public static async updateLead(id: string, updates: Partial<CrmLeadData>): Promise<CrmLeadData> {
    const lead = this.inMemoryLeads.get(id);
    if (!lead) throw new Error(`Lead não encontrado: ${id}`);

    Object.assign(lead, updates, { updatedAt: new Date().toISOString() });

    try {
      await prisma.crmLead.update({
        where: { id },
        data: {
          title: lead.title,
          companyName: lead.companyName ?? null,
          contactName: lead.contactName,
          stage: lead.stage,
          status: lead.status,
          probabilityPercent: lead.probabilityPercent,
          potentialValueCents: BigInt(lead.potentialValueCents),
          assignedToUserId: lead.assignedToUserId ?? null,
          notes: lead.notes ?? null,
          lostReason: lead.lostReason ?? null,
        },
      });
    } catch {
      // In-memory fallback
    }

    return lead;
  }

  public static async convertLead(
    leadId: string,
    options: { createCustomer?: boolean; createOpportunity?: boolean; customerId?: string }
  ): Promise<{ customerId?: string; opportunityId?: string }> {
    const lead = this.inMemoryLeads.get(leadId);
    if (!lead) throw new Error(`Lead não encontrado: ${leadId}`);

    let customerId = options.customerId;

    // 1. Convert to Customer if requested
    if (options.createCustomer && !customerId) {
      try {
        const customer = await prisma.customer.create({
          data: {
            name: lead.companyName || lead.contactName,
            nif: lead.nif ?? null,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            address: lead.address ?? null,
            companyId: lead.companyId ?? null,
            branchId: lead.branchId ?? null,
          },
        });
        customerId = customer.id;
      } catch {
        customerId = `cust-${crypto.randomUUID()}`;
      }
    }

    // 2. Convert to Opportunity if requested
    let opportunityId: string | undefined;
    if (options.createOpportunity) {
      const opp = await this.createOpportunity({
        title: lead.title,
        customerId,
        customerName: lead.companyName || lead.contactName,
        leadId: lead.id,
        stage: "OPPORTUNITY",
        expectedRevenueCents: lead.potentialValueCents,
        probabilityPercent: Math.max(40, lead.probabilityPercent),
        assignedToUserId: lead.assignedToUserId,
        notes: lead.notes,
        companyId: lead.companyId,
        branchId: lead.branchId,
      });
      opportunityId = opp.id;
    }

    lead.status = "WON";
    lead.stage = "WON";
    lead.convertedCustomerId = customerId;
    lead.convertedOpportunityId = opportunityId;
    lead.updatedAt = new Date().toISOString();

    EnterpriseAuditService.record({
      action: "CRM_LEAD_CONVERTED",
      module: "CRM",
      entity: "CrmLead",
      entityId: leadId,
      companyId: lead.companyId,
      newValue: { customerId, opportunityId },
    }).catch(() => {});

    return { customerId, opportunityId };
  }

  public static listLeads(filters: { companyId?: string; stage?: CrmStage; status?: string } = {}): CrmLeadData[] {
    let list = Array.from(this.inMemoryLeads.values());
    if (filters.companyId) list = list.filter((l) => !l.companyId || l.companyId === filters.companyId);
    if (filters.stage) list = list.filter((l) => l.stage === filters.stage);
    if (filters.status) list = list.filter((l) => l.status === filters.status);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static getLead(id: string): CrmLeadData | undefined {
    return this.inMemoryLeads.get(id);
  }

  // =========================================================================
  // 2. OPORTUNIDADES & KANBAN PIPELINE
  // =========================================================================

  public static async createOpportunity(data: Omit<CrmOpportunityData, "id" | "createdAt" | "updatedAt" | "status">): Promise<CrmOpportunityData> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const opp: CrmOpportunityData = {
      id,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    this.inMemoryOpportunities.set(id, opp);

    try {
      await prisma.crmOpportunity.create({
        data: {
          id: opp.id,
          companyId: opp.companyId ?? null,
          branchId: opp.branchId ?? null,
          title: opp.title,
          customerId: opp.customerId ?? null,
          leadId: opp.leadId ?? null,
          stage: opp.stage,
          status: opp.status,
          expectedRevenueCents: BigInt(opp.expectedRevenueCents),
          probabilityPercent: opp.probabilityPercent,
          expectedCloseDate: opp.expectedCloseDate ? new Date(opp.expectedCloseDate) : null,
          assignedToUserId: opp.assignedToUserId ?? null,
          notes: opp.notes ?? null,
        },
      });
    } catch {
      // In-memory fallback
    }

    return opp;
  }

  public static async moveOpportunityStage(id: string, newStage: CrmStage, lostReason?: string): Promise<CrmOpportunityData> {
    const opp = this.inMemoryOpportunities.get(id);
    if (!opp) throw new Error(`Oportunidade não encontrada: ${id}`);

    const oldStage = opp.stage;
    opp.stage = newStage;
    opp.updatedAt = new Date().toISOString();

    if (newStage === "WON") {
      opp.status = "WON";
      opp.probabilityPercent = 100;
    } else if (newStage === "LOST") {
      opp.status = "LOST";
      opp.probabilityPercent = 0;
      opp.lostReason = lostReason;
    } else if (newStage === "NEGOTIATION") {
      opp.probabilityPercent = 80;
    } else if (newStage === "PROPOSAL") {
      opp.probabilityPercent = 60;
    }

    try {
      await prisma.crmOpportunity.update({
        where: { id },
        data: {
          stage: opp.stage,
          status: opp.status,
          probabilityPercent: opp.probabilityPercent,
          lostReason: opp.lostReason ?? null,
        },
      });
    } catch {
      // In-memory fallback
    }

    EnterpriseAuditService.record({
      action: "CRM_STAGE_MOVED",
      module: "CRM",
      entity: "CrmOpportunity",
      entityId: id,
      companyId: opp.companyId,
      oldValue: { stage: oldStage },
      newValue: { stage: newStage, status: opp.status },
    }).catch(() => {});

    return opp;
  }

  public static listOpportunities(filters: { companyId?: string; stage?: CrmStage; status?: string; customerId?: string } = {}): CrmOpportunityData[] {
    let list = Array.from(this.inMemoryOpportunities.values());
    if (filters.companyId) list = list.filter((o) => !o.companyId || o.companyId === filters.companyId);
    if (filters.stage) list = list.filter((o) => o.stage === filters.stage);
    if (filters.status) list = list.filter((o) => o.status === filters.status);
    if (filters.customerId) list = list.filter((o) => o.customerId === filters.customerId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static getOpportunity(id: string): CrmOpportunityData | undefined {
    return this.inMemoryOpportunities.get(id);
  }

  /**
   * Generates aggregated Kanban Pipeline data grouped by stage with probabilities and metrics
   */
  public static getKanbanPipeline(companyId?: string): {
    stages: Record<CrmStage, { count: number; totalValueCents: number; weightedValueCents: number; items: CrmOpportunityData[] }>;
    metrics: {
      totalPipelineValueCents: number;
      totalWeightedValueCents: number;
      openCount: number;
      wonCount: number;
      lostCount: number;
      conversionRatePercent: number;
    };
  } {
    const list = this.listOpportunities({ companyId });

    const stagesDef: CrmStage[] = ["LEAD", "CONTACT", "OPPORTUNITY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
    const stages: Record<string, any> = {};

    for (const st of stagesDef) {
      stages[st] = { count: 0, totalValueCents: 0, weightedValueCents: 0, items: [] };
    }

    let totalPipelineValueCents = 0;
    let totalWeightedValueCents = 0;
    let wonCount = 0;
    let lostCount = 0;
    let openCount = 0;

    for (const opp of list) {
      const val = Number(opp.expectedRevenueCents) || 0;
      const weighted = Math.round((val * opp.probabilityPercent) / 100);

      const target = stages[opp.stage] || stages["OPPORTUNITY"];
      target.count += 1;
      target.totalValueCents += val;
      target.weightedValueCents += weighted;
      target.items.push(opp);

      if (opp.status === "WON") wonCount++;
      else if (opp.status === "LOST") lostCount++;
      else {
        openCount++;
        totalPipelineValueCents += val;
        totalWeightedValueCents += weighted;
      }
    }

    const totalResolved = wonCount + lostCount;
    const conversionRatePercent = totalResolved > 0 ? Math.round((wonCount / totalResolved) * 100) : 0;

    return {
      stages: stages as any,
      metrics: {
        totalPipelineValueCents,
        totalWeightedValueCents,
        openCount,
        wonCount,
        lostCount,
        conversionRatePercent,
      },
    };
  }

  // =========================================================================
  // 3. AGENDA COMERCIAL (ATIVIDADES)
  // =========================================================================

  public static async scheduleActivity(data: Omit<CrmActivityData, "id" | "createdAt" | "updatedAt" | "status">): Promise<CrmActivityData> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const activity: CrmActivityData = {
      id,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    this.inMemoryActivities.set(id, activity);

    try {
      await prisma.crmActivity.create({
        data: {
          id: activity.id,
          companyId: activity.companyId ?? null,
          branchId: activity.branchId ?? null,
          type: activity.type,
          title: activity.title,
          description: activity.description ?? null,
          priority: activity.priority,
          status: activity.status,
          scheduledAt: new Date(activity.scheduledAt),
          customerId: activity.customerId ?? null,
          leadId: activity.leadId ?? null,
          opportunityId: activity.opportunityId ?? null,
          assignedToUserId: activity.assignedToUserId ?? null,
        },
      });
    } catch {
      // In-memory fallback
    }

    return activity;
  }

  public static async completeActivity(id: string, resultNotes: string): Promise<CrmActivityData> {
    const activity = this.inMemoryActivities.get(id);
    if (!activity) throw new Error(`Atividade não encontrada: ${id}`);

    activity.status = "COMPLETED";
    activity.resultNotes = resultNotes;
    activity.completedAt = new Date().toISOString();
    activity.updatedAt = new Date().toISOString();

    try {
      await prisma.crmActivity.update({
        where: { id },
        data: {
          status: "COMPLETED",
          resultNotes,
          completedAt: new Date(activity.completedAt),
        },
      });
    } catch {
      // In-memory fallback
    }

    return activity;
  }

  public static listActivities(filters: { companyId?: string; assignedToUserId?: string; customerId?: string; opportunityId?: string; status?: string } = {}): CrmActivityData[] {
    let list = Array.from(this.inMemoryActivities.values());
    if (filters.companyId) list = list.filter((a) => !a.companyId || a.companyId === filters.companyId);
    if (filters.assignedToUserId) list = list.filter((a) => a.assignedToUserId === filters.assignedToUserId);
    if (filters.customerId) list = list.filter((a) => a.customerId === filters.customerId);
    if (filters.opportunityId) list = list.filter((a) => a.opportunityId === filters.opportunityId);
    if (filters.status) list = list.filter((a) => a.status === filters.status);
    return list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }

  // =========================================================================
  // 4. PROPOSTAS & COTAÇÕES
  // =========================================================================

  public static async createProposal(data: {
    title: string;
    customerId?: string;
    customerName?: string;
    leadId?: string;
    opportunityId?: string;
    currency?: string;
    validUntil?: string;
    termsAndConditions?: string;
    notes?: string;
    items: ProposalItemData[];
    companyId?: string;
    branchId?: string;
  }): Promise<CrmProposalData> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const number = `PROP-${new Date().getFullYear()}-${String(this.inMemoryProposals.size + 1).padStart(4, "0")}`;

    const totalAmountCents = data.items.reduce((sum, item) => sum + (item.totalCents || item.quantity * item.unitPriceCents), 0);

    const proposal: CrmProposalData = {
      id,
      number,
      title: data.title,
      customerId: data.customerId,
      customerName: data.customerName,
      leadId: data.leadId,
      opportunityId: data.opportunityId,
      status: "DRAFT",
      totalAmountCents,
      currency: data.currency ?? "AOA",
      validUntil: data.validUntil,
      termsAndConditions: data.termsAndConditions,
      notes: data.notes,
      items: data.items,
      companyId: data.companyId,
      branchId: data.branchId,
      createdAt: now,
      updatedAt: now,
    };

    this.inMemoryProposals.set(id, proposal);

    try {
      await prisma.crmProposal.create({
        data: {
          id: proposal.id,
          number: proposal.number,
          title: proposal.title,
          customerId: proposal.customerId ?? null,
          leadId: proposal.leadId ?? null,
          opportunityId: proposal.opportunityId ?? null,
          status: proposal.status,
          totalAmountCents: BigInt(proposal.totalAmountCents),
          currency: proposal.currency,
          validUntil: proposal.validUntil ? new Date(proposal.validUntil) : null,
          termsAndConditions: proposal.termsAndConditions ?? null,
          notes: proposal.notes ?? null,
          items: JSON.parse(JSON.stringify(proposal.items)),
          companyId: proposal.companyId ?? null,
          branchId: proposal.branchId ?? null,
        },
      });
    } catch {
      // In-memory fallback
    }

    return proposal;
  }

  public static async updateProposalStatus(id: string, status: ProposalStatus, actorId?: string): Promise<CrmProposalData> {
    const prop = this.inMemoryProposals.get(id);
    if (!prop) throw new Error(`Proposta não encontrada: ${id}`);

    prop.status = status;
    prop.updatedAt = new Date().toISOString();
    if (status === "ACCEPTED" || status === "CONVERTED") {
      prop.approvedById = actorId;
      prop.approvedAt = new Date().toISOString();
    }

    try {
      await prisma.crmProposal.update({
        where: { id },
        data: {
          status: prop.status,
          approvedById: prop.approvedById ?? null,
          approvedAt: prop.approvedAt ? new Date(prop.approvedAt) : null,
        },
      });
    } catch {
      // In-memory fallback
    }

    return prop;
  }

  public static listProposals(filters: { companyId?: string; customerId?: string; opportunityId?: string; status?: ProposalStatus } = {}): CrmProposalData[] {
    let list = Array.from(this.inMemoryProposals.values());
    if (filters.companyId) list = list.filter((p) => !p.companyId || p.companyId === filters.companyId);
    if (filters.customerId) list = list.filter((p) => p.customerId === filters.customerId);
    if (filters.opportunityId) list = list.filter((p) => p.opportunityId === filters.opportunityId);
    if (filters.status) list = list.filter((p) => p.status === filters.status);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static getProposal(id: string): CrmProposalData | undefined {
    return this.inMemoryProposals.get(id);
  }

  // =========================================================================
  // 5. RELACIONAMENTO & SUPORTE AO CLIENTE (HELPDESK / TICKETS)
  // =========================================================================

  public static async createTicket(data: {
    customerId: string;
    customerName?: string;
    type: TicketType;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    title: string;
    description: string;
    assignedToUserId?: string;
    dueDate?: string;
    companyId?: string;
    branchId?: string;
  }): Promise<CrmTicketData> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ticketNumber = `TCK-${new Date().getFullYear()}-${String(this.inMemoryTickets.size + 1).padStart(4, "0")}`;

    const ticket: CrmTicketData = {
      id,
      ticketNumber,
      customerId: data.customerId,
      customerName: data.customerName,
      type: data.type,
      priority: data.priority ?? "NORMAL",
      status: "NEW",
      title: data.title,
      description: data.description,
      assignedToUserId: data.assignedToUserId,
      dueDate: data.dueDate,
      companyId: data.companyId,
      branchId: data.branchId,
      createdAt: now,
      updatedAt: now,
    };

    this.inMemoryTickets.set(id, ticket);

    try {
      await prisma.crmTicket.create({
        data: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          customerId: ticket.customerId,
          type: ticket.type,
          priority: ticket.priority,
          status: ticket.status,
          title: ticket.title,
          description: ticket.description,
          assignedToUserId: ticket.assignedToUserId ?? null,
          dueDate: ticket.dueDate ? new Date(ticket.dueDate) : null,
          companyId: ticket.companyId ?? null,
          branchId: ticket.branchId ?? null,
        },
      });
    } catch {
      // In-memory fallback
    }

    EnterpriseNotificationService.dispatch({
      type: ticket.priority === "URGENT" ? "CRITICAL" : "INFO",
      category: "SYSTEM",
      priority: ticket.priority,
      title: `Nova Ocorrência: ${ticket.ticketNumber} (${ticket.type})`,
      message: `${ticket.title} registada para o cliente.`,
      module: "CRM",
      companyId: ticket.companyId,
    });

    return ticket;
  }

  public static async resolveTicket(id: string, resolutionNotes: string): Promise<CrmTicketData> {
    const ticket = this.inMemoryTickets.get(id);
    if (!ticket) throw new Error(`Ocorrência não encontrada: ${id}`);

    ticket.status = "RESOLVED";
    ticket.resolutionNotes = resolutionNotes;
    ticket.resolvedAt = new Date().toISOString();
    ticket.updatedAt = new Date().toISOString();

    try {
      await prisma.crmTicket.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolutionNotes,
          resolvedAt: new Date(ticket.resolvedAt),
        },
      });
    } catch {
      // In-memory fallback
    }

    return ticket;
  }

  public static listTickets(filters: { companyId?: string; customerId?: string; status?: TicketStatus; type?: TicketType } = {}): CrmTicketData[] {
    let list = Array.from(this.inMemoryTickets.values());
    if (filters.companyId) list = list.filter((t) => !t.companyId || t.companyId === filters.companyId);
    if (filters.customerId) list = list.filter((t) => t.customerId === filters.customerId);
    if (filters.status) list = list.filter((t) => t.status === filters.status);
    if (filters.type) list = list.filter((t) => t.type === filters.type);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // =========================================================================
  // 6. DASHBOARD EXECUTIVO COMERCIAL
  // =========================================================================

  public static getCommercialDashboardMetrics(companyId?: string): {
    leadsGenerated: number;
    openOpportunities: number;
    pipelineTotalValueCents: number;
    weightedPipelineValueCents: number;
    conversionRatePercent: number;
    proposalsAccepted: number;
    pendingActivitiesCount: number;
    resolvedTicketsCount: number;
    topOpportunities: CrmOpportunityData[];
    upcomingActivities: CrmActivityData[];
  } {
    const leads = this.listLeads({ companyId });
    const opps = this.listOpportunities({ companyId });
    const activities = this.listActivities({ companyId, status: "PENDING" });
    const proposals = this.listProposals({ companyId });
    const tickets = this.listTickets({ companyId });

    const pipeline = this.getKanbanPipeline(companyId);

    return {
      leadsGenerated: leads.length,
      openOpportunities: pipeline.metrics.openCount,
      pipelineTotalValueCents: pipeline.metrics.totalPipelineValueCents,
      weightedPipelineValueCents: pipeline.metrics.totalWeightedValueCents,
      conversionRatePercent: pipeline.metrics.conversionRatePercent,
      proposalsAccepted: proposals.filter((p) => p.status === "ACCEPTED" || p.status === "CONVERTED").length,
      pendingActivitiesCount: activities.length,
      resolvedTicketsCount: tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length,
      topOpportunities: opps.slice(0, 5),
      upcomingActivities: activities.slice(0, 5),
    };
  }
}
