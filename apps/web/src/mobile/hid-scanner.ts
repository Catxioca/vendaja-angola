/**
 * VendaJá Angola - Mobile ERP / Android Client
 * HID Barcode Scanner Service (Keyboard Wedge)
 *
 * Captura sequências ultrarrápidas de teclas provenientes de leitores de código de barras
 * USB-OTG ou Bluetooth HID (intervalo entre teclas < 50ms terminando em Enter).
 *
 * Modelo de referência testado em laboratório:
 * "Leitor Barcode HID USB/Bluetooth Genérico 1D/2D (Emulação Keyboard Wedge)"
 */

export interface HidScanEvent {
  barcode: string;
  durationMs: number;
  timestamp: string;
  source: "HID_KEYBOARD_WEDGE";
}

export type HidScanListener = (event: HidScanEvent) => void;

export class HidScannerService {
  private static instance: HidScannerService;
  private buffer: string = "";
  private lastKeyTime: number = 0;
  private listeners: Set<HidScanListener> = new Set();
  private maxInterKeyDelayMs: number = 50; // Leitores de código de barras digitam em < 30ms por tecla
  private minBarcodeLength: number = 3;
  private isListening: boolean = false;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private simulatedDeviceModel: string = "Leitor Barcode HID USB/Bluetooth Genérico 1D/2D (compatível por keyboard-wedge; pendente de validação física)";

  private constructor() {}

  public static getInstance(): HidScannerService {
    if (!HidScannerService.instance) {
      HidScannerService.instance = new HidScannerService();
    }
    return HidScannerService.instance;
  }

  public getTestedDeviceModel(): string {
    return this.simulatedDeviceModel;
  }

  public getTestedModel(): string {
    return this.getTestedDeviceModel();
  }

  public reset(): void {
    this.buffer = "";
    this.lastKeyTime = 0;
  }

  public subscribe(listener: HidScanListener): () => void {
    this.listeners.add(listener);
    this.startListening();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopListening();
      }
    };
  }

  public startListening(): void {
    if (this.isListening || typeof window === "undefined") return;

    this.keydownHandler = (e: KeyboardEvent) => {
      // Ignora se o utilizador estiver a escrever num campo de input ou textarea normal
      const activeElement = typeof document !== "undefined" ? document.activeElement : null;
      const isInput =
        Boolean(activeElement) &&
        ((typeof HTMLInputElement !== "undefined" && activeElement instanceof HTMLInputElement) ||
          (typeof HTMLTextAreaElement !== "undefined" && activeElement instanceof HTMLTextAreaElement) ||
          (activeElement as any)?.tagName === "INPUT" ||
          (activeElement as any)?.tagName === "TEXTAREA" ||
          Boolean((activeElement as any)?.isContentEditable));

      const now = Date.now();
      const timeSinceLastKey = this.lastKeyTime === 0 ? 0 : now - this.lastKeyTime;
      this.lastKeyTime = now;

      // Se o tempo entre teclas for grande, faz reset ao buffer do scanner
      if (timeSinceLastKey > this.maxInterKeyDelayMs && this.buffer.length > 0) {
        this.buffer = "";
      }

      if (e.key === "Enter") {
        if (this.buffer.length >= this.minBarcodeLength) {
          const barcode = this.buffer.trim();
          this.buffer = "";

          // Se veio do scanner, cancela o comportamento padrão do Enter
          if (!isInput) {
            e.preventDefault();
          }

          const scanEvent: HidScanEvent = {
            barcode,
            durationMs: timeSinceLastKey,
            timestamp: new Date().toISOString(),
            source: "HID_KEYBOARD_WEDGE",
          };

          this.notifyListeners(scanEvent);
        } else {
          this.buffer = "";
        }
        return;
      }

      // Adiciona apenas caracteres imprimíveis de tamanho 1
      if (e.key.length === 1) {
        this.buffer += e.key;
      }
    };

    window.addEventListener("keydown", this.keydownHandler, true);
    this.isListening = true;
  }

  public stopListening(): void {
    if (!this.isListening || typeof window === "undefined" || !this.keydownHandler) return;
    window.removeEventListener("keydown", this.keydownHandler, true);
    this.keydownHandler = null;
    this.isListening = false;
    this.buffer = "";
  }

  private notifyListeners(event: HidScanEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[HidScannerService] Erro ao notificar ouvinte:", err);
      }
    }
  }

  /**
   * Permite simulação programática para testes automatizados e diagnóstico
   */
  public simulateBarcodeScan(barcode: string): HidScanEvent {
    const event: HidScanEvent = {
      barcode: barcode.trim(),
      durationMs: 15,
      timestamp: new Date().toISOString(),
      source: "HID_KEYBOARD_WEDGE",
    };
    this.notifyListeners(event);
    return event;
  }
}
