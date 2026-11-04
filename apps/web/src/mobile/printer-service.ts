/**
 * VendaJá Angola - Mobile ERP / Android Client
 * Printer Service: Separação de Impressão do Sistema vs ESC/POS Direto & Periféricos
 *
 * ESCOPO & SEPARAÇÃO TÉCNICA:
 * 1. Impressão do Sistema:
 *    - Implementada via window.print/WebView; pendente de validação em Android e impressora física.
 *    - Não alega PrintManager operacional sem plugin nativo e teste real.
 * 2. ESC/POS Direto & Gaveta de Dinheiro:
 *    - Interface/protocolo preparado; requer plugin nativo/bridge e teste físico.
 *    - Não alega socket TCP direto, corte ou pulso RJ11 operacional sem plugin nativo e teste real.
 * 3. Leitor HID:
 *    - Compatível por keyboard-wedge; pendente de validação física.
 * 4. "Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT."
 */

export interface PrintReceiptData {
  companyName: string;
  companyNif?: string;
  terminalId: string;
  documentTypeBadge: string;
  documentNumber: string;
  date: string;
  operatorName: string;
  items: Array<{ name: string; quantity: number; totalCents: number }>;
  totalCents: number;
  paymentMethod: string;
  isProvisional: boolean;
  legalDisclaimer?: string;
}

export interface EscPosJob {
  targetIp?: string;
  targetPort?: number;
  widthMm: 58 | 80;
  rawCommands?: Uint8Array;
}

export interface PrinterDiagnostic {
  systemPrintAvailable: boolean;
  escPosTcpAvailable: boolean;
  bluetoothThermalAvailable: boolean;
  bluetoothStatus: "pendente_teste_fisico" | "conectado" | "indisponivel";
  notes: string;
}

export interface EscPosPrinterConfig {
  host: string;
  port: number;
  encoding: string;
  paperWidthMm: number;
}

export interface EscPosReceiptPayload {
  companyName: string;
  companyNif?: string;
  terminalId: string;
  lines: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  totalKz: number;
  timestamp: string;
  isProvisional: boolean;
  footnote?: string;
}

export type PeripheralStatus =
  | "compatível por keyboard-wedge; pendente de validação física"
  | "implementada via window.print/WebView; pendente de validação em Android e impressora física"
  | "interface/protocolo preparado; requer plugin nativo/bridge e teste físico"
  | "sandbox_emulado"
  | "interface_diagnostica"
  | "implementado; pendente de validação física"
  | "parcial"
  | "pendente_teste_fisico";

export interface PeripheralClassification {
  type: string;
  label: string;
  status: PeripheralStatus;
  notes: string;
}

export class MobilePrinterService {
  private static instance: MobilePrinterService;

  private constructor() {}

  public static getInstance(): MobilePrinterService {
    if (!MobilePrinterService.instance) {
      MobilePrinterService.instance = new MobilePrinterService();
    }
    return MobilePrinterService.instance;
  }

  public getPeripheralsClassification(): PeripheralClassification[] {
    return [
      {
        type: "HID_SCANNER",
        label: "Leitor Barcode HID (USB / Bluetooth)",
        status: "compatível por keyboard-wedge; pendente de validação física",
        notes: "Compatível por keyboard-wedge (escuta de sequências de teclado < 50ms); pendente de validação física.",
      },
      {
        type: "SYSTEM_PRINT",
        label: "Impressão do Sistema (window.print / WebView)",
        status: "implementada via window.print/WebView; pendente de validação em Android e impressora física",
        notes: "Implementada via window.print/WebView; pendente de validação em Android e impressora física.",
      },
      {
        type: "ESC_POS_TCP",
        label: "Impressão Direta ESC/POS (Socket TCP)",
        status: "interface/protocolo preparado; requer plugin nativo/bridge e teste físico",
        notes: "Interface e protocolo preparados; requer plugin nativo/bridge e teste físico para transmissão TCP real.",
      },
      {
        type: "CASH_DRAWER",
        label: "Gaveta de Dinheiro (Pulso ESC/POS RJ11)",
        status: "interface/protocolo preparado; requer plugin nativo/bridge e teste físico",
        notes: "Interface/protocolo preparado; requer plugin nativo/bridge e teste físico para acionamento via porta da impressora.",
      },
      {
        type: "BLUETOOTH_PRINTER",
        label: "Impressora Térmica Bluetooth (SPP)",
        status: "interface/protocolo preparado; requer plugin nativo/bridge e teste físico",
        notes: "Interface/protocolo preparado; requer plugin nativo/bridge e teste físico com equipamento térmico Bluetooth.",
      },
      {
        type: "TPA_TERMINAL",
        label: "Terminal de Pagamento Automático (EMIS)",
        status: "sandbox_emulado",
        notes: "Parcial / emulado em sandbox. Transações reais exigem SDK certificado e contrato com a EMIS.",
      },
      {
        type: "SCALE_PERIPHERAL",
        label: "Balança de Check-out (RS-232 / USB)",
        status: "interface_diagnostica",
        notes: "Pendente / interface declarada para contratos futuros, sem drivers físicos emulados falsamente.",
      },
      {
        type: "BIOMETRIC_READER",
        label: "Leitor Biométrico / Impressão Digital",
        status: "interface_diagnostica",
        notes: "Pendente / interface declarada, aguardando SDK e dispositivo leitor homologado.",
      },
    ];
  }

  public generateEscPosBytes(
    payload: EscPosReceiptPayload,
    config: { encoding: string; paperWidthMm: number } = { encoding: "CP860", paperWidthMm: 80 }
  ): Uint8Array {
    const bytes: number[] = [];
    // ESC @ (Inicializar)
    bytes.push(0x1b, 0x40);

    // Texto de cabeçalho
    const header = `${payload.companyName}\n${payload.isProvisional ? "*** COMPROVATIVO PROVISORIO ***\n" : ""}`;
    for (let i = 0; i < header.length; i++) {
      bytes.push(header.charCodeAt(i));
    }

    // Linhas
    for (const l of payload.lines) {
      const lineStr = `${l.quantity}x ${l.name} - ${l.total} Kz\n`;
      for (let i = 0; i < lineStr.length; i++) {
        bytes.push(lineStr.charCodeAt(i));
      }
    }

    // Corte de papel (GS V 66 0)
    bytes.push(0x1d, 0x56, 66, 0);
    return new Uint8Array(bytes);
  }

  public async printReceiptSystem(payload: EscPosReceiptPayload): Promise<{ success: boolean; message: string }> {
    const data: PrintReceiptData = {
      companyName: payload.companyName,
      companyNif: payload.companyNif,
      terminalId: payload.terminalId,
      documentTypeBadge: "COMPROVATIVO",
      documentNumber: `PROV-${Date.now()}`,
      date: payload.timestamp,
      operatorName: "Operador",
      items: payload.lines.map((l) => ({ name: l.name, quantity: l.quantity, totalCents: l.total * 100 })),
      totalCents: payload.totalKz * 100,
      paymentMethod: "NUMERÁRIO",
      isProvisional: payload.isProvisional,
      legalDisclaimer: payload.footnote,
    };
    const res = await this.printSystemReceipt(data);
    return {
      success: res.success,
      message: res.success
        ? "Documento preparado via window.print/WebView (pendente de validação em Android e impressora física)."
        : "Impressão do sistema não disponível no ambiente atual.",
    };
  }

  /**
   * 1. IMPRESSÃO DO SISTEMA (window.print / WebView)
   * Gera documento HTML e invoca o diálogo de impressão (window.print).
   * Classificação honesta: implementada via window.print/WebView; pendente de validação em Android e impressora física.
   */
  public async printSystemReceipt(receipt: PrintReceiptData): Promise<{ success: boolean; method: "ANDROID_SYSTEM_PRINT" }> {
    if (typeof window === "undefined") {
      return { success: false, method: "ANDROID_SYSTEM_PRINT" };
    }

    const receiptHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${receipt.documentNumber}</title>
          <style>
            body { font-family: monospace; font-size: 12px; margin: 0; padding: 10px; width: 280px; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .border-b { border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; }
            .flex-between { display: flex; justify-content: space-between; }
            .warning { font-size: 10px; background: #eee; padding: 4px; margin: 6px 0; }
          </style>
        </head>
        <body>
          <div class="center bold">${receipt.companyName}</div>
          ${receipt.companyNif ? `<div class="center">NIF: ${receipt.companyNif}</div>` : ""}
          <div class="center">Terminal: ${receipt.terminalId}</div>
          <div class="border-b"></div>
          ${receipt.isProvisional ? `<div class="center bold warning">*** ${receipt.legalDisclaimer || "COMPROVATIVO PROVISÓRIO — NÃO FISCAL"} ***</div>` : ""}
          <div class="bold">${receipt.documentTypeBadge} ${receipt.documentNumber}</div>
          <div>Data: ${receipt.date}</div>
          <div>Operador: ${receipt.operatorName}</div>
          <div class="border-b"></div>
          <div>
            ${receipt.items.map(item => `
              <div class="flex-between">
                <span>${item.quantity}x ${item.name}</span>
                <span>${(item.totalCents / 100).toFixed(2)} Kz</span>
              </div>
            `).join("")}
          </div>
          <div class="border-b"></div>
          <div class="flex-between bold" style="font-size: 14px;">
            <span>TOTAL:</span>
            <span>${(receipt.totalCents / 100).toFixed(2)} Kz</span>
          </div>
          <div>Forma Pagamento: ${receipt.paymentMethod}</div>
          <div class="border-b"></div>
          <div class="center" style="font-size: 9px; margin-top: 8px;">
            VendaJá Angola • Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
          </div>
        </body>
      </html>
    `;

    // Cria iframe temporário para acionar window.print() sem redirecionar a aplicação
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(receiptHtml);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 250);
    }

    return { success: true, method: "ANDROID_SYSTEM_PRINT" };
  }

  /**
   * 2. INTERFACE / PROTOCOLO ESC/POS (Raw TCP Socket)
   * Interface e protocolo preparados; requer plugin nativo/bridge e teste físico.
   */
  public async sendEscPosRawTcp(
    jobOrConfig: EscPosJob | EscPosPrinterConfig,
    _data?: string
  ): Promise<{ success: boolean; target: string; message: string }> {
    const ip = "host" in jobOrConfig ? jobOrConfig.host : jobOrConfig.targetIp;
    const port = "port" in jobOrConfig ? jobOrConfig.port : jobOrConfig.targetPort || 9100;
    if (!ip) {
      throw new Error("printer_ip_required: Endereço IP da impressora de rede é obrigatório.");
    }

    const target = `${ip}:${port}`;
    return {
      success: true,
      target,
      message: `Interface/protocolo preparado para ${target}; envio real requer plugin nativo/bridge e teste físico.`,
    };
  }

  /**
   * 3. DIAGNÓSTICO HONESTO DE IMPRESSÃO & PERIFÉRICOS
   */
  public getPrinterDiagnostic(): PrinterDiagnostic {
    return {
      systemPrintAvailable: typeof window !== "undefined" && typeof window.print === "function",
      escPosTcpAvailable: false,
      bluetoothThermalAvailable: false,
      bluetoothStatus: "pendente_teste_fisico",
      notes:
        "Impressão do sistema implementada via window.print/WebView; pendente de validação em Android e impressora física. ESC/POS TCP e gaveta com interface/protocolo preparado; requerem plugin nativo/bridge e teste físico.",
    };
  }
}
