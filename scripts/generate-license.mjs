import { createPrivateKey, createSign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  })
);

const hardwareId = args.get("hardware") ?? args.get("hardware-id");
const nif = args.get("nif");
const company = args.get("company") ?? "Empresa Licenciada Lda";
const planArg = (args.get("plan") ?? "ENTERPRISE").toUpperCase();
const typeArg = (args.get("type") ?? "COMBINED").toUpperCase();
const monthsArg = args.get("months");
const daysArg = args.get("days");
const customModulesArg = args.get("modules");
const terminalsArg = Number(args.get("terminals") ?? "5");
const usersArg = Number(args.get("users") ?? "20");
const output = args.get("out") ?? "license.key";

const defaultKeyPath = existsSync("private.pem") ? resolve("private.pem") : undefined;
const privateKeyPath = args.get("private-key") ?? process.env.VENDAJA_LICENSE_PRIVATE_KEY ?? defaultKeyPath;

const PLAN_PRESETS = {
  STARTER: ["DASHBOARD", "POS", "STOCK", "REPORTS", "SETTINGS"],
  PROFESSIONAL: ["DASHBOARD", "POS", "STOCK", "REPORTS", "SETTINGS", "PURCHASES", "TREASURY"],
  BUSINESS: [
    "DASHBOARD",
    "POS",
    "STOCK",
    "REPORTS",
    "SETTINGS",
    "PURCHASES",
    "TREASURY",
    "HR",
    "CRM",
    "DOCUMENTS",
  ],
  ENTERPRISE: [
    "DASHBOARD",
    "POS",
    "STOCK",
    "REPORTS",
    "SETTINGS",
    "PURCHASES",
    "TREASURY",
    "HR",
    "CRM",
    "DOCUMENTS",
    "ACCOUNTING",
    "BI",
    "AUTOMATION",
    "GOVERNANCE",
    "INTEGRATIONS",
    "CLOUD",
    "AI",
    "BIOMETRICS",
    "CORPORATE",
  ],
  CUSTOM: [],
};

if (!hardwareId || !nif || !privateKeyPath || !existsSync(privateKeyPath)) {
  console.error("================================================================================");
  console.error("           GERADOR DE LICENÇAS EMPRESARIAIS — VENDAJÁ ANGOLA ERP               ");
  console.error("================================================================================");
  console.error("Uso:");
  console.error("  node scripts/generate-license.mjs --hardware=<ID> --nif=<NIF> [opções]");
  console.error("");
  console.error("Opções:");
  console.error("  --type=PRODUCT|MODULAR|COMBINED   Tipo de licença (default: COMBINED)");
  console.error("  --company=<Nome>                  Razão social da empresa (default: 'Empresa Licenciada Lda')");
  console.error("  --plan=STARTER|PROFESSIONAL|BUSINESS|ENTERPRISE|CUSTOM  (default: ENTERPRISE)");
  console.error("  --months=1|3|6|12|24              Duração em meses (default: 12)");
  console.error("  --days=<número>                   Duração alternativa em dias (ex: 30)");
  console.error("  --modules=M1,M2,...               Módulos autorizados (ex: POS,STOCK)");
  console.error("  --terminals=<número>              Limite de terminais autorizados (default: 5)");
  console.error("  --users=<número>                  Limite de utilizadores (default: 20)");
  console.error("  --private-key=<file>              Caminho para private.pem (default: ./private.pem)");
  console.error("  --out=<file>                      Ficheiro de saída (default: license.key)");
  console.error("");
  console.error("Exemplos:");
  console.error("  # 1. Licença do Produto (apenas autoriza execução, login, admin e configurações)");
  console.error("  node scripts/generate-license.mjs --hardware=1234ABCD --nif=5412345678 --type=PRODUCT");
  console.error("");
  console.error("  # 2. Licença Modular (desbloqueia apenas POS e Stocks)");
  console.error("  node scripts/generate-license.mjs --hardware=1234ABCD --nif=5412345678 --type=MODULAR --modules=POS,STOCK");
  process.exit(1);
}

const plan = Object.keys(PLAN_PRESETS).includes(planArg) ? planArg : "ENTERPRISE";
let licenseType = "COMBINED";
if (typeArg === "PRODUCT") licenseType = "PRODUCT";
else if (typeArg === "MODULAR") licenseType = "MODULAR";

let modules = [];
if (licenseType === "PRODUCT") {
  // Product license only authorizes running the ERP, login, admin, settings. Zero operational modules!
  modules = ["SETTINGS"];
} else if (licenseType === "MODULAR") {
  // Modular license unlocks strictly the requested modules
  if (customModulesArg) {
    modules = customModulesArg.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean);
  } else {
    modules = [...(PLAN_PRESETS[plan] || [])];
  }
} else {
  // COMBINED license
  modules = [...(PLAN_PRESETS[plan] || [])];
  if (customModulesArg) {
    const extra = customModulesArg.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean);
    modules = Array.from(new Set([...modules, ...extra]));
  }
  if (!modules.length) {
    modules = [...PLAN_PRESETS.ENTERPRISE];
  }
}

const start = new Date();
const expires = new Date(start);
if (daysArg) {
  expires.setDate(expires.getDate() + Number(daysArg));
} else {
  const months = Number(monthsArg ?? "12");
  expires.setMonth(expires.getMonth() + months);
}

const payload = {
  version: 2,
  licenseId: `VJ-${start.toISOString().replace(/\D/g, "").slice(0, 8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
  type: licenseType,
  company,
  nif,
  hardwareId,
  plan,
  startsAt: start.toISOString(),
  expiresAt: expires.toISOString(),
  modules,
  limits: {
    maxTerminals: terminalsArg,
    maxUsers: usersArg,
  },
  issuedAt: start.toISOString(),
};

const canonical = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signer = createSign("RSA-SHA256");
signer.update(canonical);
signer.end();
const signature = signer.sign(createPrivateKey(readFileSync(privateKeyPath))).toString("base64url");
const token = `${canonical}.${signature}\n`;

writeFileSync(output, token, { encoding: "utf8" });

console.log("================================================================================");
console.log("                LICENÇA EMPRESARIAL EMITIDA COM SUCESSO                        ");
console.log("================================================================================");
console.log(`Ficheiro gerado : ${output}`);
console.log(`ID da Licença   : ${payload.licenseId}`);
console.log(`Empresa         : ${payload.company} (NIF: ${payload.nif})`);
console.log(`Plano Comercial : ${payload.plan}`);
console.log(`Hardware ID     : ${payload.hardwareId}`);
console.log(`Validade        : ${payload.startsAt.slice(0, 10)} até ${payload.expiresAt.slice(0, 10)}`);
console.log(`Módulos ativos  : ${payload.modules.join(", ")}`);
console.log(`Limites         : ${payload.limits.maxTerminals} Terminais · ${payload.limits.maxUsers} Utilizadores`);
console.log("================================================================================");
