import React from "react";

export interface FiscalCompliancePageProps {
  onNavigate: (view: string) => void;
}

export function FiscalCompliancePage({ onNavigate }: FiscalCompliancePageProps) {
  return (
    <div className="fiscal-compliance-page">
      {/* Hero da Página de Conformidade Fiscal */}
      <section className="site-hero" style={{ padding: "48px 24px", textAlign: "center" }}>
        <div className="hero-container" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(15, 118, 110, 0.1)", border: "1px solid #99f6e4", color: "#0f766e", padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, marginBottom: "16px" }}>
            <span>📜</span> Legislação Tributária e Engenharia Fiscal em Angola
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 900, color: "#0f172a", marginBottom: "16px", lineHeight: 1.2 }}>
            Enquadramento Fiscal e Preparação Técnica
          </h1>
          <p style={{ fontSize: "16px", color: "#475569", lineHeight: 1.6, maxWidth: "760px", margin: "0 auto 24px auto" }}>
            Conheça os fundamentos técnicos da nossa arquitetura tributária, os fluxos documentais implementados, as garantias de imutabilidade e as dependências externas necessárias para a homologação formal.
          </p>

          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              padding: "16px 20px",
              fontSize: "14px",
              color: "#1e40af",
              maxWidth: "800px",
              margin: "0 auto",
              textAlign: "left",
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: "0 0 6px 0", fontWeight: 800 }}>
              Declaração Obrigatória de Transparência Regulatória:
            </p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "15px" }}>
              “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”
            </p>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 64px 24px" }}>
        {/* Bloco 1: Estado do Software e Esclarecimento */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "16px" }}>
            1. Estado do Software e Esclarecimento Legal
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "14px" }}>
            O <strong>VendaJá Angola</strong> disponibiliza uma arquitetura técnica parametrizável destinada a suportar a futura submissão no âmbito do processo formal junto da <strong>Administração Geral Tributária (AGT)</strong>.
          </p>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "16px", color: "#92400e", fontSize: "13px", lineHeight: 1.6 }}>
            <strong>Nota de Rigor:</strong> O sistema não se encontra homologado até aprovação formal da AGT. Nenhuma fatura emitida em ambiente de demonstração, piloto ou instalação interna constitui documento fiscal definitivo sem a devida aprovação formal e configuração validada pela fonte oficial vigente.
          </div>
        </section>

        {/* Bloco 2: Pilares da Arquitetura Fiscal */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "20px" }}>
            2. Pilares de Engenharia Fiscal Implementados
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "20px", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: "0 0 10px 0" }}>
                1. Séries Documentais Sequenciais e Contínuas
              </h3>
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                A numeração técnica de registos é sequencial e cronológica por empresa, filial, tipo de documento e exercício configurado, com bloqueio de alteração retroativa nas séries encerradas.
              </p>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "20px", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: "0 0 10px 0" }}>
                2. Imutabilidade e Encadeamento Documental
              </h3>
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                Registos emitidos são tecnicamente imutáveis após fecho de emissão (sem edição ou eliminação destrutiva), sendo os ajustes registados através de documento retificativo referenciado ao registo de origem.
              </p>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "20px", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: "0 0 10px 0" }}>
                3. Cadeia de Hash e Exportação Estruturada
              </h3>
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                Os registos suportam encadeamento criptográfico determinístico baseado no hash anterior (<code>previousHash</code>) e geração estruturada em XML parametrizável, sujeitos a fonte oficial vigente, validação profissional e aprovação formal da AGT.
              </p>
            </div>

            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "20px", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: "0 0 10px 0" }}>
                4. Motor de Políticas Fiscais Parametrizáveis
              </h3>
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                Taxas, isenções, retenções, séries e regras fiscais são parametrizadas por empresa e exigem fonte oficial vigente e validação por contabilista certificado.
              </p>
            </div>
          </div>
        </section>

        {/* Bloco 3: Descrição Técnica Não Normativa de Documentos */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
            3. Estrutura Técnica Não Normativa de Documentos Suportados
          </h2>
          <p style={{ color: "#475569", fontSize: "13px", lineHeight: 1.6, marginBottom: "16px" }}>
            Resumo estritamente técnico dos artefactos suportados pela camada de persistência e exportação estruturada (sem carácter normativo ou tabela tributária universal). Taxas, isenções, retenções, séries e regras fiscais são parametrizadas por empresa e exigem fonte oficial vigente e validação por contabilista certificado.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", background: "#f8fafc" }}>
                  <th style={{ padding: "10px 14px", color: "#334155" }}>Código</th>
                  <th style={{ padding: "10px 14px", color: "#334155" }}>Designação Técnica</th>
                  <th style={{ padding: "10px 14px", color: "#334155" }}>Função no Sistema</th>
                  <th style={{ padding: "10px 14px", color: "#334155" }}>Comportamento Técnico de Registo</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>FT</td>
                  <td style={{ padding: "10px 14px" }}>Fatura</td>
                  <td style={{ padding: "10px 14px", color: "#0f766e", fontWeight: 600 }}>Operação a Prazo / Crédito</td>
                  <td style={{ padding: "10px 14px", color: "#475569" }}>Associada a registo sequencial imutável; liquidação vinculada a recibo (RC) e ajustes via NC.</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>FR</td>
                  <td style={{ padding: "10px 14px" }}>Fatura-Recibo</td>
                  <td style={{ padding: "10px 14px", color: "#0f766e", fontWeight: 600 }}>Pronto Pagamento</td>
                  <td style={{ padding: "10px 14px", color: "#475569" }}>Regista venda e quitação num único artefacto encadeado em série configurada.</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>NC</td>
                  <td style={{ padding: "10px 14px" }}>Nota de Crédito</td>
                  <td style={{ padding: "10px 14px", color: "#0f766e", fontWeight: 600 }}>Estorno / Ajuste Técnico</td>
                  <td style={{ padding: "10px 14px", color: "#475569" }}>Registo retificativo imutável que referencia o identificador do documento de origem.</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>RC</td>
                  <td style={{ padding: "10px 14px" }}>Recibo</td>
                  <td style={{ padding: "10px 14px", color: "#0f766e", fontWeight: 600 }}>Liquidação de Conta Corrente</td>
                  <td style={{ padding: "10px 14px", color: "#475569" }}>Regista liquidação total ou parcial associada a documentos em aberto da empresa.</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>GT</td>
                  <td style={{ padding: "10px 14px" }}>Guia de Transporte</td>
                  <td style={{ padding: "10px 14px", color: "#0284c7", fontWeight: 600 }}>Movimentação Logística</td>
                  <td style={{ padding: "10px 14px", color: "#475569" }}>Armazena metadados de origem, destino, viatura e carimbo temporal da deslocação.</td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>PF</td>
                  <td style={{ padding: "10px 14px" }}>Fatura Proforma</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontWeight: 600 }}>Proposta Informativa</td>
                  <td style={{ padding: "10px 14px", color: "#475569" }}>Artefacto pré-venda não definitivo mantido em série técnica separada.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Bloco 4: Dependências Externas Obrigatórias */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "16px" }}>
            4. Dependências Externas Essenciais à Homologação Formal
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "16px" }}>
            A integridade das operações fiscais exige distinção inequívoca entre o código-fonte desenvolvido e os artefactos legais que dependem de atribuição e validação pela Administração Geral Tributária:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                Validação SAF-T (AO) contra Schema XSD Vigente
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
                O exportador gera estrutura XML SAF-T (AO) parametrizável. A validação em produção exige o ficheiro <code>XSD</code> da fonte oficial vigente, validação profissional e aprovação formal da AGT.
              </p>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                Código QR, Hash e Assinaturas Parametrizáveis
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
                A geração de código QR, encadeamento de hash e assinatura criptográfica são parametrizáveis e operam em formato técnico provisório; a sua aplicação produtiva depende da fonte oficial vigente, validação profissional e diretrizes formais da AGT.
              </p>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                Webservices e Submissão Eletrónica
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
                A comunicação direta com os sistemas centrais da AGT depende de credenciais institucionais, autorização formal de produção e canais de webservices disponibilizados às entidades aprovadas.
              </p>
            </div>
          </div>
        </section>

        {/* Chamada para Ação / Navegação */}
        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => onNavigate("seguranca")}
            style={{ marginRight: "12px" }}
          >
            Consultar Arquitetura de Segurança
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
