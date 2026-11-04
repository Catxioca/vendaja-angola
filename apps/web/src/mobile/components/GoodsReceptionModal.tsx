import React, { useState } from "react";
import type { PurchaseOrder, PurchaseReceiptInput } from "../supplier-manager";
import type { Warehouse } from "../stock-manager";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  purchases: PurchaseOrder[];
  warehouses: Warehouse[];
  onSubmitReception: (purchaseId: string, receipt: PurchaseReceiptInput) => Promise<void>;
  isOnline: boolean;
}

export function GoodsReceptionModal({
  isOpen,
  onClose,
  purchases,
  warehouses,
  onSubmitReception,
  isOnline,
}: Props) {
  const eligiblePurchases = purchases.filter(
    (p) => p.status === "CONFIRMED" || p.status === "PARTIALLY_RECEIVED"
  );

  const allLocations = warehouses.flatMap((w) =>
    w.locations.map((loc) => ({
      ...loc,
      warehouseName: w.name,
    }))
  );

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>(
    () => eligiblePurchases[0]?.id || ""
  );
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    () => allLocations[0]?.id || ""
  );
  const [reference, setReference] = useState<string>(
    () => `REC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  );

  const selectedPurchase = purchases.find((p) => p.id === selectedPurchaseId);

  // Quantidades conferidas por produto
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({});
  const [lots, setLots] = useState<Record<string, string>>({});
  const [serials, setSerials] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuantityChange = (productId: string, val: number) => {
    setReceivedQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, val),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchase) {
      setError("Selecione uma ordem de compra para receção.");
      return;
    }
    if (!selectedLocationId) {
      setError("Selecione a localização de armazém para receção.");
      return;
    }

    const lines = selectedPurchase.lines
      .map((l) => ({
        productId: l.productId,
        quantity: receivedQuantities[l.productId] ?? l.quantity,
        lotNumber: lots[l.productId]?.trim() || undefined,
        serialNumber: serials[l.productId]?.trim() || undefined,
      }))
      .filter((l) => l.quantity > 0);

    if (lines.length === 0) {
      setError("Indique uma quantidade superior a zero para pelo menos um item.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmitReception(selectedPurchase.id, {
        reference: reference.trim(),
        locationId: selectedLocationId,
        lines,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao registar receção de mercadoria.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-sky-400 flex items-center gap-2">
              📥 Receção Touch de Mercadorias (Conferência Física)
            </h2>
            <p className="text-xs text-slate-400">
              {isOnline ? "Conferência online" : "Modo offline (Intenção registada na Outbox)"}
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

        <form onSubmit={handleSubmit} className="space-y-3 my-3 overflow-y-auto pr-1 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Encomenda de Fornecedor:
              </label>
              <select
                value={selectedPurchaseId}
                onChange={(e) => {
                  setSelectedPurchaseId(e.target.value);
                  setReceivedQuantities({});
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {eligiblePurchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} — {p.supplier.name} ({p.status})
                  </option>
                ))}
                {eligiblePurchases.length === 0 && (
                  <option value="">Nenhuma encomenda pendente para receção</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Localização / Armazém de Entrada:
              </label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {allLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.warehouseName} - {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Referência da Guia de Receção:
            </label>
            <input
              type="text"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>

          {/* Conferência dos Itens da Encomenda */}
          {selectedPurchase && (
            <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40 space-y-2">
              <h4 className="text-xs font-bold text-slate-300">
                Itens a Conferir na Guia de Remessa:
              </h4>

              {selectedPurchase.lines.map((line) => {
                const count = receivedQuantities[line.productId] ?? line.quantity;
                return (
                  <div
                    key={line.id}
                    className="p-2.5 bg-slate-800 rounded-xl border border-slate-700 space-y-2"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div>
                        <span className="font-semibold text-white block">
                          {line.product?.name || line.productId}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          SKU: {line.product?.sku || "N/A"} | Qtd Encomendada: {line.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(line.productId, count - 1)}
                          className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          max={line.quantity}
                          value={count}
                          onChange={(e) =>
                            handleQuantityChange(line.productId, parseInt(e.target.value, 10) || 0)
                          }
                          className="w-12 h-7 bg-slate-900 border border-slate-700 rounded text-center text-xs font-mono font-bold text-emerald-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(line.productId, count + 1)}
                          className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/60">
                      <input
                        type="text"
                        placeholder="Nº Lote (opcional)"
                        value={lots[line.productId] || ""}
                        onChange={(e) =>
                          setLots((prev) => ({ ...prev, [line.productId]: e.target.value }))
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Nº Série (opcional)"
                        value={serials[line.productId] || ""}
                        onChange={(e) =>
                          setSerials((prev) => ({ ...prev, [line.productId]: e.target.value }))
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-mono"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !selectedPurchase}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white shadow-lg"
            >
              {loading ? "A registar..." : isOnline ? "Confirmar Receção" : "Guardar na Outbox"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
