import type { OmnichannelView } from "./router";

interface SobrePageProps {
  onNavigate: (view: OmnichannelView) => void;
}

export function SobrePage({ onNavigate }: SobrePageProps) {
  return (
    <div className="site-page" data-testid="sobre-page">
      <section className="page-hero-header">
        <div className="hero-badges">
          <span className="hero-badge primary">🇦🇴 Arquitetura Orientada a Angola</span>
          <span className="hero-badge">Base Única ERP + POS + Mobile</span>
        </div>
        <h1>Sobre o Mutshima</h1>
        <p>
          O Mutshima é uma plataforma de gestão comercial e operacional concebida para responder aos desafios
          reais do retalho, distribuição e serviços em ambiente de conectividade variável, mantendo uma única base
          técnica para Web ERP, POS e dispositivos móveis.
        </p>
      </section>

      <section className="site-section" aria-labelledby="sobre-principios-titulo">
        <h2 id="sobre-principios-titulo" className="section-title">
          Princípios de Engenharia e Produto
        </h2>
        <p className="section-subtitle">
          Em vez de promessas comerciais genéricas, o projeto assenta em decisões técnicas verificáveis na arquitetura
          do sistema.
        </p>

        <div className="features-grid">
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">🧱</div>
            <h3>Base Aplicacional Única</h3>
            <p>
              O site institucional e a aplicação ERP partilham os mesmos contratos de API, tokens de design e componentes
              em <code>apps/web</code>, evitando a duplicação de sistemas e divergências de segurança entre portal e
              operação.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">📶</div>
            <h3>Resiliência a Falhas de Rede</h3>
            <p>
              A fila de saída local (Outbox) e o armazenamento no navegador permitem registar operações em momentos de
              instabilidade de rede com proteção por chave de idempotência na sincronização posterior.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">🏛️</div>
            <h3>Governação Multiempresa e Filiais</h3>
            <p>
              O contexto operacional é isolado por organização e filial (<code>companyId</code> / <code>branchId</code>),
              com autenticação JWT, papéis de acesso (RBAC) e fluxos separados para administração interna e portais.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">🔍</div>
            <h3>Transparência sobre Dependências</h3>
            <p>
              Cada página técnica distingue o que está implementado e testável localmente do que depende de contratos de
              terceiros, autorizações formais, infraestrutura física ou aprovação regulamentar.
            </p>
          </article>
        </div>
      </section>

      <section className="site-section" aria-labelledby="sobre-limites-titulo">
        <h2 id="sobre-limites-titulo" className="section-title">
          Limites Conhecidos e Fronteiras de Implementação
        </h2>
        <div className="section-card">
          <ul className="checklist">
            <li>
              <strong>Periféricos e Hardware:</strong> Impressão térmica ESC/POS (USB/Bluetooth), gavetas de caixa,
              leitores óticos e terminais biométricos dependem de hardware compatível, drivers instalados no sistema
              anfitrião ou camada nativa do dispositivo.
            </li>
            <li>
              <strong>Pagamentos e Banca (EMIS/GPO):</strong> Integrações bancárias e geração de referências oficiais em
              produção requerem credenciais, contratos e validação nos ambientes do prestador.
            </li>
            <li>
              <strong>Dados e Evidência:</strong> Este portal não apresenta casos de clientes fictícios, parceiros
              comerciais não autorizados, prémios inventados nem tabelas de preços arbitrárias.
            </li>
            <li>
              <strong>Enquadramento Fiscal:</strong> A arquitetura suporta geração de séries, encadeamento criptográfico
              e estrutura SAF-T (AO) para validação técnica em laboratório, dependendo de processo formal junto da
              autoridade tributária.
            </li>
          </ul>
        </div>
      </section>

      <section className="site-section" aria-label="Aviso regulatório obrigatório">
        <div className="agt-banner" role="note">
          <span className="agt-banner-icon" aria-hidden="true">⚖️</span>
          <div>
            <strong>Enquadramento Fiscal e Regulamentar:</strong>{" "}
            Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
          </div>
        </div>
      </section>

      <section className="cta-section" aria-labelledby="sobre-cta-titulo">
        <h2 id="sobre-cta-titulo">Explore a Arquitetura ou Aceda à Plataforma</h2>
        <p>
          Consulte a matriz honesta de módulos por estado de implementação ou fale diretamente com a equipa técnica.
        </p>
        <div className="cta-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate("modulos")}
          >
            Ver Matriz de Módulos
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate("contacto")}
          >
            Solicitar Contacto Técnico
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate("entrar")}
          >
            Entrar no Sistema
          </button>
        </div>
      </section>
    </div>
  );
}
