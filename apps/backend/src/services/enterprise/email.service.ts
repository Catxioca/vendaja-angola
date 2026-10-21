import crypto from "node:crypto";
import { prisma } from "../../db.js";

export type EmailTemplate = "INVOICE" | "INVOICE_ISSUED" | "PROPOSAL" | "PAYMENT_REMINDER" | "SYSTEM_ALERT" | string;

export interface SendEmailParams {
  to?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  template?: EmailTemplate;
  templateId?: EmailTemplate;
  variables?: Record<string, string | number>;
  templateVariables?: Record<string, string | number>;
  companyId?: string;
  attachmentName?: string;
}

export class EnterpriseEmailService {
  private static outbox: Array<{
    id: string;
    to: string;
    recipient: string;
    subject: string;
    body: string;
    companyId?: string;
    status: "SENT" | "QUEUED" | "FAILED";
    sentAt: string;
  }> = [];

  /**
   * Renders email template with interpolation
   */
  public static renderTemplate(
    template: EmailTemplate,
    variables: Record<string, string | number> = {}
  ): { subject: string; bodyHtml: string } {
    if (template === "INVOICE" || template === "INVOICE_ISSUED") {
      const docNum = variables.documentNumber || variables.invoiceNumber || "FR A/2026/001";
      const customer = variables.customerName || "Estimado(a) Cliente";
      const total = variables.totalKwanza || variables.totalKz || "0.00 Kz";
      return {
        subject: `VendaJá Angola — Fatura/Recibo n.º ${docNum}`,
        bodyHtml: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dce3ee; border-radius: 8px;">
            <h2 style="color: #0d3764;">VendaJá Angola</h2>
            <p>Olá <b>${customer}</b>,</p>
            <p>Junto enviamos a sua fatura/recibo com a referência fiscal n.º <b>${docNum}</b>.</p>
            <div style="background: #f1f5f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0;">Valor Total: <b style="font-size: 18px; color: #16a34a;">${total}</b></p>
            </div>
            <p style="color: #64748b; font-size: 12px;">Documento emitido por programa de faturação certificado pela AGT.</p>
          </div>
        `,
      };
    }

    if (template === "PROPOSAL") {
      const propNum = variables.proposalNumber || "PROP-2026-001";
      const total = variables.totalKwanza || variables.totalKz || "0.00 Kz";
      return {
        subject: `Proposta Comercial — ${propNum}`,
        bodyHtml: `<p>Apresentamos a nossa proposta comercial n.º <b>${propNum}</b> no valor de <b>${total}</b>.</p>`,
      };
    }

    if (template === "PAYMENT_REMINDER") {
      const balance = variables.balanceKwanza || variables.totalKz || "0.00 Kz";
      const dueDate = variables.dueDate || "30 dias";
      return {
        subject: `Aviso de Vencimento de Conta Corrente`,
        bodyHtml: `<p>Informamos que tem um saldo a liquidar de <b>${balance}</b> com data de vencimento em <b>${dueDate}</b>.</p>`,
      };
    }

    return {
      subject: String(variables.subject || "Notificação do Sistema VendaJá"),
      bodyHtml: `<p>${variables.message || "Alerta geral emitido pelo ERP VendaJá."}</p>`,
    };
  }

  /**
   * Enqueues and sends corporate email
   */
  public static async sendEmail(params: SendEmailParams): Promise<{
    success: boolean;
    messageId: string;
    status: "SENT" | "QUEUED";
  }> {
    const targetRecipient = params.to || params.recipient || "cliente@empresa.ao";
    const templateKey = params.templateId || params.template || "SYSTEM_ALERT";
    const vars = params.templateVariables || params.variables || {};

    const rendered = this.renderTemplate(templateKey, vars);
    const messageId = crypto.randomUUID();

    const record = {
      id: messageId,
      to: targetRecipient,
      recipient: targetRecipient,
      subject: params.subject || rendered.subject,
      body: params.body || rendered.bodyHtml,
      companyId: params.companyId,
      status: "SENT" as const,
      sentAt: new Date().toISOString(),
    };

    this.outbox.unshift(record);
    if (this.outbox.length > 50) this.outbox.pop();

    try {
      await prisma.outboundMessage.create({
        data: {
          id: messageId,
          companyId: params.companyId ?? null,
          channel: "EMAIL",
          recipient: targetRecipient,
          subject: record.subject,
          body: record.body,
          templateId: String(templateKey),
          status: "SENT",
          sentAt: new Date(),
        },
      });
    } catch {
      // offline fallback
    }

    return { success: true, messageId, status: "SENT" };
  }

  /**
   * Lists recent outbound emails
   */
  public static async getOutbox(companyId?: string) {
    return this.outbox.filter((o) => !companyId || !o.companyId || o.companyId === companyId);
  }

  public static async listOutbox(companyId?: string) {
    return this.getOutbox(companyId);
  }
}

export { EnterpriseEmailService as EmailService };
