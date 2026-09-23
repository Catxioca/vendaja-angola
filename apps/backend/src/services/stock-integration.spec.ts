import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { applyStockChange } from "./stock-ledger.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const test = databaseUrl ? (await import("node:test")).default : (await import("node:test")).default.skip;

test("serializes concurrent stock movements and preserves weighted valuation", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const warehouse = await prisma.warehouse.create({ data: { code: `IT-${randomUUID()}`, name: "Integration" } });
  const location = await prisma.stockLocation.create({ data: { warehouseId: warehouse.id, code: "MAIN", name: "Main" } });
  const product = await prisma.product.create({ data: { sku: `IT-${randomUUID()}`, name: "Integration product", priceCents: 1000, costCents: 500, taxRate: 0, trackingMode: "NONE" } });
  await Promise.all([
    prisma.$transaction((tx) => applyStockChange(tx, { productId: product.id, locationId: location.id, quantity: 2, type: "ENTRY", reference: `IT-A-${product.id}`, unitCostCents: 500 })),
    prisma.$transaction((tx) => applyStockChange(tx, { productId: product.id, locationId: location.id, quantity: 3, type: "ENTRY", reference: `IT-B-${product.id}`, unitCostCents: 700 })),
  ]);
  const balance = await prisma.stockBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: product.id, locationId: location.id } } });
  if (balance.quantity !== 5 || balance.totalCostCents !== 3100 || balance.averageCostCents !== 620) throw new Error("concurrent_stock_valuation_mismatch");
  await prisma.$disconnect();
});

