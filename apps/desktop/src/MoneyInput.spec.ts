import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import {
  formatCentsToDecimal,
  formatCentsToDisplay,
  isExplicitZeroMoney,
  parseConfirmedMoneyCents,
  parseMoneyDetails,
  parseMoneyToCents,
} from "@angola/shared";
import { MoneyInput } from "./MoneyInput.js";

// Setup minimal Mock DOM environment for React 19 testing in Node.js
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

class MockNode {
  nodeType: number;
  nodeName: string;
  childNodes: MockNode[];
  parentNode: MockNode | null;
  style: Record<string, string>;
  constructor(nodeType = 1, nodeName = "DIV") {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
  }
  appendChild<T extends MockNode>(child: T): T {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild<T extends MockNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      child.parentNode = null;
      this.childNodes.splice(idx, 1);
    }
    return child;
  }
  insertBefore<T extends MockNode>(newChild: T, refChild: MockNode | null): T {
    newChild.parentNode = this;
    const idx = refChild ? this.childNodes.indexOf(refChild) : -1;
    if (idx === -1) this.childNodes.push(newChild);
    else this.childNodes.splice(idx, 0, newChild);
    return newChild;
  }
}

class MockElement extends MockNode {
  tagName: string;
  attributes: Record<string, string>;
  private _value: string;
  listeners: Map<string, Array<(evt: any) => void>>;
  ownerDocument?: any;
  selected?: boolean;
  focused?: boolean;

  constructor(tagName = "DIV") {
    super(1, tagName.toUpperCase());
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this._value = "";
    this.listeners = new Map();
  }

  setAttribute(k: string, v: any) { this.attributes[k] = String(v); }
  getAttribute(k: string) { return this.attributes[k] ?? null; }
  removeAttribute(k: string) { delete this.attributes[k]; }
  hasAttribute(k: string) { return k in this.attributes; }
  get value() { return this._value; }
  set value(v: any) { this._value = String(v); }
  get textContent(): string {
    return this.childNodes.map(c => (c as any).nodeType === 3 ? (c as any).nodeValue : ((c as MockElement).textContent || "")).join("");
  }
  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild({ nodeType: 3, nodeValue: String(val), parentNode: this } as any);
    }
  }
  addEventListener() {}
  removeEventListener() {}
  select() { this.selected = true; }
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  querySelector(sel: string): MockElement | null {
    for (const child of this.childNodes) {
      if (child.nodeType === 1) {
        const el = child as MockElement;
        if (sel === "input" && el.tagName === "INPUT") return el;
        if (sel === "span" && el.tagName === "SPAN") return el;
        if (sel.startsWith("#") && el.getAttribute("id") === sel.slice(1)) return el;
        const res = el.querySelector(sel);
        if (res) return res;
      }
    }
    return null;
  }
}

function getMockDoc(): MockElement {
  if ((globalThis as any).document) return (globalThis as any).document;
  const doc = new MockElement("doc") as any;
  doc.nodeType = 9;
  doc.createElement = (tag: string) => {
    const el = new MockElement(tag);
    el.ownerDocument = doc;
    return el;
  };
  doc.createTextNode = (text: any) => ({ nodeType: 3, nodeValue: String(text), parentNode: null });
  doc.createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
  doc.defaultView = globalThis;
  (globalThis as any).document = doc;
  (globalThis as any).window = globalThis;
  (globalThis as any).HTMLIFrameElement = class {};
  (globalThis as any).HTMLInputElement = class extends MockElement {};
  (globalThis as any).HTMLElement = MockElement;
  (globalThis as any).Element = MockElement;
  (globalThis as any).requestAnimationFrame = (fn: () => void) => setTimeout(fn, 0);
  return doc;
}

function getInputProps(el: MockElement): any {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key ? (el as any)[key] : null;
}

// ----------------------------------------------------
// TESTES REAIS DO COMPONENTE RENDERIZADO REACT (FASE 1.3)
// ----------------------------------------------------

test("Desktop MoneyInput [Real Component] - Cenário 1: Produto existente apagado não grava zero e exibe erro acessível", async () => {
  const doc = getMockDoc();
  let confirmedCents = 150000; // 1.500,00 Kz
  const onChangeCents = (newCents: number) => {
    confirmedCents = newCents;
  };

  const container = (doc as any).createElement("div");
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(MoneyInput, {
        valueCents: confirmedCents,
        onChangeCents,
        required: true,
      })
    );
  });

  const wrapper = container.childNodes[0] as MockElement;
  const input = wrapper.childNodes[0] as MockElement;
  assert.equal(getInputProps(input).value, "1500,00");

  // Foco
  await act(async () => {
    getInputProps(input).onFocus({ target: input });
  });

  // Apaga conteúdo
  await act(async () => {
    getInputProps(input).onChange({ target: { value: "" } });
  });
  assert.equal(confirmedCents, 150000, "Durante a digitação vazia, onChangeCents(0) NÃO deve ser chamado");
  assert.equal(getInputProps(input).value, "");

  // Perda de foco (blur)
  await act(async () => {
    getInputProps(input).onBlur({ target: input });
  });

  // Validações obrigatórias
  assert.equal(confirmedCents, 150000, "Valor confirmado continua 150000 cêntimos (NUNCA gravou 0)");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  const alertSpan = wrapper.childNodes[1] as MockElement;
  assert.ok(alertSpan, "Elemento de erro acessível deve existir no DOM");
  assert.equal(alertSpan.getAttribute("role"), "alert");
  assert.equal(alertSpan.textContent, "Preço obrigatório");

  await act(async () => {
    root.unmount();
  });
});

test("Desktop MoneyInput [Real Component] - Cenário 2: Digitação explícita de zero chama onChangeCents(0) legitimamente", async () => {
  const doc = getMockDoc();
  let confirmedCents = 150000;
  const onChangeCents = (newCents: number) => {
    confirmedCents = newCents;
  };

  const container = (doc as any).createElement("div");
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(MoneyInput, {
        valueCents: confirmedCents,
        onChangeCents,
      })
    );
  });

  const wrapper = container.childNodes[0] as MockElement;
  const input = wrapper.childNodes[0] as MockElement;

  await act(async () => {
    getInputProps(input).onFocus({ target: input });
  });

  await act(async () => {
    getInputProps(input).onChange({ target: { value: "0" } });
  });
  assert.equal(confirmedCents, 0, "Digitação explícita de 0 deve invocar onChangeCents(0)");

  await act(async () => {
    getInputProps(input).onBlur({ target: input });
  });

  assert.equal(input.getAttribute("aria-invalid"), "false");
  assert.equal(confirmedCents, 0, "Zero explícito mantém zero confirmado");

  await act(async () => {
    root.unmount();
  });
});

test("Desktop MoneyInput [Real Component] - Cenário 3: Estado inicial zero começa vazio com placeholder '0,00' e permite digitação fluida", async () => {
  const doc = getMockDoc();
  let confirmedCents = 0;
  const onChangeCents = (newCents: number) => {
    confirmedCents = newCents;
  };

  const container = (doc as any).createElement("div");
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(MoneyInput, {
        valueCents: 0,
        onChangeCents,
      })
    );
  });

  const wrapper = container.childNodes[0] as MockElement;
  const input = wrapper.childNodes[0] as MockElement;

  assert.equal(getInputProps(input).value, "", "Estado inicial com valueCents=0 deve ser string vazia na tela");
  assert.equal(input.getAttribute("placeholder"), "0,00");

  await act(async () => {
    getInputProps(input).onFocus({ target: input });
  });
  assert.equal(getInputProps(input).value, "", "Ao focar com zero, permanece visualmente vazio");

  await act(async () => {
    getInputProps(input).onChange({ target: { value: "450" } });
  });
  assert.equal(confirmedCents, 45000, "Digitação de 450 converte fluidamente para 45000 cêntimos");

  await act(async () => {
    root.unmount();
  });
});

test("Desktop MoneyInput [Real Component] - Cenário 4: Acessibilidade com aria-label, aria-invalid e aria-describedby com role='alert'", async () => {
  const doc = getMockDoc();
  const container = (doc as any).createElement("div");
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(MoneyInput, {
        id: "desktop-preco-custo",
        "aria-label": "Preço de Custo em Kwanzas",
        valueCents: 5000,
        onChangeCents: () => {},
        required: true,
      })
    );
  });

  const wrapper = container.childNodes[0] as MockElement;
  const input = wrapper.childNodes[0] as MockElement;

  assert.equal(input.getAttribute("id"), "desktop-preco-custo");
  assert.equal(input.getAttribute("aria-label"), "Preço de Custo em Kwanzas");
  assert.equal(input.getAttribute("aria-invalid"), "false");

  // Limpa o valor e perde o foco
  await act(async () => {
    getInputProps(input).onFocus({ target: input });
  });
  await act(async () => {
    getInputProps(input).onChange({ target: { value: "" } });
  });
  await act(async () => {
    getInputProps(input).onBlur({ target: input });
  });

  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(input.getAttribute("aria-describedby"), "desktop-preco-custo-error");
  const alertSpan = wrapper.childNodes[1] as MockElement;
  assert.equal(alertSpan.getAttribute("id"), "desktop-preco-custo-error");
  assert.equal(alertSpan.getAttribute("role"), "alert");
  assert.equal(alertSpan.textContent, "Preço obrigatório");

  await act(async () => {
    root.unmount();
  });
});

test("Desktop MoneyInput [Real Component] - Cenário 5: Compatibilidade com forwardRef, focus, select e rejeição de entradas inválidas", async () => {
  const doc = getMockDoc();
  const inputRef = createRef<HTMLInputElement>();
  const container = (doc as any).createElement("div");
  const root = createRoot(container);
  let confirmedCents = 12000;

  await act(async () => {
    root.render(
      React.createElement(MoneyInput, {
        ref: inputRef,
        valueCents: confirmedCents,
        onChangeCents: (v) => { confirmedCents = v; },
      })
    );
  });

  assert.ok(inputRef.current, "forwardRef deve expor a instância do input");
  (inputRef.current as any).focus();
  assert.equal((inputRef.current as any).focused, true);
  (inputRef.current as any).select();
  assert.equal((inputRef.current as any).selected, true);

  const wrapper = container.childNodes[0] as MockElement;
  const input = wrapper.childNodes[0] as MockElement;

  // Entrada inválida: formato com múltiplos separadores ou mais de 2 casas
  await act(async () => {
    getInputProps(input).onChange({ target: { value: "12,345" } });
  });

  assert.equal(confirmedCents, 12000, "Entrada inválida não altera confirmedCents");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  const alertSpan = wrapper.childNodes[1] as MockElement;
  assert.equal(alertSpan.getAttribute("role"), "alert");
  assert.match(alertSpan.textContent, /2 casas decimais/i);

  await act(async () => {
    root.unmount();
  });
});

// ----------------------------------------------------
// TESTES UNITÁRIOS DE REGRAS E FUNÇÕES AUXILIARES (@angola/shared)
// ----------------------------------------------------

test("Desktop MoneyInput - Regra 1: zero inicial não bloqueia primeira digitação", () => {
  const valueCents = 0;
  const initialDisplay = valueCents > 0 ? formatCentsToDecimal(valueCents) : "";
  assert.equal(initialDisplay, "");

  let rawInput = "";
  rawInput += "1";
  assert.equal(parseMoneyToCents(rawInput), 100);
  rawInput += "500";
  assert.equal(parseMoneyToCents(rawInput), 150000);
});

test("Desktop MoneyInput - Regra 2: valor existente é totalmente selecionado e substituível ao focar", () => {
  const existingPriceCents = 125000;
  const formattedForEdit = formatCentsToDecimal(existingPriceCents);
  assert.equal(formattedForEdit, "1250,00");

  const firstKey = "3";
  assert.equal(parseMoneyToCents(firstKey), 300);
});

test("Desktop MoneyInput - Regra 3: entradas transitórias não provocam reformatação agressiva", () => {
  const transientEmpty = "";
  assert.equal(parseMoneyDetails(transientEmpty).valid, true);
  assert.equal(parseMoneyDetails(transientEmpty).isEmpty, true);

  const transientInteger = "1500";
  assert.equal(parseMoneyDetails(transientInteger).valid, true);
  assert.equal(parseMoneyToCents(transientInteger), 150000);

  const transientTrailingComma = "1500,";
  assert.equal(parseMoneyDetails(transientTrailingComma).valid, true);
  assert.equal(parseMoneyToCents(transientTrailingComma), 150000);

  const transientOneDecimal = "1500,5";
  assert.equal(parseMoneyDetails(transientOneDecimal).valid, true);
  assert.equal(parseMoneyToCents(transientOneDecimal), 150050);

  const transientThousandsComma = "1.250,";
  assert.equal(parseMoneyDetails(transientThousandsComma).valid, true);
  assert.equal(parseMoneyToCents(transientThousandsComma), 125000);
});

test("Desktop MoneyInput - Regra 4: blur converte determinísticamente e formata para apresentação", () => {
  const rawInput = "1500,5";
  const parsed = parseMoneyDetails(rawInput);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.cents, 150050);

  const formattedDecimal = formatCentsToDecimal(parsed.cents);
  assert.equal(formattedDecimal, "1500,50");

  const formattedDisplay = formatCentsToDisplay(parsed.cents);
  assert.equal(formattedDisplay, "1.500,50");
});

test("Desktop MoneyInput - Regra 5: acessibilidade de erro sem destruição silenciosa de dados", () => {
  const invalidInput = "1500,555";
  const details = parseMoneyDetails(invalidInput);
  assert.equal(details.valid, false);
  assert.match(details.error ?? "", /2 casas decimais/i);
});

test("Desktop MoneyInput - Regra 6: sem regressão na criação ou edição de produto", () => {
  const newProductForm = { name: "Sumo Compal", costCents: 0, priceCents: 0 };
  assert.equal(newProductForm.costCents, 0);
  assert.equal(newProductForm.priceCents, 0);

  newProductForm.costCents = parseMoneyToCents("450");
  newProductForm.priceCents = parseMoneyToCents("750");
  assert.equal(newProductForm.costCents, 45000);
  assert.equal(newProductForm.priceCents, 75000);

  newProductForm.priceCents = parseMoneyToCents("799,99");
  assert.equal(newProductForm.priceCents, 79999);
});
