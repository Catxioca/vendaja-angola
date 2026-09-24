import { spawn } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
const backup = process.env.BACKUP_PATH;
if (!databaseUrl || !backup) throw new Error("DATABASE_URL and BACKUP_PATH are required");
if (process.env.ALLOW_DESTRUCTIVE_RESTORE !== "true") throw new Error("Set ALLOW_DESTRUCTIVE_RESTORE=true after verifying the target database");
const child = spawn(process.platform === "win32" ? "pg_restore.exe" : "pg_restore", ["--clean", "--if-exists", "--no-owner", "--exit-on-error", "--dbname", databaseUrl, resolve(backup)], { stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 1));
