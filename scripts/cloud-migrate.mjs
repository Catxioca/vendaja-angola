import { spawnSync } from "node:child_process";
import process from "node:process";

if (!process.env.DATABASE_URL) {
  console.warn("[cloud-migrate] DATABASE_URL is not set. Skipping pre-deploy migrations.");
  process.exit(0);
}

console.log("[cloud-migrate] Running Prisma migrations on target database...");
const result = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema=apps/backend/prisma/schema.prisma"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

if (result.status !== 0) {
  console.error("[cloud-migrate] Migration failed with exit code:", result.status);
  process.exit(result.status || 1);
}
console.log("[cloud-migrate] Prisma migrations deployed successfully.");
