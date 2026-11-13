import React from "react";

export interface SolutionsPageProps {
  onNavigate: (view: string) => void;
}

export function SolutionsPage({ onNavigate }: SolutionsPageProps) {
  const solutions = [
    {
      num: "01",
      tag: "Vendas & Caixa",
      title: "POS de Balcão & Retalho Rápido",
      desc: "Concebido para operações de balcão em lojas, supermercados, restauração e mercearias. Permite pesquisar produtos na base local offline, ler códigos de barras via scanner USB/câmara, aplicar descontos autorizados e registar pagamentos em numerário, transferência, pagamento por cartão (dependendo de terminal externo compatível) ou a crédito.",
      features: [
        "Pesquisa local de produtos sem dependência de latência de rede",
        "Modo dividido (split-screen) para tablets em orientação paisagem",
        "Abertura e fecho cego de turno com conferência de quebras/excedentes",
        "Suporte a múltiplos meios de pagamento e cálculo de troco",
        "Fila outbox com gravação local imediata enquanto o posto de trabalho permanece operacional",
      ],
    },
    {
      num: "02",
      tag: "Fiscalidade & Documentos",
      title: "Faturação Comercial e Documentos Parametrizáveis",
      desc: "Estrutura para emissão de documentos comerciais (Faturas FT, Faturas-Recibo FR, Faturas Proforma FP, Notas de Crédito NC, Notas de Débito ND e Guias de Transporte GT), com taxas de IVA, motivos de isenção, encadeamento de hash, assinatura criptográfica, formato QR e exportação SAF-T (AO) parametrizáveis por empresa e dependentes de validação profissional e da fonte oficial vigente.",
      features: [
        "Tipos de documentos comerciais e operacionais configuráveis",
        "Taxas de IVA e motivos de isenção parametrizáveis conforme fonte oficial vigente",
        "Encadeamento de hash e assinatura criptográfica configuráveis (sujeitos a aprovação formal da AGT)",
        "Payload QR e exportação SAF-T (AO) dependentes de schema XSD vigente e validação profissional",
        "Políticas configuráveis de arquivo e retenção documental",
      ],
    },
    {
      num: "03",
      tag: "Logística & Gestão",
      title: "Gestão de Stock, Armazéns e Custo Médio",
      desc: "Controlo rigoroso de inventário para armazéns centrais e lojas locais. Suporta múltiplas localizações físicas (zonas, prateleiras), transferências entre filiais com guias de remessa, registo de quebras e avarias, contagem física de inventário com ajuste automático e valorização permanente por Custo Médio Ponderado (CMP).",
      features: [
        "Múltiplos armazéns com isolamento estrito por empresa e filial",
        "Transferências inter-lojas com conferência física de entrada",
        "Inventário físico periódico com cálculo de desvios auditáveis",
        "Valorização permanente de existências por Custo Médio Ponderado",
        "Alertas preventivos de stock mínimo e reposição sugerida",
      ],
    },
    {
      num: "04",
      tag: "Suprimentos",
      title: "Compras e Gestão de Fornecedores",
      desc: "Fluxo completo de compras: registo e qualificação de fornecedores, pedidos de cotação para comparação de custos unitários, emissão de ordens de compra e conferência na receção física de mercadorias com bloqueio de excessos em relação ao encomendado.",
      features: [
        "Cadastro de fornecedores com NIF e histórico de transações",
        "Pedidos de cotação com comparação lado a lado de propostas",
        "Ordens de compra integradas com o módulo de contas a pagar",
        "Receção parcial ou total de mercadorias com conferência em armazém",
        "Controlo de devoluções a fornecedor com nota de crédito associada",
      ],
    },
    {
      num: "05",
      tag: "Crédito & Comercial",
      title: "Clientes e Contas Correntes (Crédito)",
      desc: "Gestão centralizada de clientes com NIF e contactos. Permite parametrizar limites de crédito comercial, gerir prazos de vencimento de faturas a prazo, emitir extratos de conta corrente e processar liquidações parciais ou totais com emissão de Recibos (RC).",
      features: [
        "Validação de duplicidade de NIF por empresa",
        "Parametrização de limites de crédito e bloqueio por antiguidade",
        "Extrato cronológico de débitos, créditos e saldo em dívida",
        "Emissão de Recibos (RC) para liquidação de faturas pendentes",
        "Portal do Cliente self-service para consulta direta de faturas",
      ],
    },
    {
      num: "06",
      tag: "Financeiro",
      title: "Tesouraria e Fluxo de Caixa Operacional",
      desc: "Acompanhamento transparente das entradas e saídas financeiras da empresa. Gestão de sessões de caixa por operador com PIN seguro, mapas diários de fluxo de caixa operacional, controlo de contas bancárias e conciliação de recebimentos por Multicaixa e transferências.",
      features: [
        "Abertura e fecho de turnos de operadores com PIN de autorização",
        "Fecho cego de caixa com apuramento objetivo de sobras ou faltas",
        "Mapa de fluxo de caixa com segregação de entradas e saídas",
        "Controlo de contas bancárias e conciliação financeira",
        "Trilha de auditoria para todas as operações de tesouraria",
      ],
    },
    {
      num: "07",
      tag: "Contabilidade",
      title: "Contabilidade Geral e Partidas Dobradas",
      desc: "Modelagem contabilística configurável por empresa, sujeita a fonte oficial e validação por contabilista certificado. Suporta partidas dobradas, apuramento de resultados, balancetes analíticos, fecho de exercício e bloqueio de períodos encerrados.",
      features: [
        "Modelagem contabilística configurável por empresa e por contabilista certificado",
        "Estrutura de diários e contas definida por parametrização (sem plano fixo universal)",
        "Verificação aritmética de balanceamento (Débito = Crédito)",
        "Fecho anual de exercício parametrizável",
        "Bloqueio de lançamentos retroativos em períodos fechados",
      ],
    },
    {
      num: "08",
      tag: "Capital Humano",
      title: "Recursos Humanos e Processamento Salarial",
      desc: "Registo de colaboradores e contratos de trabalho. Processamento mensal de vencimentos com regras de Imposto sobre o Rendimento do Trabalho (IRT) e contribuições de Segurança Social parametrizáveis por empresa, sujeitas à fonte oficial vigente e a validação profissional.",
      features: [
        "Ficha do colaborador, dependentes e parâmetros contratuais",
        "Escalões e deduções de IRT configuráveis conforme a fonte oficial vigente",
        "Regras de Segurança Social parametrizáveis e dependentes de validação profissional",
        "Emissão e visualização de recibos de vencimento detalhados",
        "Portal do Colaborador para consulta de recibos e pedidos de férias",
      ],
    },
    {
      num: "09",
      tag: "Sedes & Grupos",
      title: "Centro Corporativo Multiempresa & Multifilial",
      desc: "Cockpit para administração de múltiplas empresas e filiais geográficas a partir de uma sede única. Monitorização de lojas online/offline, envio de comunicados em tempo real, administração unificada de utilizadores com RBAC e consolidação de indicadores em PostgreSQL.",
      features: [
        "Gestão multiempresa com segregação absoluta de dados por tenant",
        "Monitorização central da conectividade e versões de cada filial",
        "Administração centralizada de utilizadores e perfis de permissão",
        "Broadcast de anúncios e comandos remotos para os postos",
        "Trilhas de auditoria globais imutáveis para conformidade e segurança",
      ],
    },
    {
      num: "10",
      tag: "Plataformas",
      title: "Desktop, Web ERP e Android/Tablet POS",
      desc: "Acesso omnicanal unificado através de clientes específicos para cada posto de trabalho: aplicação local para Windows x64 (Electron), aplicação Web acessível por browser e aplicação mobile touch-first para tablets Android com cofre encriptado localmente (AES-GCM).",
      features: [
        "Desktop Windows x64 em instalador NSIS hermético e autónomo",
        "Web ERP acessível em qualquer computador sem necessidade de instalação",
        "Android / Tablet POS com interface touch de balcão e cofre AES-GCM",
        "Classificação honesta de periféricos e suporte a scanners e impressoras",
        "Service Worker PWA com estratégia Network-First e cache estática",
      ],
    },
    {
      num: "11",
      tag: "Inteligência Artificial",
      title: "Muambuluisha IA — Assistente Inteligente Soberano",
      desc: "Assistente empresarial para consultas operacionais e analíticas em linguagem natural sustentadas por dados reais do ERP e governadas por permissões RBAC. Não utiliza dados confidenciais para treino externo e funciona exclusivamente online conectada ao backend central autorizado.",
      features: [
        "Consultas operacionais e analíticas em linguagem natural sobre dados reais",
        "Isolamento multi-tenant estrito e respeito absoluto por permissões RBAC",
        "Operação exclusivamente online conectada ao backend central autorizado",
        "Zero partilha ou treino de modelos com dados empresariais confidenciais",
        "Trilha de auditoria completa para todas as interações e recomendações",
      ],
    },
  ];

  return (
    <div className="solutions-page">
      <div className="section-header">
        <span className="section-tag">Soluções Verticais</span>
        <h2 className="section-title">Soluções Adaptadas à Economia Real Angolana</h2>
        <p className="section-desc">
          Conheça as capacidades operacionais reais do VendaJá Angola para retalho, restauração, grossistas,
          indústria e empresas de serviços. Cada funcionalidade é sustentada por testes exaustivos e contratos
          de integridade estritos.
        </p>
      </div>

      <div className="regulatory-banner">
        <div className="regulatory-banner-icon">⚖️</div>
        <div className="regulatory-banner-content">
          <strong>Declaração Fiscal Obrigatória:</strong>
          <p>
            <span className="mandatory-quote">
              “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”
            </span>
            <br />
            Todas as funcionalidades fiscais, tributárias e contabilísticas são parametrizáveis por empresa e dependem
            de validação profissional e da fonte oficial vigente antes de qualquer utilização produtiva.
          </p>
        </div>
      </div>

      <div className="solutions-list">
        {solutions.map((item) => (
          <article key={item.num} className="solution-section-item">
            <div className="solution-badge-num">
              <span>{item.num}</span>
              <small>{item.tag}</small>
            </div>

            <div className="solution-content">
              <h3>{item.title}</h3>
              <p>{item.desc}</p>

              <div className="solution-features-list">
                {item.features.map((feat, idx) => (
                  <span key={idx} className="solution-tag-pill">
                    ✓ {feat}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div style={{ textAlign: "center", margin: "40px 0" }}>
        <button
          type="button"
          className="btn-primary-lg"
          onClick={() => onNavigate("modulos")}
          style={{ marginRight: "12px" }}
        >
          <span>📊</span> Ver Matriz Detalhada de Módulos
        </button>
        <button
          type="button"
          className="btn-secondary-lg"
          onClick={() => onNavigate("entrar")}
        >
          <span>💼</span> Entrar no Sistema
        </button>
      </div>
    </div>
  );
}
