import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  ContactNotificationService,
  sanitizeContactText,
  type ContactMessage,
} from "../services/contact-notification.service.js";
import { logger } from "../services/enterprise/logger.service.js";

export const contactRouter = Router();

export type ContactRateLimitMode = "in_memory_single_instance" | "shared_adapter";

export interface ContactRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  mode: ContactRateLimitMode;
}

/**
 * Contrato de adaptador para controlo de abuso no contacto público.
 * Ambientes multi-instância devem injetar uma implementação partilhada
 * antes do deploy em produção; o fallback em memória destina-se apenas
 * a desenvolvimento e execução em instância única.
 */
export interface ContactRateLimiterAdapter {
  readonly name: string;
  readonly scope: "single_instance_dev" | "shared";
  consume(ip: string): Promise<ContactRateLimitResult>;
  reset?(): Promise<void> | void;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_TRACKED_IPS = 10_000;

/**
 * Proteção em memória por IP (5 envios / 15 min) — APENAS para desenvolvimento
 * e implantação de instância única. Não partilha estado entre processos/réplicas.
 */
export class InMemoryContactRateLimiter implements ContactRateLimiterAdapter {
  readonly name = "InMemorySingleInstanceRateLimiter";
  readonly scope = "single_instance_dev" as const;
  private readonly history = new Map<string, number[]>();

  async consume(ip: string): Promise<ContactRateLimitResult> {
    const now = Date.now();
    if (!this.history.has(ip) && this.history.size >= MAX_TRACKED_IPS) {
      for (const [trackedIp, trackedTimes] of this.history.entries()) {
        const active = trackedTimes.filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
        if (active.length === 0) {
          this.history.delete(trackedIp);
        }
      }
      if (this.history.size >= MAX_TRACKED_IPS) {
        const oldestKey = this.history.keys().next().value;
        if (oldestKey !== undefined) {
          this.history.delete(oldestKey);
        }
      }
    }

    const timestamps = (this.history.get(ip) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
    if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
      this.history.set(ip, timestamps);
      const oldest = timestamps[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        mode: "in_memory_single_instance",
      };
    }

    timestamps.push(now);
    this.history.set(ip, timestamps);
    return {
      allowed: true,
      remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - timestamps.length),
      mode: "in_memory_single_instance",
    };
  }

  reset(): void {
    this.history.clear();
  }
}

const defaultInMemoryRateLimiter = new InMemoryContactRateLimiter();
let activeRateLimiter: ContactRateLimiterAdapter = defaultInMemoryRateLimiter;

export function setContactRateLimiterAdapter(adapter?: ContactRateLimiterAdapter): void {
  activeRateLimiter = adapter ?? defaultInMemoryRateLimiter;
}

export function getContactRateLimiterAdapter(): ContactRateLimiterAdapter {
  return activeRateLimiter;
}

export async function clearRateLimitHistory(): Promise<void> {
  defaultInMemoryRateLimiter.reset();
  if (activeRateLimiter !== defaultInMemoryRateLimiter) {
    await activeRateLimiter.reset?.();
  }
}

export const contactSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres").max(120),
  organization: z.string().trim().min(2, "A organização deve ter pelo menos 2 caracteres").max(150),
  email: z.string().trim().email("Endereço de e-mail inválido").max(150),
  phone: z.string().trim().max(30).optional(),
  subject: z.string().trim().min(2, "O assunto é obrigatório").max(100),
  message: z.string().trim().min(10, "A mensagem deve conter pelo menos 10 caracteres").max(3000),
  consent: z.boolean().refine((val) => val === true, {
    message: "O consentimento para resposta institucional é obrigatório",
  }),
  honeypot: z.string().optional(),
});

contactRouter.post("/", async (req: Request, res: Response) => {
  const clientIp = (req.ip || req.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");

  // 1. Verificação de Rate Limit (instância única em memória por defeito ou adaptador partilhado)
  const rateLimit = await activeRateLimiter.consume(clientIp);
  if (!rateLimit.allowed) {
    if (rateLimit.retryAfterSeconds) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    }
    res.status(429).json({
      error: "too_many_requests",
      mode: rateLimit.mode,
      message: "Limite de pedidos de contacto excedido para o seu endereço IP. Por favor, aguarde alguns minutos.",
    });
    return;
  }

  // 2. Validação rigorosa dos campos
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_contact_payload",
      message: "Dados de contacto inválidos ou incompletos.",
      details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), error: issue.message })),
    });
    return;
  }

  const { name, organization, email, phone, subject, message, consent, honeypot } = parsed.data;

  // 3. Prevenção de Abuso por Honeypot (campo armadilha para bots)
  if (honeypot && honeypot.trim().length > 0) {
    // Rejeição silenciosa ou 400 sem processar
    res.status(400).json({
      error: "spam_detected",
      message: "Pedido rejeitado pelos filtros automatizados de segurança.",
    });
    return;
  }

  // 4. Sanitização contra injeção de HTML/scripts
  const sanitizedName = sanitizeContactText(name);
  const sanitizedOrg = sanitizeContactText(organization);
  const sanitizedSubject = sanitizeContactText(subject);
  const sanitizedMessage = sanitizeContactText(message);
  const sanitizedPhone = phone ? sanitizeContactText(phone) : undefined;

  const contactData: ContactMessage = {
    name: sanitizedName,
    organization: sanitizedOrg,
    email: email.toLowerCase(),
    phone: sanitizedPhone,
    subject: sanitizedSubject,
    message: sanitizedMessage,
    consent: Boolean(consent),
    receivedAt: new Date(),
    ipAddress: clientIp,
  };

  // 5. Processamento no serviço com adaptador configurável
  const service = ContactNotificationService.getInstance();
  const outcome = await service.processContact(contactData);

  // 6. Registo de Log Estritamente sem PII (sem e-mail, domínio, nome, telefone, assunto livre, mensagem ou IP)
  logger.info("PUBLIC_CONTACT", "REQUEST_PROCESSED", "Public contact request processed", {
    metadata: {
      consentGiven: Boolean(consent),
      hasPhone: Boolean(sanitizedPhone),
      subjectLength: sanitizedSubject.length,
      messageLength: sanitizedMessage.length,
      rateLimitScope: activeRateLimiter.scope,
      rateLimitMode: rateLimit.mode,
      outcomeStatus: outcome.status,
    },
  });

  if (outcome.status === "adapter_not_configured") {
    // Transparência: informa o cliente de que o canal automático não está ativo e não finge envio
    res.status(503).json({
      success: false,
      status: "adapter_not_configured",
      message: outcome.message,
    });
    return;
  }

  if (outcome.status === "delivery_failed") {
    res.status(502).json({
      success: false,
      status: "delivery_failed",
      message: outcome.message,
    });
    return;
  }

  res.status(200).json({
    success: true,
    status: "delivered",
    message: "O seu pedido de contacto foi submetido com sucesso. Responderemos com a brevidade possível.",
  });
});
