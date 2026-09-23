import { copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const run = (args) => {
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(["scripts/generate-prisma.mjs"]);
run(["../../node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]);
copyFileSync("dist/server.js", "dist/bundle.js");
