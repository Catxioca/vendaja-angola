export type PublicSiteView =
  | "home"
  | "solucoes"
  | "modulos"
  | "seguranca"
  | "conformidade-fiscal"
  | "sobre"
  | "privacidade"
  | "termos"
  | "estado"
  | "contacto"
  | "entrar"
  | "criar-conta";

export type AuthenticatedAppView =
  | "erp"
  | "portal-cliente"
  | "customer-portal"
  | "portal-fornecedor"
  | "supplier-portal"
  | "portal-colaborador"
  | "employee-portal"
  | "portal-rh"
  | "portal-comercial"
  | "portal-admin"
  | "mobile-erp"
  | "copilot";

export type OmnichannelView = PublicSiteView | AuthenticatedAppView;

export const PUBLIC_VIEWS: readonly PublicSiteView[] = [
  "home",
  "solucoes",
  "modulos",
  "seguranca",
  "conformidade-fiscal",
  "sobre",
  "privacidade",
  "termos",
  "estado",
  "contacto",
  "entrar",
  "criar-conta",
] as const;

export const AUTHENTICATED_VIEWS: readonly AuthenticatedAppView[] = [
  "erp",
  "portal-cliente",
  "customer-portal",
  "portal-fornecedor",
  "supplier-portal",
  "portal-colaborador",
  "employee-portal",
  "portal-rh",
  "portal-comercial",
  "portal-admin",
  "mobile-erp",
  "copilot",
] as const;

export const ALL_VIEWS: readonly OmnichannelView[] = [
  ...PUBLIC_VIEWS,
  ...AUTHENTICATED_VIEWS,
] as const;

export const PUBLIC_VIEW_PATHS: Record<PublicSiteView, string> = {
  home: "/",
  solucoes: "/solucoes",
  modulos: "/modulos",
  seguranca: "/seguranca",
  "conformidade-fiscal": "/conformidade-fiscal",
  sobre: "/sobre",
  privacidade: "/privacidade",
  termos: "/termos",
  estado: "/estado",
  contacto: "/contacto",
  entrar: "/entrar",
  "criar-conta": "/criar-conta",
};

const PATH_ALIASES: Record<string, OmnichannelView> = {
  "": "home",
  home: "home",
  solucoes: "solucoes",
  modulos: "modulos",
  seguranca: "seguranca",
  security: "seguranca",
  "conformidade-fiscal": "conformidade-fiscal",
  fiscal: "conformidade-fiscal",
  sobre: "sobre",
  privacidade: "privacidade",
  privacy: "privacidade",
  termos: "termos",
  terms: "termos",
  estado: "estado",
  status: "estado",
  contacto: "contacto",
  contact: "contacto",
  entrar: "entrar",
  login: "entrar",
  "criar-conta": "criar-conta",
  bootstrap: "criar-conta",
  app: "erp",
  erp: "erp",
  "mobile-erp": "mobile-erp",
  mobile: "mobile-erp",
  "portal-cliente": "portal-cliente",
  "customer-portal": "customer-portal",
  "portal-fornecedor": "portal-fornecedor",
  "supplier-portal": "supplier-portal",
  "portal-colaborador": "portal-colaborador",
  "employee-portal": "employee-portal",
  "portal-rh": "portal-rh",
  "portal-comercial": "portal-comercial",
  "portal-admin": "portal-admin",
  copilot: "copilot",
};

const SELF_CONTAINED_PORTAL_VIEWS = new Set<OmnichannelView>([
  "portal-cliente",
  "customer-portal",
  "portal-fornecedor",
  "supplier-portal",
  "portal-colaborador",
  "employee-portal",
  "mobile-erp",
]);

export function isPublicView(view: OmnichannelView): view is PublicSiteView {
  return (PUBLIC_VIEWS as readonly string[]).includes(view);
}

export function requiresMainErpSession(view: OmnichannelView): boolean {
  return !isPublicView(view) && !SELF_CONTAINED_PORTAL_VIEWS.has(view);
}

export function normalizeRouteToken(raw: string): OmnichannelView | null {
  const cleaned = raw.trim().replace(/^#/, "").replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!cleaned) return null;
  if (cleaned in PATH_ALIASES) {
    return PATH_ALIASES[cleaned] ?? null;
  }
  return null;
}

export interface RouteLocationInput {
  pathname: string;
  hash: string;
  isNativeCapacitor?: boolean;
  protocol?: string;
  savedView?: string | null;
  hasSession?: boolean;
}

/**
 * Resolves the canonical OmnichannelView from URL hash aliases, clean History API paths,
 * Capacitor native detection, and optional authenticated saved view.
 */
export function resolveRouteFromLocation(input: RouteLocationInput): OmnichannelView {
  if (input.isNativeCapacitor) {
    const hashTarget = normalizeRouteToken(input.hash);
    if (hashTarget) return hashTarget;
    return "mobile-erp";
  }

  const hashTarget = normalizeRouteToken(input.hash);
  if (hashTarget) {
    return hashTarget;
  }

  const pathTarget = normalizeRouteToken(input.pathname);
  if (pathTarget && pathTarget !== "home") {
    return pathTarget;
  }

  if (input.hasSession && input.savedView) {
    const savedTarget = normalizeRouteToken(input.savedView);
    if (savedTarget) {
      return savedTarget;
    }
  }

  return "home";
}

/**
 * Applies session enforcement for protected ERP/internal portals.
 * If an unauthenticated visitor opens /app, #erp, or internal portals directly,
 * keeps the intended destination for post-login redirection and serves /entrar.
 */
export function resolveEffectiveViewWithSession(
  targetView: OmnichannelView,
  hasSession: boolean
): {
  effectiveView: OmnichannelView;
  postLoginRedirect: AuthenticatedAppView | null;
} {
  if (requiresMainErpSession(targetView) && !hasSession) {
    return {
      effectiveView: "entrar",
      postLoginRedirect: targetView as AuthenticatedAppView,
    };
  }
  return {
    effectiveView: targetView,
    postLoginRedirect: null,
  };
}

export function isHashOnlyEnvironment(options?: {
  isNativeCapacitor?: boolean;
  protocol?: string;
}): boolean {
  if (options?.isNativeCapacitor) return true;
  if (options?.protocol && options.protocol !== "http:" && options.protocol !== "https:") {
    return true;
  }
  return false;
}

export function viewToUrl(
  view: OmnichannelView,
  options?: { isNativeCapacitor?: boolean; protocol?: string }
): string {
  if (isHashOnlyEnvironment(options)) {
    if (view === "home") return "#";
    if (view === "erp") return "#erp";
    return `#${view}`;
  }

  if (isPublicView(view)) {
    return PUBLIC_VIEW_PATHS[view];
  }

  if (view === "erp") {
    return "/app";
  }

  return `/#${view}`;
}

export function navigateHistory(
  view: OmnichannelView,
  options?: { replace?: boolean }
): string {
  const isNative =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    );
  const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
  const targetUrl = viewToUrl(view, { isNativeCapacitor: isNative, protocol });

  if (typeof window === "undefined") {
    return targetUrl;
  }

  if (isHashOnlyEnvironment({ isNativeCapacitor: isNative, protocol })) {
    const targetHash = view === "home" ? "" : view === "erp" ? "erp" : view;
    if (window.location.hash.replace(/^#/, "") !== targetHash) {
      window.location.hash = targetHash;
    }
    return targetUrl;
  }

  const currentUrl = `${window.location.pathname}${window.location.hash}`;
  if (currentUrl !== targetUrl) {
    try {
      if (options?.replace) {
        window.history.replaceState({ view }, "", targetUrl);
      } else {
        window.history.pushState({ view }, "", targetUrl);
      }
    } catch {
      window.location.hash = view === "home" ? "" : view;
    }
  }

  return targetUrl;
}
