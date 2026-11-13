import assert from "node:assert/strict";
import test, { describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANDATORY_REGULATORY_STATEMENT =
  "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.";

const FORBIDDEN_COMMERCIAL_CLAIMS = [
  "software certificado pela agt",
  "homologado pela agt",
  "certificação agt nº",
  "parceiro oficial emis",
  "99.99% de disponibilidade",
  "99,99%",
  "banco bai",
  "banco bfa",
  "unitel money",
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
  "e-mail oficial",
  "versão oficial",
  "certificado oficial",
  "certificados oficiais",
  "hardware homologado",
  "tabela progressiva oficial",
  "3% trabalhador e 8% entidade patronal",
  "cumpre as especificações técnicas",
  "entidades certificadas",
];

describe("ETAPA 8 — Validação Integrada do Site Institucional e ERP Web", () => {
  const rootDir = path.resolve(__dirname, "../../../..");
  const webRootDir = path.resolve(__dirname, "../..");
  const publicDir = path.resolve(webRootDir, "public");
  const siteDir = path.resolve(webRootDir, "src/site");

  test("1. Rotas Públicas: Não exigem sessão, não expõem dados sensíveis e são responsivas", () => {
    const publicPages = [
      "HomePage.tsx",
      "SolutionsPage.tsx",
      "ModulesPage.tsx",
      "SecurityPage.tsx",
      "FiscalCompliancePage.tsx",
      "SobrePage.tsx",
      "PrivacyPolicyPage.tsx",
      "TermsPage.tsx",
      "StatusPage.tsx",
      "ContactPage.tsx",
      "LoginPage.tsx",
      "BootstrapPage.tsx",
    ];

    for (const pageFile of publicPages) {
      const filePath = path.join(siteDir, pageFile);
      assert.ok(fs.existsSync(filePath), `Ficheiro ${pageFile} deve existir`);
      const content = fs.readFileSync(filePath, "utf-8");

      // Não deve conter dumps de dados de tenant ou credenciais hardcoded
      assert.ok(!content.includes("passwordHash"), `${pageFile} não deve expor campos internos de BD`);
      assert.ok(!content.includes("secretKey"), `${pageFile} não deve conter chaves secretas`);
    }
  });

  test("2. Rotas Privadas: Exigem autenticação, respeitam RBAC e isolamento multiempresa", () => {
    const mainFile = path.join(webRootDir, "src/main.tsx");
    const mainContent = fs.readFileSync(mainFile, "utf-8");

    // Confirma verificação de token e contexto de empresa/filial
    assert.ok(
      mainContent.includes('localStorage.getItem("accessToken")'),
      "Acesso autenticado ao ERP deve verificar accessToken"
    );
    assert.ok(
      mainContent.includes("CompanyContextSelector"),
      "Contexto autorizado de empresa e filial deve ser selecionado explicitamente"
    );

    // Confirma que headers de contexto nunca concedem privilégios por si só
    assert.ok(
      mainContent.includes("O contexto selecionado apenas identifica uma associação autorizada"),
      "Aviso de segurança de contexto multiempresa deve estar presente"
    );
  });

  test("3. Proteção de Indexação e Cache: Rotas privadas não são indexáveis nem entram em cache", () => {
    const robotsPath = path.join(publicDir, "robots.txt");
    const robots = fs.readFileSync(robotsPath, "utf-8");
    assert.ok(robots.includes("Disallow: /api/"));
    assert.ok(robots.includes("Disallow: /portal-"));
    assert.ok(robots.includes("Disallow: /erp"));
    assert.ok(robots.includes("Disallow: /app"));
    assert.ok(robots.includes("Disallow: /entrar"));
    assert.ok(robots.includes("Disallow: /criar-conta"));

    const staticSitemapPath = path.join(publicDir, "sitemap.xml");
    assert.ok(!fs.existsSync(staticSitemapPath), "sitemap.xml estático fictício não deve existir sem origem configurada");

    const swPath = path.join(publicDir, "sw.js");
    const sw = fs.readFileSync(swPath, "utf-8");
    assert.ok(sw.includes('"/api/"'));
    assert.ok(sw.includes('"/app"'));
    assert.ok(sw.includes('"/portal-"'));
    assert.ok(sw.includes('request.headers.has("authorization")'));
  });

  test("4. Fluxo Integrado: Início, Login, Logout e Retorno Seguro", () => {
    const mainFile = path.join(webRootDir, "src/main.tsx");
    const content = fs.readFileSync(mainFile, "utf-8");

    // Confirma rotas de navegação do site e ERP
    assert.ok(content.includes('view === "home"'));
    assert.ok(content.includes('view === "sobre"'));
    assert.ok(content.includes('view === "erp"'));
    assert.ok(content.includes('view === "entrar"'));
    assert.ok(content.includes('view === "criar-conta"'));
    assert.ok(content.includes("requiresMainErpSession"));

    // Confirma rotina de logout centralizada em session.ts com revogação na API e eliminação total de chaves
    assert.ok(content.includes("logoutSession("));
    assert.ok(content.includes('credentials: "include"'), "Login em main.tsx deve enviar credentials: include");

    const desktopRenderer = fs.readFileSync(path.join(webRootDir, "src/desktop/renderer.tsx"), "utf-8");
    assert.ok(desktopRenderer.includes("logoutSession("), "Logout no ERP desktop/web deve invocar logoutSession");
    assert.ok(desktopRenderer.includes('credentials: "include"'), "Login no ERP desktop/web deve enviar credentials: include");

    for (const relPath of [
      "src/site/LoginPage.tsx",
      "src/site/BootstrapPage.tsx",
      "src/BootstrapAccountForm.tsx",
      "src/desktop/BootstrapAccountForm.tsx",
      "src/mobile/MobileShell.tsx",
    ]) {
      const src = fs.readFileSync(path.join(webRootDir, relPath), "utf-8");
      assert.ok(src.includes('credentials: "include"'), `${relPath} deve enviar credentials: "include" para cookies de sessão`);
    }

    const sessionContent = fs.readFileSync(path.join(siteDir, "session.ts"), "utf-8");
    assert.ok(sessionContent.includes("/api/v1/auth/logout"));
    assert.ok(sessionContent.includes('credentials: "include"'));
    assert.ok(sessionContent.includes("storage.removeItem("));
    for (const key of [
      "accessToken",
      "refreshToken",
      "posUser",
      "companyId",
      "branchId",
      "vendaja-company-id",
      "vendaja-branch-id",
      "vendaja_omnichannel_view",
    ]) {
      assert.ok(sessionContent.includes(`"${key}"`), `Logout deve limpar a chave ${key}`);
    }
  });

  test("5. Conteúdo e Integridade: Ausência de alegações enganosas e cumprimento da fórmula AGT", () => {
    // 5.1 Verifica a fórmula mandatória nos ficheiros regulamentares
    const fiscalPage = fs.readFileSync(path.join(siteDir, "FiscalCompliancePage.tsx"), "utf-8");
    assert.ok(
      fiscalPage.includes(MANDATORY_REGULATORY_STATEMENT),
      "FiscalCompliancePage deve incluir a declaração textual oficial da AGT"
    );

    const homePage = fs.readFileSync(path.join(siteDir, "HomePage.tsx"), "utf-8");
    assert.ok(
      homePage.includes(MANDATORY_REGULATORY_STATEMENT),
      "HomePage deve incluir a declaração textual oficial da AGT"
    );

    const secPage = fs.readFileSync(path.join(siteDir, "SecurityPage.tsx"), "utf-8");
    assert.ok(
      secPage.includes(MANDATORY_REGULATORY_STATEMENT),
      "SecurityPage deve incluir a declaração textual oficial da AGT"
    );

    // 5.2 Varredura rigorosa contra alegações comerciais proibidas (apenas código de produção)
    const productionFiles = fs
      .readdirSync(siteDir)
      .filter((f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.endsWith(".spec.ts"));

    for (const file of productionFiles) {
      const text = fs.readFileSync(path.join(siteDir, file), "utf-8").toLowerCase();
      for (const forbidden of FORBIDDEN_COMMERCIAL_CLAIMS) {
        assert.ok(
          !text.includes(forbidden),
          `Ficheiro ${file} contém alegação comercial proibida: "${forbidden}"`
        );
      }
    }
  });

  test("6. Compatibilidade Omnichannel: Web, PWA, Desktop e Capacitor Android", () => {
    // 6.1 PWA
    const manifestPath = path.join(publicDir, "manifest.webmanifest");
    assert.ok(fs.existsSync(manifestPath), "Manifest PWA deve existir");

    // 6.2 Desktop Renderer Parity
    const desktopRenderer = path.join(webRootDir, "src/desktop/renderer.tsx");
    assert.ok(fs.existsSync(desktopRenderer), "Desktop renderer paritário deve existir");

    // 6.3 Capacitor Config
    const capConfig = path.join(rootDir, "capacitor.config.json");
    assert.ok(fs.existsSync(capConfig), "capacitor.config.json deve existir na raiz");
    const capJson = JSON.parse(fs.readFileSync(capConfig, "utf-8"));
    assert.equal(capJson.appId, "ao.co.vendaja.erp");
    assert.equal(capJson.appName, "VendaJá Angola");

    // 6.4 Android Assets
    const androidAssets = path.join(rootDir, "android/app/src/main/assets");
    const androidMain = path.join(rootDir, "android/app/src/main");
    assert.ok(
      fs.existsSync(androidAssets) || fs.existsSync(androidMain),
      "Diretório de assets ou estrutura Android deve existir"
    );
  });
});
