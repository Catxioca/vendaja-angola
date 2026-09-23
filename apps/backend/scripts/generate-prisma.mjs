import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "generate", "--schema=prisma/schema.prisma"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build?schema=public" },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
