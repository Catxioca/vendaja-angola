import React, { useState } from "react";
import type { Warehouse } from "../stock-manager";
import type { Product } from "@angola/shared";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  warehouses: Warehouse[];
  products: Product[];
  onSubmitTransfer: (transferData: {
    sourceLocationId: string;
    destinationLocationId: string;
    reference: string;
    lines: Array<{ productId: string; quantity: number }>;
  }) => Promise<void>;
  isOnline: boolean;
}

export function StockTransferModal({
  isOpen,
  onClose,
  warehouses,
  products,
  onSubmitTransfer,
  isOnline,
}: Props) {
  const allLocations = warehouses.flatMap((w) =>
    w.locations.map((loc) => ({
      ...loc,
      warehouseName: w.name,
    }))
  );

  const [sourceLocationId, setSourceLocationId] = useState<string>(
    () => allLocations[0]?.id || ""
  );
  const [destinationLocationId, setDestinationLocationId] = useState<string>(
    () => allLocations[1]?.id || allLocations[0]?.id || ""
  );
  const [reference, setReference] = useState<string>(
    () => `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  );
  const [selectedProductId, setSelectedProductId] = useState<string>(() => products[0]?.id || "");
  const [quantity, setQuantity] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceLocationId || !destinationLocationId) {
      setError("Selecione localização de origem e destino.");
      return;
    }
    if (sourceLocationId === destinationLocationId) {
      setError("A localização de origem não pode ser idêntica à de destino.");
      return;
    }
    const q = parseInt(quantity, 10);
    if (!q || q <= 0) {
      setError("A quantidade a transferir deve ser superior a zero.");
      return;
    }
    if (!selectedProductId) {
      setError("Selecione um produto.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmitTransfer({
        sourceLocationId,
        destinationLocationId,
        reference: reference.trim(),
        lines: [{ productId: selectedProductId, quantity: q }],
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao executar transferência.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-sky-400 flex items-center gap-2">
              🔄 Transferência entre Armazéns
            </h2>
            <p className="text-xs text-slate-400">
              {isOnline ? "Transferência online" : "Modo offline (Intenção registada na Outbox)"}
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

        <form onSubmit={handleSubmit} className="space-y-3 my-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Referência da Guia de Transferência:
            </label>
            <input
              type="text"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Origem (Saída):
              </label>
              <select
                value={sourceLocationId}
                onChange={(e) => setSourceLocationId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {allLocations.map((loc) => (
                  <option key={`src-${loc.id}`} value={loc.id}>
                    {loc.warehouseName} - {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Destino (Entrada):
              </label>
              <select
                value={destinationLocationId}
                onChange={(e) => setDestinationLocationId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {allLocations.map((loc) => (
                  <option key={`dst-${loc.id}`} value={loc.id}>
                    {loc.warehouseName} - {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Produto a Transferir:
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — Stock Atual: {p.stock}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Quantidade:
            </label>
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
            />
          </div>

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
              disabled={loading}
              className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white shadow-lg"
            >
              {loading ? "A processar..." : isOnline ? "Confirmar Transferência" : "Guardar na Outbox"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
