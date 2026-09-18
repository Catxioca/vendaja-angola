import { createPrivateKey, createSign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const args = new Map(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const hardwareId = args.get("hardware") ?? args.get("hardware-id");
const nif = args.get("nif");
const months = Number(args.get("months") ?? "6");
const output = args.get("out") ?? "license.key";
const privateKeyPath = args.get("private-key") ?? process.env.VENDAJA_LICENSE_PRIVATE_KEY;
if (!hardwareId || !nif || ![6, 12].includes(months) || !privateKeyPath) {
  console.error("Uso: npm run generate-license -- --hardware=<ID> --nif=<NIF> --months=6|12 --private-key=<ficheiro> [--out=license.key]");
  process.exit(1);
}
const start = new Date();
const expires = new Date(start);
expires.setMonth(expires.getMonth() + months);
const payload = {
  version: 1,
  licenseId: `VJ-${start.toISOString().replace(/\D/g, "").slice(0, 14)}`,
  nif,
  hardwareId,
  startsAt: start.toISOString(),
  expiresAt: expires.toISOString(),
  modules: ["pdv", "products", "stock", "cash", "dashboard", "fiscal"],
};
const canonical = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signer = createSign("RSA-SHA256");
signer.update(canonical);
signer.end();
const signature = signer.sign(createPrivateKey(readFileSync(privateKeyPath))).toString("base64url");
writeFileSync(output, `${canonical}.${signature}\n`, { encoding: "utf8", flag: "wx" });
console.log(`Licença criada: ${output}`);
console.log(`Hardware: ${hardwareId}`);
console.log(`Validade: ${payload.startsAt} até ${payload.expiresAt}`);
