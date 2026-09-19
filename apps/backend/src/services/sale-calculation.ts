import type { Prisma } from "@prisma/client";
import { validateVatExemption } from "./fiscal.js";

type ProductRecord = {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  taxRate: Prisma.Decimal;
  taxCategory: string;
  exemptionCode: string | null;
  active: boolean;
};

export type SaleRequestLine = { productId: string; quantity: number };

export type CalculatedSale = {
  lines: Array<{
    productId: string;
    quantity: number;
    unitPriceCents: number;
    taxRate: number;
  }>;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
};

export async function calculateSale(
  client: Pick<Prisma.TransactionClient, "product"> | { product: { findMany: (args: unknown) => Promise<ProductRecord[]> } },
  requestedLines: SaleRequestLine[],
  _ignoredDiscountCents?: number,
): Promise<CalculatedSale> {
  const productIds = [...new Set(requestedLines.map((line) => line.productId))];
  const products = await client.product.findMany({
    where: { id: { in: productIds }, active: true },
    select: { id: true, sku: true, name: true, priceCents: true, taxRate: true, taxCategory: true, exemptionCode: true, active: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  if (products.length !== productIds.length) {
    const missing = productIds.filter((id) => !byId.has(id));
    throw new Error(`invalid_product:${missing.join(",")}`);
  }

  const lines = requestedLines.map((requested) => {
    const product = byId.get(requested.productId)!;
    if (!Number.isSafeInteger(requested.quantity) || requested.quantity <= 0) throw new Error(`invalid_quantity:${requested.productId}`);
    const taxRate = Number(product.taxRate);
    validateVatExemption(taxRate, product.exemptionCode);
    return {
      productId: product.id,
      quantity: requested.quantity,
      unitPriceCents: product.priceCents,
      taxRate,
    };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const taxCents = lines.reduce((sum, line) => sum + Math.round(line.unitPriceCents * line.quantity * line.taxRate), 0);
  const discountCents = 0;
  return { lines, subtotalCents, taxCents, discountCents, totalCents: subtotalCents + taxCents };
}
