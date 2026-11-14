/**
 * Serviço de Notificação e Gestão de Contactos Institucionais
 * Mutshima — Soberania Tecnológica e Rigor de Governação
 */

export interface ContactMessage {
  name: string;
  organization: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  consent: boolean;
  receivedAt: Date;
  ipAddress?: string;
}

export interface ContactNotificationResult {
  delivered: boolean;
  status: "delivered" | "adapter_not_configured" | "delivery_failed";
  channel?: string;
  message: string;
}

export interface ContactNotifierAdapter {
  readonly name: string;
  isConfigured(): boolean;
  dispatch(data: ContactMessage): Promise<{ delivered: boolean; channel?: string; error?: string }>;
}

/**
 * Remove tags HTML, scripts e sequências maliciosas preservando texto legítimo
 */
export function sanitizeContactText(input: string): string {
  if (!input) return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<[^>]+>/g, "") // remove qualquer tag HTML restante
    .replace(/[<>'"&]/g, (char) => {
      switch (char) {
        case "<": return "&lt;";
        case ">": return "&gt;";
        case "'": return "&#39;";
        case '"': return "&quot;";
        case "&": return "&amp;";
        default: return char;
      }
    })
    .trim();
}

/**
 * Mascara o e-mail para exibição segura em logs sem violação de privacidade
 */
export function maskEmailForLogs(email: string): string {
  if (!email || !email.includes("@")) return "***";
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : `${user[0]}***`;
  return `${maskedUser}@${domain}`;
}

/**
 * Adaptador padrão baseado em variáveis de ambiente (Webhook CRM / SMTP)
 */
export class EnvironmentContactNotifierAdapter implements ContactNotifierAdapter {
  readonly name = "EnvironmentNotifier";

  isConfigured(): boolean {
    const webhook = process.env.CONTACT_CRM_WEBHOOK_URL;
    const smtp = process.env.CONTACT_SMTP_HOST;
    return Boolean((webhook && webhook.trim().length > 0) || (smtp && smtp.trim().length > 0));
  }

  async dispatch(data: ContactMessage): Promise<{ delivered: boolean; channel?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { delivered: false, error: "adapter_not_configured" };
    }

    const webhookUrl = process.env.CONTACT_CRM_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            organization: data.organization,
            email: data.email,
            phone: data.phone,
            subject: data.subject,
            message: data.message,
            timestamp: data.receivedAt.toISOString(),
          }),
        });

        if (response.ok) {
          return { delivered: true, channel: "CRM_WEBHOOK" };
        }
        return { delivered: false, channel: "CRM_WEBHOOK", error: `HTTP ${response.status}` };
      } catch (err) {
        return { delivered: false, channel: "CRM_WEBHOOK", error: String(err) };
      }
    }

    return { delivered: false, error: "no_active_channel" };
  }
}

export class ContactNotificationService {
  private static instance: ContactNotificationService;
  private adapter: ContactNotifierAdapter;

  constructor(adapter?: ContactNotifierAdapter) {
    this.adapter = adapter ?? new EnvironmentContactNotifierAdapter();
  }

  static getInstance(): ContactNotificationService {
    if (!ContactNotificationService.instance) {
      ContactNotificationService.instance = new ContactNotificationService();
    }
    return ContactNotificationService.instance;
  }

  setAdapter(adapter: ContactNotifierAdapter): void {
    this.adapter = adapter;
  }

  getAdapter(): ContactNotifierAdapter {
    return this.adapter;
  }

  async processContact(message: ContactMessage): Promise<ContactNotificationResult> {
    if (!this.adapter.isConfigured()) {
      return {
        delivered: false,
        status: "adapter_not_configured",
        message:
          "O canal de mensagens automáticas não está ativo nesta instalação. Utilize apenas canais institucionais oficialmente configurados.",
      };
    }

    try {
      const result = await this.adapter.dispatch(message);
      if (result.delivered) {
        return {
          delivered: true,
          status: "delivered",
          channel: result.channel,
          message: "Mensagem institucional enviada com sucesso.",
        };
      }

      return {
        delivered: false,
        status: "delivery_failed",
        channel: result.channel,
        message: "Ocorreu uma falha no encaminhamento da mensagem pelo canal configurado.",
      };
    } catch {
      return {
        delivered: false,
        status: "delivery_failed",
        message: "Erro interno no processamento do envio do contacto.",
      };
    }
  }
}
