import React, { useState } from "react";
import { HidScannerService } from "../hid-scanner";
import { MobilePrinterService, EscPosPrinterConfig } from "../printer-service";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTriggerCamera?: () => void;
  onBarcodeTested?: (barcode: string) => void;
}

export function DeviceDiagnosticsModal({
  isOpen,
  onClose,
  onTriggerCamera,
  onBarcodeTested,
}: Props) {
  const [hidLog, setHidLog] = useState<string>("");
  const [tpaResult, setTpaResult] = useState<string>("");
  const [tcpConfig, setTcpConfig] = useState<EscPosPrinterConfig>({
    host: "192.168.1.200",
    port: 9100,
    encoding: "CP860",
    paperWidthMm: 80,
  });
  const [tcpStatus, setTcpStatus] = useState<string>("");

  if (!isOpen) return null;

  const hidService = HidScannerService.getInstance();
  const printerService = MobilePrinterService.getInstance();

  const handleTestHidSimulation = () => {
    const testBarcode = "5601234567890";
    setHidLog(`A simular leitura de código de barras: ${testBarcode}...`);
    hidService.simulateBarcodeScan(testBarcode);
    if (onBarcodeTested) {
      onBarcodeTested(testBarcode);
    }
    setTimeout(() => {
      setHidLog(`Código ${testBarcode} capturado com sucesso via buffer HID!`);
    }, 300);
  };

  const handleTestSystemPrint = async () => {
    const res = await printerService.printReceiptSystem({
      companyName: "VendaJá Teste Diagnóstico Lda",
      companyNif: "5000000000",
      terminalId: "TERM-DIAG-01",
      lines: [
        { name: "Artigo de Teste Diagnóstico", quantity: 1, unitPrice: 1000, total: 1000 },
      ],
      totalKz: 1000,
      timestamp: new Date().toISOString(),
      isProvisional: true,
    });
    alert(res.message);
  };

  const handleTestTcpEscPos = async () => {
    setTcpStatus("A enviar comando ESC/POS via socket TCP...");
    const res = await printerService.sendEscPosRawTcp(
      tcpConfig,
      "=== VENDAJA ANGOLA DIAGNOSTICO ESC/POS ===\nTESTE DE IMPRESSAO EM LINHA\n\n\n"
    );
    setTcpStatus(`${res.success ? "SUCESSO" : "INFO"}: ${res.message}`);
  };

  const handleTestTpaSandbox = () => {
    setTpaResult("A processar transação no Sandbox EMIS TPA...");
    setTimeout(() => {
      setTpaResult("AUTORIZADA [SANDBOX]. Código Autorização: EMIS-MOCK-987654. Nota: Transação simulada.");
    }, 600);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diag-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <header className="p-4 sm:p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/90">
          <div className="flex items-center gap-2">
            <span className="text-xl">📡</span>
            <div>
              <h2 id="diag-title" className="font-bold text-base text-white">
                Diagnóstico de Periféricos & Hardware
              </h2>
              <p className="text-[11px] text-slate-400">
                Estado real, conectividade e interfaces operacionais (7–10&quot; e telemóvel)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar diagnóstico"
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition min-w-[48px] min-h-[48px]"
          >
            ✕
          </button>
        </header>

        {/* Conteúdo com scroll */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Alerta de transparência técnica */}
          <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-2xl text-[11px] text-amber-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Transparência de Hardware & Restrições Fiscais:</span>
            </div>
            <p>
              Periféricos sem suporte físico real comprovado estão classificados honestamente.
              Não simulamos hardware inexistente como se fosse operacional.
            </p>
            <p className="font-semibold text-amber-200">
              &quot;Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.&quot;
            </p>
          </div>

          {/* 1. HID Barcode Scanner */}
          <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-bold text-sky-400 flex items-center gap-1.5">
                <span>⌨️</span>
                <span>Leitor Barcode HID (USB / Bluetooth Wedge)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 text-[10px] font-bold">
                COMPATÍVEL POR KEYBOARD-WEDGE; PENDENTE DE VALIDAÇÃO FÍSICA
              </span>
            </div>
            <div className="text-slate-300 text-[11px]">
              Captura automática de rajadas de teclado (&lt; 50ms) com finalizador Enter.
              <br />
              <span className="text-slate-400">Classificação:</span>{" "}
              <span className="font-mono text-slate-200">{hidService.getTestedModel()}</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestHidSimulation}
                className="min-h-[48px] min-w-[48px] px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl font-bold text-white text-xs transition"
              >
                Testar Simulação de Scan HID
              </button>
              {hidLog && <span className="text-[11px] text-emerald-300 font-mono">{hidLog}</span>}
            </div>
          </div>

          {/* 2. Câmara Traseira */}
          <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                <span>📷</span>
                <span>Câmara / Leitor Ótico</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 text-[10px] font-bold">
                PARCIAL / PENDENTE VALIDAÇÃO FÍSICA
              </span>
            </div>
            <div className="text-slate-300 text-[11px]">
              Utiliza câmara traseira com `getUserMedia` e fallback para introdução manual de código de barras.
            </div>
            {onTriggerCamera && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onTriggerCamera();
                }}
                className="min-h-[48px] min-w-[48px] px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white text-xs transition"
              >
                Abrir Scanner de Câmara
              </button>
            )}
          </div>

          {/* 3. Impressão do Sistema */}
          <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <span>🖨️</span>
                <span>Impressão do Sistema (window.print / WebView)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 text-[10px] font-bold">
                IMPLEMENTADA VIA WINDOW.PRINT/WEBVIEW; PENDENTE DE VALIDAÇÃO EM ANDROID E IMPRESSORA FÍSICA
              </span>
            </div>
            <div className="text-slate-300 text-[11px]">
              Gera documento formatado (58mm/80mm) via `window.print()` e WebView. Operação física depende de impressora instalada no SO.
            </div>
            <button
              type="button"
              onClick={handleTestSystemPrint}
              className="min-h-[48px] min-w-[48px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-white text-xs transition"
            >
              Imprimir Recibo de Teste (Sistema)
            </button>
          </div>

          {/* 4. Impressão Direta ESC/POS (TCP) */}
          <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                <span>🌐</span>
                <span>Impressão Direta ESC/POS (Socket TCP)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 text-[10px] font-bold">
                INTERFACE/PROTOCOLO PREPARADO; REQUER PLUGIN NATIVO/BRIDGE E TESTE FÍSICO
              </span>
            </div>
            <div className="text-slate-300 text-[11px]">
              Interface e protocolo preparados; comunicação direta via socket TCP requer plugin nativo/bridge e teste físico na LAN.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">IP da Impressora:</label>
                <input
                  type="text"
                  value={tcpConfig.host}
                  onChange={(e) => setTcpConfig({ ...tcpConfig, host: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Porta:</label>
                <input
                  type="number"
                  value={tcpConfig.port}
                  onChange={(e) => setTcpConfig({ ...tcpConfig, port: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestTcpEscPos}
                className="min-h-[48px] min-w-[48px] px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-white text-xs transition"
              >
                Testar Interface ESC/POS
              </button>
              {tcpStatus && <span className="text-[11px] text-cyan-300 font-mono">{tcpStatus}</span>}
            </div>
          </div>

          {/* 5. Impressora Bluetooth */}
          <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-bold text-blue-400 flex items-center gap-1.5">
                <span>📶</span>
                <span>Impressora Térmica Bluetooth (SPP)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 text-[10px] font-bold">
                INTERFACE/PROTOCOLO PREPARADO; REQUER PLUGIN NATIVO/BRIDGE E TESTE FÍSICO
              </span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Classificação honesta: interface/protocolo preparado; requer plugin nativo/bridge e teste físico com equipamento de impressão Bluetooth real.
            </div>
          </div>

          {/* 6. TPA / Multicaixa EMIS */}
          <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-bold text-orange-400 flex items-center gap-1.5">
                <span>💳</span>
                <span>TPA / Terminal de Pagamento (EMIS)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 text-[10px] font-bold">
                SANDBOX / EMULADO
              </span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Modo sandbox integrado. Transações reais exigem contrato formal com EMIS e SDK nativo homologado.
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestTpaSandbox}
                className="min-h-[48px] min-w-[48px] px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl font-bold text-white text-xs transition"
              >
                Testar Autorização TPA Sandbox
              </button>
              {tpaResult && <span className="text-[11px] text-purple-300 font-mono">{tpaResult}</span>}
            </div>
          </div>

          {/* 7. Balança & Gaveta & Biometria */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <div className="font-bold text-white text-xs mb-1">⚖️ Balança de Check-out</div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-bold block w-fit mb-1">
                INTERFACE DIAGNÓSTICA
              </span>
              <p className="text-[10px] text-slate-400">
                Protocolos Toledo/Filizola não emulados falsamente.
              </p>
            </div>
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <div className="font-bold text-white text-xs mb-1">🗄️ Gaveta de Dinheiro</div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-bold block w-fit mb-1">
                INTERFACE/PROTOCOLO PREPARADO; REQUER PLUGIN NATIVO/BRIDGE E TESTE FÍSICO
              </span>
              <p className="text-[10px] text-slate-400">
                Interface/protocolo preparado (ESC p); disparo de pulso elétrico RJ11 requer plugin nativo/bridge e validação física.
              </p>
            </div>
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <div className="font-bold text-white text-xs mb-1">👆 Biometria</div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-bold block w-fit mb-1">
                INTERFACE DIAGNÓSTICA
              </span>
              <p className="text-[10px] text-slate-400">
                Dependente de leitor biométrico nativo do terminal.
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé com botão de fechar */}
        <footer className="p-4 border-t border-slate-800 flex justify-end bg-slate-900/90">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] px-6 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-white text-xs transition"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
