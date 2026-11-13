import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PUBLIC_VIEWS,
  AUTHENTICATED_VIEWS,
  PUBLIC_VIEW_PATHS,
  isPublicView,
  requiresMainErpSession,
  normalizeRouteToken,
  resolveRouteFromLocation,
  resolveEffectiveViewWithSession,
  viewToUrl,
  navigateHistory,
} from "./router.js";

const SITE_DIR = path.resolve(import.meta.dirname);
const MAIN_TSX = path.resolve(SITE_DIR, "../main.tsx");

describe("Etapa 2: Router Público por Paths Limpos e Compatibilidade Omnichannel", () => {
  it("resolves all required public clean paths accurately", () => {
    const expected: Record<string, string> = {
      "/": "home",
      "/solucoes": "solucoes",
      "/solucoes/": "solucoes",
      "/modulos": "modulos",
      "/seguranca": "seguranca",
      "/conformidade-fiscal": "conformidade-fiscal",
      "/sobre": "sobre",
      "/contacto": "contacto",
      "/entrar": "entrar",
      "/criar-conta": "criar-conta",
      "/privacidade": "privacidade",
      "/termos": "termos",
      "/estado": "estado",
    };

    for (const [pathname, view] of Object.entries(expected)) {
      assert.equal(
        resolveRouteFromLocation({ pathname, hash: "" }),
        view,
        `Path ${pathname} deve resolver para ${view}`
      );
    }
  });

  it("forwards /app and preserves legacy hash aliases for ERP, Mobile ERP and Portals", () => {
    assert.equal(resolveRouteFromLocation({ pathname: "/app", hash: "" }), "erp");
    assert.equal(resolveRouteFromLocation({ pathname: "/erp", hash: "" }), "erp");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#erp" }), "erp");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#mobile-erp" }), "mobile-erp");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#portal-cliente" }), "portal-cliente");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#portal-fornecedor" }), "portal-fornecedor");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#portal-colaborador" }), "portal-colaborador");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#portal-rh" }), "portal-rh");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#portal-comercial" }), "portal-comercial");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#portal-admin" }), "portal-admin");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#copilot" }), "copilot");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#login" }), "entrar");
    assert.equal(resolveRouteFromLocation({ pathname: "/", hash: "#bootstrap" }), "criar-conta");
  });

  it("defaults native Capacitor startup to mobile-erp while keeping hash overrides", () => {
    assert.equal(
      resolveRouteFromLocation({ pathname: "/", hash: "", isNativeCapacitor: true }),
      "mobile-erp"
    );
    assert.equal(
      resolveRouteFromLocation({ pathname: "/solucoes", hash: "", isNativeCapacitor: true }),
      "mobile-erp"
    );
    assert.equal(
      resolveRouteFromLocation({ pathname: "/", hash: "#erp", isNativeCapacitor: true }),
      "erp"
    );
  });

  it("enforces session gate on /app and protected internal portals without breaking self-service portals", () => {
    assert.deepEqual(resolveEffectiveViewWithSession("erp", false), {
      effectiveView: "entrar",
      postLoginRedirect: "erp",
    });
    assert.deepEqual(resolveEffectiveViewWithSession("portal-admin", false), {
      effectiveView: "entrar",
      postLoginRedirect: "portal-admin",
    });
    assert.deepEqual(resolveEffectiveViewWithSession("erp", true), {
      effectiveView: "erp",
      postLoginRedirect: null,
    });

    assert.equal(requiresMainErpSession("portal-cliente"), false);
    assert.equal(requiresMainErpSession("portal-fornecedor"), false);
    assert.equal(requiresMainErpSession("portal-colaborador"), false);
    assert.equal(requiresMainErpSession("mobile-erp"), false);

    for (const view of PUBLIC_VIEWS) {
      assert.equal(isPublicView(view), true);
      assert.equal(requiresMainErpSession(view), false);
    }
    for (const view of AUTHENTICATED_VIEWS) {
      assert.equal(isPublicView(view), false);
    }
  });

  it("maps views to clean URLs on Web and safe hash URLs on Capacitor or file://", () => {
    for (const view of PUBLIC_VIEWS) {
      assert.equal(viewToUrl(view, { protocol: "https:" }), PUBLIC_VIEW_PATHS[view]);
    }
    assert.equal(viewToUrl("erp", { protocol: "https:" }), "/app");
    assert.equal(viewToUrl("portal-cliente", { protocol: "https:" }), "/#portal-cliente");

    assert.equal(viewToUrl("home", { isNativeCapacitor: true }), "#");
    assert.equal(viewToUrl("solucoes", { isNativeCapacitor: true }), "#solucoes");
    assert.equal(viewToUrl("erp", { protocol: "file:" }), "#erp");
  });

  it("uses History API pushState/replaceState on Web without page reload", () => {
    const pushCalls: Array<{ state: unknown; url: string }> = [];
    const replaceCalls: Array<{ state: unknown; url: string }> = [];
    const origWindow = (globalThis as Record<string, unknown>).window;

    try {
      (globalThis as Record<string, unknown>).window = {
        location: { pathname: "/", hash: "", protocol: "https:" },
        history: {
          pushState(state: unknown, _title: string, url: string) {
            pushCalls.push({ state, url });
          },
          replaceState(state: unknown, _title: string, url: string) {
            replaceCalls.push({ state, url });
          },
        },
      };

      const targetUrl = navigateHistory("sobre");
      assert.equal(targetUrl, "/sobre");
      assert.equal(pushCalls.length, 1);
      assert.equal(pushCalls[0]?.url, "/sobre");

      const appUrl = navigateHistory("erp", { replace: true });
      assert.equal(appUrl, "/app");
      assert.equal(replaceCalls.length, 1);
      assert.equal(replaceCalls[0]?.url, "/app");
    } finally {
      if (origWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = origWindow;
      }
    }
  });

  it("normalizes unknown route tokens safely to null", () => {
    assert.equal(normalizeRouteToken("/rota-inexistente"), null);
    assert.equal(normalizeRouteToken("/SOLUCOES/"), "solucoes");
  });

  it("wires SobrePage, History API popstate listener and public shell without leaking ERP controls", () => {
    const mainCode = fs.readFileSync(MAIN_TSX, "utf-8");
    const sobreCode = fs.readFileSync(path.join(SITE_DIR, "SobrePage.tsx"), "utf-8");
    const headerCode = fs.readFileSync(path.join(SITE_DIR, "SiteHeader.tsx"), "utf-8");
    const footerCode = fs.readFileSync(path.join(SITE_DIR, "SiteFooter.tsx"), "utf-8");

    assert.match(mainCode, /popstate/);
    assert.match(mainCode, /navigateHistory/);
    assert.match(mainCode, /SobrePage/);
    assert.match(sobreCode, /Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT\./);
    assert.match(headerCode, /Sobre/);
    assert.match(headerCode, /Entrar/);
    assert.doesNotMatch(footerCode, /contacto@vendaja\.ao/);
    assert.match(footerCode, /resolveInstitutionalContactChannels/);
    assert.match(footerCode, /Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT\./);
    assert.doesNotMatch(headerCode, /DesktopErpApp|AdminPortal|Comercial/);
  });
});
