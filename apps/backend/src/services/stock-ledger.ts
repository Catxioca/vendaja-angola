import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export function calculateNextStock(current: number, delta: number) {
  if (!Number.isInteger(current) || !Number.isInteger(delta) || delta === 0) throw new Error("invalid_stock_quantity");
  const next = current + delta;
  if (next < 0) throw new Error("insufficient_stock");
  return next;
}

export type StockChange = {
  productId: string;
  locationId: string;
  quantity: number;
  type: string;
  reference: string;
  operatorId?: string;
  note?: string;
  supplierId?: string;
  unitCostCents?: number;
  lotNumber?: string;
  serialNumber?: string;
  expiresAt?: Date;
};

async function ensureBalance(tx: Tx, productId: string, locationId: string) {
  return tx.stockBalance.upsert({
    where: { productId_locationId: { productId, locationId } },
    create: { productId, locationId, quantity: 0 },
    update: {},
  });
}

export async function applyStockChange(tx: Tx, change: StockChange) {
  if (!Number.isInteger(change.quantity) || change.quantity === 0) throw new Error("invalid_stock_quantity");
  const product = await tx.product.findUniqueOrThrow({ where: { id: change.productId }, select: { trackingMode: true } });
  if (product.trackingMode === "SERIAL" && (!change.serialNumber || Math.abs(change.quantity) !== 1)) throw new Error("serial_tracking_requires_unit");
  if (product.trackingMode === "LOT" && !change.lotNumber) throw new Error("lot_tracking_requires_lot");
  if (change.expiresAt && change.expiresAt.getTime() <= Date.now()) throw new Error("lot_expired");
  if (change.quantity < 0 && !change.lotNumber && !change.serialNumber && product.trackingMode !== "NONE") throw new Error("tracked_stock_reference_required");
  await ensureBalance(tx, change.productId, change.locationId);
  const where = {
    productId_locationId: { productId: change.productId, locationId: change.locationId },
  };
  const locked = await tx.$queryRaw<Array<{ quantity: number }>>`
    SELECT "quantity" FROM "StockBalance"
    WHERE "productId" = ${change.productId} AND "locationId" = ${change.locationId}
    FOR UPDATE
  `;
  const current = locked[0]?.quantity ?? 0;
  const next = calculateNextStock(current, change.quantity);
  const unitCost = change.unitCostCents ?? 0;
  const totalCost = current > 0 ? (await tx.stockBalance.findUniqueOrThrow({ where })).totalCostCents : 0;
  const nextTotalCost = change.quantity > 0
    ? totalCost + change.quantity * unitCost
    : Math.max(0, totalCost - Math.abs(change.quantity) * (current > 0 ? Math.round(totalCost / current) : unitCost));
  const balance = await tx.stockBalance.update({ where, data: { quantity: next, totalCostCents: nextTotalCost, averageCostCents: next > 0 ? Math.round(nextTotalCost / next) : 0 } });
  let lotId: string | undefined;
  if (change.lotNumber || change.serialNumber) {
    const existingLot = await tx.stockLot.findFirst({ where: { productId: change.productId, locationId: change.locationId, lotNumber: change.lotNumber ?? null, serialNumber: change.serialNumber ?? null } });
    if (change.quantity < 0 && (!existingLot || existingLot.quantity < Math.abs(change.quantity))) throw new Error("insufficient_lot_stock");
    if (change.quantity > 0 && existingLot?.expiresAt && existingLot.expiresAt.getTime() <= Date.now()) throw new Error("lot_expired");
    const lot = existingLot
      ? await tx.stockLot.update({ where: { id: existingLot.id }, data: { quantity: { increment: change.quantity }, ...(change.expiresAt ? { expiresAt: change.expiresAt } : {}) } })
      : await tx.stockLot.create({ data: { productId: change.productId, locationId: change.locationId, lotNumber: change.lotNumber, serialNumber: change.serialNumber, expiresAt: change.expiresAt, quantity: Math.max(0, change.quantity), unitCostCents: unitCost } });
    if (lot.quantity < 0) throw new Error("insufficient_lot_stock");
    lotId = lot.id;
  }
  await tx.stockMovement.create({
    data: {
      id: randomUUID(),
      productId: change.productId,
      quantity: change.quantity,
      type: change.type,
      reference: change.reference,
      note: change.note,
      supplierId: change.supplierId,
      operatorId: change.operatorId,
      locationId: change.locationId,
      lotId,
    },
  });
  await tx.product.update({ where: { id: change.productId }, data: { stock: { increment: change.quantity } } });
  return balance;
}

export async function transferStock(
  tx: Tx,
  input: {
    sourceLocationId: string;
    destinationLocationId: string;
    reference: string;
    operatorId?: string;
    lines: Array<{ productId: string; quantity: number }>;
  },
) {
  if (input.sourceLocationId === input.destinationLocationId) throw new Error("same_stock_location");
  const transfer = await tx.stockTransfer.create({
    data: {
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      reference: input.reference,
      operatorId: input.operatorId,
      lines: { create: input.lines },
    },
    include: { lines: true },
  });
  for (const line of input.lines) {
    await applyStockChange(tx, { ...line, locationId: input.sourceLocationId, quantity: -line.quantity, type: "TRANSFER_OUT", reference: input.reference, operatorId: input.operatorId });
    await applyStockChange(tx, { ...line, locationId: input.destinationLocationId, type: "TRANSFER_IN", reference: input.reference, operatorId: input.operatorId });
  }
  return transfer;
}
