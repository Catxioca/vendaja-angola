import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { extractFile, listPackage } = require("@electron/asar");
const root = process.cwd();
const expectedVersion = "2.2.2-rc.3";
const releaseDir = resolve(root, "release");
if (!existsSync(releaseDir)) throw new Error("Diretório release não encontrado.");

const forbidden = /(^|[\\/])(\.env(\.|$)|node_modules|dist)([\\/]|$)|\.(key|pem|p12|pfx|jks|crt|cer|lic|db|sqlite3?|sql|dump|bak|backup)$/i;
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(path);
  }
}
walk(releaseDir);
const violations = files.filter((file) => {
  const relative = file.slice(releaseDir.length + 1);
  const isPublicKey = /(^|[\\/])resources[\\/]public\.pem$/i.test(relative);
  return (forbidden.test(relative) && !isPublicKey) ||
    /(^|[\\/])license\.(key|pem|json)$/i.test(relative);
});
if (violations.length) throw new Error(`Artefactos proibidos no release: ${violations.join(", ")}`);

const appArchive = join(releaseDir, "win-unpacked", "resources", "app.asar");
if (!existsSync(appArchive)) throw new Error("resources/app.asar não encontrado.");
const archiveEntries = listPackage(appArchive);
const archiveViolations = archiveEntries.filter((entry) =>
  forbidden.test(entry) || /(^|[\\/])license\.(key|pem|json)$/i.test(entry));
if (archiveViolations.length) throw new Error(`Artefactos proibidos no app.asar: ${archiveViolations.join(", ")}`);
const requiredDesktopFiles = ["build/main.js", "build/preload.cjs", "build/renderer/index.html"];
for (const path of requiredDesktopFiles) {
  if (!archiveEntries.some((entry) => entry.replaceAll("\\", "/").replace(/^[/]+/, "") === path)) {
    throw new Error(`Ficheiro Desktop obrigatório ausente do app.asar: ${path}`);
  }
}
const appPackage = JSON.parse(extractFile(appArchive, "package.json").toString("utf8"));
if (appPackage.main !== "build/main.js") throw new Error(`Entrypoint Desktop incorreto no app.asar: ${appPackage.main}`);

const publicKey = files.find((file) => file.endsWith("resources\\public.pem") || file.endsWith("resources/public.pem"));
if (!publicKey) throw new Error("public.pem não encontrado no pacote.");
const key = readFileSync(publicKey, "utf8");
if (!key.includes("-----BEGIN PUBLIC KEY-----") || !key.includes("-----END PUBLIC KEY-----")) {
  throw new Error("public.pem não contém apenas uma chave pública PEM válida.");
}
if (/PRIVATE KEY|BEGIN CERTIFICATE/.test(key)) throw new Error("Material privado/certificado encontrado.");

const installers = files.filter((file) => /\.exe$/i.test(file));
if (!installers.length) throw new Error("Instalador NSIS .exe não encontrado.");
const topLevelInstallers = installers.filter((file) => file.slice(releaseDir.length + 1).split(/[\\/]/).length === 1);
if (topLevelInstallers.length !== 1) throw new Error(`Esperado um único instalador no nível superior; encontrados ${topLevelInstallers.length}.`);
const installer = topLevelInstallers[0];
if (!installer.includes(`-${expectedVersion}-`)) throw new Error(`Instalador não identifica a versão ${expectedVersion}.`);
if (installer.includes("-2.2.1-win-") || installer.includes("Setup 2.2.1")) {
  throw new Error("Instalador estável 2.2.1 encontrado no pacote RC.");
}
const required = [
  join(releaseDir, "win-unpacked", "resources", "backend", "bundle.js"),
  join(releaseDir, "win-unpacked", "resources", "backend", "vendor", "@prisma", "client", "index.js"),
  join(releaseDir, "win-unpacked", "resources", "backend", "vendor", ".prisma", "client", "query_engine-windows.dll.node"),
];
for (const path of required) if (!existsSync(path)) throw new Error(`Recurso obrigatório ausente: ${path}`);
for (const installer of installers) {
  const digest = createHash("sha256").update(readFileSync(installer)).digest("hex");
  const size = statSync(installer).size;
  console.log(`${installer}\n  size=${size}\n  sha256=${digest}`);
}
