import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required");
const backupPath = resolve(process.env.BACKUP_PATH ?? "backups/ci-validation.dump");
mkdirSync(resolve(backupPath, ".."), { recursive: true });
const source = new URL(sourceUrl);
const target = new URL(sourceUrl);
target.pathname = `${source.pathname.replace(/\/$/, "")}_restore`;
const psql = process.platform === "win32" ? "psql.exe" : "psql";
const pgDump = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
const pgRestore = process.platform === "win32" ? "pg_restore.exe" : "pg_restore";
const run = (command, args) => execFileSync(command, args, { stdio: "inherit", env: process.env });
const query = (databaseUrl, sql) => execFileSync(psql, [databaseUrl, "--tuples-only", "--no-align", "--command", sql], { encoding: "utf8" }).trim();

rmSync(backupPath, { force: true });
run(psql, [sourceUrl, "--command", "CREATE TABLE IF NOT EXISTS production_validation_marker (id integer PRIMARY KEY, value text NOT NULL); DELETE FROM production_validation_marker; INSERT INTO production_validation_marker VALUES (1, 'backup-ok');"]);
run(pgDump, ["--format=custom", "--no-owner", "--file", backupPath, sourceUrl]);
if (!existsSync(backupPath)) throw new Error("Backup file was not created");
run(psql, [sourceUrl, "--command", `DROP DATABASE IF EXISTS "${target.pathname.slice(1)}"`]);
run(psql, [sourceUrl, "--command", `CREATE DATABASE "${target.pathname.slice(1)}"`]);
run(pgRestore, ["--clean", "--if-exists", "--no-owner", "--exit-on-error", "--dbname", target.toString(), backupPath]);
const restored = query(target.toString(), "SELECT count(*) FROM production_validation_marker WHERE id = 1 AND value = 'backup-ok'");
if (restored !== "1") throw new Error(`Restored marker count was ${restored}`);
let failed = false;
try {
  run(pgRestore, ["--exit-on-error", "--dbname", target.toString(), `${backupPath}.missing`]);
} catch {
  failed = true;
}
if (!failed) throw new Error("A missing backup unexpectedly restored successfully");
console.log(JSON.stringify({ status: "ok", backupPath, restoredMarkerCount: Number(restored), failedRestoreDetected: failed }));
