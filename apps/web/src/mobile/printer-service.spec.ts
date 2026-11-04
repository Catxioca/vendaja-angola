import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MobilePrinterService, EscPosReceiptPayload } from "./printer-service";

describe("MobilePrinterService (Android System & Direct ESC/POS)", () => {
  let printerService: MobilePrinterService;

  beforeEach(() => {
    printerService = MobilePrinterService.getInstance();
  });

  it("classifica honestamente o suporte dos tipos de periféricos", () => {
    const list = printerService.getPeripheralsClassification();
    assert.ok(list.length >= 6);

    const hid = list.find((p) => p.type === "HID_SCANNER");
    assert.ok(hid);
    assert.equal(hid?.status, "compatível por keyboard-wedge; pendente de validação física");

    const sysPrint = list.find((p) => p.type === "SYSTEM_PRINT");
    assert.ok(sysPrint);
    assert.equal(sysPrint?.status, "implementada via window.print/WebView; pendente de validação em Android e impressora física");

    const escPos = list.find((p) => p.type === "ESC_POS_TCP");
    assert.ok(escPos);
    assert.equal(escPos?.status, "interface/protocolo preparado; requer plugin nativo/bridge e teste físico");

    const drawer = list.find((p) => p.type === "CASH_DRAWER");
    assert.ok(drawer);
    assert.equal(drawer?.status, "interface/protocolo preparado; requer plugin nativo/bridge e teste físico");

    const bt = list.find((p) => p.type === "BLUETOOTH_PRINTER");
    assert.ok(bt);
    assert.equal(bt?.status, "interface/protocolo preparado; requer plugin nativo/bridge e teste físico");

    const tpa = list.find((p) => p.type === "TPA_TERMINAL");
    assert.ok(tpa);
    assert.equal(tpa?.status, "sandbox_emulado");
  });

  it("gera comandos ESC/POS com inicialização (ESC @) e corte de papel (GS V)", () => {
    const payload: EscPosReceiptPayload = {
      companyName: "Minha Loja de Teste Lda",
      companyNif: "5412345678",
      terminalId: "POS-01",
      lines: [
        { name: "Pão de Forma", quantity: 2, unitPrice: 500, total: 1000 },
        { name: "Leite UHT 1L", quantity: 1, unitPrice: 850, total: 850 },
      ],
      totalKz: 1850,
      timestamp: "2026-10-30T10:00:00Z",
      isProvisional: true,
      footnote: "Documento Provisório",
    };

    const bytes = printerService.generateEscPosBytes(payload, {
      encoding: "CP860",
      paperWidthMm: 80,
    });

    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 50);

    // Primeiro byte: ESC (0x1B), Segundo: '@' (0x40)
    assert.equal(bytes[0], 0x1b);
    assert.equal(bytes[1], 0x40);

    // Últimos bytes de corte: GS (0x1D), 'V' (0x56), 66, 0
    const len = bytes.length;
    assert.equal(bytes[len - 4], 0x1d);
    assert.equal(bytes[len - 3], 0x56);
    assert.equal(bytes[len - 2], 66);
    assert.equal(bytes[len - 1], 0);
  });

  it("emite comprovativo pelo subsistema de impressão do Android (iframe / window.print)", async () => {
    // Mock de ambiente DOM com print
    (globalThis as any).window = {
      print: () => {},
    };
    (globalThis as any).document = {
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
      createElement: () => ({
        style: {},
        contentWindow: {
          document: {
            open: () => {},
            write: () => {},
            close: () => {},
          },
          focus: () => {},
          print: () => {},
        },
      }),
    };

    const payload: EscPosReceiptPayload = {
      companyName: "Empresa de Teste",
      companyNif: "5000000000",
      terminalId: "POS-TEST",
      lines: [{ name: "Artigo A", quantity: 1, unitPrice: 200, total: 200 }],
      totalKz: 200,
      timestamp: new Date().toISOString(),
      isProvisional: true,
    };

    const res = await printerService.printReceiptSystem(payload);
    assert.equal(res.success, true);
    assert.match(res.message, /window\.print\/WebView/);
    assert.match(res.message, /pendente de validação em Android e impressora física/);
  });

  it("reporta tentativa de envio ESC/POS via TCP de forma clara", async () => {
    const res = await printerService.sendEscPosRawTcp(
      { host: "192.168.1.100", port: 9100, encoding: "CP860", paperWidthMm: 80 },
      "TEST PRINT\n"
    );
    assert.equal(res.success, true);
    assert.match(res.message, /192\.168\.1\.100:9100/);
    assert.match(res.message, /requer plugin nativo\/bridge e teste físico/);
  });
});
