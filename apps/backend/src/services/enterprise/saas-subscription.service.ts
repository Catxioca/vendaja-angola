import crypto from "crypto";
import {
  SubscriptionPlanCode,
  EnterpriseTenantService,
  DEFAULT_PLAN_QUOTAS,
} from "./saas-tenant.service.js";
import { EnterpriseLogger } from "./logger.service.js";
import { EnterpriseAuditService } from "./audit.service.js";

export interface SaasSubscriptionPlan {
  code: SubscriptionPlanCode;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  currency: string;
  maxUsers: number;
  maxBranches: number;
  maxWarehouses: number;
  maxInvoicesMonth: number;
  storageQuotaMb: number;
  features: string[];
  recommended: boolean;
}

export interface SubscriptionInvoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  tenantName: string;
  plan: SubscriptionPlanCode;
  billingCycle: "MONTHLY" | "ANNUAL";
  amountCents: number;
  taxCents: number; // 14% IVA
  totalCents: number;
  status: "PAID" | "PENDING" | "OVERDUE" | "CANCELLED";
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  paymentMethod?: "MULTICAIXA_EXPRESS" | "BANK_TRANSFER" | "CREDIT_CARD";
  paymentReference?: string;
}

export const SAAS_PLANS: SaasSubscriptionPlan[] = [
  {
    code: "STARTER",
    name: "VendaJá Starter",
    monthlyPriceCents: 4500000, // 45.000 Kz
    annualPriceCents: 43200000, // 432.000 Kz (20% desconto: 36.000 Kz/mês)
    currency: "AOA",
    maxUsers: 3,
    maxBranches: 1,
    maxWarehouses: 1,
    maxInvoicesMonth: 500,
    storageQuotaMb: 5000,
    recommended: false,
    features: [
      "Ponto de Venda (POS) Rápido",
      "Faturação Certificada AGT",
      "Gestão Básica de Clientes",
      "Suporte a Impressoras Térmicas 58mm/80mm",
      "Backup Local Automático",
    ],
  },
  {
    code: "PROFESSIONAL",
    name: "VendaJá Professional",
    monthlyPriceCents: 9500000, // 95.000 Kz
    annualPriceCents: 91200000, // 912.000 Kz (20% desconto: 76.000 Kz/mês)
    currency: "AOA",
    maxUsers: 10,
    maxBranches: 3,
    maxWarehouses: 3,
    maxInvoicesMonth: 2500,
    storageQuotaMb: 25000,
    recommended: true,
    features: [
      "Todas as funcionalidades Starter",
      "Gestão de Compras e Fornecedores",
      "Controlo de Stocks e Lotes",
      "Tesouraria e Reconciliação Bancária",
      "CRM e Funil Comercial",
      "Gestão de RH e Processamento Salarial",
      "Sincronização Híbrida Online/Offline",
    ],
  },
  {
    code: "BUSINESS",
    name: "VendaJá Business",
    monthlyPriceCents: 22000000, // 220.000 Kz
    annualPriceCents: 211200000, // 2.112.000 Kz (20% desconto: 176.000 Kz/mês)
    currency: "AOA",
    maxUsers: 25,
    maxBranches: 10,
    maxWarehouses: 10,
    maxInvoicesMonth: 10000,
    storageQuotaMb: 100000,
    recommended: false,
    features: [
      "Todas as funcionalidades Professional",
      "Contabilidade Geral PGCA Completa",
      "Centros de Custo e Analítica",
      "Workflows e Aprovações Multinível",
      "API REST Pública v1 com Webhooks",
      "Executive Cockpits & Dashboards BI",
      "Logística e Transferência entre Lojas",
      "SLA de Disponibilidade 99.9%",
    ],
  },
  {
    code: "ENTERPRISE",
    name: "VendaJá Enterprise Cloud",
    monthlyPriceCents: 50000000, // 500.000 Kz
    annualPriceCents: 480000000, // 4.800.000 Kz (400.000 Kz/mês)
    currency: "AOA",
    maxUsers: 999999,
    maxBranches: 999999,
    maxWarehouses: 999999,
    maxInvoicesMonth: 999999,
    storageQuotaMb: 500000,
    recommended: false,
    features: [
      "Utilizadores, Filiais e Faturas Ilimitadas",
      "Consolidação Multi-Holding e Intercompany",
      "Conector Microsoft Power BI Nativo",
      "Armazenamento Cloud Dedicado (500 GB+)",
      "Disaster Recovery com RPO < 15min",
      "Gestor de Conta e Suporte 24/7 Telefónico",
      "Segurança com Chaves Privadas em HSM",
      "SLA Garantido de 99.95%",
    ],
  },
];

const inMemoryInvoices = new Map<string, SubscriptionInvoice>();

export class EnterpriseSubscriptionService {
  /**
   * List all available SaaS commercial plans with pricing and specifications.
   */
  static getPlans(): SaasSubscriptionPlan[] {
    return SAAS_PLANS;
  }

  /**
   * Get specific plan details by plan code.
   */
  static getPlan(code: SubscriptionPlanCode): SaasSubscriptionPlan {
    const found = SAAS_PLANS.find((p) => p.code === code);
    if (!found) throw new Error(`Plano '${code}' não encontrado.`);
    return found;
  }

  /**
   * Issue a recurring or upgrade subscription invoice for a tenant.
   */
  static async issueSubscriptionInvoice(data: {
    tenantId: string;
    plan: SubscriptionPlanCode;
    billingCycle: "MONTHLY" | "ANNUAL";
  }): Promise<SubscriptionInvoice> {
    const tenant = await EnterpriseTenantService.getTenant(data.tenantId);
    if (!tenant) throw new Error(`Tenant '${data.tenantId}' não existe.`);

    const planInfo = this.getPlan(data.plan);
    const baseAmountCents = data.billingCycle === "ANNUAL" ? planInfo.annualPriceCents : planInfo.monthlyPriceCents;
    const taxCents = Math.round(baseAmountCents * 0.14); // 14% IVA
    const totalCents = baseAmountCents + taxCents;

    const invoiceId = crypto.randomUUID();
    const invoiceNumber = `SUB-2026/${String(inMemoryInvoices.size + 1).padStart(5, "0")}`;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + (data.billingCycle === "ANNUAL" ? 12 : 1));

    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + 7); // 7-day payment window

    // Generate Angola Multicaixa Express reference simulation (Entity 99001 + 9-digit ref)
    const entity = "99001";
    const refNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
    const paymentReference = `Ent: ${entity} | Ref: ${refNumber}`;

    const invoice: SubscriptionInvoice = {
      id: invoiceId,
      invoiceNumber,
      tenantId: data.tenantId,
      tenantName: tenant.name,
      plan: data.plan,
      billingCycle: data.billingCycle,
      amountCents: baseAmountCents,
      taxCents,
      totalCents,
      status: "PENDING",
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
      issuedAt: now.toISOString(),
      dueAt: dueAt.toISOString(),
      paymentReference,
    };

    inMemoryInvoices.set(invoiceId, invoice);

    EnterpriseLogger.info(
      "SUBSCRIPTION",
      "INVOICE_ISSUED",
      `Fatura de subscrição emitida: ${invoiceNumber} para ${tenant.name} (${data.plan})`,
      { invoiceId, totalCents }
    );

    return invoice;
  }

  /**
   * Register payment confirmation for a subscription invoice and automatically renew/activate the tenant.
   */
  static async recordPayment(
    invoiceId: string,
    paymentMethod: "MULTICAIXA_EXPRESS" | "BANK_TRANSFER" | "CREDIT_CARD" = "MULTICAIXA_EXPRESS"
  ): Promise<SubscriptionInvoice> {
    const invoice = inMemoryInvoices.get(invoiceId);
    if (!invoice) throw new Error(`Fatura '${invoiceId}' não encontrada.`);

    invoice.status = "PAID";
    invoice.paidAt = new Date().toISOString();
    invoice.paymentMethod = paymentMethod;

    inMemoryInvoices.set(invoiceId, invoice);

    // Automatically update tenant plan and operational status
    await EnterpriseTenantService.updateTenantPlan(invoice.tenantId, invoice.plan, invoice.billingCycle);

    await EnterpriseAuditService.record({
      action: "SUBSCRIPTION_PAYMENT_CONFIRMED",
      entity: "SubscriptionInvoice",
      entityId: invoiceId,
      companyId: invoice.tenantId,
      details: {
        amountCents: invoice.totalCents,
        plan: invoice.plan,
        paymentMethod,
      },
    });

    EnterpriseLogger.info(
      "SUBSCRIPTION",
      "PAYMENT_CONFIRMED",
      `Pagamento de subscrição confirmado: ${invoice.invoiceNumber}`,
      { invoiceId, tenantId: invoice.tenantId }
    );

    return invoice;
  }

  /**
   * List subscription invoices, optionally filtered by tenant.
   */
  static listInvoices(tenantId?: string): SubscriptionInvoice[] {
    let list = Array.from(inMemoryInvoices.values());
    if (tenantId) {
      list = list.filter((i) => i.tenantId === tenantId);
    }
    return list.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }
}
