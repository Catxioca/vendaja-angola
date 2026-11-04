import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "generate", "--schema=prisma/schema.prisma"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build?schema=public" },
  encoding: "utf8",
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status === 0) process.exit(0);

const renameFailure = result.stderr?.match(/EPERM: operation not permitted, rename '([^']+)' -> '([^']+)'/);
if (process.platform === "win32" && renameFailure) {
  const temporaryPath = resolve(renameFailure[1]);
  const destinationPath = resolve(renameFailure[2]);
  const isExpectedTemporaryFile = dirname(temporaryPath) === dirname(destinationPath) &&
    basename(temporaryPath).startsWith(`${basename(destinationPath)}.tmp`);
  if (isExpectedTemporaryFile && existsSync(temporaryPath) && existsSync(destinationPath)) {
    const hash = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex");
    if (hash(temporaryPath) === hash(destinationPath)) {
      unlinkSync(temporaryPath);
      console.warn("Prisma generated an identical Windows engine; kept the existing in-use engine.");
      process.exit(0);
    }
  }
}

process.exit(result.status ?? 1);
