import React, { useState, useEffect } from "react";

export interface HomePageProps {
  apiUrl: string;
  onNavigate: (view: string) => void;
}

export function HomePage({ apiUrl, onNavigate }: HomePageProps) {
  const [bootstrapAllowed, setBootstrapAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/api/v1/auth/bootstrap/status`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("status_error"))))
      .then((data: { bootstrapAllowed?: boolean }) => {
        if (active) setBootstrapAllowed(data.bootstrapAllowed === true);
      })
      .catch(() => {
        if (active) setBootstrapAllowed(false);
      });
    return () => {
      active = false;
    };
  }, [apiUrl]);

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-pill">
          🇦🇴 Engenharia de Software Soberana para Angola
        </div>

        <h2 id="hero-title" className="hero-title">
          Faturação Comercial e ERP <span>Resiliente ao Balcão</span>
        </h2>

        <p className="hero-subtitle">
          O <strong>Mutshima</strong> combina operação offline-first nos postos de venda com
          sincronização centralizada em nuvem. Operação offline-first enquanto o posto de trabalho
          permanece operacional; a continuidade perante falha elétrica depende de energia e hardware
          compatíveis.
        </p>

        <div className="hero-cta-group">
          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => onNavigate("entrar")}
            title="Aceder ao painel do ERP Web ou aos Portais Integrados"
          >
            <span>💼</span> Aceder ao ERP Web
          </button>

          {bootstrapAllowed && (
            <button
              type="button"
              className="btn-bootstrap-hero"
              onClick={() => onNavigate("criar-conta")}
              title="Configurar a primeira empresa e utilizador administrador"
            >
              <span>🔑</span> Criar Conta de Administrador Inicial
            </button>
          )}

          <button
            type="button"
            className="btn-secondary-lg"
            onClick={() => onNavigate("modulos")}
            title="Explorar o catálogo completo de módulos e funcionalidades"
          >
            <span>📋</span> Ver Módulos & Capacidades
          </button>
        </div>

        <div style={{ fontSize: "12px", color: "#64748b" }}>
          Suporta postos Desktop Windows x64, navegadores Web modernos e tablets Android em modo balcão touch.
        </div>
      </section>

      {/* Declaração Obrigatória AGT */}
      <div className="regulatory-banner" role="region" aria-label="Aviso Regulamentar Fiscal">
        <div className="regulatory-banner-icon" aria-hidden="true">
          ⚖️
        </div>
        <div className="regulatory-banner-content">
          <strong>Enquadramento Fiscal e Legal Obrigatório:</strong>
          <p>
            <span className="mandatory-quote">
              “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”
            </span>
            <br />
            As capacidades de assinatura criptográfica, encadeamento de hash, QR Code, cálculo de IVA e
            estruturação SAF-T (AO) são parametrizáveis e dependem de validação profissional, da fonte oficial
            vigente e de aprovação formal da AGT.
          </p>
        </div>
      </div>

      {/* Aviso de Periféricos Físicos e Hardware */}
      <div className="hardware-notice-card" role="region" aria-label="Aviso de Hardware e Periféricos">
        <div className="regulatory-banner-icon" aria-hidden="true">
          🖨️
        </div>
        <div className="hardware-notice-card-content">
          <strong>Requisitos de Hardware e Periféricos Físicos:</strong>
          <p>
            As funcionalidades que dependem de equipamentos físicos (como impressão térmica de talões de 58mm/80mm em
            protocolo ESC/POS, abertura automática de gavetas de dinheiro RJ11, leitores de código de barras USB/HID e
            leitores biométricos) requerem hardware físico compatível, controladores de sistema instalados e
            parametrização adequada no posto de venda.
          </p>
        </div>
      </div>

      {/* Resumo de Funcionamento Online / Offline */}
      <section className="architecture-section" style={{ marginBottom: "40px" }} aria-labelledby="arch-title">
        <div className="section-header">
          <span className="section-tag">Arquitetura Híbrida</span>
          <h3 id="arch-title" className="section-title">
            Como Funciona: Resiliência Total em Três Camadas
          </h3>
          <p className="section-desc">
            Desenhado para operar em ambientes com infraestrutura de rede intermitente sem comprometer a integridade
            dos dados ou a conformidade tributária.
          </p>
        </div>

        <div className="grid-3">
          <div className="feature-box">
            <div className="feature-icon-wrapper">🔌</div>
            <h3>1. Operação Offline Autónoma</h3>
            <p>
              O posto de venda (POS) regista artigos, clientes e pagamentos numa base de dados local isolada. As vendas
              são gravadas com chaves de idempotência determinísticas numa fila outbox persistente, enquanto o posto de
              trabalho permanece operacional.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-wrapper">🔄</div>
            <h3>2. Sincronização Segura e Idempotente</h3>
            <p>
              Assim que a ligação à internet é restabelecida, o motor de sincronização envia em lote as mutações da outbox.
              O backend confirma a receção sem risco de faturas duplicadas e devolve a numeração e confirmações fiscais.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-wrapper">🏢</div>
            <h3>3. Centro Corporativo Central</h3>
            <p>
              A administração central, a gestão de armazéns centrais, o fecho contabilístico e a auditoria multi-filial
              são consolidados em PostgreSQL com isolamento estrito de multiempresa (multi-tenant) e controlo de acessos RBAC.
            </p>
          </div>
        </div>
      </section>

      {/* Destaque dos Módulos Reais */}
      <section className="modules-highlight-section" aria-labelledby="modules-title">
        <div className="section-header">
          <span className="section-tag">Capacidades Operacionais</span>
          <h3 id="modules-title" className="section-title">
            Módulos Reais Prontos para a sua Empresa
          </h3>
          <p className="section-desc">
            Uma plataforma unificada com 19 módulos funcionais, eliminando a fragmentação de ferramentas e folhas de
            cálculo dispersas.
          </p>
        </div>

        <div className="grid-3">
          <div className="feature-box">
            <div className="feature-icon-wrapper">🛒</div>
            <h3>Balcão POS & Vendas</h3>
            <p>
              Interface rápida com pesquisa instantânea, modo dividido em tablet, suporte a múltiplos meios de pagamento e
              emissão imediata de documentos de venda.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-wrapper">📦</div>
            <h3>Stocks & Armazéns</h3>
            <p>
              Multi-armazém, transferências entre lojas com conferência física, valorização por Custo Médio Ponderado (CMP)
              e alertas automáticos de rotura de stock.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-wrapper">📑</div>
            <h3>Contabilidade Geral Configurável</h3>
            <p>
              Modelagem contabilística configurável por empresa, sujeita a fonte oficial e validação por
              contabilista certificado. Suporta partidas dobradas, balancetes e encerramento de períodos.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-wrapper">👥</div>
            <h3>Recursos Humanos & Salários</h3>
            <p>
              Processamento de folha salarial parametrizável por empresa, com regras configuráveis de IRT e
              Segurança Social sujeitas a validação profissional e à fonte oficial vigente.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-wrapper">🚚</div>
            <h3>Compras & Fornecedores</h3>
            <p>
              Ciclo completo de compras: pedidos de cotação a fornecedores, comparação de custos, ordens de compra e
              receção física com controlo de desvios.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-wrapper">🏢</div>
            <h3>Centro Corporativo</h3>
            <p>
              Cockpit para sedes gerirem filiais remotas em tempo real, despacharem comunicados, configurarem utilizadores e
              acompanharem a saúde de cada terminal.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-wrapper">🤖</div>
            <h3>Muambuluisha IA</h3>
            <p>
              Assistente inteligente em linguagem natural para consultas operacionais e analíticas em tempo real
              sustentadas exclusivamente por dados corporativos autorizados e governadas por RBAC.
            </p>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "24px", display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-secondary-lg"
            onClick={() => onNavigate("solucoes")}
          >
            <span>✨</span> Explorar Soluções Verticais
          </button>
          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => onNavigate("modulos")}
          >
            <span>📊</span> Ver Matriz de Módulos & Classificação
          </button>
          <button
            type="button"
            className="btn-secondary-lg"
            onClick={() => onNavigate("seguranca")}
          >
            <span>🛡️</span> Arquitetura de Segurança
          </button>
          <button
            type="button"
            className="btn-secondary-lg"
            onClick={() => onNavigate("conformidade-fiscal")}
          >
            <span>📜</span> Conformidade Fiscal
          </button>
        </div>
      </section>
    </div>
  );
}
