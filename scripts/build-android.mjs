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

// Verification Gate: Release signing keys MUST exist outside Git before building
const hasKeystoreEnv = Boolean(process.env.ANDROID_KEYSTORE_PATH);
const hasKeystoreFile = existsSync("android/keystore.properties");
const isAuthorizedForSigning = hasKeystoreEnv || hasKeystoreFile;

if (!isAuthorizedForSigning) {
  console.log("================================================================================");
  console.log("AVISO DE SEGURANÇA E GOVERNANÇA: CHAVES DE ASSINATURA ANDROID NÃO DETETADAS");
  console.log("================================================================================");
  console.log("Em conformidade com a política enterprise de segurança e integridade de distribuição,");
  console.log("artefactos APK/AAB não devem ser gerados sem chaves de assinatura release autorizadas.");
  console.log("Para gerar artefactos assinados em ambiente CI/CD seguro:");
  console.log("1. Defina as variáveis de ambiente: ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,");
  console.log("   ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.");
  console.log("2. Ou configure o ficheiro local 'android/keystore.properties' (estritamente ignorado pelo Git).");
  console.log("A compilação de binários de produção não autorizados foi cancelada por segurança.");
  process.exit(0);
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: format === "bat", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// Keep the web assets and native project in sync before every release artifact.
run("npm", ["run", "build:web"]);
run("npx", ["--no-install", "cap", "sync", "android"]);

// Build authorized signed release artifact
run(gradle, ["-p", "android", task === "apk" ? "assembleRelease" : "bundleRelease", "--offline"]);
