export type PurchaseLineInput = { quantity: number; unitCostCents: number; taxRate: number };

export function calculatePurchase(lines: PurchaseLineInput[], discountCents = 0) {
  if (!lines.length) throw new Error("purchase_requires_lines");
  if (!Number.isInteger(discountCents) || discountCents < 0) throw new Error("invalid_discount");
  const subtotalCents = lines.reduce((sum, line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isInteger(line.unitCostCents) || line.unitCostCents < 0) throw new Error("invalid_purchase_line");
    if (line.taxRate < 0 || line.taxRate > 1) throw new Error("invalid_tax_rate");
    return sum + line.quantity * line.unitCostCents;
  }, 0);
  const taxCents = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCostCents * line.taxRate), 0);
  const totalCents = subtotalCents - discountCents + taxCents;
  if (totalCents < 0) throw new Error("discount_exceeds_subtotal");
  return { subtotalCents, taxCents, totalCents };
}
