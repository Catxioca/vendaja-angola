import React, { useState } from "react";
import type { Warehouse } from "../stock-manager";
import type { Product } from "@angola/shared";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  warehouses: Warehouse[];
  products: Product[];
  onSubmitCount: (countData: {
    locationId: string;
    reference: string;
    lines: Array<{ productId: string; countedQuantity: number }>;
  }) => Promise<void>;
  isOnline: boolean;
}

interface CountLine {
  productId: string;
  name: string;
  sku: string;
  countedQuantity: number;
}

export function InventoryCountModal({
  isOpen,
  onClose,
  warehouses,
  products,
  onSubmitCount,
  isOnline,
}: Props) {
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => {
    const firstLoc = warehouses[0]?.locations[0]?.id;
    return firstLoc || "";
  });
  const [reference, setReference] = useState<string>(
    () => `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  );
  const [lines, setLines] = useState<CountLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddProduct = (product: Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, countedQuantity: l.countedQuantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          countedQuantity: 1,
        },
      ];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.productId === productId) {
            const next = Math.max(0, l.countedQuantity + delta);
            return { ...l, countedQuantity: next };
          }
          return l;
        })
        .filter((l) => l.countedQuantity > 0)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocationId) {
      setError("Selecione uma localização / armazém de contagem.");
      return;
    }
    if (lines.length === 0) {
      setError("Adicione pelo menos um produto com quantidade conferida.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmitCount({
        locationId: selectedLocationId,
        reference: reference.trim(),
        lines: lines.map((l) => ({ productId: l.productId, countedQuantity: l.countedQuantity })),
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao submeter contagem de inventário.");
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = productSearch.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
          (p.barcode && p.barcode.includes(productSearch))
      )
    : products.slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-sky-400 flex items-center gap-2">
              📋 Inventário Físico & Contagem de Stock
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

        <div className="space-y-3 my-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Localização / Armazém:
              </label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {warehouses.map((w) =>
                  w.locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {w.name} — {loc.name} ({loc.code})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Referência do Inventário:
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Adicionar produtos à contagem */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Pesquisar produto ou bipar código de barras:
            </label>
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Digite nome, SKU ou passe o leitor ótico..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white mb-2"
            />
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAddProduct(p)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-lg text-xs text-slate-200 flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span className="font-medium truncate max-w-[140px]">{p.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">({p.sku})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Itens Conferidos */}
          <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl p-3 bg-slate-950/40 min-h-[140px] max-h-[220px]">
            <h4 className="text-xs font-bold text-slate-300 mb-2">
              Itens em Contagem ({lines.length}):
            </h4>
            {lines.map((l) => (
              <div
                key={l.productId}
                className="flex items-center justify-between py-2 border-b border-slate-800/80 last:border-0"
              >
                <div>
                  <div className="font-semibold text-xs text-white">{l.name}</div>
                  <div className="font-mono text-[10px] text-slate-400">{l.sku}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(l.productId, -1)}
                    className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-mono font-bold text-xs text-emerald-400">
                    {l.countedQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(l.productId, +1)}
                    className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(l.productId, +5)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-[10px] font-bold"
                  >
                    +5
                  </button>
                </div>
              </div>
            ))}
            {lines.length === 0 && (
              <div className="text-center py-6 text-slate-500 text-xs">
                Nenhum produto adicionado à contagem.
              </div>
            )}
          </div>
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
            type="button"
            disabled={loading || lines.length === 0}
            onClick={handleSubmit}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white shadow-lg"
          >
            {loading ? "A submeter..." : isOnline ? "Confirmar Inventário" : "Guardar na Outbox"}
          </button>
        </div>
      </div>
    </div>
  );
}
