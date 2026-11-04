/**
 * VendaJá Angola - Mobile ERP / Android Client
 * Document Manager: Inquiry, Filtering, Viewing, Authorized Reprinting & Immutability Guard
 *
 * REGRA FISCAL ABSOLUTA:
 * - O Android offline NÃO é emissor fiscal homologado.
 * - Todos os documentos emitidos são imutáveis (número, série, hash, data e valores não podem ser editados).
 * - Reimpressões exigem justificação operacional válida, auditoria e disclaimer regulatório de 2.ª via.
 * - "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT."
 */

export type DocumentType =
  | "INVOICE" // FT
  | "INVOICE_RECEIPT" // FR
  | "PROFORMA" // PF
  | "CREDIT_NOTE" // NC
  | "DEBIT_NOTE" // ND
  | "DELIVERY_NOTE" // GT
  | "RECEIVABLE_PAYMENT" // RC
  | "CUSTOMER_ORDER"
  | "QUOTE";

export type DocumentCopyType =
  | "ORIGINAL"
  | "SEGUNDA_VIA"
  | "DUPLICADO"
  | "PROVISORIO"
  | "NAO_FISCAL";

export interface DocumentLine {
  id?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitPriceCents: number;
  taxRate?: number;
  totalCents: number;
}

export interface UnifiedDocument {
  id: string;
  companyId: string;
  branchId?: string | null;
  type: DocumentType;
  fiscalTypeBadge: "FT" | "FR" | "PF" | "NC" | "ND" | "GT" | "RC" | "OUTRO";
  number: string;
  series: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  createdAt: string;
  status: "DRAFT" | "EMITTED" | "CONFIRMED" | "CANCELLED" | "PROVISIONAL";
  copyType: DocumentCopyType;
  customerId?: string | null;
  customerName?: string | null;
  customerNif?: string | null;
  fiscalHash?: string | null;
  qrCode?: string | null;
  sourceDocumentId?: string | null;
  sourceDocumentNumber?: string | null;
  lines: DocumentLine[];
  reprintCount?: number;
  reprintedAt?: string | null;
  disclaimer?: string;
}

export interface ReprintRequest {
  documentId: string;
  documentType: "SALE" | "COMMERCIAL_DOCUMENT";
  reason: string;
}

export interface ReprintResult {
  success: boolean;
  reprintCount: number;
  disclaimer: string;
  reprintedAt: string;
  logId?: string;
}

export class DocumentManager {
  private static instance: DocumentManager;
  private cachedDocuments: UnifiedDocument[] = [];

  private constructor() {}

  public static getInstance(): DocumentManager {
    if (!DocumentManager.instance) {
      DocumentManager.instance = new DocumentManager();
    }
    return DocumentManager.instance;
  }

  private getStorageKey(companyId: string, branchId?: string | null): string {
    return `vendaja_mobile_docs_${companyId}_${branchId || "main"}`;
  }

  /**
   * Converte tipo de documento para sigla fiscal convencional
   */
  public getFiscalTypeBadge(type: DocumentType): "FT" | "FR" | "PF" | "NC" | "ND" | "GT" | "RC" | "OUTRO" {
    switch (type) {
      case "INVOICE":
        return "FT";
      case "INVOICE_RECEIPT":
        return "FR";
      case "PROFORMA":
        return "PF";
      case "CREDIT_NOTE":
        return "NC";
      case "DEBIT_NOTE":
        return "ND";
      case "DELIVERY_NOTE":
        return "GT";
      case "RECEIVABLE_PAYMENT":
        return "RC";
      default:
        return "OUTRO";
    }
  }

  /**
   * Sincroniza e consolida documentos remotos autorizados (Sales + Commercial Documents)
   */
  public async syncDocuments(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId?: string | null
  ): Promise<UnifiedDocument[]> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    const unified: UnifiedDocument[] = [];

    // 1. Vendas / Faturas / Faturas-Recibo / Proformas (GET /api/v1/sales)
    try {
      const salesRes = await fetch(`${serverUrl}/api/v1/sales`, { headers });
      if (salesRes.ok) {
        const sales = await salesRes.json();
        for (const s of sales) {
          // Validação estrita de multi-tenancy
          if (s.companyId !== companyId) continue;
          if (branchId && s.branchId && s.branchId !== branchId) continue;

          unified.push({
            id: s.id,
            companyId: s.companyId,
            branchId: s.branchId,
            type: s.fiscalType || "INVOICE_RECEIPT",
            fiscalTypeBadge: this.getFiscalTypeBadge(s.fiscalType || "INVOICE_RECEIPT"),
            number: s.number || "PENDENTE",
            series: s.series || "A",
            subtotalCents: s.subtotalCents || 0,
            taxCents: s.taxCents || 0,
            totalCents: s.totalCents || 0,
            createdAt: s.createdAt,
            status: s.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
            copyType: "ORIGINAL",
            customerId: s.customerId,
            customerName: s.customer?.name || null,
            customerNif: s.customer?.nif || null,
            fiscalHash: s.fiscalHash,
            qrCode: s.qrCode,
            lines: (s.lines || []).map((l: any) => ({
              id: l.id,
              productId: l.productId,
              productName: l.product?.name || `Artigo #${l.productId.slice(0, 8)}`,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents || 0,
              taxRate: l.taxRate || 0,
              totalCents: (l.quantity * (l.unitPriceCents || 0)),
            })),
          });
        }
      }
    } catch (err) {
      console.warn("[DocumentManager] Falha ao carregar vendas:", err);
    }

    // 2. Documentos Comerciais (Guias de Transporte, Notas de Crédito, Encomendas) (GET /api/v1/commercial-documents)
    try {
      const commRes = await fetch(`${serverUrl}/api/v1/commercial-documents`, { headers });
      if (commRes.ok) {
        const commDocs = await commRes.json();
        for (const c of commDocs) {
          if (c.companyId !== companyId) continue;
          if (branchId && c.branchId && c.branchId !== branchId) continue;

          unified.push({
            id: c.id,
            companyId: c.companyId,
            branchId: c.branchId,
            type: c.type,
            fiscalTypeBadge: this.getFiscalTypeBadge(c.type),
            number: c.number,
            series: c.series,
            subtotalCents: c.subtotalCents,
            taxCents: c.taxCents,
            totalCents: c.totalCents,
            createdAt: c.createdAt,
            status: "CONFIRMED",
            copyType: "ORIGINAL",
            customerId: c.customerId,
            customerName: c.customer?.name || null,
            customerNif: c.customer?.nif || null,
            sourceDocumentId: c.sourceId,
            lines: (c.lines || []).map((l: any) => ({
              id: l.id,
              productId: l.productId,
              productName: l.product?.name || `Artigo #${l.productId.slice(0, 8)}`,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              taxRate: l.taxRate,
              totalCents: l.totalCents,
            })),
          });
        }
      }
    } catch (err) {
      console.warn("[DocumentManager] Falha ao carregar documentos comerciais:", err);
    }

    // Ordenar decrescente por data de criação
    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    this.cachedDocuments = unified;
    localStorage.setItem(this.getStorageKey(companyId, branchId), JSON.stringify(unified));
    return unified;
  }

  /**
   * Carrega documentos da cache local isolada por tenant
   */
  public loadCachedDocuments(companyId: string, branchId?: string | null): UnifiedDocument[] {
    const raw = localStorage.getItem(this.getStorageKey(companyId, branchId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.cachedDocuments = parsed;
          return parsed;
        }
      } catch {
        // fallback
      }
    }
    return [];
  }

  /**
   * Filtra documentos locais por texto de pesquisa e tipo
   */
  public filterDocuments(
    documents: UnifiedDocument[],
    searchTerm: string,
    filterType?: string
  ): UnifiedDocument[] {
    const term = searchTerm.toLowerCase().trim();
    return documents.filter((doc) => {
      if (filterType && filterType !== "ALL") {
        if (doc.type !== filterType && doc.fiscalTypeBadge !== filterType) {
          return false;
        }
      }
      if (!term) return true;
      return (
        doc.number.toLowerCase().includes(term) ||
        doc.series.toLowerCase().includes(term) ||
        (doc.customerName && doc.customerName.toLowerCase().includes(term)) ||
        (doc.customerNif && doc.customerNif.toLowerCase().includes(term)) ||
        (doc.fiscalHash && doc.fiscalHash.toLowerCase().includes(term))
      );
    });
  }

  /**
   * Solicita reimpressão autorizada com justificação obrigatória (POST /api/v1/platform/reprints)
   */
  public async requestReprint(
    serverUrl: string,
    token: string,
    companyId: string,
    branchId: string | null | undefined,
    request: ReprintRequest,
    userRole: string
  ): Promise<ReprintResult> {
    if (!["ADMIN", "ROLE_ADMIN", "MANAGER", "ROLE_MANAGER"].includes(userRole.toUpperCase())) {
      throw new Error("reprint_permission_denied: Apenas administradores e gestores podem autorizar reimpressões fiscais.");
    }

    const reason = request.reason ? request.reason.trim() : "";
    if (!reason || reason.length < 3) {
      throw new Error("reprint_reason_required: A reimpressão exige justificação operacional válida.");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-company-id": companyId,
      Accept: "application/json",
    };
    if (branchId) headers["x-branch-id"] = branchId;

    const res = await fetch(`${serverUrl}/api/v1/platform/reprints`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        documentType: request.documentType,
        documentId: request.documentId,
        reason,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "reprint_failed" }));
      throw new Error(err.message || err.error || "Falha ao registar reimpressão.");
    }

    const data = await res.json();
    return {
      success: true,
      reprintCount: 1,
      disclaimer: "2.ª via emitida em conformidade com o original",
      reprintedAt: data.createdAt || new Date().toISOString(),
      logId: data.id,
    };
  }

  /**
   * GUARDA DE IMUTABILIDADE FISCAL:
   * Rejeita qualquer tentativa de editar dados estruturais de documento fiscal emitido.
   */
  public assertDocumentImmutability(
    originalDoc: UnifiedDocument,
    modifications: Partial<UnifiedDocument>
  ): void {
    const forbiddenFields = [
      "number",
      "series",
      "fiscalHash",
      "createdAt",
      "totalCents",
      "subtotalCents",
      "taxCents",
      "lines",
    ];

    for (const field of forbiddenFields) {
      if (field in modifications) {
        throw new Error(
          `fiscal_immutability_violation: O campo '${field}' de um documento já emitido é estritamente imutável sob a legislação comercial e fiscal angolana.`
        );
      }
    }
  }
}
