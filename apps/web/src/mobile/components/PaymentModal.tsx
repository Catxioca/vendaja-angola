import { useState } from "react";
import { formatKwanza, type FiscalDocumentType, type PaymentMethod } from "@angola/shared";
import type { CartCustomer, IndicativeCartTotals, PaymentExecutionPlan } from "../cart-manager";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  totals: IndicativeCartTotals;
  customer: CartCustomer | null;
  onConfirmPayment: (plan: {
    paymentMethod: PaymentMethod;
    tenderedCents?: number;
    dueDate?: string | null;
    tpaAuthorizationCode?: string;
    transferReference?: string;
  }) => void;
  isOnline: boolean;
  activeCashSessionId: string | null;
  offlineCashValidation?: { allowed: boolean; reason?: string };
}

export function PaymentModal({
  isOpen,
  onClose,
  totals,
  customer,
  onConfirmPayment,
  isOnline,
  activeCashSessionId,
  offlineCashValidation,
}: Props) {
  if (!isOpen) return null;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [tenderedInput, setTenderedInput] = useState<string>((totals.totalCents / 100).toString());
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [tpaCode, setTpaCode] = useState<string>("");
  const [transferRef, setTransferRef] = useState<string>("");
  const [error, setError] = useState<string>("");

  const tenderedCents = Math.round(Number(tenderedInput || "0") * 100);
  const changeCents = Math.max(0, tenderedCents - totals.totalCents);

  const handleQuickCash = (amountKz: number) => {
    setTenderedInput(amountKz.toString());
  };

  const handleConfirm = () => {
    setError("");

    if (paymentMethod === "CASH") {
      if (!isOnline && offlineCashValidation && !offlineCashValidation.allowed) {
        setError(
          offlineCashValidation.reason ||
            "Venda em numerário indisponível offline: é necessária uma sessão de caixa previamente confirmada pelo servidor."
        );
        return;
      }
      if (tenderedCents < totals.totalCents) {
        setError(`Valor entregue insuficiente. Faltam ${formatKwanza(totals.totalCents - tenderedCents)}.`);
        return;
      }
    } else if (paymentMethod === "CREDIT") {
      if (!customer?.id) {
        setError("Venda a crédito exige obrigatoriamente a seleção de um cliente registado.");
        return;
      }
      if (!dueDate) {
        setError("Venda a crédito exige obrigatoriamente uma data de vencimento.");
        return;
      }
      const due = new Date(dueDate);
      if (due <= new Date()) {
        setError("A data de vencimento deve ser uma data futura.");
        return;
      }
      if (customer.creditLimitCents !== undefined && customer.outstandingDebtCents !== undefined) {
        if (customer.outstandingDebtCents + totals.totalCents > customer.creditLimitCents) {
          setError(
            `Limite de crédito excedido. Dívida atual: ${formatKwanza(
              customer.outstandingDebtCents
            )} | Limite: ${formatKwanza(customer.creditLimitCents)}.`
          );
          return;
        }
      }
    }

    try {
      onConfirmPayment({
        paymentMethod,
        tenderedCents: paymentMethod === "CASH" ? tenderedCents : totals.totalCents,
        dueDate: paymentMethod === "CREDIT" ? `${dueDate}T23:59:59.000Z` : null,
        tpaAuthorizationCode: tpaCode.trim() || undefined,
        transferReference: transferRef.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao validar pagamento.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modal de Pagamento e Cobrança POS"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 420,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "16px",
          padding: "20px",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#38bdf8" }}>
              💳 Cobrança do Carrinho
            </h2>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>
              {totals.hasTaxPolicy ? "Total:" : "Total provisório sujeito a validação central:"}{" "}
              <strong style={{ color: totals.hasTaxPolicy ? "#f8fafc" : "#f59e0b" }}>
                {formatKwanza(totals.totalCents)}
              </strong>{" "}
              ({totals.itemCount} itens)
            </div>
            {!totals.hasTaxPolicy && (
              <div style={{ fontSize: "10px", color: "#f59e0b", marginTop: "2px", fontWeight: 600 }}>
                ⚠️ Impostos sujeitos a validação central (taxCents=0 não é imposto final)
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "18px",
              cursor: "pointer",
              padding: "4px",
              minHeight: "44px",
              minWidth: "44px",
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: "#450a0a",
              border: "1px solid #991b1b",
              borderRadius: "8px",
              padding: "10px",
              color: "#fca5a5",
              fontSize: "12px",
              marginBottom: "12px",
            }}
          >
            {error}
          </div>
        )}

        {/* Seleção do Método de Pagamento */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
            Forma de Pagamento:
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
            {[
              { id: "CASH", label: "💵 Numerário", desc: "Dinheiro em mão" },
              { id: "CARD", label: "💳 TPA / Multicaixa", desc: "Cartão bancário" },
              { id: "TRANSFER", label: "🏦 Transferência", desc: "Comprovativo bancário" },
              { id: "CREDIT", label: "📝 Crédito / Conta Corrente", desc: "Requer cliente registado" },
            ].map((m) => {
              const isSelected = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(m.id as PaymentMethod);
                    setError("");
                  }}
                  style={{
                    padding: "12px 10px",
                    borderRadius: "10px",
                    border: `2px solid ${isSelected ? "#0284c7" : "#1e293b"}`,
                    background: isSelected ? "#082f49" : "#1e293b",
                    color: isSelected ? "#ffffff" : "#cbd5e1",
                    cursor: "pointer",
                    textAlign: "left",
                    minHeight: "48px",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "13px" }}>{m.label}</div>
                  <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalhes para Pagamento em Numerário */}
        {paymentMethod === "CASH" && (
          <div style={{ padding: "12px", background: "#1e293b", borderRadius: "10px", marginBottom: "14px" }}>
            {!isOnline && offlineCashValidation && !offlineCashValidation.allowed && (
              <div
                role="alert"
                style={{
                  padding: "10px 12px",
                  background: "#450a0a",
                  border: "1px solid #b91c1c",
                  borderRadius: "8px",
                  color: "#fecaca",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "12px",
                  lineHeight: "1.4",
                }}
              >
                ⚠️ {offlineCashValidation.reason}
              </div>
            )}
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
              Valor Entregue pelo Cliente (Kz):
            </label>
            <input
              type="number"
              step="100"
              value={tenderedInput}
              onChange={(e) => setTenderedInput(e.target.value)}
              style={{
                width: "100%",
                height: "46px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#ffffff",
                fontSize: "18px",
                fontWeight: 700,
                padding: "0 12px",
                boxSizing: "border-box",
                marginBottom: "8px",
              }}
            />

            {/* Atalhos de notas rápidas */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
              {[1000, 2000, 5000, 10000, 20000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickCash(val)}
                  style={{
                    padding: "4px 8px",
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#cbd5e1",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  +{val} Kz
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleQuickCash(totals.totalCents / 100)}
                style={{
                  padding: "4px 8px",
                  background: "#0369a1",
                  border: "none",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Valor Exato
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700 }}>
              <span style={{ color: "#94a3b8" }}>Troco a Devolver:</span>
              <span style={{ color: changeCents > 0 ? "#34d399" : "#cbd5e1" }}>
                {formatKwanza(changeCents)}
              </span>
            </div>
          </div>
        )}

        {/* Detalhes para TPA */}
        {paymentMethod === "CARD" && (
          <div style={{ padding: "12px", background: "#1e293b", borderRadius: "10px", marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
              N.º de Autorização / Talão TPA Multicaixa: (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: AUT-98421"
              value={tpaCode}
              onChange={(e) => setTpaCode(e.target.value)}
              style={{
                width: "100%",
                height: "44px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#ffffff",
                padding: "0 12px",
                boxSizing: "border-box",
              }}
            />
            <small style={{ color: "#64748b", display: "block", marginTop: "4px", fontSize: "10px" }}>
              * TPA físico permanece mockável/simulado até certificação bancária EMIS.
            </small>
          </div>
        )}

        {/* Detalhes para Transferência */}
        {paymentMethod === "TRANSFER" && (
          <div style={{ padding: "12px", background: "#1e293b", borderRadius: "10px", marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
              Referência do Comprovativo Bancário: (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: REF-TRF-00918"
              value={transferRef}
              onChange={(e) => setTransferRef(e.target.value)}
              style={{
                width: "100%",
                height: "44px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#ffffff",
                padding: "0 12px",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Detalhes para Crédito */}
        {paymentMethod === "CREDIT" && (
          <div style={{ padding: "12px", background: "#1e293b", borderRadius: "10px", marginBottom: "14px" }}>
            {!customer?.id ? (
              <div style={{ color: "#fca5a5", fontSize: "12px" }}>
                ⚠️ Nenhum cliente selecionado no carrinho. Selecione um cliente para habilitar a venda a crédito.
              </div>
            ) : (
              <div>
                <div style={{ fontSize: "12px", marginBottom: "6px" }}>
                  <strong>Cliente:</strong> {customer.name} (NIF: {customer.nif || "N/A"})
                </div>
                {customer.creditLimitCents !== undefined && (
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "8px" }}>
                    Dívida Atual: {formatKwanza(customer.outstandingDebtCents || 0)} / Limite:{" "}
                    {formatKwanza(customer.creditLimitCents)}
                  </div>
                )}
                <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
                  Data de Vencimento da Fatura: *
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{
                    width: "100%",
                    height: "44px",
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#ffffff",
                    padding: "0 12px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={paymentMethod === "CASH" && !isOnline && Boolean(offlineCashValidation && !offlineCashValidation.allowed)}
          style={{
            height: "48px",
            background:
              paymentMethod === "CASH" && !isOnline && Boolean(offlineCashValidation && !offlineCashValidation.allowed)
                ? "#475569"
                : "#0284c7",
            color: "#ffffff",
            border: "none",
            borderRadius: "10px",
            fontWeight: 700,
            fontSize: "14px",
            cursor:
              paymentMethod === "CASH" && !isOnline && Boolean(offlineCashValidation && !offlineCashValidation.allowed)
                ? "not-allowed"
                : "pointer",
            marginTop: "6px",
            opacity:
              paymentMethod === "CASH" && !isOnline && Boolean(offlineCashValidation && !offlineCashValidation.allowed)
                ? 0.6
                : 1,
          }}
        >
          {isOnline ? "Concluir Venda (Online)" : "Registar Venda Offline (Outbox)"}
        </button>
      </div>
    </div>
  );
}
