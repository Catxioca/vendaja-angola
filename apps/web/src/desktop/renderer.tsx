import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  createPosStorage, escPosReceipt, fiscalHash, fiscalQrPayload, formatKwanza, SyncEngine,
  saleToCommercialDocument,
  type PaymentMethod, type Product, type Sale,
} from "@angola/shared";
import { DocumentPreviewModal } from "./document-preview-modal.js";
import { ErrorBoundary } from "./ErrorBoundary";
import { BootstrapAccountForm } from "./BootstrapAccountForm";
import { AccountingPanel, CashPanel, CashflowPanel, DashboardPanel, DevicesPanel, EnterpriseAutomationWorkflowPanel, EnterpriseCrmDocumentPanel, EnterpriseGovernancePanel, EnterpriseIntegrationsPanel, EnterpriseFinancialPanel, EnterpriseBiAnalyticsPanel, EnterpriseSaasCloudPanel, EnterpriseCopilotPanel, FiscalSettingsPanel, HRPanel, OperationsPanel, PlatformPanel, ProductsPanel, ReportsPanel, StockDocumentsPanel, TechnicalLogsPanel } from "./panels";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import QRCode from "qrcode";
import "./style.css";

type DeviceSettings = {
  source: "camera" | "hid";
  deviceId: string;
  width: number;
  height: number;
  continuousFocus: boolean;
  lowLight: boolean;
};
const deviceSettingsKey = "vendaja-device-settings";
const defaultDeviceSettings: DeviceSettings = { source: "camera", deviceId: "", width: 1280, height: 720, continuousFocus: true, lowLight: false };
function readDeviceSettings(): DeviceSettings {
  try { return { ...defaultDeviceSettings, ...JSON.parse(localStorage.getItem(deviceSettingsKey) ?? "{}") } as DeviceSettings; } catch { return defaultDeviceSettings; }
}
function parseProductCode(value: string): string[] {
  const raw = value.trim();
  const candidates = new Set<string>([raw]);
  for (const part of raw.split(/[|;,/\s]+/).filter(Boolean)) candidates.add(part);
  for (const match of raw.matchAll(/(?:SKU|EAN|BARCODE|PRODUCT|ID|CODIGO|CÓDIGO)\s*[:=]\s*([A-Z0-9._-]+)/giu)) if (match[1]) candidates.add(match[1]);
  if (raw.startsWith("AO|")) return [];
  return [...candidates].map((item) => item.trim().toLowerCase()).filter(Boolean);
}
function playScanTone(success: boolean): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = success ? 880 : 180;
    gain.gain.value = 0.04;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (success ? 0.12 : 0.22));
  } catch { /* Audio is optional in restricted environments. */ }
}

const DEMO_PRODUCTS: Product[] = [
  { id: "coffee", sku: "CAF-001", name: "Café Angola", priceCents: 125000, stock: 42, taxRate: 0.14, active: true },
  { id: "water", sku: "AGU-001", name: "Água mineral", priceCents: 75000, stock: 80, taxRate: 0.14, active: true },
  { id: "ginger", sku: "GIN-001", name: "Gengibre", priceCents: 95000, stock: 25, taxRate: 0.14, active: true },
  { id: "bread", sku: "PÃO-001", name: "Pão de forma", priceCents: 150000, stock: 18, taxRate: 0.05, active: true },
];
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
type ServerConfig = { apiUrl: string; terminalId: string };
const serverConfig = () => {
  try { return JSON.parse(localStorage.getItem("vendaja-server-config") ?? "null") as ServerConfig | null; } catch { return null; }
};
const api = () => {
  const custom = serverConfig()?.apiUrl || localStorage.getItem("vendaja_api_url") || localStorage.getItem("POS_API_URL") || (globalThis as { __POS_API_URL__?: string }).__POS_API_URL__;
  if (custom) return custom;
  const envUrl = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return "https://vendaja-api.onrender.com";
  }
  return "http://localhost:4000";
};
const terminal = () => serverConfig()?.terminalId ?? localStorage.getItem("terminalId") ?? "01";
const posBridge = () => (window as unknown as { pos?: { getServerConfig?: () => Promise<ServerConfig | null>; saveServerConfig?: (config: ServerConfig) => Promise<ServerConfig>; testServerConnection?: (url: string) => Promise<{ ok: boolean; status?: number; message: string }> } }).pos;
function storeServerConfig(config: ServerConfig): void {
  localStorage.setItem("vendaja-server-config", JSON.stringify(config));
  localStorage.setItem("terminalId", config.terminalId);
  window.dispatchEvent(new CustomEvent("server-config-updated"));
}
const moneyInput = (value: string) => Math.max(0, Math.round(Number(value.replace(",", ".")) * 100) || 0);
type LocalAuth = { username: string; email: string; displayName: string; role: string; passwordHash: string; pinHash: string };
const localAuthKey = "vendaja-local-auth";
async function credentialHash(value: string): Promise<string> {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function getLocalAuth(): Promise<LocalAuth> {
  const saved = localStorage.getItem(localAuthKey);
  if (saved) return JSON.parse(saved) as LocalAuth;
  const initial: LocalAuth = { username: "admin", email: "admin@angolacommerce.local", displayName: "Administrador", role: "ADMIN", passwordHash: await credentialHash("Admin@1234!"), pinHash: await credentialHash("123456") };
  localStorage.setItem(localAuthKey, JSON.stringify(initial));
  return initial;
}
async function saveLocalCredential(mode: "password" | "pin", value: string): Promise<void> {
  const auth = await getLocalAuth();
  auth[mode === "pin" ? "pinHash" : "passwordHash"] = await credentialHash(value);
  localStorage.setItem(localAuthKey, JSON.stringify(auth));
}
async function offlineLogin(identifier: string, credential: string, mode: "password" | "pin") {
  const auth = await getLocalAuth();
  const matchesIdentifier = [auth.username, auth.email].some((value) => value.toLowerCase() === identifier.trim().toLowerCase());
  const matchesCredential = (mode === "pin" ? auth.pinHash : auth.passwordHash) === await credentialHash(credential);
  if (!matchesIdentifier || !matchesCredential) throw new Error(mode === "pin" ? "PIN inválido." : "Credenciais inválidas.");
  return { accessToken: "offline-local-session", refreshToken: "", user: { id: "local-admin", email: auth.email, username: auth.username, displayName: auth.displayName, role: auth.role, authMethod: mode as "password" | "pin" } };
}

import { BiometricsAccessPanel } from "./biometrics-panel.js";
import { CorporatePanel } from "./corporate-panel.js";

type View = "pdv" | "copilot" | "dashboard" | "products" | "stock-documents" | "cash" | "fiscal" | "devices" | "hr" | "accounting" | "operations" | "reports" | "cashflow" | "platform" | "logs" | "governance" | "automation" | "crm" | "documents" | "integrations" | "financial" | "bi" | "cloud" | "license" | "biometrics" | "corporate";
type Payment = { method: PaymentMethod | "MIXED"; cashCents: number; cardCents: number; transferCents: number; customerId: string; customerName: string; customerNif: string; dueDate: string };
type CustomerOption = { id: string; name: string; nif?: string | null; creditLimitCents: number; outstandingDebtCents: number; active: boolean };
import {
  type AppModule,
  defaultLicensedModules,
  isDemoMode,
  normalizeRole,
  roleModules,
  normalizeModuleCode,
  MODULE_CATALOG,
  PLAN_METADATA,
  type ModuleInfo,
  type CommercialPlan,
} from "./modules.js";
import {
  LicensingCenterPanel,
  LockedModuleModal,
  LockedModuleView,
  LicenseWarningBanner,
} from "./licensing-panel.js";
import type { LicenseStatus, LicenseTierType } from "./license.js";

const VIEW_MODULE_MAP: Record<View, AppModule> = {
  copilot: "AI",
  pdv: "POS",
  cash: "POS",
  dashboard: "DASHBOARD",
  products: "STOCK",
  "stock-documents": "STOCK",
  operations: "PURCHASES",
  cashflow: "TREASURY",
  financial: "TREASURY",
  accounting: "ACCOUNTING",
  hr: "HR",
  reports: "REPORTS",
  bi: "BI",
  automation: "AUTOMATION",
  governance: "GOVERNANCE",
  documents: "DOCUMENTS",
  crm: "CRM",
  integrations: "INTEGRATIONS",
  cloud: "CLOUD",
  biometrics: "BIOMETRICS",
  corporate: "CORPORATE",
  license: "SETTINGS",
  devices: "SETTINGS",
  platform: "SETTINGS",
  fiscal: "SETTINGS",
  logs: "SETTINGS",
};


function UnusedLogin({ onLogin }: { onLogin: (token: string, refresh: string, user: { role: string; displayName?: string; email: string }) => void }) {
  const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try { const response = await fetch(`${api()}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) }); const data = await response.json(); if (!response.ok) throw new Error("Credenciais inválidas."); localStorage.setItem("accessToken", data.accessToken); localStorage.setItem("refreshToken", data.refreshToken); onLogin(data.accessToken, data.refreshToken, data.user); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível iniciar sessão."); }
  }
}

function ModernLogin({ onLogin }: { onLogin: (token: string, refresh: string, user: { role: string; displayName?: string; email: string }) => void }) {
    const [mode, setMode] = useState<"password" | "pin">("password");
    const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
    async function submit(event: FormEvent) {
      event.preventDefault(); setError("");
      if (mode === "pin" && !/^\d{6}$/.test(password)) { setError("O PIN deve conter exatamente 6 dígitos."); return; }
      setLoading(true);
      try { const response = await fetch(`${api()}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) }); const data = await response.json(); if (!response.ok) throw new Error("Credenciais inválidas."); localStorage.setItem("accessToken", data.accessToken); localStorage.setItem("refreshToken", data.refreshToken); onLogin(data.accessToken, data.refreshToken, data.user); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível iniciar sessão."); }
      finally { setLoading(false); }
    }
    const pressPin = (digit: string) => setPassword((value) => value.length < 6 ? value + digit : value);
    return <main className="login-shell"><section className="login-brand"><div className="brand-mark">V<span>J</span></div><p className="eyebrow">GESTÃO COMERCIAL</p><h1>VendaJá <span>Angola</span></h1><p className="tagline">Vendas simples. Negócio sempre em movimento.</p><div className="login-status"><span className="status-dot" /> Sistema online <span className="status-separator">•</span> Pronto para vender</div><div className="brand-decoration"><span>AOA</span><span>PDV</span><span>OFFLINE FIRST</span></div></section><section className="login-card"><div className="login-card-inner"><div className="login-heading"><p className="eyebrow">BEM-VINDO DE VOLTA</p><h2>Iniciar sessão</h2><p>Entre na sua conta para continuar.</p></div><div className="login-tabs"><button type="button" className={mode === "password" ? "selected" : ""} onClick={() => { setMode("password"); setPassword(""); }}>E-mail e password</button><button type="button" className={mode === "pin" ? "selected" : ""} onClick={() => { setMode("pin"); setPassword(""); }}>PIN rápido</button></div><form onSubmit={submit}><label className="login-label">Utilizador ou e-mail<input className="login-input" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus placeholder="admin ou email@empresa.ao" /></label>{mode === "password" ? <label className="login-label">Password<input className="login-input" required type="password" minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Introduza a sua password" /></label> : <><label className="login-label">PIN de 6 dígitos<input className="login-input pin-display" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /></label><div className="pin-keypad">{["1","2","3","4","5","6","7","8","9","0"].map((digit) => <button type="button" key={digit} onClick={() => pressPin(digit)}>{digit}</button>)}<button type="button" className="pin-clear" onClick={() => setPassword("")}>Limpar</button></div></>}{error && <div className="login-error">{error}</div>}<button className="login-submit" disabled={loading}>{loading ? "A validar..." : "Entrar na VendaJá"}</button></form><p className="login-footnote">Os seus dados ficam protegidos e as vendas podem continuar offline.</p></div></section></main>;
  }

function Login({ onLogin }: { onLogin: (token: string, refresh: string, user: { role: string; displayName?: string; email: string }) => void }) {
    const [pinMode, setPinMode] = useState(false); const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [showBootstrap, setShowBootstrap] = useState(false);
    const [configurationReady, setConfigurationReady] = useState<boolean | null>(() => {
      if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        return true;
      }
      return null;
    });
    useEffect(() => {
      if (configurationReady === true) return;
      const bridge = posBridge();
      if (!bridge?.getServerConfig) {
        setConfigurationReady(Boolean(serverConfig()) || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"));
        return;
      }
      void bridge.getServerConfig().then((config) => {
        if (config) storeServerConfig(config);
        setConfigurationReady(Boolean(config));
      }).catch(() => setConfigurationReady(Boolean(serverConfig())));
    }, []);
    async function submit(event: FormEvent) { event.preventDefault(); setError(""); if (pinMode && !/^\d{6}$/.test(password)) { setError("O PIN deve conter exatamente 6 dígitos."); return; } setLoading(true); try { const mode = pinMode ? "pin" : "password"; let data: Awaited<ReturnType<typeof offlineLogin>>; try { const response = await fetch(`${api()}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password, mode }) }); if (!response.ok) throw new Error("remote_login_failed"); data = await response.json() as Awaited<ReturnType<typeof offlineLogin>>; await saveLocalCredential(mode, password); } catch { data = await offlineLogin(identifier, password, mode); } localStorage.setItem("accessToken", data.accessToken); localStorage.setItem("refreshToken", data.refreshToken); onLogin(data.accessToken, data.refreshToken, data.user); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível iniciar sessão."); } finally { setLoading(false); } }
    const press = (digit: string) => setPassword((value) => value.length < 6 ? value + digit : value);
    if (configurationReady === null) return <main className="login-shell"><section className="login-card"><div className="login-card-inner">A carregar configuração segura…</div></section></main>;
    if (!configurationReady) return <main className="login-shell"><section className="login-card"><ServerConfigPanel firstRun onSaved={() => setConfigurationReady(true)} /></section></main>;
    if (showBootstrap) return <main className="login-shell"><section className="login-card"><BootstrapAccountForm apiUrl={api()} onComplete={onLogin} onCancel={() => setShowBootstrap(false)} /></section></main>;
    return <main className="login-shell"><section className="login-brand"><div className="brand-mark">V<span>J</span></div><p className="eyebrow">GESTÃO COMERCIAL & FISCAL</p><h1>VendaJá <span>Angola</span></h1><p className="tagline">ERP Omnichannel, POS Certificado AGT e Portais Integrados.</p><div className="login-status"><span className="status-dot" /> Sistema online <span className="status-separator">•</span> 27 Módulos Ativos</div><div className="brand-decoration"><span>AOA</span><span>AGT</span><span>OFFLINE FIRST</span></div></section><section className="login-card"><div className="login-card-inner"><div className="login-heading"><p className="eyebrow">BEM-VINDO</p><h2>Iniciar sessão ERP</h2><p>Aceda com as suas credenciais ou explore o ambiente de auditoria.</p></div><div className="login-tabs"><button type="button" className={!pinMode ? "selected" : ""} onClick={() => { setPinMode(false); setPassword(""); }}>E-mail e password</button><button type="button" className={pinMode ? "selected" : ""} onClick={() => { setPinMode(true); setPassword(""); }}>PIN rápido</button></div><form onSubmit={submit}><label className="login-label">Utilizador ou e-mail<input className="login-input" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="admin ou email@empresa.ao" /></label>{pinMode ? <><label className="login-label">PIN de 6 dígitos<input className="login-input pin-display" required inputMode="numeric" maxLength={6} value={password} onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /></label><div className="pin-keypad">{["1","2","3","4","5","6","7","8","9","0"].map((digit) => <button type="button" key={digit} onClick={() => press(digit)}>{digit}</button>)}<button type="button" className="pin-clear" onClick={() => setPassword("")}>Limpar</button></div></> : <label className="login-label">Password<input className="login-input" required type="password" minLength={4} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Introduza a sua password" /> </label>}{error && <div className="login-error">{error}</div>}<button className="login-submit" disabled={loading}>{loading ? "A validar..." : "Entrar na VendaJá"}</button></form><div style={{ margin: "14px 0", borderTop: "1px dashed #cbd5e1", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}><button type="button" className="bootstrap-entry" onClick={() => setShowBootstrap(true)}>🔑 Criar Conta de Administrador Inicial</button></div><div style={{ background: "#f8fafc", padding: "10px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e2e8f0" }}><strong style={{ color: "#475569", display: "block", marginBottom: "6px" }}>Acessos Rápidos aos Portais Externos:</strong><div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}><a href="#portal-cliente" onClick={() => { window.location.hash = "portal-cliente"; window.location.reload(); }} style={{ color: "#0284c7", textDecoration: "none", fontWeight: "600", padding: "4px 8px", background: "#e0f2fe", borderRadius: "4px" }}>🏢 Cliente</a><a href="#portal-fornecedor" onClick={() => { window.location.hash = "portal-fornecedor"; window.location.reload(); }} style={{ color: "#059669", textDecoration: "none", fontWeight: "600", padding: "4px 8px", background: "#d1fae5", borderRadius: "4px" }}>🚛 Fornecedor</a><a href="#portal-colaborador" onClick={() => { window.location.hash = "portal-colaborador"; window.location.reload(); }} style={{ color: "#7c3aed", textDecoration: "none", fontWeight: "600", padding: "4px 8px", background: "#ede9fe", borderRadius: "4px" }}>👥 Colaborador</a></div></div></div></section></main>;
  }

function FiscalPanelLegacy({ token }: { token: string }) {
    const [form, setForm] = useState({ companyName: "", companyNif: "", saftSchedule: "", privateKeyPem: "" }); const [message, setMessage] = useState("");
    useEffect(() => { void fetch(`${api()}/api/v1/fiscal/config`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json()).then((data) => setForm((current) => ({ ...current, companyName: data.companyName ?? "", companyNif: data.companyNif ?? "", saftSchedule: data.saftSchedule ?? "" }))).catch(() => setMessage("Não foi possível carregar a configuração.")); }, [token]);
    async function save() { const response = await fetch(`${api()}/api/v1/fiscal/config`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(form) }); setMessage(response.ok ? "Configuração fiscal guardada com segurança." : "Falha ao guardar configuração."); }
    return <section className="placeholder"><h2>Definições fiscais</h2><label>Nome da empresa<input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label><label>NIF<input value={form.companyNif} onChange={(e) => setForm({ ...form, companyNif: e.target.value })} /></label><label>Certificado PEM/PFX (conteúdo)<textarea value={form.privateKeyPem} onChange={(e) => setForm({ ...form, privateKeyPem: e.target.value })} /></label><label>Agendamento SAF-T<input placeholder="manual ou cron" value={form.saftSchedule} onChange={(e) => setForm({ ...form, saftSchedule: e.target.value })} /></label><button className="checkout" onClick={() => void save()}>Guardar configuração</button>{message && <p>{message}</p>}</section>;
  }
function FiscalPanel({ token }: { token: string }) {
  const [form, setForm] = useState({ companyName: "", companyNif: "", saftSchedule: "", privateKeyPem: "" }); const [message, setMessage] = useState("");
  useEffect(() => { void fetch(`${api()}/api/v1/fiscal/config`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json()).then((data) => setForm((current) => ({ ...current, companyName: data.companyName ?? "", companyNif: data.companyNif ?? "", saftSchedule: data.saftSchedule ?? "" }))).catch(() => setMessage("Não foi possível carregar a configuração.")); }, [token]);
  async function save() { const response = await fetch(`${api()}/api/v1/fiscal/config`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(form) }); setMessage(response.ok ? "Configuração fiscal guardada com segurança." : "Falha ao guardar configuração."); }
  return <section className="placeholder"><h2>Definições fiscais</h2><label>Nome da empresa<input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label><label>NIF<input value={form.companyNif} onChange={(e) => setForm({ ...form, companyNif: e.target.value })} /></label><label>Certificado PEM/PFX (conteúdo)<textarea value={form.privateKeyPem} onChange={(e) => setForm({ ...form, privateKeyPem: e.target.value })} /></label><label>Agendamento SAF-T<input placeholder="manual ou cron" value={form.saftSchedule} onChange={(e) => setForm({ ...form, saftSchedule: e.target.value })} /></label><button className="checkout" onClick={() => void save()}>Guardar configuração</button>{message && <p>{message}</p>}</section>;
}

function ServerConfigPanel({ firstRun = false, onSaved }: { firstRun?: boolean; onSaved?: () => void }) {
const [form, setForm] = useState<ServerConfig>(() => serverConfig() ?? { apiUrl: "", terminalId: "01" });
const [message, setMessage] = useState("");
const [testing, setTesting] = useState(false);
useEffect(() => {
  const bridge = posBridge();
  if (!bridge?.getServerConfig) return;
  void bridge.getServerConfig().then((config) => { if (config) { storeServerConfig(config); setForm(config); } }).catch(() => undefined);
}, []);
const test = async () => {
  setMessage(""); setTesting(true);
  try {
    if (!form.apiUrl.trim()) throw new Error("Introduza a URL da API.");
    const result = await posBridge()?.testServerConnection?.(form.apiUrl);
    setMessage(result?.message ?? "Não foi possível testar a ligação.");
  } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao testar a ligação."); }
  finally { setTesting(false); }
};
const save = async () => {
  setMessage("");
  try {
    if (!form.apiUrl.trim()) throw new Error("Introduza a URL da API.");
    const bridge = posBridge();
    const saved = bridge?.saveServerConfig ? await bridge.saveServerConfig(form) : form;
    storeServerConfig(saved);
    setForm(saved);
    setMessage("Configuração guardada neste utilizador. Reinicie o diagnóstico se necessário.");
    onSaved?.();
  } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível guardar a configuração."); }
};
return <section className={firstRun ? "login-card-inner" : "card form-grid"}><h2>{firstRun ? "Configurar servidor" : "Configuração do servidor"}</h2><p>{firstRun ? "Indique o backend do piloto antes de iniciar sessão." : "O URL e o terminal são guardados localmente neste computador, sem credenciais."}</p><label>URL da API<input type="url" value={form.apiUrl} onChange={(event) => setForm({ ...form, apiUrl: event.target.value })} placeholder="https://servidor.exemplo.ao ou http://localhost:4000" autoFocus={firstRun} /><small>HTTPS é obrigatório para servidores remotos. HTTP é aceite automaticamente apenas para localhost.</small></label><label>ID do terminal<input value={form.terminalId} onChange={(event) => setForm({ ...form, terminalId: event.target.value })} placeholder="caixa-01" /></label><div className="modal-actions"><button type="button" onClick={() => void test()} disabled={testing}>{testing ? "A testar…" : "Testar ligação"}</button><button type="button" className="checkout" onClick={() => void save()}>Guardar configuração</button></div>{message && <p className={message.includes("confirmada") || message.includes("guardada") ? "success" : "login-error"}>{message}</p>} {!firstRun && <p className="muted">Diagnóstico: URL configurada <strong>{form.apiUrl || "não configurada"}</strong>. O teste consulta <code>/health</code> sem enviar tokens.</p>}</section>;
}

function App({ onSwitchPortal }: { onSwitchPortal?: (portal: string) => void } = {}) {
  const storage = useMemo(() => createPosStorage(), []);
  const [productCatalog, setProductCatalog] = useState<Product[]>(() => isDemoMode() ? DEMO_PRODUCTS : []);
  const [view, setView] = useState<View>("license");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [discount, setDiscount] = useState(0);
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);
  const [modal, setModal] = useState<"payment" | "cancel" | "profile" | "settings-auth" | null>(null);
  const [completedSale, setCompletedSale] = useState<{ sale: Sale; hash: string; qr: string } | null>(null);
  const [documentType, setDocumentType] = useState<"INVOICE_RECEIPT" | "PROFORMA">("INVOICE_RECEIPT");
  const [company, setCompany] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("vendaja-local-company") ?? "null");
      if (saved?.name) {
        return {
          name: saved.name,
          tradeName: saved.tradeName || saved.name,
          nif: saved.nif || "—",
          address: saved.address || "Luanda, Angola",
          province: saved.province || "Luanda",
          phone: saved.phone || "—",
          email: saved.email || "",
          website: saved.website || "",
          logoUrl: saved.logoUrl || "",
          logoText: saved.logoText || "",
          footerText: saved.footerText || "",
          thanksMessage: saved.thanksMessage || "Obrigado pela sua preferência! Volte sempre.",
          signatureText: saved.signatureText || "",
        };
      }
    } catch { /* default */ }
    return {
      name: "Empresa Comercial, Lda.",
      tradeName: "Empresa Comercial",
      nif: "5000000000",
      address: "Luanda, Angola",
      province: "Luanda",
      phone: "+244 923 000 000",
      email: "comercial@empresa.ao",
      website: "",
      logoUrl: "",
      logoText: "",
      footerText: "",
      thanksMessage: "Obrigado pela sua preferência! Volte sempre.",
      signatureText: "",
    };
  });
  const terminalId = terminal();
  const [configVersion, setConfigVersion] = useState(0);
  const [invoiceQrImage, setInvoiceQrImage] = useState("");
  const [qrModal, setQrModal] = useState(false);
  const [qrPayload, setQrPayload] = useState("");
  const [qrResult, setQrResult] = useState<{ valid?: boolean; product?: string; document?: { number: string; totalCents: number; taxCents: number; hash: string; status: string } } | null>(null);
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>(readDeviceSettings);
  const qrVideo = useRef<HTMLVideoElement>(null);
  const qrReader = useRef<BrowserMultiFormatReader | null>(null);
  const qrControls = useRef<{ stop: () => void } | null>(null);
  const scannerBuffer = useRef("");
  const scannerTimer = useRef<number | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("vendaja-sidebar-collapsed") === "true");
  const [moduleSearch, setModuleSearch] = useState("");
  const [sessionLocked, setSessionLocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const lastActivityRef = useRef(Date.now());
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<Payment>({ method: "CASH", cashCents: 0, cardCents: 0, transferCents: 0, customerId: "", customerName: "", customerNif: "", dueDate: "" });
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem("posUser") ?? "null") as { id?: string; role: string; email: string; username?: string; displayName?: string; authMethod?: "password" | "pin" } | null; } catch { return null; } });
  const [profile, setProfile] = useState({ username: "", displayName: "", currentPassword: "", newPassword: "", currentPin: "", newPin: "" });
  const [profileMessage, setProfileMessage] = useState("");
  const [settingsUnlocked, setSettingsUnlocked] = useState(() => session?.role?.toUpperCase() === "ADMIN");
  const [settingsCredential, setSettingsCredential] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [lockedModuleModal, setLockedModuleModal] = useState<ModuleInfo | null>(null);
  const [licenseModules, setLicenseModules] = useState<AppModule[]>(["SETTINGS"]);
  const [pendingRestrictedView, setPendingRestrictedView] = useState<View | null>(null);
  const [outboxCount, setOutboxCount] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem("accessToken") ?? "";

  useEffect(() => {
    if (!session) return;
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const checkInactivity = () => {
      const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
      if (!sessionLocked && Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT) {
        setSessionLocked(true);
      }
    };
    window.addEventListener("mousemove", updateActivity);
    window.addEventListener("keydown", updateActivity);
    window.addEventListener("click", updateActivity);
    window.addEventListener("touchstart", updateActivity);
    const interval = window.setInterval(checkInactivity, 30000);
    return () => {
      window.removeEventListener("mousemove", updateActivity);
      window.removeEventListener("keydown", updateActivity);
      window.removeEventListener("click", updateActivity);
      window.removeEventListener("touchstart", updateActivity);
      window.clearInterval(interval);
    };
  }, [session, sessionLocked]);

  async function unlockSession() {
    setUnlockError("");
    if (!unlockPin.trim()) {
      setUnlockError("Introduza o PIN ou palavra-passe para desbloquear.");
      return;
    }
    try {
      const mode = /^\d{4,6}$/.test(unlockPin.trim()) ? "pin" : "password";
      if (token === "offline-local-session") {
        await offlineLogin(session?.username ?? "admin", unlockPin.trim(), mode);
      } else {
        const response = await fetch(`${api()}/api/v1/auth/verify-admin-pin`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ credential: unlockPin.trim(), mode }),
        });
        if (!response.ok) throw new Error("Credencial incorreta.");
      }
      setSessionLocked(false);
      setUnlockPin("");
      lastActivityRef.current = Date.now();
    } catch {
      setUnlockError("PIN ou palavra-passe incorreta.");
    }
  }

  useEffect(() => {
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<{ online: boolean }>).detail;
      if (typeof detail?.online === "boolean") {
        setOnline(detail.online);
      }
    };
    window.addEventListener("backend-status", onStatus);
    return () => window.removeEventListener("backend-status", onStatus);
  }, []);
  useEffect(() => {
    let active = true;

    if (window.pos?.getLicenseStatus) {
      void window.pos.getLicenseStatus().then((status) => {
        if (!active) return;
        setLicenseStatus(status);
        if (status?.valid) {
          const raw = status.modules ?? [];
          const normalized: AppModule[] = Array.from(new Set<AppModule>([...(Array.isArray(raw) ? raw : []).map((mod: string) => normalizeModuleCode(mod)).filter((m: AppModule | null): m is AppModule => m !== null), "SETTINGS"]));
          setLicenseModules(normalized);
          if (normalized.includes("POS")) setView("pdv");
          else setView("license");
        } else {
          setLicenseModules(["SETTINGS"]);
          setView("license");
        }
      }).catch(() => undefined);
      return () => { active = false; };
    }

    // Web Cloud: Query backend for authoritative cryptographic license status
    if (token) {
      void fetch(`${api()}/api/v1/license/status`, {
        headers: { authorization: `Bearer ${token}` },
      }).then(async (r) => {
        if (!active) return;
        if (r.ok) {
          const status = await r.json();
          setLicenseStatus(status);
          if (status?.valid) {
            const raw = status.modules ?? [];
            const normalized: AppModule[] = Array.from(new Set<AppModule>([...(Array.isArray(raw) ? raw : []).map((mod: string) => normalizeModuleCode(mod)).filter((m: AppModule | null): m is AppModule => m !== null), "SETTINGS"]));
            setLicenseModules(normalized);
            if (normalized.includes("POS")) setView("pdv");
            else setView("license");
            return;
          }
        }
        setLicenseModules(["SETTINGS"]);
        setView("license");
      }).catch(() => {
        if (active) {
          setLicenseModules(["SETTINGS"]);
          setView("license");
        }
      });
    } else {
      setLicenseModules(["SETTINGS"]);
      setView("license");
    }

    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    const refreshLicense = (event: Event) => {
      const detail = (event as CustomEvent<LicenseStatus>).detail;
      if (detail) {
        setLicenseStatus(detail);
        if (detail.valid) {
          const raw = detail.modules ?? [];
          const normalized: AppModule[] = Array.from(new Set<AppModule>([...raw.map((m: string) => normalizeModuleCode(m)).filter((m): m is AppModule => m !== null), "SETTINGS"]));
          setLicenseModules(normalized);
        } else {
          setLicenseModules(["SETTINGS"]);
        }
      }
    };
    window.addEventListener("license-updated", refreshLicense);
    return () => window.removeEventListener("license-updated", refreshLicense);
  }, []);
  const lines = productCatalog.filter((p) => cart[p.id]).map((product) => ({ product, quantity: cart[product.id] ?? 0 }));
  const grossTotal = lines.reduce((sum, line) => sum + line.product.priceCents * line.quantity, 0);
  const discountCents = Math.min(grossTotal, discount);
  const total = Math.max(0, grossTotal - discountCents);
  // In retail POS (PVP), product.priceCents is tax-inclusive. Extract base (subtotal) and tax (IVA):
  const tax = lines.reduce((sum, line) => {
    const lineGross = line.product.priceCents * line.quantity;
    if (line.product.taxRate > 0) {
      const lineBase = Math.round(lineGross / (1 + line.product.taxRate));
      return sum + (lineGross - lineBase);
    }
    return sum;
  }, 0);
  const subtotal = Math.max(0, total - tax);
  const engine = useMemo(() => new SyncEngine(storage, { apiUrl: api(), token, deviceId: localStorage.getItem("deviceId") ?? id(), onState: setOnline }), [storage, token, configVersion]);
  const visible = productCatalog.filter((p) => { const term = query.toLowerCase().trim(); return (!term || [p.name, p.sku, p.barcode, p.brand, p.model].some(value => value?.toLowerCase().includes(term))) && (category === "Todos" || String(p.taxRate) === category); });
  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetch(`${api()}/api/v1/products`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`products:${response.status}`);
        return response.json() as Promise<Product[]>;
      })
      .then((loaded) => {
        if (active && Array.isArray(loaded)) setProductCatalog(loaded);
      })
      .catch((reason) => console.warn("Não foi possível carregar produtos da API; usando catálogo local.", reason));
    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    if (!token || token === "offline-local-session") return;
    void fetch(`${api()}/api/v1/customers`, { headers: { authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() as Promise<CustomerOption[]> : Promise.reject(new Error("customers_unavailable")))
      .then((loaded) => setCustomers(loaded.filter((customer) => customer.active)))
      .catch(() => undefined);
  }, [token]);
  useEffect(() => { const refresh = () => void fetch(`${api()}/api/v1/products`, { headers: { authorization: "Bearer " + token } }).then((r) => r.ok ? r.json() as Promise<Product[]> : Promise.reject(new Error("catalog refresh failed"))).then((loaded) => { if (Array.isArray(loaded)) { setProductCatalog(loaded); localStorage.setItem("vendaja-local-products", JSON.stringify(loaded)); } }).catch(() => { try { const loaded = JSON.parse(localStorage.getItem("vendaja-local-products") ?? "[]"); if (Array.isArray(loaded) && loaded.length) setProductCatalog(loaded); } catch { /* keep current catalog */ } }); window.addEventListener("catalog-updated", refresh); return () => window.removeEventListener("catalog-updated", refresh); }, [token]);
  useEffect(() => {
    if (!token) return;
    void fetch(`${api()}/api/v1/fiscal/config`, { headers: { authorization: "Bearer " + token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.companyName) {
          setCompany((prev) => ({
            ...prev,
            name: data.companyName,
            tradeName: data.tradeName || data.companyName,
            nif: data.companyNif || prev.nif,
            address: data.companyAddress || prev.address,
            province: data.companyProvince || prev.province,
            phone: data.companyPhone || prev.phone,
            email: data.companyEmail || prev.email,
            website: data.companyWebsite || prev.website,
            logoUrl: data.logoUrl || prev.logoUrl,
            footerText: data.footerText || prev.footerText,
            thanksMessage: data.thanksMessage || prev.thanksMessage,
          }));
        }
      })
      .catch(() => undefined);
  }, [token]);
  useEffect(() => {
    const refreshCompany = () => {
      try {
        const saved = JSON.parse(localStorage.getItem("vendaja-local-company") ?? "null");
        if (saved?.name) {
          setCompany({
            name: saved.name,
            tradeName: saved.tradeName || saved.name,
            nif: saved.nif || "—",
            address: saved.address || "Luanda, Angola",
            province: saved.province || "Luanda",
            phone: saved.phone || "—",
            email: saved.email || "",
            website: saved.website || "",
            logoUrl: saved.logoUrl || "",
            logoText: saved.logoText || "",
            footerText: saved.footerText || "",
            thanksMessage: saved.thanksMessage || "Obrigado pela sua preferência! Volte sempre.",
            signatureText: saved.signatureText || "",
          });
        }
      } catch { /* keep current */ }
    };
    window.addEventListener("company-updated", refreshCompany);
    return () => window.removeEventListener("company-updated", refreshCompany);
  }, []);
  useEffect(() => { if (!completedSale) return; const handler = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key.toLowerCase() === "p") { event.preventDefault(); window.print(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [completedSale]);
  useEffect(() => { if (!completedSale) { setInvoiceQrImage(""); return; } void QRCode.toDataURL(completedSale.qr, { margin: 1, width: 150 }).then(setInvoiceQrImage).catch(() => setInvoiceQrImage("")); }, [completedSale]);
  useEffect(() => {
    let active = true;
    const checkBackend = async () => {
      try {
        const res = await fetch(`${api()}/health`, { method: "GET" });
        if (active) {
          const isOk = res.ok;
          setOnline((prev) => {
            if (!prev && isOk) {
              console.info("[network] backend reconnected");
              window.dispatchEvent(new CustomEvent("backend-reconnected"));
              setError((msg) => msg.includes("Backend indisponível") ? "" : msg);
            }
            return isOk;
          });
        }
      } catch {
        if (active) setOnline(false);
      }
    };
    void checkBackend();
    const interval = window.setInterval(checkBackend, 10000);
    const onNetChange = () => {
      if (navigator.onLine) void checkBackend();
      else setOnline(false);
    };
    window.addEventListener("online", onNetChange);
    window.addEventListener("offline", onNetChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", onNetChange);
      window.removeEventListener("offline", onNetChange);
    };
  }, []);
  useEffect(() => { let active = true; const refresh = () => void storage.getOutbox().then((items) => { if (active) setOutboxCount(items.length); }); refresh(); const timer = window.setInterval(refresh, 5000); return () => { active = false; window.clearInterval(timer); }; }, [storage]);
  useEffect(() => { const refresh = () => setConfigVersion((value) => value + 1); window.addEventListener("server-config-updated", refresh); return () => window.removeEventListener("server-config-updated", refresh); }, []);
  useEffect(() => { const deviceId = localStorage.getItem("deviceId") ?? id(); localStorage.setItem("deviceId", deviceId); engine.start(); return () => engine.stop(); }, [engine]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault();
        search.current?.focus();
      }
      if (event.key === "F2" && view === "pdv" && Object.keys(cart).length > 0 && !modal) {
        event.preventDefault();
        openPaymentModal();
      }
      if (event.key === "Escape" && !modal) setError("");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal, view, cart, total]);
  useEffect(() => {
    const handleScannerKey = (event: KeyboardEvent) => {
      if (deviceSettings.source !== "hid" || modal || view !== "pdv") return;
      if (event.key === "Enter") {
        const scanned = scannerBuffer.current;
        scannerBuffer.current = "";
        if (scanned) {
          event.preventDefault();
          const code = parseProductCode(scanned)[0] ?? "";
          const product = productCatalog.find((item) => [item.id, item.sku, item.barcode, item.qrCode].filter(Boolean).some((value) => value!.toLowerCase() === code));
          if (product) { add(product); playScanTone(true); setError(`Produto adicionado: ${product.name}`); }
          else { playScanTone(false); setError("Produto não encontrado no catálogo local"); }
        }
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        scannerBuffer.current += event.key;
        window.clearTimeout(scannerTimer.current);
        scannerTimer.current = window.setTimeout(() => { scannerBuffer.current = ""; }, 120);
      }
    };
    window.addEventListener("keydown", handleScannerKey);
    return () => { window.removeEventListener("keydown", handleScannerKey); window.clearTimeout(scannerTimer.current); };
  }, [deviceSettings.source, modal, view, productCatalog]);
  if (!token || !session) return <Login onLogin={(accessToken, refreshToken, user) => { localStorage.setItem("accessToken", accessToken); localStorage.setItem("refreshToken", refreshToken); localStorage.setItem("posUser", JSON.stringify(user)); setSession(user); }} />;
  const openSettings = () => {
    if (normalizeRole(session.role) === "ROLE_ADMIN" || settingsUnlocked) { setView("fiscal"); return; }
    setPendingRestrictedView("fiscal");
    setSettingsCredential(""); setSettingsMessage(""); setModal("settings-auth");
  };
  const openRestrictedModule = (nextView: View, module: AppModule) => {
    const isLicensedMod = module === "SETTINGS" || licenseModules.includes(module);
    if (!isLicensedMod) {
      void window.pos?.logLicenseAudit?.("MODULE_BLOCKED_ATTEMPT", `Tentativa de acesso ao módulo bloqueado: ${module} (${nextView})`);
      const info = MODULE_CATALOG.find((m) => m.code === module) || {
        code: module,
        name: nextView,
        category: "Módulo",
        icon: "🔒",
        description: "Este módulo não está incluído na licença atual. Contacte o fornecedor para adquirir acesso.",
        minimumPlan: "ENTERPRISE",
      };
      setLockedModuleModal(info);
      return;
    }
    const role = normalizeRole(session.role);
    const isAdmin = role === "ROLE_ADMIN";
    if (isAdmin || roleModules[role]?.includes(module)) { setView(nextView); return; }
    setPendingRestrictedView(nextView); setSettingsCredential(""); setSettingsMessage("Acesso restrito. Autorize com a credencial mestre do Administrador."); setModal("settings-auth");
  };
  const authorizeSettings = async () => {
    const credential = settingsCredential.trim();
    if (!credential) { setSettingsMessage("Introduza a senha ou PIN do Administrador."); return; }
    try {
      if (token === "offline-local-session") {
        await offlineLogin("admin", credential, /^\d{6}$/.test(credential) ? "pin" : "password");
      } else {
        const response = await fetch(`${api()}/api/v1/auth/verify-admin-pin`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ credential, mode: /^\d{6}$/.test(credential) ? "pin" : "password" }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message ?? "Credenciais do Administrador inválidas.");
      }
      setSettingsUnlocked(true); setModal(null); setView(pendingRestrictedView ?? "fiscal"); setPendingRestrictedView(null);
    } catch (reason) { setSettingsMessage(reason instanceof Error ? reason.message : "Não foi possível autorizar as Definições."); }
  };
  const add = (product: Product) => setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
  const update = (product: Product, quantity: number) => setCart((current) => ({ ...current, [product.id]: Math.max(0, quantity) }));

  const openPaymentModal = () => {
    setPaymentError("");
    setPayment((p) => ({
      ...p,
      cashCents: p.method === "CASH" ? (p.cashCents > 0 ? p.cashCents : total) : 0,
      cardCents: p.method === "CARD" ? total : 0,
      transferCents: p.method === "TRANSFER" ? total : 0,
    }));
    setModal("payment");
  };

  const openCancelModal = () => {
    setCancelError("");
    setPin("");
    setModal("cancel");
  };

  async function confirmPayment() {
    setPaymentError("");
    const isProforma = documentType === "PROFORMA";
    const method = isProforma ? "CASH" : payment.method;

    if (method === "CREDIT" && (!payment.customerId || !payment.dueDate)) {
      setPaymentError("Selecione um cliente e uma data de vencimento para vender a crédito.");
      return;
    }

    const paid = method === "CASH"
      ? payment.cashCents
      : method === "CARD"
      ? (payment.cardCents || total)
      : method === "TRANSFER"
      ? (payment.transferCents || total)
      : method === "CREDIT"
      ? total
      : (payment.cashCents + payment.cardCents + payment.transferCents);

    if (method !== "CREDIT" && !isProforma && paid < total) {
      setPaymentError("O valor recebido é inferior ao total da venda.");
      return;
    }

    const tenderedCents = isProforma || method === "CREDIT"
      ? 0
      : method === "CASH"
      ? payment.cashCents
      : method === "CARD"
      ? (payment.cardCents || total)
      : method === "TRANSFER"
      ? (payment.transferCents || total)
      : (payment.cashCents + payment.cardCents + payment.transferCents);

    const changeCents = (!isProforma && (method === "CASH" || method === "MIXED"))
      ? Math.max(0, paid - total)
      : 0;

    let cashSessionId: string | null = null;
    try {
      const response = await fetch(`${api()}/api/v1/fiscal/cash/current`, { headers: { authorization: "Bearer " + token } });
      if (response.ok) cashSessionId = ((await response.json()) as { id?: string } | null)?.id ?? null;
    } catch {
      /* offline sale */
    }
    cashSessionId = cashSessionId ?? localStorage.getItem("activeCashSessionId");
    const saleNumber = `${documentType === "PROFORMA" ? "PROFORMA" : "FR"}-PDV-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
    const sale: Sale = {
      id: id(),
      number: saleNumber,
      lines: lines.map(({ product, quantity }) => ({ productId: product.id, quantity, unitPriceCents: product.priceCents, taxRate: product.taxRate })),
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
      currency: "AOA",
      createdAt: new Date().toISOString(),
      discountCents,
      paymentMethod: isProforma ? undefined : method,
      cashCents: isProforma || method === "CREDIT" ? 0 : method === "CASH" ? payment.cashCents : method === "MIXED" ? payment.cashCents : 0,
      cardCents: isProforma || method === "CREDIT" ? 0 : method === "CARD" ? (payment.cardCents || total) : method === "MIXED" ? payment.cardCents : 0,
      transferCents: isProforma || method === "CREDIT" ? 0 : method === "TRANSFER" ? (payment.transferCents || total) : method === "MIXED" ? payment.transferCents : 0,
      tenderedCents,
      changeCents,
      cashSessionId: isProforma || method === "CREDIT" ? null : cashSessionId,
      customerId: payment.customerId || null,
      dueDate: method === "CREDIT" ? new Date(payment.dueDate).toISOString() : null,
      customerName: payment.customerName || undefined,
      customerNif: payment.customerNif || undefined,
      fiscalType: documentType,
      operatorName: localStorage.getItem("cashOperatorName") || session?.displayName,
      terminalId: localStorage.getItem("terminalId") || terminalId,
      operatorNif: localStorage.getItem("cashOperatorNif") ?? undefined,
      operatorPhone: localStorage.getItem("cashOperatorPhone") ?? undefined,
    };
    const hash = fiscalHash(sale);
    const qrPayload = fiscalQrPayload(sale, hash);
    try {
      if (documentType !== "PROFORMA") {
        try {
          await storage.saveSaleAndEnqueue(sale, { id: id(), operation: "CREATE", entity: "SALE", payload: { ...sale, fiscalHash: hash, qr: qrPayload }, occurredAt: sale.createdAt });
        } catch (storageErr) {
          console.error("[storage] Erro na gravação atómica da venda / outbox:", storageErr);
          const rawMsg = storageErr instanceof Error ? storageErr.message : String(storageErr);
          if (rawMsg.toLowerCase().includes("version") || rawMsg.includes("VersionError")) {
            setPaymentError("A base de dados local foi sincronizada para uma nova versão. Por favor, clique novamente em Confirmar.");
          } else if (rawMsg.toLowerCase().includes("quota")) {
            setPaymentError("Espaço de armazenamento esgotado no dispositivo. Liberte espaço em disco para concluir a venda.");
          } else {
            setPaymentError(`Falha no armazenamento local da venda: ${rawMsg}. O carrinho foi mantido.`);
          }
          return;
        }
      }
      const printer = (window as unknown as { pos?: { printReceipt?: (data: Uint8Array) => Promise<void> } }).pos?.printReceipt;
      if (printer) {
        await printer(escPosReceipt(sale, {
          company: { name: company.name, nif: company.nif, address: `${company.address} · ${company.province}`, phone: company.phone },
          catalog: productCatalog,
          fiscalHash: hash,
          qrPayload: documentType === "PROFORMA" ? undefined : qrPayload,
        })).catch((err) => console.warn("[printer] Talão não impresso:", err));
      }
      setCompletedSale({ sale, hash, qr: qrPayload });
      setCart({});
      setDiscount(0);
      setModal(null);
      setPayment({ method: "CASH", cashCents: 0, cardCents: 0, transferCents: 0, customerId: "", customerName: "", customerNif: "", dueDate: "" });
      window.dispatchEvent(new CustomEvent("cash-updated"));
      window.dispatchEvent(new CustomEvent("sale-completed", { detail: sale }));
      window.dispatchEvent(new CustomEvent("dashboard-updated"));
      void storage.getOutbox().then((items) => setOutboxCount(items.length)).catch(() => undefined);
      if (documentType !== "PROFORMA" && !online) {
        setError("Venda guardada localmente. Será sincronizada quando voltar a estar online.");
      } else if (documentType !== "PROFORMA") {
        void engine.flush();
      }
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Não foi possível guardar a venda.");
    }
  }

  async function cancelSale() {
    setCancelError("");
    try {
      const isAdmin = normalizeRole(session?.role ?? "") === "ROLE_ADMIN";
      if (isAdmin && !pin.trim()) {
        setCart({});
        setDiscount(0);
        setModal(null);
        setPin("");
        setCancelError("");
        setPayment({ method: "CASH", cashCents: 0, cardCents: 0, transferCents: 0, customerId: "", customerName: "", customerNif: "", dueDate: "" });
        return;
      }
      if (!pin.trim()) {
        setCancelError("Introduza o PIN ou password de administrador.");
        return;
      }
      const mode = /^\d{6}$/.test(pin) ? "pin" : "password";
      let authorized = false;
      if (online && token && token !== "offline-local-session") {
        try {
          const response = await fetch(`${api()}/api/v1/auth/authorize`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer " + token },
            body: JSON.stringify({ credential: pin, mode, action: "SALE_CANCELLED" }),
          });
          if (response.ok) authorized = true;
          else {
            const result = await response.json().catch(() => ({})) as { error?: string; stage?: string; details?: string };
            console.warn("[cancelSale] remote auth failed:", result);
          }
        } catch {
          /* try local validation */
        }
      }
      if (!authorized) {
        const auth = await getLocalAuth();
        const pinHash = await credentialHash(pin);
        const matchesCredential = pinHash === auth.pinHash || pinHash === auth.passwordHash;
        if (!matchesCredential) throw new Error("PIN ou credenciais de administrador incorretos.");
        authorized = true;
      }
      setCart({});
      setDiscount(0);
      setModal(null);
      setPin("");
      setCancelError("");
      setPayment({ method: "CASH", cashCents: 0, cardCents: 0, transferCents: 0, customerId: "", customerName: "", customerNif: "", dueDate: "" });
    } catch (reason) {
      setCancelError(reason instanceof Error ? reason.message : "Não foi possível autorizar o cancelamento.");
    }
  }
  async function handleProductScan(rawValue: string): Promise<void> {
    const value = rawValue.trim();
    setQrPayload(value);
    const codes = parseProductCode(value);
    const product = productCatalog.find((item) => [item.id, item.sku, item.barcode, item.qrCode].filter(Boolean).some((candidate) => codes.includes(candidate!.toLowerCase())));
    if (product) {
      add(product);
      playScanTone(true);
      setQrResult({ valid: true, product: product.name });
      setError(`Produto adicionado: ${product.name}`);
      qrControls.current?.stop();
      setQrModal(false);
      return;
    }
    if (value.startsWith("AO|")) {
      if (online && token && token !== "offline-local-session") {
        try {
          const response = await fetch(`${api()}/api/v1/fiscal/qr/validate`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ payload: value }) });
          const result = await response.json();
          if (!response.ok) throw new Error("QR fiscal inválido.");
          setQrResult(result);
          setError("");
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Falha na validação do QR fiscal.");
        }
      } else {
        setError("QR fiscal detetado. Ligue o backend para validar a assinatura do documento.");
      }
    } else {
      playScanTone(false);
      setError("Produto não encontrado no catálogo local");
    }
  }
  async function startQrCamera() {
    try {
      qrControls.current?.stop();
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.UPC_A,
        BarcodeFormat.QR_CODE,
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      qrReader.current = reader;
      const video: MediaTrackConstraints & { advanced?: Array<{ focusMode?: string }> } = {
        facingMode: "environment",
        width: { ideal: Math.max(1280, deviceSettings.width) },
        height: { ideal: Math.max(720, deviceSettings.height) },
        aspectRatio: { ideal: 16 / 9 },
        advanced: deviceSettings.continuousFocus ? [{ focusMode: "continuous" }] : [],
      };
      if (deviceSettings.deviceId) video.deviceId = { exact: deviceSettings.deviceId };
      qrControls.current = await reader.decodeFromConstraints({ video }, qrVideo.current!, (result) => {
        if (result) void handleProductScan(result.getText());
      });
    } catch { setError("Não foi possível aceder à câmara. Use um scanner ou cole o código."); }
  }
  const taxLines = completedSale ? completedSale.sale.lines.map((line) => ({ product: productCatalog.find((item) => item.id === line.productId), quantity: line.quantity, unitPriceCents: line.unitPriceCents, taxRate: line.taxRate })).filter((line) => line.product) : lines.map(({ product, quantity }) => ({ product, quantity, unitPriceCents: product.priceCents, taxRate: product.taxRate }));
  const taxSummary = [0, 0.05, 0.14].map((rate) => {
    const matching = taxLines.filter((line) => Math.round(Number(line.taxRate) * 100) === Math.round(rate * 100));
    const baseCents = matching.reduce((sum, { quantity, unitPriceCents }) => sum + unitPriceCents * quantity, 0);
    return { rate, baseCents, taxCents: Math.round(baseCents * rate) };
  });
  async function saveProfile() {
    setError("");
    setProfileMessage("");
    if (!session) { setError("A sessão expirou. Entre novamente."); return; }
    const usingPin = session.authMethod === "pin";
    if (usingPin ? !profile.currentPin : !profile.currentPassword) { setError(usingPin ? "Introduza o PIN atual." : "Introduza a password atual."); return; }
    if (profile.newPassword && profile.newPassword.length < 8) { setError("A nova password deve ter pelo menos 8 caracteres."); return; }
    if (profile.newPin && !/^\d{6}$/.test(profile.newPin)) { setError("O novo PIN deve conter exatamente 6 dígitos."); return; }
    if (!profile.newPassword && !profile.newPin) { setError("Introduza uma nova password ou um novo PIN."); return; }
    try {
      let updatedRemotely = false;
      try {
      const response = await fetch(`${api()}/api/v1/auth/profile`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ username: profile.username, displayName: profile.displayName, currentPassword: usingPin ? undefined : profile.currentPassword || undefined, currentPin: usingPin ? profile.currentPin : undefined, newPassword: profile.newPassword || undefined, newPin: profile.newPin || undefined }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        const messages: Record<string, string> = { invalid_password: "A password atual está incorreta.", invalid_pin: "O PIN atual está incorreto.", invalid_profile: "Preencha username, nome e password corretamente.", invalid_token: "A sessão expirou. Entre novamente.", no_changes: "Introduza uma nova password ou um novo PIN." };
        throw new Error(messages[result.error ?? ""] ?? `Não foi possível guardar o perfil (${response.status}).`);
      }
      updatedRemotely = true;
      } catch (reason) {
        if (updatedRemotely || (reason instanceof Error && !["Failed to fetch", "NetworkError", "Load failed"].includes(reason.message))) throw reason;
        const auth = await getLocalAuth();
        const supplied = await credentialHash(usingPin ? profile.currentPin : profile.currentPassword);
        if (supplied !== (usingPin ? auth.pinHash : auth.passwordHash)) throw new Error(usingPin ? "O PIN atual está incorreto." : "A password atual está incorreta.");
      }
      if (profile.newPassword) await saveLocalCredential("password", profile.newPassword);
      if (profile.newPin) await saveLocalCredential("pin", profile.newPin);
      const nextSession = { ...session, username: profile.username || session.username, displayName: profile.displayName || session.displayName };
      localStorage.setItem("posUser", JSON.stringify(nextSession));
      setSession(nextSession);
      setProfile((p) => ({ ...p, currentPassword: "", currentPin: "", newPassword: "", newPin: "" }));
      setProfileMessage(profile.newPin ? "PIN e perfil atualizados com sucesso." : "Password e perfil atualizados com sucesso.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erro ao guardar o perfil."); }
  }

  type NavCategory =
    | "Administração & Sede"
    | "Inteligência Artificial"
    | "Segurança & Acessos"
| "Dashboard"
    | "Vendas & POS"
    | "Stocks & Armazém"
    | "Compras"
    | "Financeiro"
    | "Recursos Humanos"
    | "Relatórios"
    | "Configuração";

  const navItems: Array<{
    key: View;
    label: string;
    category: NavCategory;
    icon: string;
    module: AppModule;
    requiresAdmin?: boolean;
  }> = [
    { key: "corporate", label: "Centro Corporativo (Sede)", category: "Administração & Sede", icon: "🏢", module: "CORPORATE", requiresAdmin: true },
    { key: "copilot", label: "VendaJá Copilot (IA)", category: "Inteligência Artificial", icon: "🤖", module: "AI" },
    { key: "biometrics", label: "Biometria & Acessos", category: "Segurança & Acessos", icon: "👁️", module: "BIOMETRICS", requiresAdmin: true },
    { key: "dashboard", label: "Dashboard Executivo", category: "Dashboard", icon: "📊", module: "DASHBOARD" },
    { key: "pdv", label: "Balcão POS", category: "Vendas & POS", icon: "🛒", module: "POS" },
    { key: "crm", label: "CRM & Pipeline", category: "Vendas & POS", icon: "🎯", module: "CRM" },
    { key: "cash", label: "Caixa & Turnos", category: "Vendas & POS", icon: "💵", module: "POS" },
    { key: "products", label: "Catálogo & Preços", category: "Stocks & Armazém", icon: "📦", module: "STOCK" },
    { key: "stock-documents", label: "Inventário & Guias", category: "Stocks & Armazém", icon: "📋", module: "STOCK" },
    { key: "operations", label: "Fornecedores & Compras", category: "Compras", icon: "🚚", module: "PURCHASES" },
    { key: "cashflow", label: "Fluxo de Caixa", category: "Financeiro", icon: "💰", module: "TREASURY" },
    { key: "financial", label: "Finanças e Tesouraria Enterprise", category: "Financeiro", icon: "🏛️", module: "TREASURY", requiresAdmin: true },
    { key: "accounting", label: "Contabilidade (PGCA)", category: "Financeiro", icon: "📑", module: "ACCOUNTING" },
    { key: "hr", label: "Recursos Humanos", category: "Recursos Humanos", icon: "👥", module: "HR" },
    { key: "reports", label: "Relatórios & SAF-T", category: "Relatórios", icon: "📜", module: "REPORTS" },
    { key: "bi", label: "Business Intelligence & BI", category: "Relatórios", icon: "📊", module: "BI", requiresAdmin: true },
    { key: "license", label: "Licenciamento & DRM", category: "Configuração", icon: "🔑", module: "SETTINGS" },
    { key: "devices", label: "Hardware & Periféricos", category: "Configuração", icon: "🖨️", module: "SETTINGS" },
    { key: "platform", label: "Empresa & Terminais", category: "Configuração", icon: "🏢", module: "SETTINGS", requiresAdmin: true },
    { key: "fiscal", label: "Definições Fiscais AGT", category: "Configuração", icon: "⚙️", module: "SETTINGS" },
    { key: "governance", label: "Segurança & Governança", category: "Configuração", icon: "🛡️", module: "GOVERNANCE", requiresAdmin: true },
    { key: "automation", label: "Workflows & Automação", category: "Configuração", icon: "⚡", module: "AUTOMATION", requiresAdmin: true },
    { key: "documents", label: "Gestão Documental (GED)", category: "Configuração", icon: "📁", module: "DOCUMENTS", requiresAdmin: true },
    { key: "integrations", label: "Integrações & API", category: "Configuração", icon: "🔌", module: "INTEGRATIONS", requiresAdmin: true },
    { key: "cloud", label: "Cloud SaaS & Multi-Lojas", category: "Configuração", icon: "☁️", module: "CLOUD", requiresAdmin: true },
    { key: "logs", label: "Diagnóstico & Logs", category: "Configuração", icon: "🩺", module: "SETTINGS", requiresAdmin: true },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.key === "fiscal" || item.key === "license" || item.key === "devices" || item.key === "logs") return true;
    const role = normalizeRole(session.role);
    const isAdmin = role === "ROLE_ADMIN";
    const matchesSearch = !moduleSearch.trim() ||
      item.label.toLowerCase().includes(moduleSearch.toLowerCase()) ||
      item.category.toLowerCase().includes(moduleSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (item.requiresAdmin && !isAdmin) return false;
    return isAdmin || (roleModules[role]?.includes(item.module) ?? false);
  });

  const categories = Array.from(new Set(visibleNavItems.map((item) => item.category)));

  return <div className={`erp-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className="erp-sidebar" aria-label="Navegação lateral do ERP">
      <div className="erp-sidebar-top">
        <div className="erp-sidebar-brand">
          <div className="erp-logo-mark">V<span>J</span></div>
          {!sidebarCollapsed && (
            <div className="erp-sidebar-branding">
              <h2>VendaJá <span>Angola</span></h2>
              <span className="erp-badge">v2.2.4</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={() => {
            const next = !sidebarCollapsed;
            setSidebarCollapsed(next);
            localStorage.setItem("vendaja-sidebar-collapsed", String(next));
          }}
          title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        >
          {sidebarCollapsed ? "▶" : "◀"}
        </button>
      </div>

      {!sidebarCollapsed && (
        <div className="erp-sidebar-search">
          <input
            type="search"
            value={moduleSearch}
            onChange={(e) => setModuleSearch(e.target.value)}
            placeholder="Pesquisar módulo..."
            aria-label="Filtrar módulos do ERP"
          />
        </div>
      )}

      <nav className="erp-sidebar-nav" aria-label="Módulos ERP">
        {categories.map((cat) => (
          <div key={cat} className="erp-nav-group">
            {!sidebarCollapsed && <div className="erp-nav-group-header">{cat}</div>}
            {visibleNavItems.filter((item) => item.category === cat).map((item) => {
              const isModLicensed = item.module === "SETTINGS" || licenseModules.includes(item.module);
              return (
                <button
                  key={item.key}
                  className={`erp-nav-item ${view === item.key ? "active" : ""} ${isModLicensed ? "" : "locked"}`}
                  onClick={() => {
                    if (!isModLicensed) {
                      void window.pos?.logLicenseAudit?.("MODULE_BLOCKED_ATTEMPT", `Tentativa de acesso ao módulo bloqueado: ${item.module} (${item.key})`);
                      const info = MODULE_CATALOG.find((m) => m.code === item.module) || {
                        code: item.module,
                        name: item.label,
                        category: item.category,
                        icon: item.icon,
                        description: "Este módulo não está incluído na licença atual. Contacte o fornecedor para adquirir acesso.",
                        minimumPlan: "ENTERPRISE",
                      };
                      setLockedModuleModal(info);
                      return;
                    }
                    if (item.key === "fiscal") openSettings();
                    else openRestrictedModule(item.key, item.module);
                  }}
                  title={`${item.category}: ${item.label} ${isModLicensed ? "" : "(Bloqueado - Requer Licença)"}`}
                >
                  <span className="erp-nav-icon">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="erp-nav-text">
                      <span className="erp-nav-label">{item.label}</span>
                      {!isModLicensed && <span className="erp-nav-lock" title="Módulo bloqueado na licença atual">🔒</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {!sidebarCollapsed && (
        <div className="erp-sidebar-footer">
          <div className="erp-sidebar-company">
            <strong>🏢 {company.name}</strong>
            <small>NIF: {company.nif}</small>
          </div>
          <div className={`erp-conn-status ${online ? "online" : "offline"}`}>
            <span className="dot" />
            <span>{online ? "Conectado ao Backend" : "Modo Offline (Local)"}</span>
          </div>
        </div>
      )}
    </aside>

    <div className="erp-content">
      <LicenseWarningBanner
        licenseStatus={licenseStatus}
        onOpenLicensing={() => setView("license")}
      />
      <header className="erp-header">
        <div className="erp-header-left">
          <div className="erp-active-view-meta">
            <span className="erp-view-category">{navItems.find((i) => i.key === view)?.category}</span>
            <h1 className="erp-view-title">{navItems.find((i) => i.key === view)?.label}</h1>
          </div>
          <div className="erp-company-meta">
            <span>Terminal: <b>{terminalId}</b></span>
            <span className={`status ${online ? "online" : ""}`}>● {online ? "Online" : "Offline (Local)"}</span>
          </div>
        </div>
        <div className="user-actions">
          <span className="outbox-pill">Outbox: {outboxCount} · {online ? "Sincronizado" : "Pendente"}</span>
          <span className="role-pill">{normalizeRole(session.role).replace("ROLE_", "")}</span>
          <button className="icon-button" aria-label="Abrir perfil" onClick={() => {
            setProfile({ username: session.username ?? "", displayName: session.displayName ?? "", currentPassword: "", newPassword: "", currentPin: "", newPin: "" });
            setProfileMessage(""); setError(""); setModal("profile");
          }}>👤 {session.displayName ?? session.email}</button>
          <button className="logout-button" onClick={() => { localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); localStorage.removeItem("posUser"); setSession(null); }}>Sair</button>
          <kbd>F1 pesquisar · F2 receber</kbd>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}<button aria-label="Fechar erro" onClick={() => setError("")}>×</button></div>}

      <main className="erp-body">
        {(() => {
          const requiredModule = VIEW_MODULE_MAP[view] || "SETTINGS";
          const isViewLicensed = requiredModule === "SETTINGS" || licenseModules.includes(requiredModule);
          if (!isViewLicensed) {
            return (
              <LockedModuleView
                module={requiredModule}
                viewName={navItems.find((i) => i.key === view)?.label}
                onOpenLicensing={() => setView("license")}
              />
            );
          }

          return view === "pdv" ? <><div className="toolbar"><input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar nome, SKU, código ou marca…" aria-label="Pesquisar produtos" /><select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar IVA"><option>Todos</option><option value="0.14">Geral (14%)</option><option value="0.05">Reduzido (5%)</option></select><button type="button" onClick={() => { setQrResult(null); setQrPayload(""); setQrModal(true); }}>Ler/validar QR</button></div><section className="layout"><div><div className="products">{visible.length ? visible.map((product) => <button className="product" key={product.id} onClick={() => add(product)}>{product.imageUrl ? <img className="product-image" src={product.imageUrl} alt="" /> : <span className="product-placeholder" aria-hidden="true">▦</span>}<strong>{product.name}{product.brand ? <small className="product-brand"> · {product.brand}</small> : null}</strong><span>{formatKwanza(product.priceCents)}</span><small>{product.stock} em stock · {product.sku}</small></button>) : <div className="empty-catalog-box" style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#64748b", gridColumn: "1 / -1" }}><div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📦</div><h3>Nenhum produto no catálogo</h3><p style={{ margin: "0.5rem 0", fontSize: "0.9rem" }}>O catálogo de produção inicia vazio para garantir integridade fiscal.</p><small>Cadastre produtos no módulo Stock ou importe os seus artigos.</small></div>}</div></div><aside><h2>Venda atual</h2>{lines.length ? lines.map(({ product, quantity }) => <div className="line" key={product.id}><span>{product.name}<small><button aria-label={`Diminuir ${product.name}`} onClick={() => update(product, quantity - 1)}>−</button> {quantity} <button aria-label={`Aumentar ${product.name}`} onClick={() => add(product)}>+</button></small></span><b>{formatKwanza(product.priceCents * quantity)}</b></div>) : <p className="empty">Selecione um produto para começar.</p>}<label className="discount">Desconto <input type="number" min="0" value={(discount / 100).toFixed(2)} onChange={(e) => setDiscount(moneyInput(e.target.value))} aria-label="Desconto em kwanzas" /> Kz</label><div className="totals"><div><span>Subtotal</span><strong>{formatKwanza(subtotal)}</strong></div><div><span>IVA ({subtotal ? Math.round((tax / subtotal) * 100) : 0}%)</span><strong>{formatKwanza(tax)}</strong></div><div><span>Desconto</span><strong>- {formatKwanza(discountCents)}</strong></div><div className="total"><span>Total</span><strong>{formatKwanza(total)}</strong></div></div><button className="checkout" disabled={!lines.length} onClick={openPaymentModal}>Finalizar e receber (F2)</button><button className="admin" disabled={!lines.length} onClick={openCancelModal}>Cancelar venda (ADMIN)</button></aside></section></> : view === "corporate" ? <CorporatePanel /> : view === "copilot" ? <EnterpriseCopilotPanel api={api()} token={token} onError={setError} storage={storage} licenseStatus={licenseStatus} session={session} /> : view === "biometrics" ? <BiometricsAccessPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} /> : view === "dashboard" ? <DashboardPanel api={api()} token={token} onError={setError} storage={storage} />     : view === "crm" ? <EnterpriseCrmDocumentPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} defaultTab="overview" onError={setError} /> : view === "documents" ? <EnterpriseCrmDocumentPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} defaultTab="documents" onError={setError} /> : view === "platform" ? <PlatformPanel api={api()} token={token} onError={setError} /> : view === "reports" ? <ReportsPanel api={api()} token={token} onError={setError} /> : view === "cashflow" ? <CashflowPanel api={api()} token={token} onError={setError} /> : view === "products" ? <ProductsPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} /> : view === "stock-documents" ? <StockDocumentsPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} /> : view === "operations" ? <OperationsPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} /> : view === "cash" ? <CashPanel api={api()} token={token} onError={setError} currentUser={session} authorizeOffline={(pin) => offlineLogin("admin", pin, "pin")} onSessionExpired={() => { localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); localStorage.removeItem("posUser"); setSession(null); }} />     : view === "fiscal" ? <><ServerConfigPanel /><FiscalSettingsPanel api={api()} token={token} onError={setError} /></> : view === "devices" ? <DevicesPanel settings={deviceSettings} onSave={(next) => { setDeviceSettings(next); localStorage.setItem(deviceSettingsKey, JSON.stringify(next)); }} onError={setError} /> : view === "hr" ? <HRPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} /> : view === "automation" ? <EnterpriseAutomationWorkflowPanel api={api()} token={token} onError={setError} /> : view === "governance" ? <EnterpriseGovernancePanel api={api()} token={token} onError={setError} /> : view === "integrations" ? <EnterpriseIntegrationsPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} /> : view === "financial" ? <EnterpriseFinancialPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} /> : view === "bi" ? <EnterpriseBiAnalyticsPanel api={api()} token={token} companyId="default-company" onError={setError} /> : view === "cloud" ? <EnterpriseSaasCloudPanel api={api()} token={token} onError={setError} /> : view === "license" ? <LicensingCenterPanel licenseStatus={licenseStatus} onActivateLicense={async (tokenToActivate, targetType) => {
  if (window.pos?.activateLicense) {
    const result = await window.pos.activateLicense(tokenToActivate, targetType);
    if (result.valid) {
      setLicenseStatus(result);
      const raw = result.modules ?? [];
      const normalized: AppModule[] = Array.from(new Set<AppModule>([...raw.map((m: string) => normalizeModuleCode(m)).filter((m): m is AppModule => m !== null), "SETTINGS"]));
      setLicenseModules(normalized);
      window.dispatchEvent(new CustomEvent("license-updated", { detail: result }));
      return { success: true, message: `Licença validada e aplicada com sucesso!` };
    }
    const messages: Record<string, string> = {
      hardware_mismatch: "A licença pertence a outro computador (Hardware ID diferente).",
      invalid_signature: "A assinatura digital da licença é inválida ou foi adulterada.",
      expired: "Esta chave de licença já atingiu a data de caducidade.",
      clock_tampering: "Foi detetada adulteração retroativa do relógio do sistema.",
      not_started: "A licença ainda não atingiu a sua data de início de validade.",
    };
    return { success: false, message: messages[result.reason || ""] || `Falha na ativação: ${result.reason || "chave inválida"}.` };
  }

  // Web Cloud Activation via Backend Cryptographic Verification
  try {
    const cleanKey = (tokenToActivate || "").trim();
    if (cleanKey.length < 20) {
      return { success: false, message: "A chave de licença é obrigatória e deve ser um token completo assinado pela VendaJá." };
    }

    const response = await fetch(`${api()}/api/v1/license/activate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ licenseToken: cleanKey }),
    });
    const data = await response.json();
    if (!response.ok || !data.status?.valid) {
      return {
        success: false,
        message: data.message || "A chave de licença foi rejeitada pelo servidor. Assinatura RSA inválida ou token não emitido pela VendaJá.",
      };
    }
    setLicenseStatus(data.status);
    const raw = data.status.modules ?? [];
    const normalized: AppModule[] = Array.from(new Set<AppModule>([...(Array.isArray(raw) ? raw : []).map((mod: string) => normalizeModuleCode(mod)).filter((m: AppModule | null): m is AppModule => m !== null), "SETTINGS"]));
    setLicenseModules(normalized);
    window.dispatchEvent(new CustomEvent("license-updated", { detail: data.status }));
    return { success: true, message: "Licença legítima verificada criptograficamente por RSA-SHA256 e ativada pelo servidor VendaJá!" };
  } catch (err) {
    return { success: false, message: "Falha na comunicação com o servidor de licenciamento." };
  }
}} onRefreshStatus={async () => {
  if (window.pos?.getLicenseStatus) {
    const res = await window.pos.getLicenseStatus();
    setLicenseStatus(res);
    if (res.valid) {
      const raw = res.modules ?? [];
      const normalized: AppModule[] = Array.from(new Set<AppModule>([...raw.map((m: string) => normalizeModuleCode(m)).filter((m): m is AppModule => m !== null), "SETTINGS"]));
      setLicenseModules(normalized);
    } else {
      setLicenseModules(["SETTINGS"]);
    }
  }
}} onNavigateView={(target) => setView(target as View)} isAdmin={normalizeRole(session.role) === "ROLE_ADMIN"} /> : view === "logs" ? <TechnicalLogsPanel api={api()} token={token} onError={setError} /> : <AccountingPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} />;
        })()}
      </main>

      {modal === "payment" && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><h2 id="payment-title">Emitir documento</h2><label>Tipo de documento<select value={documentType} onChange={(e) => setDocumentType(e.target.value as typeof documentType)}><option value="INVOICE_RECEIPT">Fatura/Recibo FR PDV</option><option value="PROFORMA">Fatura Proforma</option></select></label>{documentType === "PROFORMA" && <p className="proforma-notice">Este documento não serve de fatura / Isento de validação fiscal. Não movimenta stock nem caixa.</p>}<p className="modal-total">{documentType === "PROFORMA" ? "Total da proforma" : "Total a pagar"}: <strong>{formatKwanza(total)}</strong></p><label>Método<select disabled={documentType === "PROFORMA"} value={payment.method} onChange={(e) => { setPaymentError(""); const method = e.target.value as Payment["method"]; setPayment({ ...payment, method, cashCents: method === "CASH" ? total : 0, cardCents: method === "CARD" ? total : 0, transferCents: method === "TRANSFER" ? total : 0 }); }}><option value="CASH">Numerário</option><option value="CARD">Cartão</option><option value="TRANSFER">Transferência</option><option value="CREDIT">Fiado / Crédito</option><option value="MIXED">Misto</option></select></label>{payment.method === "CREDIT" && <><label>Cliente<select value={payment.customerId} onChange={(e) => { setPaymentError(""); const customer = customers.find((item) => item.id === e.target.value); setPayment({ ...payment, customerId: e.target.value, customerName: customer?.name ?? "", customerNif: customer?.nif ?? "" }); }}><option value="">Selecione um cliente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · saldo {formatKwanza(customer.outstandingDebtCents)} / limite {formatKwanza(customer.creditLimitCents)}</option>)}</select></label><label>Data de vencimento<input type="date" min={new Date().toISOString().slice(0, 10)} value={payment.dueDate} onChange={(e) => { setPaymentError(""); setPayment({ ...payment, dueDate: e.target.value }); }} /></label><p className="proforma-notice">O crédito será validado pelo backend contra o limite disponível do cliente.</p></>}{payment.method === "CASH" && <label>Valor recebido (Kz)<input type="number" min="0" step="any" value={payment.cashCents ? payment.cashCents / 100 : ""} onChange={(e) => { setPaymentError(""); setPayment({ ...payment, cashCents: moneyInput(e.target.value) }); }} autoFocus /><small>Troco: <strong>{formatKwanza(Math.max(0, payment.cashCents - total))}</strong></small></label>}{payment.method === "CARD" && <label>Valor no cartão (Kz)<input type="number" min="0" step="any" value={payment.cardCents ? payment.cardCents / 100 : ""} onChange={(e) => { setPaymentError(""); setPayment({ ...payment, cardCents: moneyInput(e.target.value) }); }} autoFocus /></label>}{payment.method === "TRANSFER" && <label>Valor transferido (Kz)<input type="number" min="0" step="any" value={payment.transferCents ? payment.transferCents / 100 : ""} onChange={(e) => { setPaymentError(""); setPayment({ ...payment, transferCents: moneyInput(e.target.value) }); }} autoFocus /></label>}{payment.method === "MIXED" && <div className="split"><label>Numerário<input type="number" step="any" value={payment.cashCents ? payment.cashCents / 100 : ""} onChange={(e) => { setPaymentError(""); setPayment({ ...payment, cashCents: moneyInput(e.target.value) }); }} /></label><label>Cartão<input type="number" step="any" value={payment.cardCents ? payment.cardCents / 100 : ""} onChange={(e) => { setPaymentError(""); setPayment({ ...payment, cardCents: moneyInput(e.target.value) }); }} /></label><label>Transferência<input type="number" step="any" value={payment.transferCents ? payment.transferCents / 100 : ""} onChange={(e) => { setPaymentError(""); setPayment({ ...payment, transferCents: moneyInput(e.target.value) }); }} /></label><div style={{ gridColumn: "1 / -1", marginTop: "4px" }}><small>Total entregue: <strong>{formatKwanza(payment.cashCents + payment.cardCents + payment.transferCents)}</strong> · Troco: <strong>{formatKwanza(Math.max(0, (payment.cashCents + payment.cardCents + payment.transferCents) - total))}</strong></small></div></div>}{payment.method !== "CREDIT" && <div className="customer-fields"><label>Nome do cliente (opcional)<input value={payment.customerName} onChange={(e) => setPayment({ ...payment, customerName: e.target.value })} /></label><label>NIF (opcional)<input value={payment.customerNif} onChange={(e) => setPayment({ ...payment, customerNif: e.target.value })} /></label></div>}{paymentError && <p className="login-error">{paymentError}</p>}<div className="modal-actions"><button className="checkout" onClick={() => void confirmPayment()}>Confirmar, emitir recibo</button><button onClick={() => { setModal(null); setPaymentError(""); }}>Voltar</button></div></div></div>}
      {modal === "cancel" && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><h2>Autorizar cancelamento</h2><p>{normalizeRole(session.role) === "ROLE_ADMIN" ? "Confirme o cancelamento da venda atual. Pode limpar diretamente ou introduzir PIN/password de confirmação." : "Introduza o PIN ou password de um administrador para autorizar o cancelamento."}</p><input type="password" autoFocus placeholder={normalizeRole(session.role) === "ROLE_ADMIN" ? "PIN/password opcional de confirmação" : "PIN ou password de administrador"} value={pin} onChange={(e) => { setCancelError(""); setPin(e.target.value); }} aria-label="PIN ou password de administrador" />{cancelError && <p className="login-error">{cancelError}</p>}<div className="modal-actions"><button className="admin" onClick={() => void cancelSale()}>Autorizar e limpar venda</button><button onClick={() => { setModal(null); setPin(""); setCancelError(""); }}>Voltar</button></div></div></div>}
      {modal === "settings-auth" && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-auth-title"><h2 id="settings-auth-title">Acesso restrito às Definições</h2><p>Esta área é exclusiva do Administrador. O PIN do atendedor só permite abrir a caixa.</p><label>Senha ou PIN do Administrador<input type="password" autoFocus value={settingsCredential} onChange={(e) => setSettingsCredential(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void authorizeSettings(); }} /></label>{settingsMessage && <p className="login-error">{settingsMessage}</p>}<div className="modal-actions"><button className="checkout" onClick={() => void authorizeSettings()}>Autorizar acesso</button><button onClick={() => setModal(null)}>Cancelar</button></div></div></div>}
      {qrModal && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><h2>Ler QR / código de produto</h2><p>O código é pesquisado primeiro no catálogo local por QR, EAN, SKU ou ID.</p><video ref={qrVideo} className="qr-camera" muted playsInline /><button type="button" onClick={() => void startQrCamera()}>Abrir câmara</button><textarea value={qrPayload} onChange={(e) => setQrPayload(e.target.value)} autoFocus placeholder="SKU, EAN-13, ID ou código QR" /><div className="modal-actions"><button className="checkout" onClick={() => void handleProductScan(qrPayload)}>Pesquisar no catálogo local</button><button onClick={() => { qrControls.current?.stop(); setQrModal(false); }}>Fechar</button></div>{qrResult && <p className={qrResult.valid ? "success" : "alert"}>{qrResult.product ? `Produto adicionado: ${qrResult.product}` : "Produto não encontrado no catálogo local"}</p>}</div></div>}
      {completedSale && (
        <DocumentPreviewModal
          document={saleToCommercialDocument(
            completedSale.sale,
            company,
            productCatalog,
            completedSale.hash,
            completedSale.qr
          )}
          onClose={() => setCompletedSale(null)}
          onNewSale={() => {
            setCompletedSale(null);
            setDocumentType("INVOICE_RECEIPT");
          }}
        />
      )}
      {modal === "profile" && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><h2>Perfil de administrador</h2><label>Username<input value={profile.username || session.username || ""} onChange={(e) => setProfile({ ...profile, username: e.target.value })} /></label><label>Nome de apresentação<input value={profile.displayName || session.displayName || ""} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} /></label><label>Password atual<input required type="password" value={profile.currentPassword} onChange={(e) => setProfile({ ...profile, currentPassword: e.target.value })} /></label><label>Nova password (mínimo 8 caracteres)<input type="password" minLength={8} value={profile.newPassword} onChange={(e) => setProfile({ ...profile, newPassword: e.target.value })} />    </label><label>{session.authMethod === "pin" ? "PIN atual" : "Novo PIN (6 dígitos)"}<input inputMode="numeric" maxLength={6} type="password" value={session.authMethod === "pin" ? profile.currentPin : profile.newPin} onChange={(e) => setProfile({ ...profile, ...(session.authMethod === "pin" ? { currentPin: e.target.value.replace(/\D/g, "").slice(0, 6) } : { newPin: e.target.value.replace(/\D/g, "").slice(0, 6) }) })} /></label>{session.authMethod === "pin" && <label>Novo PIN (6 dígitos)<input inputMode="numeric" maxLength={6} type="password" value={profile.newPin} onChange={(e) => setProfile({ ...profile, newPin: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></label>}{profileMessage && <p className="success">{profileMessage}</p>}<div className="modal-actions"><button className="checkout" onClick={() => void saveProfile()}>Guardar alterações</button><button onClick={() => setModal(null)}>Fechar</button></div></div></div>}
      {sessionLocked && <div className="modal-backdrop lock-screen-backdrop" role="dialog" aria-modal="true"><div className="lock-screen-modal"><div className="lock-screen-header"><div className="lock-icon">🔒</div><h2>Sessão Bloqueada por Inatividade</h2><p>Para proteger os dados e o caixa, a sessão foi suspensa automaticamente após 15 minutos sem atividade.</p></div><div className="lock-user-info"><strong>{session.displayName || session.username || session.email}</strong><span>{session.role} · Terminal {terminalId}</span></div><form onSubmit={(e) => { e.preventDefault(); void unlockSession(); }}><label>PIN ou Palavra-passe<input type="password" autoFocus placeholder="••••••" value={unlockPin} onChange={(e) => { setUnlockError(""); setUnlockPin(e.target.value); }} /></label>{unlockError && <p className="login-error">{unlockError}</p>}<div className="modal-actions"><button type="submit" className="checkout">Desbloquear Sessão</button><button type="button" onClick={() => { localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); localStorage.removeItem("posUser"); setSession(null); setSessionLocked(false); }}>Terminar Sessão</button></div></form></div></div>}
      {lockedModuleModal && (
        <LockedModuleModal
          moduleInfo={lockedModuleModal}
          currentPlan={licenseStatus?.plan || "STARTER"}
          onOpenLicensing={() => setView("license")}
          onClose={() => setLockedModuleModal(null)}
        />
      )}
    </div>
  </div>;
}

export function DesktopErpApp({ onSwitchPortal }: { onSwitchPortal?: (portal: string) => void } = {}) {
  return <App onSwitchPortal={onSwitchPortal} />;
}
