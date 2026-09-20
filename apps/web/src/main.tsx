import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { createPosStorage, SyncEngine, formatKwanza } from "@angola/shared";
import { ErrorBoundary } from "./ErrorBoundary";
import "./style.css";
const api = () => (globalThis as { __POS_API_URL__?: string }).__POS_API_URL__ ?? (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "http://localhost:4000";
function Login({ onLogin }: { onLogin: () => void }) {
  const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); const response = await fetch(`${api()}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) }); const data = await response.json(); if (!response.ok) { setError("Credenciais inválidas."); return; } localStorage.setItem("accessToken", data.accessToken); localStorage.setItem("refreshToken", data.refreshToken); localStorage.setItem("posUser", JSON.stringify(data.user)); onLogin(); }
  return <main className="startup-loading"><form onSubmit={(e) => void submit(e)}><h1>VendaJá Angola</h1><input placeholder="Email ou username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /><input type="password" placeholder="Password ou PIN" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} /><button>Entrar</button>{error && <p>{error}</p>}</form></main>;
}
function Dashboard() {
  const [showConfig, setShowConfig] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);
  const [sales, setSales] = useState<Array<{ id: string; number: string; totalCents: number; status: string; createdAt: string }>>([]);
  const [salesError, setSalesError] = useState("");
  const storage = useMemo(() => createPosStorage("angola-pos-pwa"), []);
  useEffect(() => {
    const deviceId = localStorage.getItem("deviceId") ?? crypto.randomUUID();
    localStorage.setItem("deviceId", deviceId);
    const engine = new SyncEngine(storage, { apiUrl: api(), token: localStorage.getItem("accessToken") ?? "", deviceId, onState: setOnline });
    engine.start();
    return () => engine.stop();
  }, [storage]);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    fetch(`${api()}/api/v1/sales`, {
      headers: { authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Não foi possível carregar as vendas (${response.status}).`);
      const data = await response.json() as Array<{ id: string; number: string; totalCents: number; status: string; createdAt: string }>;
      setSales(data);
      setSalesError("");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSalesError(error instanceof Error ? error.message : "Não foi possível carregar as vendas.");
    });
    return () => controller.abort();
  }, [online]);
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((sale) => sale.createdAt.slice(0, 10) === today && sale.status !== "CANCELLED");
  const todayTotal = todaySales.reduce((sum, sale) => sum + sale.totalCents, 0);
  return <main><nav><b>VendaJá Angola</b><span>{online ? "● Online" : "● Offline"}　 Dashboard　 Produtos　 Vendas　 Relatórios　 <button onClick={() => setShowConfig(!showConfig)}>Configuração fiscal</button></span></nav><h1>Visão geral</h1>{!online && <p className="offline-notice">Modo offline ativo. As vendas locais serão sincronizadas quando a ligação for restabelecida.</p>}{showConfig && <section><h2>Configuração AGT</h2><p>Credenciais armazenadas cifradas; nunca são exibidas. A configuração requer acesso de administrador.</p><input type="file" aria-label="Certificado PFX" /><input type="password" placeholder="Passphrase do certificado" /><p><small>Validação SAF-T: estrutural até ser configurado o XSD oficial atual. Isto não constitui homologação legal.</small></p></section>}<div className="cards"><article><small>Vendas hoje</small><strong>{formatKwanza(todayTotal)}</strong><em>{todaySales.length} documentos</em></article><article><small>Documentos carregados</small><strong>{sales.length}</strong><em>{online ? "Dados do servidor" : "Dados disponíveis localmente"}</em></article><article><small>Estado da sincronização</small><strong>{online ? "Online" : "Offline"}</strong><em>{online ? "Sincronização automática ativa" : "Fila local preservada"}</em></article></div><section><h2>Últimas vendas</h2>{salesError && <p className="error-message">{salesError}</p>}<table><thead><tr><th>Documento</th><th>Data</th><th>Total</th><th>Estado</th></tr></thead><tbody>{sales.slice(0, 10).map((sale) => <tr key={sale.id}><td>{sale.number}</td><td>{new Date(sale.createdAt).toLocaleString("pt-AO")}</td><td>{formatKwanza(sale.totalCents)}</td><td><span className={sale.status === "CANCELLED" ? "cancelled" : "ok"}>{sale.status === "CANCELLED" ? "Anulado" : "Emitido"}</span></td></tr>)}{!sales.length && !salesError && <tr><td colSpan={4}>Ainda não existem vendas carregadas.</td></tr>}</tbody></table></section></main>;
}
function Boot() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let active = true;
    const storage = createPosStorage("angola-pos-pwa");
    console.log("[web] initializing local storage");
    Promise.race([
      storage.getSales(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("O armazenamento local demorou demasiado tempo a responder.")), 10000)),
    ]).then(() => { if (active) { console.log("[web] local storage ready"); setReady(true); } })
      .catch((reason: unknown) => { const next = reason instanceof Error ? reason : new Error(String(reason)); console.error("[web] local storage initialization failed", next); if (active) setError(next); });
    return () => { active = false; };
  }, []);
  if (error) return <main className="startup-error"><h1>Armazenamento local indisponível</h1><p>{error.message}</p><button onClick={() => window.location.reload()}>Recarregar</button></main>;
  if (!ready) return <main className="startup-loading"><div className="spinner" /><p>A iniciar o armazenamento offline…</p></main>;
  return localStorage.getItem("accessToken") ? <Dashboard /> : <Login onLogin={() => setReady(true)} />;
}
const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root não encontrado.");
console.log("[web] mounting React root");
createRoot(root).render(<ErrorBoundary><Boot /></ErrorBoundary>);
