export type AppModule =
  | "DASHBOARD"
  | "POS"
  | "STOCK"
  | "PURCHASES"
  | "TREASURY"
  | "ACCOUNTING"
  | "HR"
  | "CRM"
  | "DOCUMENTS"
  | "BI"
  | "REPORTS"
  | "AUTOMATION"
  | "GOVERNANCE"
  | "INTEGRATIONS"
  | "CLOUD"
  | "AI"
  | "BIOMETRICS"
  | "SETTINGS";

export type CommercialPlan = "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE" | "CUSTOM";

export interface PlanDefinition {
  name: string;
  badge: string;
  target: string;
  description: string;
  modules: AppModule[];
}

export const PLAN_METADATA: Record<CommercialPlan, PlanDefinition> = {
  STARTER: {
    name: "Starter",
    badge: "Plano Starter",
    target: "Pequenos Negócios e Retalho Rápido",
    description: "Faturação POS, Catálogo de Produtos, Stocks Básicos, Relatórios de Vendas e Dashboard Offline.",
    modules: ["DASHBOARD", "POS", "STOCK", "REPORTS", "SETTINGS"],
  },
  PROFESSIONAL: {
    name: "Professional",
    badge: "Plano Professional",
    target: "Médias Empresas Comerciais",
    description: "Tudo do Starter mais Gestão de Compras & Fornecedores e Tesouraria & Fluxo de Caixa.",
    modules: ["DASHBOARD", "POS", "STOCK", "REPORTS", "SETTINGS", "PURCHASES", "TREASURY"],
  },
  BUSINESS: {
    name: "Business",
    badge: "Plano Business",
    target: "Empresas em Crescimento Estruturado",
    description: "Tudo do Professional mais Recursos Humanos (Salários/Processamento), CRM Comercial e Gestão Documental (GED).",
    modules: [
      "DASHBOARD",
      "POS",
      "STOCK",
      "REPORTS",
      "SETTINGS",
      "PURCHASES",
      "TREASURY",
      "HR",
      "CRM",
      "DOCUMENTS",
    ],
  },
  ENTERPRISE: {
    name: "Enterprise",
    badge: "Plano Enterprise Suite",
    target: "Grandes Empresas, Indústrias e Grupos Corporativos",
    description: "Suite completa sem limites: Contabilidade Geral (PGCA), Business Intelligence Executivo, Workflows & Automações, Governança & Auditoria, APIs/Webhooks e Sincronização Cloud Multi-Lojas.",
    modules: [
      "DASHBOARD",
      "POS",
      "STOCK",
      "REPORTS",
      "SETTINGS",
      "PURCHASES",
      "TREASURY",
      "HR",
      "CRM",
      "DOCUMENTS",
      "ACCOUNTING",
      "BI",
      "AUTOMATION",
      "GOVERNANCE",
      "INTEGRATIONS",
      "CLOUD",
      "AI",
      "BIOMETRICS",
    ],
  },
  CUSTOM: {
    name: "Personalizado (Custom)",
    badge: "Plano Custom",
    target: "Solução Sob Medida",
    description: "Configuração sob medida de módulos específicos acordada em contrato comercial.",
    modules: [],
  },
};

export interface ModuleInfo {
  code: AppModule;
  name: string;
  category: string;
  icon: string;
  description: string;
  minimumPlan: CommercialPlan;
}

export const MODULE_CATALOG: ModuleInfo[] = [
  {
    code: "DASHBOARD",
    name: "Dashboard Executivo",
    category: "Visão Geral",
    icon: "📊",
    description: "Métricas de faturação em tempo real, KPIs de vendas, margens e gráficos analíticos offline.",
    minimumPlan: "STARTER",
  },
  {
    code: "POS",
    name: "Balcão POS & Vendas",
    category: "Vendas & POS",
    icon: "🛒",
    description: "Emissão de Faturas/Recibo (FR), Faturas Proforma (FP), leitura ótica de códigos e turnos de caixa.",
    minimumPlan: "STARTER",
  },
  {
    code: "STOCK",
    name: "Catálogo & Stocks",
    category: "Stocks & Armazém",
    icon: "📦",
    description: "Gestão de artigos, preços, taxas de IVA, controlo de armazém e guias de transporte (GT/GR).",
    minimumPlan: "STARTER",
  },
  {
    code: "REPORTS",
    name: "Relatórios & SAF-T AO",
    category: "Relatórios",
    icon: "📜",
    description: "Exportação SAF-T AO auditado pela AGT, mapas de faturação periódica e extratos fiscais.",
    minimumPlan: "STARTER",
  },
  {
    code: "SETTINGS",
    name: "Definições do Sistema",
    category: "Configuração",
    icon: "⚙️",
    description: "Configuração de impressoras térmicas (58mm/80mm), parâmetros fiscais da empresa e hardware.",
    minimumPlan: "STARTER",
  },
  {
    code: "PURCHASES",
    name: "Compras & Fornecedores",
    category: "Compras",
    icon: "🚚",
    description: "Gestão de fornecedores, ordens de compra, receção de mercadorias e custos de aquisição.",
    minimumPlan: "PROFESSIONAL",
  },
  {
    code: "TREASURY",
    name: "Tesouraria & Finanças",
    category: "Financeiro",
    icon: "💰",
    description: "Contas bancárias, conciliação, mapa de fluxo de caixa operacional, pagamentos e recebimentos.",
    minimumPlan: "PROFESSIONAL",
  },
  {
    code: "HR",
    name: "Recursos Humanos",
    category: "Recursos Humanos",
    icon: "👥",
    description: "Cadastro de colaboradores, folha de pagamento, cálculo de IRT e Segurança Social (INSS).",
    minimumPlan: "BUSINESS",
  },
  {
    code: "CRM",
    name: "CRM & Pipeline de Vendas",
    category: "Vendas & POS",
    icon: "🎯",
    description: "Pipeline comercial, leads, propostas, fidelização de clientes e limites de crédito.",
    minimumPlan: "BUSINESS",
  },
  {
    code: "DOCUMENTS",
    name: "Gestão Documental (GED)",
    category: "Configuração",
    icon: "📁",
    description: "Arquivo digital de contratos, comprovativos fiscais, guias e certidões com pesquisa rápida.",
    minimumPlan: "BUSINESS",
  },
  {
    code: "ACCOUNTING",
    name: "Contabilidade Geral (PGCA)",
    category: "Financeiro",
    icon: "📑",
    description: "Plano Geral de Contabilidade de Angola (PGCA), lançamentos a dobrar, balancetes e balanço.",
    minimumPlan: "ENTERPRISE",
  },
  {
    code: "BI",
    name: "Business Intelligence & BI",
    category: "Relatórios",
    icon: "📈",
    description: "Dashboards analíticos avançados, modelos preditivos, curvas ABC de margem e projeções de faturação.",
    minimumPlan: "ENTERPRISE",
  },
  {
    code: "AUTOMATION",
    name: "Workflows & Automação",
    category: "Configuração",
    icon: "⚡",
    description: "Motor de regras automáticas, alertas de stock mínimo, disparo de notificações e triggers de processos.",
    minimumPlan: "ENTERPRISE",
  },
  {
    code: "GOVERNANCE",
    name: "Segurança & Governança",
    category: "Configuração",
    icon: "🛡️",
    description: "Trilhas de auditoria imutáveis, controlo de integridade criptográfica, conformidade LGPD e acessos.",
    minimumPlan: "ENTERPRISE",
  },
  {
    code: "INTEGRATIONS",
    name: "Integrações & API REST",
    category: "Configuração",
    icon: "🔌",
    description: "Webhooks em tempo real, chave de API para ligação a e-commerce, ERPs de terceiros e bancos.",
    minimumPlan: "ENTERPRISE",
  },
  {
    code: "CLOUD",
    name: "Cloud SaaS & Multi-Lojas",
    category: "Configuração",
    icon: "☁️",
    description: "Gestão centralizada de múltiplas lojas e filiais, sincronização de bases de dados distribuídas e SaaS.",
    minimumPlan: "ENTERPRISE",
  },
  {
    code: "AI",
    name: "VendaJá Copilot (IA)",
    category: "Inteligência Artificial",
    icon: "🤖",
    description: "Assistente empresarial inteligente com consultas em linguagem natural, previsões preditivas e deteção de anomalias.",
    minimumPlan: "ENTERPRISE",
  },
  {
    code: "BIOMETRICS",
    name: "Biometria & Acessos",
    category: "Segurança & Acessos",
    icon: "👁️",
    description: "Controlo inteligente de acessos com Reconhecimento Facial, Digitais, RFID, QR Code, torniquetes e assiduidade.",
    minimumPlan: "ENTERPRISE",
  },
];

export const PRODUCT_CORE_MODULES: AppModule[] = ["SETTINGS"];

export const OPERATIONAL_MODULES: AppModule[] = [
  "DASHBOARD",
  "POS",
  "STOCK",
  "PURCHASES",
  "TREASURY",
  "ACCOUNTING",
  "HR",
  "CRM",
  "DOCUMENTS",
  "BI",
  "REPORTS",
  "AUTOMATION",
  "GOVERNANCE",
  "INTEGRATIONS",
  "CLOUD",
  "AI",
  "BIOMETRICS",
];

export const isOperationalModule = (module: AppModule): boolean => {
  return module !== "SETTINGS";
};

export const defaultLicensedModules: AppModule[] = [
  "SETTINGS",
];

export const isDemoMode = (): boolean => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem("vendaja-demo-mode") === "true";
    }
  } catch {
    // ignore
  }
  return false;
};

export const normalizeRole = (role: string): string => {
  const value = (role || "").toUpperCase();
  if (value === "ADMIN") return "ROLE_ADMIN";
  if (value === "OPERATOR" || value === "CASHIER") return "ROLE_CASHIER";
  if (value === "HR") return "ROLE_HR";
  if (value === "ACCOUNTANT" || value === "ACCOUNTING") return "ROLE_ACCOUNTANT";
  return value.startsWith("ROLE_") ? value : `ROLE_${value}`;
};

export const roleModules: Record<string, AppModule[]> = {
  ROLE_ADMIN: [
    "DASHBOARD",
    "POS",
    "STOCK",
    "PURCHASES",
    "TREASURY",
    "ACCOUNTING",
    "HR",
    "CRM",
    "DOCUMENTS",
    "BI",
    "REPORTS",
    "AUTOMATION",
    "GOVERNANCE",
    "INTEGRATIONS",
    "CLOUD",
    "AI",
    "BIOMETRICS",
    "SETTINGS",
  ],
  ROLE_CASHIER: ["POS", "DASHBOARD"],
  ROLE_HR: ["HR", "DASHBOARD"],
  ROLE_ACCOUNTANT: ["ACCOUNTING", "DASHBOARD"],
};

export const normalizeModuleCode = (code: string): AppModule | null => {
  const upper = code.trim().toUpperCase();
  if (upper === "POS" || upper === "PDV" || upper === "CASH" || upper === "VENDAS") return "POS";
  if (upper === "STOCK" || upper === "PRODUCTS" || upper === "INVENTORY" || upper === "CATALOG") return "STOCK";
  if (upper === "PURCHASES" || upper === "COMPRAS" || upper === "OPERATIONS" || upper === "FORNECEDORES") return "PURCHASES";
  if (upper === "TREASURY" || upper === "TESOURARIA" || upper === "CASHFLOW" || upper === "FINANCIAL" || upper === "FINANCAS") return "TREASURY";
  if (upper === "SETTINGS" || upper === "FISCAL" || upper === "DEVICES" || upper === "PLATFORM" || upper === "LOGS" || upper === "HARDWARE" || upper === "LICENSE") return "SETTINGS";
  if (upper === "HR" || upper === "RH" || upper === "SALARIOS" || upper === "RECURSOSHUMANOS") return "HR";
  if (upper === "CRM" || upper === "PIPELINE" || upper === "CLIENTES" || upper === "LEADS") return "CRM";
  if (upper === "DOCUMENTS" || upper === "DOCUMENTOS" || upper === "GED") return "DOCUMENTS";
  if (upper === "ACCOUNTING" || upper === "CONTABILIDADE" || upper === "PGCA") return "ACCOUNTING";
  if (upper === "DASHBOARD" || upper === "PAINEL") return "DASHBOARD";
  if (upper === "REPORTS" || upper === "RELATORIOS" || upper === "SAFT" || upper === "SAF-T") return "REPORTS";
  if (upper === "BI" || upper === "ANALYTICS" || upper === "BUSINESS_INTELLIGENCE") return "BI";
  if (upper === "AUTOMATION" || upper === "AUTOMAÇÃO" || upper === "WORKFLOWS") return "AUTOMATION";
  if (upper === "GOVERNANCE" || upper === "GOVERNANCA" || upper === "AUDIT" || upper === "SECURITY") return "GOVERNANCE";
  if (upper === "INTEGRATIONS" || upper === "INTEGRACOES" || upper === "API" || upper === "WEBHOOKS") return "INTEGRATIONS";
  if (upper === "CLOUD" || upper === "SAAS" || upper === "MULTILOJAS" || upper === "MULTILOJA") return "CLOUD";
  if (upper === "AI" || upper === "COPILOT" || upper === "IA" || upper === "ASSISTANT") return "AI";
  if (upper === "BIOMETRICS" || upper === "BIOMETRIA" || upper === "ACCESS_CONTROL" || upper === "ACESSOS" || upper === "ACCESS") return "BIOMETRICS";
  return null;
};

export function isModuleLicensed(module: AppModule, licensedModules: AppModule[]): boolean {
  if (module === "SETTINGS") return true; // Settings core (license, config, printer) must always be operational
  return licensedModules.includes(module);
}

export async function credentialHash(value: string): Promise<string> {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
