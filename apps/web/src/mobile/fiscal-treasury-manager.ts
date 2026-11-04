/**
 * VendaJá Angola - Mobile ERP / Android Client
 * Fiscal & Treasury Manager
 *
 * ESCOPO FISCAL & CONTABILÍSTICO:
 * - Consulta de configuração fiscal, séries ativas e estado do arquivo legal.
 * - Exportação de SAF-T (AO) estritamente online com isolamento de tenant.
 * - Consulta de contas de tesouraria, fluxo de caixa e períodos contabilísticos.
 * - Bloqueio de operações em períodos fechados.
 * - Rejeição total de lançamentos contabilísticos locais offline.
 * - REGULATÓRIO: "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT."
 */

export interface FiscalConfigSummary {
  configured: boolean;
  companyName: string;
  companyNif: string;
  invoiceSeries: string;
  baseCurrency: string;
  timezone: string;
  roundingMode: string;
  fiscalArchiveRetentionYears: number | null;
  saftSchedule: string;
  updatedAt: string | null;
}

export interface TreasuryAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
  balanceCents: number;
}

export interface CashflowSummary {
  salesCount: number;
  totalSalesCents: number;
  expensesCents: number;
  netCents: number;
  calculatedAt?: string;
}

export interface AccountingPeriod {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: "OPEN" | "CLOSED";
  closedAt?: string | null;
}

export interface TaxSummary {
  from: string;
  to: string;
  outputCents: number;
  inputCents: number;
  payableCents: number;
}

export interface SaftValidationResult {
  mode: string;
  caveat: string;
  readyForExport: boolean;
}

export class FiscalTreasuryManager {
  private static instance: FiscalTreasuryManager;

  private constructor() {}

  public static getInstance(): FiscalTreasuryManager {
    if (!FiscalTreasuryManager.instance) {
      FiscalTreasuryManager.instance = new FiscalTreasuryManager();
    }
    return FiscalTreasuryManager.instance;
  }

  public getRegulatoryDisclaimer(): string {
    return "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.";
  }

  /**
   * Consulta a configuração fiscal ativa da empresa (GET /api/v1/fiscal/config)
   */
  public async getFiscalConfig(
    serverUrl: string,
    token: string,
    companyId: string,
    userRole: string
  ): Promise<FiscalConfigSummary> {
    if (!["ADMIN", "ROLE_ADMIN"].includes(userRole.toUpperCase())) {
      throw new Error("fiscal_admin_required: Apenas administradores podem aceder à configuração fiscal.");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };

    const res = await fetch(`${serverUrl}/api/v1/fiscal/config`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "fiscal_config_failed" }));
      throw new Error(err.message || err.error || "Falha ao consultar configuração fiscal.");
    }

    return await res.json();
  }

  /**
   * Consulta o estado da validação SAF-T e dependência de XSD (GET /api/v1/fiscal/saft/validation)
   */
  public async getSaftValidationStatus(serverUrl: string): Promise<SaftValidationResult> {
    try {
      const res = await fetch(`${serverUrl}/api/v1/fiscal/saft/validation`);
      if (res.ok) {
        const data = await res.json();
        return {
          mode: data.mode || "structural",
          caveat: data.caveat || this.getRegulatoryDisclaimer(),
          readyForExport: true,
        };
      }
    } catch (err) {
      console.warn("[FiscalTreasury] Erro ao consultar estado do SAF-T:", err);
    }

    return {
      mode: "structural",
      caveat: "Validação estrutural local. Necessário XSD oficial AGT homologado para submissão legal.",
      readyForExport: true,
    };
  }

  /**
   * Exporta o ficheiro SAF-T (AO) (GET /api/v1/fiscal/saft)
   * Apenas online, com permissão ADMIN ou FISCAL
   */
  public async exportSaftXml(
    serverUrl: string,
    token: string,
    companyId: string,
    fromDate: string,
    toDate: string,
    userRole: string,
    isOnline: boolean
  ): Promise<string> {
    if (!isOnline) {
      throw new Error("saft_offline_blocked: A exportação de SAF-T fiscal é estritamente online.");
    }

    if (!["ADMIN", "ROLE_ADMIN", "ACCOUNTANT", "ROLE_ACCOUNTANT"].includes(userRole.toUpperCase())) {
      throw new Error("saft_permission_denied: Apenas administradores e contabilistas autorizados podem exportar o SAF-T.");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/xml",
    };

    const url = `${serverUrl}/api/v1/fiscal/saft?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "saft_export_failed" }));
      throw new Error(err.message || err.error || "Falha ao gerar o ficheiro SAF-T.");
    }

    return await res.text();
  }

  /**
   * Consulta contas de tesouraria (GET /api/v1/financial/treasury/accounts)
   */
  public async getTreasuryAccounts(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<TreasuryAccount[]> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    try {
      const res = await fetch(`${serverUrl}/api/v1/platform/bank-accounts`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          return json.map((b: any) => ({
            id: b.id,
            name: b.name,
            type: "BANK",
            currency: "AOA",
            balanceCents: b.openingBalanceCents || 0,
          }));
        }
      }
      const resFin = await fetch(`${serverUrl}/api/v1/financial/treasury/accounts`, { headers });
      if (resFin.ok) {
        const json = await resFin.json();
        return json.data || [];
      }
    } catch (err) {
      console.warn("[FiscalTreasury] Erro ao carregar contas de tesouraria:", err);
    }
    return [];
  }

  /**
   * Consulta resumo de fluxo de caixa (GET /api/v1/cashflow/summary)
   */
  public async getCashflowSummary(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<CashflowSummary> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    try {
      const res = await fetch(`${serverUrl}/api/v1/cashflow/summary`, { headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("[FiscalTreasury] Erro ao carregar resumo de fluxo de caixa:", err);
    }

    return {
      salesCount: 0,
      totalSalesCents: 0,
      expensesCents: 0,
      netCents: 0,
    };
  }

  /**
   * Consulta períodos contabilísticos (GET /api/v1/accounting/periods)
   */
  public async getAccountingPeriods(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<AccountingPeriod[]> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    try {
      const res = await fetch(`${serverUrl}/api/v1/accounting/periods`, { headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("[FiscalTreasury] Erro ao carregar períodos contabilísticos:", err);
    }
    return [];
  }

  /**
   * Consulta mapa resumo fiscal (IVA liquidado vs dedutível) (GET /api/v1/accounting/tax-summary)
   */
  public async getTaxSummary(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null,
    fromDate?: string,
    toDate?: string
  ): Promise<TaxSummary> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    const from = fromDate || new Date(new Date().getFullYear(), 0, 1).toISOString();
    const to = toDate || new Date().toISOString();

    const url = `${serverUrl}/api/v1/accounting/tax-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error("tax_summary_failed");
    }

    return await res.json();
  }

  /**
   * GUARDA DE PERÍODO CONTABILÍSTICO FECHADO:
   * Impede a realização de qualquer operação ou documento associado a um período fechado.
   */
  public assertPeriodNotClosed(periods: AccountingPeriod[], targetDate: Date): void {
    const targetTime = targetDate.getTime();
    for (const p of periods) {
      const start = new Date(p.startsAt).getTime();
      const end = new Date(p.endsAt).getTime();
      if (targetTime >= start && targetTime <= end && p.status === "CLOSED") {
        throw new Error(`accounting_period_closed: O período contabilístico '${p.name}' está fechado. Operação bloqueada.`);
      }
    }
  }

  /**
   * GUARDA DE CONTABILIDADE OFFLINE:
   * A aplicação móvel nunca realiza lançamentos em diários contabilísticos locais offline.
   */
  public assertNoOfflineAccountingEntry(isOnline: boolean): void {
    if (!isOnline) {
      throw new Error("offline_accounting_forbidden: Lançamentos contabilísticos manuais ou diários locais são proibidos offline.");
    }
  }
}
