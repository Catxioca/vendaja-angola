import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onBarcodeScanned,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const codeReader = new BrowserMultiFormatReader();
    let isMounted = true;
    let controls: any = null;

    async function initCamera() {
      try {
        const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!isMounted) return;

        if (videoInputDevices.length === 0) {
          setCameraError("Nenhuma câmara de vídeo detetada no dispositivo.");
          return;
        }

        // Prefer back/environment camera on mobile
        const backCamera = videoInputDevices.find((device) =>
          /back|rear|traseira|ambiente/i.test(device.label)
        );
        const selectedDevice = backCamera || videoInputDevices[0];
        if (!selectedDevice) {
          setCameraError("Não foi possível aceder ao sensor da câmara.");
          return;
        }

        setActiveDeviceId(selectedDevice.deviceId);

        if (videoRef.current) {
          controls = await codeReader.decodeFromVideoDevice(
            selectedDevice.deviceId,
            videoRef.current,
            (result, err) => {
              if (result && isMounted) {
                const text = result.getText();
                if (text) {
                  onBarcodeScanned(text.trim());
                  onClose();
                }
              }
              // ignores scan loop errors
            }
          );
        }
      } catch (err: unknown) {
        if (isMounted) {
          setCameraError("Acesso à câmara negado ou indisponível.");
        }
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      if (controls && typeof controls.stop === "function") {
        controls.stop();
      }
    };
  }, [isOpen, onBarcodeScanned, onClose]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onBarcodeScanned(manualCode.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              📷 Leitor de Código de Barras
            </h2>
            <p className="text-xs text-slate-400">Aponte para o código de barras ou EAN/QR</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Viewfinder da câmara */}
        <div className="relative my-4 aspect-[4/3] bg-black rounded-xl overflow-hidden border-2 border-dashed border-emerald-500/60 flex items-center justify-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Mira de enquadramento */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-3/4 h-1/2 border-2 border-emerald-400 rounded-lg shadow-[0_0_15px_rgba(52,211,153,0.5)] flex items-center justify-center">
              <div className="w-full h-0.5 bg-rose-500/80 animate-pulse" />
            </div>
          </div>

          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center">
              <span className="text-2xl mb-2">⚠️</span>
              <p className="text-xs text-rose-300 font-medium mb-2">{cameraError}</p>
              <p className="text-xs text-slate-400">Pode introduzir o código manualmente abaixo.</p>
            </div>
          )}
        </div>

        {/* Entrada manual / leitor fixo */}
        <form onSubmit={handleManualSubmit} className="space-y-3 pt-2">
          <label className="block text-xs font-medium text-slate-400">
            Ou introduza o código manualmente / leitor HID:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Ex: 5601234567890"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl"
            >
              Inserir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
