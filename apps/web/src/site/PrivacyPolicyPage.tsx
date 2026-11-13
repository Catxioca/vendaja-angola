import React from "react";

export interface PrivacyPolicyPageProps {
  onNavigate: (view: string) => void;
}

export function PrivacyPolicyPage({ onNavigate }: PrivacyPolicyPageProps) {
  return (
    <div className="privacy-page">
      <section className="site-hero" style={{ padding: "48px 24px", textAlign: "center" }}>
        <div className="hero-container" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(100, 116, 139, 0.1)", border: "1px solid #cbd5e1", color: "#475569", padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, marginBottom: "16px" }}>
            <span>🔒</span> Governação Técnica de Dados e Privacidade
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 900, color: "#0f172a", marginBottom: "16px", lineHeight: 1.2 }}>
            Política de Privacidade e Tratamento Técnico de Dados
          </h1>
          <p style={{ fontSize: "16px", color: "#475569", lineHeight: 1.6, maxWidth: "760px", margin: "0 auto 24px auto" }}>
            Estrutura técnica descritiva sobre armazenamento, ciclo de vida de dados de faturação, isolamento de inquilinos e salvaguardas operacionais no VendaJá Angola.
          </p>

          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: "8px",
              padding: "16px 20px",
              fontSize: "14px",
              color: "#9f1239",
              maxWidth: "800px",
              margin: "0 auto",
              textAlign: "left",
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: "0 0 4px 0", fontWeight: 800 }}>
              ⚠️ Aviso Obrigatório de Revisão Legal:
            </p>
            <p style={{ margin: 0, fontWeight: 700 }}>
              “Requer revisão jurídica antes de publicação comercial.”
            </p>
            <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#be123c" }}>
              Este documento descreve unicamente os aspetos técnicos e a arquitetura de armazenamento do sistema. Não constitui aconselhamento jurídico nem declara conformidade legal ou regulamentar sem parecer formal de consultoria jurídica qualificada.
            </p>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px 64px 24px" }}>
        <article style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "36px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)", lineHeight: 1.7, color: "#334155", fontSize: "14px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginTop: 0, marginBottom: "12px" }}>
            1. Natureza Técnica dos Dados Tratados
          </h2>
          <p>
            O VendaJá Angola opera como plataforma transacional para gestão comercial e faturação. Os dados gerados e persistidos no sistema enquadram-se estritamente nas seguintes categorias técnicas:
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            <li><strong>Identificadores de Autenticação e Sessão:</strong> Nomes de utilizador, endereços de email de acesso, credenciais de hash criptográfico e identificadores temporários de sessão (JWT).</li>
            <li><strong>Dados de Faturação e Transações Comerciais:</strong> NIF do emitente e adquirente, designação de artigos, valores de venda, taxas de imposto aplicadas, descontos e métodos de liquidação.</li>
            <li><strong>Registos de Auditoria Operacional:</strong> Endereços de origem, carimbos temporais de abertura/fecho de turno de caixa, operações críticas e eventos de integridade fiscal.</li>
          </ul>

          <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "24px 0" }} />

          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
            2. Localização e Segregação de Armazenamento
          </h2>
          <p>
            A persistência dos dados é estruturada segundo princípios de isolamento estrito:
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            <li><strong>Armazenamento Central (PostgreSQL):</strong> Os dados são segregados por chave única de empresa (<code>companyId</code>). O acesso é condicionado por verificação de pertença ativa de cada utilizador (<code>CompanyMembership</code>).</li>
            <li><strong>Armazenamento Local nos Postos de Venda (Dispositivos / Browsers):</strong> Nos postos POS, tablets e browsers móveis, os dados são temporariamente mantidos em armazenamento local de origem isolada (IndexedDB / SQLite), restritos à chave da empresa operadora.</li>
            <li><strong>Proteção Criptográfica de Segredos:</strong> Credenciais e segredos sensíveis utilizam encriptação local de segredos quando configurada e suportada pelo ambiente.</li>
          </ul>

          <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "24px 0" }} />

          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
            3. Ciclo de Vida e Retenção de Dados Documentais
          </h2>
          <p>
            Princípios técnicos de conservação documental e gestão de sessões:
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            <li>Registos documentais emitidos (FT, FR, NC, ND, RC) possuem proteção técnica contra eliminação indevida e <strong>retenção sujeita à legislação aplicável, política contratual e validação jurídica</strong>.</li>
            <li>Tokens de atualização e sessões expiradas são revogados e eliminados periodicamente da base de dados.</li>
            <li>Sessões nos postos locais são descarregadas mediante autenticação e fecho formal de turno de caixa.</li>
          </ul>

          <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "24px 0" }} />

          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
            4. Direitos dos Titulares e Consulta de Dados
          </h2>
          <p>
            Os utilizadores e entidades registadas podem consultar, retificar dados cadastrais ou solicitar relatórios de atividade através dos módulos administrativos sob perfil autorizado (ADMIN) ou diretamente nos respetivos portais self-service (Portal do Cliente, Fornecedor ou Colaborador).
          </p>

          <div style={{ marginTop: "32px", padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px", color: "#64748b" }}>
            <strong>Nota de Governação:</strong> A publicação comercial definitiva desta política carece de validação jurídica formal e de designação de contactos de privacidade conforme o enquadramento societário final da entidade exploradora.
          </div>
        </article>

        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => onNavigate("termos")}
            style={{ marginRight: "12px" }}
          >
            Consultar Termos de Serviço
          </button>
          <button
            type="button"
            className="btn-secondary-lg"
            onClick={() => onNavigate("home")}
          >
            Voltar à Página Inicial
          </button>
        </div>
      </div>
    </div>
  );
}
