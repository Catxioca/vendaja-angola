import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { SecurityPage } from "./SecurityPage.js";
import { FiscalCompliancePage } from "./FiscalCompliancePage.js";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage.js";
import { TermsPage } from "./TermsPage.js";
import { StatusPage } from "./StatusPage.js";
import { HomePage } from "./HomePage.js";
import { SolutionsPage } from "./SolutionsPage.js";
import { ModulesPage } from "./ModulesPage.js";
import { SobrePage } from "./SobrePage.js";
import { ContactPage } from "./ContactPage.js";
import { SiteHeader } from "./SiteHeader.js";
import { SiteFooter } from "./SiteFooter.js";

const MANDATORY_REGULATORY_STATEMENT =
  "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.";

const MANDATORY_LEGAL_NOTICE =
  "Requer revisão jurídica antes de publicação comercial.";

const MANDATORY_FISCAL_POLICY_STATEMENT =
  "Taxas, isenções, retenções, séries e regras fiscais são parametrizadas por empresa e exigem fonte oficial vigente e validação por contabilista certificado.";

test("Site Governação: SecurityPage renderiza sem erros e inclui a menção AGT obrigatória", () => {
  const html = renderToString(
    React.createElement(SecurityPage, {
      onNavigate: () => {},
    })
  );

  assert.ok(html.includes(MANDATORY_REGULATORY_STATEMENT), "SecurityPage DEVE conter a menção regulamentar AGT");
  assert.ok(html.includes("Autenticação Robusta e Controlo de Acesso"), "SecurityPage deve explicar RBAC");
  assert.ok(html.includes("Isolamento Estrito Multiempresa"), "SecurityPage deve explicar isolamento multi-tenant");
  assert.ok(html.includes("Fila de Saída Offline (Outbox)"), "SecurityPage deve detalhar outbox e idempotência");
  assert.ok(html.includes("Limites Reais de Armazenamento"), "SecurityPage deve advertir sobre limites físicos mobile");
  assert.ok(!html.includes("COMPROVADO"), "SecurityPage NÃO deve usar o rótulo absoluto COMPROVADO");
  assert.ok(html.includes("COBERTO POR TESTES INTERNOS"), "SecurityPage deve classificar como COBERTO POR TESTES INTERNOS");
  assert.ok(
    html.includes("não equivale a certificação, homologação nem garantia externa"),
    "SecurityPage deve explicar que testes internos não equivalem a certificação ou garantia externa"
  );
  assert.ok(html.includes("CONFIGURÁVEL"), "SecurityPage deve ter classificação de configurável");
  assert.ok(html.includes("DEPENDÊNCIA EXTERNA"), "SecurityPage deve identificar dependências externas");
});

test("Site Governação: FiscalCompliancePage mantém apenas descrição técnica não normativa e cumpre rigor AGT", () => {
  const html = renderToString(
    React.createElement(FiscalCompliancePage, {
      onNavigate: () => {},
    })
  );

  assert.ok(html.includes(MANDATORY_REGULATORY_STATEMENT), "FiscalCompliancePage DEVE conter a menção regulamentar AGT");
  assert.ok(html.includes(MANDATORY_FISCAL_POLICY_STATEMENT), "FiscalCompliancePage DEVE declarar parametrização por empresa, fonte oficial vigente e contabilista certificado");
  assert.ok(html.includes("Estrutura Técnica Não Normativa de Documentos Suportados"), "Deve apresentar estrutura técnica não normativa");
  assert.ok(html.includes("Imutabilidade e Encadeamento Documental"), "Deve explicar imutabilidade técnica documental");
  assert.ok(html.includes("Séries Documentais Sequenciais e Contínuas"), "Deve detalhar séries sequenciais");
  assert.ok(html.includes("Cadeia de Hash e Exportação Estruturada"), "Deve detalhar cadeia de hash e exportação estruturada");
  assert.ok(html.includes("Validação SAF-T (AO) contra Schema XSD Vigente"), "Deve esclarecer validação XSD vigente como dependência externa");
  assert.ok(html.includes("Código QR"), "Deve referir código QR provisório de engenharia");
  assert.ok(html.includes("Webservices"), "Deve esclarecer submissão eletrónica como dependência externa");
});

test("Site Governação: Ausência de alegações fiscais abusivas ou termos proibidos sem qualificador", () => {
  const secHtml = renderToString(React.createElement(SecurityPage, { onNavigate: () => {} }));
  const fiscHtml = renderToString(React.createElement(FiscalCompliancePage, { onNavigate: () => {} }));
  const termsHtml = renderToString(React.createElement(TermsPage, { onNavigate: () => {} }));

  const allContent = `${secHtml} ${fiscHtml} ${termsHtml}`.toLowerCase();

  const forbidden = [
    "software certificado pela agt",
    "homologado pela agt",
    "100% homologado",
    "parceria oficial agt",
    "conforme agt",
    "conforme a agt",
    "certificado pela agt",
    "pgca",
    "8 subdiários",
    "<50ms",
    "schema xsd oficial",
    "certificados oficiais",
    "entidades certificadas",
    "publicação oficial",
    "comprovado",
  ];

  for (const term of forbidden) {
    assert.ok(!allContent.includes(term), `Governação pública não pode conter "${term}"`);
  }
});

test("Site Governação: PrivacyPolicyPage e TermsPage contêm aviso jurídico obrigatório e linguagem técnica honesta", () => {
  const privacyHtml = renderToString(
    React.createElement(PrivacyPolicyPage, {
      onNavigate: () => {},
    })
  );
  const termsHtml = renderToString(
    React.createElement(TermsPage, {
      onNavigate: () => {},
    })
  );

  // Verificação do aviso obrigatório
  assert.ok(privacyHtml.includes(MANDATORY_LEGAL_NOTICE), "PrivacyPolicyPage DEVE conter o aviso de revisão jurídica");
  assert.ok(termsHtml.includes(MANDATORY_LEGAL_NOTICE), "TermsPage DEVE conter o aviso de revisão jurídica");

  // Substituições obrigatórias da Etapa 5.1
  assert.ok(
    privacyHtml.includes("encriptação local de segredos quando configurada e suportada pelo ambiente"),
    "PrivacyPolicyPage deve usar formulação condicional de encriptação local"
  );
  assert.ok(
    termsHtml.includes("encriptação local de segredos quando configurada e suportada pelo ambiente"),
    "TermsPage deve usar formulação condicional de encriptação local"
  );
  assert.ok(
    privacyHtml.includes("retenção sujeita à legislação aplicável, política contratual e validação jurídica"),
    "PrivacyPolicyPage deve qualificar a retenção documental"
  );
  assert.ok(
    termsHtml.includes("retenção sujeita à legislação aplicável, política contratual e validação jurídica"),
    "TermsPage deve qualificar a retenção documental"
  );
  assert.ok(!privacyHtml.includes("AES-256-GCM") && !termsHtml.includes("AES-256-GCM"), "Não deve alegar AES-256-GCM em /privacidade ou /termos");
  assert.ok(
    !privacyHtml.toLowerCase().includes("retenção legal permanente") &&
      !privacyHtml.toLowerCase().includes("retenção de arquivo fiscal permanente"),
    "Não deve alegar retenção legal permanente sem revisão jurídica"
  );

  // Proibição de alegações jurídicas não autorizadas (ex: RGPD ou LGPD sem parecer)
  assert.ok(!privacyHtml.includes("em total conformidade com o RGPD"), "Não deve declarar conformidade formal RGPD sem parecer");
  assert.ok(!privacyHtml.includes("certificado pela LGPD"), "Não deve inventar certificação LGPD");
  assert.ok(privacyHtml.includes("Natureza Técnica dos Dados Tratados"), "Deve focar-se na arquitetura técnica de dados");
  assert.ok(termsHtml.includes("Responsabilidade pelas Configurações Fiscais"), "Deve clarificar deveres do operador");
});

test("Site Governação: Bloqueio persistente de taxas fiscais estáticas, afirmações 'homologado'/'certificado'/'conforme AGT', 'AES-256-GCM' e 'retenção legal permanente'", () => {
  const publicPages = [
    renderToString(React.createElement(HomePage, { apiUrl: "https://api.vendaja.ao", onNavigate: () => {} })),
    renderToString(React.createElement(SolutionsPage, { onNavigate: () => {} })),
    renderToString(React.createElement(ModulesPage, { onNavigate: () => {} })),
    renderToString(React.createElement(SobrePage, { onNavigate: () => {} })),
    renderToString(React.createElement(SecurityPage, { onNavigate: () => {} })),
    renderToString(React.createElement(FiscalCompliancePage, { onNavigate: () => {} })),
    renderToString(React.createElement(PrivacyPolicyPage, { onNavigate: () => {} })),
    renderToString(React.createElement(TermsPage, { onNavigate: () => {} })),
    renderToString(React.createElement(StatusPage, { apiUrl: "https://api.vendaja.ao", onNavigate: () => {} })),
    renderToString(React.createElement(ContactPage, { apiUrl: "https://api.vendaja.ao", onNavigate: () => {} })),
  ];

  const fiscalAndLegalPages = [publicPages[5]!, publicPages[6]!, publicPages[7]!];
  for (const html of fiscalAndLegalPages) {
    // Bloqueia percentagens estáticas de IVA/retenção/impostos apresentadas como universais
    assert.equal(
      /\b(14|7|5|2|6[,.]5|10[,.]5|3|8)\s*%/.test(html),
      false,
      "Páginas fiscais/legais não podem apresentar percentagens fiscais estáticas como universais"
    );
    assert.equal(
      /\b(iva|reten[çc][ãa]o|irt|selo|imposto|seguran[çc]a social)\b[^.<]{0,60}\b\d+(?:[,.]\d+)?\s*%/i.test(html),
      false,
      "Não pode associar impostos/retenções a percentagens fixas"
    );
  }

  for (const html of publicPages) {
    const lower = html.toLowerCase();
    assert.equal(lower.includes("certificado pela agt"), false, "Proibido 'certificado pela AGT'");
    assert.equal(lower.includes("conforme agt") || lower.includes("conforme a agt"), false, "Proibido 'conforme AGT'");
    assert.equal(lower.includes("retenção legal permanente"), false, "Proibido 'retenção legal permanente'");
    assert.equal(lower.includes("aes-256-gcm"), false, "Proibido 'AES-256-GCM' sem evidência em páginas públicas");

    // Qualquer ocorrência de 'homologado(a)' fora das fórmulas negativas obrigatórias é bloqueada
    const withoutNegatedDisclaimers = lower
      .replace(/não homologado até aprovação formal da agt/g, "")
      .replace(/não se encontra homologado até aprovação formal da agt/g, "")
      .replace(/não se encontra homologado/g, "");
    assert.equal(
      /\bhomologad[oa]s?\b/i.test(withoutNegatedDisclaimers),
      false,
      "Proibido afirmar 'homologado' fora das declarações negativas explícitas"
    );
  }
});

test("Site Governação: StatusPage exibe 'Estado público indisponível' e não inventa uptime", () => {
  const statusHtml = renderToString(
    React.createElement(StatusPage, {
      apiUrl: "https://api.vendaja.ao",
      onNavigate: () => {},
    })
  );

  assert.ok(statusHtml.includes("Estado público indisponível"), "StatusPage deve declarar explicitamente 'Estado público indisponível'");
  assert.ok(!statusHtml.includes("99.9%"), "StatusPage NÃO deve inventar estatísticas de uptime como 99.9%");
  assert.ok(!statusHtml.includes("99.99%"), "StatusPage NÃO deve inventar 99.99%");
  assert.ok(!statusHtml.includes("100% uptime"), "StatusPage NÃO deve inventar 100% uptime");
  assert.ok(statusHtml.includes("Testar Ligação ao Servidor Local"), "Deve permitir diagnóstico local pelo utilizador");
  assert.ok(statusHtml.includes(MANDATORY_REGULATORY_STATEMENT), "StatusPage DEVE conter a declaração regulamentar");
});

test("Site Governação: Segurança de bundles e ausência de segredos ou chaves privadas", () => {
  const pages = [
    renderToString(React.createElement(SecurityPage, { onNavigate: () => {} })),
    renderToString(React.createElement(FiscalCompliancePage, { onNavigate: () => {} })),
    renderToString(React.createElement(PrivacyPolicyPage, { onNavigate: () => {} })),
    renderToString(React.createElement(TermsPage, { onNavigate: () => {} })),
    renderToString(React.createElement(StatusPage, { apiUrl: "https://api.vendaja.ao", onNavigate: () => {} })),
  ];

  const fullMarkup = pages.join(" ");

  // Proibição estrita de credenciais, chaves PEM ou tokens vazados no markup público
  assert.ok(!fullMarkup.includes("-----BEGIN PRIVATE KEY-----"), "Nenhum componente público pode conter chaves privadas");
  assert.ok(!fullMarkup.includes("-----BEGIN RSA PRIVATE KEY-----"), "Nenhuma chave RSA privada nos componentes");
  assert.ok(!fullMarkup.includes("JWT_SECRET"), "Nenhum segredo de JWT no markup");
  assert.ok(!fullMarkup.includes("DATABASE_URL"), "Nenhuma string de conexão à base de dados");
  assert.ok(!fullMarkup.includes("postgres://"), "Nenhum URI PostgreSQL exposto");
});

test("Site Governação: Header e Footer contêm links semânticos e acessíveis para novas páginas", () => {
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

  assert.ok(headerHtml.includes("Segurança"), "Header deve conter atalho para Segurança");
  assert.ok(headerHtml.includes("Conformidade Fiscal"), "Header deve conter atalho para Conformidade Fiscal");

  assert.ok(footerHtml.includes("Segurança &amp; Governação") || footerHtml.includes("Segurança & Governação"), "Footer deve conter secção de Governação");
  assert.ok(footerHtml.includes("Conformidade Fiscal"), "Footer deve conter link para Conformidade Fiscal");
  assert.ok(footerHtml.includes("Privacidade de Dados"), "Footer deve conter link para Privacidade");
  assert.ok(footerHtml.includes("Termos de Utilização"), "Footer deve conter link para Termos");
  assert.ok(footerHtml.includes("Estado e Diagnóstico"), "Footer deve conter link para Estado");
});
