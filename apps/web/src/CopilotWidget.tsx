import { useState, useEffect, useRef } from "react";
import { formatKwanza } from "@angola/shared";

interface Props {
  apiUrl: string;
  contextModule?: string;
  standalone?: boolean;
}

interface CopilotMessage {
  id: string;
  sender: "user" | "copilot";
  timestamp: string;
  text: string;
  domain?: string;
  metrics?: Array<{ label: string; value: string; trend?: "UP" | "DOWN" | "NEUTRAL" }>;
  table?: { title?: string; headers: string[]; rows: (string | number)[][] };
  chart?: { type: string; title: string; labels: string[]; series: Array<{ name: string; data: number[] }> };
  insights?: string[];
  recommendations?: string[];
  source?: string;
  isError?: boolean;
}

export function CopilotWidget({ apiUrl, contextModule = "DASHBOARD", standalone = true }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: "welcome-1",
      sender: "copilot",
      timestamp: new Date().toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" }),
      text: "Olá! Sou o **VendaJá Copilot**, o assistente executivo com Inteligência Artificial do ERP VendaJá Angola. Como posso apoiar a sua gestão hoje?",
      insights: [
        "Estou conectado à base de dados real do ERP e respondo com indicadores auditáveis.",
        "Pode perguntar sobre Vendas, Finanças, Tesouraria, Stocks, Recursos Humanos ou Previsões.",
      ],
      recommendations: [
        "Clique numa das perguntas sugeridas abaixo para uma análise imediata.",
      ],
      source: "LIVE_DATABASE",
    },
  ]);

  const [proactiveInsights, setProactiveInsights] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    // Load proactive insights on mount
    fetch(`${apiUrl}/api/v1/ai/insights`, {
      headers: {
        authorization: `Bearer ${localStorage.getItem("accessToken") || ""}`,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.insights) setProactiveInsights(data.insights);
      })
      .catch(() => {});
  }, [apiUrl]);

  const quickQuestions = [
    { label: "📊 Quanto vendi hoje?", q: "Quanto vendi hoje?" },
    { label: "🏆 Top produto do mês", q: "Qual foi o produto mais vendido este mês?" },
    { label: "💳 Saldo de caixa atual", q: "Qual é o saldo de caixa atual?" },
    { label: "⚠️ Stock crítico", q: "Quais produtos estão com stock crítico?" },
    { label: "👥 Colaboradores de férias", q: "Quantos colaboradores estão de férias?" },
    { label: "📈 Previsão de vendas", q: "Previsão de vendas para o próximo mês" },
    { label: "🔍 Deteção de anomalias", q: "Quais anomalias e irregularidades foram detetadas?" },
    { label: "💡 Recomendações estratégicas", q: "Quais são as recomendações do Copilot?" },
  ];

  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend || query).trim();
    if (!prompt || loading) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      timestamp: new Date().toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" }),
      text: prompt,
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery("");
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${localStorage.getItem("accessToken") || ""}`,
        },
        body: JSON.stringify({
          query: prompt,
          contextModule,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();

      const copilotMsg: CopilotMessage = {
        id: `copilot-${Date.now()}`,
        sender: "copilot",
        timestamp: new Date().toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" }),
        text: data.textAnswer,
        domain: data.domain,
        metrics: data.metrics,
        table: data.table,
        chart: data.chart,
        insights: data.insights,
        recommendations: data.recommendations,
        source: data.source,
      };

      setMessages((prev) => [...prev, copilotMsg]);
    } catch (err: any) {
      const errorMsg: CopilotMessage = {
        id: `error-${Date.now()}`,
        sender: "copilot",
        timestamp: new Date().toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" }),
        text: `⚠️ Não foi possível obter resposta no momento: ${err.message}. Verifique a ligação ou as permissões de acesso.`,
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="copilot-container"
      style={{
        display: "flex",
        flexDirection: "column",
        height: standalone ? "calc(100vh - 120px)" : "600px",
        background: "#0f172a",
        color: "#f8fafc",
        fontFamily: "system-ui, -apple-system, sans-serif",
        borderRadius: "8px",
        border: "1px solid #1e293b",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 18px",
          background: "#1e293b",
          borderBottom: "1px solid #334155",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px" }}>🤖</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#38bdf8" }}>
              VendaJá Copilot — IA Empresarial Integrada
            </div>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>
              Assistente Corporativo em Linguagem Natural · Dados Reais Auditados
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            style={{
              fontSize: "11px",
              padding: "3px 8px",
              borderRadius: "12px",
              background: "#065f46",
              color: "#a7f3d0",
              fontWeight: 600,
            }}
          >
            ● Motor IA Ativo
          </span>
        </div>
      </div>

      {/* Proactive Insights Ribbon */}
      {proactiveInsights.length > 0 && (
        <div
          style={{
            background: "#1e293b",
            padding: "6px 16px",
            borderBottom: "1px solid #334155",
            display: "flex",
            gap: "12px",
            overflowX: "auto",
            fontSize: "12px",
          }}
        >
          <span style={{ color: "#f59e0b", fontWeight: 700 }}>⚡ Insights Proativos:</span>
          {proactiveInsights.slice(0, 3).map((ins) => (
            <span key={ins.id} style={{ color: "#cbd5e1" }}>
              • <strong>[{ins.category}]</strong> {ins.message}
            </span>
          ))}
        </div>
      )}

      {/* Quick Question Chips */}
      <div
        style={{
          padding: "8px 16px",
          background: "#090d16",
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          whiteSpace: "nowrap",
          borderBottom: "1px solid #1e293b",
        }}
      >
        {quickQuestions.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(chip.q)}
            style={{
              padding: "4px 10px",
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "16px",
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Chat Messages Log */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: m.sender === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: "#64748b",
                marginBottom: "4px",
                display: "flex",
                gap: "6px",
              }}
            >
              <span>{m.sender === "user" ? "Você" : "🤖 VendaJá Copilot"}</span>
              <span>· {m.timestamp}</span>
              {m.source && (
                <span
                  style={{
                    color: m.source === "LIVE_DATABASE" ? "#10b981" : "#f59e0b",
                    fontWeight: 600,
                  }}
                >
                  [{m.source === "LIVE_DATABASE" ? "Base de Dados Real" : "Cubo Local"}]
                </span>
              )}
            </div>

            <div
              style={{
                maxWidth: "85%",
                padding: "12px 16px",
                borderRadius: "10px",
                background: m.sender === "user" ? "#0284c7" : "#1e293b",
                color: "#ffffff",
                fontSize: "13px",
                lineHeight: "1.5",
                border: m.isError ? "1px solid #ef4444" : "1px solid #334155",
              }}
            >
              <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>

              {/* KPI Metrics Cards */}
              {m.metrics && m.metrics.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "8px",
                    marginTop: "12px",
                  }}
                >
                  {m.metrics.map((met, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px",
                        background: "#0f172a",
                        borderRadius: "6px",
                        border: "1px solid #334155",
                      }}
                    >
                      <div style={{ fontSize: "10px", color: "#94a3b8" }}>{met.label}</div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: met.trend === "UP" ? "#34d399" : met.trend === "DOWN" ? "#f87171" : "#38bdf8",
                        }}
                      >
                        {met.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Data Table */}
              {m.table && (
                <div style={{ marginTop: "12px", overflowX: "auto" }}>
                  {m.table.title && (
                    <div style={{ fontWeight: 600, fontSize: "12px", color: "#93c5fd", marginBottom: "4px" }}>
                      {m.table.title}
                    </div>
                  )}
                  <table
                    style={{
                      width: "100%",
                      fontSize: "11px",
                      borderCollapse: "collapse",
                      background: "#0f172a",
                      borderRadius: "4px",
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                        {m.table.headers.map((h, i) => (
                          <th key={i} style={{ padding: "6px", textAlign: "left" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.table.rows.map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: "1px solid #1e293b" }}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} style={{ padding: "6px" }}>
                              {String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Insights List */}
              {m.insights && m.insights.length > 0 && (
                <div style={{ marginTop: "10px", fontSize: "11px", color: "#cbd5e1" }}>
                  <strong style={{ color: "#67e8f9" }}>📌 Insights Analíticos:</strong>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    {m.insights.map((ins, i) => (
                      <li key={i}>{ins}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {m.recommendations && m.recommendations.length > 0 && (
                <div style={{ marginTop: "8px", fontSize: "11px", color: "#a7f3d0" }}>
                  <strong>💡 Ações Recomendadas:</strong>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    {m.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "#94a3b8", fontSize: "12px" }}>
            <span className="spinner" style={{ width: "16px", height: "16px", border: "2px solid #38bdf8" }} />
            <span>O VendaJá Copilot está a analisar a base de dados real…</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        style={{
          padding: "12px",
          background: "#1e293b",
          borderTop: "1px solid #334155",
          display: "flex",
          gap: "8px",
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pergunte ao VendaJá Copilot (ex: 'Quanto vendi hoje?', 'Stock crítico', 'Previsão de vendas')…"
          style={{
            flex: 1,
            padding: "10px 14px",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#ffffff",
            fontSize: "13px",
          }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: "10px 20px",
            background: loading || !query.trim() ? "#475569" : "#0284c7",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            fontWeight: 600,
            cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>Enviar</span>
          <span>➜</span>
        </button>
      </form>
    </div>
  );
}
