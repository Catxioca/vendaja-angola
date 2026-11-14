import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { HomePage } from "./HomePage.js";
import { SolutionsPage } from "./SolutionsPage.js";
import { ModulesPage } from "./ModulesPage.js";
import { SobrePage } from "./SobrePage.js";
import { SecurityPage } from "./SecurityPage.js";
import { FiscalCompliancePage } from "./FiscalCompliancePage.js";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage.js";
import { TermsPage } from "./TermsPage.js";
import { ContactPage } from "./ContactPage.js";
import { SiteHeader } from "./SiteHeader.js";
import { SiteFooter } from "./SiteFooter.js";
import { PUBLIC_INDEXABLE_SEO_CATALOG } from "./seo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../..");

const MANDATORY_REGULATORY_STATEMENT =
  "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.";

test("Rebranding Audit: Páginas públicas exibem consistentemente a marca Mutshima", () => {
  const dummyNav = () => {};
  const renderedPages = [
    { name: "HomePage", html: renderToString(React.createElement(HomePage, { apiUrl: "http://localhost:4000", onNavigate: dummyNav })) },
    { name: "SolutionsPage", html: renderToString(React.createElement(SolutionsPage, { onNavigate: dummyNav })) },
    { name: "ModulesPage", html: renderToString(React.createElement(ModulesPage, { onNavigate: dummyNav })) },
    { name: "SobrePage", html: renderToString(React.createElement(SobrePage, { onNavigate: dummyNav })) },
    { name: "SecurityPage", html: renderToString(React.createElement(SecurityPage, { onNavigate: dummyNav })) },
    { name: "FiscalCompliancePage", html: renderToString(React.createElement(FiscalCompliancePage, { onNavigate: dummyNav })) },
    { name: "PrivacyPolicyPage", html: renderToString(React.createElement(PrivacyPolicyPage, { onNavigate: dummyNav })) },
    { name: "TermsPage", html: renderToString(React.createElement(TermsPage, { onNavigate: dummyNav })) },
    { name: "ContactPage", html: renderToString(React.createElement(ContactPage, { apiUrl: "http://localhost:4000", onNavigate: dummyNav })) },
    { name: "SiteHeader", html: renderToString(React.createElement(SiteHeader, { currentView: "home", onNavigate: dummyNav })) },
    { name: "SiteFooter", html: renderToString(React.createElement(SiteFooter, { onNavigate: dummyNav })) },
  ];

  for (const { name, html } of renderedPages) {
    assert.ok(
      html.includes("Mutshima"),
      `Componente público ${name} deve exibir explicitamente a nova marca 'Mutshima'`
    );
    // Deve bloquear a marca comercial legada visível
    assert.ok(
      !html.includes("VendaJá Angola"),
      `Componente público ${name} não pode conter texto visível 'VendaJá Angola'`
    );
  }
});

test("Rebranding Audit: Declaração regulamentar da AGT permanece intacta e factual", () => {
  const dummyNav = () => {};
  const homeHtml = renderToString(React.createElement(HomePage, { apiUrl: "http://localhost:4000", onNavigate: dummyNav }));
  const footerHtml = renderToString(React.createElement(SiteFooter, { onNavigate: dummyNav }));
  const fiscalHtml = renderToString(React.createElement(FiscalCompliancePage, { onNavigate: dummyNav }));

  assert.ok(homeHtml.includes(MANDATORY_REGULATORY_STATEMENT), "HomePage deve incluir declaração AGT obrigatória");
  assert.ok(footerHtml.includes(MANDATORY_REGULATORY_STATEMENT), "SiteFooter deve incluir declaração AGT obrigatória");
  assert.ok(fiscalHtml.includes(MANDATORY_REGULATORY_STATEMENT), "FiscalCompliancePage deve incluir declaração AGT obrigatória");
});

test("Rebranding Audit: Metadados PWA, Capacitor e Desktop refletem Mutshima mantendo identificadores técnicos", () => {
  // 1. Web Manifest
  const manifestPath = path.resolve(__dirname, "../../public/manifest.webmanifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.name, "Mutshima");
  assert.equal(manifest.short_name, "Mutshima");

  // 2. Capacitor Config
  const capacitorPath = path.resolve(rootDir, "capacitor.config.json");
  const capConfig = JSON.parse(fs.readFileSync(capacitorPath, "utf8"));
  assert.equal(capConfig.appName, "Mutshima");
  assert.equal(capConfig.appId, "ao.co.vendaja.erp", "appId Android deve ser preservado para integridade");

  // 3. Electron Builder Config
  const electronBuilderPath = path.resolve(rootDir, "electron-builder.yml");
  const electronBuilderContent = fs.readFileSync(electronBuilderPath, "utf8");
  assert.ok(electronBuilderContent.includes("productName: Mutshima"));
  assert.ok(electronBuilderContent.includes("appId: ao.commerce.desktop"), "appId Electron deve ser preservado");

  // 4. Desktop package.json
  const desktopPkgPath = path.resolve(rootDir, "apps/desktop/package.json");
  const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, "utf8"));
  assert.equal(desktopPkg.name, "@angola/desktop", "Nome do pacote de workspace deve ser preservado");
  assert.equal(desktopPkg.author, "Mutshima");
  assert.ok(desktopPkg.description.includes("Mutshima"));
});

test("Rebranding Audit: Catálogo SEO contém Mutshima em todas as rotas públicas", () => {
  for (const [route, meta] of Object.entries(PUBLIC_INDEXABLE_SEO_CATALOG)) {
    assert.ok(
      meta.title.includes("Mutshima"),
      `Título SEO da rota ${route} deve referenciar 'Mutshima', obteve: '${meta.title}'`
    );
  }
});
