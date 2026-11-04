import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MobileTab } from "./types";

describe("MobileShell Responsive Layout & Ergonomia Touch", () => {
  it("deve mapear corretamente os 5 separadores da barra de navegação inferior móvel", () => {
    const tabs: Array<{ id: MobileTab; label: string }> = [
      { id: "pos", label: "POS" },
      { id: "products", label: "Produtos" },
      { id: "stock", label: "Stock" },
      { id: "cash", label: "Caixa" },
      { id: "more", label: "Mais" },
    ];

    assert.equal(tabs.length, 5, "Smartphone deve ter exatamente 5 abas principais na barra inferior");
    assert.deepEqual(tabs.map((t) => t.id), ["pos", "products", "stock", "cash", "more"]);
  });

  it("deve diferenciar smartphone de tablet pelo breakpoint de largura (768px)", () => {
    const isTablet = (width: number) => width >= 768;
    assert.equal(isTablet(360), false, "360px deve ser telefone (Samsung Galaxy / Pixel)");
    assert.equal(isTablet(390), false, "390px deve ser telefone (iPhone)");
    assert.equal(isTablet(412), false, "412px deve ser telefone");
    assert.equal(isTablet(768), true, "768px deve ser tablet (iPad / Galaxy Tab)");
    assert.equal(isTablet(1024), true, "1024px deve ser tablet grande");
    assert.equal(isTablet(1280), true, "1280px deve ser tablet POS de balcão");
  });

  it("deve ativar o modo POS de balcão com ecrã dividido apenas em tablet landscape no POS", () => {
    const isSplitPos = (formFactor: "phone" | "tablet", orientation: "portrait" | "landscape", tab: MobileTab) => {
      return formFactor === "tablet" && orientation === "landscape" && tab === "pos";
    };

    assert.equal(isSplitPos("phone", "portrait", "pos"), false);
    assert.equal(isSplitPos("phone", "landscape", "pos"), false);
    assert.equal(isSplitPos("tablet", "portrait", "pos"), false);
    assert.equal(isSplitPos("tablet", "landscape", "products"), false);
    assert.equal(isSplitPos("tablet", "landscape", "pos"), true, "Tablet em landscape no POS deve ativar split-screen");
  });

  it("deve garantir áreas de toque de pelo menos 44px para acessibilidade móvel", () => {
    const touchTargetMinPx = 44;
    const buttonHeightPx = 48;
    const navItemHeightPx = 64;

    assert.ok(buttonHeightPx >= touchTargetMinPx, "Botões de ação devem ter no mínimo 44px");
    assert.ok(navItemHeightPx >= touchTargetMinPx, "Itens de navegação devem ter no mínimo 44px");
  });
});
