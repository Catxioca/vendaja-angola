import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { createPosStorage, SyncEngine, formatKwanza } from "@angola/shared";
import { ErrorBoundary } from "./ErrorBoundary";
import "./style.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch((error: unknown) => {
      console.warn("[pwa] service worker unavailable", error);
    });
  });
}
const api = () => (globalThis as { __POS_API_URL__?: string }).__POS_API_URL__ ?? (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "http://localhost:4000";
function Login({ onLogin }: { onLogin: () => void }) {
  const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); const response = await fetch(`${api()}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) }); const data = await response.json(); if (!response.ok) { setError("Credenciais inválidas."); return; } localStorage.setItem("accessToken", data.accessToken); localStorage.setItem("refreshToken", data.refreshToken); localStorage.setItem("posUser", JSON.stringify(data.user)); onLogin(); }
  return <main className="startup-loading"><form onSubmit={(e) => void submit(e)}><h1>VendaJá Angola</h1><input placeholder="Email ou username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /><input type="password" placeholder="Password ou PIN" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} /><button>Entrar</button>{error && <p>{error}</p>}</form></main>;
}
type DashboardData = {
  sales: { totalCents: number; documents: number; averageTicketCents: number | null; byPayment: { paymentMethod: string; totalCents: number }[] };
  purchases: { totalCents: number; count: number; creditCents: number };
  expenses: { totalCents: number; count: number; byCategory: { category: string; totalCents: number }[] };
  receivables: { openCents: number; receivedCents: number; count: number };
  payables: { openCents: number; paidCents: number; count: number; overdueCount: number };
  stock: { productCount: number; entries: number; exits: number; inventoryValuationCents: number | null };
  entities: { activeCustomers: number; activeSuppliers: number };
  charts: { salesByDay: { date: string; amountCents: number }[]; purchasesByDay: { date: string; amountCents: number }[]; expensesByDay: { date: string; amountCents: number }[] };
  alerts: { pendingReceivables: { label: string; amountCents: number }[]; pendingPayables: { label: string; amountCents: number }[]; highValuePurchases: { label: string; amountCents: number }[]; highValueExpenses: { label: string; amountCents: number }[] };
  limitations: string[];
};
function CommercialDashboard() {
  const [period, setPeriod] = useState("today"); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [data, setData] = useState<DashboardData | null>(null); const [error, setError] = useState("");
  const load = async () => { const params = new URLSearchParams(); if (period === "custom") { if (from) params.set("from", from); if (to) params.set("to", `${to}T23:59:59.999`); } else { const now = new Date(); const start = new Date(now); const end = new Date(now); if (period === "yesterday") { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); } else if (period === "last7") start.setDate(start.getDate() - 6); else if (period === "month") start.setDate(1); else if (period === "previousMonth") { start.setMonth(start.getMonth() - 1, 1); end.setMonth(end.getMonth(), 0); } start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); params.set("from", start.toISOString()); params.set("to", end.toISOString()); } const response = await fetch(`${api()}/api/v1/reports/dashboard/summary?${params}`, { headers: { authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` } }); if (!response.ok) { setError("Não foi possível carregar o dashboard."); return; } setData(await response.json() as DashboardData); setError(""); };
  useEffect(() => { void load(); }, [period, from, to]);
  const money = (value: number | null) => value === null ? "N/D" : formatKwanza(value);
  const chart = (title: string, rows: { date: string; amountCents: number }[]) => { const max = Math.max(...rows.map(row => row.amountCents), 1); return <div><h3>{title}</h3>{rows.slice(-10).map(row => <p key={row.date} style={{ display: "grid", gridTemplateColumns: "78px 1fr 110px", gap: "6px" }}><small>{row.date}</small><span style={{ background: "#0f766e", width: `${Math.max(2, row.amountCents / max * 100)}%`, height: "12px" }} /><small>{formatKwanza(row.amountCents)}</small></p>)}{!rows.length && <p>Sem dados.</p>}</div>; };
  return <section><h2>Dashboard comercial</h2><div className="customer-fields"><select value={period} onChange={e => setPeriod(e.target.value)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="last7">Últimos 7 dias</option><option value="month">Este mês</option><option value="previousMonth">Mês anterior</option><option value="custom">Personalizado</option></select>{period === "custom" && <><input type="date" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" value={to} onChange={e => setTo(e.target.value)} /></>}</div>{error && <p className="error-message">{error}</p>}{data && <><div className="cards"><article><small>Vendas</small><strong>{formatKwanza(data.sales.totalCents)}</strong><em>{data.sales.documents} documentos</em></article><article><small>Compras</small><strong>{formatKwanza(data.purchases.totalCents)}</strong><em>{data.purchases.count} compras</em></article><article><small>Despesas</small><strong>{formatKwanza(data.expenses.totalCents)}</strong><em>{data.expenses.count} lançamentos</em></article><article><small>A receber</small><strong>{formatKwanza(data.receivables.openCents)}</strong><em>{data.receivables.count} clientes</em></article><article><small>A pagar</small><strong>{formatKwanza(data.payables.openCents)}</strong><em>{data.payables.overdueCount} vencidas</em></article><article><small>Stock</small><strong>{data.stock.productCount} produtos</strong><em>{data.stock.entries} entradas · {data.stock.exits} saídas</em></article><article><small>Clientes ativos</small><strong>{data.entities.activeCustomers}</strong></article><article><small>Fornecedores ativos</small><strong>{data.entities.activeSuppliers}</strong></article></div><div className="cards"><article>{chart("Evolução de vendas", data.charts.salesByDay)}</article><article>{chart("Compras por período", data.charts.purchasesByDay)}</article><article>{chart("Despesas por período", data.charts.expensesByDay)}</article></div><div className="cards"><article><h3>Vendas por método</h3>{data.sales.byPayment.map(row => <p key={row.paymentMethod}>{row.paymentMethod}: {formatKwanza(row.totalCents)}</p>)}</article><article><h3>Alertas comerciais</h3>{[...data.alerts.pendingReceivables.map(row => `A receber: ${row.label} · ${money(row.amountCents)}`), ...data.alerts.pendingPayables.map(row => `A pagar: ${row.label} · ${money(row.amountCents)}`), ...data.alerts.highValuePurchases.map(row => `Compra: ${row.label} · ${money(row.amountCents)}`), ...data.alerts.highValueExpenses.map(row => `Despesa: ${row.label} · ${money(row.amountCents)}`)].map(item => <p key={item}>{item}</p>)}</article><article><h3>Dados não disponíveis</h3>{data.limitations.map(item => <p key={item}>{item}</p>)}</article></div></>}</section>;
}
function Cashflow() {
  const [data, setData] = useState<{ entriesCents: number; exitsCents: number; netCents: number; rows: Array<{ id: string; date: string; direction: string; origin: string; reference: string; method: string; amountCents: number }> } | null>(null);
  const [period, setPeriod] = useState("today");
  const load = async () => { const now = new Date(); const from = new Date(now); const to = new Date(now); if (period === "yesterday") { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); } else if (period === "last7") from.setDate(from.getDate() - 6); else if (period === "month") from.setDate(1); else if (period === "previousMonth") { from.setMonth(from.getMonth() - 1, 1); to.setMonth(to.getMonth(), 0); } from.setHours(0, 0, 0, 0); to.setHours(23, 59, 59, 999); const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() }); const response = await fetch(`${api()}/api/v1/cashflow?${params}`, { headers: { authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` } }); if (response.ok) setData(await response.json()); };
  useEffect(() => { void load(); }, [period]);
  return <section><h2>Fluxo de caixa</h2><p>Entradas e saídas efetivamente registadas; não representa saldo de caixa.</p><select value={period} onChange={e => setPeriod(e.target.value)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="last7">Últimos 7 dias</option><option value="month">Este mês</option><option value="previousMonth">Mês anterior</option></select>{data && <><div className="cards"><article><small>Entradas</small><strong>{formatKwanza(data.entriesCents)}</strong></article><article><small>Saídas</small><strong>{formatKwanza(data.exitsCents)}</strong></article><article><small>Movimento líquido</small><strong>{formatKwanza(data.netCents)}</strong></article></div><table><thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Referência</th><th>Método</th><th>Valor</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td>{new Date(row.date).toLocaleString("pt-AO")}</td><td>{row.direction === "IN" ? "Entrada" : "Saída"}</td><td>{row.origin}</td><td>{row.reference}</td><td>{row.method}</td><td>{formatKwanza(row.amountCents)}</td></tr>)}{!data.rows.length && <tr><td colSpan={6}>Sem movimentos no período.</td></tr>}</tbody></table></>}</section>;
}
function Dashboard() {
  const [showConfig, setShowConfig] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);
  const [sales, setSales] = useState<Array<{ id: string; number: string; totalCents: number; status: string; createdAt: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; nif?: string | null; phone?: string | null; email?: string | null; active: boolean; creditLimitCents: number; outstandingDebtCents: number }>>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [paymentCustomerId, setPaymentCustomerId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [cashSessionId, setCashSessionId] = useState("");
  const [receivableMessage, setReceivableMessage] = useState("");
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
  useEffect(() => {
    if (!online) return;
    fetch(`${api()}/api/v1/customers`, { headers: { authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` } })
      .then((response) => response.ok ? response.json() as Promise<typeof customers> : Promise.reject(new Error("Não foi possível carregar os clientes.")))
      .then(setCustomers)
      .catch((error: unknown) => setReceivableMessage(error instanceof Error ? error.message : "Não foi possível carregar os clientes."));
  }, [online]);
  async function receivePayment() {
    const amountCents = Math.round(Number(paymentAmount.replace(",", ".")) * 100);
    if (!paymentCustomerId || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !cashSessionId) { setReceivableMessage("Selecione o cliente, indique um valor válido e a sessão de caixa."); return; }
    const response = await fetch(`${api()}/api/v1/customers/${paymentCustomerId}/payments`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` }, body: JSON.stringify({ amountCents, paymentMethod: "CASH", cashSessionId, idempotencyKey: crypto.randomUUID() }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setReceivableMessage(data.error ?? "Não foi possível registar o recebimento."); return; }
    setReceivableMessage("Recebimento registado com sucesso."); setPaymentAmount("");
    const refreshed = await fetch(`${api()}/api/v1/customers`, { headers: { authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` } });
    if (refreshed.ok) setCustomers(await refreshed.json() as typeof customers);
  }
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((sale) => sale.createdAt.slice(0, 10) === today && sale.status !== "CANCELLED");
  const todayTotal = todaySales.reduce((sum, sale) => sum + sale.totalCents, 0);
  const visibleCustomers = customers.filter((customer) => `${customer.name} ${customer.nif ?? ""} ${customer.email ?? ""}`.toLowerCase().includes(customerQuery.toLowerCase()));
  const totalDebt = customers.reduce((sum, customer) => sum + customer.outstandingDebtCents, 0);
  return <main><nav><b>VendaJá Angola</b><span>{online ? "● Online" : "● Offline"}　 Dashboard　 Clientes　 Crédito　 Contas a Receber　 Fluxo de caixa　 <button onClick={() => setShowConfig(!showConfig)}>Configuração fiscal</button></span></nav><h1>Visão geral</h1>{!online && <p className="offline-notice">Modo offline ativo. As vendas locais serão sincronizadas quando a ligação for restabelecida.</p>}{showConfig && <section><h2>Configuração AGT</h2><p>Credenciais armazenadas cifradas; nunca são exibidas. A configuração requer acesso de administrador.</p><input type="file" aria-label="Certificado PFX" /><input type="password" placeholder="Passphrase do certificado" />  <p><small>Validação SAF-T: estrutural até ser configurado o XSD oficial atual. Isto não constitui homologação legal.</small></p></section>}{online && <CommercialDashboard />}<div className="cards"><article><small>Vendas hoje</small><strong>{formatKwanza(todayTotal)}</strong><em>{todaySales.length} documentos</em></article><article><small>Clientes ativos</small><strong>{customers.filter((customer) => customer.active).length}</strong><em>{customers.length} registados</em></article><article><small>Total a receber</small><strong>{formatKwanza(totalDebt)}</strong><em>Saldo de crédito pendente</em></article></div><section><h2>Clientes e crédito</h2><input placeholder="Pesquisar nome, NIF ou email" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} />{receivableMessage && <p className={receivableMessage.includes("sucesso") ? "ok" : "error-message"}>{receivableMessage}</p>}<table><thead><tr><th>Cliente</th><th>NIF</th><th>Contacto</th><th>Limite</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>{visibleCustomers.map((customer) => <tr key={customer.id}><td>{customer.name}</td><td>{customer.nif ?? "—"}</td><td>{customer.phone ?? customer.email ?? "—"}</td><td>{formatKwanza(customer.creditLimitCents)}</td><td>{formatKwanza(customer.outstandingDebtCents)}</td><td>{customer.outstandingDebtCents <= 0 ? "PAGO" : "PENDENTE"}</td></tr>)}{!visibleCustomers.length && <tr><td colSpan={6}>Nenhum cliente encontrado.</td></tr>}</tbody></table></section><section><h2>Registar recebimento</h2><div className="customer-fields"><label>Cliente<select value={paymentCustomerId} onChange={(event) => setPaymentCustomerId(event.target.value)}><option value="">Selecione</option>{customers.filter((customer) => customer.outstandingDebtCents > 0).map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {formatKwanza(customer.outstandingDebtCents)}</option>)}</select></label><label>Valor (Kz)<input type="number" min="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><label>Sessão de caixa<input value={cashSessionId} onChange={(event) => setCashSessionId(event.target.value)} placeholder="UUID da sessão aberta" /></label></div><button onClick={() => void receivePayment()}>Registar recebimento</button></section>  <Cashflow /><CommercialOperations online={online} /><Reports /></main>;
}

function CommercialOperations({ online }: { online: boolean }) {
  const [tab, setTab] = useState<"suppliers" | "purchases" | "payables" | "expenses">("suppliers");
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; nif?: string | null; code?: string | null; active: boolean }>>([]);
  const [purchases, setPurchases] = useState<Array<{ id: string; number: string; status: string; totalCents: number; purchasedAt: string; supplier: { name: string } }>>([]);
  const [payables, setPayables] = useState<Array<{ id: string; originalCents: number; paidCents: number; dueDate: string; status: string; supplier: { name: string }; purchase: { number: string } }>>([]);
  const [expenses, setExpenses] = useState<Array<{ id: string; description: string; category: string; amountCents: number; expenseDate: string; paymentMethod: string; status: string; supplier?: { id: string; name: string } | null }>>([]);
  const [query, setQuery] = useState(""); const [message, setMessage] = useState(""); const [payablePayment, setPayablePayment] = useState<{ id: string; label: string; balanceCents: number } | null>(null); const [payableAmount, setPayableAmount] = useState(""); const [payableReference, setPayableReference] = useState("");
  const [form, setForm] = useState({ name: "", nif: "", code: "", phone: "", email: "", address: "", contactName: "", notes: "" });
  const [expenseForm, setExpenseForm] = useState({ description: "", category: "OTHER", supplierId: "", amountCents: 0, expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", notes: "" });
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const auth = { authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}`, "content-type": "application/json" };
  const load = async () => {
    if (!online) return;
    const [s, p, a, e] = await Promise.all([fetch(`${api()}/api/v1/suppliers`, { headers: auth }), fetch(`${api()}/api/v1/purchases`, { headers: auth }), fetch(`${api()}/api/v1/purchases/payables`, { headers: auth }), fetch(`${api()}/api/v1/expenses`, { headers: auth })]);
    if (s.ok) setSuppliers(await s.json()); if (p.ok) setPurchases(await p.json()); if (a.ok) setPayables(await a.json()); if (e.ok) setExpenses(await e.json());
  };
  const createExpense = async () => {
    if (!expenseForm.description.trim() || expenseForm.amountCents <= 0) { setMessage("Indique uma descrição e um valor maior que zero."); return; }
    const response = await fetch(`${api()}/api/v1/expenses${editingExpenseId ? `/${editingExpenseId}` : ""}`, { method: editingExpenseId ? "PATCH" : "POST", headers: auth, body: JSON.stringify({ ...expenseForm, supplierId: expenseForm.supplierId || null }) });
    if (!response.ok) { setMessage((await response.json() as { error?: string }).error ?? "Não foi possível registar a despesa."); return; }
    setExpenseForm({ description: "", category: "OTHER", supplierId: "", amountCents: 0, expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", notes: "" }); setEditingExpenseId(null); setMessage(editingExpenseId ? "Despesa atualizada." : "Despesa registada."); await load();
  };
  const cancelExpense = async (id: string) => { const response = await fetch(`${api()}/api/v1/expenses/${id}/cancel`, { method: "POST", headers: auth }); if (!response.ok) setMessage("Não foi possível anular a despesa."); else await load(); };
  const submitPayablePayment = async () => { if (!payablePayment) return; const amountCents = Math.round(Number(payableAmount.replace(",", ".")) * 100); if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > payablePayment.balanceCents) { setMessage("O valor do pagamento é inválido ou excede o saldo."); return; } const response = await fetch(`${api()}/api/v1/payables/${payablePayment.id}/payments`, { method: "POST", headers: auth, body: JSON.stringify({ amountCents, paymentMethod: "TRANSFER", reference: payableReference || null, idempotencyKey: crypto.randomUUID() }) }); if (!response.ok) { setMessage((await response.json() as { error?: string }).error ?? "Não foi possível registar o pagamento."); return; } setPayablePayment(null); setPayableAmount(""); setPayableReference(""); setMessage("Pagamento registado."); await load(); };
  useEffect(() => { void load(); }, [online]);
  const createSupplier = async () => {
    const response = await fetch(`${api()}/api/v1/suppliers`, { method: "POST", headers: auth, body: JSON.stringify({ ...form, nif: form.nif || null, code: form.code || null }) });
    if (!response.ok) { setMessage((await response.json() as { error?: string }).error ?? "Não foi possível criar o fornecedor."); return; }
    setForm({ name: "", nif: "", code: "", phone: "", email: "", address: "", contactName: "", notes: "" }); setMessage("Fornecedor criado."); await load();
  };
  const visible = suppliers.filter((s) => `${s.name} ${s.nif ?? ""} ${s.code ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <section><h2>Fornecedores, compras, contas a pagar e despesas</h2><p><button onClick={() => setTab("suppliers")}>Fornecedores</button> <button onClick={() => setTab("purchases")}>Compras ({purchases.length})</button> <button onClick={() => setTab("payables")}>Contas a pagar ({payables.length})</button> <button onClick={() => setTab("expenses")}>Despesas ({expenses.length})</button></p>{message && <p className="ok">{message}</p>}{tab === "suppliers" && <><div className="customer-fields"><input placeholder="Nome / razão social" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /><input placeholder="NIF" value={form.nif} onChange={e => setForm({ ...form, nif: e.target.value })} /><input placeholder="Código" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /><input placeholder="Telefone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /><input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /><input placeholder="Endereço" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /><input placeholder="Pessoa de contacto" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /><button onClick={() => void createSupplier()}>Novo fornecedor</button></div><input placeholder="Pesquisar fornecedor" value={query} onChange={e => setQuery(e.target.value)} /><table><thead><tr><th>Fornecedor</th><th>NIF</th><th>Código</th><th>Estado</th></tr></thead><tbody>{visible.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.nif ?? "—"}</td><td>{s.code ?? "—"}</td><td>{s.active ? "Ativo" : "Inativo"}</td></tr>)}</tbody></table></>}{tab === "purchases" && <table><thead><tr><th>Número</th><th>Fornecedor</th><th>Data</th><th>Total</th><th>Estado</th></tr></thead><tbody>{purchases.map(p => <tr key={p.id}><td>{p.number}</td><td>{p.supplier.name}</td><td>{new Date(p.purchasedAt).toLocaleDateString("pt-AO")}</td><td>{formatKwanza(p.totalCents)}</td><td>{p.status}</td></tr>)}</tbody></table>}{tab === "payables" && <table><thead><tr><th>Fornecedor</th><th>Compra</th><th>Original</th><th>Pago</th><th>Saldo</th><th>Vencimento</th><th>Estado</th></tr></thead><tbody>{payables.map(p => <tr key={p.id}><td>{p.supplier.name}</td><td>{p.purchase.number}</td><td>{formatKwanza(p.originalCents)}</td><td>{formatKwanza(p.paidCents)}</td><td>{formatKwanza(p.originalCents - p.paidCents)}</td><td>{new Date(p.dueDate).toLocaleDateString("pt-AO")}</td>  <td>{p.status}</td><td>{p.originalCents > p.paidCents && <button onClick={() => setPayablePayment({ id: p.id, label: p.supplier.name, balanceCents: p.originalCents - p.paidCents })}>Pagar</button>}</td></tr>)}</tbody></table>}{payablePayment && <div className="modal-backdrop"><div className="modal"><h2>Pagamento a fornecedor</h2><p>{payablePayment.label} · saldo {formatKwanza(payablePayment.balanceCents)}</p><label>Valor (Kz)<input type="number" min="0.01" value={payableAmount} onChange={e => setPayableAmount(e.target.value)} /></label><label>Referência<input value={payableReference} onChange={e => setPayableReference(e.target.value)} /></label><button onClick={() => void submitPayablePayment()}>Confirmar pagamento</button><button onClick={() => setPayablePayment(null)}>Cancelar</button></div></div>}{tab === "expenses" && <><div className="customer-fields"><input placeholder="Descrição" value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} /><input placeholder="Categoria (ENERGY, RENT, OTHER)" value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })} /><select value={expenseForm.supplierId} onChange={e => setExpenseForm({ ...expenseForm, supplierId: e.target.value })}><option value="">Sem fornecedor</option>{suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input type="number" min="0.01" placeholder="Valor (Kz)" value={expenseForm.amountCents / 100 || ""} onChange={e => setExpenseForm({ ...expenseForm, amountCents: Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0 })} /><input type="date" value={expenseForm.expenseDate} onChange={e => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} /><select value={expenseForm.paymentMethod} onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}><option value="CASH">Dinheiro</option><option value="CARD">Cartão</option><option value="TRANSFER">Transferência</option><option value="CREDIT">Crédito</option></select><button onClick={() => void createExpense()}>Registar despesa</button></div><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th>Data</th><th>Valor</th><th>Estado</th><th>Ação</th></tr></thead><tbody>{expenses.map(e => <tr key={e.id}><td>{e.description}</td><td>{e.category}</td><td>{e.supplier?.name ?? "—"}</td><td>{new Date(e.expenseDate).toLocaleDateString("pt-AO")}</td><td>{formatKwanza(e.amountCents)}</td><td>{e.status}</td>  <td>{e.status === "ACTIVE" && <><button onClick={() => { setEditingExpenseId(e.id); setExpenseForm({ description: e.description, category: e.category, supplierId: e.supplier?.id ?? "", amountCents: e.amountCents, expenseDate: e.expenseDate.slice(0, 10), paymentMethod: e.paymentMethod, notes: "" }); }}>Editar</button><button onClick={() => void cancelExpense(e.id)}>Anular</button></>}</td></tr>)}</tbody></table></>}</section>;
}

function Reports() {
  const [type, setType] = useState("sales"); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [data, setData] = useState<Record<string, unknown> | null>(null); const [error, setError] = useState("");
  const load = async () => { const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", `${to}T23:59:59.999`); const response = await fetch(`${api()}/api/v1/reports/${type}?${params}`, { headers: { authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` } }); if (!response.ok) { setError("Não foi possível carregar o relatório."); return; } setData(await response.json()); };
  useEffect(() => { void load(); }, [type]);
  const rows = Array.isArray(data?.rows) ? data.rows as Array<Record<string, unknown>> : [];
  return <section><h2>Relatórios comerciais</h2><div className="customer-fields"><select value={type} onChange={e => setType(e.target.value)}>{[["sales", "Vendas"], ["products", "Produtos"], ["stock", "Stock"], ["purchases", "Compras"], ["expenses", "Despesas"], ["receivables", "Contas a receber"], ["payables", "Contas a pagar"], ["summary", "Resumo financeiro"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="date" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" value={to} onChange={e => setTo(e.target.value)} /><button onClick={() => void load()}>Aplicar filtros</button></div>{error && <p className="error-message">{error}</p>}{data && type === "sales" && <div className="cards"><article><small>Documentos</small><strong>{String(data.documents ?? 0)}</strong></article><article><small>Total</small><strong>{formatKwanza(Number(data.totalCents ?? 0))}</strong></article><article><small>Ticket médio</small><strong>{formatKwanza(Number(data.averageTicketCents ?? 0))}</strong></article></div>}{data && type === "summary" && <div className="cards"><article><small>Vendas</small><strong>{formatKwanza(Number(data.salesCents ?? 0))}</strong></article><article><small>Compras</small><strong>{formatKwanza(Number(data.purchasesCents ?? 0))}</strong></article><article><small>Despesas</small><strong>{formatKwanza(Number(data.expensesCents ?? 0))}</strong></article></div>}<table><thead><tr>{rows[0] ? Object.keys(rows[0]).slice(0, 8).map(key => <th key={key}>{key}</th>) : <th>Resultado</th>}</tr></thead><tbody>{rows.slice(0, 200).map((row, index) => <tr key={index}>{Object.keys(row).slice(0, 8).map(key => <td key={key}>{typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key] ?? "—")}</td>)}</tr>)}{!rows.length && <tr><td>Sem dados no período selecionado.</td></tr>}</tbody></table></section>;
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
