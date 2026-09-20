import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const electronVersion = "44.3.0";
const architecture = process.arch === "arm64" ? "arm64" : "x64";
const platformName = platform() === "win32" ? "win32" : platform() === "darwin" ? "darwin" : "linux";
const electronCache = process.env.ELECTRON_CACHE ??
  (platform() === "win32"
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "electron", "Cache")
    : join(homedir(), ".cache", "electron"));
const electronArchive = `electron-v${electronVersion}-${platformName}-${architecture}.zip`;
const builderCache = process.env.ELECTRON_BUILDER_CACHE ??
  (platform() === "win32"
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "electron-builder", "Cache")
    : join(homedir(), ".cache", "electron-builder"));

const cachedElectron = existsSync(join(electronCache, electronArchive)) ||
  (existsSync(electronCache) &&
    readdirSync(electronCache, { withFileTypes: true }).some((entry) =>
      entry.isDirectory() && existsSync(join(electronCache, entry.name, electronArchive))));

if (!cachedElectron) {
  console.error(`Electron ${electronVersion} is not cached at ${electronCache}.`);
  console.error("Populate the Electron cache before running this offline build.");
  process.exit(1);
}
if (!existsSync(builderCache)) {
  console.error(`electron-builder cache is missing at ${builderCache}.`);
  console.error("Populate the Electron/electron-builder caches before running this offline build.");
  process.exit(1);
}

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      // Never attempt to discover a local signing certificate in the offline build.
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
    },
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// Do not let a partial previous build influence the installer contents.
rmSync(join("release", "win-unpacked"), { recursive: true, force: true });
// Older local builds may have written the builder output under the app directory.
// Exclude and remove it so it cannot be copied into the next asar.
rmSync(join("apps", "desktop", "dist", "win-unpacked"), { recursive: true, force: true });

run("npm", ["run", "build:desktop"]);
run("npx", [
  "--no-install",
  "electron-builder",
  "--config",
  "electron-builder.yml",
  "--win",
  "nsis",
  "--publish",
  "never",
]);
