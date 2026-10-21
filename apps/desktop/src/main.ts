import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readServerConfigFile, testServerConnection, writeServerConfigFile, type ServerConfig } from "./server-config.js";
import {
  OPERATIONAL_MODULES,
  MODULE_CATALOG,
  normalizeModuleCode,
  type AppModule,
  type CommercialPlan,
} from "./modules.js";
import type {
  LicensePayload,
  LicenseStatus,
  LicenseTierType,
  ModuleLicenseDetail,
  ProductLicenseInfo,
  ModularLicenseInfo,
  LicenseAuditLogEntry,
} from "./license.js";
const here = path.dirname(fileURLToPath(import.meta.url));
let backendProcess: ChildProcess | null = null;
const backendEntry = () => app.isPackaged
  ? path.join(process.resourcesPath, "backend", "bundle.js")
  : path.resolve(here, "../../backend/dist/bundle.js");
function startLocalBackend(): void {
  if (process.env.VENDAJA_START_LOCAL_BACKEND !== "true" || !process.env.DATABASE_URL) {
    console.info("[desktop] local backend disabled; using offline storage and configured server mode");
    return;
  }
  const entry = backendEntry();
  const env = { ...process.env, PORT: process.env.PORT ?? "4000", NODE_ENV: process.env.NODE_ENV ?? "production" };
  const nodePath = app.isPackaged
    ? [path.join(process.resourcesPath, "backend", "vendor"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
    : process.env.NODE_PATH;
  backendProcess = spawn(process.execPath, [entry], { cwd: path.dirname(entry), env: { ...env, ...(nodePath ? { NODE_PATH: nodePath } : {}), ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  backendProcess.stdout?.on("data", (chunk) => console.log(`[backend] ${String(chunk).trim()}`));
  backendProcess.stderr?.on("data", (chunk) => console.error(`[backend] ${String(chunk).trim()}`));
  backendProcess.on("error", (error) => console.error("[desktop] backend start failed", error));
  backendProcess.on("exit", (code, signal) => { backendProcess = null; console.warn("[desktop] backend stopped", { code, signal }); });
}
interface StoredLicenseState {
  version: 2;
  token?: string; // backwards compatibility / combined
  productToken?: string;
  modularTokens?: string[];
  lastExecutedAt?: string;
  auditLog?: LicenseAuditLogEntry[];
}

const licenseStatePath = () => path.join(app.getPath("userData"), "license-state.json");
const serverConfigPath = () => path.join(app.getPath("userData"), "server-config.json");
async function readServerConfig(): Promise<ServerConfig | null> {
  return readServerConfigFile(serverConfigPath(), process.env.VENDAJA_ALLOW_PILOT_HTTP === "true");
}
async function saveServerConfig(config: ServerConfig): Promise<ServerConfig> {
  return writeServerConfigFile(serverConfigPath(), config, process.env.VENDAJA_ALLOW_PILOT_HTTP === "true");
}
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

async function appendLicenseAudit(
  event: LicenseAuditLogEntry["event"],
  details: string,
  actor = "Sistema Local"
): Promise<void> {
  try {
    let state: StoredLicenseState = { version: 2 };
    try {
      state = JSON.parse(await fs.readFile(licenseStatePath(), "utf8")) as StoredLicenseState;
    } catch {
      // fresh
    }
    const entry: LicenseAuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event,
      details,
      actor,
    };
    const currentList = Array.isArray(state.auditLog) ? state.auditLog : [];
    state.auditLog = [...currentList.slice(-199), entry];
    await fs.mkdir(path.dirname(licenseStatePath()), { recursive: true });
    await fs.writeFile(licenseStatePath(), JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("[desktop] Falha ao registar auditoria de licença", err);
  }
}

async function verifyToken(
  token: string,
  targetHardwareId: string,
  nowMs: number
): Promise<{ valid: boolean; reason?: string; payload?: LicensePayload }> {
  try {
    const decoded = decodeLicense(token);
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(decoded.canonical);
    verifier.end();
    const pubKey = await readLicensePublicKey();
    if (!verifier.verify(pubKey, Buffer.from(decoded.signature, "base64url"))) {
      return { valid: false, reason: "invalid_signature", payload: decoded.payload };
    }
    if (decoded.payload.hardwareId !== targetHardwareId) {
      return { valid: false, reason: "hardware_mismatch", payload: decoded.payload };
    }
    const startsAtMs = Date.parse(decoded.payload.startsAt);
    const expiresAtMs = Date.parse(decoded.payload.expiresAt);
    if (nowMs < startsAtMs) {
      return { valid: false, reason: "not_started", payload: decoded.payload };
    }
    if (nowMs >= expiresAtMs) {
      return { valid: false, reason: "expired", payload: decoded.payload };
    }
    return { valid: true, payload: decoded.payload };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "invalid_license" };
  }
}

async function validateLicense(): Promise<LicenseStatus> {
  const id = hardwareId();
  let state: StoredLicenseState = { version: 2 };
  try {
    state = JSON.parse(await fs.readFile(licenseStatePath(), "utf8")) as StoredLicenseState;
  } catch {
    /* clean install */
  }

  const now = Date.now();
  // 60-second tolerance for NTP clock synchronization adjustments
  if (state.lastExecutedAt && now < Date.parse(state.lastExecutedAt) - 60_000) {
    await appendLicenseAudit("LICENSE_INVALID", "Detetada manipulação retroativa do relógio do sistema (Clock Tampering).");
    return {
      valid: false,
      reason: "clock_tampering",
      hardwareId: id,
      expiryTier: "expired",
      daysRemaining: 0,
      modules: ["SETTINGS"],
      auditLog: state.auditLog || [],
      productLicense: {
        active: false,
        hardwareId: id,
        status: "TAMPERED",
      },
    };
  }

  state.lastExecutedAt = new Date(now).toISOString();

  // 1. Evaluate Product License (Authorizes running ERP instance, Login, Admin, Settings)
  let productLicense: ProductLicenseInfo = {
    active: true,
    hardwareId: id,
    company: "Empresa Licenciada (Standard)",
    nif: "999999999",
    edition: "STANDARD",
    status: "ACTIVE",
    daysRemaining: 365,
  };

  const productTokenCandidate = state.productToken || state.token;
  if (productTokenCandidate) {
    const verified = await verifyToken(productTokenCandidate, id, now);
    if (verified.valid && verified.payload) {
      const expMs = Date.parse(verified.payload.expiresAt);
      const remaining = Math.max(0, Math.ceil((expMs - now) / 86_400_000));
      productLicense = {
        active: true,
        hardwareId: id,
        company: verified.payload.company || "Empresa Licenciada Lda",
        nif: verified.payload.nif,
        edition: verified.payload.plan || "ENTERPRISE",
        startsAt: verified.payload.startsAt,
        expiresAt: verified.payload.expiresAt,
        daysRemaining: remaining,
        status: "ACTIVE",
      };
    } else if (verified.reason === "expired" && verified.payload) {
      productLicense = {
        active: false,
        hardwareId: id,
        company: verified.payload.company,
        nif: verified.payload.nif,
        edition: verified.payload.plan,
        startsAt: verified.payload.startsAt,
        expiresAt: verified.payload.expiresAt,
        daysRemaining: 0,
        status: "EXPIRED",
      };
    } else {
      if (state.productToken) {
        productLicense = {
          active: false,
          hardwareId: id,
          status: "NOT_ACTIVATED",
        };
      }
    }
  }

  // 2. Evaluate Modular Licenses (Only operational modules explicitly licensed are unlocked)
  const moduleMap = new Map<AppModule, ModuleLicenseDetail>();
  for (const modCode of OPERATIONAL_MODULES) {
    const cat = MODULE_CATALOG.find((m) => m.code === modCode);
    moduleMap.set(modCode, {
      code: modCode,
      name: cat?.name || modCode,
      category: cat?.category || "Operacional",
      licensed: false,
    });
  }

  const allModularTokens = Array.isArray(state.modularTokens) ? [...state.modularTokens] : [];
  if (state.token && !allModularTokens.includes(state.token)) {
    allModularTokens.push(state.token);
  }

  for (const modToken of allModularTokens) {
    const verified = await verifyToken(modToken, id, now);
    if (verified.valid && verified.payload) {
      const payloadModules = Array.isArray(verified.payload.modules) ? verified.payload.modules : [];
      const expMs = Date.parse(verified.payload.expiresAt);
      const remaining = Math.max(0, Math.ceil((expMs - now) / 86_400_000));
      for (const rawMod of payloadModules) {
        const canonical = normalizeModuleCode(rawMod);
        if (canonical && canonical !== "SETTINGS" && moduleMap.has(canonical)) {
          const existing = moduleMap.get(canonical)!;
          moduleMap.set(canonical, {
            ...existing,
            licensed: true,
            activatedAt: verified.payload.issuedAt || verified.payload.startsAt,
            expiresAt: verified.payload.expiresAt,
            daysRemaining: remaining,
            source: verified.payload.licenseId ? `Licença ${verified.payload.licenseId}` : "Chave Modular",
          });
        }
      }
    }
  }

  const moduleDetailsList = Array.from(moduleMap.values());
  const licensedModulesCount = moduleDetailsList.filter((m) => m.licensed).length;
  const lockedModulesCount = OPERATIONAL_MODULES.length - licensedModulesCount;
  const modularLicense: ModularLicenseInfo = {
    totalModulesCount: OPERATIONAL_MODULES.length,
    licensedModulesCount,
    lockedModulesCount,
    modules: moduleDetailsList,
  };

  const licensedOperationalCodes = moduleDetailsList.filter((m) => m.licensed).map((m) => m.code);
  const effectiveModules: string[] = ["SETTINGS", ...licensedOperationalCodes];

  await fs.mkdir(path.dirname(licenseStatePath()), { recursive: true });
  await fs.writeFile(licenseStatePath(), JSON.stringify(state, null, 2), "utf8");

  const daysRemaining = productLicense.daysRemaining ?? 365;
  let expiryTier: LicenseStatus["expiryTier"] = "valid";
  if (daysRemaining <= 15) expiryTier = "urgent";
  else if (daysRemaining <= 30) expiryTier = "critical";
  else if (daysRemaining <= 90) expiryTier = "expiring_soon";
  if (!productLicense.active && productLicense.status === "EXPIRED") {
    expiryTier = "expired";
  }

  return {
    valid: productLicense.active,
    reason: productLicense.active ? undefined : (productLicense.status === "EXPIRED" ? "expired" : "invalid_product_license"),
    hardwareId: id,
    company: productLicense.company,
    nif: productLicense.nif,
    plan: (productLicense.edition as CommercialPlan) || "STANDARD",
    startsAt: productLicense.startsAt,
    expiresAt: productLicense.expiresAt,
    daysRemaining,
    expiryTier,
    productLicense,
    modularLicense,
    modules: effectiveModules,
    auditLog: (state.auditLog || []).slice(-100),
  };
}

async function activateLicenseToken(
  token: string,
  targetType?: LicenseTierType | "AUTO"
): Promise<LicenseStatus> {
  const id = hardwareId();
  const now = Date.now();
  const verified = await verifyToken(token, id, now);

  if (!verified.valid || !verified.payload) {
    await appendLicenseAudit("LICENSE_INVALID", `Tentativa de ativação com chave inválida ou adulterada: ${verified.reason || "Erro de validação"}`);
    return {
      valid: false,
      reason: verified.reason || "invalid_license",
      hardwareId: id,
      expiryTier: "expired",
      daysRemaining: 0,
      modules: ["SETTINGS"],
    };
  }

  let state: StoredLicenseState = { version: 2 };
  try {
    state = JSON.parse(await fs.readFile(licenseStatePath(), "utf8")) as StoredLicenseState;
  } catch {
    /* clean state */
  }

  const payload = verified.payload;
  const inferredType: LicenseTierType =
    targetType && targetType !== "AUTO"
      ? targetType
      : payload.type || (payload.modules && payload.modules.length > 0 && !payload.company ? "MODULAR" : "COMBINED");

  if (inferredType === "PRODUCT") {
    state.productToken = token;
    await appendLicenseAudit(
      "PRODUCT_ACTIVATED",
      `Licença do Produto ativada para ${payload.company || "Empresa"} (NIF: ${payload.nif}) - Validade até ${payload.expiresAt?.slice(0, 10)}`
    );
  } else if (inferredType === "MODULAR") {
    const existing = Array.isArray(state.modularTokens) ? state.modularTokens : [];
    if (!existing.includes(token)) {
      state.modularTokens = [...existing, token];
    }
    const mods = Array.isArray(payload.modules) ? payload.modules.join(", ") : "Nenhum";
    await appendLicenseAudit(
      "MODULE_ACTIVATED",
      `Módulos ativados (${mods}) via licença ${payload.licenseId || "MODULAR"} para NIF ${payload.nif}`
    );
  } else {
    // COMBINED: sets product token and if modules present, adds to modular tokens
    state.productToken = token;
    state.token = token;
    if (Array.isArray(payload.modules) && payload.modules.length > 0) {
      const existing = Array.isArray(state.modularTokens) ? state.modularTokens : [];
      if (!existing.includes(token)) {
        state.modularTokens = [...existing, token];
      }
    }
    await appendLicenseAudit(
      "PRODUCT_ACTIVATED",
      `Licença de Produto & Módulos ativada para ${payload.company || "Empresa"} (NIF: ${payload.nif})`
    );
    if (Array.isArray(payload.modules) && payload.modules.length > 0) {
      await appendLicenseAudit(
        "MODULE_ACTIVATED",
        `Módulos ativados (${payload.modules.join(", ")}) via licença ${payload.licenseId}`
      );
    }
  }

  await fs.mkdir(path.dirname(licenseStatePath()), { recursive: true });
  await fs.writeFile(licenseStatePath(), JSON.stringify(state, null, 2), "utf8");

  return validateLicense();
}
const createWindow = () => {
  const win = new BrowserWindow({ width: 1200, height: 800, webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false } });
  win.webContents.on("did-fail-load", (_event, code, description, url) => console.error("[desktop] renderer failed to load", { code, description, url }));
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`));
  win.loadFile(path.join(here, "renderer/index.html")).catch((error) => console.error("[desktop] loadFile failed", error));
};

ipcMain.handle(
  "print-html-document",
  async (
    _event,
    html: string,
    options?: {
      printerName?: string;
      silent?: boolean;
      copies?: number;
      format?: string;
      paperWidthMm?: number;
    }
  ) => {
    return new Promise<{ success: boolean; failureReason?: string }>(async (resolve) => {
      let printWin: BrowserWindow | null = null;
      try {
        const format = options?.format || "80mm";
        const widthPx =
          format === "58mm" ? 220 : format === "80mm" ? 302 : format === "a5" ? 560 : 794;

        printWin = new BrowserWindow({
          show: false,
          width: widthPx,
          height: 900,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        });

        const encodedUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

        await new Promise<void>((loadResolve, loadReject) => {
          if (!printWin) return loadReject(new Error("Print window lost"));
          const timer = setTimeout(() => loadResolve(), 3500);
          printWin.webContents.once("did-finish-load", () => {
            clearTimeout(timer);
            setTimeout(loadResolve, 150);
          });
          printWin.webContents.once("did-fail-load", (_e, code, desc) => {
            clearTimeout(timer);
            loadReject(new Error(`Erro ao carregar documento (${code}: ${desc})`));
          });
          printWin.loadURL(encodedUri).catch(loadReject);
        });

        // Measure document content height
        let contentHeightPx = 800;
        try {
          contentHeightPx = await printWin.webContents.executeJavaScript(
            "Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)"
          );
        } catch {
          // fallback
        }
        const contentHeightMicrons = Math.max(60000, Math.round(contentHeightPx * 264.583));

        const printOptions: Electron.WebContentsPrintOptions = {
          silent: options?.silent ?? false,
          printBackground: true,
          deviceName: options?.printerName || undefined,
          copies: options?.copies ?? 1,
          margins: { marginType: "none" },
        };

        if (format === "58mm") {
          printOptions.pageSize = { width: 58000, height: contentHeightMicrons + 10000 };
        } else if (format === "80mm") {
          printOptions.pageSize = { width: 80000, height: contentHeightMicrons + 12000 };
        } else if (format === "a5") {
          printOptions.pageSize = "A5";
        } else if (format === "letter") {
          printOptions.pageSize = "Letter";
        } else {
          printOptions.pageSize = "A4";
        }

        printWin.webContents.print(printOptions, (success, failureReason) => {
          if (printWin && !printWin.isDestroyed()) {
            printWin.close();
            printWin = null;
          }
          resolve({ success, failureReason: failureReason || undefined });
        });
      } catch (err) {
        if (printWin && !printWin.isDestroyed()) {
          printWin.close();
          printWin = null;
        }
        resolve({
          success: false,
          failureReason: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
);

ipcMain.handle(
  "export-pdf-document",
  async (
    event,
    documentTitle: string,
    html: string,
    options?: { format?: string; defaultPath?: string }
  ) => {
    const parentWin = BrowserWindow.fromWebContents(event.sender);
    const safeTitle = (documentTitle || "documento").replace(/[/\\?%*:|"<>]/g, "-");
    const saveDialogOpts: Electron.SaveDialogOptions = {
      title: "Descarregar documento em PDF",
      defaultPath: `${safeTitle}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    };
    const result = parentWin
      ? await dialog.showSaveDialog(parentWin, saveDialogOpts)
      : await dialog.showSaveDialog(saveDialogOpts);
    if (result.canceled || !result.filePath) return { saved: false };

    let printWin: BrowserWindow | null = null;
    try {
      const format = options?.format || "80mm";
      const widthPx =
        format === "58mm" ? 220 : format === "80mm" ? 302 : format === "a5" ? 560 : 794;

      printWin = new BrowserWindow({
        show: false,
        width: widthPx,
        height: 900,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      const encodedUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      await new Promise<void>((loadResolve, loadReject) => {
        if (!printWin) return loadReject(new Error("Print window lost"));
        const timer = setTimeout(() => loadResolve(), 3500);
        printWin.webContents.once("did-finish-load", () => {
          clearTimeout(timer);
          setTimeout(loadResolve, 150);
        });
        printWin.webContents.once("did-fail-load", (_e, code, desc) => {
          clearTimeout(timer);
          loadReject(new Error(`Erro ao carregar documento (${code}: ${desc})`));
        });
        printWin.loadURL(encodedUri).catch(loadReject);
      });

      let contentHeightPx = 800;
      try {
        contentHeightPx = await printWin.webContents.executeJavaScript(
          "Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)"
        );
      } catch {
        // fallback
      }
      const contentHeightMicrons = Math.max(60000, Math.round(contentHeightPx * 264.583));

      let pageSize: any = "A4";
      if (format === "58mm") {
        pageSize = { width: 58000, height: contentHeightMicrons + 5000 };
      } else if (format === "80mm") {
        pageSize = { width: 80000, height: contentHeightMicrons + 6000 };
      } else if (format === "a5") {
        pageSize = "A5";
      } else if (format === "letter" || format === "carta") {
        pageSize = "Letter";
      } else {
        pageSize = "A4";
      }

      const pdf = await printWin.webContents.printToPDF({
        printBackground: true,
        pageSize,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });

      await fs.writeFile(result.filePath, pdf);
      if (printWin && !printWin.isDestroyed()) {
        printWin.close();
        printWin = null;
      }
      return { saved: true, filePath: result.filePath };
    } catch (err) {
      if (printWin && !printWin.isDestroyed()) {
        printWin.close();
        printWin = null;
      }
      return {
        saved: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

ipcMain.handle(
  "save-print-debug-dump",
  async (_event, docNumber: string, html: string, meta?: any) => {
    try {
      const dumpDir = path.join(app.getPath("userData"), "print-dumps");
      await fs.mkdir(dumpDir, { recursive: true });
      const safeNum = (docNumber || `doc-${Date.now()}`).replace(/[/\\?%*:|"<>]/g, "-");
      const dumpFile = path.join(dumpDir, `${safeNum}-${Date.now()}.html`);
      const payload = `<!-- PRINT DEBUG DUMP META: ${JSON.stringify(meta || {})} -->\n${html}`;
      await fs.writeFile(dumpFile, payload, "utf-8");
      return { success: true, filePath: dumpFile };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

ipcMain.handle("save-invoice-pdf", async (event, documentTitle: string, format?: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("Janela principal indisponível.");
  const safeTitle = (documentTitle || "documento").replace(/[/\\?%*:|"<>]/g, "-");
  const result = await dialog.showSaveDialog(window, {
    title: "Descarregar documento em PDF",
    defaultPath: `${safeTitle}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };

  let pageSize: any = "A4";
  if (format === "58mm") {
    pageSize = { width: 58000, height: 210000 };
  } else if (format === "80mm") {
    pageSize = { width: 80000, height: 297000 };
  } else if (format === "a5") {
    pageSize = "A5";
  } else if (format === "letter" || format === "carta") {
    pageSize = "Letter";
  } else {
    pageSize = "A4";
  }

  const pdf = await event.sender.printToPDF({
    printBackground: true,
    pageSize,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await fs.writeFile(result.filePath, pdf);
  return { saved: true, filePath: result.filePath };
});

ipcMain.handle("get-printers", async (event) => {
  try {
    return await event.sender.getPrintersAsync();
  } catch (err) {
    console.error("[desktop] Falha ao listar impressoras:", err);
    return [];
  }
});

ipcMain.handle("print-document", async (event, options?: { deviceName?: string; silent?: boolean; copies?: number; pageSize?: string }) => {
  return new Promise<{ success: boolean; failureReason?: string }>((resolve) => {
    try {
      const printOptions: Electron.WebContentsPrintOptions = {
        silent: options?.silent ?? false,
        printBackground: true,
        deviceName: options?.deviceName || undefined,
        copies: options?.copies ?? 1,
        margins: { marginType: "none" },
      };
      if (options?.pageSize) {
        printOptions.pageSize = options.pageSize as any;
      }
      event.sender.print(printOptions, (success, failureReason) => {
        resolve({ success, failureReason: failureReason || undefined });
      });
    } catch (err) {
      resolve({ success: false, failureReason: err instanceof Error ? err.message : String(err) });
    }
  });
});

ipcMain.handle("get-license-status", () => validateLicense());
ipcMain.handle("get-hardware-id", () => hardwareId());
ipcMain.handle("get-server-config", () => readServerConfig());
ipcMain.handle("save-server-config", (_event, config: ServerConfig) => saveServerConfig(config));
ipcMain.handle("test-server-connection", (_event, apiUrl: string) => testServerConnection(apiUrl, process.env.VENDAJA_ALLOW_PILOT_HTTP === "true"));
ipcMain.handle("activate-license", async (_event, token: string, targetType?: LicenseTierType | "AUTO") => {
  return activateLicenseToken(token, targetType);
});
ipcMain.handle("log-license-audit", async (_event, event: string, details: string) => {
  await appendLicenseAudit(event as any, details, "Utilizador Frontend");
  return true;
});
ipcMain.handle("check-live-updates", async (_event, apiUrl?: string) => {
  try {
    const config = await readServerConfig();
    const targetUrl = apiUrl || config?.apiUrl || "http://localhost:4000";
    const res = await fetch(`${targetUrl}/api/v1/saas/updates/check?currentVersion=${app.getVersion()}`);
    if (res.ok) return await res.json();
    return { updateAvailable: false, manifest: { version: app.getVersion() } };
  } catch (err) {
    return { updateAvailable: false, error: String(err) };
  }
});
ipcMain.handle("sync-live-config", async (_event, apiUrl?: string) => {
  try {
    const config = await readServerConfig();
    const targetUrl = apiUrl || config?.apiUrl || "http://localhost:4000";
    const res = await fetch(`${targetUrl}/api/v1/saas/updates/live-config`);
    if (res.ok) {
      const data = await res.json();
      return { success: true, liveConfig: data };
    }
    return { success: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
process.on("uncaughtException", (error) => console.error("[desktop] uncaught exception", error));
process.on("unhandledRejection", (error) => console.error("[desktop] unhandled rejection", error));
app.whenReady().then(() => { startLocalBackend(); createWindow(); }).catch((error) => console.error("[desktop] startup failed", error));
app.on("before-quit", () => { if (backendProcess && !backendProcess.killed) backendProcess.kill(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
