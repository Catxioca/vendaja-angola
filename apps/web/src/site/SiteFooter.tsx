import React from "react";
import { viewToUrl, type OmnichannelView } from "./router";
import {
  resolveInstitutionalContactChannels,
  type InstitutionalContactConfig,
} from "./institutional-contact";

export interface SiteFooterProps {
  onNavigate: (view: string) => void;
  institutionalContact?: Partial<InstitutionalContactConfig>;
}

function FooterNavLink({
  view,
  label,
  onNavigate,
}: {
  view: OmnichannelView;
  label: string;
  onNavigate: (view: string) => void;
}) {
  return (
    <li>
      <a
        href={viewToUrl(view)}
        onClick={(e) => {
          e.preventDefault();
          onNavigate(view);
        }}
      >
        {label}
      </a>
    </li>
  );
}

export function SiteFooter({ onNavigate, institutionalContact }: SiteFooterProps) {
  const channels = resolveInstitutionalContactChannels(institutionalContact);

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-container">
        <div className="footer-top">
          <div className="footer-brand">
            <h3>Mutshima</h3>
            <p>
              Plataforma soberana de gestão comercial, faturação híbrida e portais omnichannel.
              Concebida de raiz para a realidade operacional angolana, combinando alta resiliência
              offline nos postos de venda e sincronização transacional em nuvem central.
            </p>
            <div className="footer-version" title="Versão do Release Candidate">
              Versão 3.2.2-rc.4
            </div>
          </div>

          <div className="footer-col">
            <h4>Navegação</h4>
            <ul className="footer-links">
              <FooterNavLink view="home" label="Página Inicial" onNavigate={onNavigate} />
              <FooterNavLink view="solucoes" label="Soluções Verticais" onNavigate={onNavigate} />
              <FooterNavLink view="modulos" label="Catálogo de Módulos" onNavigate={onNavigate} />
              <FooterNavLink view="sobre" label="Sobre o Mutshima" onNavigate={onNavigate} />
              <FooterNavLink view="entrar" label="Entrar no ERP" onNavigate={onNavigate} />
              <FooterNavLink view="criar-conta" label="Criar Conta Inicial" onNavigate={onNavigate} />
              <FooterNavLink view="contacto" label="Contacto & Demonstração" onNavigate={onNavigate} />
            </ul>
          </div>

          <div className="footer-col">
            <h4>Segurança & Governação</h4>
            <ul className="footer-links">
              <FooterNavLink view="seguranca" label="🛡️ Segurança e RBAC" onNavigate={onNavigate} />
              <FooterNavLink view="conformidade-fiscal" label="📜 Conformidade Fiscal" onNavigate={onNavigate} />
              <FooterNavLink view="privacidade" label="🔒 Privacidade de Dados" onNavigate={onNavigate} />
              <FooterNavLink view="termos" label="📄 Termos de Utilização" onNavigate={onNavigate} />
              <FooterNavLink view="estado" label="📡 Estado e Diagnóstico" onNavigate={onNavigate} />
            </ul>
          </div>

          <div className="footer-col">
            <h4>Portais Self-Service</h4>
            <ul className="footer-links">
              <FooterNavLink view="portal-cliente" label="🏢 Portal do Cliente" onNavigate={onNavigate} />
              <FooterNavLink view="portal-fornecedor" label="🚚 Portal do Fornecedor" onNavigate={onNavigate} />
              <FooterNavLink view="portal-colaborador" label="👥 Portal do Colaborador" onNavigate={onNavigate} />
              <FooterNavLink view="portal-rh" label="🧑‍💼 Portal de RH" onNavigate={onNavigate} />
              <FooterNavLink view="portal-comercial" label="📊 Portal Comercial" onNavigate={onNavigate} />
            </ul>
          </div>

          <div className="footer-col">
            <h4>Ambientes & Clientes</h4>
            <ul className="footer-links">
              <FooterNavLink view="erp" label="💻 Web ERP Desktop" onNavigate={onNavigate} />
              <FooterNavLink view="mobile-erp" label="📱 Mobile ERP & Tablet POS" onNavigate={onNavigate} />
              {channels.hasAnyChannel ? (
                <>
                  {channels.email && (
                    <li>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Correio institucional:{" "}
                        <a href={`mailto:${channels.email}`} style={{ color: "#94a3b8" }}>
                          {channels.email}
                        </a>
                      </span>
                    </li>
                  )}
                  {channels.phone && (
                    <li>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Telefone institucional:{" "}
                        <a href={`tel:${channels.phone}`} style={{ color: "#94a3b8" }}>
                          {channels.phone}
                        </a>
                      </span>
                    </li>
                  )}
                  {channels.address && (
                    <li>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Endereço institucional: <span style={{ color: "#94a3b8" }}>{channels.address}</span>
                      </span>
                    </li>
                  )}
                </>
              ) : (
                <li>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Contacto institucional: {channels.fallbackMessage}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="footer-compliance-box">
          <h5>Declaração Regulamentar & Transparência Fiscal</h5>
          <p>
            <strong>“Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.”</strong>
          </p>
          <p style={{ marginTop: "6px", color: "#94a3b8" }}>
            A emissão de documentos fiscais definitivos em ambiente de produção depende
            estritamente da aprovação formal pela Administração Geral Tributária (AGT), de validação profissional
            e da fonte oficial vigente. O suporte a periféricos físicos (impressoras térmicas de 58/80mm,
            gavetas de dinheiro e leitores de código de barras) e serviços bancários de terceiros (Multicaixa / EMIS)
            depende de hardware compatível, drivers de sistema e contratos comerciais ativos com os respetivos operadores.
          </p>
        </div>

        <div className="footer-bottom">
          <div>
            © {new Date().getFullYear()} Mutshima. Todos os direitos reservados. Soberania tecnológica no comércio nacional.
          </div>
          <div>
            {channels.address
              ? `${channels.address} • Conectividade Híbrida & Offline-First`
              : "Conectividade Híbrida & Offline-First"}
          </div>
        </div>
      </div>
    </footer>
  );
}
