/**
 * Configuração Centralizada de SEO, Origem Canónica e Indexação — VendaJá Angola
 *
 * Regras estruturais:
 * - Origem canónica é configurada por ambiente (VITE_PUBLIC_SITE_ORIGIN / PUBLIC_SITE_ORIGIN).
 * - Nunca presume vendaja.ao quando o domínio não está configurado/aprovado.
 * - Em desenvolvimento/local, não gera canonical, sitemap, OG URL ou JSON-LD de produção fictícios.
 * - Rotas privadas, portais e ecrãs de autenticação são excluídos da indexação.
 */

export interface PageSeoMetadata {
  title: string;
  description: string;
  canonicalPath: string | null;
  canonicalUrl?: string | null;
  indexable: boolean;
}

export const PUBLIC_INDEXABLE_SEO_CATALOG: Record<string, Omit<PageSeoMetadata, "canonicalUrl">> = {
  home: {
    title: "Mutshima — Software de Gestão Comercial e ERP Soberano",
    description:
      "Plataforma integrada de gestão comercial, faturação, POS, inventário, compras, tesouraria e contabilidade em Angola.",
    canonicalPath: "/",
    indexable: true,
  },
  solucoes: {
    title: "Soluções Empresariais — Mutshima",
    description:
      "Soluções de POS balcão, faturação, armazéns, compras, tesouraria, contabilidade e multiempresa para Desktop, Web e Android.",
    canonicalPath: "/solucoes",
    indexable: true,
  },
  modulos: {
    title: "Módulos & Matriz de Capacidades — Mutshima",
    description:
      "Matriz factual dos módulos disponíveis no ecossistema Mutshima com classificação transparente de dependências.",
    canonicalPath: "/modulos",
    indexable: true,
  },
  seguranca: {
    title: "Segurança, RBAC & Governação Soberana — Mutshima",
    description:
      "Arquitetura de isolamento multiempresa, outbox criptográfico offline, RBAC granular e integridade no Mutshima.",
    canonicalPath: "/seguranca",
    indexable: true,
  },
  "conformidade-fiscal": {
    title: "Conformidade Fiscal & SAF-T Angola — Mutshima",
    description:
      "Estrutura técnica para faturação angolana e SAF-T (AO). Preparado tecnicamente para homologação; não homologado até aprovação formal da AGT.",
    canonicalPath: "/conformidade-fiscal",
    indexable: true,
  },
  sobre: {
    title: "Sobre o Mutshima — Engenharia e Visão Institucional",
    description:
      "Conheça a arquitetura offline-first, base única ERP/POS/Mobile e os princípios de transparência técnica do Mutshima.",
    canonicalPath: "/sobre",
    indexable: true,
  },
  contacto: {
    title: "Contacto & Demonstração — Mutshima",
    description:
      "Entre em contacto com a equipa técnica e comercial do Mutshima para pedidos de informação e demonstrações institucionais.",
    canonicalPath: "/contacto",
    indexable: true,
  },
  estado: {
    title: "Estado dos Serviços & Conetividade — Mutshima",
    description:
      "Monitorização em tempo real do estado de conetividade da API, sincronização offline e serviços centrais do Mutshima.",
    canonicalPath: "/estado",
    indexable: true,
  },
  privacidade: {
    title: "Política de Privacidade — Mutshima",
    description:
      "Compromisso de proteção de dados, soberania empresarial e privacidade no tratamento de informação comercial.",
    canonicalPath: "/privacidade",
    indexable: true,
  },
  termos: {
    title: "Termos & Condições de Utilização — Mutshima",
    description:
      "Termos de licenciamento de software, responsabilidade operacional e utilização da plataforma Mutshima.",
    canonicalPath: "/termos",
    indexable: true,
  },
};

export const NON_INDEXABLE_SEO_CATALOG: Record<string, Omit<PageSeoMetadata, "canonicalUrl">> = {
  entrar: {
    title: "Iniciar Sessão — Mutshima",
    description:
      "Acesso autenticado à plataforma de gestão empresarial e aos portais de clientes, fornecedores e colaboradores.",
    canonicalPath: null,
    indexable: false,
  },
  "criar-conta": {
    title: "Criar Conta de Administrador — Mutshima",
    description:
      "Configuração inicial da empresa e registo do primeiro utilizador administrador no sistema Mutshima.",
    canonicalPath: null,
    indexable: false,
  },
};

// Compatibilidade de catálogo mantendo identificação explícita de rotas indexáveis vs não-indexáveis
export const SITE_SEO_CATALOG: Record<string, Omit<PageSeoMetadata, "canonicalUrl">> = {
  ...PUBLIC_INDEXABLE_SEO_CATALOG,
  ...NON_INDEXABLE_SEO_CATALOG,
};

export const PRIVATE_DISALLOW_PATHS: readonly string[] = [
  "/api/",
  "/app",
  "/entrar",
  "/login",
  "/criar-conta",
  "/bootstrap",
  "/erp",
  "/mobile-erp",
  "/mobile",
  "/copilot",
  "/portal-cliente",
  "/customer-portal",
  "/portal-fornecedor",
  "/supplier-portal",
  "/portal-colaborador",
  "/employee-portal",
  "/portal-rh",
  "/portal-comercial",
  "/portal-admin",
  "/portal-",
] as const;

const DEFAULT_PRIVATE_SEO_METADATA: Omit<PageSeoMetadata, "canonicalUrl"> = {
  title: "Área Autenticada — Mutshima",
  description: "Ambiente operacional autenticado e multiempresa do Mutshima.",
  canonicalPath: null,
  indexable: false,
};

function readConfiguredOriginEnv(): string | null {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> })?.env;
    const candidate =
      (typeof metaEnv?.VITE_PUBLIC_SITE_ORIGIN === "string" ? metaEnv.VITE_PUBLIC_SITE_ORIGIN : null) ??
      (typeof metaEnv?.PUBLIC_SITE_ORIGIN === "string" ? metaEnv.PUBLIC_SITE_ORIGIN : null);
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  } catch {
    // Fallback seguro em ambiente Node
  }

  if (typeof process !== "undefined" && process.env) {
    const candidate = process.env.VITE_PUBLIC_SITE_ORIGIN ?? process.env.PUBLIC_SITE_ORIGIN;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

export function isLocalOrNonPublicOrigin(rawOrigin: string): boolean {
  const trimmed = rawOrigin.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  if (trimmed.startsWith("file:") || trimmed.startsWith("capacitor:")) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return true;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local")
    ) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export interface ResolveCanonicalOriginOptions {
  configuredOrigin?: string | null;
  runtimeOrigin?: string | null;
}

/**
 * Resolve a origem canónica pública apenas quando configurada e aprovada fora de desenvolvimento/local.
 * Nunca assume `vendaja.ao` por omissão.
 */
export function resolveCanonicalOrigin(options?: ResolveCanonicalOriginOptions): string | null {
  const runtimeOrigin =
    options && "runtimeOrigin" in options
      ? options.runtimeOrigin
      : typeof window !== "undefined" && window.location
        ? window.location.origin
        : null;

  const hasExplicitConfiguredKey = Boolean(options && "configuredOrigin" in options);
  const configured = hasExplicitConfiguredKey
    ? (options?.configuredOrigin?.trim() || null)
    : readConfiguredOriginEnv();

  if (!configured) {
    return null;
  }

  if (isLocalOrNonPublicOrigin(configured)) {
    return null;
  }

  // Em execução local (localhost / 127.0.0.1 / Capacitor / file://), não gerar canonical/OG de produção fictícios
  // a menos que uma origem aprovada explícita tenha sido passada via options.configuredOrigin para testes/build.
  if (!hasExplicitConfiguredKey && runtimeOrigin && isLocalOrNonPublicOrigin(runtimeOrigin)) {
    return null;
  }

  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

export function buildRobotsTxtContent(origin: string | null): string {
  const allowLines = Object.values(PUBLIC_INDEXABLE_SEO_CATALOG)
    .filter((entry) => entry.canonicalPath !== null)
    .map((entry) => `Allow: ${entry.canonicalPath}`);

  const disallowLines = PRIVATE_DISALLOW_PATHS.map((prefix) => `Disallow: ${prefix}`);

  const lines = [
    "# VendaJá Angola — Ficheiro de Controlo de Rastreio (Robots)",
    "User-agent: *",
    ...allowLines,
    "",
    "# Impedir indexação de APIs, autenticação (/entrar, /criar-conta), /app, portais e rotas autenticadas",
    ...disallowLines,
    "",
  ];

  if (origin && !isLocalOrNonPublicOrigin(origin)) {
    lines.push("# Mapa do Site Canónico (ambiente com origem pública configurada)");
    lines.push(`Sitemap: ${origin}/sitemap.xml`);
  } else {
    lines.push("# Sitemap omitido: origem canónica pública não configurada para este ambiente.");
  }

  return `${lines.join("\n")}\n`;
}

const SITEMAP_METADATA_BY_PATH: Record<string, { changefreq: string; priority: string }> = {
  "/": { changefreq: "weekly", priority: "1.0" },
  "/solucoes": { changefreq: "monthly", priority: "0.8" },
  "/modulos": { changefreq: "monthly", priority: "0.8" },
  "/seguranca": { changefreq: "monthly", priority: "0.7" },
  "/conformidade-fiscal": { changefreq: "monthly", priority: "0.7" },
  "/sobre": { changefreq: "monthly", priority: "0.7" },
  "/contacto": { changefreq: "monthly", priority: "0.7" },
  "/estado": { changefreq: "daily", priority: "0.6" },
  "/privacidade": { changefreq: "yearly", priority: "0.5" },
  "/termos": { changefreq: "yearly", priority: "0.5" },
};

export function buildSitemapXmlContent(origin: string | null): string | null {
  if (!origin || isLocalOrNonPublicOrigin(origin)) {
    return null;
  }

  const normalizedOrigin = new URL(origin).origin;
  const urls = Object.values(PUBLIC_INDEXABLE_SEO_CATALOG)
    .filter((entry) => entry.indexable && entry.canonicalPath !== null)
    .map((entry) => {
      const path = entry.canonicalPath as string;
      const freq = SITEMAP_METADATA_BY_PATH[path]?.changefreq ?? "monthly";
      const priority = SITEMAP_METADATA_BY_PATH[path]?.priority ?? "0.6";
      const loc = path === "/" ? `${normalizedOrigin}/` : `${normalizedOrigin}${path}`;
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <changefreq>${freq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n");
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export function buildStructuredDataJsonLd(origin: string | null): string | null {
  if (!origin || isLocalOrNonPublicOrigin(origin)) {
    return null;
  }

  const normalizedOrigin = new URL(origin).origin;
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SoftwareApplication",
          name: "Mutshima",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Windows, macOS, Linux, Web, Android",
          description:
            "Plataforma integrada de gestão comercial, faturação, POS, stocks, tesouraria e ERP multiempresa com arquitetura offline-first para Angola.",
          url: normalizedOrigin,
          softwareVersion: "3.2.2-rc.4",
          featureList: [
            "Faturação e Ponto de Venda (POS)",
            "Gestão de Stocks e Armazéns",
            "Compras e Fornecedores",
            "Contas Correntes e Tesouraria",
            "Contabilidade Configurável por Empresa",
            "Portais Integrados de Colaborador, Fornecedor e Cliente",
            "Arquitetura Offline-First com Outbox Criptográfica",
            "Muambuluisha IA — Assistente Inteligente Soberano do ERP",
          ],
        },
        {
          "@type": "Organization",
          name: "Mutshima",
          url: normalizedOrigin,
          logo: `${normalizedOrigin}/icons/icon-512.png`,
          description: "Soluções soberanas de software de gestão comercial e empresarial em Angola.",
        },
      ],
    },
    null,
    2
  );
}

function upsertMetaTag(attrName: "name" | "property", attrValue: string, content: string): void {
  if (typeof document === "undefined") return;
  let meta = document.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attrName, attrValue);
    document.head?.appendChild?.(meta);
  }
  meta.setAttribute("content", content);
}

function removeHeadTag(selector: string): void {
  if (typeof document === "undefined") return;
  const el = document.querySelector(selector);
  if (el) {
    if (typeof (el as { remove?: () => void }).remove === "function") {
      (el as { remove: () => void }).remove();
    } else if (document.head && typeof (document.head as { removeChild?: (child: unknown) => void }).removeChild === "function") {
      (document.head as { removeChild: (child: unknown) => void }).removeChild(el);
    }
  }
}

export function updatePageSeo(view: string, options?: ResolveCanonicalOriginOptions): PageSeoMetadata {
  const publicEntry = Object.prototype.hasOwnProperty.call(PUBLIC_INDEXABLE_SEO_CATALOG, view)
    ? (PUBLIC_INDEXABLE_SEO_CATALOG[view] ?? null)
    : null;

  const nonIndexableEntry = Object.prototype.hasOwnProperty.call(NON_INDEXABLE_SEO_CATALOG, view)
    ? (NON_INDEXABLE_SEO_CATALOG[view] ?? null)
    : null;

  const entry: Omit<PageSeoMetadata, "canonicalUrl"> =
    publicEntry ?? nonIndexableEntry ?? DEFAULT_PRIVATE_SEO_METADATA;

  const origin = entry.indexable ? resolveCanonicalOrigin(options) : null;
  const canonicalUrl =
    entry.indexable && entry.canonicalPath !== null && origin
      ? entry.canonicalPath === "/"
        ? `${origin}/`
        : `${origin}${entry.canonicalPath}`
      : null;

  if (typeof document !== "undefined") {
    document.title = entry.title;
    upsertMetaTag("name", "description", entry.description);
    upsertMetaTag("name", "robots", entry.indexable ? "index, follow" : "noindex, nofollow");

    if (canonicalUrl) {
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        document.head?.appendChild?.(canonical);
      }
      canonical.setAttribute("href", canonicalUrl);
      upsertMetaTag("property", "og:url", canonicalUrl);
    } else {
      removeHeadTag('link[rel="canonical"]');
      removeHeadTag('meta[property="og:url"]');
    }
  }

  return {
    ...entry,
    canonicalUrl,
  };
}
