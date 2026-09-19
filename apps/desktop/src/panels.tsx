import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { formatKwanza, type Product } from "@angola/shared";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

const money = (value: string) => Math.max(0, Math.round(Number(value.replace(",", ".")) * 100) || 0);
type Props = { api: string; token: string; admin: boolean; onError: (message: string) => void; currentUser?: { displayName?: string; username?: string }; authorizeOffline?: (pin: string) => Promise<unknown>; onSessionExpired?: () => void };
type DeviceSettings = { source: "camera" | "hid"; deviceId: string; width: number; height: number; continuousFocus: boolean; lowLight: boolean };
const headers = (token: string) => ({ authorization: token ? "Bearer " + token : "", "content-type": "application/json" });
const localProductsKey = "vendaja-local-products";
const localCashKey = "vendaja-local-cash";
const localAttendantsKey = "vendaja-local-attendants";
const localFiscalKey = "vendaja-local-fiscal";
const localAccountingKey = "vendaja-local-accounting";
const fallbackAccounts = [{ code: "6", name: "Caixa", type: "ASSET" }, { code: "7", name: "Clientes", type: "ASSET" }, { code: "8", name: "Fornecedores", type: "LIABILITY" }, { code: "9", name: "Vendas", type: "REVENUE" }, { code: "10", name: "Compras", type: "EXPENSE" }];
async function localPinHash(value: string): Promise<string> { const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(data), byte => byte.toString(16).padStart(2, "0")).join(""); }
const localProducts: Product[] = [
  { id: "coffee", sku: "CAF-001", name: "Café Angola", priceCents: 125000, stock: 42, taxRate: 0.14, active: true },
  { id: "water", sku: "AGU-001", name: "Água mineral", priceCents: 75000, stock: 80, taxRate: 0.14, active: true },
  { id: "bread", sku: "PAO-001", name: "Pão de forma", priceCents: 150000, stock: 18, taxRate: 0.05, active: true },
];
function readLocalProducts(): Product[] {
  try { const saved = JSON.parse(localStorage.getItem(localProductsKey) ?? "null"); if (Array.isArray(saved)) return saved as Product[]; } catch { /* use defaults */ }
  localStorage.setItem(localProductsKey, JSON.stringify(localProducts)); return localProducts;
}
function writeLocalProducts(items: Product[]) { localStorage.setItem(localProductsKey, JSON.stringify(items)); window.dispatchEvent(new CustomEvent("catalog-updated")); }
async function request<T>(url: string, token: string, options: RequestInit = {}): Promise<T> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      response = await fetch(url, { ...options, headers: { ...headers(token), ...(options.headers ?? {}) } });
      break;
    } catch {
      if (attempt === 3) throw new Error("BACKEND_UNAVAILABLE");
      await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  if (!response) throw new Error("BACKEND_UNAVAILABLE");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message ?? data.error ?? `Erro ${response.status}`);
    error.name = data.error ?? `HTTP_${response.status}`;
    throw error;
  }
  return data as T;
}

type ProductForm = { id?: string; name: string; sku: string; barcode: string; qrCode: string; costCents: number; priceCents: number; taxRate: number; exemptionCode: string; stock: number; imageUrl: string; brand: string; model: string; categoryName: string };
const emptyProduct: ProductForm = { name: "", sku: "", barcode: "", qrCode: "", costCents: 0, priceCents: 0, taxRate: 0.14, exemptionCode: "", stock: 0, imageUrl: "", brand: "", model: "", categoryName: "" };
function parseScannedProduct(value: string): Partial<ProductForm> {
  const raw = value.trim();
  const read = (key: string) => raw.match(new RegExp(`(?:^|[|;,\\n])\\s*${key}\\s*[:=]\\s*([^|;,\\n]+)`, "i"))?.[1]?.trim();
  const barcode = read("barcode|ean|ean13") ?? (/^\d{8,14}$/.test(raw) ? raw : undefined);
  const sku = read("sku|codigo|código") ?? barcode;
  return {
    name: read("name|nome|product|produto") ?? "",
    brand: read("brand|marca") ?? "",
    sku: sku ?? "",
    barcode: barcode ?? "",
    qrCode: raw,
    priceCents: read("price|preço|preco") ? money(read("price|preço|preco")!) : 0,
  };
}

export function ProductsPanel({ api, token, admin, onError }: Props) {
  const [items, setItems] = useState<Product[]>([]); const [form, setForm] = useState<ProductForm>(emptyProduct); const [editing, setEditing] = useState(false); const [adjust, setAdjust] = useState<Product | null>(null); const [quantity, setQuantity] = useState(""); const [message, setMessage] = useState(""); const [scannerActive, setScannerActive] = useState(false); const [scanInput, setScanInput] = useState(""); const scanBuffer = useRef(""); const scanTimer = useRef<number | undefined>(undefined); const priceInput = useRef<HTMLInputElement>(null); const cameraVideo = useRef<HTMLVideoElement>(null); const cameraControls = useRef<{ stop: () => void } | null>(null);
  const load = () => request<Product[]>(`${api}/api/v1/products`, token).then((items) => { setItems(items); localStorage.setItem(localProductsKey, JSON.stringify(items)); }).catch(() => setItems(readLocalProducts()));
  useEffect(() => { void load(); }, []);
  const handleScan = (raw: string) => {
    const value = raw.trim(); if (!value) return;
    const parsed = parseScannedProduct(value);
    const code = (parsed.barcode || parsed.sku || value).toLowerCase();
    const existing = items.find((item) => [item.id, item.sku, item.barcode, item.qrCode].filter(Boolean).some((candidate) => candidate!.toLowerCase() === code || candidate!.toLowerCase() === value.toLowerCase()));
    if (existing) {
      setMessage("Produto já registado! Deseja dar entrada de stock?");
      if (window.confirm("Produto já registado! Deseja dar entrada de stock?")) { setAdjust(existing); setQuantity(""); }
      return;
    }
    setForm((current) => ({ ...current, ...parsed, barcode: parsed.barcode || current.barcode, sku: parsed.sku || current.sku }));
    setEditing(true); setScannerActive(false); setMessage("Dados preenchidos pelo scanner. Confirme preço e stock."); window.setTimeout(() => priceInput.current?.focus(), 0);
  };
  useEffect(() => {
    if (!scannerActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") { const value = scanBuffer.current; scanBuffer.current = ""; if (value) handleScan(value); return; }
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) { scanBuffer.current += event.key; window.clearTimeout(scanTimer.current); scanTimer.current = window.setTimeout(() => { scanBuffer.current = ""; }, 180); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(scanTimer.current); };
  }, [scannerActive, items]);
  const startProductCamera = async () => {
    try {
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.UPC_A,
        BarcodeFormat.QR_CODE,
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      cameraControls.current?.stop();
      const constraints = { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 }, advanced: [{ focusMode: "continuous" }] } } as unknown as MediaStreamConstraints;
      cameraControls.current = await reader.decodeFromConstraints(constraints, cameraVideo.current!, (result) => { if (result) { handleScan(result.getText()); cameraControls.current?.stop(); } });
    } catch (error) { onError(error instanceof Error ? error.message : "Não foi possível iniciar a câmara."); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!admin) return onError("Apenas ADMIN pode alterar produtos.");
    try { const { categoryName: _categoryName, ...payload } = form; try { await request(`${api}/api/v1/products${form.id ? `/${form.id}` : ""}`, token, { method: form.id ? "PATCH" : "POST", body: JSON.stringify(payload) }); } catch { const current = readLocalProducts(); const saved = { ...payload, id: form.id ?? crypto.randomUUID(), active: true } as Product; writeLocalProducts(form.id ? current.map((item) => item.id === form.id ? saved : item) : [...current, saved]); } setForm(emptyProduct); setEditing(false); setMessage("Produto guardado."); await load(); } catch (e) { onError(e instanceof Error ? e.message : "Falha ao guardar produto."); }
  };
  const readImage = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/")) return onError("Selecione um ficheiro de imagem."); if (file.size > 1_500_000) return onError("A imagem deve ter no máximo 1,5 MB."); const reader = new FileReader(); reader.onload = () => setForm(current => ({ ...current, imageUrl: String(reader.result) })); reader.readAsDataURL(file); };
  const remove = async (product: Product) => { if (!confirm(`Eliminar ${product.name}?`)) return; try { try { await request(`${api}/api/v1/products/${product.id}`, token, { method: "DELETE" }); } catch { writeLocalProducts(readLocalProducts().filter((item) => item.id !== product.id)); } await load(); } catch (e) { onError(e instanceof Error ? e.message : "Falha ao eliminar."); } };
  const saveAdjustment = async () => { const value = Number(quantity); if (!Number.isInteger(value) || value === 0) return onError("Indique uma quantidade inteira diferente de zero."); try { try { await request(`${api}/api/v1/stock/adjustments`, token, { method: "POST", body: JSON.stringify({ productId: adjust?.id, quantity: value, note: "Ajuste manual no painel de stock" }) }); } catch { writeLocalProducts(readLocalProducts().map((item) => item.id === adjust?.id ? { ...item, stock: Math.max(0, item.stock + value) } : item)); } setAdjust(null); setQuantity(""); await load(); } catch (e) { onError(e instanceof Error ? e.message : "Falha ao ajustar stock."); } };
  return <section className="panel"><div className="panel-heading"><div><h2>Produtos / Stock</h2><p>Catálogo, preços e movimentos de inventário.</p></div>{admin && <div className="modal-actions"><button onClick={() => { setScannerActive(!scannerActive); setEditing(true); }}> {scannerActive ? "Parar scanner" : "Scanner ativo"} </button><button className="checkout" onClick={() => { setForm(emptyProduct); setEditing(true); }}>+ Novo Produto</button></div>}</div>
    {scannerActive && <div className="card scanner-card"><strong>Scanner ativo</strong><p>Leia com leitor USB/HID ou use a câmara. Um produto existente abre diretamente o ajuste de stock.</p><input autoFocus value={scanInput} onChange={e => setScanInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(scanInput); setScanInput(""); } }} placeholder="Código lido ou payload estruturado" /><button onClick={() => void startProductCamera()}>Abrir câmara</button><video ref={cameraVideo} className="qr-camera" muted playsInline /></div>}
    {editing && <form className="form-grid card" onSubmit={submit}><h3>{form.id ? "Editar produto" : "Novo produto"}</h3><label>Nome<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>SKU / código de barras<input required value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value, barcode: e.target.value })} /></label><label>QR Code do produto<input value={form.qrCode} placeholder="Código QR opcional" onChange={e => setForm({ ...form, qrCode: e.target.value })} /></label><label>Categoria<input value={form.categoryName} placeholder="Eletrónicos/Telemóveis" onChange={e => setForm({ ...form, categoryName: e.target.value })} /></label><label>Marca / fabricante<input value={form.brand} placeholder="Coca-Cola, Samsung, Apple..." onChange={e => setForm({ ...form, brand: e.target.value })} /></label>{/eletrónicos|eletronicos|telemóveis|telemoveis/i.test(form.categoryName) && <label>Modelo<input value={form.model} placeholder="Galaxy S23" onChange={e => setForm({ ...form, model: e.target.value })} /></label>}<label>Imagem por URL<input type="url" value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl} placeholder="https://..." onChange={e => setForm({ ...form, imageUrl: e.target.value })} /></label><label>Carregar imagem<input type="file" accept="image/*" onChange={readImage} /></label>{form.imageUrl && <div className="image-preview"><img src={form.imageUrl} alt="Pré-visualização do produto" /><button type="button" onClick={() => setForm({ ...form, imageUrl: "" })}>Remover imagem</button></div>}<label>Preço de custo (Kz)<input type="number" min="0" value={form.costCents / 100} onChange={e => setForm({ ...form, costCents: money(e.target.value) })} /></label>    <label>Preço de venda (Kz)<input ref={priceInput} required type="number" min="0" value={form.priceCents / 100} onChange={e => setForm({ ...form, priceCents: money(e.target.value) })} /></label><label>IVA<select value={form.taxRate} onChange={e => setForm({ ...form, taxRate: Number(e.target.value) })}><option value="0.14">14%</option><option value="0">Isento</option></select></label>{form.taxRate === 0 && <label>Razão de isenção<input required value={form.exemptionCode} placeholder="Código AGT" onChange={e => setForm({ ...form, exemptionCode: e.target.value })} /></label>}<label>Stock inicial<input type="number" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} /></label><div className="modal-actions"><button className="checkout">Guardar</button><button type="button" onClick={() => setEditing(false)}>Cancelar</button></div></form>}
    {message && <p className="success">{message}</p>}<div className="table-wrap"><table><thead><tr><th>Produto</th><th>Marca</th><th>SKU</th><th>Venda</th><th>IVA</th><th>Stock</th><th>Ações</th></tr></thead><tbody>{items.map(p => <tr key={p.id}><td>{p.imageUrl ? <img className="table-product-image" src={p.imageUrl} alt="" /> : <span className="table-product-placeholder">▦</span>}{p.name}{p.model ? ` · ${p.model}` : ""}</td><td>{p.brand || "—"}</td><td>{p.sku}</td><td>{formatKwanza(p.priceCents)}</td><td>{p.taxRate === 0 ? `Isento ${p.exemptionCode ?? ""}` : `${Number(p.taxRate) * 100}%`}</td><td className={p.stock < 10 ? "low-stock" : ""}>{p.stock}</td><td className="actions">{admin && <><button onClick={() => { setForm({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode ?? p.sku, qrCode: p.qrCode ?? "", costCents: p.costCents ?? 0, priceCents: p.priceCents, taxRate: Number(p.taxRate), exemptionCode: p.exemptionCode ?? "", stock: p.stock, imageUrl: p.imageUrl ?? "", brand: p.brand ?? "", model: p.model ?? "", categoryName: "" }); setEditing(true); }}>Editar</button><button className="danger-text" onClick={() => void remove(p)}>Eliminar</button><button onClick={() => setAdjust(p)}>Ajustar stock</button></>}</td></tr>)}</tbody></table></div>
    {adjust && <div className="modal-backdrop"><div className="modal"><h2>Ajustar stock: {adjust.name}</h2><p>Stock atual: {adjust.stock}. Use valor positivo para entrada e negativo para saída.</p><input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} autoFocus /><div className="modal-actions"><button className="checkout" onClick={() => void saveAdjustment()}>Registar movimento</button><button onClick={() => setAdjust(null)}>Cancelar</button></div></div></div>}
  </section>;
}

type SaleRow = { id: string; number: string; totalCents: number; createdAt: string; status: string; lines: { quantity: number }[] };
export function DashboardPanel({ api, token, onError }: Omit<Props, "admin">) {
  const [sales, setSales] = useState<SaleRow[]>([]); const [products, setProducts] = useState<Product[]>([]);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const cachedProducts = readLocalProducts();
      try {
        const [s, p] = await Promise.all([
          request<SaleRow[]>(`${api}/api/v1/sales`, token),
          request<Product[]>(`${api}/api/v1/products`, token),
        ]);
        if (!active) return;
        setSales(Array.isArray(s) ? s : []);
        setProducts(Array.isArray(p) ? p : cachedProducts);
        setOffline(false);
      } catch (error) {
        if (!active) return;
        setSales([]);
        setProducts(cachedProducts);
        setOffline(true);
        console.warn("[dashboard] using offline defaults", error);
      }
    };
    void load();
    return () => { active = false; };
  }, [api, token]);
  const today = new Date().toISOString().slice(0, 10); const todaySales = sales.filter(s => s.createdAt.slice(0, 10) === today && s.status !== "CANCELLED"); const sum = (rows: SaleRow[]) => rows.reduce((n, s) => n + s.totalCents, 0);
  return <section className="panel"><h2>Dashboard</h2>{offline && <p className="alert">Modo offline: a apresentar os dados locais disponíveis.</p>}<div className="metrics"><div><small>Vendas de hoje</small><strong>{formatKwanza(sum(todaySales))}</strong></div><div><small>Total acumulado</small><strong>{formatKwanza(sum(sales))}</strong></div><div><small>Faturas emitidas</small><strong>{sales.length}</strong></div><div><small>Stock baixo</small><strong>{products.filter(p => p.stock < 10).length}</strong></div></div><div className="card"><h3>Últimas transações</h3><div className="table-wrap"><table><thead><tr><th>Documento</th><th>Data</th><th>Total</th><th>Estado</th></tr></thead><tbody>{sales.slice(0, 15).map(s => <tr key={s.id}><td>{s.number}</td><td>{new Date(s.createdAt).toLocaleString("pt-PT")}</td><td>{formatKwanza(s.totalCents)}</td><td>{s.status}</td></tr>)}</tbody></table></div></div></section>;
}

export function CashPanel({ api, token, onError, currentUser, authorizeOffline, onSessionExpired }: Omit<Props, "admin">) {
  const [session, setSession] = useState<{ id: string; openingCents: number; sangriaCents: number; suprimentoCents: number; openedAt: string; closedAt?: string; operatorName?: string; operatorNif?: string; operatorPhone?: string; terminalId?: string; summary?: { salesCount: number; totalCents: number; cashCents: number; cardCents: number; transferCents: number; expectedCashCents: number } } | null>(null); const [amount, setAmount] = useState(""); const [opening, setOpening] = useState(""); const [closing, setClosing] = useState(""); const [pin, setPin] = useState(""); const [operatorName, setOperatorName] = useState(currentUser?.displayName ?? ""); const [operatorNif, setOperatorNif] = useState(""); const [operatorPhone, setOperatorPhone] = useState(""); const [terminalId, setTerminalId] = useState(localStorage.getItem("terminalId") ?? "01");
  const load = () => request<typeof session>(`${api}/api/v1/fiscal/cash/current`, token).then(setSession).catch(() => { try { setSession(JSON.parse(localStorage.getItem(localCashKey) ?? "null")); } catch { setSession(null); } }); useEffect(() => { void load(); const refresh = () => void load(); window.addEventListener("cash-updated", refresh); const timer = window.setInterval(refresh, 5000); return () => { window.removeEventListener("cash-updated", refresh); window.clearInterval(timer); }; }, []);
  const open = async () => { if (!/^\d{4,6}$/.test(pin)) return onError("Introduza o PIN individual do atendedor (4 a 6 dígitos)."); try { let opened: { id: string; operatorName?: string; operatorNif?: string; operatorPhone?: string; terminalId?: string; attendant?: { name?: string; nif?: string; phone?: string } }; try { opened = await request<typeof opened>(`${api}/api/v1/cashier/open-shift`, "", { method: "POST", body: JSON.stringify({ pin, initialAmount: Number(opening.replace(",", ".")) || 0, registerNumber: terminalId }) }); } catch (error) { if (!(error instanceof Error && error.message === "BACKEND_UNAVAILABLE")) throw error; const records = JSON.parse(localStorage.getItem(localAttendantsKey) ?? "[]") as Array<{ pinHash: string; displayName: string; nif: string; phone: string }>; const pinHash = await localPinHash(pin); const attendant = records.find(record => record.pinHash === pinHash); if (!attendant) throw new Error("invalid_attendant_pin"); opened = { id: `local-cash-${Date.now()}`, operatorName: attendant.displayName, operatorNif: attendant.nif, operatorPhone: attendant.phone, terminalId }; } const resolvedName = opened.attendant?.name ?? opened.operatorName ?? operatorName; const resolvedNif = opened.attendant?.nif ?? opened.operatorNif ?? operatorNif; const resolvedPhone = opened.attendant?.phone ?? opened.operatorPhone ?? operatorPhone; const local = { id: opened.id, openingCents: money(opening), sangriaCents: 0, suprimentoCents: 0, openedAt: new Date().toISOString(), operatorName: resolvedName, operatorNif: resolvedNif, operatorPhone: resolvedPhone, terminalId, summary: { salesCount: 0, totalCents: 0, cashCents: 0, cardCents: 0, transferCents: 0, expectedCashCents: money(opening) } }; localStorage.setItem(localCashKey, JSON.stringify(local)); localStorage.setItem("activeCashSessionId", opened.id); localStorage.setItem("terminalId", terminalId); localStorage.setItem("cashOperatorNif", resolvedNif); localStorage.setItem("cashOperatorPhone", resolvedPhone); localStorage.setItem("cashOperatorName", resolvedName); setOperatorName(resolvedName); setOperatorNif(resolvedNif); setOperatorPhone(resolvedPhone); setPin(""); setOpening(""); await load(); } catch (e) { const message = e instanceof Error ? e.message : "Falha ao abrir caixa."; onError(message === "BACKEND_UNAVAILABLE" ? `Não foi possível conectar ao servidor backend (${api}).` : message === "invalid_attendant_pin" ? "PIN de atendedor inválido ou não cadastrado" : message); } };
  const online = () => typeof navigator === "undefined" || navigator.onLine;
  const adjustment = async (type: "SANGRIA" | "SUPRIMENTO") => { if (!session) return; try { try { await request(`${api}/api/v1/fiscal/cash/${session.id}/adjustment`, token, { method: "POST", body: JSON.stringify({ type, amountCents: money(amount) }) }); } catch { const next = { ...session, [type === "SANGRIA" ? "sangriaCents" : "suprimentoCents"]: (session[type === "SANGRIA" ? "sangriaCents" : "suprimentoCents"] ?? 0) + money(amount) }; localStorage.setItem(localCashKey, JSON.stringify(next)); } setAmount(""); await load(); } catch (e) { onError(e instanceof Error ? e.message : "Falha no movimento."); } };
  const close = async () => { if (!session) return; try { try { await request(`${api}/api/v1/fiscal/cash/${session.id}/close`, token, { method: "POST", body: JSON.stringify({ closingCents: money(closing) }) }); } catch { localStorage.removeItem(localCashKey); } localStorage.removeItem("activeCashSessionId"); setClosing(""); await load(); } catch (e) { onError(e instanceof Error ? e.message : "Falha ao fechar caixa."); } };
  return <section className="panel"><h2>Caixa</h2>{!session ? <div className="card form-grid"><h3>Abertura de turno</h3><label>PIN individual do atendedor<input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} /></label><label>Fundo de maneio / troco (Kz)<input type="number" value={opening} onChange={e => setOpening(e.target.value)} /></label><label>Número do caixa<input value={terminalId} onChange={e => setTerminalId(e.target.value)} /></label><p className="muted">O nome, NIF e telefone são preenchidos automaticamente após a validação do PIN individual.</p><button className="checkout" onClick={() => void open()}>Validar PIN e abrir turno</button></div> :  <><div className="metrics"><div><small>Vendas do turno</small><strong>{formatKwanza(session.summary?.totalCents ?? 0)}</strong></div><div><small>Saldo em dinheiro</small><strong>{formatKwanza(session.summary?.expectedCashCents ?? session.openingCents)}</strong></div><div><small>TPA / Multicaixa</small><strong>{formatKwanza(session.summary?.cardCents ?? 0)}</strong></div><div><small>Transferências</small><strong>{formatKwanza(session.summary?.transferCents ?? 0)}</strong></div></div><div className="metrics"><div><small>Aberto em</small><strong>{new Date(session.openedAt).toLocaleString("pt-PT")}</strong></div><div><small>Valor inicial</small><strong>{formatKwanza(session.openingCents)}</strong></div><div><small>Sangrias</small><strong>{formatKwanza(session.sangriaCents)}</strong></div><div><small>Suprimentos</small><strong>{formatKwanza(session.suprimentoCents)}</strong></div></div><div className="card form-grid"><h3>Movimento de caixa</h3><label>Valor (Kz)<input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></label><div className="modal-actions"><button onClick={() => void adjustment("SANGRIA")}>Registar sangria</button><button onClick={() => void adjustment("SUPRIMENTO")}>Registar suprimento</button></div></div><div className="card form-grid"><h3>Fechamento cego</h3><label>Valor contado (Kz)<input type="number" value={closing} onChange={e => setClosing(e.target.value)} /></label><button className="admin" onClick={() => void close()}>Fechar caixa</button></div></>}</section>;
}

type EmployeeRow = {
  id: string;
  fullName: string;
  nif?: string | null;
  inss?: string | null;
  position: string;
  department?: string | null;
  contractType: string;
  iban?: string | null;
  baseSalaryCents: number;
  foodAllowanceCents?: number;
  transportAllowanceCents?: number;
  housingAllowanceCents?: number;
  otherAllowancesCents?: number;
  active?: boolean;
};

export function HRPanel({ api, token, admin, onError }: Props) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [payrollReport, setPayrollReport] = useState<{ rows: Array<{ id: string; employee: EmployeeRow; grossSalaryCents: number; inssEmployeeCents: number; inssEmployerCents: number; irtCents: number; netSalaryCents: number }>; totals?: { netSalaryCents: number } }>({ rows: [] });
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    nif: "",
    inss: "",
    position: "",
    department: "",
    contractType: "FIXED",
    iban: "",
    baseSalaryCents: 0,
    foodAllowanceCents: 0,
    transportAllowanceCents: 0,
    housingAllowanceCents: 0,
    otherAllowancesCents: 0,
  });

  const load = () => request<EmployeeRow[]>(`${api}/api/v1/hr/employees`, token)
    .then(setEmployees)
    .catch(() => setEmployees([]));

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!admin) return onError("Apenas o administrador pode gerir RH.");
    try {
      await request(`${api}/api/v1/hr/employees`, token, {
        method: "POST",
        body: JSON.stringify({ ...form, baseSalaryCents: money(String(form.baseSalaryCents / 100)), foodAllowanceCents: money(String(form.foodAllowanceCents / 100)), transportAllowanceCents: money(String(form.transportAllowanceCents / 100)), housingAllowanceCents: money(String(form.housingAllowanceCents / 100)), otherAllowancesCents: money(String(form.otherAllowancesCents / 100)) }),
      });
      setForm({ fullName: "", nif: "", inss: "", position: "", department: "", contractType: "FIXED", iban: "", baseSalaryCents: 0, foodAllowanceCents: 0, transportAllowanceCents: 0, housingAllowanceCents: 0, otherAllowancesCents: 0 });
      setMessage("Colaborador registado.");
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao registrar colaborador.");
    }
  };

  const computePayroll = async (employeeId: string) => {
    try {
      const payload = await request<{ payslip: { employee: string; month: string; netSalaryCents: number } }>(`${api}/api/v1/hr/payrolls/compute`, token, {
        method: "POST",
        body: JSON.stringify({ employeeId, month: new Date().toISOString().slice(0, 7) }),
      });
      setMessage(`Salário processado para ${payload.payslip.employee}: ${formatKwanza(payload.payslip.netSalaryCents)}`);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao processar salário.");
    }
  };
  const processMonth = async () => {
    if (!admin) return onError("Apenas o administrador pode processar a folha.");
    try { await request(`${api}/api/v1/hr/payrolls/process-month`, token, { method: "POST", body: JSON.stringify({ month: payrollMonth }) }); setMessage(`Folha de ${payrollMonth} processada.`); await loadReport(); } catch (e) { onError(e instanceof Error ? e.message : "Falha ao processar folha."); }
  };
  const loadReport = async () => { try { setPayrollReport(await request<typeof payrollReport>(`${api}/api/v1/hr/payrolls/report?month=${payrollMonth}`, token)); } catch { setPayrollReport({ rows: [] }); } };
  useEffect(() => { void loadReport(); }, [payrollMonth]);

  return <section className="panel"><h2>Recursos Humanos</h2><div className="card form-grid"><h3>Nova ficha do colaborador</h3><label>Nome completo<input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></label><label>NIF<input value={form.nif} onChange={e => setForm({ ...form, nif: e.target.value })} /></label><label>INSS<input value={form.inss} onChange={e => setForm({ ...form, inss: e.target.value })} /></label><label>Cargo<input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></label><label>Departamento<input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></label><label>Tipo de contrato<select value={form.contractType} onChange={e => setForm({ ...form, contractType: e.target.value })}><option value="FIXED">Fixo</option><option value="PART_TIME">Parcial</option><option value="TEMPORARY">Temporário</option><option value="INTERNSHIP">Estágio</option></select></label><label>IBAN<input value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} /></label><label>Salário base (Kz)<input type="number" value={form.baseSalaryCents / 100} onChange={e => setForm({ ...form, baseSalaryCents: money(e.target.value) })} /></label><label>Subsídio alimentação (Kz)<input type="number" value={form.foodAllowanceCents / 100} onChange={e => setForm({ ...form, foodAllowanceCents: money(e.target.value) })} /></label><label>Subsídio transporte (Kz)<input type="number" value={form.transportAllowanceCents / 100} onChange={e => setForm({ ...form, transportAllowanceCents: money(e.target.value) })} /></label><label>Subsídio habitação (Kz)<input type="number" value={form.housingAllowanceCents / 100} onChange={e => setForm({ ...form, housingAllowanceCents: money(e.target.value) })} /></label><label>Outros adicionais (Kz)<input type="number" value={form.otherAllowancesCents / 100} onChange={e => setForm({ ...form, otherAllowancesCents: money(e.target.value) })} /></label><button className="checkout" onClick={() => void save()}>Guardar colaborador</button>{message && <p className="success">{message}</p>}</div>
    <div className="table-wrap"><table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Salário Base</th><th>Contrato</th><th>Processamento</th></tr></thead><tbody>{employees.map(employee => <tr key={employee.id}><td>{employee.fullName}<small>{employee.nif ?? "Sem NIF"}</small></td><td>{employee.position}</td><td>{formatKwanza(employee.baseSalaryCents)}</td><td>{employee.contractType}</td><td><button onClick={() => void computePayroll(employee.id)}>Processar folha</button></td></tr>)}</tbody></table></div><div className="card"><h3>Processamento mensal e recibos</h3><div className="modal-actions"><label>Mês<input type="month" value={payrollMonth} onChange={e => setPayrollMonth(e.target.value)} /></label>{admin && <button className="checkout" onClick={() => void processMonth()}>Processar folha mensal</button>}<button onClick={() => void loadReport()}>Atualizar relatório</button></div><div className="table-wrap"><table><thead><tr><th>Colaborador</th><th>Bruto</th><th>INSS</th><th>IRT</th><th>Líquido</th><th>Recibo</th></tr></thead><tbody>{payrollReport.rows.map(row => <tr key={row.id}><td>{row.employee.fullName}</td><td>{formatKwanza(row.grossSalaryCents)}</td><td>{formatKwanza(row.inssEmployeeCents)}</td><td>{formatKwanza(row.irtCents)}</td><td>{formatKwanza(row.netSalaryCents)}</td><td><button onClick={() => window.open(`${api}/api/v1/hr/payrolls/${row.id}/payslip`, "_blank")}>Ver recibo</button></td></tr>)}</tbody></table></div></div></section>;
}

export function AccountingPanel({ api, token, admin, onError }: Props) {
  const [entries, setEntries] = useState<Array<{ id: string; description: string; entryDate: string; amountCents: number; debitAccount: { code: string; name: string }; creditAccount: { code: string; name: string } }>>([]);
  const [accounts, setAccounts] = useState<Array<{ code: string; name: string; type: string; category?: string | null }>>(fallbackAccounts);
  const [journalMode, setJournalMode] = useState(false);
  const [lines, setLines] = useState([{ accountCode: "6", debitCents: 0, creditCents: 0 }, { accountCode: "9", debitCents: 0, creditCents: 0 }]);
  const [columns, setColumns] = useState<4 | 8>(4);
  const [trial, setTrial] = useState<Array<{ code: string; name: string; debitCents: number; creditCents: number; debitBalanceCents: number; creditBalanceCents: number }>>([]);
  const [form, setForm] = useState({ description: "", debitAccountCode: "6", creditAccountCode: "9", amountCents: 0, sourceType: "MANUAL" });
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [chart, journal] = await Promise.all([
        request<Array<{ code: string; name: string; type: string; category?: string | null }>>(`${api}/api/v1/accounting/chart`, token),
        request<Array<{ id: string; description: string; entryDate: string; amountCents: number; debitAccount: { code: string; name: string }; creditAccount: { code: string; name: string } }>>(`${api}/api/v1/accounting/entries`, token),
      ]);
      setAccounts(chart);
      setEntries(journal);
      localStorage.setItem(localAccountingKey, JSON.stringify({ accounts: chart, entries: journal }));
    } catch (error) {
      console.warn("Accounting API unavailable; using local cache", error);
      setMessage("Modo offline: a contabilidade local está disponível. Os lançamentos serão sincronizados quando o servidor voltar.");
      try { const saved = JSON.parse(localStorage.getItem(localAccountingKey) ?? "{}"); setAccounts(saved.accounts?.length ? saved.accounts : fallbackAccounts); setEntries(saved.entries ?? []); } catch { setAccounts(fallbackAccounts); }
    }
  };

  useEffect(() => { void load(); }, []);

  const addEntry = async () => {
    if (!admin) return onError("Apenas o administrador pode lançar movimentos contabilísticos.");
    try {
      const payload = { ...form, amountCents: money(String(form.amountCents / 100)) };
      try { await request(`${api}/api/v1/accounting/entries`, token, { method: "POST", body: JSON.stringify(payload) }); }
      catch {
        const saved = JSON.parse(localStorage.getItem(localAccountingKey) ?? "{}");
        const find = (code: string) => accounts.find((a) => a.code === code) ?? { code, name: "Conta " + code };
        const localEntry = { id: crypto.randomUUID(), description: form.description, entryDate: new Date().toISOString(), amountCents: payload.amountCents, debitAccount: find(form.debitAccountCode), creditAccount: find(form.creditAccountCode) };
        const next = [...(saved.entries ?? []), localEntry]; localStorage.setItem(localAccountingKey, JSON.stringify({ accounts, entries: next })); setEntries(next); setMessage("Lançamento guardado localmente; será sincronizado quando online."); return;
      }
      setForm({ description: "", debitAccountCode: "6", creditAccountCode: "9", amountCents: 0, sourceType: "MANUAL" });
      setMessage("Lançamento contabilístico criado.");
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Falha ao criar lançamento.");
    }
  };
  const addJournal = async () => {
    if (!admin) return onError("Apenas o administrador pode lançar movimentos contabilísticos.");
    const debit = lines.reduce((n, l) => n + l.debitCents, 0); const credit = lines.reduce((n, l) => n + l.creditCents, 0);
    if (!form.description || debit <= 0 || debit !== credit) return onError("O diário deve ter descrição e débitos iguais aos créditos.");
    try { await request(`${api}/api/v1/accounting/journals`, token, { method: "POST", body: JSON.stringify({ description: form.description, journalType: form.sourceType, documentType: "MANUAL", lines }) }); setMessage("Diário criado."); setLines([{ accountCode: "6", debitCents: 0, creditCents: 0 }, { accountCode: "9", debitCents: 0, creditCents: 0 }]); await load(); } catch { const saved = JSON.parse(localStorage.getItem(localAccountingKey) ?? "{}"); localStorage.setItem(localAccountingKey, JSON.stringify({ ...saved, accounts, entries })); setMessage("Diário guardado localmente; será sincronizado quando online."); }
  };
  const loadTrial = async () => { try { const data = await request<{ rows: typeof trial }>(`${api}/api/v1/accounting/trial-balance?columns=${columns}`, token); setTrial(data.rows); } catch { setTrial([]); } };

  return <section className="panel"><h2>Contabilidade</h2><div className="card form-grid"><h3>Plano de contas e diário</h3><div className="modal-actions"><button onClick={() => setJournalMode(false)}>Lançamento simples</button><button onClick={() => setJournalMode(true)}>Diário multi-linha</button></div><label>Descrição<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>{journalMode ? lines.map((line, index) => <div className="modal-actions" key={index}><select value={line.accountCode} onChange={e => setLines(lines.map((l, i) => i === index ? { ...l, accountCode: e.target.value } : l))}>{accounts.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}</select><input type="number" placeholder="Débito" onChange={e => setLines(lines.map((l, i) => i === index ? { ...l, debitCents: money(e.target.value), creditCents: 0 } : l))} /><input type="number" placeholder="Crédito" onChange={e => setLines(lines.map((l, i) => i === index ? { ...l, creditCents: money(e.target.value), debitCents: 0 } : l))} />{index === lines.length - 1 && <button type="button" onClick={() => setLines([...lines, { accountCode: "6", debitCents: 0, creditCents: 0 }])}>+ linha</button>}</div>) : <><label>Conta de débito<select value={form.debitAccountCode} onChange={e => setForm({ ...form, debitAccountCode: e.target.value })}>{accounts.map(account => <option key={`debit-${account.code}`} value={account.code}>{account.code} - {account.name}</option>)}</select></label><label>Conta de crédito<select value={form.creditAccountCode} onChange={e => setForm({ ...form, creditAccountCode: e.target.value })}>{accounts.map(account => <option key={`credit-${account.code}`} value={account.code}>{account.code} - {account.name}</option>)}</select></label><label>Montante (Kz)<input type="number" value={form.amountCents / 100} onChange={e => setForm({ ...form, amountCents: money(e.target.value) })} /></label></>}<button className="checkout" onClick={() => void (journalMode ? addJournal() : addEntry())}>{journalMode ? "Criar diário" : "Criar lançamento"}</button>{message && <p className="success">{message}</p>}</div><div className="card"><h3>Balancete</h3><button onClick={() => void loadTrial()}>Atualizar</button><select value={columns} onChange={e => setColumns(Number(e.target.value) as 4 | 8)}><option value="4">4 colunas</option><option value="8">8 colunas</option></select><div className="table-wrap"><table><thead><tr><th>Conta</th><th>Débitos</th><th>Créditos</th><th>Saldo devedor</th><th>Saldo credor</th></tr></thead><tbody>{trial.map(r => <tr key={r.code}><td>{r.code} - {r.name}</td><td>{formatKwanza(r.debitCents)}</td><td>{formatKwanza(r.creditCents)}</td><td>{formatKwanza(r.debitBalanceCents)}</td><td>{formatKwanza(r.creditBalanceCents)}</td></tr>)}</tbody></table></div></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Débito</th><th>Crédito</th><th>Valor</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td>{new Date(entry.entryDate).toLocaleDateString("pt-PT")}</td><td>{entry.description}</td><td>{entry.debitAccount.code} - {entry.debitAccount.name}</td><td>{entry.creditAccount.code} - {entry.creditAccount.name}</td><td>{formatKwanza(entry.amountCents)}</td></tr>)}</tbody></table></div></section>;
}

export function DevicesPanel({ settings, onSave, onError }: { settings: DeviceSettings; onSave: (settings: DeviceSettings) => void; onError: (message: string) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [draft, setDraft] = useState(settings);
  const [testing, setTesting] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { setDraft(settings); }, [settings]);
  const listCameras = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "videoinput"));
      setMessage("Câmaras disponíveis carregadas.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível aceder às câmaras.");
    }
  };
  const startTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: draft.deviceId ? { exact: draft.deviceId } : undefined, width: { ideal: draft.width }, height: { ideal: draft.height } } });
      if (video) { video.srcObject = stream; await video.play(); }
      setTesting(true);
      setMessage("Teste ativo. Aponte um QR ou código de barras para validar a captura.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível iniciar o teste da câmara.");
    }
  };
  const stopTest = () => {
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
    setTesting(false);
  };
  return <section className="panel"><h2>Dispositivos / Periféricos</h2><p>Configure a câmara ou o scanner HID usado pelo operador antes de abrir o caixa.</p><div className="card form-grid"><label>Entrada de captura<select value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value as DeviceSettings["source"] })}><option value="camera">Câmara integrada / webcam USB</option><option value="hid">Scanner físico HID/USB (emulação de teclado)</option></select></label><label>Câmara<select value={draft.deviceId} onChange={e => setDraft({ ...draft, deviceId: e.target.value })}><option value="">Selecionar câmara automaticamente</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || `Câmara ${device.deviceId.slice(0, 8)}`}</option>)}</select></label><label>Resolução<select value={`${draft.width}x${draft.height}`} onChange={e => { const [width, height] = e.target.value.split("x").map(Number);   setDraft({ ...draft, width: width || draft.width, height: height || draft.height }); }}><option value="640x480">640 × 480</option><option value="1280x720">1280 × 720</option><option value="1920x1080">1920 × 1080</option></select></label><label className="checkbox-row"><input type="checkbox" checked={draft.continuousFocus} onChange={e => setDraft({ ...draft, continuousFocus: e.target.checked })} /> Foco contínuo</label><label className="checkbox-row"><input type="checkbox" checked={draft.lowLight} onChange={e => setDraft({ ...draft, lowLight: e.target.checked })} /> Otimização para pouca luz</label><div className="modal-actions"><button onClick={() => void listCameras()}>Detetar câmaras</button><button className="checkout" onClick={() => { onSave(draft); setMessage("Configuração guardada localmente."); }}>Guardar configuração</button></div>{message && <p className="success">{message}</p>}</div><div className="card"><h3>Teste em tempo real</h3><video ref={setVideo} className="qr-camera" muted playsInline />{testing ? <button className="admin" onClick={stopTest}>Parar teste</button> : <button className="checkout" onClick={() => void startTest()}>Iniciar teste visual</button>}<p className="muted">No modo HID, digite um código num campo de teste ou leia-o com o scanner para confirmar a entrada.</p></div></section>;
}

export function FiscalSettingsPanel({ api, token, onError }: Omit<Props, "admin">) {
  const [form, setForm] = useState({ companyName: "", companyNif: "", companyAddress: "", companyProvince: "", companyPhone: "", invoiceSeries: "A", saftSchedule: "", certificatePfx: "" }); const [message, setMessage] = useState("");
  const [attendant, setAttendant] = useState({ displayName: "", nif: "", phone: "", pin: "" }); const [editingAttendantId, setEditingAttendantId] = useState<string | null>(null); const [attendants, setAttendants] = useState<Array<{ id: string; displayName?: string; nif?: string; phone?: string }>>([]);
  type ManagedUser = { id: string; username: string; email: string; displayName?: string; role: string; createdAt?: string };
  const [users, setUsers] = useState<ManagedUser[]>([]); const [userForm, setUserForm] = useState({ username: "", email: "", displayName: "", role: "ROLE_CASHIER", pin: "" }); const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [license, setLicense] = useState<LicenseStatus | null>(null); const [licenseToken, setLicenseToken] = useState(""); const [licenseMessage, setLicenseMessage] = useState("");
  useEffect(() => { void request<typeof form & { configured: boolean }>(`${api}/api/v1/fiscal/config`, token).then(data => { setForm(f => ({ ...f, ...data })); localStorage.setItem(localFiscalKey, JSON.stringify(data)); }).catch(() => { try { setForm(f => ({ ...f, ...JSON.parse(localStorage.getItem(localFiscalKey) ?? "{}") })); } catch { /* defaults */ } }); }, []);
  useEffect(() => { void request<typeof attendants>(`${api}/api/v1/auth/attendants`, token).then(setAttendants).catch(() => undefined); }, [api, token]);
  useEffect(() => { void request<ManagedUser[]>(`${api}/api/v1/auth/users`, token).then(setUsers).catch(() => undefined); }, [api, token]);
  useEffect(() => { void window.pos?.getLicenseStatus?.().then(setLicense).catch(() => undefined); }, []);
  const save = async () => { try { try { await request(`${api}/api/v1/fiscal/config`, token, { method: "PUT", body: JSON.stringify(form) }); } catch { localStorage.setItem(localFiscalKey, JSON.stringify(form)); } setMessage("Definições fiscais guardadas."); } catch (e) { onError(e instanceof Error ? e.message : "Falha ao guardar."); } };
  const file = async (event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) setForm({ ...form, certificatePfx: await selected.text() }); };
  const saveAttendant = async () => { if (!editingAttendantId && !/^\d{4,6}$/.test(attendant.pin)) return onError("O PIN individual deve ter entre 4 e 6 dígitos."); try { const saved = await request<typeof attendants[number]>(`${api}/api/v1/auth/attendants${editingAttendantId ? `/${editingAttendantId}` : ""}`, token, { method: editingAttendantId ? "PATCH" : "POST", body: JSON.stringify(attendant) }); setAttendants(current => editingAttendantId ? current.map(item => item.id === editingAttendantId ? saved : item) : [...current, saved]); setAttendant({ displayName: "", nif: "", phone: "", pin: "" }); setEditingAttendantId(null); } catch (error) { if (error instanceof Error && error.message === "BACKEND_UNAVAILABLE" && !editingAttendantId) { const records = JSON.parse(localStorage.getItem(localAttendantsKey) ?? "[]") as unknown[]; records.push({ id: `local-${Date.now()}`, displayName: attendant.displayName, nif: attendant.nif, phone: attendant.phone, pinHash: await localPinHash(attendant.pin) }); localStorage.setItem(localAttendantsKey, JSON.stringify(records)); setAttendant({ displayName: "", nif: "", phone: "", pin: "" }); return; } onError(error instanceof Error ? error.message : "Falha ao guardar atendedor."); } };
  const saveUser = async () => { try { const saved = await request<ManagedUser>(`${api}/api/v1/auth/users${editingUserId ? `/${editingUserId}` : ""}`, token, { method: editingUserId ? "PATCH" : "POST", body: JSON.stringify(userForm) }); setUsers(current => editingUserId ? current.map(item => item.id === editingUserId ? saved : item) : [...current, saved]); setUserForm({ username: "", email: "", displayName: "", role: "ROLE_CASHIER", pin: "" }); setEditingUserId(null); } catch (error) { if (error instanceof Error && error.message === "BACKEND_UNAVAILABLE") { onError("Servidor local desligado. A tentar reconectar..."); return; } onError(error instanceof Error ? error.message : "Falha ao guardar utilizador."); } };
  const activate = async () => { setLicenseMessage(""); if (!licenseToken.trim() || !window.pos?.activateLicense) { setLicenseMessage("Cole uma chave de ativação válida."); return; } const result = await window.pos.activateLicense(licenseToken.trim()); if (!result.valid) { setLicenseMessage(result.reason ?? "Chave de licença inválida."); return; } setLicense(result); setLicenseToken(""); setLicenseMessage("Licença ativada. Os módulos foram atualizados."); window.dispatchEvent(new CustomEvent("license-updated", { detail: result })); };
  return <section className="panel"><h2>Definições fiscais</h2><div className="card form-grid"><label>Razão social<input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} /></label><label>NIF da empresa<input value={form.companyNif} onChange={e => setForm({ ...form, companyNif: e.target.value })} /></label><label>Endereço físico<input value={form.companyAddress} onChange={e => setForm({ ...form, companyAddress: e.target.value })} /></label><label>Província<input value={form.companyProvince} onChange={e => setForm({ ...form, companyProvince: e.target.value })} /></label><label>Telefone<input value={form.companyPhone} onChange={e => setForm({ ...form, companyPhone: e.target.value })} /></label><label>Série da fatura<input value={form.invoiceSeries} onChange={e => setForm({ ...form, invoiceSeries: e.target.value.toUpperCase() })} /></label><label>Agendamento SAF-T<input value={form.saftSchedule} onChange={e => setForm({ ...form, saftSchedule: e.target.value })} /></label><label>Certificado digital (.pfx/.pem)<input type="file" accept=".pfx,.pem" onChange={e => void file(e)} /></label><button className="checkout" onClick={() => void save()}>Guardar configuração fiscal</button>{message && <p className="success">{message}</p>}</div><div className="card form-grid"><h3>Gestão de Utilizadores / RH</h3><label>Username<input value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} /></label><label>E-mail<input type="email" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} /></label><label>Nome completo<input value={userForm.displayName} onChange={e => setUserForm({ ...userForm, displayName: e.target.value })} /></label><label>Perfil<select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}><option value="ROLE_ADMIN">Administrador</option><option value="ROLE_CASHIER">Atendedor / Caixa</option><option value="ROLE_HR">Recursos Humanos</option><option value="ROLE_ACCOUNTANT">Contabilidade</option></select></label><label>PIN individual (4–6 dígitos)<input type="password" inputMode="numeric" maxLength={6} value={userForm.pin} onChange={e => setUserForm({ ...userForm, pin: e.target.value.replace(/\D/g, "") })} /></label><button className="checkout" onClick={() => void saveUser()}>{editingUserId ? "Guardar utilizador" : "Criar utilizador"}</button><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Username</th><th>Perfil</th><th>Ação</th></tr></thead><tbody>{users.map(item => <tr key={item.id}><td>{item.displayName}</td><td>{item.username}</td><td>{item.role}</td><td><button onClick={() => { setEditingUserId(item.id); setUserForm({ username: item.username, email: item.email, displayName: item.displayName ?? "", role: item.role, pin: "" }); }}>Editar</button></td></tr>)}</tbody></table></div></div><div className="card form-grid"><h3>Licenciamento</h3><label>HWID<input readOnly value={license?.hardwareId ?? "A carregar…"} /></label><label>Chave de Ativação<textarea value={licenseToken} onChange={e => setLicenseToken(e.target.value)} placeholder="Cole a chave .key assinada digitalmente" /></label><button className="checkout" onClick={() => void activate()}>Ativar licença</button>{license?.modules?.length ? <p>Módulos ativos: {license.modules.join(", ")}</p> : null}{licenseMessage && <p className="success">{licenseMessage}</p>}</div><div className="card form-grid"><h3>Gestão de Atendedores / Caixas</h3><label>Nome completo<input value={attendant.displayName} onChange={e => setAttendant({ ...attendant, displayName: e.target.value })} /></label><label>NIF<input value={attendant.nif} onChange={e => setAttendant({ ...attendant, nif: e.target.value })} /></label><label>Telefone / celular<input value={attendant.phone} onChange={e => setAttendant({ ...attendant, phone: e.target.value })} /></label><label>PIN individual (4–6 dígitos){editingAttendantId ? <span className="muted"> deixe vazio para manter</span> : null}<input type="password" inputMode="numeric" maxLength={6} value={attendant.pin} onChange={e => setAttendant({ ...attendant, pin: e.target.value.replace(/\D/g, "") })} /></label><button className="checkout" onClick={() => void saveAttendant()}>{editingAttendantId ? "Guardar alterações" : "Cadastrar atendedor"}</button><div className="table-wrap"><table><thead><tr><th>Nome</th><th>NIF</th><th>Telefone</th><th>Ação</th></tr></thead><tbody>{attendants.map(item => <tr key={item.id}><td>{item.displayName}</td><td>{item.nif}</td><td>{item.phone}</td><td><button onClick={() => { setEditingAttendantId(item.id); setAttendant({ displayName: item.displayName ?? "", nif: item.nif ?? "", phone: item.phone ?? "", pin: "" }); }}>Editar</button></td></tr>)}</tbody></table></div></div></section>;
}
