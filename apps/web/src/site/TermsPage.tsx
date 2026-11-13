import React from "react";

export interface TermsPageProps {
  onNavigate: (view: string) => void;
}

export function TermsPage({ onNavigate }: TermsPageProps) {
  return (
    <div className="terms-page">
      <section className="site-hero" style={{ padding: "48px 24px", textAlign: "center" }}>
        <div className="hero-container" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(100, 116, 139, 0.1)", border: "1px solid #cbd5e1", color: "#475569", padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, marginBottom: "16px" }}>
            <span>📄</span> Condições de Utilização do Software
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 900, color: "#0f172a", marginBottom: "16px", lineHeight: 1.2 }}>
            Termos e Condições de Utilização
          </h1>
          <p style={{ fontSize: "16px", color: "#475569", lineHeight: 1.6, maxWidth: "760px", margin: "0 auto 24px auto" }}>
            Estrutura técnica descritiva sobre licenciamento, responsabilidades operacionais, integridade de dados e limites de garantia do software VendaJá Angola.
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
              O presente texto estabelece uma matriz descritiva de direitos e obrigações operacionais para fases de testes e validação prévia. Não substitui um contrato comercial nem termo de adesão juridicamente validado.
            </p>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px 64px 24px" }}>
        <article style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "36px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)", lineHeight: 1.7, color: "#334155", fontSize: "14px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginTop: 0, marginBottom: "12px" }}>
            1. Objeto e Natureza da Solução
          </h2>
          <p>
            O VendaJá Angola disponibiliza uma suíte omnicanal composta por aplicação Desktop (Windows), Web ERP e aplicação móvel para Postos de Venda (POS) Android/Tablet, além de serviços centrais de sincronização e API de retaguarda.
          </p>
          <p>
            O software encontra-se em preparação técnica para futuro processo de homologação pela Administração Geral Tributária (AGT). A utilização da plataforma para emissão fiscal em ambiente real pressupõe a conclusão da validação profissional das configurações da empresa e aprovação formal da AGT.
          </p>

          <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "24px 0" }} />

          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
            2. Responsabilidade pelas Configurações Fiscais e Dados Inseridos
          </h2>
          <p>
            A entidade utilizadora e os respetivos operadores com perfil <strong>ADMIN</strong> são inteiramente responsáveis pela veracidade, correção e atualização de:
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            <li>NIF da empresa emitente, razão social, endereço fiscal e regime de enquadramento tributário;</li>
            <li>Parametrização das taxas, isenções, retenções, séries e regras fiscais por empresa com base na fonte oficial vigente e validação por contabilista certificado;</li>
            <li>Indicação e justificação legal das isenções tributárias selecionadas nos documentos emitidos;</li>
            <li>Exportação estruturada de ficheiros SAF-T (AO) e cópias de segurança com retenção sujeita à legislação aplicável, política contratual e validação jurídica, bem como encriptação local de segredos quando configurada e suportada pelo ambiente.</li>
          </ul>

          <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "24px 0" }} />

          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
            3. Regime de Conectividade e Operação Offline
          </h2>
          <p>
            A plataforma opera em regime híbrido:
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            <li>
              <strong>Operação Offline Autónoma:</strong> Os postos locais POS e móveis permitem registar transações provisórias mesmo em períodos sem conectividade à rede.
            </li>
            <li>
              <strong>Validação e Fecho Central:</strong> A confirmação fiscal definitiva e a consolidação das séries documentais ocorrem no momento da sincronização idempotente com o servidor central autenticado.
            </li>
            <li>
              A integridade das filas de saída (outbox) depende da não eliminação manual dos dados da aplicação local no dispositivo antes da sincronização.
            </li>
          </ul>

          <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "24px 0" }} />

          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "12px" }}>
            4. Limitação de Responsabilidade e Periféricos de Terceiros
          </h2>
          <p>
            O funcionamento com periféricos físicos externos (impressoras térmicas ESC/POS, gavetas conectadas via RJ11, leitores de código de barras USB/HID) e serviços de pagamento bancário (EMIS/Multicaixa) depende estritamente da compatibilidade do hardware utilizado, drivers do sistema operativo e acordos de serviço com os fornecedores terceiros.
          </p>

          <div style={{ marginTop: "32px", padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px", color: "#64748b" }}>
            <strong>Declaração Obrigatória:</strong> “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”
          </div>
        </article>

        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => onNavigate("privacidade")}
            style={{ marginRight: "12px" }}
          >
            Consultar Política de Privacidade
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
