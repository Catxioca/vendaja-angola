import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const output = resolve(process.env.BACKUP_PATH ?? `backups/vendaja-${new Date().toISOString().replaceAll(":", "-")}.dump`);
await mkdir(resolve(output, ".."), { recursive: true });
const child = spawn(process.platform === "win32" ? "pg_dump.exe" : "pg_dump", ["--format=custom", "--no-owner", "--file", output, databaseUrl], { stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 1));
