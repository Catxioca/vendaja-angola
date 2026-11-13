import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { ContactPage, submitContactRequest } from "./ContactPage.js";
import {
  INSTITUTIONAL_CONTACT_UNAVAILABLE_MESSAGE,
  resolveInstitutionalContactChannels,
} from "./institutional-contact.js";
import { SiteHeader } from "./SiteHeader.js";
import { SiteFooter } from "./SiteFooter.js";

const MANDATORY_REGULATORY_STATEMENT =
  "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.";

const MANDATORY_LEGAL_NOTICE =
  "Requer revisão jurídica antes de publicação comercial.";

test("Site Contacto: Renderização estática e acessibilidade do formulário", () => {
  const html = renderToString(
    React.createElement(ContactPage, {
      apiUrl: "https://api.vendaja.ao",
      onNavigate: () => {},
    })
  );

  // Verificação de campos semânticos e labels
  assert.ok(html.includes('for="contact-name"'), "Label deve estar associada ao id contact-name");
  assert.ok(html.includes('id="contact-name"'), "Input de nome deve existir");
  assert.ok(html.includes('for="contact-org"'), "Label deve estar associada ao id contact-org");
  assert.ok(html.includes('id="contact-org"'), "Input de organização deve existir");
  assert.ok(html.includes('for="contact-email"'), "Label deve estar associada ao id contact-email");
  assert.ok(html.includes('id="contact-email"'), "Input de e-mail deve existir");
  assert.ok(html.includes('for="contact-subject"'), "Label deve estar associada ao id contact-subject");
  assert.ok(html.includes('id="contact-subject"'), "Select de assunto deve existir");
  assert.ok(html.includes('for="contact-message"'), "Label deve estar associada ao id contact-message");
  assert.ok(html.includes('id="contact-message"'), "Textarea de mensagem deve existir");
  assert.ok(html.includes('id="contact-consent"'), "Checkbox de consentimento deve existir");

  // Campo Honeypot presente e oculto
  assert.ok(html.includes('id="contact-website"'), "Campo honeypot anti-spam deve existir");

  // Avisos obrigatórios
  assert.ok(html.includes(MANDATORY_REGULATORY_STATEMENT), "Deve incluir declaração regulamentar AGT");
  assert.ok(html.includes(MANDATORY_LEGAL_NOTICE), "Deve incluir aviso de revisão jurídica");
});

test("Site Contacto: Consentimento explícito e finalidade de privacidade", () => {
  const html = renderToString(
    React.createElement(ContactPage, {
      apiUrl: "https://api.vendaja.ao",
      onNavigate: () => {},
    })
  );

  assert.ok(
    html.includes("exclusivamente para efeitos de contacto"),
    "Consentimento deve clarificar finalidade restrita de contacto"
  );
  assert.ok(
    html.includes("não são utilizados para fins de publicidade não solicitada"),
    "Consentimento deve excluir marketing abusivo ou não solicitado"
  );
});

test("Site Contacto: Tratamento honesto de adaptador não configurado (sem fingir envio)", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          success: false,
          status: "adapter_not_configured",
          message:
            "O canal de mensagens automáticas não se encontra ativo nesta instalação. Por favor utilize os contactos institucionais diretos.",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    const res = await globalThis.fetch("https://api.vendaja.ao/api/v1/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Maria Antónia",
        organization: "VendaJa Test",
        email: "maria@teste.ao",
        subject: "Suporte",
        message: "Necessito de informações sobre o licenciamento.",
        consent: true,
      }),
    });

    assert.equal(res.status, 503);
    const data = (await res.json()) as { status: string; success: boolean };
    assert.equal(data.success, false);
    assert.equal(data.status, "adapter_not_configured", "Não deve fingir envio bem-sucedido");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Site Contacto: Tratamento de limite de requisições (Rate Limit 429)", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: "too_many_requests",
          message: "Limite de pedidos de contacto excedido.",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    const res = await globalThis.fetch("https://api.vendaja.ao/api/v1/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Utilizador Frequente",
        organization: "Empresa Test",
        email: "teste@empresa.ao",
        subject: "Contacto",
        message: "Tentativa repetida de envio de mensagem.",
        consent: true,
      }),
    });

    assert.equal(res.status, 429);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, "too_many_requests");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Site Contacto: Ausência de credenciais, chaves ou tokens confidenciais no componente", () => {
  const html = renderToString(
    React.createElement(ContactPage, {
      apiUrl: "https://api.vendaja.ao",
      onNavigate: () => {},
    })
  );

  assert.ok(!html.includes("SMTP_PASSWORD"), "Não deve conter senhas SMTP");
  assert.ok(!html.includes("WHATSAPP_TOKEN"), "Não deve conter tokens WhatsApp");
  assert.ok(!html.includes("CRM_API_KEY"), "Não deve conter chaves CRM");
  assert.ok(!html.includes("BEGIN PRIVATE KEY"), "Não deve conter chaves privadas");
});

test("Site Contacto: Header e Footer contêm atalho para a página de contacto", () => {
  const headerHtml = renderToString(
    React.createElement(SiteHeader, {
      currentView: "home",
      onNavigate: () => {},
    })
  );

  const footerHtml = renderToString(
    React.createElement(SiteFooter, {
      onNavigate: () => {},
    })
  );

  assert.ok(headerHtml.includes("Contacto"), "SiteHeader deve conter link para Contacto");
  assert.ok(footerHtml.includes("Contacto &amp; Demonstração") || footerHtml.includes("Contacto & Demonstração"), "SiteFooter deve conter link para Contacto");
});

test("Site Contacto: Ausência de contactos fictícios e exibição exclusiva de configuração explícita", () => {
  const contactHtml = renderToString(
    React.createElement(ContactPage, {
      apiUrl: "https://api.vendaja.ao",
      onNavigate: () => {},
    })
  );
  const footerHtml = renderToString(
    React.createElement(SiteFooter, {
      onNavigate: () => {},
    })
  );

  for (const html of [contactHtml, footerHtml]) {
    assert.ok(
      html.includes(INSTITUTIONAL_CONTACT_UNAVAILABLE_MESSAGE),
      "Sem configuração explícita deve apresentar apenas Canais institucionais em configuração"
    );
    assert.ok(!html.includes("contacto@vendaja.ao"), "Não deve expor e-mail fictício");
    assert.ok(!html.includes("+244"), "Não deve expor telefone fictício");
    assert.ok(!html.includes("Luanda, República de Angola"), "Não deve expor endereço não configurado");
    assert.ok(!/whatsapp|wa\.me|t\.me|telegram/i.test(html), "Não deve incluir canais de terceiros ou pessoais");
  }

  const contactSource = fs.readFileSync(path.resolve("src/site/ContactPage.tsx"), "utf-8");
  const footerSource = fs.readFileSync(path.resolve("src/site/SiteFooter.tsx"), "utf-8");
  for (const source of [contactSource, footerSource]) {
    assert.ok(!source.includes("contacto@vendaja.ao"), "Código-fonte público não deve conter e-mail fictício");
    assert.ok(!source.includes("+244 923 000 000"), "Código-fonte público não deve conter telefone fictício");
    assert.ok(!source.includes("Luanda, República de Angola"), "Código-fonte público não deve conter endereço fixo não aprovado");
  }

  const configured = resolveInstitutionalContactChannels({
    email: "atendimento@exemplo-aprovado.ao",
    phone: "",
    address: null,
  });
  assert.equal(configured.hasAnyChannel, true);
  assert.equal(configured.email, "atendimento@exemplo-aprovado.ao");
  assert.equal(configured.phone, null);
  assert.equal(configured.address, null);

  const configuredFooterHtml = renderToString(
    React.createElement(SiteFooter, {
      onNavigate: () => {},
      institutionalContact: { email: "atendimento@exemplo-aprovado.ao" },
    })
  );
  assert.ok(configuredFooterHtml.includes("atendimento@exemplo-aprovado.ao"));
  assert.ok(!configuredFooterHtml.includes(INSTITUTIONAL_CONTACT_UNAVAILABLE_MESSAGE));
});

test("Site Contacto: Formulário só envia com consentimento explícito e não persiste dados localmente", async () => {
  const html = renderToString(
    React.createElement(ContactPage, {
      apiUrl: "https://api.vendaja.ao",
      onNavigate: () => {},
    })
  );

  assert.ok(html.includes("O formulário só é enviado mediante consentimento explícito."));
  assert.ok(html.includes("não são armazenados localmente"));
  assert.ok(html.includes(MANDATORY_LEGAL_NOTICE));
  assert.ok(html.includes('aria-disabled="true"'), "Botão de submissão deve iniciar desativado sem consentimento");

  const contactSource = fs.readFileSync(path.resolve("src/site/ContactPage.tsx"), "utf-8");
  assert.ok(!/localStorage|sessionStorage|indexedDB/i.test(contactSource), "Não deve persistir contactos no navegador");

  let fetchCalled = false;
  const resultWithoutConsent = await submitContactRequest(
    {
      name: "Ana Costa",
      organization: "Entidade Teste",
      email: "ana@entidade.ao",
      subject: "Demonstração do ERP",
      message: "Pedido de demonstração institucional sem consentimento assinalado.",
      consent: false,
    },
    "https://api.vendaja.ao",
    async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    }
  );

  assert.equal(fetchCalled, false, "Fetch não pode ser invocado sem consentimento explícito");
  assert.equal(resultWithoutConsent.status, "error");
  assert.ok(resultWithoutConsent.feedbackMessage.includes("consentimento explícito"));
});

test("Site Contacto: submitContactRequest trata 503 adapter_not_configured sem fingir sucesso e trata 429", async () => {
  const adapterUnavailable = await submitContactRequest(
    {
      name: "Carlos Silva",
      organization: "Comercial Teste",
      email: "carlos@comercialteste.ao",
      subject: "Informações Comerciais",
      message: "Solicitamos informação sobre implantação sem adaptador ativo.",
      consent: true,
    },
    "https://api.vendaja.ao",
    async () =>
      new Response(
        JSON.stringify({
          success: false,
          status: "adapter_not_configured",
          message: "Canal automático inativo.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
  );

  assert.equal(adapterUnavailable.status, "adapter_not_configured");
  assert.notEqual(adapterUnavailable.status, "success");

  const rateLimited = await submitContactRequest(
    {
      name: "Carlos Silva",
      organization: "Comercial Teste",
      email: "carlos@comercialteste.ao",
      subject: "Informações Comerciais",
      message: "Tentativa sujeita a limitação de taxa no endpoint público.",
      consent: true,
    },
    "https://api.vendaja.ao",
    async () =>
      new Response(JSON.stringify({ error: "too_many_requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
  );

  assert.equal(rateLimited.status, "error");
  assert.ok(rateLimited.feedbackMessage.includes("Limite de envios"));
});
