import React from "react";

export interface SecurityPageProps {
  onNavigate: (view: string) => void;
}

export function SecurityPage({ onNavigate }: SecurityPageProps) {
  return (
    <div className="security-page">
      {/* Hero da Página de Segurança */}
      <section className="site-hero" style={{ padding: "48px 24px", textAlign: "center" }}>
        <div className="hero-container" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(2, 132, 199, 0.1)", border: "1px solid #bae6fd", color: "#0369a1", padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, marginBottom: "16px" }}>
            <span>🛡️</span> Governação Técnica e Proteção em Profundidade
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 900, color: "#0f172a", marginBottom: "16px", lineHeight: 1.2 }}>
            Arquitetura de Segurança e Isolamento Multiempresa
          </h1>
          <p style={{ fontSize: "16px", color: "#475569", lineHeight: 1.6, maxWidth: "760px", margin: "0 auto 24px auto" }}>
            Conheça as salvaguardas técnicas, controlos criptográficos, garantias de idempotência e limites reais de armazenamento que protegem as operações comerciais e fiscais da sua empresa no Mutshima.
          </p>

          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              padding: "12px 18px",
              fontSize: "13px",
              color: "#1e40af",
              maxWidth: "760px",
              margin: "0 auto",
              textAlign: "left",
            }}
          >
            <strong>Aviso Regulamentar:</strong> “Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”
          </div>
        </div>
      </section>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 64px 24px" }}>
        {/* Bloco 1: Autenticação e RBAC Real */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>🔐</span> 1. Autenticação Robusta e Controlo de Acesso Baseado em Papéis (RBAC)
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "16px" }}>
            O controlo de acessos no Mutshima é implementado em profundidade: a interface gráfica apenas reflete permissões, mas todas as regras de segurança são estritamente validadas na camada de API e serviços de base de dados.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginTop: "20px" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>Perfis Canónicos Estruturados</h3>
              <ul style={{ paddingLeft: "18px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: 1.7 }}>
                <li><strong>ADMIN:</strong> Gestão de utilizadores, filiais, configuração fiscal, módulos e parametrização.</li>
                <li><strong>MANAGER:</strong> Consulta de cockpits, auditoria e supervisão operacional; sem mutações corporativas.</li>
                <li><strong>ACCOUNTANT:</strong> Modelagem contabilística parametrizada por empresa, períodos, lançamentos e exportação SAF-T (AO) sujeita a validação profissional.</li>
                <li><strong>CASHIER / OPERATOR:</strong> Abertura e fecho cego de turnos, registo de vendas e emissão de comprovativos de balcão.</li>
              </ul>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>Higiene de Sessão no Browser</h3>
              <ul style={{ paddingLeft: "18px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: 1.7 }}>
                <li><strong>Cookie HttpOnly para Refresh Token:</strong> Em aplicações Web, o token de renovação é emitido pelo servidor em cookie <code>HttpOnly</code>, <code>SameSite=Lax</code> e <code>Secure</code> (HTTPS/produção), reduzindo exposição a scripts.</li>
                <li><strong>Limitação Real de <code>localStorage</code>:</strong> O <code>localStorage</code> do browser não é armazenamento seguro ou confidencial; apenas identificadores mínimos de sessão e contexto ativo são mantidos, nunca palavras-passe, PIN ou dados empresariais completos.</li>
                <li><strong>CSP e Limpeza Integral:</strong> Política Content Security Policy restritiva e revogação/limpeza total da sessão mesmo perante erros de rede, HTTP 401 no logout ou refresh token expirado.</li>
              </ul>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 8px 0" }}>Defesa Ativa contra Ataques</h3>
              <ul style={{ paddingLeft: "18px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: 1.7 }}>
                <li><strong>Respostas Neutras (HTTP 401):</strong> Mensagens genéricas que não revelam se utilizador, empresa ou senha existem.</li>
                <li><strong>Rate Limiting (HTTP 429):</strong> Bloqueio automático de tentativas excessivas em curto intervalo temporal.</li>
                <li><strong>Lockout Temporário (HTTP 423):</strong> Bloqueio temporário da conta após tentativas consecutivas falhadas.</li>
                <li><strong>Rejeição Estrita (HTTP 403):</strong> Operações sem autorização de papel são barradas no backend sem fuga de dados.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Bloco 2: Isolamento Multiempresa */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>🏢</span> 2. Isolamento Estrito Multiempresa (Multi-Tenant Segregation)
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "16px" }}>
            A plataforma opera em modelo multi-tenant com segregação lógica absoluta em PostgreSQL. A pertença de um utilizador a uma empresa exige uma associação explícita (<code>CompanyMembership</code>).
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            <div style={{ borderLeft: "4px solid #0284c7", paddingLeft: "16px" }}>
              <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Chaves Forjadas são Bloqueadas</h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
                O envio forjado de cabeçalhos como <code>x-company-id</code> é imediatamente barrado com HTTP 403. O servidor extrai o contexto legítimo exclusivamente a partir do token criptográfico de sessão validado na base de dados.
              </p>
            </div>

            <div style={{ borderLeft: "4px solid #0284c7", paddingLeft: "16px" }}>
              <h4 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Segregação de Séries e Contabilidade</h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
                Séries documentais, numerações sequenciais, modelagem contabilística parametrizada, inventários e saldos correntes são estritamente isolados por chave composta <code>[companyId, branchId]</code>.
              </p>
            </div>
          </div>
        </section>

        {/* Bloco 3: Outbox e Idempotência */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>⚡</span> 3. Fila de Saída Offline (Outbox) e Garantia de Idempotência
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "16px" }}>
            Para operar sem interrupções em locais com conectividade instável, o Mutshima implementa o padrão arquitetural de <strong>Outbox Local com Chaves Determinísticas de Idempotência</strong>.
          </p>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px", fontSize: "13px", color: "#334155", lineHeight: 1.7 }}>
            <p style={{ margin: "0 0 8px 0" }}>
              • <strong>Chave Estável desde a Abertura:</strong> Cada venda, pagamento ou movimento de stock recebe uma <code>idempotencyKey</code> única no momento da sua criação local.
            </p>
            <p style={{ margin: "0 0 8px 0" }}>
              • <strong>Proteção contra Duplicações:</strong> Em caso de quebra de ligação durante o envio ou reenvios múltiplos (retries com backoff exponencial), o servidor reconhece a chave existente e devolve a confirmação original sem duplicar artigos, valores ou documentos fiscais.
            </p>
            <p style={{ margin: 0 }}>
              • <strong>Preservação de Conflitos:</strong> Mutações rejeitadas pelo backend nunca são eliminadas silenciosamente. Ficam registradas no estado explícito <code>CONFLICT</code> para inspeção e intervenção por operador autorizado.
            </p>
          </div>
        </section>

        {/* Bloco 4: Limites Reais de Armazenamento Mobile */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>📱</span> 4. Limites Reais de Armazenamento nos Dispositivos Móveis (Android / Tablet / PWA)
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "16px" }}>
            A operação offline local depende de armazenamento nos dispositivos dos postos de venda (IndexedDB no browser ou SQLite em aplicações nativas). É essencial que os operadores compreendam os limites operacionais reais:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Quotas Físicas do Sistema</h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
                O armazenamento disponível no dispositivo móvel é delimitado pelo sistema operativo e browser (frequentemente entre 50 MB e algumas centenas de MB de quota). O dispositivo local não é um arquivo permanente ilimitado.
              </p>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Recomendação de Sincronização</h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
                Recomenda-se sincronizar periodicamente o posto de venda com o servidor corporativo para descarregar a fila de transações pendentes, libertando espaço e garantindo o arquivo fiscal definitivo na base central.
              </p>
            </div>
          </div>
        </section>

        {/* Bloco 5: Matriz de Classificação Técnica Honesta */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
            5. Matriz de Maturidade Técnica dos Componentes de Segurança
          </h2>
          <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "12px" }}>
            Classificação interna e descritiva das capacidades de segurança do Mutshima:
          </p>
          <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "12px 16px", fontSize: "12px", color: "#334155", marginBottom: "20px", lineHeight: 1.6 }}>
            <strong>Âmbito da Classificação:</strong> A designação <strong>“Coberto por testes internos”</strong> indica exclusivamente cobertura por testes automatizados do próprio repositório e <strong>não equivale a certificação, homologação nem garantia externa</strong> por entidades oficiais ou auditorias independentes.
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", background: "#f8fafc" }}>
                  <th style={{ padding: "12px 14px", color: "#334155" }}>Componente</th>
                  <th style={{ padding: "12px 14px", color: "#334155" }}>Classificação</th>
                  <th style={{ padding: "12px 14px", color: "#334155" }}>Evidência Técnica & Estado Atual</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>RBAC e Proteção de Rotas API</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ background: "#dcfce7", color: "#166534", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>COBERTO POR TESTES INTERNOS</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>
                    Suíte interna com testes unitários e de integração PostgreSQL cobrindo ADMIN, MANAGER, CASHIER, OPERATOR e ACCOUNTANT.
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>Isolamento Multiempresa</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ background: "#dcfce7", color: "#166534", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>COBERTO POR TESTES INTERNOS</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>
                    Verificado por restrições únicas e validação de permissões por <code>CompanyMembership</code> no backend.
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>Idempotência de Vendas e Pagamentos</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ background: "#dcfce7", color: "#166534", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>COBERTO POR TESTES INTERNOS</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>
                    Chave determinística gerada no cliente e replay idempotente na API prevenindo duplicados.
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>Políticas de Sessão e Fecho Cego</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>CONFIGURÁVEL</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>
                    Parâmetros de fecho de caixa cego, limites operacionais e tempos de expiração de sessão ajustáveis por filial.
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>Chaves Físicas FIDO2 / WebAuthn</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ background: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>PENDENTE</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>
                    Planeado para ambientes de alta segurança física; atualmente baseado em par de tokens e PIN numérico criptografado.
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>Processo de Homologação e Conectividade Tributária</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ background: "#f1f5f9", color: "#475569", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>DEPENDÊNCIA EXTERNA</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>
                    Depende do deferimento administrativo, validação profissional e aprovação formal pela AGT.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Chamada para Ação / Navegação */}
        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => onNavigate("conformidade-fiscal")}
            style={{ marginRight: "12px" }}
          >
            Consultar Enquadramento Fiscal
          </button>
          <button
            type="button"
            className="btn-secondary-lg"
            onClick={() => onNavigate("entrar")}
          >
            Aceder ao Início de Sessão
          </button>
        </div>
      </div>
    </div>
  );
}
