import React, { useState } from "react";
import { viewToUrl, type OmnichannelView } from "./router";

export interface SiteHeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const HEADER_NAV_ITEMS: ReadonlyArray<{ view: OmnichannelView; label: string }> = [
  { view: "home", label: "Início" },
  { view: "solucoes", label: "Soluções" },
  { view: "modulos", label: "Módulos" },
  { view: "seguranca", label: "Segurança" },
  { view: "conformidade-fiscal", label: "Conformidade Fiscal" },
  { view: "sobre", label: "Sobre" },
  { view: "contacto", label: "Contacto" },
];

export function SiteHeader({ currentView, onNavigate }: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigateTo = (view: OmnichannelView) => {
    setMobileMenuOpen(false);
    onNavigate(view);
  };

  return (
    <header className="site-header" role="banner">
      <a href="#main-content" className="skip-link">
        Saltar para o conteúdo principal
      </a>
      <div className="site-header-container">
        <a
          href={viewToUrl("home")}
          className="site-brand"
          onClick={(e) => {
            e.preventDefault();
            navigateTo("home");
          }}
          aria-label="Mutshima - Página Inicial"
        >
          <div className="site-logo-badge" aria-hidden="true">M</div>
          <div className="site-brand-text">
            <h1>Mutshima</h1>
            <span className="site-brand-tagline">Comércio, Faturação e ERP Soberano</span>
          </div>
        </a>

        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-label="Alternar menu de navegação"
        >
          {mobileMenuOpen ? "✕" : "☰"}
        </button>

        <nav
          className={`site-nav ${mobileMenuOpen ? "open" : ""}`}
          role="navigation"
          aria-label="Navegação institucional"
        >
          {HEADER_NAV_ITEMS.map((item) => {
            const isActive = currentView === item.view;
            return (
              <a
                key={item.view}
                href={viewToUrl(item.view)}
                className={`site-nav-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(item.view);
                }}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="site-header-actions">
          <a
            href={viewToUrl("entrar")}
            className="btn-enter-erp"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("entrar");
            }}
            title="Entrar no ERP Web ou nos Portais Integrados"
          >
            <span aria-hidden="true">💼</span> Entrar
          </a>
        </div>
      </div>
    </header>
  );
}
