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

export function StockDocumentsPanel({ api, token, admin, onError }: Props) {
  const [tab, setTab] = useState("overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [balances, setBalances] = useState<Array<{ product: Product; location: { name: string }; quantity: number; totalCostCents: number; averageCostCents: number }>>([]);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; currentStock: number; minStock: number; suggestedQuantity: number }>>([]);
  const [purchases, setPurchases] = useState<Array<{ id: string; number: string; supplierId: string; lines: Array<{ productId: string; quantity: number }> }>>([]);
  const [requests, setRequests] = useState<Array<{ number: string; quotations: Array<{ number: string; supplierId: string; status: string; lines: Array<{ productId: string; unitCostCents: number }> }> }>>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ productId: "", quantity: "1", reference: "", locationId: "", sourceLocationId: "", destinationLocationId: "", purchaseId: "", documentType: "CUSTOMER_RETURN", series: "A", number: "", customerId: "", supplierId: "", lotNumber: "", serialNumber: "", expiresAt: "", requestNumber: "", quotationNumber: "", orderNumber: "", companyKey: "default", establishmentKey: "main" });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const load = async () => {
    try {
      const [catalog, warehouses, stock, reorder, purchaseList, requestList] = await Promise.all([
        request<Product[]>(`${api}/api/v1/products`, token),
        request<Array<{ locations: Array<{ id: string; name: string }> }>>(`${api}/api/v1/stock/warehouses`, token),
        request<typeof balances>(`${api}/api/v1/stock/balances`, token),
        request<typeof suggestions>(`${api}/api/v1/stock/reorder-suggestions`, token),
        request<typeof purchases>(`${api}/api/v1/purchases`, token),
        request<typeof requests>(`${api}/api/v1/procurement/requests`, token),
      ]);
      setProducts(catalog); setLocations(warehouses.flatMap((warehouse) => warehouse.locations)); setBalances(stock); setSuggestions(reorder); setPurchases(purchaseList); setRequests(requestList);
    } catch (error) { onError(error instanceof Error ? error.message : "Falha ao carregar stock e compras."); }
  };
  useEffect(() => { void load(); }, []);
  const submit = async () => {
    if (!admin) return onError("Apenas administradores podem executar esta operação.");
    try {
      const quantity = Number(form.quantity);
      if (!form.productId || !form.reference && ["inventory", "transfer"].includes(tab)) throw new Error("Produto e referência são obrigatórios.");
      let endpoint = ""; let body: unknown;
      if (tab === "inventory") { endpoint = "/api/v1/stock/inventory-counts"; body = { locationId: form.locationId, reference: form.reference, lines: [{ productId: form.productId, countedQuantity: quantity }] }; }
      else if (tab === "transfer") { endpoint = "/api/v1/stock/transfers"; body = { sourceLocationId: form.sourceLocationId, destinationLocationId: form.destinationLocationId, reference: form.reference, lines: [{ productId: form.productId, quantity }] }; }
      else if (tab === "receipt") { endpoint = `/api/v1/purchases/${form.purchaseId}/receipts`; body = { reference: form.reference, locationId: form.locationId, lines: [{ productId: form.productId, quantity }] }; }
      else if (tab === "returns") { endpoint = "/api/v1/commercial-documents"; body = { type: form.documentType, series: form.series, number: form.number || undefined, customerId: form.customerId || null, supplierId: form.supplierId || null, locationId: form.locationId, lines: [{ productId: form.productId, quantity, unitPriceCents: products.find((item) => item.id === form.productId)?.priceCents ?? 0, lotNumber: form.lotNumber || undefined, serialNumber: form.serialNumber || undefined, expiresAt: form.expiresAt || undefined }] }; }
      else if (tab === "procurement") { endpoint = "/api/v1/procurement/requests"; body = { number: form.requestNumber, lines: [{ productId: form.productId, quantity }] }; }
      else if (tab === "quotation") { endpoint = "/api/v1/procurement/quotations"; body = { number: form.quotationNumber, supplierId: form.supplierId, lines: [{ productId: form.productId, quantity, unitCostCents: money(form.quantity) }] }; }
      else if (tab === "order") { endpoint = "/api/v1/procurement/orders"; body = { number: form.orderNumber, supplierId: form.supplierId, lines: [{ productId: form.productId, quantity, unitCostCents: money(form.quantity) }] }; }
      else { endpoint = "/api/v1/commercial-documents/series"; body = { companyKey: form.companyKey, establishmentKey: form.establishmentKey, documentType: "CUSTOMER_RETURN", prefix: form.series }; }
      await request(`${api}${endpoint}`, token, { method: "POST", body: JSON.stringify(body) }); setMessage("Operação concluída e auditada."); await load();
    } catch (error) { onError(error instanceof Error ? error.message : "Falha na operação."); }
  };
  const field = (label: string, key: keyof typeof form, type = "text") => <label>{label}<input type={type} value={form[key]} onChange={(event) => update(key, event.target.value)} /></label>;
  return <section className="panel"><h2>Stock, compras e documentos</h2><div className="modal-actions">{[["overview", "Resumo"], ["inventory", "Inventário"], ["transfer", "Transferência"], ["receipt", "Receção"], ["returns", "Devoluções"], ["procurement", "Pedido de cotação"], ["quotation", "Cotação"], ["order", "Ordem de compra"], ["series", "Séries"]].map(([key, label]) => <button key={String(key)} className={tab === key ? "checkout" : ""} onClick={() => setTab(String(key))}>{label}</button>)}</div>{message && <p className="success">{message}</p>}{tab === "overview" ? <><h3>Alertas de reposição</h3><table><thead><tr><th>Produto</th><th>Atual</th><th>Mínimo</th><th>Sugerido</th></tr></thead><tbody>{suggestions.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.currentStock}</td><td>{item.minStock}</td><td>{item.suggestedQuantity}</td></tr>)}{!suggestions.length && <tr><td colSpan={4}>Sem alertas.</td></tr>}</tbody></table><h3>Valorização por custo médio</h3><table><thead><tr><th>Produto</th><th>Localização</th><th>Quantidade</th><th>Custo médio</th><th>Valor</th></tr></thead><tbody>{balances.map((item) => <tr key={`${item.product.id}-${item.location.name}`}><td>{item.product.name}</td><td>{item.location.name}</td><td>{item.quantity}</td><td>{formatKwanza(item.averageCostCents)}</td><td>{formatKwanza(item.totalCostCents)}</td></tr>)}</tbody></table></> : <div className="card form-grid">{field("Produto", "productId")}<label>Produto<select value={form.productId} onChange={(event) => update("productId", event.target.value)}><option value="">Selecionar produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>{tab === "transfer" ? <>{field("Origem", "sourceLocationId")}{field("Destino", "destinationLocationId")}</> : field("Localização", "locationId")}{field("Quantidade", "quantity", "number")}{(tab === "inventory" || tab === "transfer" || tab === "receipt") && field("Referência", "reference")}{tab === "receipt" && <label>Compra<select value={form.purchaseId} onChange={(event) => update("purchaseId", event.target.value)}><option value="">Selecionar compra</option>{purchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.number}</option>)}</select></label>}{tab === "returns" && <>{field("Tipo", "documentType")}{field("Série", "series")}{field("Número (opcional)", "number")}{field("Cliente ID", "customerId")}{field("Fornecedor ID", "supplierId")}{field("Lote", "lotNumber")}{field("Número de série", "serialNumber")}{field("Validade", "expiresAt", "date")}</>}{tab === "procurement" && field("N.º pedido", "requestNumber")}{tab === "quotation" && <>{field("N.º cotação", "quotationNumber")}{field("Fornecedor ID", "supplierId")}</>}{tab === "order" && <>{field("N.º ordem", "orderNumber")}{field("Fornecedor ID", "supplierId")}</>}{tab === "series" && <>{field("Empresa", "companyKey")}{field("Estabelecimento", "establishmentKey")}{field("Prefixo", "series")}</>}<button className="checkout" disabled={!admin} onClick={() => void submit()}>Guardar e auditar</button>{tab === "quotation" && <><h3>Comparação de cotações</h3><table><thead><tr><th>Pedido</th><th>Cotação</th><th>Fornecedor</th><th>Produto</th><th>Custo unitário</th><th>Estado</th></tr></thead><tbody>{requests.flatMap((request) => request.quotations.flatMap((quotation) => quotation.lines.map((line) => <tr key={`${quotation.number}-${line.productId}`}><td>{request.number}</td><td>{quotation.number}</td><td>{quotation.supplierId}</td><td>{products.find((product) => product.id === line.productId)?.name ?? line.productId}</td><td>{formatKwanza(line.unitCostCents)}</td><td>{quotation.status}</td></tr>)))}{!requests.some((request) => request.quotations.length) && <tr><td colSpan={6}>Sem cotações registadas.</td></tr>}</tbody></table></>}</div>}</section>;
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


    type SupplierRecord = { id: string; name: string; nif?: string | null; code?: string | null; phone?: string | null; email?: string | null; active: boolean; _count?: { purchases: number } };
    type PurchaseRecord = { id: string; number: string; status: string; totalCents: number; paymentMethod: string; purchasedAt: string; supplier: { name: string }; payable?: { id: string; originalCents: number; paidCents: number; dueDate: string; status: string } | null };
    type PurchaseDraftLine = { productId: string; quantity: number; unitCostCents: number };
    type ExpenseRecord = { id: string; description: string; category: string; amountCents: number; expenseDate: string; paymentMethod: string; status: string; documentNumber?: string | null; supplier?: { id: string; name: string } | null };

export function OperationsPanel({ api, token, admin, onError }: Props) {
      const [tab, setTab] = useState<"suppliers" | "purchases" | "payables" | "expenses">("suppliers");
      const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
      const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
      const [payables, setPayables] = useState<PurchaseRecord[]>([]);
      const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
      const [products, setProducts] = useState<Product[]>([]);
      const [query, setQuery] = useState("");
      const [message, setMessage] = useState("");
      const [supplierForm, setSupplierForm] = useState({ name: "", nif: "", code: "", phone: "", email: "", address: "", contactName: "", notes: "" });
      const [purchase, setPurchase] = useState({ number: "", supplierId: "", paymentMethod: "CASH", dueDate: "", documentNumber: "", notes: "" });
      const [lines, setLines] = useState<PurchaseDraftLine[]>([{ productId: "", quantity: 1, unitCostCents: 0 }]);
      const [expenseForm, setExpenseForm] = useState({ description: "", category: "OTHER", supplierId: "", documentNumber: "", amountCents: 0, expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", notes: "" });
      const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
      const [payablePayment, setPayablePayment] = useState<{ id: string; label: string; balanceCents: number } | null>(null);
      const [payableAmount, setPayableAmount] = useState("");
      const [payableReference, setPayableReference] = useState("");
      const load = async () => {
        try {
          const [s, p, a, catalog, expenseRows] = await Promise.all([
            request<SupplierRecord[]>(`${api}/api/v1/suppliers`, token),
            request<PurchaseRecord[]>(`${api}/api/v1/purchases`, token),
            request<PurchaseRecord[]>(`${api}/api/v1/purchases/payables`, token),
            request<Product[]>(`${api}/api/v1/products`, token),
            request<ExpenseRecord[]>(`${api}/api/v1/expenses`, token),
          ]);
          setSuppliers(s); setPurchases(p); setPayables(a); setProducts(catalog); setExpenses(expenseRows);
        } catch (error) { onError(error instanceof Error ? error.message : "Não foi possível carregar fornecedores e compras."); }
      };
      useEffect(() => { void load(); }, []);
      const saveSupplier = async () => {
        if (!supplierForm.name.trim()) return onError("Indique o nome do fornecedor.");
        try {
          await request(`${api}/api/v1/suppliers`, token, { method: "POST", body: JSON.stringify({ ...supplierForm, nif: supplierForm.nif || null, code: supplierForm.code || null }) });
          setSupplierForm({ name: "", nif: "", code: "", phone: "", email: "", address: "", contactName: "", notes: "" }); setMessage("Fornecedor criado."); await load();
        } catch (error) { onError(error instanceof Error ? error.message : "Falha ao criar fornecedor."); }
      };
      const toggleSupplier = async (supplier: SupplierRecord) => {
        try { await request(`${api}/api/v1/suppliers/${supplier.id}`, token, { method: "PATCH", body: JSON.stringify({ active: !supplier.active }) }); await load(); }
        catch (error) { onError(error instanceof Error ? error.message : "Falha ao atualizar fornecedor."); }
      };
      const confirmPurchase = async () => {
        const validLines = lines.filter((line) => line.productId && line.quantity > 0);
        if (!purchase.number || !purchase.supplierId || !validLines.length) return onError("Número, fornecedor e pelo menos um produto são obrigatórios.");
        try {
          await request(`${api}/api/v1/purchases`, token, { method: "POST", body: JSON.stringify({ ...purchase, dueDate: purchase.dueDate || undefined, lines: validLines, idempotencyKey: crypto.randomUUID() }) });
          setPurchase({ number: "", supplierId: "", paymentMethod: "CASH", dueDate: "", documentNumber: "", notes: "" }); setLines([{ productId: "", quantity: 1, unitCostCents: 0 }]); setMessage("Compra confirmada. Registe a receção para movimentar o stock."); await load();
        } catch (error) { onError(error instanceof Error ? error.message : "Falha ao confirmar compra."); }
      };
      const saveExpense = async () => {
        if (!expenseForm.description.trim() || expenseForm.amountCents <= 0) return onError("Descrição e valor maior que zero são obrigatórios.");
        try {
          await request(`${api}/api/v1/expenses${editingExpenseId ? `/${editingExpenseId}` : ""}`, token, { method: editingExpenseId ? "PATCH" : "POST", body: JSON.stringify({ ...expenseForm, supplierId: expenseForm.supplierId || null, documentNumber: expenseForm.documentNumber || null, notes: expenseForm.notes || null }) });
          setExpenseForm({ description: "", category: "OTHER", supplierId: "", documentNumber: "", amountCents: 0, expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", notes: "" }); await load();
          setEditingExpenseId(null);
        } catch (error) { onError(error instanceof Error ? error.message : "Falha ao registar despesa."); }
      };
      const cancelExpense = async (id: string) => {
        try { await request(`${api}/api/v1/expenses/${id}/cancel`, token, { method: "POST" }); await load(); }
        catch (error) { onError(error instanceof Error ? error.message : "Falha ao anular despesa."); }
      };
      const submitPayablePayment = async () => {
        if (!payablePayment) return;
        const amountCents = money(payableAmount);
        if (amountCents <= 0 || amountCents > payablePayment.balanceCents) return onError("O valor deve ser positivo e não pode exceder o saldo.");
        try {
          await request(`${api}/api/v1/payables/${payablePayment.id}/payments`, token, { method: "POST", body: JSON.stringify({ amountCents, paymentMethod: "TRANSFER", reference: payableReference || null, idempotencyKey: crypto.randomUUID() }) });
          setPayablePayment(null); setPayableAmount(""); setPayableReference(""); setMessage("Pagamento registado."); await load();
        } catch (error) { onError(error instanceof Error ? error.message : "Falha ao registar pagamento."); }
      };
      const filteredSuppliers = suppliers.filter((item) => `${item.name} ${item.nif ?? ""} ${item.code ?? ""}`.toLowerCase().includes(query.toLowerCase()));
      const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
      return <section className="panel"><h2>Fornecedores, compras e despesas</h2><div className="modal-actions"><button className={tab === "suppliers" ? "checkout" : ""} onClick={() => setTab("suppliers")}>Fornecedores</button><button className={tab === "purchases" ? "checkout" : ""} onClick={() => setTab("purchases")}>Compras</button><button className={tab === "payables" ? "checkout" : ""} onClick={() => setTab("payables")}>Contas a pagar</button><button className={tab === "expenses" ? "checkout" : ""} onClick={() => setTab("expenses")}>Despesas</button></div>{message && <p className="success">{message}</p>}{tab === "suppliers" && <><div className="card form-grid"><h3>Novo fornecedor</h3><label>Nome / razão social<input value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} /></label><label>NIF<input value={supplierForm.nif} onChange={e => setSupplierForm({ ...supplierForm, nif: e.target.value })} /></label><label>Código interno<input value={supplierForm.code} onChange={e => setSupplierForm({ ...supplierForm, code: e.target.value })} /></label><label>Telefone<input value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></label><label>Email<input type="email" value={supplierForm.email} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} /></label><label>Endereço<input value={supplierForm.address} onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })} /></label><label>Contacto<input value={supplierForm.contactName} onChange={e => setSupplierForm({ ...supplierForm, contactName: e.target.value })} /></label><label>Observações<textarea value={supplierForm.notes} onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></label><button className="checkout" onClick={() => void saveSupplier()} disabled={!admin}>Guardar fornecedor</button></div><input placeholder="Pesquisar fornecedor por nome, NIF ou código" value={query} onChange={e => setQuery(e.target.value)} /><div className="table-wrap"><table><thead><tr><th>Fornecedor</th><th>NIF</th><th>Código</th><th>Compras</th><th>Estado</th><th>Ação</th></tr></thead><tbody>{filteredSuppliers.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.nif ?? "—"}</td><td>{item.code ?? "—"}</td><td>{item._count?.purchases ?? 0}</td><td>{item.active ? "Ativo" : "Inativo"}</td><td><button onClick={() => void toggleSupplier(item)} disabled={!admin}>{item.active ? "Desativar" : "Ativar"}</button></td></tr>)}</tbody></table></div></>}{tab === "purchases" && <><div className="card form-grid"><h3>Nova compra</h3><label>Número / referência<input value={purchase.number} onChange={e => setPurchase({ ...purchase, number: e.target.value })} /></label><label>Fornecedor<select value={purchase.supplierId} onChange={e => setPurchase({ ...purchase, supplierId: e.target.value })}><option value="">Selecionar fornecedor</option>{suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{lines.map((line, index) => <div className="modal-actions" key={index}><select value={line.productId} onChange={e => setLines(lines.map((item, i) => i === index ? { ...item, productId: e.target.value } : item))}><option value="">Produto</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input type="number" min="1" value={line.quantity} onChange={e => setLines(lines.map((item, i) => i === index ? { ...item, quantity: Number(e.target.value) } : item))} /><input type="number" min="0" placeholder="Custo unitário (Kz)" value={line.unitCostCents / 100 || ""} onChange={e => setLines(lines.map((item, i) => i === index ? { ...item, unitCostCents: money(e.target.value) } : item))} />{index === lines.length - 1 && <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: 1, unitCostCents: 0 }])}>+ produto</button>}</div>)}<label>Pagamento<select value={purchase.paymentMethod} onChange={e => setPurchase({ ...purchase, paymentMethod: e.target.value })}><option value="CASH">Pronto / dinheiro</option><option value="TRANSFER">Transferência</option><option value="CREDIT">Crédito</option></select></label>{purchase.paymentMethod === "CREDIT" && <label>Vencimento<input type="date" value={purchase.dueDate} onChange={e => setPurchase({ ...purchase, dueDate: e.target.value })} /></label>}<label>Documento<input value={purchase.documentNumber} onChange={e => setPurchase({ ...purchase, documentNumber: e.target.value })} /></label><label>Observações<textarea value={purchase.notes} onChange={e => setPurchase({ ...purchase, notes: e.target.value })} /></label><strong>Total: {formatKwanza(total)}</strong><button className="checkout" onClick={() => void confirmPurchase()} disabled={!admin}>Confirmar compra</button></div><div className="table-wrap"><table><thead><tr><th>Número</th><th>Fornecedor</th><th>Data</th><th>Total</th><th>Estado</th></tr></thead><tbody>{purchases.map(item => <tr key={item.id}><td>{item.number}</td><td>{item.supplier.name}</td><td>{new Date(item.purchasedAt).toLocaleDateString("pt-PT")}</td><td>{formatKwanza(item.totalCents)}</td><td>{item.status}</td></tr>)}</tbody></table></div></>}{tab === "payables" && <div className="table-wrap"><table><thead><tr><th>Fornecedor</th><th>Compra</th><th>Original</th><th>Pago</th><th>Saldo</th><th>Vencimento</th><th>Estado</th></tr></thead><tbody>{payables.map(item => <tr key={item.id}><td>{item.supplier.name}</td><td>{item.number}</td><td>{formatKwanza(item.payable?.originalCents ?? 0)}</td><td>{formatKwanza(item.payable?.paidCents ?? 0)}</td><td>{formatKwanza((item.payable?.originalCents ?? 0) - (item.payable?.paidCents ?? 0))}</td><td>{item.payable?.dueDate ? new Date(item.payable.dueDate).toLocaleDateString("pt-PT") : "—"}</td>      <td>{item.payable?.status ?? "—"}</td><td>{item.payable && item.payable.originalCents > item.payable.paidCents && <button onClick={() => setPayablePayment({ id: item.payable!.id, label: item.supplier.name, balanceCents: item.payable!.originalCents - item.payable!.paidCents })}>Pagar</button>}</td></tr>)}</tbody></table></div>}{tab === "expenses" && <><div className="card form-grid"><h3>Nova despesa</h3><label>Descrição<input value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} /></label><label>Categoria<input value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })} /></label><label>Fornecedor<select value={expenseForm.supplierId} onChange={e => setExpenseForm({ ...expenseForm, supplierId: e.target.value })}><option value="">Sem fornecedor</option>{suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Documento<input value={expenseForm.documentNumber} onChange={e => setExpenseForm({ ...expenseForm, documentNumber: e.target.value })} /></label><label>Valor (Kz)<input type="number" min="0.01" value={expenseForm.amountCents / 100 || ""} onChange={e => setExpenseForm({ ...expenseForm, amountCents: money(e.target.value) })} /></label><label>Data<input type="date" value={expenseForm.expenseDate} onChange={e => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} /></label><label>Método<select value={expenseForm.paymentMethod} onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}><option value="CASH">Dinheiro</option><option value="CARD">Cartão</option><option value="TRANSFER">Transferência</option><option value="CREDIT">Crédito</option></select></label><label>Observações<textarea value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} /></label><button className="checkout" onClick={() => void saveExpense()} disabled={!admin}>Registar despesa</button></div><div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th>Data</th><th>Valor</th><th>Estado</th><th>Ação</th></tr></thead><tbody>{expenses.map(item => <tr key={item.id}><td>{item.description}</td><td>{item.category}</td><td>{item.supplier?.name ?? "—"}</td><td>{new Date(item.expenseDate).toLocaleDateString("pt-PT")}</td><td>{formatKwanza(item.amountCents)}</td><td>{item.status}</td>      <td>{item.status === "ACTIVE" && <><button onClick={() => { setEditingExpenseId(item.id); setExpenseForm({ description: item.description, category: item.category, supplierId: item.supplier?.id ?? "", documentNumber: item.documentNumber ?? "", amountCents: item.amountCents, expenseDate: item.expenseDate.slice(0, 10), paymentMethod: item.paymentMethod, notes: "" }); }} disabled={!admin}>Editar</button><button onClick={() => void cancelExpense(item.id)} disabled={!admin}>Anular</button></>}</td></tr>)}</tbody></table>      </div></>}{payablePayment && <div className="modal-backdrop"><div className="modal"><h2>Pagamento a fornecedor</h2><p>{payablePayment.label} · saldo {formatKwanza(payablePayment.balanceCents)}</p><label>Valor (Kz)<input type="number" min="0.01" value={payableAmount} onChange={e => setPayableAmount(e.target.value)} autoFocus /></label><label>Referência<input value={payableReference} onChange={e => setPayableReference(e.target.value)} /></label><div className="modal-actions"><button className="checkout" onClick={() => void submitPayablePayment()}>Confirmar pagamento</button><button onClick={() => setPayablePayment(null)}>Cancelar</button></div></div></div>}</section>;
    }

    type ReportType = "sales" | "products" | "stock" | "purchases" | "expenses" | "receivables" | "payables" | "summary";
    export function ReportsPanel({ api, token, onError }: Omit<Props, "admin">) {
      const [type, setType] = useState<ReportType>("sales"); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [data, setData] = useState<Record<string, unknown> | null>(null); const [loading, setLoading] = useState(false);
      const load = async () => { setLoading(true); try { const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", `${to}T23:59:59.999`); setData(await request<Record<string, unknown>>(`${api}/api/v1/reports/${type}?${params}`, token)); } catch (error) { onError(error instanceof Error ? error.message : "Não foi possível carregar o relatório."); } finally { setLoading(false); } };
      useEffect(() => { void load(); }, [type]);
      const exportCsv = async () => { try { const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", `${to}T23:59:59.999`); const response = await fetch(`${api}/api/v1/reports/${type}/export?${params}`, { headers: headers(token) }); if (!response.ok) throw new Error("Falha ao exportar relatório."); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${type}-report.csv`; anchor.click(); URL.revokeObjectURL(url); } catch (error) { onError(error instanceof Error ? error.message : "Falha ao exportar relatório."); } };
      const rows = Array.isArray(data?.rows) ? data.rows as Array<Record<string, unknown>> : [];
      return <section className="panel"><div className="panel-heading"><div><h2>Relatórios comerciais</h2><p>Agregações calculadas no backend com dados reais.</p></div><button onClick={() => void exportCsv()}>Exportar CSV</button></div><div className="form-grid"><label>Relatório<select value={type} onChange={e => setType(e.target.value as ReportType)}>{[["sales", "Vendas"], ["products", "Produtos"], ["stock", "Stock"], ["purchases", "Compras"], ["expenses", "Despesas"], ["receivables", "Contas a receber"], ["payables", "Contas a pagar"], ["summary", "Resumo financeiro"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>De<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Até<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label><button onClick={() => void load()}>Aplicar filtros</button></div>{loading && <p>A carregar…</p>}{data && type === "sales" && <div className="cards"><article><small>Documentos</small><strong>{String(data.documents ?? 0)}</strong></article><article><small>Total</small><strong>{formatKwanza(Number(data.totalCents ?? 0))}</strong></article><article><small>Ticket médio</small><strong>{formatKwanza(Number(data.averageTicketCents ?? 0))}</strong></article></div>}{data && type === "summary" && <div className="cards"><article><small>Vendas</small><strong>{formatKwanza(Number(data.salesCents ?? 0))}</strong></article><article><small>Compras</small><strong>{formatKwanza(Number(data.purchasesCents ?? 0))}</strong></article><article><small>Despesas</small><strong>{formatKwanza(Number(data.expensesCents ?? 0))}</strong></article><article><small>Saldo a receber</small><strong>{formatKwanza(Number(data.receivablesBalanceCents ?? 0))}</strong></article></div>}{data && <div className="table-wrap"><table><thead><tr>{rows[0] ? Object.keys(rows[0]).slice(0, 8).map(key => <th key={key}>{key}</th>) : <th>Resultado</th>}</tr></thead><tbody>{rows.slice(0, 200).map((row, index) => <tr key={index}>{Object.keys(row).slice(0, 8).map(key => <td key={key}>{typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key] ?? "—")}</td>)}</tr>)}{!rows.length && <tr><td>Sem dados no período selecionado.</td></tr>}</tbody></table></div>}</section>;
    }
    type CashflowData = { entriesCents: number; exitsCents: number; netCents: number; rows: Array<{ id: string; date: string; direction: "IN" | "OUT"; amountCents: number; origin: string; reference: string; method: string; note: string | null }>; byDay: Array<{ date: string; entriesCents: number; exitsCents: number }>; byMethod: Array<{ method: string; amountCents: number }>; byOrigin: Array<{ origin: string; amountCents: number }>; limitations: string[] };
    export function CashflowPanel({ api, token, onError }: Omit<Props, "admin">) {
      const [data, setData] = useState<CashflowData | null>(null); const [period, setPeriod] = useState("today"); const [direction, setDirection] = useState(""); const [origin, setOrigin] = useState(""); const [method, setMethod] = useState("");
      const load = async () => { try { const now = new Date(); const from = new Date(now); const to = new Date(now); if (period === "yesterday") { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); } else if (period === "last7") from.setDate(from.getDate() - 6); else if (period === "month") from.setDate(1); else if (period === "previousMonth") { from.setMonth(from.getMonth() - 1, 1); to.setMonth(to.getMonth(), 0); } from.setHours(0, 0, 0, 0); to.setHours(23, 59, 59, 999); const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() }); if (direction) params.set("direction", direction); if (origin) params.set("origin", origin); if (method) params.set("paymentMethod", method); setData(await request<CashflowData>(`${api}/api/v1/cashflow?${params}`, token)); } catch (error) { onError(error instanceof Error ? error.message : "Não foi possível carregar o fluxo de caixa."); } };
      useEffect(() => { void load(); }, [period, direction, origin, method]);
      return <section className="panel"><div className="panel-heading"><div><h2>Fluxo de caixa</h2><p>Movimentos financeiros efetivamente registados; não representa saldo de caixa.</p></div><div className="form-grid"><select value={period} onChange={e => setPeriod(e.target.value)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="last7">Últimos 7 dias</option><option value="month">Este mês</option><option value="previousMonth">Mês anterior</option></select><select value={direction} onChange={e => setDirection(e.target.value)}><option value="">Entrada e saída</option><option value="IN">Entradas</option><option value="OUT">Saídas</option></select><select value={origin} onChange={e => setOrigin(e.target.value)}><option value="">Todas as origens</option><option value="SALE_PAYMENT">Venda</option><option value="RECEIVABLE_PAYMENT">Recebimento</option><option value="PAYABLE_PAYMENT">Pagamento</option><option value="EXPENSE">Despesa</option></select><select value={method} onChange={e => setMethod(e.target.value)}><option value="">Todos os métodos</option><option value="CASH">Dinheiro</option><option value="CARD">Cartão</option><option value="TRANSFER">Transferência</option></select></div></div>{data && <><div className="metrics"><div><small>Total de entradas</small><strong>{formatKwanza(data.entriesCents)}</strong></div><div><small>Total de saídas</small><strong>{formatKwanza(data.exitsCents)}</strong></div><div><small>Movimento líquido</small><strong>{formatKwanza(data.netCents)}</strong></div></div><div className="card"><h3>Resumo por origem</h3>{data.byOrigin.map(row => <p key={row.origin}>{row.origin}: {formatKwanza(row.amountCents)}</p>)}</div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Referência</th><th>Método</th><th>Entrada</th><th>Saída</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td>{new Date(row.date).toLocaleString("pt-PT")}</td><td>{row.direction === "IN" ? "Entrada" : "Saída"}</td><td>{row.origin}</td><td>{row.reference}</td><td>{row.method}</td><td>{row.direction === "IN" ? formatKwanza(row.amountCents) : "—"}</td><td>{row.direction === "OUT" ? formatKwanza(row.amountCents) : "—"}</td></tr>)}{!data.rows.length && <tr><td colSpan={7}>Sem movimentos no período.</td></tr>}</tbody></table></div><div className="card"><h3>Limitações</h3>{data.limitations.map(item => <p key={item}>{item}</p>)}</div></>}</section>;
    }
    type DashboardSummary = {
      sales: { totalCents: number; documents: number; averageTicketCents: number | null; byPayment: { paymentMethod: string; documents: number; totalCents: number }[] };
      purchases: { totalCents: number; count: number; creditCents: number; topSuppliers: { supplier: string; totalCents: number }[] };
      expenses: { totalCents: number; count: number; byCategory: { category: string; count: number; totalCents: number }[] };
      receivables: { openCents: number; receivedCents: number; count: number; overdueCount: number | null };
      payables: { openCents: number; paidCents: number; count: number; overdueCount: number };
      stock: { productCount: number; lowStockCount: number | null; entries: number; exits: number; inventoryValuationCents: number | null };
      entities: { activeCustomers: number; activeSuppliers: number };
      charts: { salesByDay: { date: string; amountCents: number }[]; purchasesByDay: { date: string; amountCents: number }[]; expensesByDay: { date: string; amountCents: number }[]; expensesByCategory: { category: string; count: number; totalCents: number }[] };
      alerts: { pendingReceivables: { label: string; amountCents: number }[]; pendingPayables: { label: string; amountCents: number; dueDate: string }[]; highValuePurchases: { label: string; amountCents: number }[]; highValueExpenses: { label: string; amountCents: number }[]; lowStock: unknown };
      limitations: string[];
    };
export function DashboardPanel({ api, token, onError }: Omit<Props, "admin">) {
  const [data, setData] = useState<DashboardSummary | null>(null); const [period, setPeriod] = useState("today"); const [customFrom, setCustomFrom] = useState(""); const [customTo, setCustomTo] = useState(""); const [offline, setOffline] = useState(false); const [receivables, setReceivables] = useState<Array<{ id: string; name: string; outstandingDebtCents: number; status: string }>>([]); const [receivablePayment, setReceivablePayment] = useState<{ id: string; name: string; balanceCents: number } | null>(null); const [receivableAmount, setReceivableAmount] = useState(""); const [receivableReference, setReceivableReference] = useState(""); const [cashSessionId, setCashSessionId] = useState(localStorage.getItem("activeCashSessionId") ?? "");
  const dateRange = () => {
    const now = new Date(); const start = new Date(now); const end = new Date(now);
    if (period === "yesterday") { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    else if (period === "last7") start.setDate(start.getDate() - 6);
    else if (period === "month") start.setDate(1);
    else if (period === "previousMonth") { start.setMonth(start.getMonth() - 1, 1); end.setMonth(end.getMonth(), 0); }
    else if (period === "custom") return { from: customFrom, to: customTo };
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  };
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const range = dateRange(); const params = new URLSearchParams(); if (range.from) params.set("from", range.from); if (range.to) params.set("to", range.to);
        const [summary, receivableRows] = await Promise.all([request<DashboardSummary>(`${api}/api/v1/reports/dashboard/summary?${params}`, token), request<Array<{ id: string; name: string; outstandingDebtCents: number; status: string }>>(`${api}/api/v1/receivables`, token)]);
        if (!active) return;
        setData(summary);
        setReceivables(receivableRows);
        setOffline(false);
      } catch (error) {
        if (!active) return;
        setData(null);
        setOffline(true);
        onError(error instanceof Error ? error.message : "Não foi possível carregar o dashboard.");
      }
    };
    void load();
    return () => { active = false; };
  }, [api, token, period, customFrom, customTo]);
  const submitReceivablePayment = async () => {
    if (!receivablePayment) return;
    const amountCents = money(receivableAmount);
    if (amountCents <= 0 || amountCents > receivablePayment.balanceCents || !cashSessionId) return onError("Indique um valor válido e a sessão de caixa aberta.");
    try {
      await request(`${api}/api/v1/customers/${receivablePayment.id}/payments`, token, { method: "POST", body: JSON.stringify({ amountCents, paymentMethod: "CASH", cashSessionId, reference: receivableReference || null, idempotencyKey: crypto.randomUUID() }) });
      setReceivablePayment(null); setReceivableAmount(""); setReceivableReference("");
      const refreshed = await request<Array<{ id: string; name: string; outstandingDebtCents: number; status: string }>>(`${api}/api/v1/receivables`, token); setReceivables(refreshed);
    } catch (error) { onError(error instanceof Error ? error.message : "Falha ao registar recebimento."); }
  };
  const chart = (title: string, rows: { date: string; amountCents: number }[]) => { const max = Math.max(...rows.map(row => row.amountCents), 1); return <div className="card"><h3>{title}</h3>{rows.length ? rows.slice(-14).map(row => <div key={row.date} style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px", gap: "8px", alignItems: "center", margin: "6px 0" }}><small>{row.date}</small><div style={{ background: "#e5e7eb", height: "12px" }}><div style={{ width: `${Math.max(2, row.amountCents / max * 100)}%`, height: "100%", background: "#0f766e" }} /></div><small>{formatKwanza(row.amountCents)}</small></div>) : <p>Sem dados no período.</p>}</div>; };
  return <section className="panel"><div className="panel-heading"><div><h2>Dashboard comercial</h2><p>Indicadores agregados no backend a partir de dados reais.</p></div><div className="modal-actions"><select value={period} onChange={e => setPeriod(e.target.value)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="last7">Últimos 7 dias</option><option value="month">Este mês</option><option value="previousMonth">Mês anterior</option><option value="custom">Período personalizado</option></select>{period === "custom" && <><input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /><input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></>}</div></div>{offline && <p className="alert">Dashboard indisponível offline: não são apresentados números fictícios.</p>}{data && <><div className="metrics"><div><small>Vendas no período</small><strong>{formatKwanza(data.sales.totalCents)}</strong><em>{data.sales.documents} documentos · ticket {data.sales.averageTicketCents === null ? "N/D" : formatKwanza(data.sales.averageTicketCents)}</em></div><div><small>Compras</small><strong>{formatKwanza(data.purchases.totalCents)}</strong><em>{data.purchases.count} compras · crédito {formatKwanza(data.purchases.creditCents)}</em></div><div><small>Despesas</small><strong>{formatKwanza(data.expenses.totalCents)}</strong><em>{data.expenses.count} lançamentos</em></div><div><small>Stock</small><strong>{data.stock.productCount} produtos</strong><em>{data.stock.entries} entradas · {data.stock.exits} saídas</em></div><div><small>A receber em aberto</small><strong>{formatKwanza(data.receivables.openCents)}</strong><em>{data.receivables.count} clientes</em></div><div><small>A pagar em aberto</small><strong>{formatKwanza(data.payables.openCents)}</strong><em>{data.payables.count} contas · {data.payables.overdueCount} vencidas</em></div><div><small>Clientes ativos</small><strong>{data.entities.activeCustomers}</strong></div><div><small>Fornecedores ativos</small><strong>{data.entities.activeSuppliers}</strong></div></div><div className="layout"><div>{chart("Evolução de vendas", data.charts.salesByDay)}{chart("Compras por período", data.charts.purchasesByDay)}{chart("Despesas por período", data.charts.expensesByDay)}</div><aside><div className="card"><h3>Vendas por pagamento</h3>{data.sales.byPayment.map(row => <p key={row.paymentMethod}>{row.paymentMethod}: <strong>{formatKwanza(row.totalCents)}</strong></p>)}</div><div className="card"><h3>Despesas por categoria</h3>{data.charts.expensesByCategory.map(row => <p key={row.category}>{row.category}: <strong>{formatKwanza(row.totalCents)}</strong></p>)}</div><div className="card"><h3>Alertas comerciais</h3>{data.alerts.pendingReceivables.map(row => <p key={`r-${row.label}`}>A receber: {row.label} · {formatKwanza(row.amountCents)}</p>)}{data.alerts.pendingPayables.map(row => <p key={`p-${row.label}`}>A pagar: {row.label} · {formatKwanza(row.amountCents)}</p>)}{data.alerts.highValuePurchases.map(row => <p key={`c-${row.label}`}>Compra relevante: {row.label} · {formatKwanza(row.amountCents)}</p>)}{data.alerts.highValueExpenses.map(row => <p key={`e-${row.label}`}>Despesa relevante: {row.label} · {formatKwanza(row.amountCents)}</p>)}{!data.alerts.pendingReceivables.length && !data.alerts.pendingPayables.length && !data.alerts.highValuePurchases.length && !data.alerts.highValueExpenses.length && <p>Sem alertas no período.</p>}</div>{data.stock.inventoryValuationCents !== null && <div className="card"><h3>Valorização do inventário</h3><strong>{formatKwanza(data.stock.inventoryValuationCents)}</strong></div>}</aside>  </div><div className="card"><h3>Limitações dos dados</h3>{data.limitations.map(item => <p key={item}>{item}</p>)}</div></>}{receivables.length > 0 && <div className="card"><h3>Contas a receber</h3><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Saldo</th><th>Estado</th><th>Ação</th></tr></thead><tbody>{receivables.map(item => <tr key={item.id}><td>{item.name}</td><td>{formatKwanza(item.outstandingDebtCents)}</td><td>{item.status}</td><td><button onClick={() => setReceivablePayment({ id: item.id, name: item.name, balanceCents: item.outstandingDebtCents })}>Receber</button></td></tr>)}</tbody></table></div></div>}{receivablePayment && <div className="modal-backdrop"><div className="modal"><h2>Registar recebimento</h2><p>{receivablePayment.name} · saldo {formatKwanza(receivablePayment.balanceCents)}</p><label>Valor (Kz)<input type="number" min="0.01" value={receivableAmount} onChange={e => setReceivableAmount(e.target.value)} autoFocus /></label><label>Referência<input value={receivableReference} onChange={e => setReceivableReference(e.target.value)} /></label><label>Sessão de caixa<input value={cashSessionId} onChange={e => setCashSessionId(e.target.value)} /></label><div className="modal-actions"><button className="checkout" onClick={() => void submitReceivablePayment()}>Confirmar recebimento</button><button onClick={() => setReceivablePayment(null)}>Cancelar</button></div></div></div>}</section>;
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
