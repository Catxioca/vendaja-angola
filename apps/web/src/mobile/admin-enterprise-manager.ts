/**
 * VendaJá Angola - Mobile ERP / Android Client
 * Administration, Security & Enterprise Extensions Manager (HR, BI, HQ, AI)
 *
 * ESCOPO & REGRAS:
 * - Acesso administrativo exclusivo a utilizadores com perfil ADMIN/ROLE_ADMIN.
 * - Log de auditoria apenas por endpoint existente respeitando o tenant (`/api/v1/platform/audit-logs`).
 * - Configuração de API protegida: nunca expõe tokens JWT, segredos ou palavras-passe.
 * - Headquarters: bloqueia consolidação com empresas externas sem relação explícita.
 * - IA Copilot: exige sessão autorizada e conectividade online; offline é bloqueada.
 * - Integrações não configuradas são declaradas expressamente como indisponíveis.
 * - Proibido o uso de dados mockados como dados operacionais do ERP.
 */

export interface ManagedUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  nif?: string | null;
  phone?: string | null;
  createdAt: string;
  membershipId?: string;
}

export interface CashRegisterTerminal {
  id: string;
  code: string;
  name: string;
  companyId: string;
  branchId?: string | null;
}

export interface LicenseStatus {
  valid: boolean;
  reason?: string;
  companyName?: string;
  companyNif?: string;
  modules?: string[];
  expiresAt?: string;
  message?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  companyId: string;
  createdAt: string;
  details?: Record<string, any>;
}

export interface EmployeeSummary {
  id: string;
  fullName: string;
  position: string;
  department?: string | null;
  contractType: string;
  active: boolean;
}

export interface BiKpiSummary {
  salesTotalCents: number;
  grossMarginPercent: number;
  ordersCount: number;
  averageTicketCents: number;
  calculatedAt: string;
}

export interface HeadquartersCockpit {
  companyId: string;
  storesCount: number;
  stores: Array<{
    id: string;
    code: string;
    name: string;
    isHeadquarters: boolean;
    active: boolean;
  }>;
}

export interface AiChatResult {
  answer: string;
  suggestedAction?: string;
  timestamp: string;
}

export interface ProtectedApiConfig {
  serverUrl: string;
  companyId: string;
  branchId?: string | null;
  terminalId: string;
  offlineOutboxPendingCount: number;
  hasActiveSession: boolean;
  // Tokens e senhas NUNCA são expostos
}

export class AdminEnterpriseManager {
  private static instance: AdminEnterpriseManager;

  private constructor() {}

  public static getInstance(): AdminEnterpriseManager {
    if (!AdminEnterpriseManager.instance) {
      AdminEnterpriseManager.instance = new AdminEnterpriseManager();
    }
    return AdminEnterpriseManager.instance;
  }

  /**
   * Constrói resumo protegido de configuração da API sem expor tokens ou segredos
   */
  public getProtectedApiConfig(
    serverUrl: string,
    companyId: string,
    branchId: string | null | undefined,
    terminalId: string,
    token: string | null,
    pendingOutboxCount: number
  ): ProtectedApiConfig {
    return {
      serverUrl,
      companyId,
      branchId: branchId || null,
      terminalId,
      offlineOutboxPendingCount: pendingOutboxCount,
      hasActiveSession: Boolean(token && token.length > 10),
    };
  }

  /**
   * Consulta utilizadores autorizados da empresa (GET /api/v1/auth/users)
   */
  public async getUsers(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId: string | null | undefined,
    userRole: string
  ): Promise<ManagedUser[]> {
    if (!["ADMIN", "ROLE_ADMIN"].includes(userRole.toUpperCase())) {
      throw new Error("admin_permission_required: Apenas administradores podem gerir utilizadores.");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    const res = await fetch(`${serverUrl}/api/v1/auth/users`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "users_failed" }));
      throw new Error(err.message || err.error || "Falha ao consultar utilizadores.");
    }

    return await res.json();
  }

  /**
   * Consulta caixas registadoras e terminais ativos (GET /api/v1/platform/cash-registers)
   */
  public async getTerminals(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<CashRegisterTerminal[]> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    const res = await fetch(`${serverUrl}/api/v1/platform/cash-registers`, { headers });
    if (!res.ok) {
      throw new Error("terminals_fetch_failed");
    }

    return await res.json();
  }

  /**
   * Consulta estado criptográfico da licença da empresa (GET /api/v1/license/status)
   */
  public async getLicenseStatus(
    serverUrl: string,
    token: string,
    companyId: string
  ): Promise<LicenseStatus> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };

    try {
      const res = await fetch(`${serverUrl}/api/v1/license/status`, { headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("[AdminEnterprise] Erro ao consultar estado da licença:", err);
    }

    return {
      valid: false,
      reason: "license_check_offline",
      message: "Não foi possível validar o estado da licença no servidor.",
    };
  }

  /**
   * Consulta o log empresarial de auditoria com isolamento de tenant (GET /api/v1/platform/audit-logs)
   */
  public async getAuditLogs(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId: string | null | undefined,
    userRole: string,
    limit: number = 50
  ): Promise<AuditLogEntry[]> {
    if (!["ADMIN", "ROLE_ADMIN"].includes(userRole.toUpperCase())) {
      throw new Error("audit_permission_denied: Apenas administradores podem aceder aos logs de auditoria.");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    const res = await fetch(`${serverUrl}/api/v1/platform/audit-logs?limit=${limit}`, { headers });
    if (!res.ok) {
      throw new Error("audit_logs_fetch_failed");
    }

    const json = await res.json();
    const rows = Array.isArray(json) ? json : json.data || json.logs || [];
    return rows.map((r: any) => ({
      id: r.id || `audit-${Math.random()}`,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      userId: r.userId || r.actorId,
      companyId: r.companyId,
      createdAt: r.createdAt || r.timestamp,
      details: r.details || r.metadata,
    }));
  }

  /**
   * Consulta funcionários RH (GET /api/v1/hr/employees)
   */
  public async getEmployees(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<EmployeeSummary[]> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    const res = await fetch(`${serverUrl}/api/v1/hr/employees`, { headers });
    if (!res.ok) {
      throw new Error("hr_employees_failed");
    }

    return await res.json();
  }

  /**
   * Consulta KPIs de Business Intelligence (GET /api/v1/bi/kpis)
   */
  public async getBiKpis(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<BiKpiSummary> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    const res = await fetch(`${serverUrl}/api/v1/bi/kpis`, { headers });
    if (!res.ok) {
      throw new Error("bi_kpis_failed");
    }

    const json = await res.json();
    return {
      salesTotalCents: json.salesTotalCents || 0,
      grossMarginPercent: json.grossMarginPercent || 0,
      ordersCount: json.ordersCount || 0,
      averageTicketCents: json.averageTicketCents || 0,
      calculatedAt: json.calculatedAt || new Date().toISOString(),
    };
  }

  /**
   * Consulta Cockpit de Headquarters (GET /api/v1/corporate/cockpit)
   * GUARDA MULTI-TENANT: Rejeita a consolidação com lojas que não pertençam à empresa autorizada.
   */
  public async getHeadquartersCockpit(
    serverUrl: string,
    token: string,
    targetCompanyId: string,
    userCompanyId: string
  ): Promise<HeadquartersCockpit> {
    if (targetCompanyId !== userCompanyId) {
      throw new Error("headquarters_cross_tenant_forbidden: Não é permitido consolidar dados de empresas sem relação autorizada.");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": targetCompanyId,
      Accept: "application/json",
    };

    const res = await fetch(`${serverUrl}/api/v1/corporate/cockpit`, { headers });
    if (!res.ok) {
      throw new Error("corporate_cockpit_failed");
    }

    const json = await res.json();
    return {
      companyId: targetCompanyId,
      storesCount: (json.stores || []).length,
      stores: json.stores || [],
    };
  }

  /**
   * Consulta IA Copilot (POST /api/v1/ai/chat)
   * Exige conectividade online e sessão ativa.
   */
  public async queryAiCopilot(
    serverUrl: string,
    token: string | null,
    companyId: string,
    query: string,
    isOnline: boolean
  ): Promise<AiChatResult> {
    if (!isOnline) {
      throw new Error("ai_offline_unavailable: O assistente de inteligência artificial requer conectividade de rede ativa.");
    }

    if (!token) {
      throw new Error("ai_unauthorized: É necessária uma sessão autenticada para utilizar o VendaJá Copilot.");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-company-id": companyId,
      Accept: "application/json",
    };

    const res = await fetch(`${serverUrl}/api/v1/ai/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "ai_query_failed" }));
      throw new Error(err.message || err.error || "Falha ao comunicar com o VendaJá Copilot.");
    }

    const json = await res.json();
    return {
      answer: json.textAnswer || json.answer || "Sem resposta do assistente.",
      suggestedAction: json.suggestedAction,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Consulta estado de integrações de terceiros.
   * Integrações sem credenciais ativas são marcadas como indisponíveis de forma inequívoca.
   */
  public getIntegrationsStatus(): Array<{ name: string; configured: boolean; message: string }> {
    return [
      {
        name: "Gateway Multicaixa Express (EMIS)",
        configured: false,
        message: "Integração não configurada neste terminal. Contacte o suporte técnico.",
      },
      {
        name: "Submissão Automática AGT (Webservice)",
        configured: false,
        message: "Preparado tecnicamente para homologação; submissão webservice indisponível até publicação de endpoint oficial pela AGT.",
      },
      {
        name: "Sincronização Bancária Open Banking",
        configured: false,
        message: "Canal bancário não ativo. Utilize importação manual de extrato OFX no módulo financeiro.",
      },
    ];
  }
}
