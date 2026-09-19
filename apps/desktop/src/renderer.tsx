import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  createPosStorage, escPosReceipt, fiscalHash, fiscalQrPayload, formatKwanza, SyncEngine,
  type PaymentMethod, type Product, type Sale,
} from "@angola/shared";
import { ErrorBoundary } from "./ErrorBoundary";
import { AccountingPanel, CashPanel, DashboardPanel, DevicesPanel, FiscalSettingsPanel, HRPanel, ProductsPanel } from "./panels";
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

const products: Product[] = [
  { id: "coffee", sku: "CAF-001", name: "Café Angola", priceCents: 125000, stock: 42, taxRate: 0.14, active: true },
  { id: "water", sku: "AGU-001", name: "Água mineral", priceCents: 75000, stock: 80, taxRate: 0.14, active: true },
  { id: "ginger", sku: "GIN-001", name: "Gengibre", priceCents: 95000, stock: 25, taxRate: 0.14, active: true },
  { id: "bread", sku: "PÃO-001", name: "Pão de forma", priceCents: 150000, stock: 18, taxRate: 0.05, active: true },
];
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const api = () => (globalThis as { __POS_API_URL__?: string }).__POS_API_URL__ ?? (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "http://localhost:4000";
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

type View = "pdv" | "dashboard" | "products" | "cash" | "fiscal" | "devices" | "hr" | "accounting";
type Payment = { method: PaymentMethod | "MIXED"; cashCents: number; cardCents: number; transferCents: number; customerName: string; customerNif: string };
type AppModule = "POS" | "STOCK" | "HR" | "ACCOUNTING" | "DASHBOARD" | "SETTINGS";
const defaultLicensedModules: AppModule[] = ["POS", "STOCK", "HR", "ACCOUNTING", "SETTINGS", "DASHBOARD"];
const normalizeRole = (role: string) => {
  const value = role.toUpperCase();
  if (value === "ADMIN") return "ROLE_ADMIN";
  if (value === "OPERATOR" || value === "CASHIER") return "ROLE_CASHIER";
  if (value === "HR") return "ROLE_HR";
  if (value === "ACCOUNTANT" || value === "ACCOUNTING") return "ROLE_ACCOUNTANT";
  return value.startsWith("ROLE_") ? value : `ROLE_${value}`;
};
const roleModules: Record<string, AppModule[]> = {
  ROLE_ADMIN: ["POS", "STOCK", "HR", "ACCOUNTING", "DASHBOARD", "SETTINGS"],
  ROLE_CASHIER: ["POS", "DASHBOARD"],
  ROLE_HR: ["HR", "DASHBOARD"],
  ROLE_ACCOUNTANT: ["ACCOUNTING", "DASHBOARD"],
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
    const [pinMode, setPinMode] = useState(false); const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
    async function submit(event: FormEvent) { event.preventDefault(); setError(""); if (pinMode && !/^\d{6}$/.test(password)) { setError("O PIN deve conter exatamente 6 dígitos."); return; } setLoading(true); try { const mode = pinMode ? "pin" : "password"; let data: Awaited<ReturnType<typeof offlineLogin>>; try { const response = await fetch(`${api()}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password, mode }) }); if (!response.ok) throw new Error("remote_login_failed"); data = await response.json() as Awaited<ReturnType<typeof offlineLogin>>; await saveLocalCredential(mode, password); } catch { data = await offlineLogin(identifier, password, mode); } localStorage.setItem("accessToken", data.accessToken); localStorage.setItem("refreshToken", data.refreshToken); onLogin(data.accessToken, data.refreshToken, data.user); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível iniciar sessão."); } finally { setLoading(false); } }
    const press = (digit: string) => setPassword((value) => value.length < 6 ? value + digit : value);
    return <main className="login-shell"><section className="login-brand"><div className="brand-mark">V<span>J</span></div><p className="eyebrow">GESTÃO COMERCIAL</p><h1>VendaJá <span>Angola</span></h1><p className="tagline">Vendas simples. Negócio sempre em movimento.</p><div className="login-status"><span className="status-dot" /> Sistema online <span className="status-separator">•</span> Pronto para vender</div><div className="brand-decoration"><span>AOA</span><span>PDV</span><span>OFFLINE FIRST</span></div></section><section className="login-card"><div className="login-card-inner"><div className="login-heading"><p className="eyebrow">BEM-VINDO DE VOLTA</p><h2>Iniciar sessão</h2><p>Entre na sua conta para continuar.</p></div><div className="login-tabs"><button type="button" className={!pinMode ? "selected" : ""} onClick={() => { setPinMode(false); setPassword(""); }}>E-mail e password</button><button type="button" className={pinMode ? "selected" : ""} onClick={() => { setPinMode(true); setPassword(""); }}>PIN rápido</button></div><form onSubmit={submit}><label className="login-label">Utilizador ou e-mail<input className="login-input" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="admin ou email@empresa.ao" /></label>{pinMode ? <><label className="login-label">PIN de 6 dígitos<input className="login-input pin-display" required inputMode="numeric" maxLength={6} value={password} onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /></label><div className="pin-keypad">{["1","2","3","4","5","6","7","8","9","0"].map((digit) => <button type="button" key={digit} onClick={() => press(digit)}>{digit}</button>)}<button type="button" className="pin-clear" onClick={() => setPassword("")}>Limpar</button></div></> : <label className="login-label">Password<input className="login-input" required type="password" minLength={4} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Introduza a sua password" /> </label>}{error && <div className="login-error">{error}</div>}<button className="login-submit" disabled={loading}>{loading ? "A validar..." : "Entrar na VendaJá"}</button></form><p className="login-footnote">As vendas podem continuar offline.</p></div></section></main>;
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

function App() {
  const storage = useMemo(() => createPosStorage(), []);
  const [productCatalog, setProductCatalog] = useState<Product[]>(products);
  const [view, setView] = useState<View>("pdv");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [discount, setDiscount] = useState(0);
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);
  const [modal, setModal] = useState<"payment" | "cancel" | "profile" | "settings-auth" | null>(null);
  const [completedSale, setCompletedSale] = useState<{ sale: Sale; hash: string; qr: string } | null>(null);
  const [documentType, setDocumentType] = useState<"INVOICE_RECEIPT" | "PROFORMA">("INVOICE_RECEIPT");
  const [company, setCompany] = useState({ name: "VendaJá Angola", nif: "—", address: "Angola", province: "Luanda", phone: "—" });
  const terminalId = localStorage.getItem("terminalId") ?? "01";
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
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<Payment>({ method: "CASH", cashCents: 0, cardCents: 0, transferCents: 0, customerName: "", customerNif: "" });
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem("posUser") ?? "null") as { id?: string; role: string; email: string; username?: string; displayName?: string; authMethod?: "password" | "pin" } | null; } catch { return null; } });
  const [profile, setProfile] = useState({ username: "", displayName: "", currentPassword: "", newPassword: "", currentPin: "", newPin: "" });
  const [profileMessage, setProfileMessage] = useState("");
  const [settingsUnlocked, setSettingsUnlocked] = useState(() => session?.role?.toUpperCase() === "ADMIN");
  const [settingsCredential, setSettingsCredential] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [licenseModules, setLicenseModules] = useState<AppModule[]>(defaultLicensedModules);
  const [pendingRestrictedView, setPendingRestrictedView] = useState<View | null>(null);
  const [outboxCount, setOutboxCount] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem("accessToken") ?? "";
  useEffect(() => {
    let active = true;
    void window.pos?.getLicenseStatus?.().then((status) => {
      if (active && status.valid) setLicenseModules((status.modules?.length ? status.modules : defaultLicensedModules).map((module) => module.toUpperCase()) as AppModule[]);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const refreshLicense = (event: Event) => {
      const modules = (event as CustomEvent<LicenseStatus>).detail?.modules;
      if (modules?.length) setLicenseModules(modules.map((module) => module.toUpperCase()) as AppModule[]);
    };
    window.addEventListener("license-updated", refreshLicense);
    return () => window.removeEventListener("license-updated", refreshLicense);
  }, []);
  const lines = productCatalog.filter((p) => cart[p.id]).map((product) => ({ product, quantity: cart[product.id] ?? 0 }));
  const subtotal = lines.reduce((sum, line) => sum + line.product.priceCents * line.quantity, 0);
  const tax = lines.reduce((sum, line) => sum + Math.round(line.product.priceCents * line.quantity * line.product.taxRate), 0);
  const discountCents = Math.min(subtotal + tax, discount);
  const total = subtotal + tax - discountCents;
  const engine = useMemo(() => new SyncEngine(storage, { apiUrl: api(), token, deviceId: localStorage.getItem("deviceId") ?? id(), onState: setOnline }), [storage, token]);
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
  useEffect(() => { const refresh = () => void fetch(`${api()}/api/v1/products`, { headers: { authorization: "Bearer " + token } }).then((r) => r.ok ? r.json() as Promise<Product[]> : Promise.reject(new Error("catalog refresh failed"))).then((loaded) => { if (Array.isArray(loaded)) { setProductCatalog(loaded); localStorage.setItem("vendaja-local-products", JSON.stringify(loaded)); } }).catch(() => { try { const loaded = JSON.parse(localStorage.getItem("vendaja-local-products") ?? "[]"); if (Array.isArray(loaded) && loaded.length) setProductCatalog(loaded); } catch { /* keep current catalog */ } }); window.addEventListener("catalog-updated", refresh); return () => window.removeEventListener("catalog-updated", refresh); }, [token]);
  useEffect(() => { if (!token) return; void fetch(`${api()}/api/v1/fiscal/config`, { headers: { authorization: "Bearer " + token } }).then((r) => r.ok ? r.json() : null).then((data) => { if (data) setCompany({ name: data.companyName || "VendaJá Angola", nif: data.companyNif || "—", address: data.companyAddress || "Angola", province: data.companyProvince || "Luanda", phone: data.companyPhone || "—" }); }).catch(() => undefined); }, [token]);
  useEffect(() => { if (!completedSale) return; const handler = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key.toLowerCase() === "p") { event.preventDefault(); window.print(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [completedSale]);
  useEffect(() => { if (!completedSale) { setInvoiceQrImage(""); return; } void QRCode.toDataURL(completedSale.qr, { margin: 1, width: 150 }).then(setInvoiceQrImage).catch(() => setInvoiceQrImage("")); }, [completedSale]);
  useEffect(() => {
    const set = () => setOnline(navigator.onLine);
    window.addEventListener("online", set); window.addEventListener("offline", set);
    return () => { window.removeEventListener("online", set); window.removeEventListener("offline", set); };
  }, []);
  useEffect(() => { let active = true; const refresh = () => void storage.getOutbox().then((items) => { if (active) setOutboxCount(items.length); }); refresh(); const timer = window.setInterval(refresh, 5000); return () => { active = false; window.clearInterval(timer); }; }, [storage]);
  useEffect(() => { const deviceId = localStorage.getItem("deviceId") ?? id(); localStorage.setItem("deviceId", deviceId); engine.start(); return () => engine.stop(); }, [engine]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "F1") { event.preventDefault(); search.current?.focus(); } if (event.key === "Escape" && !modal) setError(""); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [modal]);
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
    if (!licenseModules.includes("SETTINGS")) { setError("O módulo de Definições não está incluído na licença contratada."); return; }
    setPendingRestrictedView("fiscal");
    setSettingsCredential(""); setSettingsMessage(""); setModal("settings-auth");
  };
  const openRestrictedModule = (nextView: View, module: AppModule) => {
    const isAdmin = normalizeRole(session.role) === "ROLE_ADMIN";
    if (!isAdmin && !licenseModules.includes(module)) { setError("Este módulo não está incluído na licença contratada."); return; }
    if (isAdmin || roleModules[normalizeRole(session.role)]?.includes(module)) { setView(nextView); return; }
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

  async function confirmPayment() {
    setError("");
    const paid = payment.method === "CASH" ? payment.cashCents : payment.method === "CARD" ? payment.cardCents : payment.method === "TRANSFER" ? payment.transferCents : payment.cashCents + payment.cardCents + payment.transferCents;
    if (documentType !== "PROFORMA" && paid < total) { setError("O valor recebido é inferior ao total."); return; }
    let cashSessionId: string | null = null;
    try { const response = await fetch(`${api()}/api/v1/fiscal/cash/current`, { headers: { authorization: "Bearer " + token } }); if (response.ok) cashSessionId = ((await response.json()) as { id?: string } | null)?.id ?? null; } catch { /* offline sale */ }
    cashSessionId = cashSessionId ?? localStorage.getItem("activeCashSessionId");
    const sale: Sale = {
      id: id(), number: `${documentType === "PROFORMA" ? "PROFORMA" : "FR"}-PDV-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`,
      lines: lines.map(({ product, quantity }) => ({ productId: product.id, quantity, unitPriceCents: product.priceCents, taxRate: product.taxRate })),
      subtotalCents: subtotal, taxCents: tax, totalCents: total, currency: "AOA", createdAt: new Date().toISOString(),
      discountCents, paymentMethod: documentType === "PROFORMA" ? undefined : payment.method, cashCents: documentType === "PROFORMA" ? 0 : payment.cashCents, cardCents: documentType === "PROFORMA" ? 0 : payment.cardCents, transferCents: documentType === "PROFORMA" ? 0 : payment.transferCents, cashSessionId: documentType === "PROFORMA" ? null : cashSessionId, customerName: payment.customerName || undefined, customerNif: payment.customerNif || undefined, fiscalType: documentType,       operatorName: localStorage.getItem("cashOperatorName") || session?.displayName, terminalId: localStorage.getItem("terminalId") || terminalId, operatorNif: localStorage.getItem("cashOperatorNif") ?? undefined, operatorPhone: localStorage.getItem("cashOperatorPhone") ?? undefined,
    };
    const hash = fiscalHash(sale);
    try {
      if (documentType !== "PROFORMA") await storage.saveSaleAndEnqueue(sale, { id: id(), operation: "CREATE", entity: "SALE", payload: { ...sale, fiscalHash: hash, qr: fiscalQrPayload(sale, hash) }, occurredAt: sale.createdAt });
      const printer = (window as unknown as { pos?: { printReceipt?: (data: Uint8Array) => Promise<void> } }).pos?.printReceipt;
      if (printer) await printer(escPosReceipt(sale, {
        company: { name: company.name, nif: company.nif, address: `${company.address} · ${company.province}`, phone: company.phone },
        fiscalHash: hash,
        qrPayload: documentType === "PROFORMA" ? undefined : fiscalQrPayload(sale, hash),
      }));
      setCompletedSale({ sale, hash, qr: fiscalQrPayload(sale, hash) }); setCart({}); setDiscount(0); setModal(null); setPayment({ method: "CASH", cashCents: 0, cardCents: 0, transferCents: 0, customerName: "", customerNif: "" }); window.dispatchEvent(new CustomEvent("cash-updated"));
      if (documentType !== "PROFORMA" && !online) setError("Venda guardada localmente. Será sincronizada quando voltar a estar online.");
      else if (documentType !== "PROFORMA") void engine.flush();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível guardar a venda."); }
  }
  async function cancelSale() {
    setError("");
    try {
      const mode = /^\d{6}$/.test(pin) ? "pin" : "password";
      if (online && token && token !== "offline-local-session") {
        const response = await fetch(`${api()}/api/v1/auth/authorize`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ credential: pin, mode, action: "SALE_CANCELLED" }) });
        const result = await response.json().catch(() => ({})) as { error?: string; stage?: string; details?: string };
        if (!response.ok) throw new Error(`${result.stage ?? "AUTHENTICATION"}: ${result.details ?? result.error ?? "authorization_failed"}`);
      } else await offlineLogin("admin", pin, mode);
      setCart({}); setModal(null); setPin("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível autorizar o cancelamento."); }
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
  return <main>
    <header><div><h1>VendaJá <span>Angola</span></h1><span className={`status ${online ? "online" : ""}`}>● {online ? "Online" : "Offline — vendas pendentes neste dispositivo"}</span></div><div className="user-actions"><span>Outbox: {outboxCount} · {online ? "Sincronizado" : "Pendente"}</span><button className="icon-button" aria-label="Abrir perfil" onClick={() => {     setProfile({ username: session.username ?? "", displayName: session.displayName ?? "", currentPassword: "", newPassword: "", currentPin: "", newPin: "" }); setProfileMessage(""); setError(""); setModal("profile"); }}>👤 {session.displayName ?? session.email}</button><button onClick={() => { localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); localStorage.removeItem("posUser"); setSession(null); }}>Sair</button><kbd>F1 pesquisar</kbd></div></header>
    <nav aria-label="Navegação principal">{[
      ...(normalizeRole(session.role) === "ROLE_ADMIN" || (licenseModules.includes("POS") && roleModules[normalizeRole(session.role)]?.includes("POS")) ? [["pdv", "PDV"]] : []),
      ...(normalizeRole(session.role) === "ROLE_ADMIN" || (licenseModules.includes("DASHBOARD") && roleModules[normalizeRole(session.role)]?.includes("DASHBOARD")) ? [["dashboard", "Dashboard"]] : []),
      ...(normalizeRole(session.role) === "ROLE_ADMIN" || (licenseModules.includes("STOCK") && roleModules[normalizeRole(session.role)]?.includes("STOCK")) ? [["products", "Produtos / Stock"]] : []),
      ...(normalizeRole(session.role) === "ROLE_ADMIN" || (licenseModules.includes("POS") && roleModules[normalizeRole(session.role)]?.includes("POS")) ? [["cash", "Caixa"]] : []),
      ...(normalizeRole(session.role) === "ROLE_ADMIN" || (licenseModules.includes("HR") && roleModules[normalizeRole(session.role)]?.includes("HR")) ? [["hr", "RH"]] : []),
      ...(normalizeRole(session.role) === "ROLE_ADMIN" || (licenseModules.includes("ACCOUNTING") && roleModules[normalizeRole(session.role)]?.includes("ACCOUNTING")) ? [["accounting", "Contabilidade"]] : []),
      ...(normalizeRole(session.role) === "ROLE_ADMIN" || licenseModules.includes("SETTINGS") ? [["devices", "Dispositivos"]] : []),
      ["fiscal", "Definições"],
    ].map(([key, label]) => <button className={view === key ? "active" : ""} key={key} onClick={() => {
      if (key === "fiscal") openSettings();
      else if (key === "devices") openRestrictedModule("devices", "SETTINGS");
      else if (key === "products") openRestrictedModule("products", "STOCK");
      else if (key === "cash") openRestrictedModule("cash", "POS");
      else if (key === "hr") openRestrictedModule("hr", "HR");
      else if (key === "accounting") openRestrictedModule("accounting", "ACCOUNTING");
      else openRestrictedModule(key as View, key === "dashboard" ? "DASHBOARD" : "POS");
    }}>{label}</button>)}</nav>
    {error && <div className="alert" role="alert">{error}<button aria-label="Fechar erro" onClick={() => setError("")}>×</button></div>}
    {view === "pdv" ? <><div className="toolbar"><input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar nome, SKU, código ou marca…" aria-label="Pesquisar produtos" /><select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar IVA"><option>Todos</option><option value="0.14">Geral (14%)</option><option value="0.05">Reduzido (5%)</option></select><button type="button" onClick={() => { setQrResult(null); setQrPayload(""); setQrModal(true); }}>Ler/validar QR</button></div><section className="layout"><div><div className="products">{visible.map((product) => <button className="product" key={product.id} onClick={() => add(product)}>{product.imageUrl ? <img className="product-image" src={product.imageUrl} alt="" /> : <span className="product-placeholder" aria-hidden="true">▦</span>}<strong>{product.name}{product.brand ? <small className="product-brand"> · {product.brand}</small> : null}</strong><span>{formatKwanza(product.priceCents)}</span><small>{product.stock} em stock · {product.sku}</small></button>)}</div></div><aside><h2>Venda atual</h2>{lines.length ? lines.map(({ product, quantity }) => <div className="line" key={product.id}><span>{product.name}<small><button aria-label={`Diminuir ${product.name}`} onClick={() => update(product, quantity - 1)}>−</button> {quantity} <button aria-label={`Aumentar ${product.name}`} onClick={() => add(product)}>+</button></small></span><b>{formatKwanza(product.priceCents * quantity)}</b></div>) : <p className="empty">Selecione um produto para começar.</p>}<label className="discount">Desconto <input type="number" min="0" value={(discount / 100).toFixed(2)} onChange={(e) => setDiscount(moneyInput(e.target.value))} aria-label="Desconto em kwanzas" /> Kz</label><div className="totals"><div><span>Subtotal</span><strong>{formatKwanza(subtotal)}</strong></div><div><span>IVA ({subtotal ? Math.round((tax / subtotal) * 100) : 0}%)</span><strong>{formatKwanza(tax)}</strong></div><div><span>Desconto</span><strong>- {formatKwanza(discountCents)}</strong></div><div className="total"><span>Total</span><strong>{formatKwanza(total)}</strong></div></div><button className="checkout" disabled={!lines.length} onClick={() => setModal("payment")}>Finalizar e receber (F2)</button><button className="admin" disabled={!lines.length} onClick={() => setModal("cancel")}>Cancelar venda (ADMIN)</button></aside></section></> : view === "dashboard" ? <DashboardPanel api={api()} token={token} onError={setError} /> : view === "products" ? <ProductsPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} />             : view === "cash" ? <CashPanel api={api()} token={token} onError={setError} currentUser={session} authorizeOffline={(pin) => offlineLogin("admin", pin, "pin")} onSessionExpired={() => { localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); localStorage.removeItem("posUser"); setSession(null); }} /> : view === "fiscal" ? <FiscalSettingsPanel api={api()} token={token} onError={setError} /> : view === "devices" ? <DevicesPanel settings={deviceSettings} onSave={(next) => { setDeviceSettings(next); localStorage.setItem(deviceSettingsKey, JSON.stringify(next)); }} onError={setError} /> : view === "hr" ? <HRPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} /> : <AccountingPanel api={api()} token={token} admin={session.role.toUpperCase() === "ADMIN"} onError={setError} />}
    {modal === "payment" && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><h2 id="payment-title">Emitir documento</h2><label>Tipo de documento<select value={documentType} onChange={(e) => setDocumentType(e.target.value as typeof documentType)}><option value="INVOICE_RECEIPT">Fatura/Recibo FR PDV</option><option value="PROFORMA">Fatura Proforma</option></select></label>{documentType === "PROFORMA" && <p className="proforma-notice">Este documento não serve de fatura / Isento de validação fiscal. Não movimenta stock nem caixa.</p>}<p className="modal-total">{documentType === "PROFORMA" ? "Total da proforma" : "Total a pagar"}: <strong>{formatKwanza(total)}</strong></p><label>Método<select disabled={documentType === "PROFORMA"} value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value as Payment["method"] })}><option value="CASH">Numerário</option><option value="CARD">Cartão</option><option value="TRANSFER">Transferência</option><option value="MIXED">Misto</option></select></label>{payment.method === "CASH" && <label>Valor recebido (Kz)<input type="number" min="0" value={payment.cashCents / 100 || ""} onChange={(e) => setPayment({ ...payment, cashCents: moneyInput(e.target.value) })} autoFocus /><small>Troco: {formatKwanza(Math.max(0, payment.cashCents - total))}</small></label>}{payment.method === "CARD" && <label>Valor no cartão (Kz)<input type="number" min="0" value={payment.cardCents / 100 || ""} onChange={(e) => setPayment({ ...payment, cardCents: moneyInput(e.target.value) })} autoFocus /></label>}{payment.method === "TRANSFER" && <label>Valor transferido (Kz)<input type="number" min="0" value={payment.transferCents / 100 || ""} onChange={(e) => setPayment({ ...payment, transferCents: moneyInput(e.target.value) })} autoFocus /></label>}{payment.method === "MIXED" && <div className="split"><label>Numerário<input type="number" onChange={(e) => setPayment({ ...payment, cashCents: moneyInput(e.target.value) })} /></label><label>Cartão<input type="number" onChange={(e) => setPayment({ ...payment, cardCents: moneyInput(e.target.value) })} /></label><label>Transferência<input type="number" onChange={(e) => setPayment({ ...payment, transferCents: moneyInput(e.target.value) })} /></label></div>}<div className="customer-fields"><label>Nome do cliente (opcional)<input value={payment.customerName} onChange={(e) => setPayment({ ...payment, customerName: e.target.value })} /></label><label>NIF (opcional)<input value={payment.customerNif} onChange={(e) => setPayment({ ...payment, customerNif: e.target.value })} /></label></div><div className="modal-actions"><button className="checkout" onClick={() => void confirmPayment()}>Confirmar, emitir recibo</button><button onClick={() => setModal(null)}>Voltar</button></div></div></div>}
    {modal === "cancel" && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><h2>Autorizar cancelamento</h2><p>Introduza o PIN/password de um administrador.</p><input type="password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN ou password de administrador" /><div className="modal-actions"><button className="admin" onClick={() => void cancelSale()}>Autorizar e limpar venda</button><button onClick={() => setModal(null)}>Voltar</button></div></div></div>}
    {modal === "settings-auth" && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-auth-title"><h2 id="settings-auth-title">Acesso restrito às Definições</h2><p>Esta área é exclusiva do Administrador. O PIN do atendedor só permite abrir a caixa.</p><label>Senha ou PIN do Administrador<input type="password" autoFocus value={settingsCredential} onChange={(e) => setSettingsCredential(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void authorizeSettings(); }} /></label>{settingsMessage && <p className="login-error">{settingsMessage}</p>}<div className="modal-actions"><button className="checkout" onClick={() => void authorizeSettings()}>Autorizar acesso</button><button onClick={() => setModal(null)}>Cancelar</button></div></div></div>}
    {qrModal && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><h2>Ler QR / código de produto</h2><p>O código é pesquisado primeiro no catálogo local por QR, EAN, SKU ou ID.</p><video ref={qrVideo} className="qr-camera" muted playsInline /><button type="button" onClick={() => void startQrCamera()}>Abrir câmara</button><textarea value={qrPayload} onChange={(e) => setQrPayload(e.target.value)} autoFocus placeholder="SKU, EAN-13, ID ou código QR" /><div className="modal-actions"><button className="checkout" onClick={() => void handleProductScan(qrPayload)}>Pesquisar no catálogo local</button><button onClick={() => { qrControls.current?.stop(); setQrModal(false); }}>Fechar</button></div>{qrResult && <p className={qrResult.valid ? "success" : "alert"}>{qrResult.product ? `Produto adicionado: ${qrResult.product}` : "Produto não encontrado no catálogo local"}</p>}</div></div>}
    {completedSale && <div className="modal-backdrop completed-backdrop"><div className={`invoice-preview ${completedSale.sale.fiscalType === "PROFORMA" ? "proforma" : ""}`} id="invoice-preview" role="dialog" aria-modal="true"><div className="invoice-header"><div><h2>{completedSale.sale.fiscalType === "PROFORMA" ? "FATURA PROFORMA" : "FATURA/RECIBO FR PDV"}</h2><strong>{company.name}</strong><small>NIF: {company.nif} · {company.address} · {company.province} · Tel: {company.phone}</small><small>Atendido por: {completedSale.sale.operatorName || "—"} · Caixa: {completedSale.sale.terminalId || terminalId}</small></div><span className="invoice-type">{completedSale.sale.fiscalType === "PROFORMA" ? "PROFORMA" : "DOCUMENTO FISCAL"}</span></div>{completedSale.sale.fiscalType === "PROFORMA" && <p className="proforma-notice">Este documento não serve de fatura / Isento de validação fiscal</p>}<div className="invoice-meta"><span>Documento: <b>{completedSale.sale.number}</b></span><span>Data: {new Date(completedSale.sale.createdAt).toLocaleString("pt-PT")}</span></div><p>Cliente: <b>{completedSale.sale.customerName || "Consumidor Final"}</b>{completedSale.sale.customerNif ? ` · NIF: ${completedSale.sale.customerNif}` : ""}</p><table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Preço unit.</th><th>IVA</th><th>Total</th></tr></thead><tbody>{completedSale.sale.lines.map((line) => { const product = productCatalog.find((item) => item.id === line.productId); return <tr key={line.productId}><td>{product?.name || line.productId}{product?.brand ? ` · ${product.brand}` : ""}</td><td>{line.quantity}</td><td>{formatKwanza(line.unitPriceCents)}</td><td>{Number(line.taxRate * 100).toFixed(0)}%</td><td>{formatKwanza(line.unitPriceCents * line.quantity)}</td></tr>; })}</tbody></table><div className="invoice-totals"><span>Subtotal <b>{formatKwanza(completedSale.sale.subtotalCents)}</b></span>{taxSummary.map((entry) => <span key={entry.rate}>Base IVA {Number(entry.rate * 100).toFixed(0)}%: <b>{formatKwanza(entry.baseCents)} · Imposto: {formatKwanza(entry.taxCents)}</b></span>)}<span>Desconto <b>- {formatKwanza(completedSale.sale.discountCents ?? 0)}</b></span><strong>Total Geral <b>{formatKwanza(completedSale.sale.totalCents)}</b></strong></div><div className="invoice-footer"><div><p>Pagamento: <b>{completedSale.sale.fiscalType === "PROFORMA" ? "—" : completedSale.sale.paymentMethod === "CASH" ? "Dinheiro" : completedSale.sale.paymentMethod === "CARD" ? "TPA / Multicaixa" : completedSale.sale.paymentMethod === "TRANSFER" ? "Transferência" : "Pagamento misto"}</b></p><p>Troco: <b>{formatKwanza(Math.max(0, (completedSale.sale.cashCents ?? 0) - completedSale.sale.totalCents))}</b></p><small>{completedSale.sale.fiscalType === "PROFORMA" ? "Documento não fiscal" : `${completedSale.hash}-Processado por programa certificado n.º XX/AGT/2026`}</small></div><div className="invoice-qr">{completedSale.sale.fiscalType === "PROFORMA" ? null : invoiceQrImage ? <img src={invoiceQrImage} alt="Código QR fiscal" /> : <div className="qr-symbol">QR</div>}</div></div><div className="invoice-actions no-print"><button className="checkout" onClick={() => window.print()}>Imprimir Fatura</button><button onClick={() => void ((window as unknown as { pos?: { saveInvoicePdf?: (title: string) => Promise<unknown> } }).pos?.saveInvoicePdf?.(completedSale.sale.number) ?? Promise.resolve())}>Descarregar PDF</button><button onClick={() => { setCompletedSale(null); setDocumentType("INVOICE_RECEIPT"); }}>Nova Venda</button></div><p className="print-hint no-print">Enter ou P imprime diretamente.</p></div></div>}
    {modal === "profile" && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><h2>Perfil de administrador</h2><label>Username<input value={profile.username || session.username || ""} onChange={(e) => setProfile({ ...profile, username: e.target.value })} /></label><label>Nome de apresentação<input value={profile.displayName || session.displayName || ""} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} /></label><label>Password atual<input required type="password" value={profile.currentPassword} onChange={(e) => setProfile({ ...profile, currentPassword: e.target.value })} /></label><label>Nova password (mínimo 8 caracteres)<input type="password" minLength={8} value={profile.newPassword} onChange={(e) => setProfile({ ...profile, newPassword: e.target.value })} />    </label><label>{session.authMethod === "pin" ? "PIN atual" : "Novo PIN (6 dígitos)"}<input inputMode="numeric" maxLength={6} type="password" value={session.authMethod === "pin" ? profile.currentPin : profile.newPin} onChange={(e) => setProfile({ ...profile, ...(session.authMethod === "pin" ? { currentPin: e.target.value.replace(/\D/g, "").slice(0, 6) } : { newPin: e.target.value.replace(/\D/g, "").slice(0, 6) }) })} /></label>{session.authMethod === "pin" && <label>Novo PIN (6 dígitos)<input inputMode="numeric" maxLength={6} type="password" value={profile.newPin} onChange={(e) => setProfile({ ...profile, newPin: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></label>}{profileMessage && <p className="success">{profileMessage}</p>}<div className="modal-actions"><button className="checkout" onClick={() => void saveProfile()}>Guardar alterações</button><button onClick={() => setModal(null)}>Fechar</button></div></div></div>}
  </main>;
}

function LicenseGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const check = async () => {
    if (!window.pos?.getLicenseStatus) { setStatus({ valid: false, reason: "desktop_only", hardwareId: "indisponível" }); return; }
    setStatus(await window.pos.getLicenseStatus());
  };
  useEffect(() => { void check(); const timer = window.setInterval(() => void check(), 86_400_000); return () => window.clearInterval(timer); }, []);
  const activate = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    if (!token.trim() || !window.pos?.activateLicense) { setMessage("Cole uma chave de licença válida."); return; }
    const result = await window.pos.activateLicense(token);
    if (!result.valid) { setMessage(result.reason === "hardware_mismatch" ? "A licença pertence a outro computador." : result.reason === "invalid_signature" ? "A assinatura da licença é inválida." : result.reason === "expired" ? "A licença já expirou." : "Não foi possível validar a licença."); return; }
    setStatus(result); setToken(""); setMessage("Licença ativada com sucesso.");
  };
  if (status?.valid) return <>{children}</>;
  if (!status) return <main className="startup-loading"><div className="spinner" /><p>A validar a licença local…</p></main>;
  return <main className="license-lock"><section className="license-card"><div className="brand-mark">V<span>J</span></div><p className="eyebrow">VENDAJÁ ANGOLA</p><h1>Licença necessária</h1><p>O sistema está protegido por uma licença local assinada digitalmente. Os dados das vendas permanecem neste computador.</p><div className="license-warning">{status.reason === "clock_tampering" ? "Foi detetada uma alteração retroativa do relógio do Windows." : status.reason === "expired" ? `A licença caducou em ${status.expiresAt ? new Date(status.expiresAt).toLocaleDateString("pt-PT") : "data desconhecida"}.` : "Não existe uma licença válida neste computador."}</div><label>Hardware ID<input readOnly value={status.hardwareId} onFocus={(event) => event.currentTarget.select()} /></label><form onSubmit={activate}><label>Nova chave de licença<textarea required value={token} onChange={(event) => setToken(event.target.value)} placeholder="Cole aqui o conteúdo do ficheiro .key" /></label><button className="checkout" type="submit">Ativar licença</button></form>{message && <p className={message.includes("sucesso") ? "success" : "login-error"}>{message}</p>}<small>Envie o Hardware ID ao fornecedor para emitir uma renovação de 6 ou 12 meses.</small></section></main>;
}
function Boot() { const [ready, setReady] = useState(false); useEffect(() => { void createPosStorage("angola-pos").getSales().then(() => setReady(true)).catch(() => setReady(true)); }, []); return ready ? <LicenseGate><App /></LicenseGate> : <main className="startup-loading"><div className="spinner" /><p>A iniciar o armazenamento offline…</p></main>; }
const root = document.getElementById("root"); if (!root) throw new Error("Elemento #root não encontrado."); createRoot(root).render(<ErrorBoundary><Boot /></ErrorBoundary>);
