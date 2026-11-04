import { PrismaClient } from "@prisma/client";

let _prisma: PrismaClient | null = null;
let _configuredUrl: string | undefined = undefined;

function getPrisma(): PrismaClient {
  const currentUrl = process.env.DATABASE_URL;
  if (!_prisma || _configuredUrl !== currentUrl) {
    _prisma = new PrismaClient(currentUrl ? { datasources: { db: { url: currentUrl } } } : undefined);
    _configuredUrl = currentUrl;
  }
  return _prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
