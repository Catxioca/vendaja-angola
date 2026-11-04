import React, { useState } from "react";
import type { MobileCustomer, CustomerCreateInput, CustomerPaymentInput } from "../customer-manager";
import { formatKwanza } from "@angola/shared";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customers: MobileCustomer[];
  receivables: MobileCustomer[];
  onSelectCustomer?: (customer: MobileCustomer) => void;
  onCreateCustomer: (input: CustomerCreateInput) => Promise<MobileCustomer>;
  onRecordPayment: (customerId: string, payment: CustomerPaymentInput) => Promise<void>;
  isOnline: boolean;
  activeCashSessionId: string | null;
}

type TabMode = "LIST" | "CREATE" | "RECEIVABLES" | "PAYMENT";

export function CustomerModal({
  isOpen,
  onClose,
  customers,
  receivables,
  onSelectCustomer,
  onCreateCustomer,
  onRecordPayment,
  isOnline,
  activeCashSessionId,
}: Props) {
  const [tab, setTab] = useState<TabMode>("LIST");
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<MobileCustomer | null>(null);

  // Formulário de Criação
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creditLimitKz, setCreditLimitKz] = useState("0");

  // Formulário de Pagamento de Conta Corrente
  const [paymentAmountKz, setPaymentAmountKz] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "TRANSFER">("CASH");
  const [paymentReference, setPaymentReference] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nome do cliente é obrigatório.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await onCreateCustomer({
        name: name.trim(),
        nif: nif.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        creditLimitCents: Math.round((parseFloat(creditLimitKz) || 0) * 100),
      });
      if (onSelectCustomer) {
        onSelectCustomer(created);
        onClose();
      } else {
        setTab("LIST");
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao criar cliente.");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amountKz = parseFloat(paymentAmountKz);
    if (!amountKz || amountKz <= 0) {
      setError("Indique um montante válido para pagamento.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const amountCents = Math.round(amountKz * 100);
      const idempotencyKey = `rec-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await onRecordPayment(selectedCustomer.id, {
        amountCents,
        paymentMethod,
        idempotencyKey,
        cashSessionId: paymentMethod === "CASH" ? activeCashSessionId : null,
        reference: paymentReference.trim() || undefined,
      });
      setPaymentAmountKz("");
      setTab("RECEIVABLES");
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao registar pagamento de conta corrente.");
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.nif && c.nif.includes(search)) ||
      (c.phone && c.phone.includes(search))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-sky-400 flex items-center gap-2">
              👥 Gestão de Clientes & Contas Correntes
            </h2>
            <p className="text-xs text-slate-400">
              {tab === "LIST" && "Pesquise ou selecione um cliente"}
              {tab === "CREATE" && "Registo de novo cliente"}
              {tab === "RECEIVABLES" && "Saldos devedores e extrato pendente"}
              {tab === "PAYMENT" && `Liquidação de conta corrente: ${selectedCustomer?.name}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="my-2 p-2.5 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs">
            {error}
          </div>
        )}

        {/* Separadores Internos */}
        <div className="flex gap-2 my-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setTab("LIST")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              tab === "LIST" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            Clientes ({customers.length})
          </button>
          <button
            onClick={() => setTab("RECEIVABLES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              tab === "RECEIVABLES" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            Contas Correntes ({receivables.length})
          </button>
          <button
            onClick={() => {
              setTab("CREATE");
              setError(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              tab === "CREATE" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            + Novo Cliente
          </button>
        </div>

        {/* TAB 1: LISTA DE CLIENTES */}
        {tab === "LIST" && (
          <div className="flex-1 flex flex-col space-y-2 overflow-hidden">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, NIF ou telefone..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[300px]">
              {filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700/80 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-xs text-white">{c.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      NIF: {c.nif || "Consumidor Final"} {c.phone ? `| Tel: ${c.phone}` : ""}
                    </div>
                    {c.outstandingDebtCents > 0 && (
                      <span className="text-[10px] text-rose-400 font-bold block mt-0.5">
                        Dívida: {formatKwanza(c.outstandingDebtCents)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {onSelectCustomer && (
                      <button
                        onClick={() => {
                          onSelectCustomer(c);
                          onClose();
                        }}
                        className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold text-white"
                      >
                        Selecionar
                      </button>
                    )}
                    {c.outstandingDebtCents > 0 && (
                      <button
                        onClick={() => {
                          setSelectedCustomer(c);
                          setPaymentAmountKz((c.outstandingDebtCents / 100).toString());
                          setTab("PAYMENT");
                        }}
                        className="px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold text-white"
                      >
                        Liquidar
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filteredCustomers.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Nenhum cliente encontrado.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CONTAS CORRENTES */}
        {tab === "RECEIVABLES" && (
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[320px] pr-1">
            {receivables.map((r) => (
              <div
                key={r.id}
                className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-xs text-white">{r.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    NIF: {r.nif || "999999999"} | Limite: {formatKwanza(r.creditLimitCents)}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-rose-400">
                      Saldo Devedor: {formatKwanza(r.outstandingDebtCents)}
                    </span>
                    <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800">
                      {r.status || "PENDENTE"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedCustomer(r);
                    setPaymentAmountKz((r.outstandingDebtCents / 100).toString());
                    setTab("PAYMENT");
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white shadow"
                >
                  Registar Pagamento
                </button>
              </div>
            ))}
            {receivables.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                Nenhum cliente com dívida pendente de conta corrente.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CRIAR CLIENTE */}
        {tab === "CREATE" && (
          <form onSubmit={handleCreate} className="space-y-3 my-2">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Nome do Cliente / Razão Social *:
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Comercial Luanda Sul Lda"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  NIF (Opcional):
                </label>
                <input
                  type="text"
                  value={nif}
                  onChange={(e) => setNif(e.target.value)}
                  placeholder="Ex: 5001234567"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Telefone:
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+244 9..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  E-mail:
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@exemplo.ao"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Plafond / Limite de Crédito (Kz):
                </label>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={creditLimitKz}
                  onChange={(e) => setCreditLimitKz(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTab("LIST")}
                className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white shadow"
              >
                {loading ? "A guardar..." : "Registar Cliente"}
              </button>
            </div>
          </form>
        )}

        {/* TAB 4: LIQUIDAÇÃO DE CONTA CORRENTE */}
        {tab === "PAYMENT" && selectedCustomer && (
          <form onSubmit={handlePayment} className="space-y-3 my-2">
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <div className="font-semibold text-xs text-white">{selectedCustomer.name}</div>
              <div className="text-[10px] text-slate-400">NIF: {selectedCustomer.nif || "N/A"}</div>
              <div className="text-xs font-bold text-rose-400 mt-1">
                Dívida Pendente: {formatKwanza(selectedCustomer.outstandingDebtCents)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Valor do Pagamento (Kz) *:
              </label>
              <input
                type="number"
                min="100"
                step="100"
                required
                value={paymentAmountKz}
                onChange={(e) => setPaymentAmountKz(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["CASH", "CARD", "TRANSFER"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    paymentMethod === m
                      ? "bg-sky-600 border-sky-400 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300"
                  }`}
                >
                  {m === "CASH" ? "💵 Dinheiro" : m === "CARD" ? "💳 TPA" : "🏦 Transf."}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Referência / Recibo de Pagamento:
              </label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Ex: TRF-9082 ou Talão TPA"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTab("RECEIVABLES")}
                className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white shadow"
              >
                {loading ? "A liquidar..." : "Confirmar Recebimento"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
