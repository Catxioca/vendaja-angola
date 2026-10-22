import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";

export interface PermissionDefinition {
  code: string;
  module: string;
  screen?: string;
  action: string;
  description: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  // Sales & POS
  { code: "Sales.View", module: "POS", screen: "PDV", action: "View", description: "Visualizar vendas e histórico de transações" },
  { code: "Sales.Create", module: "POS", screen: "PDV", action: "Create", description: "Efetuar novas vendas e emitir faturas" },
  { code: "Sales.Edit", module: "POS", screen: "PDV", action: "Edit", description: "Editar rascunhos de documentos comerciais" },
  { code: "Sales.Delete", module: "POS", screen: "PDV", action: "Delete", description: "Eliminar proformas e orçamentos pendentes" },
  { code: "Sales.Approve", module: "POS", screen: "PDV", action: "Approve", description: "Aprovar descontos extraordinários ou crédito" },
  { code: "Sales.Cancel", module: "POS", screen: "PDV", action: "Cancel", description: "Autorizar cancelamento e estorno de faturas" },
  { code: "Sales.Export", module: "POS", screen: "Reports", action: "Export", description: "Exportar listagens de faturamento e vendas" },

  // Stocks & Warehouses
  { code: "Stock.View", module: "STOCK", screen: "Catalog", action: "View", description: "Consultar catálogo de produtos e saldos" },
  { code: "Stock.Create", module: "STOCK", screen: "Catalog", action: "Create", description: "Criar novos produtos, lotes e armazéns" },
  { code: "Stock.Edit", module: "STOCK", screen: "Catalog", action: "Edit", description: "Modificar preços, custos e fichas técnicas" },
  { code: "Stock.Delete", module: "STOCK", screen: "Catalog", action: "Delete", description: "Eliminar ou inativar itens de inventário" },
  { code: "Stock.Adjust", module: "STOCK", screen: "Inventory", action: "Adjust", description: "Lançar quebras, sobras e acertos de stock" },
  { code: "Stock.Transfer", module: "STOCK", screen: "Inventory", action: "Transfer", description: "Movimentar guias de transferência entre lojas" },

  // Purchases & Suppliers
  { code: "Purchases.View", module: "STOCK", screen: "Purchases", action: "View", description: "Visualizar ordens de compra e fornecedores" },
  { code: "Purchases.Create", module: "STOCK", screen: "Purchases", action: "Create", description: "Registar faturas de compra e encomendas" },
  { code: "Purchases.Edit", module: "STOCK", screen: "Purchases", action: "Edit", description: "Editar compras em aberto e cotações" },
  { code: "Purchases.Delete", module: "STOCK", screen: "Purchases", action: "Delete", description: "Anular registos de compras não liquidados" },
  { code: "Purchases.Approve", module: "STOCK", screen: "Purchases", action: "Approve", description: "Aprovar compras acima do limite de autorização" },

  // Accounting & Cashflow
  { code: "Accounting.View", module: "ACCOUNTING", screen: "Ledger", action: "View", description: "Consultar extratos, plano de contas PGCA e balancetes" },
  { code: "Accounting.Create", module: "ACCOUNTING", screen: "Ledger", action: "Create", description: "Lançar diários manuais e movimentos de fecho" },
  { code: "Accounting.Edit", module: "ACCOUNTING", screen: "Ledger", action: "Edit", description: "Retificar movimentos e contas correntes" },
  { code: "Accounting.Approve", module: "ACCOUNTING", screen: "Ledger", action: "Approve", description: "Aprovar encerramento de exercícios fiscais" },
  { code: "Accounting.Export", module: "ACCOUNTING", screen: "Reports", action: "Export", description: "Exportar ficheiro SAF-T AO e demonstrações financeiras" },
  { code: "Cashflow.View", module: "ACCOUNTING", screen: "Cashflow", action: "View", description: "Consultar tesouraria e entradas/saídas de caixa" },
  { code: "Cashflow.Manage", module: "ACCOUNTING", screen: "Cashflow", action: "Manage", description: "Executar sangrias, suprimentos e transferências bancárias" },

  // Human Resources
  { code: "HR.View", module: "HR", screen: "Employees", action: "View", description: "Ver lista e fichas de colaboradores" },
  { code: "HR.Create", module: "HR", screen: "Employees", action: "Create", description: "Admitir novos funcionários e gerar contratos" },
  { code: "HR.Edit", module: "HR", screen: "Employees", action: "Edit", description: "Alterar dados cadastrais e cargos de colaboradores" },
  { code: "HR.Salary.View", module: "HR", screen: "Payroll", action: "View", description: "Consultar folhas de salário e mapas INSS/IRT" },
  { code: "HR.Salary.Edit", module: "HR", screen: "Payroll", action: "Edit", description: "Processar remunerações, horas extras e subsídios" },

  // Audit & Security Governance
  { code: "Audit.View", module: "SETTINGS", screen: "Audit", action: "View", description: "Consultar trilhas de auditoria corporativa" },
  { code: "Audit.Export", module: "SETTINGS", screen: "Audit", action: "Export", description: "Exportar registos de auditoria em CSV/JSON" },
  { code: "Security.View", module: "SETTINGS", screen: "Security", action: "View", description: "Visualizar utilizadores, sessões e políticas" },
  { code: "Security.Manage", module: "SETTINGS", screen: "Security", action: "Manage", description: "Gerir perfis RBAC, permissões, MFA e bloqueios" },
  { code: "Backup.View", module: "SETTINGS", screen: "Backups", action: "View", description: "Consultar histórico e estado dos backups" },
  { code: "Backup.Manage", module: "SETTINGS", screen: "Backups", action: "Manage", description: "Efetuar backups manuais e restaurar base de dados" },
  { code: "Platform.Manage", module: "SETTINGS", screen: "Platform", action: "Manage", description: "Configurar dados fiscais, terminais e filiais" },

  // Workflow, Automation & Process Governance (Fase 3)
  { code: "Automation.Workflow.View", module: "AUTOMATION", screen: "Workflows", action: "View", description: "Consultar fluxos de trabalho e instâncias ativas" },
  { code: "Automation.Workflow.Manage", module: "AUTOMATION", screen: "Workflows", action: "Manage", description: "Configurar definições de workflow, estados e matrizes" },
  { code: "Automation.Workflow.Approve", module: "AUTOMATION", screen: "Approvals", action: "Approve", description: "Aprovar, rejeitar ou solicitar revisão de processos" },
  { code: "Automation.Tasks.Manage", module: "AUTOMATION", screen: "Tasks", action: "Manage", description: "Criar, atribuir e concluir tarefas e atividades operacionais" },
  { code: "Automation.Rules.Manage", module: "AUTOMATION", screen: "Rules", action: "Manage", description: "Configurar regras e gatilhos de automação de eventos" },
  { code: "Automation.Queue.Manage", module: "AUTOMATION", screen: "Queue", action: "Manage", description: "Monitorizar e gerir fila assíncrona de processamento" },

  // CRM, Customer Experience & Document Management (Fase 4)
  { code: "CRM.View", module: "CRM", screen: "Pipeline", action: "View", description: "Consultar leads, pipeline, oportunidades e propostas comerciais" },
  { code: "CRM.Create", module: "CRM", screen: "Pipeline", action: "Create", description: "Criar novos leads, oportunidades e propostas" },
  { code: "CRM.Edit", module: "CRM", screen: "Pipeline", action: "Edit", description: "Modificar dados do pipeline e atualizar propostas" },
  { code: "CRM.Delete", module: "CRM", screen: "Pipeline", action: "Delete", description: "Eliminar oportunidades e propostas canceladas" },
  { code: "CRM.Approve", module: "CRM", screen: "Proposals", action: "Approve", description: "Aprovar propostas comerciais e descontos especiais" },
  { code: "Documents.View", module: "DOCUMENTS", screen: "Archive", action: "View", description: "Consultar repositório e arquivos documentais" },
  { code: "Documents.Create", module: "DOCUMENTS", screen: "Archive", action: "Create", description: "Carregar novos ficheiros e criar documentos" },
  { code: "Documents.Edit", module: "DOCUMENTS", screen: "Archive", action: "Edit", description: "Editar metadados e carregar novas versões de documentos" },
  { code: "Documents.Delete", module: "DOCUMENTS", screen: "Archive", action: "Delete", description: "Arquivar ou eliminar documentos do repositório" },

  // APIs, Integrations, Webhooks & Ecosystem (Fase 5)
  { code: "API.Customers.Read", module: "API", screen: "PublicAPI", action: "Read", description: "Leitura de clientes e contactos via API" },
  { code: "API.Customers.Write", module: "API", screen: "PublicAPI", action: "Write", description: "Criação e alteração de clientes via API" },
  { code: "API.Products.Read", module: "API", screen: "PublicAPI", action: "Read", description: "Leitura do catálogo de produtos e stock via API" },
  { code: "API.Products.Write", module: "API", screen: "PublicAPI", action: "Write", description: "Criação e atualização de produtos via API" },
  { code: "API.Sales.Read", module: "API", screen: "PublicAPI", action: "Read", description: "Consulta de vendas e faturas emitidas via API" },
  { code: "API.Sales.Write", module: "API", screen: "PublicAPI", action: "Write", description: "Emissão de faturas e registo de vendas via API" },
  { code: "API.Purchases.Read", module: "API", screen: "PublicAPI", action: "Read", description: "Consulta de compras e fornecedores via API" },
  { code: "API.Purchases.Write", module: "API", screen: "PublicAPI", action: "Write", description: "Criação de encomendas de compra via API" },
  { code: "API.Accounting.Read", module: "API", screen: "PublicAPI", action: "Read", description: "Consulta de relatórios financeiros e PGCA via API" },
  { code: "API.Accounting.Write", module: "API", screen: "PublicAPI", action: "Write", description: "Lançamentos e reconciliação contábil via API" },
  { code: "API.Webhooks.Manage", module: "API", screen: "Webhooks", action: "Manage", description: "Configurar e monitorizar webhooks corporativos" },
  { code: "API.Integrations.Manage", module: "API", screen: "Integrations", action: "Manage", description: "Gerir conectores externos (AGT, Multicaixa, Primavera, SAP)" },
  { code: "API.Plugins.Manage", module: "API", screen: "Marketplace", action: "Manage", description: "Instalar e gerir plugins e extensões do ecossistema" },

  // Enterprise Finance, Treasury, Assets & Accounting (Fase 6)
  { code: "Finance.View", module: "FINANCE", screen: "Dashboard", action: "View", description: "Consultar cockpit do CFO, balanços e relatórios financeiros" },
  { code: "Finance.Create", module: "FINANCE", screen: "Accounting", action: "Create", description: "Criar lançamentos, orçamentos e centros de custo" },
  { code: "Finance.Edit", module: "FINANCE", screen: "Accounting", action: "Edit", description: "Editar transações e registos financeiros em aberto" },
  { code: "Finance.Approve", module: "FINANCE", screen: "Approvals", action: "Approve", description: "Aprovar pagamentos vultosos, liquidações e reaberturas" },
  { code: "Treasury.View", module: "FINANCE", screen: "Treasury", action: "View", description: "Aceder a saldos bancários, caixas e extratos" },
  { code: "Treasury.Approve", module: "FINANCE", screen: "Treasury", action: "Approve", description: "Autorizar transferências bancárias e pagamentos" },
  { code: "Assets.View", module: "FINANCE", screen: "Assets", action: "View", description: "Consultar inventário patrimonial e fichas de ativos" },
  { code: "Assets.Manage", module: "FINANCE", screen: "Assets", action: "Manage", description: "Registar aquisições, abates e depreciações de ativos" },
  { code: "Budget.Manage", module: "FINANCE", screen: "Budgets", action: "Manage", description: "Configurar orçamentos e aprovar tetos orçamentais" },
  { code: "Closing.Manage", module: "FINANCE", screen: "Closing", action: "Manage", description: "Executar fecho formal mensal e anual de períodos" },

  // Business Intelligence, Analytics & Executive Cockpits (Fase 7)
  { code: "BI.View", module: "BI", screen: "ExecutiveCockpit", action: "View", description: "Consultar dashboards executivos, KPIs departamentais e previsões" },
  { code: "BI.Export", module: "BI", screen: "Reports", action: "Export", description: "Exportar relatórios analíticos em PDF, Excel, CSV e Power BI" },
  { code: "BI.CreateDashboard", module: "BI", screen: "DashboardBuilder", action: "Create", description: "Construir e personalizar dashboards e widgets analíticos" },
  { code: "BI.Manage", module: "BI", screen: "Configuration", action: "Manage", description: "Administrar regras de alertas executivos e modelos de BI" },

  // Artificial Intelligence, VendaJá Copilot & Machine Learning (Fase 10)
  { code: "AI.View", module: "AI", screen: "Copilot", action: "View", description: "Aceder ao assistente inteligente VendaJá Copilot" },
  { code: "AI.Chat", module: "AI", screen: "Copilot", action: "Chat", description: "Interagir em linguagem natural com o VendaJá Copilot" },
  { code: "AI.Forecast", module: "AI", screen: "Copilot", action: "Forecast", description: "Consultar previsões de vendas, stock e tesouraria por IA" },
  { code: "AI.Analytics", module: "AI", screen: "Copilot", action: "Analytics", description: "Solicitar insights analíticos e deteção de anomalias por IA" },
  { code: "AI.Admin", module: "AI", screen: "Copilot", action: "Admin", description: "Administrar modelos, parâmetros e auditoria de IA" },

  // Biometrics & Intelligent Access Control (Fase 11)
  { code: "Biometrics.View", module: "BIOMETRICS", screen: "AccessControl", action: "View", description: "Visualizar monitores de acesso, presenças e dashboard biométrico" },
  { code: "Biometrics.Enroll", module: "BIOMETRICS", screen: "AccessControl", action: "Enroll", description: "Efetuar cadastro facial, impressões digitais, cartões RFID e QR" },
  { code: "Biometrics.Access", module: "BIOMETRICS", screen: "AccessControl", action: "Access", description: "Configurar regras de acesso, horários e autorizações de entrada" },
  { code: "Biometrics.Hardware", module: "BIOMETRICS", screen: "AccessControl", action: "Hardware", description: "Administrar torniquetes, portas, controladores ZKTeco, Hikvision e relés" },
  { code: "Biometrics.Audit", module: "BIOMETRICS", screen: "AccessControl", action: "Audit", description: "Auditar trilha forense de entradas, recusas e relatórios de assiduidade" },

  // Corporate Headquarters, Multi-Store & Live Updates (Fase 10.8)
  { code: "Corporate.View", module: "CORPORATE", screen: "Headquarters", action: "View", description: "Consultar Centro Corporativo, filiais e cockpit multi-loja em tempo real" },
  { code: "Corporate.Manage", module: "CORPORATE", screen: "Headquarters", action: "Manage", description: "Criar, editar, suspender e configurar filiais e lojas remotas" },
  { code: "Corporate.Users", module: "CORPORATE", screen: "Headquarters", action: "Users", description: "Gestão centralizada de utilizadores, funções e credenciais remotas" },
  { code: "Corporate.Modules", module: "CORPORATE", screen: "Headquarters", action: "Modules", description: "Ativar, desativar, suspender e distribuir módulos por loja" },
  { code: "Corporate.Licenses", module: "CORPORATE", screen: "Headquarters", action: "Licenses", description: "Gestão corporativa de licenças, ativações e transferências" },
  { code: "Corporate.LiveUpdate", module: "CORPORATE", screen: "Headquarters", action: "LiveUpdate", description: "Publicar e distribuir atualizações live, componentes e patches sem instalador" },
  { code: "Corporate.Broadcast", module: "CORPORATE", screen: "Headquarters", action: "Broadcast", description: "Emitir comunicados, circulares e alertas para as lojas" },
];

export class EnterpriseRbacService {
  /**
   * Ensures all system permissions are present in the database
   */
  public static async syncPermissions(): Promise<void> {
    try {
      for (const perm of SYSTEM_PERMISSIONS) {
        await prisma.permission.upsert({
          where: { code: perm.code },
          update: {
            module: perm.module,
            screen: perm.screen ?? null,
            action: perm.action,
            description: perm.description,
          },
          create: {
            code: perm.code,
            module: perm.module,
            screen: perm.screen ?? null,
            action: perm.action,
            description: perm.description,
          },
        });
      }
    } catch (error) {
      logger.error("RBAC", "SYNC_PERMISSIONS_FAILED", "Falha ao sincronizar permissões do sistema", error);
    }
  }

  /**
   * Lists all available permissions grouped by module
   */
  public static async listPermissions() {
    await this.syncPermissions();
    return prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { code: "asc" }],
    });
  }

  /**
   * Lists roles for a company (or system roles)
   */
  public static async listRoles(companyId?: string) {
    return prisma.role.findMany({
      where: companyId
        ? { OR: [{ companyId }, { isSystem: true, companyId: null }] }
        : { isSystem: true },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
  }

  /**
   * Creates a new custom role
   */
  public static async createRole(data: {
    companyId?: string;
    name: string;
    code: string;
    description?: string;
    permissionCodes?: string[];
  }) {
    const role = await prisma.role.create({
      data: {
        companyId: data.companyId ?? null,
        name: data.name,
        code: data.code.toUpperCase(),
        description: data.description,
        isSystem: false,
      },
    });

    if (data.permissionCodes?.length) {
      await this.assignPermissionsToRole(role.id, data.permissionCodes);
    }

    return this.getRoleById(role.id);
  }

  /**
   * Clones an existing role with all its associated permissions
   */
  public static async cloneRole(sourceRoleId: string, newName: string, newCode: string, companyId?: string) {
    const sourceRole = await prisma.role.findUnique({
      where: { id: sourceRoleId },
      include: { rolePermissions: { include: { permission: true } } },
    });

    if (!sourceRole) throw new Error("Perfil de origem não encontrado.");

    const permissionCodes = sourceRole.rolePermissions.map((rp) => rp.permission.code);
    return this.createRole({
      companyId: companyId ?? sourceRole.companyId ?? undefined,
      name: newName,
      code: newCode,
      description: `Clonado a partir de ${sourceRole.name}`,
      permissionCodes,
    });
  }

  /**
   * Retrieves a role by ID with its permissions
   */
  public static async getRoleById(roleId: string) {
    return prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
  }

  /**
   * Updates an existing role's metadata and permissions
   */
  public static async updateRole(
    roleId: string,
    data: { name?: string; description?: string; permissionCodes?: string[] }
  ) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new Error("Perfil não encontrado.");

    await prisma.role.update({
      where: { id: roleId },
      data: {
        name: data.name ?? role.name,
        description: data.description !== undefined ? data.description : role.description,
      },
    });

    if (data.permissionCodes) {
      await this.assignPermissionsToRole(roleId, data.permissionCodes);
    }

    return this.getRoleById(roleId);
  }

  /**
   * Deletes a custom role (system roles cannot be deleted)
   */
  public static async deleteRole(roleId: string) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new Error("Perfil não encontrado.");
    if (role.isSystem) throw new Error("Perfis de sistema não podem ser eliminados.");

    return prisma.role.delete({ where: { id: roleId } });
  }

  /**
   * Assigns an explicit set of permission codes to a role
   */
  public static async assignPermissionsToRole(roleId: string, permissionCodes: string[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Clear existing associations
      await tx.rolePermission.deleteMany({ where: { roleId } });

      if (!permissionCodes.length) return;

      const permissions = await tx.permission.findMany({
        where: { code: { in: permissionCodes } },
        select: { id: true },
      });

      for (const perm of permissions) {
        await tx.rolePermission.create({
          data: {
            roleId,
            permissionId: perm.id,
          },
        });
      }
    });
  }

  /**
   * Computes effective permissions for a user within a company context
   */
  public static async getUserPermissions(userId: string, companyId?: string): Promise<string[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: companyId ? { companyId, active: true } : { active: true },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) return [];

    const effectivePermissions = new Set<string>();

    // Administrator always has wildcard access to all permissions
    const isGlobalAdmin =
      user.role === "ROLE_ADMIN" ||
      user.role === "ADMIN" ||
      user.role === "ROLE_SUPER_ADMIN" ||
      user.role === "SUPER_ADMIN";
    const isCompanyAdmin = user.memberships.some(
      (m) =>
        m.role === "ROLE_ADMIN" ||
        m.role === "ADMIN" ||
        m.role === "ROLE_SUPER_ADMIN" ||
        m.role === "SUPER_ADMIN"
    );

    if (isGlobalAdmin || isCompanyAdmin) {
      return SYSTEM_PERMISSIONS.map((p) => p.code);
    }

    // Resolve permissions from membership roles or user legacy role
    const rolesToCheck = new Set<string>();
    if (user.role) rolesToCheck.add(user.role);
    for (const m of user.memberships) {
      if (m.role) rolesToCheck.add(m.role);
    }

    // Map legacy roles to standard permissions
    for (const r of rolesToCheck) {
      const normalized = r.toUpperCase();
      if (normalized.includes("CASHIER") || normalized.includes("OPERATOR")) {
        effectivePermissions.add("Sales.View");
        effectivePermissions.add("Sales.Create");
        effectivePermissions.add("Sales.Cancel");
        effectivePermissions.add("Stock.View");
        effectivePermissions.add("AI.View");
        effectivePermissions.add("AI.Chat");
      }
      if (normalized.includes("HR")) {
        effectivePermissions.add("HR.View");
        effectivePermissions.add("HR.Create");
        effectivePermissions.add("HR.Edit");
        effectivePermissions.add("HR.Salary.View");
        effectivePermissions.add("HR.Salary.Edit");
        effectivePermissions.add("AI.View");
        effectivePermissions.add("AI.Chat");
      }
      if (normalized.includes("ACCOUNTANT") || normalized.includes("ACCOUNTING")) {
        effectivePermissions.add("Accounting.View");
        effectivePermissions.add("Accounting.Create");
        effectivePermissions.add("Accounting.Edit");
        effectivePermissions.add("Accounting.Approve");
        effectivePermissions.add("Accounting.Export");
        effectivePermissions.add("Cashflow.View");
        effectivePermissions.add("Cashflow.Manage");
        effectivePermissions.add("Sales.View");
        effectivePermissions.add("Purchases.View");
        effectivePermissions.add("AI.View");
        effectivePermissions.add("AI.Chat");
        effectivePermissions.add("AI.Analytics");
      }
      if (normalized.includes("MANAGER") || normalized.includes("SUPERVISOR")) {
        effectivePermissions.add("Sales.View");
        effectivePermissions.add("Sales.Create");
        effectivePermissions.add("Sales.Edit");
        effectivePermissions.add("Sales.Approve");
        effectivePermissions.add("Sales.Cancel");
        effectivePermissions.add("Stock.View");
        effectivePermissions.add("Stock.Create");
        effectivePermissions.add("Stock.Edit");
        effectivePermissions.add("Stock.Adjust");
        effectivePermissions.add("Purchases.View");
        effectivePermissions.add("Purchases.Create");
        effectivePermissions.add("Cashflow.View");
        effectivePermissions.add("AI.View");
        effectivePermissions.add("AI.Chat");
        effectivePermissions.add("AI.Forecast");
        effectivePermissions.add("AI.Analytics");
      }
      if (normalized.includes("LOCAL_ADMIN")) {
        effectivePermissions.add("Sales.View");
        effectivePermissions.add("Sales.Create");
        effectivePermissions.add("Sales.Edit");
        effectivePermissions.add("Sales.Approve");
        effectivePermissions.add("Sales.Cancel");
        effectivePermissions.add("Stock.View");
        effectivePermissions.add("Stock.Create");
        effectivePermissions.add("Stock.Edit");
        effectivePermissions.add("Stock.Adjust");
        effectivePermissions.add("Purchases.View");
        effectivePermissions.add("Purchases.Create");
        effectivePermissions.add("Cashflow.View");
        effectivePermissions.add("Cashflow.Manage");
        effectivePermissions.add("Security.View");
        effectivePermissions.add("Audit.View");
        effectivePermissions.add("AI.View");
        effectivePermissions.add("AI.Chat");
      }
      if (normalized.includes("CFO") || normalized.includes("FINANCIAL_DIRECTOR")) {
        effectivePermissions.add("Finance.View");
        effectivePermissions.add("Finance.Create");
        effectivePermissions.add("Finance.Edit");
        effectivePermissions.add("Finance.Approve");
        effectivePermissions.add("Treasury.View");
        effectivePermissions.add("Treasury.Approve");
        effectivePermissions.add("Accounting.View");
        effectivePermissions.add("Accounting.Create");
        effectivePermissions.add("Accounting.Edit");
        effectivePermissions.add("Accounting.Approve");
        effectivePermissions.add("Accounting.Export");
        effectivePermissions.add("Cashflow.View");
        effectivePermissions.add("Cashflow.Manage");
        effectivePermissions.add("Budget.Manage");
        effectivePermissions.add("Closing.Manage");
        effectivePermissions.add("BI.View");
        effectivePermissions.add("BI.Export");
        effectivePermissions.add("AI.View");
        effectivePermissions.add("AI.Chat");
        effectivePermissions.add("AI.Forecast");
        effectivePermissions.add("AI.Analytics");
      }
      if (normalized.includes("CRO") || normalized.includes("COMMERCIAL_DIRECTOR")) {
        effectivePermissions.add("Sales.View");
        effectivePermissions.add("Sales.Create");
        effectivePermissions.add("Sales.Edit");
        effectivePermissions.add("Sales.Approve");
        effectivePermissions.add("Sales.Cancel");
        effectivePermissions.add("Sales.Export");
        effectivePermissions.add("Stock.View");
        effectivePermissions.add("CRM.View");
        effectivePermissions.add("CRM.Create");
        effectivePermissions.add("CRM.Edit");
        effectivePermissions.add("CRM.Approve");
        effectivePermissions.add("BI.View");
        effectivePermissions.add("AI.View");
        effectivePermissions.add("AI.Chat");
      }
    }

    // Role-based permissions from database
    const dbRoles = await prisma.role.findMany({
      where: {
        code: { in: Array.from(rolesToCheck).map((c) => c.toUpperCase()) },
        ...(companyId ? { OR: [{ companyId }, { isSystem: true }] } : {}),
      },
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });

    for (const dbRole of dbRoles) {
      for (const rp of dbRole.rolePermissions) {
        effectivePermissions.add(rp.permission.code);
      }
    }

    // Direct User Overrides (grants or explicit revocations)
    for (const up of user.userPermissions) {
      if (up.granted) {
        effectivePermissions.add(up.permission.code);
      } else {
        effectivePermissions.delete(up.permission.code);
      }
    }

    return Array.from(effectivePermissions);
  }

  /**
   * Checks whether a user has a specific granular permission
   */
  public static async hasPermission(userId: string, permissionCode: string, companyId?: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, companyId);
    return permissions.includes(permissionCode) || permissions.includes("*");
  }

  /**
   * Sets or revokes a direct permission override for a user
   */
  public static async setUserPermissionOverride(
    userId: string,
    permissionCode: string,
    granted: boolean
  ) {
    const perm = await prisma.permission.findUnique({
      where: { code: permissionCode },
    });
    if (!perm) throw new Error(`Permissão não encontrada: ${permissionCode}`);

    return prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId,
          permissionId: perm.id,
        },
      },
      update: { granted },
      create: {
        userId,
        permissionId: perm.id,
        granted,
      },
    });
  }
}
