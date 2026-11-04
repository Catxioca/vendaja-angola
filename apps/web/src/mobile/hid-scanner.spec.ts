import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HidScannerService, HidScanEvent } from "./hid-scanner";

describe("HidScannerService (USB / Bluetooth Keyboard Wedge)", () => {
  let service: HidScannerService;
  type KeydownListener = (e: any) => void;
  const keyListeners: KeydownListener[] = [];

  beforeEach(() => {
    keyListeners.length = 0;
    // Mock do objeto window e document para ambiente Node.js de teste
    (globalThis as any).window = {
      addEventListener: (_type: string, fn: KeydownListener) => {
        keyListeners.push(fn);
      },
      removeEventListener: (_type: string, fn: KeydownListener) => {
        const idx = keyListeners.indexOf(fn);
        if (idx !== -1) keyListeners.splice(idx, 1);
      },
    };
    (globalThis as any).document = {
      activeElement: null,
    };

    service = HidScannerService.getInstance();
    service.reset();
  });

  afterEach(() => {
    service.reset();
  });

  it("retorna o modelo de hardware testado e validado", () => {
    const model = service.getTestedModel();
    assert.match(model, /keyboard-wedge/i);
    assert.match(model, /pendente de validação física/i);
  });

  it("captura código de barras via rajada rápida (<50ms) terminada em Enter", () => {
    const captured: string[] = [];
    const unsub = service.subscribe((ev: HidScanEvent) => {
      captured.push(ev.barcode);
    });

    const dispatchKey = (key: string) => {
      for (const listener of keyListeners) {
        listener({
          key,
          preventDefault: () => {},
        });
      }
    };

    // Envia caracteres "5", "6", "0", "1", "2", "3" + Enter
    const chars = ["5", "6", "0", "1", "2", "3"];
    for (const char of chars) {
      dispatchKey(char);
    }
    dispatchKey("Enter");

    assert.equal(captured.length, 1);
    assert.equal(captured[0], "560123");
    unsub();
  });

  it("descarta digitação humana com intervalos superiores a 50ms", async () => {
    const captured: string[] = [];
    const unsub = service.subscribe((ev: HidScanEvent) => {
      captured.push(ev.barcode);
    });

    const dispatchKey = (key: string) => {
      for (const listener of keyListeners) {
        listener({
          key,
          preventDefault: () => {},
        });
      }
    };

    // Primeiro caractere
    dispatchKey("1");

    // Pausa humana de 70ms
    await new Promise((r) => setTimeout(r, 70));

    // Próximo caractere
    dispatchKey("2");
    dispatchKey("Enter");

    // Como buffer foi reiniciado por timeout humano e restou apenas "2" (< minBarcodeLength 3), não deve emitir
    assert.equal(captured.length, 0);
    unsub();
  });

  it("permite simulação direta de código de barras para testes ou fallback", () => {
    const captured: string[] = [];
    const unsub = service.subscribe((ev: HidScanEvent) => {
      captured.push(ev.barcode);
    });

    service.simulateBarcodeScan("7891234567890");

    assert.equal(captured.length, 1);
    assert.equal(captured[0], "7891234567890");
    unsub();
  });
});
