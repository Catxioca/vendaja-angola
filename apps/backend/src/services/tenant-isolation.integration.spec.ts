import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? test : test.skip;

integration("isolates tenant roots, memberships and document series in PostgreSQL", async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const suffix = randomUUID();
  const email = `tenant-${suffix}@integration.invalid`;
  let companyAId = "";
  let companyBId = "";
  let userId = "";
  try {
    const user = await prisma.user.create({ data: { email, username: `tenant-${suffix}`, passwordHash: "integration-only", role: "ROLE_ADMIN" } });
    userId = user.id;
    const [companyA, companyB] = await Promise.all([
      prisma.company.create({ data: { legalName: `Company A ${suffix}` } }),
      prisma.company.create({ data: { legalName: `Company B ${suffix}` } }),
    ]);
    companyAId = companyA.id;
    companyBId = companyB.id;
    const [branchA, branchB] = await Promise.all([
      prisma.branch.create({ data: { companyId: companyA.id, code: `A-${suffix.slice(0, 8)}`, name: "A" } }),
      prisma.branch.create({ data: { companyId: companyB.id, code: `B-${suffix.slice(0, 8)}`, name: "B" } }),
    ]);
    await prisma.companyMembership.create({ data: { userId: user.id, companyId: companyA.id, branchId: branchA.id, role: "ROLE_ADMIN" } });
    const [productA, productB] = await Promise.all([
      prisma.product.create({ data: { companyId: companyA.id, branchId: branchA.id, sku: `A-${suffix}`, name: "Product A", priceCents: 100, taxRate: 0 } }),
      prisma.product.create({ data: { companyId: companyB.id, branchId: branchB.id, sku: `B-${suffix}`, name: "Product B", priceCents: 100, taxRate: 0 } }),
    ]);
    const visibleToA = await prisma.product.findMany({ where: { companyId: companyA.id, branchId: branchA.id, id: productB.id } });
    if (visibleToA.length !== 0) throw new Error("cross_company_product_visible");
    const forcedContext = await prisma.companyMembership.findFirst({ where: { userId: user.id, companyId: companyB.id, branchId: branchB.id, active: true } });
    if (forcedContext) throw new Error("forced_company_header_would_be_accepted");
    const [seriesA, seriesB] = await Promise.all([
      prisma.documentSeries.create({ data: { companyKey: companyA.id, establishmentKey: branchA.id, documentType: "INVOICE", prefix: "A" } }),
      prisma.documentSeries.create({ data: { companyKey: companyB.id, establishmentKey: branchB.id, documentType: "INVOICE", prefix: "A" } }),
    ]);
    await prisma.documentSeries.update({ where: { id: seriesA.id }, data: { nextNumber: { increment: 1 } } });
    const unchangedB = await prisma.documentSeries.findUniqueOrThrow({ where: { id: seriesB.id } });
    if (unchangedB.nextNumber !== 1) throw new Error("document_series_cross_company_sequence_leak");
    await prisma.product.deleteMany({ where: { id: { in: [productA.id, productB.id] } } });
    await prisma.documentSeries.deleteMany({ where: { id: { in: [seriesA.id, seriesB.id] } } });
  } finally {
    if (companyAId || companyBId) await prisma.company.deleteMany({ where: { id: { in: [companyAId, companyBId].filter(Boolean) } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
