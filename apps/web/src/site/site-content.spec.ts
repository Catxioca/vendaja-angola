import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { HomePage } from "./HomePage.js";
import { SolutionsPage } from "./SolutionsPage.js";
import { ModulesPage, MODULES_DETAILED_CATALOG } from "./ModulesPage.js";
import { SobrePage } from "./SobrePage.js";
import { SiteHeader } from "./SiteHeader.js";
import { SiteFooter } from "./SiteFooter.js";

const MANDATORY_REGULATORY_STATEMENT =
  "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.";

const MANDATORY_ENERGY_STATEMENT =
  "Operação offline-first enquanto o posto de trabalho permanece operacional; a continuidade perante falha elétrica depende de energia e hardware compatíveis.";

const MANDATORY_ACCOUNTING_STATEMENT =
  "Modelagem contabilística configurável por empresa, sujeita a fonte oficial e validação por contabilista certificado.";

test("Site Institucional: Renderização estática da HomePage sem erros", () => {
  const html = renderToString(
    React.createElement(HomePage, {
      apiUrl: "http://localhost:4000",
      onNavigate: () => {},
    })
  );

  assert.ok(html.includes("Mutshima"), "HomePage deve conter a marca Mutshima");
  assert.ok(html.includes("Faturação Comercial"), "HomePage deve apresentar o produto");
  assert.ok(html.includes("Operação Offline Autónoma"), "HomePage deve explicar operação offline");
  assert.ok(html.includes("Sincronização Segura e Idempotente"), "HomePage deve explicar sincronização");
  assert.ok(html.includes(MANDATORY_REGULATORY_STATEMENT), "HomePage DEVE conter a declaração regulamentar obrigatória");
  assert.ok(html.includes(MANDATORY_ENERGY_STATEMENT), "HomePage DEVE qualificar continuidade perante falha elétrica");
  assert.ok(html.includes(MANDATORY_ACCOUNTING_STATEMENT), "HomePage DEVE usar modelagem contabilística configurável");
  assert.ok(html.includes("Requisitos de Hardware e Periféricos Físicos"), "HomePage deve advertir sobre dependência de hardware físico");
});

test("Site Institucional: Renderização estática da SolutionsPage com 11 verticais e Muambuluisha IA", () => {
  const html = renderToString(
    React.createElement(SolutionsPage, {
      onNavigate: () => {},
    })
  );

  assert.ok(html.includes("POS de Balcão"), "SolutionsPage deve incluir POS de Balcão");
  assert.ok(html.includes("Faturação Comercial"), "SolutionsPage deve incluir Faturação Comercial");
  assert.ok(html.includes("Gestão de Stock"), "SolutionsPage deve incluir Gestão de Stock");
  assert.ok(html.includes("Compras e Gestão de Fornecedores"), "SolutionsPage deve incluir Compras e Fornecedores");
  assert.ok(html.includes("Clientes e Contas Correntes"), "SolutionsPage deve incluir Clientes e Contas Correntes");
  assert.ok(html.includes("Tesouraria e Fluxo de Caixa"), "SolutionsPage deve incluir Tesouraria");
  assert.ok(html.includes("Contabilidade Geral e Partidas Dobradas"), "SolutionsPage deve incluir Contabilidade Geral configurável");
  assert.ok(html.includes(MANDATORY_ACCOUNTING_STATEMENT), "SolutionsPage deve usar descrição configurável sem plano fixo universal");
  assert.ok(html.includes("Recursos Humanos e Processamento Salarial"), "SolutionsPage deve incluir RH");
  assert.ok(html.includes("Centro Corporativo Multiempresa"), "SolutionsPage deve incluir Multiempresa/Multifilial");
  assert.ok(html.includes("Desktop, Web ERP e Android/Tablet POS"), "SolutionsPage deve incluir Plataformas Integradas");
  assert.ok(html.includes("Muambuluisha IA — Assistente Inteligente Soberano"), "SolutionsPage deve incluir Muambuluisha IA");
  assert.ok(html.includes(MANDATORY_REGULATORY_STATEMENT), "SolutionsPage DEVE conter a declaração regulamentar obrigatória");
});

test("Site Institucional: Renderização estática da ModulesPage com matriz e filtros", () => {
  const html = renderToString(
    React.createElement(ModulesPage, {
      onNavigate: () => {},
    })
  );

  assert.ok(html.includes("Matriz Visual de Módulos"), "ModulesPage deve conter o cabeçalho da matriz");
  assert.ok(html.includes(MANDATORY_REGULATORY_STATEMENT), "ModulesPage DEVE conter a declaração regulamentar obrigatória");
  assert.ok(html.includes("Transparência sobre o Processo de Homologação"), "ModulesPage deve detalhar processo fiscal");
  assert.ok(html.includes("SAF-T (AO)"), "ModulesPage deve citar o formato parametrizável SAF-T (AO)");
  assert.ok(html.includes("RSA-SHA256"), "ModulesPage deve citar a criptografia parametrizável de assinatura");
  assert.ok(html.includes(MANDATORY_ACCOUNTING_STATEMENT), "ModulesPage deve usar modelagem contabilística configurável");
});

test("Site Institucional: Matriz de Módulos - Integridade e Classificação Honesta", () => {
  assert.equal(
    MODULES_DETAILED_CATALOG.length,
    19,
    "A matriz detalhada deve contemplar todos os 19 módulos do catálogo canónico"
  );

  const allowedStatuses = [
    "disponivel",
    "configuravel",
    "integracao_externa",
    "validacao_hardware",
    "planeado",
  ];

  for (const mod of MODULES_DETAILED_CATALOG) {
    assert.ok(mod.code, "Módulo deve possuir código válido");
    assert.ok(mod.name, "Módulo deve possuir nome");
    assert.ok(mod.description, "Módulo deve possuir descrição");
    assert.ok(mod.dependencies, "Módulo deve explicitar suas dependências operacionais");
    assert.ok(
      allowedStatuses.includes(mod.status),
      `Módulo ${mod.code} deve ter um estado honesto válido, obteve: ${mod.status}`
    );
  }

  // Verificar módulos específicos com dependências externas e de hardware
  const biometrics = MODULES_DETAILED_CATALOG.find((m) => m.code === "BIOMETRICS");
  assert.ok(biometrics, "Módulo BIOMETRICS deve existir no catálogo");
  assert.equal(
    biometrics.status,
    "validacao_hardware",
    "BIOMETRICS deve estar honestamente classificado como em validação de hardware"
  );

  const integrations = MODULES_DETAILED_CATALOG.find((m) => m.code === "INTEGRATIONS");
  assert.ok(integrations, "Módulo INTEGRATIONS deve existir no catálogo");
  assert.equal(
    integrations.status,
    "integracao_externa",
    "INTEGRATIONS deve estar honestamente classificado como dependente de integração externa"
  );

  const reports = MODULES_DETAILED_CATALOG.find((m) => m.code === "REPORTS");
  assert.ok(reports, "Módulo REPORTS deve existir no catálogo");
  assert.equal(
    reports.status,
    "configuravel",
    "REPORTS deve estar classificado como configurável antes de submissão"
  );
});

test("Site Institucional: Ausência estrita de alegações comerciais, métricas e regulatórias proibidas", () => {
  const homeHtml = renderToString(
    React.createElement(HomePage, { apiUrl: "http://localhost:4000", onNavigate: () => {} })
  );
  const solutionsHtml = renderToString(React.createElement(SolutionsPage, { onNavigate: () => {} }));
  const modulesHtml = renderToString(React.createElement(ModulesPage, { onNavigate: () => {} }));
  const sobreHtml = renderToString(React.createElement(SobrePage, { onNavigate: () => {} }));
  const footerHtml = renderToString(React.createElement(SiteFooter, { onNavigate: () => {} }));

  const allContent = `${homeHtml} ${solutionsHtml} ${modulesHtml} ${sobreHtml} ${footerHtml}`.toLowerCase();

  const forbiddenTerms = [
    "100% concluído",
    "homologado pela agt",
    "certificado pela agt",
    "parceiro oficial emis",
    "faturação garantida",
    "falhas de internet ou energia",
    "<50ms",
    "50 milissegundos",
    "pgca",
    "8 subdiários canónicos",
    "subdiários canónicos",
    "plano geral de contabilidade",
    "conforme agt",
    "conforme o pgca",
    "matriz oficial",
    "schema xsd oficial",
    "tabela progressiva oficial",
    "3% trabalhador e 8% entidade patronal",
    "hardware homologado",
    "certificado oficial",
    "cumpre as especificações técnicas",
    "vendajá copilot ia",
    "vendaja copilot ia",
    "vendajá copilot",
    "vendaja copilot",
    "copilot ia",
  ];

  for (const term of forbiddenTerms) {
    assert.ok(!allContent.includes(term), `Conteúdo público não pode conter expressão proibida: "${term}"`);
  }
});

test("Site Institucional: Validação soberana da marca Muambuluisha IA e bloqueio de Copilot em conteúdo público", () => {
  const homeHtml = renderToString(React.createElement(HomePage, { apiUrl: "http://localhost:4000", onNavigate: () => {} }));
  const solutionsHtml = renderToString(React.createElement(SolutionsPage, { onNavigate: () => {} }));
  const modulesHtml = renderToString(React.createElement(ModulesPage, { onNavigate: () => {} }));

  // 1. Confirmação inequívoca de Muambuluisha IA nas páginas públicas
  assert.ok(homeHtml.includes("Muambuluisha IA"), "HomePage deve apresentar Muambuluisha IA");
  assert.ok(solutionsHtml.includes("Muambuluisha IA"), "SolutionsPage deve apresentar Muambuluisha IA");
  assert.ok(modulesHtml.includes("Muambuluisha IA"), "ModulesPage deve apresentar Muambuluisha IA");

  // 2. Bloqueio estrito de referências públicas à marca antiga Copilot
  const combined = `${homeHtml} ${solutionsHtml} ${modulesHtml}`.toLowerCase();
  assert.ok(!combined.includes("vendajá copilot"), "Conteúdo público não pode conter 'VendaJá Copilot'");
  assert.ok(!combined.includes("vendaja copilot"), "Conteúdo público não pode conter 'vendaja copilot'");
  assert.ok(!combined.includes("copilot ia"), "Conteúdo público não pode conter 'copilot ia'");
});

test("Site Institucional: Header e Footer - Navegação e links válidos", () => {
  let navigatedTo = "";
  const mockNavigate = (view: string) => {
    navigatedTo = view;
  };

  const headerHtml = renderToString(
    React.createElement(SiteHeader, { currentView: "home", onNavigate: mockNavigate })
  );
  assert.ok(headerHtml.includes("site-brand"), "Header deve conter elemento de marca");
  assert.ok(headerHtml.includes("btn-enter-erp"), "Header deve conter botão de entrada no ERP");

  const footerHtml = renderToString(React.createElement(SiteFooter, { onNavigate: mockNavigate }));
  assert.ok(footerHtml.includes("Versão 3.2.2-rc.3"), "Footer deve indicar a versão 3.2.2-rc.3");
  assert.ok(footerHtml.includes(MANDATORY_REGULATORY_STATEMENT), "Footer deve conter a declaração obrigatória da AGT");
});
