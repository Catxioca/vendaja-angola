import React, { useState } from "react";
import { ActiveCashSession, MobileCashManager } from "../cash-manager";
import type { MobileOutboxManager } from "../outbox-manager";
import type { TenantContext } from "../types";

interface CashSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  cashManager: MobileCashManager;
  outboxManager?: MobileOutboxManager;
  isOnline: boolean;
  apiUrl: string;
  token: string;
  tenant?: TenantContext;
  companyId: string;
  branchId?: string | null;
  operatorName: string;
  operatorNif?: string;
  terminalId: string;
  onSessionUpdated: (session: ActiveCashSession | null) => void;
}

type ModalMode =
  | "VIEW"
  | "OPEN"
  | "ADJUST_SANGRIA"
  | "ADJUST_SUPRIMENTO"
  | "CLOSE"
  | "CLOSE_RESULT"
  | "PENDING_CLOSE";

export const CashSessionModal: React.FC<CashSessionModalProps> = ({
  isOpen,
  onClose,
  cashManager,
  outboxManager,
  isOnline,
  apiUrl,
  token,
  tenant,
  companyId,
  branchId,
  operatorName,
  operatorNif,
  terminalId,
  onSessionUpdated,
}) => {
  const currentSession = cashManager.getCurrentSession();
  const pendingAction = cashManager.getPendingAction();

  const activeTenant: TenantContext = tenant || {
    companyId,
    branchId: branchId || null,
    companyName: "",
    membershipId: "default",
    role: "OPERATOR",
    terminalId,
    modules: ["POS", "CASH"],
  };

  const [mode, setMode] = useState<ModalMode>(
    pendingAction ? "VIEW" : currentSession ? "VIEW" : "OPEN"
  );
  const [openingAoa, setOpeningAoa] = useState("0");
  const [pin, setPin] = useState("");
  const [adjustmentAoa, setAdjustmentAoa] = useState("");
  const [closingAoa, setClosingAoa] = useState("");
  const [divergenceResult, setDivergenceResult] = useState<{
    divergenceCents: number;
    expectedCashCents: number;
    closingCents: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOpenShift = async () => {
    setLoading(true);
    setErrorMessage(null);

    const openingCents = Math.round((parseFloat(openingAoa) || 0) * 100);

    // MODO OFFLINE: guarda apenas mutação PENDING na Outbox
    if (!isOnline && outboxManager) {
      try {
        cashManager.openSessionOffline(
          outboxManager,
          activeTenant,
          {
            openingCents,
            operatorName,
            operatorNif,
            terminalId,
            pin,
          },
          operatorName
        );
        onSessionUpdated(null); // Não mostra turno oficialmente aberto antes do backend
        setMode("VIEW");
      } catch (err: unknown) {
        setErrorMessage((err as Error).message || "Erro ao enfileirar abertura de turno offline");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const session = await cashManager.openSessionOnline(
        apiUrl,
        token,
        companyId,
        {
          openingCents,
          operatorName,
          operatorNif,
          terminalId,
          pin,
        },
        branchId
      );
      onSessionUpdated(session);
      setMode("VIEW");
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || "Erro ao abrir turno");
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustment = async (type: "SANGRIA" | "SUPRIMENTO") => {
    setLoading(true);
    setErrorMessage(null);
    const amountCents = Math.round((parseFloat(adjustmentAoa) || 0) * 100);

    // MODO OFFLINE: enfileira na outbox com indicação "Pendente de validação central"
    if (!isOnline && outboxManager) {
      try {
        cashManager.recordAdjustmentOffline(
          outboxManager,
          activeTenant,
          currentSession?.id || "offline-session",
          type,
          amountCents,
          operatorName
        );
        setAdjustmentAoa("");
        setMode("VIEW");
      } catch (err: unknown) {
        setErrorMessage((err as Error).message || "Erro ao enfileirar movimento offline");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!currentSession) {
      setLoading(false);
      return;
    }

    try {
      const updated = await cashManager.recordAdjustment(
        apiUrl,
        token,
        companyId,
        currentSession.id,
        type,
        amountCents,
        branchId
      );
      onSessionUpdated(updated);
      setAdjustmentAoa("");
      setMode("VIEW");
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || "Erro ao registar movimento de caixa");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    setLoading(true);
    setErrorMessage(null);
    const closingCents = Math.round((parseFloat(closingAoa) || 0) * 100);

    // MODO OFFLINE: guarda intenção na Outbox; não calcula divergência definitiva nem reconcilia
    if (!isOnline && outboxManager) {
      try {
        cashManager.closeSessionOffline(
          outboxManager,
          activeTenant,
          currentSession?.id || "offline-session",
          closingCents,
          operatorName
        );
        onSessionUpdated(null);
        setMode("PENDING_CLOSE");
      } catch (err: unknown) {
        setErrorMessage((err as Error).message || "Erro ao enfileirar fecho de caixa offline");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!currentSession) {
      setLoading(false);
      return;
    }

    try {
      const res = await cashManager.closeSessionOnline(
        apiUrl,
        token,
        companyId,
        currentSession.id,
        closingCents,
        branchId
      );
      setDivergenceResult({
        divergenceCents: res.divergenceCents,
        expectedCashCents: res.session.summary?.expectedCashCents ?? 0,
        closingCents,
      });
      onSessionUpdated(null);
      setMode("CLOSE_RESULT");
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || "Erro ao fechar caixa");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl text-slate-100 flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-emerald-400">Turno de Caixa</h2>
            <p className="text-xs text-slate-400">Terminal: {terminalId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/60"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="my-3 p-3 rounded-lg bg-red-950/70 border border-red-800 text-red-200 text-sm">
            {errorMessage}
          </div>
        )}

        {/* MODO ABERTURA */}
        {mode === "OPEN" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-300">
              Não existe turno aberto para este operador. Indique o fundo de maneio inicial e o PIN de autorização de 6 dígitos.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Fundo de Maneio Inicial (Kz)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={openingAoa}
                onChange={(e) => setOpeningAoa(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                PIN de Autorização (6 dígitos)
              </label>
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-center tracking-widest text-2xl font-mono text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="••••••"
              />
            </div>

            <button
              onClick={handleOpenShift}
              disabled={loading || pin.length !== 6}
              className="w-full py-4 mt-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-base shadow-lg transition-colors disabled:opacity-50"
            >
              {loading ? "A abrir turno..." : "Abrir Turno de Caixa"}
            </button>
          </div>
        )}

        {/* MODO VIEW */}
        {mode === "VIEW" && pendingAction && (
          <div className="mt-4 space-y-4">
            {pendingAction.status === "PENDING_CENTRAL_VALIDATION" && (
              <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800 space-y-3">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Pendente de validação central</span>
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  A operação <strong>{pendingAction.type === "OPEN" ? "Abertura de Turno" : pendingAction.type === "CLOSE" ? "Fecho de Caixa" : pendingAction.type}</strong> foi guardada como mutação auditável na outbox local.
                </p>
                <div className="text-[11px] text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-700/60 space-y-1">
                  <div><strong>Aviso de Controlo & Fiscal:</strong> Nenhum turno oficialmente aberto ou fechado, total definitivo, divergência confirmada ou caixa reconciliada é apresentado antes da resposta oficial do backend.</div>
                  <div><strong>Mutação ID:</strong> <span className="font-mono text-amber-300">{pendingAction.outboxItemId}</span></div>
                  <div><strong>Registo Local:</strong> {new Date(pendingAction.occurredAt).toLocaleTimeString("pt-AO")}</div>
                </div>
              </div>
            )}

            {pendingAction.status === "CONFLICT" && (
              <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-800 space-y-3">
                <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                  <span>⚠️ Conflito no Turno de Caixa (Mantido na Outbox)</span>
                </div>
                <p className="text-xs text-rose-200 leading-relaxed">
                  {pendingAction.errorDiagnostic || "Conflito detetado pelo servidor central ao validar a operação de turno (ex: turno já aberto ou fechado)."}
                </p>
                <p className="text-[11px] text-slate-400">
                  A mutação permanece segura e retida na outbox local para resolução e auditoria.
                </p>
                <button
                  onClick={() => {
                    cashManager.clearPendingAction();
                    setMode("OPEN");
                  }}
                  className="py-2 px-3 text-xs rounded-lg bg-rose-900 hover:bg-rose-800 text-rose-100 font-bold"
                >
                  Reconhecer e Tentar Novamente
                </button>
              </div>
            )}

            {pendingAction.status === "REJECTED" && (
              <div className="p-4 rounded-xl bg-red-950/70 border border-red-800 space-y-3">
                <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                  <span>❌ Operação Rejeitada pelo Servidor Central</span>
                </div>
                <p className="text-xs text-red-200 leading-relaxed">
                  {pendingAction.errorDiagnostic || "A operação foi rejeitada pelo servidor central. A mutação foi retida na outbox para auditoria."}
                </p>
                <button
                  onClick={() => {
                    cashManager.clearPendingAction();
                    setMode("OPEN");
                  }}
                  className="py-2 px-3 text-xs rounded-lg bg-red-900 hover:bg-red-800 text-red-100 font-bold"
                >
                  Reconhecer e Tentar Novamente
                </button>
              </div>
            )}
          </div>
        )}

        {/* MODO VIEW COM SESSÃO ATIVA */}
        {mode === "VIEW" && currentSession && !pendingAction && (
          <div className="mt-4 space-y-4">
            <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-slate-400 block">Operador</span>
                <span className="font-semibold text-white">{currentSession.operatorName || operatorName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Abertura</span>
                <span className="font-mono text-xs text-slate-300">
                  {new Date(currentSession.openedAt).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Fundo de Maneio</span>
                <span className="font-bold text-emerald-400">
                  {((currentSession.openingCents || 0) / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Vendas no Turno</span>
                <span className="font-bold text-white">{currentSession.summary?.salesCount ?? 0}</span>
              </div>
            </div>

            {/* Balanço esperado */}
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Total Vendas Numerário:</span>
                <span className="font-bold text-white">
                  {(((currentSession.summary?.cashCents ?? 0)) / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Total Vendas TPA:</span>
                <span className="font-bold text-white">
                  {(((currentSession.summary?.cardCents ?? 0)) / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Total Sangrias:</span>
                <span className="font-bold text-rose-400">
                  -{(((currentSession.sangriaCents || 0)) / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Total Suprimentos:</span>
                <span className="font-bold text-emerald-400">
                  +{(((currentSession.suprimentoCents || 0)) / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                </span>
              </div>
              <div className="pt-2 border-t border-emerald-800/60 flex justify-between text-base font-bold text-emerald-300">
                <span>Dinheiro em Caixa Esperado:</span>
                <span>
                  {(((currentSession.summary?.expectedCashCents ?? ((currentSession.openingCents || 0) + (currentSession.suprimentoCents || 0) - (currentSession.sangriaCents || 0)))) / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                </span>
              </div>
            </div>

            {/* Ações */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setMode("ADJUST_SANGRIA")}
                className="py-3 px-4 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 font-bold text-sm"
              >
                💸 Sangria (Saída)
              </button>
              <button
                onClick={() => setMode("ADJUST_SUPRIMENTO")}
                className="py-3 px-4 rounded-xl bg-sky-950/80 hover:bg-sky-900 border border-sky-800 text-sky-200 font-bold text-sm"
              >
                📥 Suprimento (Entrada)
              </button>
            </div>

            <button
              onClick={() => setMode("CLOSE")}
              className="w-full py-3.5 mt-2 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white text-base shadow-lg transition-colors"
            >
              🔒 Fechar Caixa (Fecho Cego)
            </button>
          </div>
        )}

        {/* MODO VIEW SEM SESSÃO ATIVA NEM PENDENTE */}
        {mode === "VIEW" && !currentSession && !pendingAction && (
          <div className="mt-4 p-6 bg-slate-800/60 rounded-xl text-center space-y-3">
            <span className="text-3xl block">🔒</span>
            <div className="text-sm font-bold text-white">Nenhum turno de caixa aberto</div>
            <p className="text-xs text-slate-400">
              Não existe sessão ativa ou pendente para este terminal.
            </p>
            <button
              onClick={() => setMode("OPEN")}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-bold text-xs"
            >
              Abrir Turno de Caixa
            </button>
          </div>
        )}

        {/* MODO REGISTO SANGRIA / SUPRIMENTO */}
        {(mode === "ADJUST_SANGRIA" || mode === "ADJUST_SUPRIMENTO") && (
          <div className="mt-4 space-y-4">
            <h3 className="font-bold text-base text-white">
              {mode === "ADJUST_SANGRIA" ? "Registar Sangria (Saída de Dinheiro)" : "Registar Suprimento (Reforço de Caixa)"}
            </h3>
            <p className="text-xs text-slate-400">
              {mode === "ADJUST_SANGRIA"
                ? "Utilizado para recolha de valores para cofre ou depósito intercalar."
                : "Utilizado para injeção de troco ou numerário no gaveteiro."}
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Montante (Kz)
              </label>
              <input
                type="number"
                min="1"
                step="500"
                value={adjustmentAoa}
                onChange={(e) => setAdjustmentAoa(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="5000"
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setMode("VIEW")}
                className="w-1/3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleAdjustment(mode === "ADJUST_SANGRIA" ? "SANGRIA" : "SUPRIMENTO")}
                disabled={loading || !parseFloat(adjustmentAoa)}
                className={`w-2/3 py-3 rounded-xl font-bold text-white transition-colors ${
                  mode === "ADJUST_SANGRIA" ? "bg-rose-600 hover:bg-rose-500" : "bg-sky-600 hover:bg-sky-500"
                } disabled:opacity-50`}
              >
                {loading ? "A registar..." : "Confirmar Movimento"}
              </button>
            </div>
          </div>
        )}

        {/* MODO FECHO CEGO */}
        {mode === "CLOSE" && (
          <div className="mt-4 space-y-4">
            <h3 className="font-bold text-base text-white">Fecho Cego de Caixa</h3>
            <p className="text-xs text-slate-400">
              Conte todo o numerário existente na gaveta de dinheiro e insira o valor apurado. O sistema confrontará com o saldo esperado e registará eventuais quebras ou excedentes.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Total Físico Contado na Gaveta (Kz)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={closingAoa}
                onChange={(e) => setClosingAoa(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                placeholder="0"
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setMode("VIEW")}
                className="w-1/3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
              >
                Voltar
              </button>
              <button
                onClick={handleCloseShift}
                disabled={loading || closingAoa.trim() === ""}
                className="w-2/3 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white transition-colors disabled:opacity-50"
              >
                {loading ? "A encerrar..." : "Confirmar Fecho de Caixa"}
              </button>
            </div>
          </div>
        )}

        {/* MODO RESULTADO DO FECHO */}
        {mode === "CLOSE_RESULT" && divergenceResult && (
          <div className="mt-4 space-y-4 text-center">
            <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Esperado em Numerário:</span>
                <span className="font-mono text-white">
                  {(divergenceResult.expectedCashCents / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Contagem Física Declarada:</span>
                <span className="font-mono text-white">
                  {(divergenceResult.closingCents / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz
                </span>
              </div>
              <div className="pt-2 border-t border-slate-700 flex justify-between text-base font-bold">
                <span>Divergência:</span>
                <span
                  className={
                    divergenceResult.divergenceCents === 0
                      ? "text-emerald-400"
                      : divergenceResult.divergenceCents > 0
                      ? "text-sky-400"
                      : "text-rose-400"
                  }
                >
                  {divergenceResult.divergenceCents === 0
                    ? "Sem Divergência (0,00 Kz)"
                    : divergenceResult.divergenceCents > 0
                    ? `Excedente: +${(divergenceResult.divergenceCents / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz`
                    : `Quebra de Caixa: ${(divergenceResult.divergenceCents / 100).toLocaleString("pt-AO", { minimumFractionDigits: 2 })} Kz`}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setMode("OPEN");
                onClose();
              }}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white"
            >
              Concluir e Voltar
            </button>
          </div>
        )}

        {/* MODO FECHO PENDENTE DE VALIDAÇÃO CENTRAL */}
        {mode === "PENDING_CLOSE" && (
          <div className="mt-4 space-y-4 text-center">
            <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800 text-left space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Fecho de Caixa: Pendente de validação central</span>
              </div>
              <p className="text-xs text-amber-200 leading-relaxed">
                O pedido de fecho de turno foi enfileirado localmente na outbox com chave de idempotência estável.
              </p>
              <div className="text-[11px] text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-700/60 space-y-1">
                <div><strong>Regra Fiscal e de Controlo:</strong> Nenhum valor de divergência, apuramento de quebra/excedente ou total de encerramento definitivo é calculado ou apresentado offline antes da reconciliação oficial do backend.</div>
                <div><strong>Estado do Turno:</strong> Aguarda confirmação central na próxima sincronização.</div>
              </div>
            </div>

            <button
              onClick={() => {
                setMode("VIEW");
                onClose();
              }}
              className="w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white shadow-lg transition-colors"
            >
              Concluir e Voltar ao Terminal
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
