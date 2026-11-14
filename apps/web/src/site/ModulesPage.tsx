import React, { useState } from "react";

export type ModuleMaturity =
  | "disponivel"
  | "configuravel"
  | "integracao_externa"
  | "validacao_hardware"
  | "planeado";

export interface ModuleItem {
  code: string;
  name: string;
  category: "Vendas & POS" | "Gestão & Stock" | "Financeiro & Fiscal" | "Governação & Sistema";
  icon: string;
  status: ModuleMaturity;
  statusLabel: string;
  plan: "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
  description: string;
  dependencies: string;
}

export const MODULES_DETAILED_CATALOG: ModuleItem[] = [
  {
    code: "POS",
    name: "Balcão POS & Vendas",
    category: "Vendas & POS",
    icon: "🛒",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "STARTER",
    description: "Emissão de Faturas-Recibo (FR), Faturas Proforma (FP), leitura ótica de códigos de barras, turnos de caixa e modo dividido em tablet.",
    dependencies: "Operação física de gaveta e corte de papel dependem de impressora térmica ESC/POS compatível.",
  },
  {
    code: "STOCK",
    name: "Catálogo & Stocks",
    category: "Gestão & Stock",
    icon: "📦",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "STARTER",
    description: "Controlo de artigos, múltiplos armazéns, transferências inter-filiais com guias de remessa e inventário com Custo Médio Ponderado.",
    dependencies: "Operação local e sincronização central com reconciliação idempotente.",
  },
  {
    code: "REPORTS",
    name: "Relatórios & SAF-T AO",
    category: "Financeiro & Fiscal",
    icon: "📜",
    status: "configuravel",
    statusLabel: "Configurável",
    plan: "STARTER",
    description: "Estrutura configurável para geração XML SAF-T (AO), mapas de faturação periódica e resumos parametrizáveis de IVA.",
    dependencies: "Parametrizável por empresa; depende da fonte oficial vigente, schema XSD externo, validação profissional e aprovação formal da AGT.",
  },
  {
    code: "DASHBOARD",
    name: "Dashboard Executivo",
    category: "Gestão & Stock",
    icon: "📊",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "STARTER",
    description: "Visão consolidada de vendas, margens, produtos mais vendidos e alertas de stocks mínimos.",
    dependencies: "Opera localmente com dados de caixa e consolida em nuvem quando conectado.",
  },
  {
    code: "SETTINGS",
    name: "Definições do Sistema",
    category: "Governação & Sistema",
    icon: "⚙️",
    status: "configuravel",
    statusLabel: "Configurável",
    plan: "STARTER",
    description: "Configuração do identificador de terminal (terminalId), URL HTTPS do servidor corporativo e gestão de licença.",
    dependencies: "Requer autenticação com perfil ADMIN e dados válidos de conexão.",
  },
  {
    code: "PURCHASES",
    name: "Compras & Fornecedores",
    category: "Gestão & Stock",
    icon: "🚚",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "PROFESSIONAL",
    description: "Pedidos de cotação a fornecedores, ordens de compra e receção física com conferência quantitativa contra desvios.",
    dependencies: "Integrado com o catálogo de artigos e contas correntes de fornecedores.",
  },
  {
    code: "TREASURY",
    name: "Tesouraria & Finanças",
    category: "Financeiro & Fiscal",
    icon: "💰",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "PROFESSIONAL",
    description: "Controlo de sessões de operadores de caixa, fecho cego com apuramento de quebras/sobras e mapa de fluxo de caixa operacional.",
    dependencies: "Requer validação periódica de saldos pelo gerente ou administrador.",
  },
  {
    code: "HR",
    name: "Recursos Humanos & Salários",
    category: "Governação & Sistema",
    icon: "👥",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "BUSINESS",
    description: "Quadro de colaboradores, contratos de trabalho e folha de vencimentos com IRT e Segurança Social parametrizáveis.",
    dependencies: "Regras de IRT, Segurança Social e subsídios contratuais são configuráveis por empresa e dependem de validação profissional e da fonte oficial vigente.",
  },
  {
    code: "CRM",
    name: "CRM & Contas Correntes",
    category: "Vendas & POS",
    icon: "🎯",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "BUSINESS",
    description: "Ficha de clientes, gestão de crédito comercial com limites parametrizáveis e emissão de recibos parciais de conta corrente.",
    dependencies: "Integrado com faturas a prazo e contas a receber.",
  },
  {
    code: "DOCUMENTS",
    name: "Gestão Documental (GED)",
    category: "Financeiro & Fiscal",
    icon: "📁",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "BUSINESS",
    description: "Arquivo digital e visualização de 12 tipos de documentos comerciais e operacionais com retenção legal de 10 anos.",
    dependencies: "Preservação em base de dados e armazenamento de ficheiros fiscais.",
  },
  {
    code: "ACCOUNTING",
    name: "Contabilidade Geral Configurável",
    category: "Financeiro & Fiscal",
    icon: "📑",
    status: "configuravel",
    statusLabel: "Configurável",
    plan: "ENTERPRISE",
    description: "Modelagem contabilística configurável por empresa, sujeita a fonte oficial e validação por contabilista certificado. Inclui lançamentos a dobrar, balancetes e encerramento de exercício.",
    dependencies: "Requer parametrização do plano de contas e diários pela empresa e validação por contabilista certificado.",
  },
  {
    code: "BI",
    name: "Business Intelligence & BI",
    category: "Gestão & Stock",
    icon: "📈",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "ENTERPRISE",
    description: "Gráficos analíticos de rentabilidade, curvas ABC de artigos por margem de lucro e comparações temporais de faturação.",
    dependencies: "Alimentado por dados históricos reais gravados em base PostgreSQL.",
  },
  {
    code: "AUTOMATION",
    name: "Workflows & Automações",
    category: "Governação & Sistema",
    icon: "⚡",
    status: "configuravel",
    statusLabel: "Configurável",
    plan: "ENTERPRISE",
    description: "Motor de regras operacionais para disparo de alertas de rotura de stock, aprovações de crédito e notificações de desvios.",
    dependencies: "Requer parametrização explícita de regras e canais de notificação pelo administrador.",
  },
  {
    code: "GOVERNANCE",
    name: "Segurança & Governança",
    category: "Governação & Sistema",
    icon: "🛡️",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "ENTERPRISE",
    description: "Isolamento multi-tenant estrito, papéis de utilizador RBAC hierárquicos e trilhas de auditoria forense imutáveis.",
    dependencies: "Funcionalidade nativa da arquitetura; não pode ser desativada por utilizadores comuns.",
  },
  {
    code: "INTEGRATIONS",
    name: "Integrações & API REST",
    category: "Governação & Sistema",
    icon: "🔌",
    status: "integracao_externa",
    statusLabel: "Dependente de Integração Externa",
    plan: "ENTERPRISE",
    description: "Webhooks e endpoints REST do SDK para ligação a lojas online e sistemas legados de faturação.",
    dependencies: "Comunicação direta com a rede Multicaixa (EMIS) ou gateway bancário depende de contratos, certificados e credenciais externas de produção.",
  },
  {
    code: "CLOUD",
    name: "Cloud SaaS & Multi-Lojas",
    category: "Governação & Sistema",
    icon: "☁️",
    status: "configuravel",
    statusLabel: "Configurável",
    plan: "ENTERPRISE",
    description: "Consolidação de múltiplas lojas físicas numa instância central de backend com sincronização contínua.",
    dependencies: "Requer servidor central com PostgreSQL e ligação de rede segura HTTPS.",
  },
  {
    code: "AI",
    name: "Muambuluisha IA — Assistente inteligente do Mutshima",
    category: "Gestão & Stock",
    icon: "🤖",
    status: "configuravel",
    statusLabel: "Configurável",
    plan: "ENTERPRISE",
    description: "Assistente empresarial para consultas analíticas em linguagem natural sobre o desempenho da empresa e tendências com base em dados reais do ERP.",
    dependencies: "Opera exclusivamente com sessão autenticada conectada ao backend central; desativado em modo puramente offline.",
  },
  {
    code: "BIOMETRICS",
    name: "Biometria & Acessos",
    category: "Governação & Sistema",
    icon: "👁️",
    status: "validacao_hardware",
    statusLabel: "Em Validação de Hardware",
    plan: "ENTERPRISE",
    description: "Fundação lógica para controlo de acessos por impressão digital e reconhecimento facial em terminais compatíveis.",
    dependencies: "A utilização física real depende de sensores biométricos USB ou leitores Android dedicados com validação de hardware em ambiente de produção.",
  },
  {
    code: "CORPORATE",
    name: "Centro Corporativo",
    category: "Governação & Sistema",
    icon: "🏢",
    status: "disponivel",
    statusLabel: "Disponível",
    plan: "ENTERPRISE",
    description: "Cockpit para sedes gerirem filiais remotas em tempo real, despacharem comunicados e monitorizarem a saúde de cada terminal.",
    dependencies: "Requer papel ADMIN e servidor corporativo central acessível via HTTPS.",
  },
];

export interface ModulesPageProps {
  onNavigate: (view: string) => void;
}

export function ModulesPage({ onNavigate }: ModulesPageProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("TODOS");

  const categories = [
    "TODOS",
    "Vendas & POS",
    "Gestão & Stock",
    "Financeiro & Fiscal",
    "Governação & Sistema",
  ];

  const filteredModules = selectedCategory === "TODOS"
    ? MODULES_DETAILED_CATALOG
    : MODULES_DETAILED_CATALOG.filter((m) => m.category === selectedCategory);

  const getStatusClass = (status: ModuleMaturity) => {
    switch (status) {
      case "disponivel":
        return "status-disponivel";
      case "configuravel":
        return "status-configuravel";
      case "integracao_externa":
        return "status-integracao";
      case "validacao_hardware":
        return "status-hardware";
      case "planeado":
      default:
        return "status-planeado";
    }
  };

  return (
    <div className="modules-page">
      <div className="section-header">
        <span className="section-tag">Matriz Técnica de Capacidades</span>
        <h2 className="section-title">Matriz Visual de Módulos & Estado de Maturidade</h2>
        <p className="section-desc">
          Transparência técnica absoluta: todos os 19 módulos do catálogo canónico classificados pelo seu estado
          real de implementação, requisitos e dependências operacionais.
        </p>
      </div>

      {/* Declaração de Integridade e AGT */}
      <div className="regulatory-banner">
        <div className="regulatory-banner-icon">⚖️</div>
        <div className="regulatory-banner-content">
          <strong>Conformidade Regulatória e Fiscal Obrigatória:</strong>
          <p>
            <span className="mandatory-quote">
              “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”
            </span>
            <br />
            O Mutshima apresenta métricas verificáveis e classificação honesta por estado de maturidade, sem alegações comerciais infundadas ou selos fictícios.
            Qualquer emissão fiscal em produção depende da validação profissional das configurações da empresa, da fonte oficial vigente e de aprovação formal pela Administração Geral Tributária.
          </p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="filter-toolbar" role="toolbar" aria-label="Filtrar módulos por área">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`filter-btn ${selectedCategory === cat ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat)}
            aria-pressed={selectedCategory === cat}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grelha de Módulos */}
      <div className="modules-grid" role="region" aria-label="Grelha de Módulos">
        {filteredModules.map((item) => (
          <article key={item.code} className="module-card">
            <div className="module-card-header">
              <div className="module-title-area">
                <div className="module-icon" aria-hidden="true">{item.icon}</div>
                <div>
                  <h4>{item.name}</h4>
                  <span className="module-category">{item.category}</span>
                </div>
              </div>

              <span className={`status-pill ${getStatusClass(item.status)}`}>
                {item.statusLabel}
              </span>
            </div>

            <p className="module-desc">{item.description}</p>

            <div style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px 0", background: "#f8fafc", padding: "8px 10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
              <strong>Requisitos:</strong> {item.dependencies}
            </div>

            <div className="module-footer">
              <span>Plano mínimo:</span>
              <span className="plan-badge">{item.plan}</span>
            </div>
          </article>
        ))}
      </div>

      {/* Secção de Detalhe Fiscal */}
      <section className="fiscal-transparency-section" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "28px", marginTop: "32px" }}>
        <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: "0 0 12px 0" }}>
          Transparência sobre o Processo de Homologação
        </h3>
        <p style={{ fontSize: "14px", color: "#475467", lineHeight: 1.6, margin: "0 0 16px 0" }}>
          Os mecanismos fiscais do Mutshima foram estruturados de forma parametrizável para apoiar o futuro
          enquadramento em processos de homologação, dependendo de validação profissional, do esquema e tabelas da
          fonte oficial vigente e de aprovação formal pela AGT. Isto inclui:
        </p>
        <ul style={{ fontSize: "13px", color: "#334155", lineHeight: 1.7, paddingLeft: "20px", margin: "0 0 18px 0" }}>
          <li>Mecanismo parametrizável de assinatura digital RSA-SHA256 dependente de chaves e diretrizes vigentes;</li>
          <li>Encadeamento sequencial por hash do documento imediatamente anterior, configurável por série;</li>
          <li>Inclusão parametrizável de resumo do hash gerado no rodapé documental;</li>
          <li>Formatação de payload provisório de engenharia para QR Code impresso, sujeita ao formato definitivo, fonte oficial vigente e aprovação formal da AGT;</li>
          <li>Exportação configurável em XML SAF-T (AO) com isolamento por empresa, dependente de validação externa contra schema XSD vigente;</li>
          <li>Controlo aplicacional de imutabilidade dos registos fiscais emitidos, sujeito a validação profissional da configuração.</li>
        </ul>
        <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
          <strong>Nota de Rigor:</strong> Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
        </p>
      </section>

      <div style={{ textAlign: "center", margin: "40px 0" }}>
        <button
          type="button"
          className="btn-primary-lg"
          onClick={() => onNavigate("entrar")}
          style={{ marginRight: "12px" }}
        >
          <span>💼</span> Entrar no ERP Web
        </button>
        <button
          type="button"
          className="btn-secondary-lg"
          onClick={() => onNavigate("solucoes")}
        >
          <span>✨</span> Conhecer Soluções por Setor
        </button>
      </div>
    </div>
  );
}
