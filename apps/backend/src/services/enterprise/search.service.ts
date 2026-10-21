import { prisma } from "../../db.js";
import { EnterpriseCrmService } from "./crm.service.js";
import { EnterpriseDocumentService } from "./document.service.js";

export type SearchResultType =
  | "CUSTOMER"
  | "PRODUCT"
  | "SALE"
  | "PURCHASE"
  | "SUPPLIER"
  | "EMPLOYEE"
  | "PROPOSAL"
  | "OPPORTUNITY"
  | "DOCUMENT";

export interface GlobalSearchResultItem {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  badge?: string;
  metadata?: Record<string, unknown>;
  actionUrl: string;
}

export class EnterpriseSearchService {
  /**
   * Executes a high-performance federated global search across all ERP and CRM entities
   */
  public static async search(query: string, companyId?: string): Promise<{
    query: string;
    totalResults: number;
    results: Record<SearchResultType, GlobalSearchResultItem[]>;
    flatResults: GlobalSearchResultItem[];
  }> {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        query,
        totalResults: 0,
        results: {
          CUSTOMER: [],
          PRODUCT: [],
          SALE: [],
          PURCHASE: [],
          SUPPLIER: [],
          EMPLOYEE: [],
          PROPOSAL: [],
          OPPORTUNITY: [],
          DOCUMENT: [],
        },
        flatResults: [],
      };
    }

    const flatResults: GlobalSearchResultItem[] = [];

    // 1. Search in CRM Opportunities & Proposals
    const opps = EnterpriseCrmService.listOpportunities({ companyId }).filter(
      (o) => o.title.toLowerCase().includes(q) || (o.customerName && o.customerName.toLowerCase().includes(q))
    );
    for (const opp of opps) {
      flatResults.push({
        id: opp.id,
        type: "OPPORTUNITY",
        title: opp.title,
        subtitle: `${opp.customerName || "Cliente"} · Etapa: ${opp.stage}`,
        badge: opp.status,
        actionUrl: `/crm/opportunities/${opp.id}`,
      });
    }

    const proposals = EnterpriseCrmService.listProposals({ companyId }).filter(
      (p) => p.number.toLowerCase().includes(q) || p.title.toLowerCase().includes(q) || (p.customerName && p.customerName.toLowerCase().includes(q))
    );
    for (const prop of proposals) {
      flatResults.push({
        id: prop.id,
        type: "PROPOSAL",
        title: `${prop.number} - ${prop.title}`,
        subtitle: `${prop.customerName || "Cliente"} · Total: ${prop.totalAmountCents} Cts`,
        badge: prop.status,
        actionUrl: `/crm/proposals/${prop.id}`,
      });
    }

    // 2. Search in Documents (GED)
    const docs = EnterpriseDocumentService.listDocuments({ companyId }).filter(
      (d) => d.title.toLowerCase().includes(q) || d.code.toLowerCase().includes(q) || (d.tags && d.tags.some((t) => t.toLowerCase().includes(q)))
    );
    for (const doc of docs) {
      flatResults.push({
        id: doc.id,
        type: "DOCUMENT",
        title: `${doc.code}: ${doc.title}`,
        subtitle: `Categoria: ${doc.category} · Versão ${doc.currentVersion}.0`,
        badge: doc.category,
        actionUrl: `/documents/${doc.id}`,
      });
    }

    // 3. Search Database Entities (Customers, Products, Sales, Employees)
    try {
      const [customers, products, sales, employees, suppliers] = await Promise.all([
        prisma.customer.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { nif: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 10,
        }),
        prisma.product.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 10,
        }),
        prisma.sale.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { customerNif: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
          include: { customer: true },
          take: 10,
        }),
        prisma.employee.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { position: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 10,
        }),
        prisma.supplier.findMany({
          where: {
            ...(companyId ? { companyId } : {}),
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { nif: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 10,
        }),
      ]);

      for (const c of customers) {
        flatResults.push({
          id: c.id,
          type: "CUSTOMER",
          title: c.name,
          subtitle: `NIF: ${c.nif || "N/A"} · Tel: ${c.phone || "N/A"}`,
          badge: c.active ? "Ativo" : "Inativo",
          actionUrl: `/customers/${c.id}`,
        });
      }

      for (const p of products) {
        flatResults.push({
          id: p.id,
          type: "PRODUCT",
          title: p.name,
          subtitle: `SKU: ${p.sku} · Preço: ${(p.priceCents / 100).toFixed(2)} Kz`,
          badge: `${p.stock} em stock`,
          actionUrl: `/catalog/${p.id}`,
        });
      }

      for (const s of sales) {
        flatResults.push({
          id: s.id,
          type: "SALE",
          title: `Fatura ${s.number}`,
          subtitle: `Cliente: ${s.customer?.name || s.customerNif || "Consumidor Final"} · Total: ${(s.totalCents / 100).toFixed(2)} Kz`,
          badge: s.fiscalType,
          actionUrl: `/sales/${s.id}`,
        });
      }

      for (const e of employees) {
        flatResults.push({
          id: e.id,
          type: "EMPLOYEE",
          title: e.fullName,
          subtitle: `Cargo: ${e.position} · Dept: ${e.department || "Geral"}`,
          badge: "RH",
          actionUrl: `/hr/employees/${e.id}`,
        });
      }

      for (const sup of suppliers) {
        flatResults.push({
          id: sup.id,
          type: "SUPPLIER",
          title: sup.name,
          subtitle: `NIF: ${sup.nif || "N/A"} · Contacto: ${sup.contactName || "—"}`,
          badge: "Fornecedor",
          actionUrl: `/suppliers/${sup.id}`,
        });
      }
    } catch {
      // In-memory fallback if db is offline
    }

    const grouped: Record<SearchResultType, GlobalSearchResultItem[]> = {
      CUSTOMER: flatResults.filter((r) => r.type === "CUSTOMER"),
      PRODUCT: flatResults.filter((r) => r.type === "PRODUCT"),
      SALE: flatResults.filter((r) => r.type === "SALE"),
      PURCHASE: flatResults.filter((r) => r.type === "PURCHASE"),
      SUPPLIER: flatResults.filter((r) => r.type === "SUPPLIER"),
      EMPLOYEE: flatResults.filter((r) => r.type === "EMPLOYEE"),
      PROPOSAL: flatResults.filter((r) => r.type === "PROPOSAL"),
      OPPORTUNITY: flatResults.filter((r) => r.type === "OPPORTUNITY"),
      DOCUMENT: flatResults.filter((r) => r.type === "DOCUMENT"),
    };

    return {
      query,
      totalResults: flatResults.length,
      results: grouped,
      flatResults,
    };
  }
}
