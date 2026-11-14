import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

// Helper to replace text in file
function updateFile(relPath, replacerFn) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${relPath}`);
    return false;
  }
  const original = fs.readFileSync(fullPath, "utf8");
  const updated = replacerFn(original);
  if (original !== updated) {
    fs.writeFileSync(fullPath, updated, "utf8");
    console.log(`Updated: ${relPath}`);
    return true;
  }
  return false;
}

console.log("=== INICIANDO REBRANDING: VendaJá Angola -> Mutshima ===");

// 1. Desktop package.json & electron-builder
updateFile("apps/desktop/package.json", (s) =>
  s.replace(
    /"description":\s*"VendaJá Angola offline-first POS desktop application"/g,
    '"description": "Mutshima offline-first POS desktop application"'
  ).replace(
    /"author":\s*"VendaJá Angola"/g,
    '"author": "Mutshima"'
  )
);

updateFile("electron-builder.yml", (s) =>
  s.replace(/productName:\s*VendaJá Angola/g, "productName: Mutshima")
);

// 2. Desktop index.html & main.ts
updateFile("apps/desktop/index.html", (s) =>
  s.replace(/<title>VendaJá Angola<\/title>/g, "<title>Mutshima</title>")
);

updateFile("apps/desktop/src/main.ts", (s) => {
  return s
    .replace(/const win = new BrowserWindow\(\{ width: 1200, height: 800,/g, 'const win = new BrowserWindow({ width: 1200, height: 800, title: "Mutshima",')
    .replace(/path\.join\(process\.env\.ProgramData \|\| "C:\\\\ProgramData", "VendaJa", "machine-id"\)/g, 'path.join(process.env.ProgramData || "C:\\\\ProgramData", "Mutshima", "machine-id")')
    .replace(/path\.join\("\/var\/lib\/vendaja", "machine-id"\)/g, 'path.join("/var/lib/mutshima", "machine-id")');
});

// 3. Desktop UI components
updateFile("apps/desktop/src/renderer.tsx", (s) => {
  return s
    .replace(/<div className="brand-mark">V<span>J<\/span><\/div>/g, '<div className="brand-mark">M</div>')
    .replace(/<h1>VendaJá <span>Angola<\/span><\/h1>/g, '<h1>Mutshima</h1>')
    .replace(/"Entrar na VendaJá"/g, '"Entrar no Mutshima"')
    .replace(/<header className="main-header">[\s\S]*?<div className="brand-mark">V<span>J<\/span><\/div>/g, (m) => m.replace('V<span>J</span>', 'M'))
    .replace(/<h1>VendaJá<\/h1>/g, '<h1>Mutshima</h1>');
});

updateFile("apps/desktop/src/copilot-panel.tsx", (s) => {
  return s
    .replace(/Muambuluisha IA — Assistente inteligente do VendaJá Angola/g, "Muambuluisha IA — Assistente inteligente do Mutshima")
    .replace(/ERP VendaJá Angola/g, "ERP Mutshima");
});

updateFile("apps/desktop/src/corporate-panel.tsx", (s) => {
  return s
    .replace(/Topologia da Rede Corporativa VendaJá Angola/g, "Topologia da Rede Corporativa Mutshima")
    .replace(/carlos\.silva@vendaja\.ao/g, "carlos.silva@mutshima.ao");
});

updateFile("apps/desktop/src/bi-analytics-panel.tsx", (s) => {
  return s
    .replace(/Grupo Empresarial VendaJá Angola, SA/g, "Grupo Empresarial Mutshima, SA")
    .replace(/VendaJá Angola Sede \(Luanda\)/g, "Mutshima Sede (Luanda)")
    .replace(/VendaJá Distribuição Benguela Lda/g, "Mutshima Distribuição Benguela Lda")
    .replace(/VendaJá Logística Huambo Lda/g, "Mutshima Logística Huambo Lda")
    .replace(/VendaJa_BI\.pbids/g, "Mutshima_BI.pbids");
});

updateFile("apps/desktop/src/panels.tsx", (s) => {
  return s
    .replace(/Licenças VendaJá Enterprise Terminal/g, "Licenças Mutshima Enterprise Terminal")
    .replace(/Contrato_VendaJa_Sonangol_2026\.pdf/g, "Contrato_Mutshima_Sonangol_2026.pdf")
    .replace(/Dossie_Tecnico_Homologacao_VendaJa\.pdf/g, "Dossie_Tecnico_Homologacao_Mutshima.pdf")
    .replace(/author:\s*"VendaJá Labs"/g, 'author: "Mutshima Labs"')
    .replace(/author:\s*"EMIS \/ VendaJá"/g, 'author: "EMIS / Mutshima"')
    .replace(/system:\s*"VendaJá Angola ERP"/g, 'system: "Mutshima ERP"')
    .replace(/VendaJá_\$\{biDataset\.toUpperCase\(\)\}_Analytics/g, 'Mutshima_${biDataset.toUpperCase()}_Analytics')
    .replace(/Notificação VendaJá Angola/g, "Notificação Mutshima")
    .replace(/Sua Fatura\/Recibo VendaJá n\.º/g, "Sua Fatura/Recibo Mutshima n.º")
    .replace(/SDK Oficial VendaJá para Desenvolvedores/g, "SDK Oficial Mutshima para Desenvolvedores")
    .replace(/import \{ VendaJaClient \} from "@angola\/sdk";/g, 'import { MutshimaClient } from "@angola/sdk";')
    .replace(/const client = new VendaJaClient\(\{/g, "const client = new MutshimaClient({");
});

updateFile("apps/desktop/src/resilient-api-client.ts", (s) => {
  return s.replace(/Verifique se o serviço VendaJá Backend está em execução\./g, "Verifique se o serviço Mutshima Backend está em execução.");
});

updateFile("apps/desktop/src/resilient-api-client.spec.ts", (s) => {
  return s.replace(/Verifique se o serviço VendaJá Backend/g, "Verifique se o serviço Mutshima Backend");
});

updateFile("apps/desktop/src/corporate-headquarters.spec.ts", (s) => {
  return s
    .replace(/publisher:\s*"VendaJá Enterprise PKI Authority"/g, 'publisher: "Mutshima Enterprise PKI Authority"')
    .replace(/publisher:\s*"VendaJá"/g, 'publisher: "Mutshima"');
});

updateFile("apps/desktop/src/document-renderer.tsx", (s) => {
  return s
    .replace(/software de faturação VendaJá Angola · www\.vendaja\.ao/g, "software de faturação Mutshima · mutshima.ao")
    .replace(/software de gestão empresarial VendaJá Angola Enterprise/g, "software de gestão empresarial Mutshima Enterprise");
});

updateFile("apps/desktop/src/print-templates.ts", (s) => {
  return s
    .replace(/\|\| "VendaJá Angola"/g, '|| "Mutshima"')
    .replace(/\|\| "VendaJá Angola Enterprise"/g, '|| "Mutshima Enterprise"')
    .replace(/software de gestão empresarial VendaJá Angola Enterprise/g, "software de gestão empresarial Mutshima Enterprise");
});

updateFile("apps/desktop/src/offline-dashboard.ts", (s) => {
  return s.replace(/VendaJá Angola Enterprise · Preparado tecnicamente/g, "Mutshima Enterprise · Preparado tecnicamente");
});

updateFile("apps/desktop/src/saas-cloud-panel.tsx", (s) => {
  return s.replace(/00112 \(VendaJá Cloud SA\)/g, "00112 (Mutshima Cloud SA)");
});

updateFile("apps/desktop/src/local-governance-engine.ts", (s) => {
  return s
    .replace(/browser:\s*"VendaJá Desktop App"/g, 'browser: "Mutshima Desktop App"')
    .replace(/source:\s*"VendaJá Desktop Local Database"/g, 'source: "Mutshima Desktop Local Database"');
});

updateFile("apps/desktop/src/local-copilot-engine.ts", (s) => {
  return s
    .replace(/Assistente inteligente do VendaJá Angola/g, "Assistente inteligente do Mutshima")
    .replace(/servidor central VendaJá Backend/g, "servidor central Mutshima Backend");
});

// 4. Web mirrors of desktop files
const webDesktopFiles = [
  "apps/web/src/desktop/renderer.tsx",
  "apps/web/src/desktop/copilot-panel.tsx",
  "apps/web/src/desktop/corporate-panel.tsx",
  "apps/web/src/desktop/bi-analytics-panel.tsx",
  "apps/web/src/desktop/panels.tsx",
  "apps/web/src/desktop/resilient-api-client.ts",
  "apps/web/src/desktop/corporate-headquarters.spec.ts",
  "apps/web/src/desktop/document-renderer.tsx",
  "apps/web/src/desktop/print-templates.ts",
  "apps/web/src/desktop/offline-dashboard.ts",
  "apps/web/src/desktop/saas-cloud-panel.tsx",
  "apps/web/src/desktop/local-governance-engine.ts",
  "apps/web/src/desktop/local-copilot-engine.ts",
];

for (const f of webDesktopFiles) {
  const desktopSrc = f.replace("apps/web/src/desktop/", "apps/desktop/src/");
  if (fs.existsSync(path.join(rootDir, desktopSrc))) {
    updateFile(f, () => fs.readFileSync(path.join(rootDir, desktopSrc), "utf8"));
  }
}

// 5. Web index.html & manifest & capacitor config
updateFile("apps/web/index.html", (s) => {
  return s
    .replace(/content="VendaJá Angola"/g, 'content="Mutshima"')
    .replace(/content="VendaJá Angola — Software de Gestão Comercial e ERP Soberano"/g, 'content="Mutshima — Software de Gestão Comercial e ERP Soberano"')
    .replace(/<title>VendaJá Angola — Software de Gestão Comercial e ERP Soberano<\/title>/g, "<title>Mutshima — Software de Gestão Comercial e ERP Soberano</title>");
});

updateFile("apps/web/public/manifest.webmanifest", (s) => {
  return s
    .replace(/"name":\s*"VendaJá Angola"/g, '"name": "Mutshima"')
    .replace(/"short_name":\s*"VendaJá"/g, '"short_name": "Mutshima"');
});

updateFile("capacitor.config.json", (s) => {
  return s.replace(/"appName":\s*"VendaJá Angola"/g, '"appName": "Mutshima"');
});

// 6. Web main.tsx & portals & mobile
updateFile("apps/web/src/main.tsx", (s) => {
  return s
    .replace(/<h1>VendaJá Angola<\/h1>/g, "<h1>Mutshima</h1>")
    .replace(/<b>VendaJá Angola<\/b>/g, "<b>Mutshima</b>")
    .replace(/🇦🇴 VendaJá Omnichannel Suite/g, "🇦🇴 Mutshima Omnichannel Suite")
    .replace(/title="Voltar ao Site Institucional VendaJá Angola"/g, 'title="Voltar ao Site Institucional Mutshima"');
});

updateFile("apps/web/src/EmployeePortal.tsx", (s) => {
  return s.replace(/Self-Service RH VendaJá/g, "Self-Service RH Mutshima");
});

updateFile("apps/web/src/SupplierPortal.tsx", (s) => {
  return s.replace(/Self-Service B2B VendaJá/g, "Self-Service B2B Mutshima");
});

updateFile("apps/web/src/mobile/MobileShell.tsx", (s) => {
  return s
    .replace(/VendaJá Angola Mobile/g, "Mutshima Mobile")
    .replace(/<h1 className="text-xl font-black mt-2 text-sky-400">VendaJá Angola<\/h1>/g, '<h1 className="text-xl font-black mt-2 text-sky-400">Mutshima</h1>');
});

updateFile("apps/web/src/mobile/printer-service.ts", (s) => {
  return s.replace(/VendaJá Angola • Preparado tecnicamente para processo de homologação/g, "Mutshima • Preparado tecnicamente para processo de homologação");
});

// 7. Site institucional
updateFile("apps/web/src/site/SiteHeader.tsx", (s) => {
  return s
    .replace(/aria-label="VendaJá Angola - Página Inicial"/g, 'aria-label="Mutshima - Página Inicial"')
    .replace(/<div className="site-logo-badge" aria-hidden="true">\s*V<span>J<\/span>\s*<\/div>/g, '<div className="site-logo-badge" aria-hidden="true">M</div>')
    .replace(/<h1>\s*VendaJá <span>Angola<\/span>\s*<\/h1>/g, "<h1>Mutshima</h1>");
});

updateFile("apps/web/src/site/SiteFooter.tsx", (s) => {
  return s
    .replace(/<h3>\s*VendaJá <span>Angola<\/span>\s*<\/h3>/g, "<h3>Mutshima</h3>")
    .replace(/label="Sobre o VendaJá Angola"/g, 'label="Sobre o Mutshima"')
    .replace(/© \{new Date\(\)\.getFullYear\(\)\} VendaJá Angola\./g, "© {new Date().getFullYear()} Mutshima.");
});

updateFile("apps/web/src/site/LoginPage.tsx", (s) => {
  return s.replace(/Aceder ao VendaJá Angola/g, "Aceder ao Mutshima");
});

updateFile("apps/web/src/site/HomePage.tsx", (s) => {
  return s.replace(/<strong>VendaJá Angola<\/strong>/g, "<strong>Mutshima</strong>");
});

updateFile("apps/web/src/site/SobrePage.tsx", (s) => {
  return s
    .replace(/<h1>Sobre o VendaJá Angola<\/h1>/g, "<h1>Sobre o Mutshima</h1>")
    .replace(/O VendaJá Angola é uma plataforma/g, "O Mutshima é uma plataforma");
});

updateFile("apps/web/src/site/SolutionsPage.tsx", (s) => {
  return s.replace(/reais do VendaJá Angola para/g, "reais do Mutshima para");
});

updateFile("apps/web/src/site/ModulesPage.tsx", (s) => {
  return s
    .replace(/Muambuluisha IA — Assistente inteligente do VendaJá Angola/g, "Muambuluisha IA — Assistente inteligente do Mutshima")
    .replace(/A VendaJá Angola apresenta métricas/g, "O Mutshima apresenta métricas")
    .replace(/mecanismos fiscais do VendaJá Angola/g, "mecanismos fiscais do Mutshima");
});

updateFile("apps/web/src/site/SecurityPage.tsx", (s) => {
  return s
    .replace(/sua empresa no VendaJá Angola\./g, "sua empresa no Mutshima.")
    .replace(/acessos no VendaJá Angola é/g, "acessos no Mutshima é")
    .replace(/instável, o VendaJá Angola implementa/g, "instável, o Mutshima implementa")
    .replace(/de segurança do VendaJá Angola:/g, "de segurança do Mutshima:");
});

updateFile("apps/web/src/site/FiscalCompliancePage.tsx", (s) => {
  return s.replace(/<strong>VendaJá Angola<\/strong>/g, "<strong>Mutshima</strong>");
});

updateFile("apps/web/src/site/PrivacyPolicyPage.tsx", (s) => {
  return s
    .replace(/salvaguardas operacionais no VendaJá Angola\./g, "salvaguardas operacionais no Mutshima.")
    .replace(/O VendaJá Angola opera como/g, "O Mutshima opera como");
});

updateFile("apps/web/src/site/TermsPage.tsx", (s) => {
  return s
    .replace(/garantia do software VendaJá Angola\./g, "garantia do software Mutshima.")
    .replace(/O VendaJá Angola disponibiliza/g, "O Mutshima disponibiliza");
});

updateFile("apps/web/src/site/ContactPage.tsx", (s) => {
  return s
    .replace(/Equipa do VendaJá Angola/g, "Equipa do Mutshima")
    .replace(/demonstração institucional do VendaJá Angola\./g, "demonstração institucional do Mutshima.");
});

updateFile("apps/web/src/site/BootstrapPage.tsx", (s) => {
  return s.replace(/instalação do <strong>VendaJá Angola<\/strong>/g, "instalação do <strong>Mutshima</strong>");
});

updateFile("apps/web/src/site/StatusPage.tsx", (s) => {
  return s.replace(/O VendaJá Angola não apresenta métricas/g, "O Mutshima não apresenta métricas");
});

updateFile("apps/web/src/site/seo.ts", (s) => {
  return s
    .replace(/VendaJá Angola — Software de Gestão Comercial e ERP Soberano/g, "Mutshima — Software de Gestão Comercial e ERP Soberano")
    .replace(/Soluções Empresariais — VendaJá Angola/g, "Soluções Empresariais — Mutshima")
    .replace(/Módulos & Matriz de Capacidades — VendaJá Angola/g, "Módulos & Matriz de Capacidades — Mutshima")
    .replace(/ecossistema VendaJá Angola/g, "ecossistema Mutshima")
    .replace(/Segurança, RBAC & Governação Soberana — VendaJá Angola/g, "Segurança, RBAC & Governação Soberana — Mutshima")
    .replace(/integridade no VendaJá Angola\./g, "integridade no Mutshima.")
    .replace(/Conformidade Fiscal & SAF-T Angola — VendaJá Angola/g, "Conformidade Fiscal & SAF-T Angola — Mutshima")
    .replace(/Sobre o VendaJá Angola — Engenharia e Visão Institucional/g, "Sobre o Mutshima — Engenharia e Visão Institucional")
    .replace(/princípios de transparência técnica do VendaJá Angola\./g, "princípios de transparência técnica do Mutshima.")
    .replace(/Contacto & Demonstração — VendaJá Angola/g, "Contacto & Demonstração — Mutshima")
    .replace(/comercial do VendaJá Angola/g, "comercial do Mutshima")
    .replace(/Estado dos Serviços & Conetividade — VendaJá Angola/g, "Estado dos Serviços & Conetividade — Mutshima")
    .replace(/serviços centrais do VendaJá Angola\./g, "serviços centrais do Mutshima.")
    .replace(/Política de Privacidade — VendaJá Angola/g, "Política de Privacidade — Mutshima")
    .replace(/Termos & Condições de Utilização — VendaJá Angola/g, "Termos & Condições de Utilização — Mutshima")
    .replace(/plataforma VendaJá Angola\./g, "plataforma Mutshima.")
    .replace(/Iniciar Sessão — VendaJá Angola/g, "Iniciar Sessão — Mutshima")
    .replace(/Criar Conta de Administrador — VendaJá Angola/g, "Criar Conta de Administrador — Mutshima")
    .replace(/sistema VendaJá Angola\./g, "sistema Mutshima.")
    .replace(/Área Autenticada — VendaJá Angola/g, "Área Autenticada — Mutshima")
    .replace(/multiempresa do VendaJá Angola\./g, "multiempresa do Mutshima.")
    .replace(/name:\s*"VendaJá Angola"/g, 'name: "Mutshima"');
});

// 8. Shared / SDK
updateFile("packages/shared/src/document-types.ts", (s) => {
  return s
    .replace(/name:\s*"VendaJá Angola Soluções Comerciais, Lda\."/g, 'name: "Mutshima Soluções Comerciais, Lda."')
    .replace(/tradeName:\s*"VendaJá Angola Enterprise"/g, 'tradeName: "Mutshima Enterprise"')
    .replace(/departureAddress:\s*"VendaJá Armazém 1 - Viana"/g, 'departureAddress: "Mutshima Armazém 1 - Viana"')
    .replace(/departureAddress:\s*"Armazém Central VendaJá - Viana, Km 14, Luanda"/g, 'departureAddress: "Armazém Central Mutshima - Viana, Km 14, Luanda"');
});

updateFile("packages/sdk/src/index.ts", (s) => {
  let updated = s;
  if (!updated.includes("export class MutshimaClient")) {
    updated = updated.replace(/export class VendaJaClient \{/g, "export class MutshimaClient {");
    updated = updated.replace(/export interface VendaJaClientConfig \{/g, "export interface MutshimaClientConfig {");
    updated = updated.replace(/export class VendaJaApiError extends Error \{/g, "export class MutshimaApiError extends Error {");
    updated = updated.replace(/this\.name = "VendaJaApiError";/g, 'this.name = "MutshimaApiError";');
    updated += `\n// Backward compatibility aliases\nexport { MutshimaClient as VendaJaClient };\nexport { MutshimaClientConfig as VendaJaClientConfig };\nexport { MutshimaApiError as VendaJaApiError };\n`;
  }
  return updated;
});

updateFile("packages/sdk/src/index.spec.ts", (s) => {
  return s
    .replace(/import \{ VendaJaClient, VendaJaApiError \} from "\.\/index\.js";/g, 'import { MutshimaClient, MutshimaApiError, VendaJaClient, VendaJaApiError } from "./index.js";')
    .replace(/describe\("VendaJá Enterprise Developer SDK"/g, 'describe("Mutshima Enterprise Developer SDK"')
    .replace(/new VendaJaClient\(\{/g, 'new MutshimaClient({')
    .replace(/VendaJaClient\.verifyWebhookSignature/g, 'MutshimaClient.verifyWebhookSignature')
    .replace(/new VendaJaApiError\(/g, 'new MutshimaApiError(')
    .replace(/error\.name, "VendaJaApiError"/g, 'error.name, "MutshimaApiError"');
});

// 9. Backend routes & services
updateFile("apps/backend/src/config/env.ts", (s) => {
  return s.replace(/'VendaJá Angola Lda'/g, "'Mutshima Lda'");
});

updateFile("apps/backend/src/middleware/auth.ts", (s) => {
  return s.replace(/emitida pela VendaJá\./g, "emitida pela Mutshima.");
});

updateFile("apps/backend/src/routes/business-intelligence.ts", (s) => {
  return s.replace(/filename="VendaJa_BI_\$\{companyId\}\.pbids"/g, 'filename="Mutshima_BI_${companyId}.pbids"');
});

updateFile("apps/backend/src/routes/integrations.ts", (s) => {
  return s
    .replace(/dataset:\s*"VendaJá_Sales_Analytics"/g, 'dataset: "Mutshima_Sales_Analytics"')
    .replace(/dataset:\s*"VendaJá_Purchases_Analytics"/g, 'dataset: "Mutshima_Purchases_Analytics"')
    .replace(/dataset:\s*"VendaJá_Inventory_Analytics"/g, 'dataset: "Mutshima_Inventory_Analytics"')
    .replace(/dataset:\s*"VendaJá_Cashflow_Analytics"/g, 'dataset: "Mutshima_Cashflow_Analytics"')
    .replace(/dataset:\s*"VendaJá_Payroll_Analytics"/g, 'dataset: "Mutshima_Payroll_Analytics"')
    .replace(/Notificação VendaJá Angola/g, "Notificação Mutshima");
});

updateFile("apps/backend/src/routes/license.ts", (s) => {
  return s
    .replace(/assinada pela VendaJá\./g, "assinada pela Mutshima.")
    .replace(/autoridade VendaJá/g, "autoridade Mutshima")
    .replace(/fornecedor oficial VendaJá\./g, "fornecedor oficial Mutshima.");
});

updateFile("apps/backend/src/routes/openapi.ts", (s) => {
  return s
    .replace(/title:\s*"VendaJá Angola — Enterprise API Gateway"/g, 'title: "Mutshima — Enterprise API Gateway"')
    .replace(/ecossistema ERP VendaJá Angola/g, "ecossistema ERP Mutshima")
    .replace(/name:\s*"VendaJá Angola Enterprise Support & Developer Portal"/g, 'name: "Mutshima Enterprise Support & Developer Portal"')
    .replace(/<title>VendaJá Angola — Enterprise API Documentation<\/title>/g, "<title>Mutshima — Enterprise API Documentation</title>")
    .replace(/<span>🇦🇴 VendaJá Angola ERP<\/span>/g, "<span>🇦🇴 Mutshima ERP</span>")
    .replace(/VendaJá Angola v5\.0/g, "Mutshima v5.0");
});

updateFile("apps/backend/src/services/enterprise/ai-copilot.service.ts", (s) => {
  return s.replace(/inteligente do VendaJá Angola\./g, "inteligente do Mutshima.");
});

updateFile("apps/backend/src/services/enterprise/audit.service.ts", (s) => {
  return s.replace(/browser = "VendaJá Desktop \(Electron\)";/g, 'browser = "Mutshima Desktop (Electron)";');
});

updateFile("apps/backend/src/services/security-governance.spec.ts", (s) => {
  return s.replace(/assert\.equal\(electronInfo\.browser, "VendaJá Desktop \(Electron\)"\);/g, 'assert.equal(electronInfo.browser, "Mutshima Desktop (Electron)");');
});

updateFile("apps/backend/src/services/enterprise/bi-consolidation.service.ts", (s) => {
  return s
    .replace(/name:\s*"VendaJá Angola Sede \(Luanda\)"/g, 'name: "Mutshima Sede (Luanda)"')
    .replace(/name:\s*"VendaJá Distribuição Benguela Lda"/g, 'name: "Mutshima Distribuição Benguela Lda"')
    .replace(/name:\s*"VendaJá Logística Huambo Lda"/g, 'name: "Mutshima Logística Huambo Lda"')
    .replace(/Grupo Empresarial VendaJá Angola, SA/g, "Grupo Empresarial Mutshima, SA")
    .replace(/\|\| "VendaJá Angola"/g, '|| "Mutshima"');
});

updateFile("apps/backend/src/services/enterprise/bi-powerbi.service.ts", (s) => {
  return s
    .replace(/modelName:\s*"VendaJa_Angola_Enterprise_SemanticModel"/g, 'modelName: "Mutshima_Enterprise_SemanticModel"')
    .replace(/Corporativo do VendaJá Angola para/g, "Corporativo do Mutshima para");
});

updateFile("apps/backend/src/services/enterprise/email.service.ts", (s) => {
  return s
    .replace(/VendaJá Angola — Fatura\/Recibo/g, "Mutshima — Fatura/Recibo")
    .replace(/<h2 style="color: #0d3764;">VendaJá Angola<\/h2>/g, '<h2 style="color: #0d3764;">Mutshima</h2>')
    .replace(/faturação VendaJá Angola ·/g, "faturação Mutshima ·")
    .replace(/Notificação do Sistema VendaJá/g, "Notificação do Sistema Mutshima")
    .replace(/emitido pelo ERP VendaJá\./g, "emitido pelo ERP Mutshima.");
});

updateFile("apps/backend/src/services/enterprise/mfa.service.ts", (s) => {
  return s.replace(/appName = "VendaJá Angola"/g, 'appName = "Mutshima"');
});

updateFile("apps/backend/src/services/enterprise/saas-subscription.service.ts", (s) => {
  return s
    .replace(/name:\s*"VendaJá Starter"/g, 'name: "Mutshima Starter"')
    .replace(/name:\s*"VendaJá Professional"/g, 'name: "Mutshima Professional"')
    .replace(/name:\s*"VendaJá Business"/g, 'name: "Mutshima Business"')
    .replace(/name:\s*"VendaJá Enterprise Cloud"/g, 'name: "Mutshima Enterprise Cloud"');
});

updateFile("apps/backend/src/services/enterprise/whatsapp.service.ts", (s) => {
  return s
    .replace(/pela VendaJá Angola com sucesso\./g, "pela Mutshima com sucesso.")
    .replace(/VendaJá Angola: Notificação/g, "Mutshima: Notificação");
});

updateFile("apps/backend/src/services/enterprise/crm.service.ts", (s) => {
  return s
    .replace(/com o VendaJá Angola Desktop/g, "com o Mutshima Desktop")
    .replace(/Proposta Comercial Solução VendaJá Enterprise/g, "Proposta Comercial Solução Mutshima Enterprise")
    .replace(/Licenciamento ERP VendaJá Angola/g, "Licenciamento ERP Mutshima");
});

updateFile("apps/backend/src/services/enterprise/multi-company.service.ts", (s) => {
  return s
    .replace(/VendaJá Holding, SA/g, "Mutshima Holding, SA")
    .replace(/VendaJá Distribuição & Retalho, Lda/g, "Mutshima Distribuição & Retalho, Lda")
    .replace(/VendaJá Logística e Transportes, Lda/g, "Mutshima Logística e Transportes, Lda");
});

updateFile("apps/backend/src/services/crm-documents.spec.ts", (s) => {
  return s
    .replace(/Contrato Anual Suporte VendaJá/g, "Contrato Anual Suporte Mutshima")
    .replace(/Módulo POS VendaJá Desktop/g, "Módulo POS Mutshima Desktop");
});

updateFile("apps/backend/src/services/contact-notification.service.ts", (s) => {
  return s.replace(/VendaJá Angola — Soberania/g, "Mutshima — Soberania");
});

// 10. Existing test files
updateFile("apps/web/src/site/site-content.spec.ts", (s) => {
  return s
    .replace(/assert\.ok\(html\.includes\("VendaJá"\), "HomePage deve conter a marca VendaJá"\);/g, 'assert.ok(html.includes("Mutshima"), "HomePage deve conter a marca Mutshima");')
    .replace(/label="Sobre o VendaJá Angola"/g, 'label="Sobre o Mutshima"');
});

updateFile("apps/web/src/site/site-seo-pwa.spec.ts", (s) => {
  return s
    .replace(/assert\.equal\(manifest\.name, "VendaJá Angola"\);/g, 'assert.equal(manifest.name, "Mutshima");')
    .replace(/assert\.equal\(manifest\.short_name, "VendaJá"\);/g, 'assert.equal(manifest.short_name, "Mutshima");');
});

updateFile("apps/web/src/site/site-integration-validation.spec.ts", (s) => {
  return s.replace(/assert\.equal\(capJson\.appName, "VendaJá Angola"\);/g, 'assert.equal(capJson.appName, "Mutshima");');
});

console.log("=== REBRANDING CONCLUÍDO COM SUCESSO ===");
