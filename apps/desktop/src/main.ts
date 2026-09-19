import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
let backendProcess: ChildProcess | null = null;
const backendEntry = () => app.isPackaged
  ? path.join(process.resourcesPath, "backend", "dist", "bundle.js")
  : path.resolve(here, "../../backend/dist/bundle.js");
function startLocalBackend(): void {
  const entry = backendEntry();
  const env = { ...process.env, PORT: process.env.PORT ?? "4000", NODE_ENV: process.env.NODE_ENV ?? "production" };
  backendProcess = spawn(process.execPath, [entry], { cwd: path.dirname(entry), env: { ...env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  backendProcess.stdout?.on("data", (chunk) => console.log(`[backend] ${String(chunk).trim()}`));
  backendProcess.stderr?.on("data", (chunk) => console.error(`[backend] ${String(chunk).trim()}`));
  backendProcess.on("error", (error) => console.error("[desktop] backend start failed", error));
  backendProcess.on("exit", (code, signal) => { backendProcess = null; console.warn("[desktop] backend stopped", { code, signal }); });
}
type LicensePayload = { version: number; licenseId: string; nif: string; hardwareId: string; startsAt: string; expiresAt: string; modules: string[] };
type LicenseStatus = { valid: boolean; reason?: string; hardwareId: string; expiresAt?: string; nif?: string; modules?: string[] };
const licenseStatePath = () => path.join(app.getPath("userData"), "license-state.json");
const publicKeyPath = () => app.isPackaged
  ? path.join(process.resourcesPath, "public.pem")
  : path.resolve(here, "../../public.pem");
async function readLicensePublicKey(): Promise<string> {
  const key = await fs.readFile(publicKeyPath(), "utf8");
  if (!key.includes("-----BEGIN PUBLIC KEY-----") || !key.includes("-----END PUBLIC KEY-----")) throw new Error("public_key_invalid");
  return key;
}
const hardwareId = () => crypto.createHash("sha256").update(`${os.hostname()}|${os.platform()}|${os.arch()}|${app.getPath("userData")}`).digest("hex").slice(0, 32).toUpperCase();
const decodeLicense = (token: string): { payload: LicensePayload; signature: string; canonical: string } => {
  const [canonical, signature] = token.trim().split(".");
  if (!canonical || !signature) throw new Error("Formato de licença inválido.");
  const payload = JSON.parse(Buffer.from(canonical, "base64url").toString("utf8")) as LicensePayload;
  return { payload, signature, canonical };
};
async function validateLicense(token?: string): Promise<LicenseStatus> {
  const id = hardwareId();
  let state: { token?: string; lastExecutedAt?: string } = {};
  try { state = JSON.parse(await fs.readFile(licenseStatePath(), "utf8")) as typeof state; } catch { /* first run */ }
  const now = Date.now();
  if (state.lastExecutedAt && now < Date.parse(state.lastExecutedAt)) return { valid: false, reason: "clock_tampering", hardwareId: id };
  const currentToken = token ?? state.token;
  if (!currentToken) {
    await fs.mkdir(path.dirname(licenseStatePath()), { recursive: true });
    await fs.writeFile(licenseStatePath(), JSON.stringify({ ...state, lastExecutedAt: new Date(now).toISOString() }));
    return { valid: false, reason: "missing_license", hardwareId: id };
  }
  try {
    const decoded = decodeLicense(currentToken);
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(decoded.canonical);
    verifier.end();
    if (!verifier.verify(await readLicensePublicKey(), Buffer.from(decoded.signature, "base64url"))) throw new Error("invalid_signature");
    if (decoded.payload.hardwareId !== id) throw new Error("hardware_mismatch");
    if (now < Date.parse(decoded.payload.startsAt)) throw new Error("not_started");
    if (now >= Date.parse(decoded.payload.expiresAt)) throw new Error("expired");
    await fs.mkdir(path.dirname(licenseStatePath()), { recursive: true });
    await fs.writeFile(licenseStatePath(), JSON.stringify({ token: currentToken, lastExecutedAt: new Date(now).toISOString() }));
    return { valid: true, hardwareId: id, expiresAt: decoded.payload.expiresAt, nif: decoded.payload.nif, modules: decoded.payload.modules };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "invalid_license", hardwareId: id };
  }
}
const createWindow = () => {
  const win = new BrowserWindow({ width: 1200, height: 800, webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false } });
  win.webContents.on("did-fail-load", (_event, code, description, url) => console.error("[desktop] renderer failed to load", { code, description, url }));
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`));
  win.loadFile(path.join(here, "renderer/index.html")).catch((error) => console.error("[desktop] loadFile failed", error));
};
ipcMain.handle("save-invoice-pdf", async (event, documentTitle: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("Janela principal indisponível.");
  const result = await dialog.showSaveDialog(window, { title: "Descarregar fatura em PDF", defaultPath: `${documentTitle || "fatura-recibo"}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (result.canceled || !result.filePath) return { saved: false };
  const pdf = await event.sender.printToPDF({ printBackground: true, pageSize: "A4" });
  await fs.writeFile(result.filePath, pdf);
  return { saved: true, filePath: result.filePath };
});
ipcMain.handle("get-license-status", () => validateLicense());
ipcMain.handle("activate-license", async (_event, token: string) => {
  const status = await validateLicense(token);
  if (!status.valid) return status;
  return status;
});
process.on("uncaughtException", (error) => console.error("[desktop] uncaught exception", error));
process.on("unhandledRejection", (error) => console.error("[desktop] unhandled rejection", error));
app.whenReady().then(() => { startLocalBackend(); createWindow(); }).catch((error) => console.error("[desktop] startup failed", error));
app.on("before-quit", () => { if (backendProcess && !backendProcess.killed) backendProcess.kill(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
