import React, { useState, type FormEvent } from "react";
import {
  resolveInstitutionalContactChannels,
  type InstitutionalContactConfig,
} from "./institutional-contact";

export interface ContactPageProps {
  apiUrl: string;
  onNavigate: (view: string) => void;
  institutionalContact?: Partial<InstitutionalContactConfig>;
}

export interface ContactSubmissionInput {
  name: string;
  organization: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  consent: boolean;
  honeypot?: string;
}

export interface ContactSubmissionResult {
  status: "success" | "adapter_not_configured" | "error";
  feedbackMessage: string;
}

export async function submitContactRequest(
  input: ContactSubmissionInput,
  apiUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<ContactSubmissionResult> {
  if (!input.name.trim() || !input.organization.trim() || !input.email.trim() || !input.message.trim()) {
    return {
      status: "error",
      feedbackMessage: "Por favor, preencha todos os campos obrigatórios assinalados.",
    };
  }

  if (input.consent !== true) {
    return {
      status: "error",
      feedbackMessage: "O formulário só é enviado mediante consentimento explícito para tratamento destes dados.",
    };
  }

  try {
    const response = await fetchImpl(`${apiUrl}/api/v1/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name.trim(),
        organization: input.organization.trim(),
        email: input.email.trim(),
        phone: input.phone?.trim() || undefined,
        subject: input.subject.trim(),
        message: input.message.trim(),
        consent: true,
        honeypot: input.honeypot || undefined,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      error?: string;
    };

    if (response.status === 429) {
      return {
        status: "error",
        feedbackMessage: "Limite de envios excedido temporariamente. Por favor aguarde alguns minutos.",
      };
    }

    if (data.status === "adapter_not_configured" || response.status === 503) {
      return {
        status: "adapter_not_configured",
        feedbackMessage:
          data.message || "O canal de mensagens automáticas não se encontra ativo nesta instalação.",
      };
    }

    if (!response.ok) {
      return {
        status: "error",
        feedbackMessage: data.message || "Não foi possível registar o seu contacto. Tente mais tarde.",
      };
    }

    return {
      status: "success",
      feedbackMessage:
        data.message || "O seu pedido de contacto foi submetido com sucesso. Responderemos com a brevidade possível.",
    };
  } catch {
    return {
      status: "error",
      feedbackMessage: "Não foi possível estabelecer ligação ao servidor. Verifique a sua conectividade de rede.",
    };
  }
}

export function ContactPage({ apiUrl, onNavigate, institutionalContact }: ContactPageProps) {
  const channels = resolveInstitutionalContactChannels(institutionalContact);
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("Demonstração do ERP");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "adapter_not_configured" | "error">("idle");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !organization.trim() || !email.trim() || !message.trim()) {
      setStatus("error");
      setFeedbackMessage("Por favor, preencha todos os campos obrigatórios assinalados.");
      return;
    }

    if (!consent) {
      setStatus("error");
      setFeedbackMessage("O formulário só é enviado mediante consentimento explícito para tratamento destes dados.");
      return;
    }

    setLoading(true);
    setStatus("idle");
    setFeedbackMessage("");

    const result = await submitContactRequest(
      { name, organization, email, phone, subject, message, consent, honeypot },
      apiUrl
    );

    setStatus(result.status);
    setFeedbackMessage(result.feedbackMessage);

    if (result.status === "success") {
      // Limpeza segura dos campos em memória (sem persistência local)
      setName("");
      setOrganization("");
      setEmail("");
      setPhone("");
      setMessage("");
      setConsent(false);
    }

    setLoading(false);
  }

  return (
    <div className="contact-page">
      <section className="site-hero" style={{ padding: "48px 24px", textAlign: "center" }}>
        <div className="hero-container" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div
            className="hero-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(2, 132, 199, 0.1)",
              border: "1px solid #bae6fd",
              color: "#0369a1",
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: 700,
              marginBottom: "16px",
            }}
          >
            <span>✉️</span> Contacto e Demonstração Institucional
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 900, color: "#0f172a", marginBottom: "16px", lineHeight: 1.2 }}>
            Fale com a Equipa do VendaJá Angola
          </h1>
          <p style={{ fontSize: "16px", color: "#475569", lineHeight: 1.6, maxWidth: "760px", margin: "0 auto 24px auto" }}>
            Solicite uma demonstração técnica das soluções de faturação e POS, esclareça dúvidas sobre implantação multi-filial ou apresente propostas de parceria operacional.
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

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 24px 64px 24px" }}>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "36px 32px",
            boxShadow: "0 4px 14px rgba(15, 23, 42, 0.05)",
          }}
        >
          {/* Mensagens de Feedback Acessíveis */}
          {status === "error" && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#9f1239",
                padding: "14px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                marginBottom: "20px",
              }}
            >
              ⚠️ {feedbackMessage}
            </div>
          )}

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "14px 16px",
              fontSize: "13px",
              color: "#334155",
              marginBottom: "24px",
            }}
          >
            <strong>Canais Institucionais:</strong>{" "}
            {channels.hasAnyChannel ? (
              <span>
                {[
                  channels.email ? `Correio eletrónico: ${channels.email}` : null,
                  channels.phone ? `Telefone: ${channels.phone}` : null,
                  channels.address ? `Endereço: ${channels.address}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </span>
            ) : (
              <span>{channels.fallbackMessage}</span>
            )}
          </div>

          {status === "adapter_not_configured" && (
            <div
              role="status"
              style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                color: "#92400e",
                padding: "16px 18px",
                borderRadius: "8px",
                fontSize: "13px",
                lineHeight: 1.6,
                marginBottom: "24px",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: "4px" }}>ℹ️ Canal Automático Não Configurado</div>
              <p style={{ margin: "0 0 8px 0" }}>{feedbackMessage}</p>
              <div style={{ fontSize: "12px", color: "#b45309" }}>
                {channels.hasAnyChannel ? (
                  <>
                    <strong>Canais Institucionais Configurados:</strong>
                    {channels.email && (
                      <div>
                        • Correio Eletrónico: <code>{channels.email}</code>
                      </div>
                    )}
                    {channels.phone && (
                      <div>
                        • Telefone: <code>{channels.phone}</code>
                      </div>
                    )}
                    {channels.address && <div>• Endereço: {channels.address}</div>}
                  </>
                ) : (
                  <div>{channels.fallbackMessage}</div>
                )}
              </div>
            </div>
          )}

          {status === "success" && (
            <div
              role="status"
              style={{
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                padding: "16px 18px",
                borderRadius: "8px",
                fontSize: "14px",
                lineHeight: 1.6,
                marginBottom: "24px",
              }}
            >
              <strong>✅ Pedido Submetido com Sucesso</strong>
              <p style={{ margin: "6px 0 0 0" }}>{feedbackMessage}</p>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            {/* Campo Honeypot invisível contra spam */}
            <div style={{ position: "absolute", left: "-9999px", opacity: 0 }} aria-hidden="true">
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label
                  htmlFor="contact-name"
                  style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}
                >
                  Nome Completo *
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  placeholder="ex: João da Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="contact-org"
                  style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}
                >
                  Nome da Empresa ou Organização *
                </label>
                <input
                  id="contact-org"
                  type="text"
                  required
                  placeholder="Nome da empresa ou organização"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label
                  htmlFor="contact-email"
                  style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}
                >
                  Correio Eletrónico Profissional *
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  placeholder="Correio eletrónico profissional"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="contact-phone"
                  style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}
                >
                  Contacto Telefónico (Opcional)
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  placeholder="Telefone institucional (opcional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="contact-subject"
                style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}
              >
                Assunto do Contacto *
              </label>
              <select
                id="contact-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "14px",
                  background: "#ffffff",
                }}
              >
                <option value="Demonstração do ERP">Demonstração Técnica do ERP e POS</option>
                <option value="Informações Comerciais">Informações Comerciais e Planos</option>
                <option value="Parcerias e Integrações">Parcerias e Integração Tecnológica</option>
                <option value="Suporte Técnico">Suporte e Dúvidas de Implementação</option>
                <option value="Outro Assunto">Outro Assunto Institucional</option>
              </select>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="contact-message"
                style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}
              >
                Mensagem ou Descrição da Necessidade *
              </label>
              <textarea
                id="contact-message"
                required
                rows={5}
                minLength={10}
                maxLength={3000}
                placeholder="Descreva o número de postos de venda, localização e necessidades operacionais da sua entidade..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Consentimento Explícito Informado */}
            <div style={{ marginBottom: "24px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px 16px" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: "#334155", cursor: "pointer" }}>
                <input
                  id="contact-consent"
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={loading}
                  style={{ marginTop: "3px" }}
                />
                <span>
                  Declaro que autorizo o tratamento dos dados acima submetidos exclusivamente para efeitos de contacto,
                  esclarecimento e demonstração institucional do VendaJá Angola. Compreendo que os dados não são utilizados
                  para fins de publicidade não solicitada. *
                </span>
              </label>
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#475569", lineHeight: 1.5 }}>
                O formulário só é enviado mediante consentimento explícito. Os dados introduzidos não são armazenados localmente no navegador.
              </div>
              <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b" }}>
                Política formal de retenção e tratamento comercial: Requer revisão jurídica antes de publicação comercial.
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="submit"
                className="btn-primary-lg"
                disabled={loading || !consent}
                aria-disabled={loading || !consent}
                style={{ flex: 1, minWidth: "200px", justifyContent: "center" }}
              >
                {loading ? "A submeter contacto..." : "Submeter Pedido de Contacto"}
              </button>
              <button
                type="button"
                className="btn-secondary-lg"
                onClick={() => onNavigate("home")}
              >
                Voltar à Página Inicial
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
