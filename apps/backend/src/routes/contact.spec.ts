import assert from "node:assert/strict";
import test from "node:test";
import {
  clearRateLimitHistory,
  contactRouter,
  contactSchema,
  getContactRateLimiterAdapter,
  setContactRateLimiterAdapter,
  type ContactRateLimiterAdapter,
} from "./contact.js";
import { logger } from "../services/enterprise/logger.service.js";
import {
  sanitizeContactText,
  maskEmailForLogs,
  ContactNotificationService,
  type ContactNotifierAdapter,
  type ContactMessage,
} from "../services/contact-notification.service.js";

const validPayload = {
  name: "António Manuel",
  organization: "Comercial do Sul, Lda",
  email: "antonio@comercialdosul.ao",
  phone: "+244 923 000 111",
  subject: "Demonstração do ERP",
  message: "Gostaríamos de agendar uma demonstração técnica das funcionalidades multi-loja do VendaJá.",
  consent: true,
};

test("Contact Backend: Valida payload completo e correto", () => {
  const result = contactSchema.safeParse(validPayload);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "António Manuel");
    assert.equal(result.data.email, "antonio@comercialdosul.ao");
    assert.equal(result.data.consent, true);
  }
});

test("Contact Backend: Rejeita submissão sem consentimento explícito", () => {
  const noConsent = { ...validPayload, consent: false };
  const result = contactSchema.safeParse(noConsent);
  assert.equal(result.success, false, "Submissão sem consentimento deve ser rejeitada");
});

test("Contact Backend: Rejeita e-mail malformado ou campos vazios", () => {
  assert.equal(contactSchema.safeParse({ ...validPayload, email: "invalido" }).success, false);
  assert.equal(contactSchema.safeParse({ ...validPayload, name: " " }).success, false);
  assert.equal(contactSchema.safeParse({ ...validPayload, message: "curto" }).success, false);
});

test("Contact Backend: Sanitização de injeção de HTML e scripts perigosos", () => {
  const dirty = "<script>alert('xss')</script><b>Mensagem</b> com <i>formatação</i> e <iframe src='malware.test'></iframe>.";
  const clean = sanitizeContactText(dirty);

  assert.ok(!clean.includes("<script>"), "Não deve conter tags de script");
  assert.ok(!clean.includes("<iframe"), "Não deve conter tags de iframe");
  assert.ok(!clean.includes("<b>"), "Tags HTML devem ser removidas");
  assert.ok(clean.includes("Mensagem"), "Texto legítimo deve ser preservado");
});

test("Contact Backend: Mascaramento de e-mail para logs sem vazamento de dados", () => {
  assert.equal(maskEmailForLogs("antonio.manuel@empresa.ao"), "a***l@empresa.ao");
  assert.equal(maskEmailForLogs("suporte@gestao.ao"), "s***e@gestao.ao");
  assert.equal(maskEmailForLogs(""), "***");
});

test("Contact Backend: Sem adaptador configurado, informa claramente e NÃO finge envio", async () => {
  const service = new ContactNotificationService({
    name: "MockUnconfigured",
    isConfigured: () => false,
    dispatch: async () => ({ delivered: false, error: "adapter_not_configured" }),
  });

  const outcome = await service.processContact({
    ...validPayload,
    receivedAt: new Date(),
  });

  assert.equal(outcome.delivered, false);
  assert.equal(outcome.status, "adapter_not_configured");
  assert.ok(
    outcome.message.includes("não está ativo nesta instalação"),
    "Deve devolver mensagem honesta sobre indisponibilidade de adaptador"
  );
});

test("Contact Backend: Com adaptador configurado, despacha a mensagem com sucesso", async () => {
  let dispatchedPayload: ContactMessage | null = null;

  const mockAdapter: ContactNotifierAdapter = {
    name: "MockCrm",
    isConfigured: () => true,
    dispatch: async (data: ContactMessage) => {
      dispatchedPayload = data;
      return { delivered: true, channel: "CRM_TEST" };
    },
  };

  const service = new ContactNotificationService(mockAdapter);
  const outcome = await service.processContact({
    ...validPayload,
    receivedAt: new Date(),
  });

  assert.equal(outcome.delivered, true);
  assert.equal(outcome.status, "delivered");
  assert.equal(outcome.channel, "CRM_TEST");
  assert.ok(dispatchedPayload, "O adaptador deve ter recebido a mensagem");
  assert.equal((dispatchedPayload as ContactMessage).email, "antonio@comercialdosul.ao");
});

async function dispatchContactPost(
  body: unknown,
  remoteAddress = "203.0.113.10"
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  return await new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    let settled = false;
    const req = {
      method: "POST",
      url: "/",
      originalUrl: "/api/v1/contact",
      headers: { "content-type": "application/json" },
      body,
      ip: remoteAddress,
      socket: { remoteAddress },
      header(name: string) {
        return this.headers[name.toLowerCase() as keyof typeof this.headers];
      },
      get(name: string) {
        return this.headers[name.toLowerCase() as keyof typeof this.headers];
      },
    };

    const res = {
      statusCode: 200,
      setHeader(name: string, value: string | number | readonly string[]) {
        headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
      },
      getHeader(name: string) {
        return headers[name.toLowerCase()];
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        if (!settled) {
          settled = true;
          resolve({ status: this.statusCode, headers, body: payload });
        }
        return this;
      },
      end(payload?: unknown) {
        if (!settled) {
          settled = true;
          resolve({ status: this.statusCode, headers, body: payload });
        }
        return this;
      },
    };

    contactRouter(req as never, res as never, (err?: unknown) => {
      if (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
        return;
      }
      if (!settled) {
        settled = true;
        resolve({ status: 404, headers, body: null });
      }
    });
  });
}

test("Contact HTTP Route: Sem adaptador devolve 503 honesto e não expõe PII em logs ou stdout", async () => {
  const service = ContactNotificationService.getInstance();
  const previousNotifier = service.getAdapter();
  const previousRateLimiter = getContactRateLimiterAdapter();

  await clearRateLimitHistory();
  setContactRateLimiterAdapter();
  service.setAdapter({
    name: "UnconfiguredTestAdapter",
    isConfigured: () => false,
    dispatch: async () => ({ delivered: false, error: "adapter_not_configured" }),
  });

  const capturedStdout: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedStdout.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  }) as typeof process.stdout.write;

  const sentinelPayload = {
    name: "PII-Joao-Kiala-Sentinela",
    organization: "PII-Organizacao-Sigilosa",
    email: "pii.sigiloso@dominio-privado-sentinela.ao",
    phone: "+244999888777",
    subject: "PII-Assunto-Sentinela-Confidencial",
    message: "PII-Corpo-Da-Mensagem-Extremamente-Confidencial",
    consent: true,
  };

  try {
    const res = await dispatchContactPost(sentinelPayload, "198.51.100.77");

    assert.equal(res.status, 503);
    const body = res.body as { success: boolean; status: string; message: string };
    assert.equal(body.success, false);
    assert.equal(body.status, "adapter_not_configured");
    assert.ok(body.message.includes("não está ativo nesta instalação"));

    const logsText = [
      ...capturedStdout,
      JSON.stringify(logger.queryLogs({ module: "PUBLIC_CONTACT", limit: 10 })),
    ].join("\n");

    for (const secretFragment of [
      "PII-Joao-Kiala-Sentinela",
      "PII-Organizacao-Sigilosa",
      "pii.sigiloso",
      "dominio-privado-sentinela.ao",
      "+244999888777",
      "PII-Assunto-Sentinela-Confidencial",
      "PII-Corpo-Da-Mensagem-Extremamente-Confidencial",
      "198.51.100.77",
    ]) {
      assert.ok(!logsText.includes(secretFragment), `Logs não devem expor PII: ${secretFragment}`);
    }
  } finally {
    process.stdout.write = originalStdoutWrite;
    service.setAdapter(previousNotifier);
    setContactRateLimiterAdapter(previousRateLimiter);
    await clearRateLimitHistory();
  }
});

test("Contact HTTP Route: Rate limit em memória (instância única) bloqueia após 5 submissões", async () => {
  const service = ContactNotificationService.getInstance();
  const previousNotifier = service.getAdapter();
  const previousRateLimiter = getContactRateLimiterAdapter();

  await clearRateLimitHistory();
  setContactRateLimiterAdapter();
  assert.equal(getContactRateLimiterAdapter().scope, "single_instance_dev");

  service.setAdapter({
    name: "DeliveredMock",
    isConfigured: () => true,
    dispatch: async () => ({ delivered: true, channel: "TEST_CHANNEL" }),
  });

  try {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await dispatchContactPost(validPayload);
      assert.equal(res.status, 200, `Tentativa ${attempt} deveria ser permitida`);
    }

    const blockedRes = await dispatchContactPost(validPayload);
    assert.equal(blockedRes.status, 429);
    const blockedBody = blockedRes.body as { error: string; mode: string };
    assert.equal(blockedBody.error, "too_many_requests");
    assert.equal(blockedBody.mode, "in_memory_single_instance");
    assert.ok(Number(blockedRes.headers["retry-after"]) >= 1);
  } finally {
    service.setAdapter(previousNotifier);
    setContactRateLimiterAdapter(previousRateLimiter);
    await clearRateLimitHistory();
  }
});

test("Contact HTTP Route: Delega para ContactRateLimiterAdapter partilhado quando configurado", async () => {
  const service = ContactNotificationService.getInstance();
  const previousNotifier = service.getAdapter();
  const previousRateLimiter = getContactRateLimiterAdapter();

  let sharedCalls = 0;
  const sharedAdapter: ContactRateLimiterAdapter = {
    name: "SharedTestRateLimiter",
    scope: "shared",
    async consume() {
      sharedCalls += 1;
      if (sharedCalls === 1) {
        return { allowed: true, remaining: 0, mode: "shared_adapter" };
      }
      return { allowed: false, remaining: 0, retryAfterSeconds: 45, mode: "shared_adapter" };
    },
    reset() {
      sharedCalls = 0;
    },
  };

  setContactRateLimiterAdapter(sharedAdapter);
  service.setAdapter({
    name: "UnconfiguredTestAdapter",
    isConfigured: () => false,
    dispatch: async () => ({ delivered: false, error: "adapter_not_configured" }),
  });

  try {
    const first = await dispatchContactPost(validPayload);
    assert.equal(first.status, 503);

    const second = await dispatchContactPost(validPayload);
    assert.equal(second.status, 429);
    assert.equal(second.headers["retry-after"], "45");
    const body = second.body as { error: string; mode: string };
    assert.equal(body.error, "too_many_requests");
    assert.equal(body.mode, "shared_adapter");
  } finally {
    service.setAdapter(previousNotifier);
    setContactRateLimiterAdapter(previousRateLimiter);
    await clearRateLimitHistory();
  }
});
