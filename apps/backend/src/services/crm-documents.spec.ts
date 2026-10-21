import test from "node:test";
import assert from "node:assert/strict";
import {
  EnterpriseCrmService,
  EnterpriseCustomer360Service,
  EnterpriseDocumentService,
  EnterpriseSearchService,
  EnterpriseRbacService,
  SYSTEM_PERMISSIONS,
} from "./enterprise/index.js";

test("EnterpriseCrmService: creates, updates, and converts Leads into Customers and Opportunities", async () => {
  // 1. Create a lead
  const lead = await EnterpriseCrmService.createLead({
    title: "Implantação ERP em Cadeia Hoteleira",
    companyName: "Hotéis Atlântico Luanda, SA",
    contactName: "Dra. Isabel Silva",
    nif: "5409823101",
    email: "i.silva@hoteisatlantico.ao",
    phone: "+244 923 888 999",
    segment: "Hotelaria & Turismo",
    potentialValueCents: 15_000_000_00, // 15.000.000 Kz
    stage: "LEAD",
    probabilityPercent: 25,
    source: "EVENT",
    notes: "Interesse demonstrado na FILDA 2026 para módulo POS e faturamento AGT.",
  });

  assert.ok(lead.id);
  assert.equal(lead.title, "Implantação ERP em Cadeia Hoteleira");
  assert.equal(lead.status, "OPEN");

  // 2. Update lead notes and stage
  const updated = await EnterpriseCrmService.updateLead(lead.id, {
    stage: "CONTACT",
    probabilityPercent: 35,
    notes: "Reunião de apresentação agendada com o conselho de administração.",
  });
  assert.equal(updated.stage, "CONTACT");
  assert.equal(updated.probabilityPercent, 35);

  // 3. Convert lead
  const conversion = await EnterpriseCrmService.convertLead(lead.id, {
    createCustomer: true,
    createOpportunity: true,
  });

  assert.ok(conversion.customerId, "Deve gerar ID de cliente");
  assert.ok(conversion.opportunityId, "Deve gerar ID de oportunidade");

  const convertedLead = EnterpriseCrmService.getLead(lead.id);
  assert.equal(convertedLead?.status, "WON");
  assert.equal(convertedLead?.convertedCustomerId, conversion.customerId);
  assert.equal(convertedLead?.convertedOpportunityId, conversion.opportunityId);
});

test("EnterpriseCrmService: manages Opportunities and calculates visual Kanban Pipeline metrics", async () => {
  // 1. Create Opportunities across different stages
  const opp1 = await EnterpriseCrmService.createOpportunity({
    title: "Contrato Anual Suporte VendaJá",
    customerName: "PetroAngola Serviços Lda",
    stage: "OPPORTUNITY",
    expectedRevenueCents: 6_000_000_00, // 6.000.000 Kz
    probabilityPercent: 40,
  });

  const opp2 = await EnterpriseCrmService.createOpportunity({
    title: "Upgrade 12 Terminais Touchscreen",
    customerName: "Farmácias Central Luanda",
    stage: "PROPOSAL",
    expectedRevenueCents: 4_000_000_00, // 4.000.000 Kz
    probabilityPercent: 60,
  });

  assert.ok(opp1.id);
  assert.ok(opp2.id);

  // 2. Move stage (Kanban drag-and-drop)
  const moved = await EnterpriseCrmService.moveOpportunityStage(opp1.id, "NEGOTIATION");
  assert.equal(moved.stage, "NEGOTIATION");
  assert.equal(moved.probabilityPercent, 80);

  // 3. Mark opp2 as WON
  const won = await EnterpriseCrmService.moveOpportunityStage(opp2.id, "WON");
  assert.equal(won.stage, "WON");
  assert.equal(won.status, "WON");
  assert.equal(won.probabilityPercent, 100);

  // 4. Calculate Kanban Pipeline
  const pipeline = EnterpriseCrmService.getKanbanPipeline();
  assert.ok(pipeline.stages.NEGOTIATION.count >= 1);
  assert.ok(pipeline.stages.WON.count >= 1);
  assert.ok(pipeline.metrics.totalPipelineValueCents > 0);
  assert.ok(pipeline.metrics.wonCount >= 1);
  assert.ok(pipeline.metrics.conversionRatePercent > 0);
});

test("EnterpriseCrmService: schedules and completes commercial activities in the Agenda", async () => {
  const activity = await EnterpriseCrmService.scheduleActivity({
    type: "MEETING",
    title: "Apresentação da Proposta Comercial e Demonstração do POS",
    description: "Demonstração prática ao Diretor de TI e Diretor Financeiro",
    priority: "HIGH",
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    customerName: "Grupo Sonangalp Distribuição",
    assignedToUserId: "user-rep-01",
  });

  assert.ok(activity.id);
  assert.equal(activity.type, "MEETING");
  assert.equal(activity.status, "PENDING");

  // Complete activity
  const completed = await EnterpriseCrmService.completeActivity(
    activity.id,
    "Cliente aprovou os requisitos funcionais e solicitou envio de proposta formal."
  );
  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.completedAt);
  assert.ok(completed.resultNotes?.includes("requisitos funcionais"));
});

test("EnterpriseCrmService: manages Commercial Proposals, calculates line totals, and status flow", async () => {
  const proposal = await EnterpriseCrmService.createProposal({
    title: "Proposta Licenciamento 4 Lojas",
    customerName: "Distribuidora do Cazenga Lda",
    validUntil: new Date(Date.now() + 15 * 86400000).toISOString(),
    items: [
      { description: "Módulo POS VendaJá Desktop", quantity: 4, unitPriceCents: 500_000_00, totalCents: 2_000_000_00 },
      { description: "Módulo de Contabilidade PGCA e SAF-T", quantity: 1, unitPriceCents: 800_000_00, totalCents: 800_000_00 },
    ],
  });

  assert.ok(proposal.id);
  assert.ok(proposal.number.startsWith("PROP-"));
  assert.equal(Number(proposal.totalAmountCents), 2_800_000_00);
  assert.equal(proposal.status, "DRAFT");

  // Update status to ACCEPTED
  const accepted = await EnterpriseCrmService.updateProposalStatus(proposal.id, "ACCEPTED", "director-1");
  assert.equal(accepted.status, "ACCEPTED");
  assert.equal(accepted.approvedById, "director-1");
  assert.ok(accepted.approvedAt);
});

test("EnterpriseCrmService: handles Customer Care Tickets, complaints and incident resolution", async () => {
  const ticket = await EnterpriseCrmService.createTicket({
    customerId: "cust-001",
    customerName: "Padaria e Pastelaria Luanda Lda",
    type: "COMPLAINT",
    priority: "URGENT",
    title: "Problema com comunicação com impressora térmica de talões",
    description: "O driver da impressora ESC/POS não imprime o código QR fiscal após atualização do Windows.",
  });

  assert.ok(ticket.id);
  assert.ok(ticket.ticketNumber.startsWith("TCK-"));
  assert.equal(ticket.status, "NEW");
  assert.equal(ticket.priority, "URGENT");

  // Resolve ticket
  const resolved = await EnterpriseCrmService.resolveTicket(
    ticket.id,
    "Configurado baudrate da porta USB para 9600 bps e reinstalado driver ESC/POS."
  );
  assert.equal(resolved.status, "RESOLVED");
  assert.ok(resolved.resolvedAt);
});

test("EnterpriseCustomer360Service: aggregates full 360-degree customer profile with health score", async () => {
  const profile = await EnterpriseCustomer360Service.getCustomer360("cust-hiper-sul");
  assert.ok(profile, "Perfil 360 deve ser gerado");
  assert.ok(profile.healthScore >= 0 && profile.healthScore <= 100, "Health Score deve estar entre 0 e 100");
  assert.ok(profile.creditLimitCents >= 0);
  assert.ok(Array.isArray(profile.sales));
  assert.ok(Array.isArray(profile.opportunities));
  assert.ok(Array.isArray(profile.proposals));
  assert.ok(Array.isArray(profile.activities));
  assert.ok(Array.isArray(profile.tickets));
});

test("EnterpriseDocumentService: uploads corporate documents with SHA-256 and manages version history", async () => {
  // 1. Upload initial document (v1)
  const doc = await EnterpriseDocumentService.uploadDocument({
    title: "Alvará Comercial 2026 - Província de Luanda",
    category: "LICENSE",
    fileName: "Alvara_Comercial_2026.pdf",
    fileExtension: "pdf",
    sizeBytes: 845200,
    rawContent: "Alvará Comercial Oficial emitido pelo Governo Provincial de Luanda",
    tags: ["Legal", "Alvará", "Licença"],
    relatedEntityType: "Company",
  });

  assert.ok(doc.id);
  assert.ok(doc.code.startsWith("DOC-LIC-"));
  assert.equal(doc.currentVersion, 1);
  assert.equal(doc.status, "ACTIVE");
  assert.equal(doc.checksumSha256.length, 64, "Checksum SHA-256 deve ter 64 caracteres hexadecimais");

  // 2. Upload new version (v2)
  const v2 = await EnterpriseDocumentService.uploadNewVersion(doc.id, {
    fileName: "Alvara_Comercial_2026_Assinado.pdf",
    rawContent: "Alvará Comercial com aposição do carimbo fiscal e assinatura digital AGT",
    changeNotes: "Aposição de carimbo fiscal e renovação da certidão",
    uploadedById: "legal-officer-1",
  });

  assert.equal(v2.versionNumber, 2);
  assert.notEqual(v2.checksumSha256, doc.versions[doc.versions.length - 1]?.checksumSha256);

  const updatedDoc = EnterpriseDocumentService.getDocument(doc.id);
  assert.equal(updatedDoc?.currentVersion, 2);
  assert.equal(updatedDoc?.versions.length, 2);

  // 3. Archive document
  const archived = EnterpriseDocumentService.archiveDocument(doc.id);
  assert.equal(archived.status, "ARCHIVED");
});

test("EnterpriseSearchService: executes federated global search across multiple enterprise domains", async () => {
  const result = await EnterpriseSearchService.search("Luanda");
  assert.equal(result.query, "Luanda");
  assert.ok(result.totalResults >= 1, "Pesquisa global por 'Luanda' deve encontrar resultados");
  assert.ok(Array.isArray(result.flatResults));

  const types = new Set(result.flatResults.map((r) => r.type));
  assert.ok(types.size >= 1);
  for (const item of result.flatResults) {
    assert.ok(item.id);
    assert.ok(item.title);
    assert.ok(item.actionUrl);
  }
});

test("EnterpriseRbacService: contains all 52+ granular enterprise permissions across core modules", () => {
  assert.ok(SYSTEM_PERMISSIONS.length >= 52, "Deve conter pelo menos 52 permissões granulares de governança, automação, CRM e documentos");

  const modules = new Set(SYSTEM_PERMISSIONS.map((p) => p.module));
  assert.ok(modules.has("POS"));
  assert.ok(modules.has("STOCK"));
  assert.ok(modules.has("ACCOUNTING"));
  assert.ok(modules.has("HR"));
  assert.ok(modules.has("SETTINGS"));
  assert.ok(modules.has("AUTOMATION"));
  assert.ok(modules.has("CRM"));
  assert.ok(modules.has("DOCUMENTS"));
});
