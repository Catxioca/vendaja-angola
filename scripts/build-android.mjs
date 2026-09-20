import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const format = process.platform === "win32" ? "bat" : "sh";
const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const task = process.argv[2];

if (!["apk", "aab"].includes(task)) {
  console.error("Usage: node scripts/build-android.mjs <apk|aab>");
  process.exit(2);
}

if (!existsSync("android")) {
  console.error("Android project is missing. Run Capacitor platform setup first.");
  process.exit(1);
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: format === "bat", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// Keep the web assets and native project in sync before every release artifact.
run("npm", ["run", "build:web"]);
run("npx", ["--no-install", "cap", "sync", "android"]);

// Deliberately build unsigned artifacts. Signing is a separate, credentialed release step.
run(gradle, ["-p", "android", task === "apk" ? "assembleRelease" : "bundleRelease", "--offline"]);
