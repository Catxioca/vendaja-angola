import React, { useState } from "react";
import { DocumentManager, UnifiedDocument } from "../document-manager.js";

interface DocumentsModalProps {
  serverUrl: string;
  token: string;
  companyId: string;
  branchId?: string | null;
  userRole: string;
  onClose: () => void;
}

export const DocumentsModal: React.FC<DocumentsModalProps> = ({
  serverUrl,
  token,
  companyId,
  branchId,
  userRole,
  onClose,
}) => {
  const docManager = DocumentManager.getInstance();
  const [documents, setDocuments] = useState<UnifiedDocument[]>(() =>
    docManager.loadCachedDocuments(companyId, branchId)
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [selectedDoc, setSelectedDoc] = useState<UnifiedDocument | null>(null);
  const [reprintReason, setReprintReason] = useState("");
  const [reprintMessage, setReprintMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const refreshed = await docManager.syncDocuments(serverUrl, token, companyId, branchId);
      setDocuments(refreshed);
    } catch (err: any) {
      setError(err.message || "Falha ao sincronizar documentos.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReprint = async () => {
    if (!selectedDoc) return;
    setIsLoading(true);
    setError(null);
    setReprintMessage(null);
    try {
      const result = await docManager.requestReprint(
        serverUrl,
        token,
        companyId,
        branchId,
        {
          documentId: selectedDoc.id,
          documentType: selectedDoc.type === "INVOICE" || selectedDoc.type === "INVOICE_RECEIPT" || selectedDoc.type === "PROFORMA" ? "SALE" : "COMMERCIAL_DOCUMENT",
          reason: reprintReason,
        },
        userRole
      );
      setReprintMessage(`${result.disclaimer} (Registo: ${result.reprintedAt.slice(0, 19)})`);
      // Atualiza o documento selecionado com o status de 2ª via
      setSelectedDoc({
        ...selectedDoc,
        copyType: "SEGUNDA_VIA",
        disclaimer: result.disclaimer,
        reprintCount: (selectedDoc.reprintCount || 0) + 1,
      });
      setReprintReason("");
    } catch (err: any) {
      setError(err.message || "Falha ao autorizar reimpressão.");
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = docManager.filterDocuments(documents, searchTerm, filterType);

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(15, 23, 42, 0.75)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 16,
        width: "100%",
        maxWidth: 720,
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f8fafc",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              Documentos Comerciais & Fiscais
            </h2>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Consulta autorizada e reimpressão auditada
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSync}
              disabled={isLoading}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: "#1e293b",
              }}
            >
              {isLoading ? "A carregar..." : "🔄 Atualizar"}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: "#e2e8f0",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                color: "#334155",
              }}
            >
              Fechar
            </button>
          </div>
        </div>

        {/* Regulatory Banner */}
        <div style={{
          background: "#fffbeb",
          padding: "8px 16px",
          borderBottom: "1px solid #fef3c7",
          fontSize: 12,
          color: "#b45309",
          textAlign: "center",
          fontWeight: 600,
        }}>
          ⚠️ Preparado tecnicamente para processo de homologação; não homologado até aprovação formal da AGT.
        </div>

        {error && (
          <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "10px 16px", fontSize: 13, borderBottom: "1px solid #fecaca" }}>
            {error}
          </div>
        )}

        {reprintMessage && (
          <div style={{ background: "#f0fdf4", color: "#166534", padding: "10px 16px", fontSize: 13, borderBottom: "1px solid #bbf7d0", fontWeight: 600 }}>
            ✓ {reprintMessage}
          </div>
        )}

        {/* Filters and Search */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", gap: 10, flexWrap: "wrap", background: "#ffffff" }}>
          <input
            type="text"
            placeholder="Pesquisar por número, série, cliente ou hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 14,
            }}
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 14,
              background: "#ffffff",
            }}
          >
            <option value="ALL">Todos os Tipos</option>
            <option value="FT">FT (Fatura)</option>
            <option value="FR">FR (Fatura-Recibo)</option>
            <option value="PF">PF (Proforma)</option>
            <option value="NC">NC (Nota de Crédito)</option>
            <option value="ND">ND (Nota de Débito)</option>
            <option value="GT">GT (Guia de Transporte)</option>
          </select>
        </div>

        {/* Document List & Details View */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {selectedDoc ? (
            <div>
              <button
                onClick={() => { setSelectedDoc(null); setReprintMessage(null); }}
                style={{
                  marginBottom: 16,
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#f1f5f9",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                ← Voltar à Lista
              </button>

              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "#0284c7",
                      color: "#ffffff",
                      fontSize: 11,
                      fontWeight: 700,
                      marginRight: 8,
                    }}>
                      {selectedDoc.fiscalTypeBadge}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                      {selectedDoc.number}
                    </span>
                  </div>
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background: selectedDoc.copyType === "SEGUNDA_VIA" ? "#fef3c7" : "#dcfce7",
                    color: selectedDoc.copyType === "SEGUNDA_VIA" ? "#92400e" : "#166534",
                  }}>
                    {selectedDoc.copyType === "SEGUNDA_VIA" ? "2.ª VIA" : "ORIGINAL"}
                  </span>
                </div>

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                  <div><strong>Data:</strong> {new Date(selectedDoc.createdAt).toLocaleString()}</div>
                  <div><strong>Total:</strong> {(selectedDoc.totalCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</div>
                  <div><strong>Série:</strong> {selectedDoc.series}</div>
                  <div><strong>Estado:</strong> {selectedDoc.status}</div>
                  {selectedDoc.customerName && <div><strong>Cliente:</strong> {selectedDoc.customerName}</div>}
                  {selectedDoc.customerNif && <div><strong>NIF:</strong> {selectedDoc.customerNif}</div>}
                  {selectedDoc.sourceDocumentNumber && <div><strong>Doc. Origem:</strong> {selectedDoc.sourceDocumentNumber}</div>}
                </div>

                {selectedDoc.fiscalHash && (
                  <div style={{ marginTop: 12, padding: 8, background: "#f1f5f9", borderRadius: 6, fontSize: 11, fontFamily: "monospace", wordBreak: "break-all" }}>
                    <strong>Hash Fiscal:</strong> {selectedDoc.fiscalHash}
                  </div>
                )}

                {selectedDoc.qrCode && (
                  <div style={{ marginTop: 12, padding: 8, background: "#f8fafc", borderRadius: 6, fontSize: 11, border: "1px dashed #cbd5e1" }}>
                    <strong>Código QR Fiscal:</strong> {selectedDoc.qrCode.slice(0, 80)}...
                  </div>
                )}

                {/* Line Items */}
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "#1e293b" }}>Linhas do Documento</h4>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                    {selectedDoc.lines.map((line, idx) => (
                      <div key={idx} style={{
                        padding: "8px 12px",
                        borderBottom: idx === selectedDoc.lines.length - 1 ? "none" : "1px solid #f1f5f9",
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                      }}>
                        <span>{line.quantity}x {line.productName}</span>
                        <span>{((line.unitPriceCents * line.quantity) / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Authorized Reprint Action */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "#0f172a" }}>Reimpressão Autorizada (2.ª Via)</h4>
                  {["ADMIN", "ROLE_ADMIN", "MANAGER", "ROLE_MANAGER"].includes(userRole.toUpperCase()) ? (
                    <>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                        A reimpressão de documentos fiscais é restrita a administradores e gestores, exigindo motivo operacional auditável.
                      </div>
                      <input
                        type="text"
                        placeholder="Justificação da reimpressão (obrigatória, mín. 3 carateres)..."
                        value={reprintReason}
                        onChange={(e) => setReprintReason(e.target.value)}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid #cbd5e1",
                          fontSize: 13,
                          marginBottom: 8,
                        }}
                      />
                      <button
                        onClick={handleReprint}
                        disabled={isLoading || reprintReason.trim().length < 3}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 8,
                          border: "none",
                          background: reprintReason.trim().length >= 3 ? "#0284c7" : "#94a3b8",
                          color: "#ffffff",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: reprintReason.trim().length >= 3 ? "pointer" : "not-allowed",
                        }}
                      >
                        Emitir 2.ª Via Auditada
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
                      🔒 Ação restrita: Apenas administradores e gestores autorizados têm permissão para solicitar 2.ª via deste documento.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
                  Nenhum documento encontrado. Clique em "Atualizar" para sincronizar com o servidor central.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filtered.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      style={{
                        padding: "12px 16px",
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        background: "#ffffff",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: "#e0f2fe",
                          color: "#0369a1",
                          fontSize: 12,
                          fontWeight: 700,
                        }}>
                          {doc.fiscalTypeBadge}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                            {doc.number}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            {doc.customerName || "Consumidor Final"} • {new Date(doc.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                          {(doc.totalCents / 100).toLocaleString("pt-AO", { style: "currency", currency: "AOA" })}
                        </div>
                        <div style={{ fontSize: 11, color: doc.status === "CANCELLED" ? "#ef4444" : "#16a34a" }}>
                          {doc.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
