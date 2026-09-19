export type SaleIdentity = {
  fiscalType: string;
  lines: Array<{ productId: string; quantity: number }>;
  cashSessionId?: string | null;
  cashCents?: number;
  cardCents?: number;
  transferCents?: number;
};

export function equivalentSale(existing: SaleIdentity, requested: SaleIdentity) {
  if (existing.fiscalType !== requested.fiscalType || existing.lines.length !== requested.lines.length) return false;
  if ((existing.cashSessionId ?? null) !== (requested.cashSessionId ?? null)) return false;
  if ((existing.cashCents ?? 0) !== (requested.cashCents ?? 0)) return false;
  if ((existing.cardCents ?? 0) !== (requested.cardCents ?? 0)) return false;
  if ((existing.transferCents ?? 0) !== (requested.transferCents ?? 0)) return false;
  const existingLines = existing.lines
    .map((line) => `${line.productId}:${line.quantity}`)
    .sort();
  const requestedLines = requested.lines
    .map((line) => `${line.productId}:${line.quantity}`)
    .sort();
  return existingLines.every((line, index) => line === requestedLines[index]);
}
