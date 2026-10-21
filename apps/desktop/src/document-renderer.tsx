import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  type CommercialDocument,
  type PaperFormat,
  type DocumentLineItem,
  type DocumentTaxSummaryItem,
  DOCUMENT_TYPE_METADATA,
  formatKwanza,
  formatAgtCertificationMention,
} from "@angola/shared";
import type { EnterprisePrinterSettings } from "./print-engine.js";

export interface CommercialDocumentViewProps {
  document: CommercialDocument;
  format: PaperFormat;
  settings?: EnterprisePrinterSettings;
  isDiagnosticTest?: boolean;
  watermarkText?: string;
  className?: string;
}

export function CommercialDocumentView({
  document: doc,
  format,
  settings,
  isDiagnosticTest = false,
  watermarkText,
  className = "",
}: CommercialDocumentViewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (!doc.qrPayload) {
      setQrDataUrl("");
      return;
    }
    const qrWidth = format === "58mm" ? 110 : format === "80mm" ? 130 : 120;
    void QRCode.toDataURL(doc.qrPayload, {
      margin: 1,
      width: qrWidth,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [doc.qrPayload, format]);

  const meta = DOCUMENT_TYPE_METADATA[doc.type] || {
    label: doc.typeName || "DOCUMENTO COMERCIAL",
    acronym: doc.type,
    fiscal: true,
  };

  const isThermal = format === "58mm" || format === "80mm";
  const isOffice = !isThermal;

  const showLogo = settings?.showLogo ?? true;
  const showWatermark = settings?.showWatermark ?? true;
  const activeWatermark =
    watermarkText ||
    (doc.isCancelled
      ? "ANULADO"
      : doc.isDraft
      ? "RASCUNHO"
      : doc.type === "FP"
      ? "PROFORMA"
      : undefined);

  return (
    <div
      className={`commercial-doc-root paper-format-${format} ${isThermal ? "thermal-doc" : "office-doc"} ${className}`}
      id="printable-commercial-document"
    >
      {/* Dynamic Watermark if Proforma or Cancelled */}
      {showWatermark && activeWatermark && (
        <div className="doc-watermark" aria-hidden="true">
          {activeWatermark}
        </div>
      )}

      {/* Diagnostic Alignment Header (Only for Test Print) */}
      {isDiagnosticTest && (
        <div className="diagnostic-banner">
          <div className="diagnostic-header">*** TESTE DE DIAGNÓSTICO E ALINHAMENTO ***</div>
          <div className="diagnostic-meta">
            Formato: <b>{format.toUpperCase()}</b> · Densidade: Alta · Margens: 0mm
          </div>
          <div className="diagnostic-grid-ruler">
            |&lt;-- LARGURA TOTAL DO PAPEL ({format === "58mm" ? "58mm" : format === "80mm" ? "80mm" : "A4/Carta"}) --&gt;|
          </div>
        </div>
      )}

      {/* ========================================================
          THERMAL 58mm / 80mm LAYOUT (POS / Retail standard)
          ======================================================== */}
      {isThermal && (
        <div className="thermal-content">
          {/* Header */}
          <div className="thermal-header">
            {showLogo && doc.company.logoText && (
              <div className="thermal-logo-text">{doc.company.logoText}</div>
            )}
            <h1 className="thermal-company-name">{doc.company.name}</h1>
            {doc.company.tradeName && doc.company.tradeName !== doc.company.name && (
              <div className="thermal-trade-name">{doc.company.tradeName}</div>
            )}
            <div className="thermal-company-meta">
              <span>NIF: {doc.company.nif}</span>
              <span>Tel: {doc.company.phone}</span>
              <span>{doc.company.address}</span>
              {doc.company.province && <span>{doc.company.province} - Angola</span>}
              {doc.company.email && <span>Email: {doc.company.email}</span>}
            </div>

            <div className="thermal-divider" />

            {/* Document Title & Number Badge */}
            <div className="thermal-doc-badge">
              <span className="thermal-doc-title">{meta.label}</span>
              <span className="thermal-doc-number">{doc.number}</span>
            </div>

            {doc.type === "FP" && (
              <div className="thermal-notice-box">
                ESTE DOCUMENTO NÃO SERVE DE FATURA
                <br />
                ISENTO DE VALIDAÇÃO FISCAL
              </div>
            )}

            {doc.referenceDocument && (
              <div className="thermal-ref-box">
                Ref. Documento: <b>{doc.referenceDocument.number}</b> ({doc.referenceDocument.type})
                {doc.referenceDocument.reason && <div>Motivo: {doc.referenceDocument.reason}</div>}
              </div>
            )}

            <div className="thermal-meta-grid">
              <div>
                Data: <b>{new Date(doc.date).toLocaleString("pt-PT")}</b>
              </div>
              {doc.operator && (
                <div>
                  Operador: <b>{doc.operator.name}</b>
                  {doc.operator.terminalId ? ` | Cx: ${doc.operator.terminalId}` : ""}
                </div>
              )}
            </div>

            {/* Customer Details */}
            <div className="thermal-customer-box">
              <div className="thermal-customer-title">ADQUIRENTE / CLIENTE:</div>
              <div className="thermal-customer-name">
                <b>{doc.customer?.name || "Consumidor Final"}</b>
              </div>
              <div className="thermal-customer-nif">
                NIF: <b>{doc.customer?.nif || "999999999"}</b>
              </div>
              {doc.customer?.address && (
                <div className="thermal-customer-addr">{doc.customer.address}</div>
              )}
            </div>

            <div className="thermal-divider" />
          </div>

          {/* Operational Cash Summary for Shift / Z Reports */}
          {doc.cashSummary && (
            <div className="thermal-cash-summary">
              <div className="thermal-section-title">RESUMO DO CAIXA</div>
              <div className="thermal-row">
                <span>Fundo Inicial:</span>
                <b>{formatKwanza(doc.cashSummary.openingBalanceCents)}</b>
              </div>
              <div className="thermal-row">
                <span>Vendas Dinheiro:</span>
                <b>{formatKwanza(doc.cashSummary.cashSalesCents)}</b>
              </div>
              <div className="thermal-row">
                <span>Vendas Cartão / TPA:</span>
                <b>{formatKwanza(doc.cashSummary.cardSalesCents)}</b>
              </div>
              <div className="thermal-row">
                <span>Vendas Transferência:</span>
                <b>{formatKwanza(doc.cashSummary.transferSalesCents)}</b>
              </div>
              <div className="thermal-row">
                <span>Entradas de Caixa:</span>
                <b>{formatKwanza(doc.cashSummary.cashInCents)}</b>
              </div>
              <div className="thermal-row">
                <span>Saídas de Caixa:</span>
                <b>- {formatKwanza(doc.cashSummary.cashOutCents)}</b>
              </div>
              <div className="thermal-divider-light" />
              <div className="thermal-row thermal-row-bold">
                <span>Saldo em Caixa:</span>
                <b>{formatKwanza(doc.cashSummary.expectedBalanceCents)}</b>
              </div>
              {doc.cashSummary.accumulatedTurnoverCents !== undefined && (
                <div className="thermal-row thermal-row-accent">
                  <span>Totalizador Acumulado (Z):</span>
                  <b>{formatKwanza(doc.cashSummary.accumulatedTurnoverCents)}</b>
                </div>
              )}
              <div className="thermal-divider" />
            </div>
          )}

          {/* Product Items List (58mm 2-line layout vs 80mm column layout) */}
          {doc.lines.length > 0 && (
            <div className="thermal-items">
              {format === "58mm" ? (
                /* 58mm Two-line layout to avoid truncated descriptions */
                <div className="thermal-58-list">
                  <div className="thermal-58-header">
                    <span>DESCRIÇÃO</span>
                    <span>TOTAL</span>
                  </div>
                  <div className="thermal-divider-light" />
                  {doc.lines.map((line, idx) => (
                    <div key={line.id || idx} className="thermal-58-item">
                      <div className="thermal-58-item-name">{line.description}</div>
                      <div className="thermal-58-item-math">
                        <span>
                          {line.quantity} × {formatKwanza(line.unitPriceCents).replace(" Kz", "")}
                          {line.taxRate > 0 ? ` (IVA ${(line.taxRate * 100).toFixed(0)}%)` : " (Isento)"}
                        </span>
                        <b>{formatKwanza(line.totalCents)}</b>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* 80mm Standard Tabular Retail layout */
                <table className="thermal-table">
                  <thead>
                    <tr>
                      <th className="th-left">Artigo</th>
                      <th className="th-center">Qtd</th>
                      <th className="th-right">Preço</th>
                      <th className="th-center">IVA</th>
                      <th className="th-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.lines.map((line, idx) => (
                      <tr key={line.id || idx}>
                        <td className="td-left">
                          <div className="item-title">{line.description}</div>
                          {line.code && <div className="item-code">#{line.code}</div>}
                        </td>
                        <td className="td-center">{line.quantity}</td>
                        <td className="td-right">
                          {formatKwanza(line.unitPriceCents).replace(" Kz", "")}
                        </td>
                        <td className="td-center">{(line.taxRate * 100).toFixed(0)}%</td>
                        <td className="td-right font-bold">{formatKwanza(line.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="thermal-divider" />
            </div>
          )}

          {/* Totals Section */}
          <div className="thermal-totals">
            <div className="thermal-row">
              <span>Subtotal Líquido:</span>
              <b>{formatKwanza(doc.subtotalCents)}</b>
            </div>
            {doc.discountCents > 0 && (
              <div className="thermal-row thermal-discount">
                <span>Desconto Comercial:</span>
                <b>- {formatKwanza(doc.discountCents)}</b>
              </div>
            )}
            <div className="thermal-row">
              <span>Total IVA:</span>
              <b>{formatKwanza(doc.taxTotalCents)}</b>
            </div>
            {doc.retentionCents && doc.retentionCents > 0 && (
              <div className="thermal-row thermal-retention">
                <span>Retenção na Fonte ({doc.retentionPercent ?? 6.5}%):</span>
                <b>- {formatKwanza(doc.retentionCents)}</b>
              </div>
            )}
            <div className="thermal-divider-double" />
            <div className="thermal-row thermal-grand-total">
              <span>TOTAL A PAGAR:</span>
              <span>{formatKwanza(doc.totalCents)}</span>
            </div>
            <div className="thermal-divider-double" />
          </div>

          {/* Payment Method & Change */}
          {doc.paymentDetails && (
            <div className="thermal-payment">
              <div className="thermal-row">
                <span>Modo de Pagamento:</span>
                <b>{doc.paymentDetails.methodLabel || doc.paymentDetails.method}</b>
              </div>
              {doc.paymentDetails.tenderedCents !== undefined && doc.paymentDetails.tenderedCents > 0 && (
                <div className="thermal-row">
                  <span>Valor Entregue:</span>
                  <b>{formatKwanza(doc.paymentDetails.tenderedCents)}</b>
                </div>
              )}
              {doc.paymentDetails.changeCents !== undefined && doc.paymentDetails.changeCents > 0 && (
                <div className="thermal-row thermal-change">
                  <span>Troco:</span>
                  <b>{formatKwanza(doc.paymentDetails.changeCents)}</b>
                </div>
              )}
              <div className="thermal-divider" />
            </div>
          )}

          {/* Tax Breakdown Table */}
          {doc.taxSummary.length > 0 && (
            <div className="thermal-tax-breakdown">
              <div className="thermal-section-title">DISCRIMINAÇÃO FISCAL DO IVA</div>
              <div className="thermal-tax-table">
                <div className="thermal-tax-row thermal-tax-head">
                  <span>Taxa</span>
                  <span className="text-right">Incidência</span>
                  <span className="text-right">Imposto</span>
                </div>
                {doc.taxSummary.map((item, idx) => (
                  <div key={idx} className="thermal-tax-row">
                    <span>{item.rate === 0 ? "0% (Isento)" : `${(item.rate * 100).toFixed(0)}%`}</span>
                    <span className="text-right">{formatKwanza(item.baseCents)}</span>
                    <span className="text-right">{formatKwanza(item.taxCents)}</span>
                  </div>
                ))}
              </div>
              <div className="thermal-divider" />
            </div>
          )}

          {/* Fiscal AGT Certification & QR Code */}
          <div className="thermal-fiscal-footer">
            {doc.fiscalHash && (
              <div className="thermal-agt-mention">
                {formatAgtCertificationMention(doc.fiscalHash, doc.agtCertificate)}
              </div>
            )}
            <div className="thermal-saft-mention">
              {meta.fiscal
                ? "Os bens/serviços foram colocados à disposição na data do documento."
                : "Documento emitido para fins informativos sem eficácia fiscal."}
            </div>

            {/* High Clarity QR Code */}
            {qrDataUrl && (
              <div className="thermal-qr-container">
                <img
                  src={qrDataUrl}
                  alt="QR Code Fiscal AGT"
                  className="thermal-qr-img"
                  loading="eager"
                />
                <div className="thermal-qr-caption">Consulte a validação na AGT</div>
              </div>
            )}

            {/* Diagnostic Pattern if test */}
            {isDiagnosticTest && (
              <div className="diagnostic-char-test">
                <div className="diagnostic-bar">████████████████████████████</div>
                <div>TESTE DE CARACTERES: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789</div>
                <div className="diagnostic-bar">----------------------------</div>
              </div>
            )}

            {/* Return policy and software brand */}
            <div className="thermal-disclaimer">
              {settings?.footerMessage ||
                "Talão indispensável em caso de troca ou devolução no prazo legal de 15 dias."}
            </div>
            <div className="thermal-software-brand">
              Processado por software certificado VendaJá Angola · www.vendaja.ao
            </div>

            <div className="thermal-cut-line">
              - - - - - - - - - - - - corte aqui - - - - - - - - - - - -
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          OFFICE A4 / A5 / CARTA STATIONERY LAYOUT (Primavera/SAP/Odoo)
          ======================================================== */}
      {isOffice && (
        <div className="office-content">
          {/* Top Corporate Header */}
          <div className="office-header-band">
            <div className="office-brand-block">
              <div className="office-logo-box">
                {doc.company.logoText ? (
                  <div className="office-logo-monogram">{doc.company.logoText}</div>
                ) : (
                  <div className="office-logo-monogram">VJ</div>
                )}
              </div>
              <div className="office-brand-info">
                <h1 className="office-company-name">{doc.company.name}</h1>
                {doc.company.tradeName && doc.company.tradeName !== doc.company.name && (
                  <div className="office-trade-name">{doc.company.tradeName}</div>
                )}
                <div className="office-company-details">
                  <div>
                    NIF: <b>{doc.company.nif}</b>
                  </div>
                  <div>{doc.company.address}</div>
                  <div>
                    {doc.company.city ? `${doc.company.city}, ` : ""}
                    {doc.company.province || "Luanda"} - Angola
                  </div>
                  <div>
                    Tel: {doc.company.phone}
                    {doc.company.email ? ` · Email: ${doc.company.email}` : ""}
                  </div>
                  {doc.company.website && <div>Web: {doc.company.website}</div>}
                  {doc.company.commercialRegistry && (
                    <div className="office-registry">{doc.company.commercialRegistry}</div>
                  )}
                  {doc.company.shareCapital && (
                    <div>Capital Social: {doc.company.shareCapital}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Document Title Banner Card */}
            <div className="office-doc-card">
              <div className="office-doc-label">{meta.label}</div>
              <div className="office-doc-number">{doc.number}</div>
              <div className="office-doc-dates">
                <div className="date-row">
                  <span>Data de Emissão:</span>
                  <b>{new Date(doc.date).toLocaleDateString("pt-PT")}</b>
                </div>
                {doc.taxPointDate && (
                  <div className="date-row">
                    <span>Data Disponibilização:</span>
                    <b>{new Date(doc.taxPointDate).toLocaleDateString("pt-PT")}</b>
                  </div>
                )}
                {doc.dueDate && (
                  <div className="date-row">
                    <span>Data de Vencimento:</span>
                    <b>{new Date(doc.dueDate).toLocaleDateString("pt-PT")}</b>
                  </div>
                )}
                <div className="date-row">
                  <span>Série Fiscal:</span>
                  <b>{doc.series}</b>
                </div>
                <div className="date-row">
                  <span>Página:</span>
                  <b>1 / 1</b>
                </div>
              </div>
            </div>
          </div>

          {/* Proforma Notice or Rectification Notice */}
          {doc.type === "FP" && (
            <div className="office-proforma-banner">
              <strong>FATURA PROFORMA · ESTE DOCUMENTO NÃO SERVE DE FATURA</strong>
              <p>Isento de validação fiscal nos termos legais. Não movimenta contas correntes nem inventário.</p>
            </div>
          )}

          {doc.referenceDocument && (
            <div className="office-ref-banner">
              <strong>DOCUMENTO DE RETIFICAÇÃO:</strong> Referente a {doc.referenceDocument.type}{" "}
              n.º <b>{doc.referenceDocument.number}</b> emitido em{" "}
              {doc.referenceDocument.date || "—"}.
              {doc.referenceDocument.reason && (
                <span> Justificação: {doc.referenceDocument.reason}</span>
              )}
            </div>
          )}

          {/* Customer / Recipient Card & Transport Data */}
          <div className="office-entities-grid">
            <div className="office-card office-recipient-card">
              <div className="office-card-header">EXMO.(S) SENHOR(ES) / ADQUIRENTE</div>
              <div className="office-recipient-name">
                {doc.customer?.name || "Consumidor Final"}
              </div>
              <div className="office-recipient-details">
                <div>
                  NIF: <b>{doc.customer?.nif || "999999999"}</b>
                </div>
                <div>{doc.customer?.address || "Luanda, Angola"}</div>
                {doc.customer?.phone && <div>Tel: {doc.customer.phone}</div>}
                {doc.customer?.email && <div>Email: {doc.customer.email}</div>}
                {doc.customer?.customerCode && (
                  <div>Código de Cliente: #{doc.customer.customerCode}</div>
                )}
              </div>
            </div>

            {/* Transport Logistics Section (For Guia de Transporte GT / Remessa GR) */}
            {doc.transport ? (
              <div className="office-card office-transport-card">
                <div className="office-card-header">DADOS DE LOGÍSTICA E TRANSPORTE</div>
                <div className="office-transport-grid">
                  <div>
                    Viatura (Matrícula): <b>{doc.transport.vehiclePlate}</b>
                  </div>
                  <div>
                    Motorista: <b>{doc.transport.driverName || "—"}</b>
                  </div>
                  <div>
                    Início do Transporte:{" "}
                    <b>{new Date(doc.transport.departureDateTime).toLocaleString("pt-PT")}</b>
                  </div>
                  {doc.transport.transitCodeAGT && (
                    <div>
                      Código AGT: <b>{doc.transport.transitCodeAGT}</b>
                    </div>
                  )}
                  <div className="grid-full">
                    Origem: <span>{doc.transport.departureAddress}</span>
                  </div>
                  <div className="grid-full">
                    Destino: <span>{doc.transport.deliveryAddress}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="office-card office-commercial-card">
                <div className="office-card-header">CONDIÇÕES COMERCIAIS & OPERACIONAIS</div>
                <div className="office-commercial-details">
                  <div>
                    Forma de Pagamento:{" "}
                    <b>{doc.paymentDetails?.methodLabel || doc.paymentDetails?.method || "Pronto Pagamento"}</b>
                  </div>
                  <div>
                    Moeda: <b>Kwanza Angolano (AOA / Kz)</b>
                  </div>
                  <div>
                    Emitido por: <b>{doc.operator?.name || "Operador do Sistema"}</b>
                  </div>
                  {doc.operator?.terminalId && (
                    <div>
                      Terminal: <b>{doc.operator.terminalId}</b>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Operational Cash Summary for Shift / Z Reports */}
          {doc.cashSummary && (
            <div className="office-cash-summary-card">
              <div className="office-card-header">BALANÇO FISCAL E ENCERRAMENTO DE CAIXA</div>
              <div className="office-cash-grid">
                <div className="cash-cell">
                  <span>Fundo Inicial:</span>
                  <b>{formatKwanza(doc.cashSummary.openingBalanceCents)}</b>
                </div>
                <div className="cash-cell">
                  <span>Vendas Numerário:</span>
                  <b>{formatKwanza(doc.cashSummary.cashSalesCents)}</b>
                </div>
                <div className="cash-cell">
                  <span>Vendas TPA / Cartão:</span>
                  <b>{formatKwanza(doc.cashSummary.cardSalesCents)}</b>
                </div>
                <div className="cash-cell">
                  <span>Vendas Transferência:</span>
                  <b>{formatKwanza(doc.cashSummary.transferSalesCents)}</b>
                </div>
                <div className="cash-cell">
                  <span>Entradas Diversas:</span>
                  <b>{formatKwanza(doc.cashSummary.cashInCents)}</b>
                </div>
                <div className="cash-cell">
                  <span>Saídas de Caixa:</span>
                  <b>- {formatKwanza(doc.cashSummary.cashOutCents)}</b>
                </div>
                <div className="cash-cell cash-cell-highlight">
                  <span>Saldo Contabilístico:</span>
                  <b>{formatKwanza(doc.cashSummary.expectedBalanceCents)}</b>
                </div>
                {doc.cashSummary.accumulatedTurnoverCents !== undefined && (
                  <div className="cash-cell cash-cell-accent">
                    <span>Totalizador Geral Acumulado:</span>
                    <b>{formatKwanza(doc.cashSummary.accumulatedTurnoverCents)}</b>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items / Product Table */}
          {doc.lines.length > 0 && (
            <table className="office-table">
              <thead>
                <tr>
                  <th className="th-code">Código</th>
                  <th className="th-desc">Designação dos Artigos / Serviços</th>
                  <th className="th-qty">Qtd.</th>
                  <th className="th-unit">Un.</th>
                  <th className="th-price">Preço Unit.</th>
                  <th className="th-disc">Desc.</th>
                  <th className="th-tax">IVA</th>
                  <th className="th-total">Total Líquido</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line, idx) => (
                  <tr key={line.id || idx}>
                    <td className="td-code">{line.code || "—"}</td>
                    <td className="td-desc">
                      <strong>{line.description}</strong>
                      {line.taxExemptionReason && (
                        <div className="exemption-note">{line.taxExemptionReason}</div>
                      )}
                    </td>
                    <td className="td-qty">{line.quantity}</td>
                    <td className="td-unit">{line.unit || "un"}</td>
                    <td className="td-price">{formatKwanza(line.unitPriceCents)}</td>
                    <td className="td-disc">
                      {line.discountPercent ? `${line.discountPercent}%` : "0%"}
                    </td>
                    <td className="td-tax">
                      {line.taxRate === 0 ? "0% (Isento)" : `${(line.taxRate * 100).toFixed(0)}%`}
                    </td>
                    <td className="td-total font-bold">{formatKwanza(line.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Bottom Financial Grid: Tax Breakdown + Bank Details (Left) and Totals Card (Right) */}
          <div className="office-bottom-grid">
            <div className="office-bottom-left">
              {/* VAT Breakdown Table */}
              <div className="office-tax-matrix">
                <div className="office-mini-header">DISCRIMINAÇÃO FISCAL DE IMPOSTOS</div>
                <table className="office-mini-table">
                  <thead>
                    <tr>
                      <th>Taxa</th>
                      <th className="text-right">Incidência</th>
                      <th className="text-right">Valor do IVA</th>
                      <th>Enquadramento Legal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.taxSummary.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.rate === 0 ? "Isento (0%)" : `${(item.rate * 100).toFixed(0)}%`}</td>
                        <td className="text-right font-mono">{formatKwanza(item.baseCents)}</td>
                        <td className="text-right font-mono">{formatKwanza(item.taxCents)}</td>
                        <td className="legal-reason">
                          {item.exemptionReason || "Regime Geral de IVA - Art. 12.º"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bank Accounts / Coordinates for Wire Transfers */}
              {doc.company.bankAccounts && doc.company.bankAccounts.length > 0 && (
                <div className="office-bank-details">
                  <div className="office-mini-header">COORDENADAS BANCÁRIAS PARA LIQUIDAÇÃO</div>
                  <div className="office-bank-list">
                    {doc.company.bankAccounts.map((b, idx) => (
                      <div key={idx} className="office-bank-row">
                        <span className="bank-name">
                          <b>{b.bank}:</b>
                        </span>
                        <span className="bank-iban font-mono">IBAN: {b.iban}</span>
                        {b.swift && <span className="bank-swift">SWIFT: {b.swift}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commercial Notes / Terms */}
              {(doc.notes || doc.terms) && (
                <div className="office-terms-box">
                  {doc.notes && <div>{doc.notes}</div>}
                  {doc.terms && <div>{doc.terms}</div>}
                </div>
              )}
            </div>

            {/* Totals Summary Card */}
            <div className="office-totals-card">
              <div className="office-totals-row">
                <span>Total Ilíquido:</span>
                <span className="font-mono">{formatKwanza(doc.subtotalCents)}</span>
              </div>
              <div className="office-totals-row">
                <span>Desconto Comercial:</span>
                <span className="font-mono">
                  - {formatKwanza(doc.discountCents > 0 ? doc.discountCents : 0)}
                </span>
              </div>
              <div className="office-totals-row">
                <span>Total da Incidência:</span>
                <span className="font-mono">{formatKwanza(doc.subtotalCents - doc.discountCents)}</span>
              </div>
              <div className="office-totals-row">
                <span>Total do Imposto (IVA):</span>
                <span className="font-mono">{formatKwanza(doc.taxTotalCents)}</span>
              </div>
              {doc.retentionCents && doc.retentionCents > 0 && (
                <div className="office-totals-row office-totals-retention">
                  <span>Retenção na Fonte ({doc.retentionPercent ?? 6.5}%):</span>
                  <span className="font-mono">- {formatKwanza(doc.retentionCents)}</span>
                </div>
              )}
              <div className="office-totals-divider" />
              <div className="office-grand-total-box">
                <span className="grand-label">TOTAL A PAGAR</span>
                <span className="grand-val">{formatKwanza(doc.totalCents)}</span>
              </div>
            </div>
          </div>

          {/* Footer Bar: AGT Hash + QR + SAF-T Mention + Signature Box */}
          <div className="office-footer-band">
            <div className="office-footer-legal">
              {doc.fiscalHash && (
                <div className="office-hash-line font-mono font-bold">
                  {formatAgtCertificationMention(doc.fiscalHash, doc.agtCertificate)}
                </div>
              )}
              <div className="office-saft-line">
                {meta.fiscal
                  ? "Os bens e/ou serviços foram colocados à disposição do adquirente na data e local indicados no presente documento."
                  : "Documento probatório emitido a título informativo, sem eficácia de validação fiscal."}
              </div>
              <div className="office-software-credit">
                Emitido por software de gestão empresarial certificado VendaJá Angola Enterprise v2.2 · Licença Oficial AGT
              </div>
            </div>

            {/* QR Code */}
            {qrDataUrl && (
              <div className="office-qr-box">
                <img src={qrDataUrl} alt="Código QR Fiscal AGT" className="office-qr-img" />
                <span className="office-qr-tag">AGT Fiscal QR</span>
              </div>
            )}

            {/* Signature / Stamp line */}
            <div className="office-signature-box">
              <div className="office-signature-line" />
              <span>Assinatura do Adquirente / Carimbo</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
