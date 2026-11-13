import React, { useState } from "react";

export interface StatusPageProps {
  apiUrl: string;
  onNavigate: (view: string) => void;
}

export function StatusPage({ apiUrl, onNavigate }: StatusPageProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    connected: boolean;
    latencyMs?: number;
    error?: string;
  }>({ tested: false, connected: false });

  const runLocalDiagnostic = async () => {
    setTesting(true);
    const start = performance.now();
    try {
      const response = await fetch(`${apiUrl}/api/v1/health`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const end = performance.now();
      const latency = Math.round(end - start);

      if (response.ok) {
        setTestResult({
          tested: true,
          connected: true,
          latencyMs: latency,
        });
      } else {
        setTestResult({
          tested: true,
          connected: false,
          latencyMs: latency,
          error: `O servidor respondeu com código HTTP ${response.status}.`,
        });
      }
    } catch {
      setTestResult({
        tested: true,
        connected: false,
        error: "Não foi possível estabelecer ligação com o endereço da API configurada.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="status-page">
      <section className="site-hero" style={{ padding: "48px 24px", textAlign: "center" }}>
        <div className="hero-container" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div className="hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(100, 116, 139, 0.1)", border: "1px solid #cbd5e1", color: "#475569", padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, marginBottom: "16px" }}>
            <span>📡</span> Estado Técnico e Diagnóstico
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 900, color: "#0f172a", marginBottom: "16px", lineHeight: 1.2 }}>
            Disponibilidade e Diagnóstico de Conectividade
          </h1>
          <p style={{ fontSize: "16px", color: "#475569", lineHeight: 1.6, maxWidth: "760px", margin: "0 auto 24px auto" }}>
            Transparência técnica sobre serviços públicos, testes de comunicação do posto de venda e integridade do armazenamento local.
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

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 24px 64px 24px" }}>
        {/* Painel de Transparência sobre Uptime Público */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "8px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
              ℹ️
            </div>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: "0 0 8px 0" }}>
                Monitorização Central Pública
              </h2>
              <div style={{ display: "inline-block", background: "#f1f5f9", color: "#475569", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, marginBottom: "12px" }}>
                Estado público indisponível
              </div>
              <p style={{ color: "#475569", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
                O VendaJá Angola não apresenta métricas artificiais de uptime sem um serviço público de telemetria independente e auditável. As instalações corporativas operam em infraestruturas dedicadas de cada cliente ou em servidores de desenvolvimento, dependendo do regime contratual.
              </p>
            </div>
          </div>
        </section>

        {/* Diagnóstico de Conectividade Local do Cliente */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", marginBottom: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🔍</span> Diagnóstico de Ligação do Dispositivo Local
          </h2>
          <p style={{ color: "#475569", fontSize: "13px", lineHeight: 1.6, marginBottom: "20px" }}>
            Verifique a partir do seu navegador a comunicação entre este posto de trabalho e o servidor da API ativo:
          </p>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Servidor de API Configurado:</div>
            <code style={{ fontSize: "13px", color: "#0369a1", fontWeight: 600, wordBreak: "break-all" }}>{apiUrl}</code>
          </div>

          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => void runLocalDiagnostic()}
            disabled={testing}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {testing ? "A verificar ligação ao servidor..." : "Testar Ligação ao Servidor Local"}
          </button>

          {testResult.tested && (
            <div
              role="status"
              style={{
                marginTop: "20px",
                padding: "16px",
                borderRadius: "8px",
                background: testResult.connected ? "#ecfdf5" : "#fff1f2",
                border: `1px solid ${testResult.connected ? "#a7f3d0" : "#fecdd3"}`,
                color: testResult.connected ? "#065f46" : "#9f1239",
                fontSize: "13px",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                {testResult.connected ? "✅ Ligação estabelecida com sucesso" : "❌ Servidor não acessível"}
              </div>
              <div>
                {testResult.connected
                  ? `O servidor respondeu com sucesso ao teste de conectividade (latência aproximada: ${testResult.latencyMs} ms).`
                  : testResult.error}
              </div>
            </div>
          )}
        </section>

        {/* Informações Seguras de Ambiente Local */}
        <section style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "32px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: "0 0 16px 0" }}>
            Políticas de Salvaguarda de Informação Interna
          </h2>
          <ul style={{ paddingLeft: "18px", margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.7 }}>
            <li>Por razões de segurança, não são expostas topologias internas de rede, endereços IP privados ou métricas do sistema operativo a acessos não autenticados.</li>
            <li>Consultas a cockpits consolidados, audit logs e eventos de nós requerem autenticação formal com perfis <code>ADMIN</code> ou <code>MANAGER</code>.</li>
            <li>Tokens de sessão ou credenciais fiscais nunca são incluídos em pacotes públicos ou respostas de diagnóstico anónimas.</li>
          </ul>
        </section>

        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <button
            type="button"
            className="btn-primary-lg"
            onClick={() => onNavigate("home")}
          >
            Voltar à Página Inicial
          </button>
        </div>
      </div>
    </div>
  );
}
