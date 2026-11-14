import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  NON_INDEXABLE_SEO_CATALOG,
  PRIVATE_DISALLOW_PATHS,
  PUBLIC_INDEXABLE_SEO_CATALOG,
  SITE_SEO_CATALOG,
  buildRobotsTxtContent,
  buildSitemapXmlContent,
  buildStructuredDataJsonLd,
  resolveCanonicalOrigin,
  updatePageSeo,
} from "./seo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockDocument() {
  const elements: Record<string, any> = {};

  function resolveKey(selector: string): string {
    return selector;
  }

  const head = {
    appendChild(el: any) {
      if (el.tagName === "LINK" && el.attributes?.rel === "canonical") {
        elements['link[rel="canonical"]'] = el;
      } else if (el.tagName === "META" && el.attributes?.name) {
        elements[`meta[name="${el.attributes.name}"]`] = el;
      } else if (el.tagName === "META" && el.attributes?.property) {
        elements[`meta[property="${el.attributes.property}"]`] = el;
      }
    },
    removeChild(el: any) {
      for (const [k, v] of Object.entries(elements)) {
        if (v === el) delete elements[k];
      }
    },
  };

  return {
    elements,
    doc: {
      title: "",
      querySelector: (selector: string) => elements[resolveKey(selector)] || null,
      createElement: (tag: string) => {
        const el: any = {
          tagName: tag.toUpperCase(),
          attributes: {} as Record<string, string>,
          setAttribute: (name: string, value: string) => {
            el.attributes[name] = value;
          },
          getAttribute: (name: string) => el.attributes[name],
          remove: () => {
            head.removeChild(el);
          },
        };
        return el;
      },
      head,
    },
  };
}

test("Site SEO: Contém metadados SEO únicos para as 10 rotas institucionais públicas e identifica rotas de acesso como não-indexáveis", () => {
  const expectedIndexable = [
    "home",
    "solucoes",
    "modulos",
    "seguranca",
    "conformidade-fiscal",
    "sobre",
    "contacto",
    "estado",
    "privacidade",
    "termos",
  ];

  assert.equal(Object.keys(PUBLIC_INDEXABLE_SEO_CATALOG).length, 10);
  for (const route of expectedIndexable) {
    const meta = PUBLIC_INDEXABLE_SEO_CATALOG[route];
    assert.ok(meta, `Rota ${route} deve existir no catálogo indexável`);
    assert.equal(meta.indexable, true);
    assert.ok(meta.title.length > 10);
    assert.ok(meta.description.length > 20);
    assert.ok(meta.canonicalPath && meta.canonicalPath.startsWith("/"));
  }

  for (const authRoute of ["entrar", "criar-conta"]) {
    const meta = NON_INDEXABLE_SEO_CATALOG[authRoute];
    assert.ok(meta, `Rota ${authRoute} deve existir no catálogo não-indexável`);
    assert.equal(meta.indexable, false);
    assert.equal(meta.canonicalPath, null);
  }
});

test("Site SEO: Títulos e descrições são mutuamente exclusivos e únicos", () => {
  const titles = Object.values(SITE_SEO_CATALOG).map((m) => m.title);
  assert.equal(new Set(titles).size, titles.length, "Cada rota deve possuir título único");

  const descriptions = Object.values(SITE_SEO_CATALOG).map((m) => m.description);
  assert.equal(new Set(descriptions).size, descriptions.length, "Cada rota deve possuir descrição única");
});

test("Site SEO: Inclui declaração regulamentar obrigatória da AGT nos metadados fiscais", () => {
  const fiscalMeta = PUBLIC_INDEXABLE_SEO_CATALOG["conformidade-fiscal"];
  assert.ok(fiscalMeta);
  assert.ok(
    fiscalMeta.description.includes("Preparado tecnicamente para homologação; não homologado até aprovação formal da AGT.")
  );
});

test("Site SEO: Origem canónica é configurável por ambiente e não inventa vendaja.ao em desenvolvimento/local", () => {
  assert.equal(resolveCanonicalOrigin({ configuredOrigin: null }), null);
  assert.equal(resolveCanonicalOrigin({ configuredOrigin: "" }), null);
  assert.equal(resolveCanonicalOrigin({ configuredOrigin: "http://localhost:5173" }), null);
  assert.equal(resolveCanonicalOrigin({ configuredOrigin: "http://127.0.0.1:4173" }), null);
  assert.equal(resolveCanonicalOrigin({ configuredOrigin: "capacitor://localhost" }), null);
  assert.equal(resolveCanonicalOrigin({ configuredOrigin: "file://" }), null);

  assert.equal(
    resolveCanonicalOrigin({ configuredOrigin: "https://erp.organizacao-exemplo.ao/" }),
    "https://erp.organizacao-exemplo.ao"
  );

  // Em ambiente local sem override explícito não deve gerar produção fictícia
  assert.equal(
    resolveCanonicalOrigin({ runtimeOrigin: "http://localhost:5173" }),
    null
  );

  assert.equal(buildSitemapXmlContent(null), null);
  assert.equal(buildSitemapXmlContent("http://localhost:5173"), null);
  assert.equal(buildStructuredDataJsonLd(null), null);
  assert.equal(buildStructuredDataJsonLd("http://127.0.0.1:3000"), null);
});

test("Site SEO: updatePageSeo remove canonical/og:url em rotas autenticadas e em ambiente sem origem configurada", () => {
  const mock = createMockDocument();
  const previousDoc = (globalThis as any).document;
  (globalThis as any).document = mock.doc;

  try {
    // 1. Com origem configurada em página institucional pública, gera canonical e og:url com essa origem
    const publicMeta = updatePageSeo("solucoes", { configuredOrigin: "https://site.aprovado.ao" });
    assert.equal(publicMeta.indexable, true);
    assert.equal(publicMeta.canonicalUrl, "https://site.aprovado.ao/solucoes");
    assert.equal(mock.elements['link[rel="canonical"]']?.getAttribute("href"), "https://site.aprovado.ao/solucoes");
    assert.equal(mock.elements['meta[property="og:url"]']?.getAttribute("content"), "https://site.aprovado.ao/solucoes");
    assert.equal(mock.elements['meta[name="robots"]']?.getAttribute("content"), "index, follow");

    // 2. Ao navegar para rotas autenticadas ou de acesso, canonical e og:url são removidos e define noindex
    for (const authView of ["erp", "mobile-erp", "portal-admin", "portal-cliente", "copilot", "entrar", "criar-conta"]) {
      const privMeta = updatePageSeo(authView, { configuredOrigin: "https://site.aprovado.ao" });
      assert.equal(privMeta.indexable, false);
      assert.equal(privMeta.canonicalUrl, null);
      assert.equal(mock.elements['link[rel="canonical"]'], undefined, `${authView} não deve manter link canonical`);
      assert.equal(mock.elements['meta[property="og:url"]'], undefined, `${authView} não deve manter og:url`);
      assert.equal(mock.elements['meta[name="robots"]']?.getAttribute("content"), "noindex, nofollow");
    }

    // 3. Sem origem pública configurada (desenvolvimento/local), página pública também não recebe canonical/og:url fictícios
    const localMeta = updatePageSeo("home", { configuredOrigin: null, runtimeOrigin: "http://localhost:5173" });
    assert.equal(localMeta.canonicalUrl, null);
    assert.equal(mock.elements['link[rel="canonical"]'], undefined);
    assert.equal(mock.elements['meta[property="og:url"]'], undefined);
  } finally {
    (globalThis as any).document = previousDoc;
  }
});

test("Site SEO: robots.txt e sitemap gerados excluem /app, /entrar, /criar-conta, /api/ e todos os portais", () => {
  const publicDir = path.resolve(__dirname, "../../public");
  const robotsPath = path.join(publicDir, "robots.txt");
  assert.ok(fs.existsSync(robotsPath), "robots.txt deve existir em apps/web/public");

  const robotsContent = fs.readFileSync(robotsPath, "utf-8");
  assert.ok(robotsContent.includes("User-agent: *"));
  assert.ok(!robotsContent.includes("Allow: /entrar"), "robots.txt não deve permitir /entrar");
  assert.ok(!robotsContent.includes("Allow: /criar-conta"), "robots.txt não deve permitir /criar-conta");
  assert.ok(!robotsContent.includes("vendaja.ao"), "robots.txt estático sem origem configurada não deve conter vendaja.ao");

  for (const blocked of [
    "/api/",
    "/app",
    "/entrar",
    "/criar-conta",
    "/erp",
    "/mobile-erp",
    "/copilot",
    "/portal-cliente",
    "/portal-fornecedor",
    "/portal-colaborador",
    "/portal-rh",
    "/portal-comercial",
    "/portal-admin",
    "/portal-",
  ]) {
    assert.ok(robotsContent.includes(`Disallow: ${blocked}`), `robots.txt deve bloquear ${blocked}`);
  }

  // Nenhum sitemap estático com domínio fictício deve existir por defeito
  assert.ok(!fs.existsSync(path.join(publicDir, "sitemap.xml")));

  // Quando origem explícita aprovada é configurada, o sitemap contém apenas as 10 rotas institucionais públicas
  const configuredSitemap = buildSitemapXmlContent("https://site.aprovado.ao");
  assert.ok(configuredSitemap, "Deve gerar sitemap quando origem pública é fornecida");
  assert.ok(configuredSitemap.includes("<loc>https://site.aprovado.ao/</loc>"));
  assert.ok(configuredSitemap.includes("<loc>https://site.aprovado.ao/solucoes</loc>"));
  assert.ok(configuredSitemap.includes("<loc>https://site.aprovado.ao/contacto</loc>"));
  assert.ok(configuredSitemap.includes("<loc>https://site.aprovado.ao/termos</loc>"));

  const locs = [...configuredSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? "").pathname);
  assert.equal(locs.length, 10);
  for (const privatePath of PRIVATE_DISALLOW_PATHS) {
    assert.ok(!locs.some((locPath) => locPath === privatePath || locPath.startsWith("/portal-")), `sitemap não deve incluir rota privada ${privatePath}`);
  }

  const configuredRobots = buildRobotsTxtContent("https://site.aprovado.ao");
  assert.ok(configuredRobots.includes("Sitemap: https://site.aprovado.ao/sitemap.xml"));
});

test("Site SEO: index.html base não presume vendaja.ao e JSON-LD de produção só é emitido quando configurado", () => {
  const webRootDir = path.resolve(__dirname, "../..");
  const indexPath = path.join(webRootDir, "index.html");
  assert.ok(fs.existsSync(indexPath));

  const html = fs.readFileSync(indexPath, "utf-8");
  assert.ok(html.includes('lang="pt-AO"'));
  assert.ok(html.includes('name="description"'));
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('property="og:description"'));
  assert.ok(html.includes('property="og:type" content="website"'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes("Content-Security-Policy"));
  assert.ok(html.includes('name="theme-color" content="#0f766e"'));
  assert.ok(html.includes('rel="manifest"'));
  assert.ok(html.includes('rel="icon"'));

  // Em fonte/dev local sem domínio aprovado, não deve embutir canonical/OG URL/JSON-LD com vendaja.ao
  assert.ok(!html.includes("vendaja.ao"), "index.html base não deve assumir vendaja.ao");
  assert.ok(!html.includes('rel="canonical"'), "index.html base não deve embutir canonical fixo de produção");
  assert.ok(!html.includes('property="og:url"'), "index.html base não deve embutir og:url fixo de produção");

  // Validação do gerador JSON-LD quando uma origem pública é configurada
  const rawJsonLd = buildStructuredDataJsonLd("https://site.aprovado.ao");
  assert.ok(rawJsonLd);
  const parsed = JSON.parse(rawJsonLd);
  assert.equal(parsed["@context"], "https://schema.org");
  assert.ok(Array.isArray(parsed["@graph"]));

  const appSchema = parsed["@graph"].find((item: any) => item["@type"] === "SoftwareApplication");
  assert.ok(appSchema);
  assert.equal(appSchema.url, "https://site.aprovado.ao");

  const orgSchema = parsed["@graph"].find((item: any) => item["@type"] === "Organization");
  assert.ok(orgSchema);
  assert.equal(orgSchema.logo, "https://site.aprovado.ao/icons/icon-512.png");
});

test("Site PWA: sw.js proíbe em runtime cache de /api, Authorization, rotas privadas e respostas no-store/private", async () => {
  const publicDir = path.resolve(__dirname, "../../public");
  const swPath = path.join(publicDir, "sw.js");
  assert.ok(fs.existsSync(swPath));

  const content = fs.readFileSync(swPath, "utf-8");
  const listeners: Record<string, (event: any) => void> = {};
  const putCalls: Array<{ url: string }> = [];

  const mockCaches = {
    async open() {
      return {
        async addAll() {},
        async put(req: { url: string }) {
          putCalls.push({ url: req.url });
        },
      };
    },
    async keys() {
      return [];
    },
    async delete() {
      return true;
    },
    async match() {
      return undefined;
    },
  };

  const sandbox = {
    URL,
    console,
    caches: mockCaches,
    fetch: async (req: { url: string }) => {
      const headers = new Map<string, string>();
      if (req.url.includes("private-response")) {
        headers.set("cache-control", "private, no-store");
      }
      if (req.url.includes("with-cookie")) {
        headers.set("set-cookie", "refresh=xyz; HttpOnly");
      }
      return {
        ok: true,
        type: "basic",
        headers: {
          has: (name: string) => headers.has(name.toLowerCase()),
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        },
        clone() {
          return this;
        },
      };
    },
    self: {
      location: { origin: "https://app.local" },
      addEventListener(type: string, handler: (event: any) => void) {
        listeners[type] = handler;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
  };

  vm.runInNewContext(content, sandbox);
  assert.equal(typeof listeners.fetch, "function");

  const runFetch = async (urlStr: string, opts: { method?: string; mode?: string; auth?: string } = {}) => {
    let responded: Promise<any> | null = null;
    const reqHeaders = new Map<string, string>();
    if (opts.auth) reqHeaders.set("authorization", opts.auth);

    const event = {
      request: {
        url: urlStr,
        method: opts.method ?? "GET",
        mode: opts.mode ?? "navigate",
        headers: {
          has: (name: string) => reqHeaders.has(name.toLowerCase()),
          get: (name: string) => reqHeaders.get(name.toLowerCase()) ?? null,
        },
      },
      respondWith(promise: Promise<any>) {
        responded = promise;
      },
    };

    listeners.fetch?.(event);
    if (responded) {
      await responded;
    }
    await new Promise((r) => setTimeout(r, 5));
    return Boolean(responded);
  };

  // Chamadas privadas, /api, Authorization e respostas no-store/set-cookie nunca entram em cache
  assert.equal(await runFetch("https://app.local/api/v1/sales"), false);
  assert.equal(await runFetch("https://app.local/solucoes", { auth: "Bearer token-123" }), false);
  assert.equal(await runFetch("https://app.local/app"), false);
  assert.equal(await runFetch("https://app.local/erp"), false);
  assert.equal(await runFetch("https://app.local/portal-admin"), false);
  assert.equal(await runFetch("https://app.local/entrar"), false);
  assert.equal(await runFetch("https://app.local/criar-conta"), false);
  await runFetch("https://app.local/private-response.html");
  await runFetch("https://app.local/with-cookie.html");

  assert.equal(putCalls.length, 0, "Nenhuma resposta autenticada ou privada deve ser gravada na cache PWA");

  // Apenas navegação pública sem headers sensíveis é armazenada
  await runFetch("https://app.local/solucoes");
  assert.equal(putCalls.length, 1);
  assert.equal(putCalls[0]?.url, "https://app.local/solucoes");
});

test("Site PWA: manifest.webmanifest mantém integridade e ícones", () => {
  const publicDir = path.resolve(__dirname, "../../public");
  const manifestPath = path.join(publicDir, "manifest.webmanifest");
  assert.ok(fs.existsSync(manifestPath));

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  assert.equal(manifest.name, "Mutshima");
  assert.equal(manifest.short_name, "Mutshima");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test("Site Acessibilidade & Performance: Skip link, landmarks, fallback de lazy loading e ausência de alegações não medidas", () => {
  const headerContent = fs.readFileSync(path.resolve(__dirname, "SiteHeader.tsx"), "utf-8");
  assert.ok(headerContent.includes('href="#main-content"'));
  assert.ok(headerContent.includes('className="skip-link"'));
  assert.ok(headerContent.includes("Saltar para o conteúdo principal"));

  const cssContent = fs.readFileSync(path.resolve(__dirname, "site.css"), "utf-8");
  assert.ok(cssContent.includes(".skip-link"));
  assert.ok(cssContent.includes(".skip-link:focus"));
  assert.ok(cssContent.includes("concebido com práticas de acessibilidade"));

  const mainContent = fs.readFileSync(path.resolve(__dirname, "../main.tsx"), "utf-8");
  assert.ok(mainContent.includes('<main id="main-content" className="site-main" tabIndex={-1}>'));
  assert.ok(mainContent.includes("const HomePage = lazy("));
  assert.ok(mainContent.includes("const SolutionsPage = lazy("));
  assert.ok(mainContent.includes("const ModulesPage = lazy("));
  assert.ok(mainContent.includes("const ContactPage = lazy("));
  assert.ok(mainContent.includes("<Suspense"));
  assert.ok(mainContent.includes('role="status" aria-live="polite"'));
  assert.ok(mainContent.includes("A carregar página..."));

  const webRootDir = path.resolve(__dirname, "../..");
  const viteContent = fs.readFileSync(path.join(webRootDir, "vite.config.ts"), "utf-8");
  assert.ok(viteContent.includes("manualChunks"));
  assert.ok(viteContent.includes("vendor-react"));
  assert.ok(viteContent.includes("vendor-shared"));

  // Bloqueia regressão de alegações não medidas de acessibilidade ou performance em ficheiros públicos
  const publicTargets = [
    path.join(webRootDir, "index.html"),
    path.resolve(__dirname, "site.css"),
    ...fs
      .readdirSync(__dirname)
      .filter((name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".spec.ts"))
      .map((name) => path.resolve(__dirname, name)),
  ];

  for (const filePath of publicTargets) {
    const text = fs.readFileSync(filePath, "utf-8");
    assert.ok(!/WCAG\s*2\.1\s*AA/i.test(text), `${path.basename(filePath)} não deve alegar certificação WCAG 2.1 AA`);
    assert.ok(!/redu[çc][aã]o\s+dr[áa]stica/i.test(text), `${path.basename(filePath)} não deve conter alegação 'redução drástica'`);
    assert.ok(!/\bFCP\b/i.test(text), `${path.basename(filePath)} não deve alegar ganho de FCP sem benchmark reproduzível`);
  }
});

test("Etapa 7.1: Vite plugin de origem SEO só emite sitemap/canonical/JSON-LD quando configurado", () => {
  const webRootDir = path.resolve(__dirname, "../..");
  const viteContent = fs.readFileSync(path.join(webRootDir, "vite.config.ts"), "utf-8");
  assert.ok(viteContent.includes("vendajaSeoOriginPlugin"));
  assert.ok(viteContent.includes("VITE_PUBLIC_SITE_ORIGIN"));
  assert.ok(viteContent.includes("buildRobotsTxtContent"));
  assert.ok(viteContent.includes("buildSitemapXmlContent"));
  assert.ok(viteContent.includes("buildStructuredDataJsonLd"));
  assert.ok(!viteContent.includes("vendaja.ao"));
});

test("Etapa 7.1: Rotas autenticadas e /app nunca entram no sitemap e recebem noindex/sem canonical", () => {
  const sitemap = buildSitemapXmlContent("https://exemplo-empresa.ao");
  assert.ok(sitemap);
  for (const forbidden of ["/app", "/entrar", "/login", "/criar-conta", "/bootstrap", "/api/", "/erp", "/mobile-erp", "/copilot", "/portal-"]) {
    assert.ok(!sitemap.includes(forbidden), `Sitemap não pode conter ${forbidden}`);
  }

  const mock = createMockDocument();
  const previousDoc = (globalThis as any).document;
  (globalThis as any).document = mock.doc;
  try {
    const res = updatePageSeo("erp", { configuredOrigin: "https://exemplo-empresa.ao" });
    assert.equal(res.indexable, false);
    assert.equal(res.canonicalUrl, null);
    assert.equal(mock.elements['link[rel="canonical"]'], undefined);
  } finally {
    (globalThis as any).document = previousDoc;
  }
});

test("Etapa 7.1: Rejeição de origem local em buildStructuredDataJsonLd e buildRobotsTxtContent", () => {
  assert.equal(buildStructuredDataJsonLd("http://localhost:5173"), null);
  assert.equal(buildStructuredDataJsonLd("http://127.0.0.1:8080"), null);

  const localRobots = buildRobotsTxtContent(null);
  assert.ok(!localRobots.includes("Sitemap: https://vendaja.ao"));
  assert.ok(localRobots.includes("Disallow: /app"));
  assert.ok(localRobots.includes("Disallow: /entrar"));
  assert.ok(localRobots.includes("Disallow: /criar-conta"));
  assert.ok(localRobots.includes("Disallow: /api/"));
});

test("Etapa 7.1: Ausência de promessas não medidas no documento de arquitetura pública", () => {
  const planPath = path.resolve(__dirname, "../../../../SITE_ARCHITECTURE_PLAN.md");
  const plan = fs.readFileSync(planPath, "utf-8");
  assert.ok(!/WCAG\s*2\.1\s*AA/i.test(plan));
  assert.ok(!/redu[çc][aã]o\s+dr[áa]stica/i.test(plan));
  assert.ok(plan.includes("Práticas de Acessibilidade"));
});
