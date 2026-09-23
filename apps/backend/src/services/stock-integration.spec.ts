import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { applyStockChange } from "./stock-ledger.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const test = databaseUrl ? (await import("node:test")).default : (await import("node:test")).default.skip;

async function createFixture(prisma: PrismaClient) {
  const warehouse = await prisma.warehouse.create({ data: { code: `IT-${randomUUID()}`, name: "Integration" } });
  const location = await prisma.stockLocation.create({ data: { warehouseId: warehouse.id, code: "MAIN", name: "Main" } });
  const product = await prisma.product.create({ data: { sku: `IT-${randomUUID()}`, name: "Integration product", priceCents: 1000, costCents: 500, taxRate: 0, trackingMode: "NONE" } });
  return { location, product };
}

test("serializes concurrent stock movements and preserves weighted valuation", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const { location, product } = await createFixture(prisma);
  await Promise.all([
    prisma.$transaction((tx) => applyStockChange(tx, { productId: product.id, locationId: location.id, quantity: 2, type: "ENTRY", reference: `IT-A-${product.id}`, unitCostCents: 500 })),
    prisma.$transaction((tx) => applyStockChange(tx, { productId: product.id, locationId: location.id, quantity: 3, type: "ENTRY", reference: `IT-B-${product.id}`, unitCostCents: 700 })),
  ]);
  const balance = await prisma.stockBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: product.id, locationId: location.id } } });
  if (balance.quantity !== 5 || balance.totalCostCents !== 3100 || balance.averageCostCents !== 620) throw new Error("concurrent_stock_valuation_mismatch");
  await prisma.$disconnect();
});

test("preserves receipt idempotency and supplier-return stock effect", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const { location, product } = await createFixture(prisma);
  const supplier = await prisma.supplier.create({ data: { name: `Supplier ${randomUUID()}` } });
  const purchase = await prisma.purchase.create({ data: { number: `IT-${randomUUID()}`, supplierId: supplier.id, subtotalCents: 1000, totalCents: 1000, idempotencyKey: randomUUID(), lines: { create: { productId: product.id, quantity: 4, unitCostCents: 250, taxRate: 0, totalCents: 1000 } } } });
  const receipt = await prisma.purchaseReceipt.create({ data: { purchaseId: purchase.id, reference: `RECEIPT-${randomUUID()}`, lines: { create: { productId: product.id, quantity: 2 } } } });
  const replay = await prisma.purchaseReceipt.findUniqueOrThrow({ where: { reference: receipt.reference } });
  if (replay.id !== receipt.id) throw new Error("receipt_idempotency_mismatch");
  await prisma.$transaction((tx) => applyStockChange(tx, { productId: product.id, locationId: location.id, quantity: 2, type: "PURCHASE_RECEIPT", reference: `RECEIPT:${receipt.id}`, unitCostCents: 250 }));
  await prisma.$transaction((tx) => applyStockChange(tx, { productId: product.id, locationId: location.id, quantity: -1, type: "SUPPLIER_RETURN", reference: `RETURN:${receipt.id}` }));
  const balance = await prisma.stockBalance.findUniqueOrThrow({ where: { productId_locationId: { productId: product.id, locationId: location.id } } });
  if (balance.quantity !== 1) throw new Error("supplier_return_stock_mismatch");
  await prisma.$disconnect();
});

test("allocates document series numbers without duplicates", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const series = await prisma.documentSeries.create({ data: { companyKey: randomUUID(), establishmentKey: "MAIN", documentType: "CUSTOMER_RETURN", prefix: "IT" } });
  const allocations = await Promise.all([1, 2, 3].map(() => prisma.$transaction(async (tx) => {
    const current = await tx.documentSeries.update({ where: { id: series.id }, data: { nextNumber: { increment: 1 } } });
    return current.nextNumber - 1;
  })));
  if (new Set(allocations).size !== 3 || allocations.sort((a, b) => a - b).join(",") !== "1,2,3") throw new Error("document_series_sequence_mismatch");
  await prisma.$disconnect();
});
