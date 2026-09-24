import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required");
const backupPath = resolve(process.env.BACKUP_PATH ?? "backups/upgrade-rollback.dump");
mkdirSync(resolve(backupPath, ".."), { recursive: true });
const source = new URL(sourceUrl);
const baseName = source.pathname.slice(1);
const suffix = `_${process.pid}`;
const upgradeName = `${baseName}_upgrade${suffix}`;
const rollbackName = `${baseName}_rollback${suffix}`;
const psql = process.platform === "win32" ? "psql.exe" : "psql";
const pgDump = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
const pgRestore = process.platform === "win32" ? "pg_restore.exe" : "pg_restore";
const run = (command, args, env = process.env) => execFileSync(command, args, { stdio: "inherit", env });
const query = (databaseUrl, sql) => execFileSync(psql, [databaseUrl, "--tuples-only", "--no-align", "--command", sql], { encoding: "utf8" }).trim();
const databaseUrl = (name) => { const url = new URL(sourceUrl); url.pathname = `/${name}`; return url.toString(); };
const drop = (name) => run(psql, [sourceUrl, "--command", `DROP DATABASE IF EXISTS "${name}"`]);

try {
  rmSync(backupPath, { force: true });
  run(psql, [sourceUrl, "--command", "CREATE TABLE IF NOT EXISTS production_validation_marker (id integer PRIMARY KEY, value text NOT NULL); DELETE FROM production_validation_marker; INSERT INTO production_validation_marker VALUES (1, 'upgrade-rollback-ok');"]);
  run(pgDump, ["--format=custom", "--no-owner", "--file", backupPath, sourceUrl]);
  if (!existsSync(backupPath)) throw new Error("Backup file was not created");
  for (const name of [upgradeName, rollbackName]) {
    drop(name);
    run(psql, [sourceUrl, "--command", `CREATE DATABASE "${name}"`]);
    run(pgRestore, ["--clean", "--if-exists", "--no-owner", "--exit-on-error", "--dbname", databaseUrl(name), backupPath]);
  }
  const migrationEnv = { ...process.env, DATABASE_URL: databaseUrl(upgradeName) };
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["--workspace", "@angola/backend", "exec", "prisma", "migrate", "deploy", "--", "--schema=prisma/schema.prisma"], migrationEnv);
  const upgraded = query(databaseUrl(upgradeName), "SELECT count(*) FROM production_validation_marker WHERE id = 1 AND value = 'upgrade-rollback-ok'");
  const rollback = query(databaseUrl(rollbackName), "SELECT count(*) FROM production_validation_marker WHERE id = 1 AND value = 'upgrade-rollback-ok'");
  if (upgraded !== "1" || rollback !== "1") throw new Error(`Integrity mismatch after upgrade/rollback: ${upgraded}/${rollback}`);
  console.log(JSON.stringify({ status: "ok", upgradedMarkerCount: Number(upgraded), rollbackMarkerCount: Number(rollback), migrationApplied: true, rollbackStrategy: "restore-new-database-and-cutover" }));
} finally {
  drop(upgradeName);
  drop(rollbackName);
}
