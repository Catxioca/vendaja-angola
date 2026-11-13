const CACHE = "vendaja-shell-v5";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./robots.txt",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

const PRIVATE_OR_AUTH_PATH_PREFIXES = [
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
  "/portal-",
  "/customer-portal",
  "/supplier-portal",
  "/employee-portal",
];

function isPrivateOrAuthPath(pathname) {
  const normalized = (pathname || "").toLowerCase();
  return PRIVATE_OR_AUTH_PATH_PREFIXES.some((prefix) => {
    if (prefix === "/api/" || prefix === "/portal-") {
      return normalized.includes(prefix);
    }
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

function isCacheablePublicResponse(request, url, response) {
  if (!response || !response.ok || response.type !== "basic") {
    return false;
  }
  if (request.headers.has("authorization") || isPrivateOrAuthPath(url.pathname)) {
    return false;
  }
  if (response.headers.has("set-cookie") || response.headers.has("www-authenticate")) {
    return false;
  }
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) {
    return false;
  }
  return true;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try {
      const index = await fetch("./index.html", { cache: "no-cache" });
      const html = await index.text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((asset) => asset && !asset.startsWith("http") && !isPrivateOrAuthPath(asset));
      await cache.addAll(assets);
    } catch {
      // offline install fallback
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE) {
            console.log("[sw] Purging obsolete cache:", key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Segurança e Segregação de Cache:
  // Nunca cachear endpoints de API (/api/*), chamadas com Authorization,
  // rotas autenticadas (/app, /erp, /portal-*, /entrar, /criar-conta) ou métodos mutantes.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    isPrivateOrAuthPath(url.pathname) ||
    request.headers.has("authorization")
  ) {
    return;
  }

  // Network-First para navegação HTML/root pública
  const isHtml =
    request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith(".html");

  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheablePublicResponse(request, url, response)) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Cache-First apenas para assets estáticos públicos (.js, .css, imagens)
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ??
      fetch(request).then((response) => {
        if (isCacheablePublicResponse(request, url, response)) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
    )
  );
});
