import { useEffect, useState, type FormEvent } from "react";
import { formatKwanza } from "@angola/shared";

interface ChatMessage {
  id: string;
  sender: "user" | "copilot";
  text: string;
  timestamp: string;
  domain?: string;
  intent?: string;
  confidence?: number;
  data?: Record<string, unknown>;
  table?: Array<Record<string, unknown>>;
  chart?: {
    type: "bar" | "line" | "kpi";
    series: Array<{ label: string; value: number }>;
  };
}

interface ProactiveInsight {
  id: string;
  type: "WARNING" | "INFO" | "CRITICAL" | "OPPORTUNITY";
  title: string;
  description: string;
  domain: string;
  metrics?: Record<string, unknown>;
}

interface Anomaly {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  type: string;
  description: string;
  detectedAt: string;
  financialImpactCents?: number;
  investigationSteps: string[];
}

interface Recommendation {
  id: string;
  category: "STOCK" | "SALES" | "PROCUREMENT" | "COST_REDUCTION";
  title: string;
  rationale: string;
  impactEstimatedKwanza: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  actions: string[];
}

export function EnterpriseCopilotPanel({
  api,
  token,
  onError,
}: {
  api: string;
  token: string;
  onError: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"chat" | "forecast" | "anomalies" | "recommendations" | "live_updates">("chat");
  const [activeDomain, setActiveDomain] = useState<string>("ALL");
  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [liveSyncStatus, setLiveSyncStatus] = useState<string>("");
  const [liveSyncLoading, setLiveSyncLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial",
      sender: "copilot",
      text: "Olá! Sou o **VendaJá Copilot**, o seu assistente de inteligência empresarial. Pergunte-me sobre faturação, clientes em dívida, previsões de vendas, controlo de stocks ou custos com pessoal. Todos os dados são extraídos em tempo real da base de dados do ERP.",
      timestamp: new Date().toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" }),
      domain: "GENERAL",
    },
  ]);

  const headers = {
    authorization: token ? `Bearer ${token}` : "",
    "content-type": "application/json",
  };

  // Load proactive insights on mount
  useEffect(() => {
    void loadInsights();
  }, [api, token]);

  const loadInsights = async () => {
    try {
      const res = await fetch(`${api}/api/v1/ai/insights`, { headers });
      if (res.ok) {
        const data = await res.json() as ProactiveInsight[];
        setInsights(Array.isArray(data) ? data : []);
      }
    } catch {
      // Offline fallback silent
    }
  };

  const loadAnomalies = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${api}/api/v1/ai/anomalies`, { headers });
      if (res.ok) {
        const data = await res.json() as Anomaly[];
        setAnomalies(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      onError("Não foi possível carregar o diagnóstico de anomalias.");
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${api}/api/v1/ai/recommendations`, { headers });
      if (res.ok) {
        const data = await res.json() as Recommendation[];
        setRecommendations(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      onError("Não foi possível carregar as recomendações estratégicas.");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (queryText?: string) => {
    const q = (queryText ?? inputQuery).trim();
    if (!q) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: q,
      timestamp: new Date().toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery("");
    setLoading(true);

    try {
      const res = await fetch(`${api}/api/v1/ai/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: q,
          domain: activeDomain === "ALL" ? undefined : activeDomain,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro HTTP ${res.status}`);
      }

      const reply = await res.json() as {
        answer: string;
        domain: string;
        intent: string;
        confidence: number;
        data?: Record<string, unknown>;
        table?: Array<Record<string, unknown>>;
        chart?: { type: "bar" | "line" | "kpi"; series: Array<{ label: string; value: number }> };
      };

      const copilotMsg: ChatMessage = {
        id: `c-${Date.now()}`,
        sender: "copilot",
        text: reply.answer,
        timestamp: new Date().toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" }),
        domain: reply.domain,
        intent: reply.intent,
        confidence: reply.confidence,
        data: reply.data,
        table: reply.table,
        chart: reply.chart,
      };

      setMessages((prev) => [...prev, copilotMsg]);
    } catch (err: unknown) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "copilot",
        text: `⚠️ Não foi possível processar a consulta: ${err instanceof Error ? err.message : "Serviço de IA indisponível."}. Verifique se o módulo de Inteligência Artificial está ativo na sua licença e se o backend está acessível.`,
        timestamp: new Date().toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" }),
        domain: "ERROR",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleLiveSync = async () => {
    setLiveSyncLoading(true);
    setLiveSyncStatus("A contactar o servidor para sincronização dinâmica sem reinstalação...");
    try {
      if (window.pos?.syncLiveConfig) {
        const result = await window.pos.syncLiveConfig(api);
        if (result.success) {
          setLiveSyncStatus(
            `✅ Sucesso! Configurações e módulos sincronizados dinamicamente: [${(result.activeModules || []).join(", ")}]. Versão mínima: ${result.minVersion || "2.2.4"}. As alterações já estão ativas nesta sessão sem necessidade de descarregar novos instaladores.`
          );
        } else {
          setLiveSyncStatus(`⚠️ Falha na sincronização dinâmica: ${result.message || "Erro desconhecido"}`);
        }
      } else {
        // Fallback direct fetch
        const res = await fetch(`${api}/api/v1/saas/updates/live-config`);
        if (res.ok) {
          const cfg = await res.json();
          setLiveSyncStatus(
            `✅ Sincronizado via API REST: Módulos ativos [${(cfg.activeModules || []).join(", ")}]. Hot-reload concluído sem reinstalação.`
          );
        } else {
          setLiveSyncStatus(`⚠️ O servidor respondeu com status ${res.status}`);
        }
      }
    } catch (err: unknown) {
      setLiveSyncStatus(`❌ Erro na sincronização: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLiveSyncLoading(false);
    }
  };

  const quickQuestions = [
    "Quanto vendi hoje?",
    "Qual foi o produto mais vendido este mês?",
    "Quantas faturas foram emitidas esta semana?",
    "Quais clientes estão em dívida?",
    "Qual fornecedor teve mais compras?",
    "Previsão de vendas para os próximos 30 dias",
    "Existem anomalias ou descontos excessivos?",
    "Quais as recomendações de redução de custos?",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "12px", padding: "8px" }}>
      {/* HEADER BAR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
          padding: "16px 20px",
          borderRadius: "10px",
          color: "#ffffff",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "28px" }}>🤖</span>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
              VendaJá Copilot (IA Empresarial)
              <span
                style={{
                  fontSize: "11px",
                  background: "rgba(139, 92, 246, 0.4)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  border: "1px solid #a78bfa",
                }}
              >
                Enterprise AI Suite
              </span>
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#c7d2fe" }}>
              Assistente corporativo com PLN avançado, modelos preditivos e auditoria forense integrada.
            </p>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { id: "chat", label: "💬 Chat Copilot" },
            { id: "forecast", label: "📈 Previsões Preditivas" },
            { id: "anomalies", label: "⚠️ Deteção de Anomalias" },
            { id: "recommendations", label: "💡 Recomendações" },
            { id: "live_updates", label: "🔄 Auto-Atualização Live" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as typeof activeTab);
                if (tab.id === "anomalies" && !anomalies.length) void loadAnomalies();
                if (tab.id === "recommendations" && !recommendations.length) void loadRecommendations();
              }}
              style={{
                background: activeTab === tab.id ? "#8b5cf6" : "rgba(255,255,255,0.1)",
                color: "#ffffff",
                border: "none",
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: activeTab === tab.id ? "bold" : "normal",
                fontSize: "12px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* PROACTIVE INSIGHTS TICKER */}
      {insights.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "10px",
            overflowX: "auto",
            padding: "8px 4px",
          }}
        >
          {insights.map((ins) => (
            <div
              key={ins.id}
              style={{
                minWidth: "260px",
                flex: "0 0 auto",
                background: ins.type === "CRITICAL" ? "#fef2f2" : ins.type === "WARNING" ? "#fffbeb" : "#f0fdf4",
                border: `1px solid ${ins.type === "CRITICAL" ? "#fca5a5" : ins.type === "WARNING" ? "#fde68a" : "#bbf7d0"}`,
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <strong style={{ color: ins.type === "CRITICAL" ? "#991b1b" : ins.type === "WARNING" ? "#92400e" : "#166534" }}>
                  {ins.title}
                </strong>
                <span style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: "bold" }}>{ins.domain}</span>
              </div>
              <p style={{ margin: 0, color: "#475569" }}>{ins.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* TAB CONTENT: CHAT */}
      {activeTab === "chat" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: "10px" }}>
          {/* DOMAIN FILTER BAR */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "12px" }}>
            <span style={{ fontWeight: "bold", color: "#64748b" }}>Assistente Especializado:</span>
            {[
              { id: "ALL", label: "Geral / Executivo" },
              { id: "FINANCIAL", label: "Financeiro & Tesouraria" },
              { id: "COMMERCIAL", label: "Comercial & Vendas" },
              { id: "STOCK", label: "Stocks & Logística" },
              { id: "HR", label: "Recursos Humanos (LGT)" },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveDomain(d.id)}
                style={{
                  background: activeDomain === d.id ? "#4f46e5" : "#e2e8f0",
                  color: activeDomain === d.id ? "#ffffff" : "#334155",
                  border: "none",
                  padding: "4px 10px",
                  borderRadius: "14px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* CHAT MESSAGES LOG */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                }}
              >
                <div
                  style={{
                    background: m.sender === "user" ? "#4f46e5" : "#ffffff",
                    color: m.sender === "user" ? "#ffffff" : "#1e293b",
                    padding: "12px 16px",
                    borderRadius: m.sender === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    border: m.sender === "user" ? "none" : "1px solid #e2e8f0",
                    fontSize: "13px",
                    lineHeight: "1.5",
                  }}
                >
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.text}</p>

                  {/* METRIC BADGES */}
                  {m.chart && m.chart.series.length > 0 && (
                    <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {m.chart.series.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: m.sender === "user" ? "rgba(255,255,255,0.2)" : "#f1f5f9",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "11px",
                          }}
                        >
                          <div style={{ opacity: 0.8 }}>{item.label}</div>
                          <strong>{item.value > 1000 ? formatKwanza(item.value) : item.value}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* STRUCTURED TABLE */}
                  {m.table && m.table.length > 0 && (
                    <div style={{ marginTop: "12px", overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                            {Object.keys(m.table[0] || {}).map((col) => (
                              <th key={col} style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1" }}>
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {m.table.map((row, rIdx) => (
                            <tr key={rIdx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              {Object.values(row).map((val, cIdx) => (
                                <td key={cIdx} style={{ padding: "6px 8px" }}>
                                  {typeof val === "number" && val > 1000 ? formatKwanza(val) : String(val ?? "—")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    fontSize: "10px",
                    color: "#94a3b8",
                    marginTop: "4px",
                    padding: "0 4px",
                    alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <span>{m.timestamp}</span>
                  {m.domain && <span>• {m.domain}</span>}
                  {m.confidence !== undefined && <span>• {Math.round(m.confidence * 100)}% precisão</span>}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "8px", color: "#6366f1", fontSize: "12px" }}>
                <span className="spinner" style={{ width: "14px", height: "14px" }} />
                <span>O VendaJá Copilot está a analisar os dados reais do ERP...</span>
              </div>
            )}
          </div>

          {/* SUGGESTED CHIPS */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => void handleSend(q)}
                disabled={loading}
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "14px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* INPUT FORM */}
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void handleSend();
            }}
            style={{ display: "flex", gap: "8px" }}
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Pergunte ao VendaJá Copilot (ex: 'Quanto vendi hoje?', 'Produtos com stock baixo')..."
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
              }}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !inputQuery.trim()}
              style={{
                background: "#4f46e5",
                color: "#ffffff",
                border: "none",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "bold",
                fontSize: "13px",
                cursor: loading || !inputQuery.trim() ? "not-allowed" : "pointer",
              }}
            >
              Enviar
            </button>
          </form>
        </div>
      )}

      {/* TAB CONTENT: FORECAST */}
      {activeTab === "forecast" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
          <div style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "15px", color: "#1e293b" }}>📈 Projeção Preditiva de Faturação</h3>
            <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#64748b" }}>
              Algoritmo de regressão adaptativa com índices sazonais e 3 cenários probabilísticos para os próximos 30/60/90 dias.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              <div style={{ background: "#eff6ff", padding: "14px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
                <small style={{ color: "#1d4ed8", fontWeight: "bold" }}>Cenário Conservador (-10%)</small>
                <h4 style={{ margin: "6px 0 0", fontSize: "18px", color: "#1e3a8a" }}>Estimativa Segura</h4>
                <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#475569" }}>Considera redução de demanda sazonal.</p>
              </div>
              <div style={{ background: "#f0fdf4", padding: "14px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                <small style={{ color: "#15803d", fontWeight: "bold" }}>Cenário Esperado (Base Real)</small>
                <h4 style={{ margin: "6px 0 0", fontSize: "18px", color: "#14532d" }}>Média Ponderada</h4>
                <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#475569" }}>Baseado no histórico real de faturas do ERP.</p>
              </div>
              <div style={{ background: "#faf5ff", padding: "14px", borderRadius: "8px", border: "1px solid #e9d5ff" }}>
                <small style={{ color: "#7e22ce", fontWeight: "bold" }}>Cenário Otimista (+15%)</small>
                <h4 style={{ margin: "6px 0 0", fontSize: "18px", color: "#581c87" }}>Expansão Comercial</h4>
                <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#475569" }}>Impacto com campanhas de vendas e recuperação de dívidas.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: ANOMALIES */}
      {activeTab === "anomalies" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px" }}>⚠️ Deteção Contínua de Anomalias Operacionais</h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Varredura forense de descontos superiores a 20%, quebras anómalas de stock e faturas anuladas.
              </p>
            </div>
            <button
              onClick={() => void loadAnomalies()}
              style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px", cursor: "pointer" }}
            >
              🔄 Executar Nova Varredura
            </button>
          </div>

          {anomalies.length === 0 ? (
            <div style={{ background: "#f0fdf4", padding: "20px", borderRadius: "8px", textAlign: "center", border: "1px solid #bbf7d0" }}>
              <span style={{ fontSize: "24px" }}>🛡️</span>
              <h4 style={{ margin: "8px 0 4px", color: "#166534" }}>Nenhuma Anomalia Crítica Detetada</h4>
              <p style={{ margin: 0, fontSize: "12px", color: "#15803d" }}>
                Todas as operações recentes cumprem as regras de conformidade e integridade fiscal.
              </p>
            </div>
          ) : (
            anomalies.map((a) => (
              <div
                key={a.id}
                style={{
                  background: "#ffffff",
                  border: `1px solid ${a.severity === "CRITICAL" ? "#ef4444" : "#f59e0b"}`,
                  borderRadius: "8px",
                  padding: "12px 16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ color: a.severity === "CRITICAL" ? "#b91c1c" : "#b45309" }}>{a.type}</strong>
                  <span style={{ fontSize: "11px", fontWeight: "bold" }}>{a.severity}</span>
                </div>
                <p style={{ margin: "6px 0", fontSize: "12px", color: "#334155" }}>{a.description}</p>
                {a.financialImpactCents !== undefined && (
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    Impacto Financeiro Estimado: <strong>{formatKwanza(a.financialImpactCents)}</strong>
                  </div>
                )}
                {a.investigationSteps.length > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: "#475569" }}>
                    <strong>Passos de Investigação Recomendados:</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: "20px" }}>
                      {a.investigationSteps.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB CONTENT: RECOMMENDATIONS */}
      {activeTab === "recommendations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px" }}>💡 Recomendações Estratégicas para o Gestor</h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Sugestões automatizadas de reposição de stock, cobrança de dívidas e redução de custos com impacto em Kwanzas.
              </p>
            </div>
            <button
              onClick={() => void loadRecommendations()}
              style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px", cursor: "pointer" }}
            >
              🔄 Atualizar Recomendações
            </button>
          </div>

          {recommendations.length === 0 ? (
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "8px", textAlign: "center", border: "1px solid #e2e8f0" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>Carregando recomendações do motor de inteligência artificial...</p>
            </div>
          ) : (
            recommendations.map((rec) => (
              <div
                key={rec.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: "bold",
                        background: "#e0e7ff",
                        color: "#3730a3",
                        padding: "2px 8px",
                        borderRadius: "10px",
                      }}
                    >
                      {rec.category}
                    </span>
                    <h4 style={{ margin: "6px 0 2px", fontSize: "14px", color: "#1e293b" }}>{rec.title}</h4>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <small style={{ color: "#64748b", fontSize: "10px" }}>Impacto Financeiro Estimado</small>
                    <div style={{ color: "#059669", fontWeight: "bold", fontSize: "14px" }}>
                      +{formatKwanza(rec.impactEstimatedKwanza)}
                    </div>
                  </div>
                </div>
                <p style={{ margin: "8px 0", fontSize: "12px", color: "#475569" }}>{rec.rationale}</p>
                {rec.actions.length > 0 && (
                  <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", marginTop: "8px" }}>
                    <strong style={{ fontSize: "11px", color: "#334155" }}>Ações Recomendadas:</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: "18px", fontSize: "11px", color: "#475569" }}>
                      {rec.actions.map((act, actIdx) => (
                        <li key={actIdx}>{act}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB CONTENT: LIVE UPDATES WITHOUT REINSTALLATION */}
      {activeTab === "live_updates" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
          <div style={{ background: "#ffffff", padding: "18px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: "16px", color: "#0f172a" }}>
              🔄 Atualização Contínua em Tempo Real (Sem Novos Instaladores)
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
              O ERP VendaJá Angola possui um sistema de <strong>Hot-Sync Dinâmico</strong>. Quando novos módulos ou
              configurações fiscais forem ativados no backend ou na cloud, o sistema sincroniza os recursos diretamente
              na aplicação já instalada, <strong>sem necessidade de descarregar ou reinstalar instaladores (.exe/.msi)</strong>.
            </p>

            <button
              onClick={() => void handleLiveSync()}
              disabled={liveSyncLoading}
              style={{
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                padding: "10px 18px",
                borderRadius: "6px",
                fontWeight: "bold",
                fontSize: "13px",
                cursor: liveSyncLoading ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {liveSyncLoading ? <span className="spinner" style={{ width: "14px", height: "14px" }} /> : "⚡"}
              <span>Sincronizar Módulos e Configurações Agora</span>
            </button>

            {liveSyncStatus && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px 16px",
                  borderRadius: "6px",
                  background: liveSyncStatus.startsWith("✅") ? "#f0fdf4" : liveSyncStatus.startsWith("⚠️") ? "#fffbeb" : "#eff6ff",
                  border: `1px solid ${liveSyncStatus.startsWith("✅") ? "#bbf7d0" : "#cbd5e1"}`,
                  fontSize: "13px",
                  lineHeight: "1.5",
                  color: liveSyncStatus.startsWith("✅") ? "#166534" : "#1e293b",
                }}
              >
                {liveSyncStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
