import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const forbidden = [".env", ".p12", ".pfx", ".jks", "private.pem", "client.key"];
const git = spawnSync("git", ["ls-files"], { encoding: "utf8" });
if (git.status !== 0) throw new Error("git ls-files failed");
const violations = git.stdout.split(/\r?\n/).filter((file) => forbidden.some((suffix) => file.endsWith(suffix)));
if (violations.length) throw new Error(`Forbidden sensitive files tracked: ${violations.join(", ")}`);
if (!existsSync("package-lock.json")) throw new Error("package-lock.json is required for reproducible installs");
console.log("Repository safety lint passed.");
