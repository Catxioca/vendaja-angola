import React, { useState, useEffect, useRef } from "react";
import {
  type CommercialDocument,
  type PaperFormat,
  PAPER_FORMAT_INFO,
} from "@angola/shared";
import { CommercialDocumentView } from "./document-renderer.js";
import {
  readPrinterSettings,
  executePrint,
  downloadPdf,
  dumpPrintDebugFile,
  type EnterprisePrinterSettings,
} from "./print-engine.js";
import {
  generateCompleteDocumentHtml,
  getPaperPixelWidth,
} from "./print-templates.js";

export interface DocumentPreviewModalProps {
  document: CommercialDocument;
  initialFormat?: PaperFormat;
  onClose: () => void;
  onNewSale?: () => void;
}

export function DocumentPreviewModal({
  document: doc,
  initialFormat,
  onClose,
  onNewSale,
}: DocumentPreviewModalProps) {
  const [settings, setSettings] = useState<EnterprisePrinterSettings>(readPrinterSettings);
  const [format, setFormat] = useState<PaperFormat>(initialFormat || settings.defaultFormat || "80mm");
  const [zoom, setZoom] = useState<number>(100);
  const [printing, setPrinting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [renderError, setRenderError] = useState<string>("");
  const [loadingHtml, setLoadingHtml] = useState<boolean>(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Refresh HTML whenever document, format or settings change
  useEffect(() => {
    let active = true;
    setLoadingHtml(true);
    setRenderError("");

    generateCompleteDocumentHtml(doc, format, settings)
      .then((html) => {
        if (active) {
          setHtmlContent(html);
          setLoadingHtml(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("[preview-modal] Erro na geração da pré-visualização:", err);
          setRenderError(err instanceof Error ? err.message : String(err));
          setLoadingHtml(false);
        }
      });

    return () => {
      active = false;
    };
  }, [doc, format, settings]);

  // Keyboard navigation: Enter or P to print, Esc to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" || e.key.toLowerCase() === "p") {
        if (
          document.activeElement &&
          (document.activeElement.tagName === "INPUT" ||
            document.activeElement.tagName === "SELECT" ||
            document.activeElement.tagName === "TEXTAREA")
        ) {
          return;
        }
        e.preventDefault();
        void handlePrint();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [format, settings, doc]);

  const handlePrint = async () => {
    setPrinting(true);
    setStatusMessage("A preparar e enviar documento para a impressora...");
    try {
      const res = await executePrint(doc, format, {
        printerName: settings.defaultPrinterName || undefined,
        silent: false,
      });
      if (res.success) {
        setStatusMessage("✓ Documento impresso com sucesso com corte automático.");
      } else {
        setStatusMessage(`⚠️ Falha na impressão: ${res.error || "Dispositivo ocupado ou offline"}`);
      }
    } catch (err) {
      setStatusMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setStatusMessage("A compilar e exportar documento PDF com escala exata...");
    try {
      const res = await downloadPdf(doc, format);
      if (res.saved) {
        setStatusMessage("✓ Fatura PDF exportada com sucesso.");
      } else {
        setStatusMessage(res.error ? `Erro: ${res.error}` : "Exportação de PDF cancelada.");
      }
    } catch (err) {
      setStatusMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDebugDump = async () => {
    setStatusMessage("A extrair dados técnicos para diagnóstico de impressão...");
    try {
      const res = await dumpPrintDebugFile(doc, format);
      if (res.success) {
        setStatusMessage(`✓ Ficheiro de diagnóstico gerado: ${res.filePath || "guardado"}`);
      } else {
        setStatusMessage(`Falha ao gerar dump: ${res.error}`);
      }
    } catch (err) {
      setStatusMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const paperPixelWidth = getPaperPixelWidth(format);

  return (
    <div className="preview-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
      <div className="preview-modal-dialog">
        {/* Top Control Bar */}
        <div className="preview-modal-toolbar no-print">
          <div className="preview-toolbar-left">
            <span className="preview-badge" id="preview-modal-title">Pré-visualização WYSIWYG 1:1</span>
            <label className="preview-format-select">
              <span>Formato do Papel:</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as PaperFormat)}
                aria-label="Selecionar formato do papel"
              >
                {Object.entries(PAPER_FORMAT_INFO).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="preview-zoom-controls">
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoom((z) => Math.max(50, z - 15))}
                title="Reduzir visualização (-)"
              >
                -
              </button>
              <span className="zoom-value">{zoom}%</span>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoom((z) => Math.min(150, z + 15))}
                title="Aumentar visualização (+)"
              >
                +
              </button>
              <button
                type="button"
                className="zoom-btn reset-zoom"
                onClick={() => setZoom(100)}
                title="Repor 100%"
              >
                100%
              </button>
            </div>
          </div>

          <div className="preview-toolbar-right">
            <button
              type="button"
              className="btn-preview-print checkout"
              onClick={() => void handlePrint()}
              disabled={printing}
              title="Atalho de teclado: P ou Enter"
            >
              {printing ? "A Imprimir..." : "Imprimir Documento (P / Enter)"}
            </button>
            <button
              type="button"
              className="btn-preview-pdf"
              onClick={() => void handleDownloadPdf()}
              title="Guardar documento em ficheiro PDF"
            >
              Descarregar PDF
            </button>
            <button
              type="button"
              className="btn-preview-debug"
              onClick={() => void handleDebugDump()}
              title="Exportar HTML e CSS brutos para auditoria técnica"
            >
              Diagnóstico
            </button>
            {onNewSale ? (
              <button
                type="button"
                className="btn-preview-newsale"
                onClick={onNewSale}
              >
                Nova Venda
              </button>
            ) : (
              <button
                type="button"
                className="btn-preview-close"
                onClick={onClose}
              >
                Fechar
              </button>
            )}
          </div>
        </div>

        {statusMessage && (
          <div className="preview-status-bar no-print" role="status">
            <span>{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage("")}
              className="preview-status-close"
              aria-label="Dispensar mensagem"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable Stage containing realistic document canvas */}
        <div className="preview-document-stage" id="print-stage-container">
          <div
            className="preview-paper-wrapper"
            style={{
              display: "flex",
              justifyContent: "center",
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top center",
              transition: "transform 0.1s ease-out",
            }}
          >
            {renderError ? (
              <div
                className="preview-error-card"
                style={{
                  background: "#fef2f2",
                  border: "2px solid #ef4444",
                  color: "#991b1b",
                  padding: "24px",
                  borderRadius: "8px",
                  maxWidth: "500px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>⚠️</div>
                <h3 style={{ margin: "0 0 8px" }}>Pré-visualização Indisponível</h3>
                <p style={{ fontSize: "13px", margin: "0 0 12px" }}>
                  Ocorreu uma falha ao renderizar os dados do documento comercial.
                </p>
                <pre
                  style={{
                    background: "#ffffff",
                    border: "1px solid #fca5a5",
                    padding: "8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    textAlign: "left",
                    overflowX: "auto",
                    maxHeight: "150px",
                  }}
                >
                  {renderError}
                </pre>
                <div style={{ marginTop: "16px", display: "flex", gap: "10px", justifyContent: "center" }}>
                  <button
                    type="button"
                    className="checkout"
                    onClick={() => setFormat(format)}
                    style={{ padding: "6px 14px", fontSize: "12px" }}
                  >
                    Tentar Novamente
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePrint()}
                    style={{ padding: "6px 14px", fontSize: "12px" }}
                  >
                    Forçar Impressão Direta
                  </button>
                </div>
              </div>
            ) : loadingHtml ? (
              <div
                style={{
                  padding: "40px",
                  color: "#64748b",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div className="spinner" />
                <span>A renderizar pré-visualização de alta fidelidade...</span>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                title={`Pré-visualização ${doc.number}`}
                className="preview-wysiwyg-iframe"
                srcDoc={htmlContent}
                style={{
                  width: `${paperPixelWidth}px`,
                  minHeight: format === "58mm" ? "420px" : format === "80mm" ? "520px" : "880px",
                  height: format === "58mm" ? "550px" : format === "80mm" ? "650px" : "900px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 12px 36px rgba(0, 0, 0, 0.3)",
                }}
              />
            )}

            {/* Hidden fallback mount point to maintain DOM component compatibility */}
            <div id="print-mount-point" style={{ display: "none" }}>
              <CommercialDocumentView
                document={doc}
                format={format}
                settings={settings}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
