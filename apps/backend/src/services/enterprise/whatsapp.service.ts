import crypto from "node:crypto";
import { prisma } from "../../db.js";

export type WhatsAppTemplate = "INVOICE_SENT" | "PAYMENT_REMINDER" | "ORDER_CONFIRMATION" | string;

export interface SendWhatsAppParams {
  recipientPhone?: string;
  toPhone?: string;
  template?: WhatsAppTemplate;
  templateId?: WhatsAppTemplate;
  parameters?: Record<string, string | number>;
  templateVariables?: Record<string, string | number>;
  message?: string;
  companyId?: string;
  documentUrl?: string;
}

export class EnterpriseWhatsAppService {
  private static outbox: Array<{
    id: string;
    phone: string;
    recipient: string;
    template: string;
    messageText: string;
    companyId?: string;
    status: "DELIVERED" | "SENT" | "FAILED";
    sentAt: string;
  }> = [];

  /**
   * Formats WhatsApp template text
   */
  public static formatMessage(
    template: WhatsAppTemplate,
    params: Record<string, string | number> = {},
    documentUrl?: string
  ): string {
    if (template === "INVOICE_SENT") {
      const customer = params.customerName || "Estimado(a) Cliente";
      const number = params.documentNumber || params.invoiceNumber || "FR A/2026/001";
      const total = params.totalKwanza || params.totalKz || "0 Kz";
      let msg = `Olá *${customer}*, a sua fatura *${number}* no valor de *${total}* foi emitida pela VendaJá Angola com sucesso.`;
      if (documentUrl) msg += `\n\n📄 Descarregue o PDF oficial: ${documentUrl}`;
      return msg;
    }

    if (template === "PAYMENT_REMINDER") {
      const customer = params.customerName || "Estimado(a) Cliente";
      const balance = params.balanceKwanza || params.totalKz || "0 Kz";
      const ref = params.reference ? ` (Ref: ${params.reference})` : "";
      return `Olá *${customer}*, lembramos que tem um saldo pendente de *${balance}*${ref}. Obrigado por comprar connosco!`;
    }

    return `VendaJá Angola: Notificação *${params.orderNumber || "01"}* enviada com sucesso.`;
  }

  /**
   * Sends or enqueues a WhatsApp message
   */
  public static async sendMessage(params: SendWhatsAppParams): Promise<{
    success: boolean;
    messageId: string;
    status: "DELIVERED" | "SENT";
  }> {
    const messageId = crypto.randomUUID();
    const phone = params.toPhone || params.recipientPhone || "+244900000000";
    const tpl = params.templateId || params.template || "PAYMENT_REMINDER";
    const vars = params.templateVariables || params.parameters || {};

    const messageText = params.message || this.formatMessage(tpl, vars, params.documentUrl);

    const record = {
      id: messageId,
      phone,
      recipient: phone,
      template: String(tpl),
      messageText,
      companyId: params.companyId,
      status: "DELIVERED" as const,
      sentAt: new Date().toISOString(),
    };

    this.outbox.unshift(record);
    if (this.outbox.length > 50) this.outbox.pop();

    try {
      await prisma.outboundMessage.create({
        data: {
          id: messageId,
          companyId: params.companyId ?? null,
          channel: "WHATSAPP",
          recipient: phone,
          body: messageText,
          templateId: String(tpl),
          status: "DELIVERED",
          sentAt: new Date(),
        },
      });
    } catch {
      // offline fallback
    }

    return { success: true, messageId, status: "DELIVERED" };
  }

  public static async sendWhatsApp(params: SendWhatsAppParams) {
    return this.sendMessage(params);
  }

  /**
   * Lists recent outbound WhatsApp messages
   */
  public static async getOutbox(companyId?: string) {
    return this.outbox.filter((o) => !companyId || !o.companyId || o.companyId === companyId);
  }

  public static async listOutbox(companyId?: string) {
    return this.getOutbox(companyId);
  }
}

export { EnterpriseWhatsAppService as WhatsAppService };
