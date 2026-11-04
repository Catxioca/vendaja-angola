import React from "react";
import { generateProvisionalReceiptHtml, ProvisionalReceiptData } from "../provisional-receipt";

interface ProvisionalReceiptModalProps {
  receiptData: ProvisionalReceiptData | null;
  onClose: () => void;
}

export const ProvisionalReceiptModal: React.FC<ProvisionalReceiptModalProps> = ({
  receiptData,
  onClose,
}) => {
  if (!receiptData) return null;

  const receiptHtml = generateProvisionalReceiptHtml(receiptData);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Comprovativo Provisório - ${receiptData.correlationId}</title>
            <style>
              body { margin: 0; padding: 10px; font-family: monospace; }
              @media print {
                @page { margin: 0; }
                body { margin: 5mm; }
              }
            </style>
          </head>
          <body>
            ${receiptHtml}
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => window.close(), 1000);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl text-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-amber-400">Comprovativo Provisório</h2>
            <p className="text-xs text-slate-400 font-mono">Ref: {receiptData.correlationId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/60"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="my-2 p-2.5 rounded-lg bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs">
          ⚠️ <strong>Não Fiscal:</strong> Documento provisório guardado na Outbox offline. A fatura fiscal definitiva será gerada centralmente pelo servidor após restabelecimento de ligação.
        </div>

        {/* Pré-visualização do talão */}
        <div className="flex-1 overflow-y-auto my-2 p-3 bg-white text-black rounded-xl shadow-inner max-h-96">
          <div dangerouslySetInnerHTML={{ __html: receiptHtml }} />
        </div>

        {/* Ações */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
          <button
            onClick={handlePrint}
            className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-sm flex items-center justify-center gap-2"
          >
            🖨️ Imprimir Talão
          </button>
          <button
            onClick={onClose}
            className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm"
          >
            ✓ Nova Venda
          </button>
        </div>
      </div>
    </div>
  );
};
