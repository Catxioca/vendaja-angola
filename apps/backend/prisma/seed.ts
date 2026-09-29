import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const password = process.env.ADMIN_INITIAL_PASSWORD;
if (!password || password.length < 8) throw new Error("ADMIN_INITIAL_PASSWORD must contain at least 8 characters.");

const categories = ["Bebidas", "Mercearia", "Padaria"];
const exemptions = [
  { code: "M00", reason: "Código configurável; confirmar fundamento legal vigente na tabela AGT." },
  { code: "M02", reason: "Código configurável; confirmar fundamento legal vigente na tabela AGT." },
  { code: "M04", reason: "Código configurável; confirmar fundamento legal vigente na tabela AGT." },
];

async function main() {
  const company = await prisma.company.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
  if (!company) throw new Error("No active company exists; run migrations before seeding.");
  const branch = await prisma.branch.findFirst({ where: { companyId: company.id, active: true }, orderBy: { code: "asc" } });
  if (!branch) throw new Error(`No active branch exists for company ${company.id}.`);

  const passwordHash = await bcrypt.hash(password, 12);
  const pinHash = process.env.ADMIN_INITIAL_PIN && /^\d{6}$/.test(process.env.ADMIN_INITIAL_PIN)
    ? await bcrypt.hash(process.env.ADMIN_INITIAL_PIN, 12)
    : undefined;
  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_INITIAL_EMAIL ?? "admin@angolacommerce.local" },
    update: {
      username: process.env.ADMIN_INITIAL_USERNAME ?? "admin",
      displayName: process.env.ADMIN_INITIAL_NAME ?? "Administrador",
      ...(pinHash ? { pinHash } : {}),
    },
    create: {
      email: process.env.ADMIN_INITIAL_EMAIL ?? "admin@angolacommerce.local",
      username: process.env.ADMIN_INITIAL_USERNAME ?? "admin",
      displayName: process.env.ADMIN_INITIAL_NAME ?? "Administrador",
      passwordHash,
      ...(pinHash ? { pinHash } : {}),
      role: "ADMIN",
    },
  });
  await prisma.companyMembership.upsert({
    where: { userId_companyId_branchId: { userId: admin.id, companyId: company.id, branchId: branch.id } },
    update: { role: "ADMIN", active: true },
    create: { userId: admin.id, companyId: company.id, branchId: branch.id, role: "ADMIN", active: true },
  });
  for (const name of categories) await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  for (const exemption of exemptions) await prisma.fiscalExemption.upsert({ where: { code: exemption.code }, update: { reason: exemption.reason, active: true }, create: exemption });
  const now = new Date();
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  await prisma.accountingPeriod.upsert({
    where: { companyId_startsAt_endsAt: { companyId: company.id, startsAt, endsAt } },
    update: { status: "OPEN", branchId: branch.id },
    create: { name: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`, companyId: company.id, branchId: branch.id, startsAt, endsAt, status: "OPEN" },
  });

  const category = await prisma.category.findUniqueOrThrow({ where: { name: "Bebidas" } });
  const bakery = await prisma.category.findUniqueOrThrow({ where: { name: "Padaria" } });
  const products = [
    { sku: "CAF-001", name: "Café Angola", priceCents: 125000, stock: 42, taxRate: 0.14, categoryId: category.id, companyId: company.id, branchId: branch.id },
    { sku: "AGU-001", name: "Água mineral", priceCents: 75000, stock: 80, taxRate: 0.14, categoryId: category.id, companyId: company.id, branchId: branch.id },
    { sku: "PAO-001", name: "Pão de forma", priceCents: 150000, stock: 18, taxRate: 0.05, categoryId: bakery.id, companyId: company.id, branchId: branch.id },
  ];
  for (const product of products) await prisma.product.upsert({ where: { sku: product.sku }, update: product, create: product });
  console.log(`Seed concluído: administrador ${admin.email}, ${products.length} produtos e ${exemptions.length} códigos fiscais.`);
}

main().catch((error: unknown) => { console.error("Seed falhou", error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
