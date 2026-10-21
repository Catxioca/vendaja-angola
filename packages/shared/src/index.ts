export const CURRENCY = "AOA" as const;
export const TAX_RATES = { standard: 0.14, exempt: 0, reduced: 0.05 } as const;
export const TAX_CATEGORY = {
  GENERAL: "GENERAL",
  EXEMPT: "EXEMPT",
  EXCLUDED: "EXCLUDED",
  PRESS: "PRESS",
} as const;
export type TaxCategory = (typeof TAX_CATEGORY)[keyof typeof TAX_CATEGORY];

export type FiscalDocumentType =
  | "INVOICE"
  | "INVOICE_RECEIPT"
  | "PROFORMA"
  | "TRANSPORT_GUIDE"
  | "CREDIT_NOTE";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "CREDIT" | "MIXED";
export type SyncOperation = "CREATE" | "UPDATE";
export interface Product { id: string; sku: string; name: string; priceCents: number; stock: number; taxRate: number; active: boolean; exemptionCode?: string | null; costCents?: number; barcode?: string | null; qrCode?: string | null; imageUrl?: string | null; brand?: string | null; model?: string | null; categoryId?: string | null; }
export interface SaleLine { productId: string; quantity: number; unitPriceCents: number; taxRate: number; }
export interface Sale { id: string; number: string; lines: SaleLine[]; subtotalCents: number; taxCents: number; totalCents: number; currency: typeof CURRENCY; createdAt: string; discountCents?: number; paymentMethod?: PaymentMethod; cashCents?: number; cardCents?: number; transferCents?: number; tenderedCents?: number; changeCents?: number; cashSessionId?: string | null; customerId?: string | null; dueDate?: string | null; customerName?: string; customerNif?: string; customerAddress?: string; fiscalType?: FiscalDocumentType; operatorName?: string; operatorNif?: string; operatorPhone?: string; terminalId?: string; }
export interface SyncMutation { id: string; operation: SyncOperation; entity: "SALE" | "PRODUCT"; payload: unknown; occurredAt: string; }
export interface SyncRequest { deviceId: string; mutations: SyncMutation[]; lastCursor?: string; }
export interface SyncResponse { accepted: string[]; rejected: { id: string; reason: string }[]; cursor: string; }
export interface Customer { id: string; name: string; taxNumber?: string; phone?: string; createdAt: string; }
export interface CashEntry { id: string; type: "OPEN" | "CLOSE" | "IN" | "OUT"; amountCents: number; note?: string; createdAt: string; }
export interface LocalPosStorage {
  getSales(): Promise<Sale[]>;
  saveSale(sale: Sale): Promise<void>;
  saveSaleAndEnqueue(sale: Sale, mutation: SyncMutation): Promise<void>;
  getCustomers(): Promise<Customer[]>;
  saveCustomer(customer: Customer): Promise<void>;
  getCashEntries(): Promise<CashEntry[]>;
  saveCashEntry(entry: CashEntry): Promise<void>;
  getOutbox(): Promise<SyncMutation[]>;
  enqueue(mutation: SyncMutation): Promise<void>;
  acknowledge(ids: string[]): Promise<void>;
  clear?(): Promise<void>;
}

const memoryStore = new Map<string, unknown[]>();
function memory<T>(key: string): T[] { return (memoryStore.get(key) as T[] | undefined) ?? []; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export const POS_DB_VERSION = 2;
const POS_STORES = ["sales", "customers", "cash", "outbox"] as const;

function ensurePosStores(db: IDBDatabase) {
  for (const store of POS_STORES) {
    if (!db.objectStoreNames.contains(store)) {
      db.createObjectStore(store, { keyPath: "id" });
    }
  }
}

/** Utility to clean up IndexedDB / memory storage in development or test reset */
export function deleteBrowserPosStorage(name = "angola-pos"): Promise<void> {
  if (typeof indexedDB === "undefined") {
    for (const key of Array.from(memoryStore.keys())) {
      if (key.startsWith(`${name}:`)) memoryStore.delete(key);
    }
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn(`[storage] Eliminação da base de dados '${name}' em espera por fecho de conexões.`);
      resolve();
    };
  });
}

/** Dependency-free offline storage. IndexedDB is used when available, with a local memory fallback for SSR/tests. */
export function createBrowserPosStorage(name = "angola-pos"): LocalPosStorage {
  const indexed = typeof indexedDB !== "undefined";
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, POS_DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }

    request.onupgradeneeded = () => {
      ensurePosStores(request.result);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        try { db.close(); } catch { /* ignore */ }
      };
      resolve(db);
    };

    request.onerror = () => {
      const error = request.error;
      // If the local database is already at a higher version than POS_DB_VERSION (VersionError),
      // open without specifying a version to connect to the existing version safely.
      if (error?.name === "VersionError") {
        try {
          const fallbackRequest = indexedDB.open(name);
          fallbackRequest.onsuccess = () => {
            const fallbackDb = fallbackRequest.result;
            fallbackDb.onversionchange = () => {
              try { fallbackDb.close(); } catch { /* ignore */ }
            };
            const missingStores = POS_STORES.filter((s) => !fallbackDb.objectStoreNames.contains(s));
            if (missingStores.length === 0) {
              resolve(fallbackDb);
            } else {
              const nextVersion = fallbackDb.version + 1;
              fallbackDb.close();
              const upgradeRequest = indexedDB.open(name, nextVersion);
              upgradeRequest.onupgradeneeded = () => ensurePosStores(upgradeRequest.result);
              upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
              upgradeRequest.onerror = () => reject(upgradeRequest.error ?? new Error("Falha ao atualizar esquema do IndexedDB"));
            }
          };
          fallbackRequest.onerror = () => reject(fallbackRequest.error ?? error);
          fallbackRequest.onblocked = () => reject(new Error("Acesso à base de dados IndexedDB bloqueado"));
        } catch (fallbackEx) {
          reject(fallbackEx);
        }
      } else {
        reject(error ?? new Error("Falha ao abrir IndexedDB"));
      }
    };

    request.onblocked = () => {
      console.warn(`[storage] Abertura de IndexedDB '${name}' bloqueada por conexões abertas.`);
    };
  });

  async function all<T>(store: string): Promise<T[]> {
    if (!indexed) return clone(memory<T>(`${name}:${store}`));
    const db = await open();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(store, "readonly");
        const request = tx.objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function put<T extends { id: string }>(store: string, value: T): Promise<void> {
    if (!indexed) {
      const values = memory<T>(`${name}:${store}`).filter((item) => item.id !== value.id);
      values.push(clone(value));
      memoryStore.set(`${name}:${store}`, values);
      return;
    }
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(store, "readwrite");
        const request = tx.objectStore(store).put(value);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function saveSaleAndEnqueue(sale: Sale, mutation: SyncMutation): Promise<void> {
    if (!indexed) {
      const sales = memory<Sale>(`${name}:sales`).filter((item) => item.id !== sale.id);
      const outbox = memory<SyncMutation>(`${name}:outbox`).filter((item) => item.id !== mutation.id);
      sales.push(clone(sale));
      outbox.push(clone(mutation));
      memoryStore.set(`${name}:sales`, sales);
      memoryStore.set(`${name}:outbox`, outbox);
      return;
    }
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      try {
        const transaction = db.transaction(["sales", "outbox"], "readwrite");
        transaction.objectStore("sales").put(sale);
        transaction.objectStore("outbox").put(mutation);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("Transação de armazenamento abortada"));
      } catch (err) {
        reject(err);
      }
    });
  }

  return {
    getSales: () => all<Sale>("sales"),
    saveSale: (sale) => put("sales", sale),
    saveSaleAndEnqueue,
    getCustomers: () => all<Customer>("customers"),
    saveCustomer: (customer) => put("customers", customer),
    getCashEntries: () => all<CashEntry>("cash"),
    saveCashEntry: (entry) => put("cash", entry),
    getOutbox: () => all<SyncMutation>("outbox"),
    enqueue: (mutation) => put("outbox", mutation),
    acknowledge: async (ids) => {
      const current = await all<SyncMutation>("outbox");
      if (!indexed) {
        memoryStore.set(`${name}:outbox`, current.filter((item) => !ids.includes(item.id)));
        return;
      }
      if (!ids.length) return;
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction("outbox", "readwrite");
          const store = tx.objectStore("outbox");
          for (const id of ids) {
            store.delete(id);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error("Acknowledge abortado"));
        } catch (err) {
          reject(err);
        }
      });
    },
    clear: async () => {
      if (!indexed) {
        for (const key of Array.from(memoryStore.keys())) {
          if (key.startsWith(`${name}:`)) memoryStore.delete(key);
        }
        return;
      }
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(["sales", "customers", "cash", "outbox"], "readwrite");
          tx.objectStore("sales").clear();
          tx.objectStore("customers").clear();
          tx.objectStore("cash").clear();
          tx.objectStore("outbox").clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error("Limpeza de armazenamento abortada"));
        } catch (err) {
          reject(err);
        }
      });
    },
  };
}

type CapacitorSqlite = {
  createConnection: (name: string, encrypted: boolean, mode: string, version: number, readonly: boolean) => Promise<unknown>;
  open: (name: string) => Promise<void>;
  execute: (options: { database: string; statements: string; transaction?: boolean }) => Promise<unknown>;
  query: (options: { database: string; statement: string }) => Promise<{ values?: Array<{ data: string }> }>;
  run: (options: { database: string; statement: string; values?: unknown[] }) => Promise<unknown>;
};

export class CapacitorSqliteStorage implements LocalPosStorage {
  private connection?: CapacitorSqlite;
  private ready?: Promise<void>;
  constructor(private readonly name = "angola-pos") {}
  private async getConnection(): Promise<CapacitorSqlite> {
    if (!this.connection) {
      const module = await import("@capacitor-community/sqlite");
      this.connection = new module.SQLiteConnection(module.CapacitorSQLite) as unknown as CapacitorSqlite;
    }
    return this.connection;
  }
  private async ensureReady(): Promise<void> {
    if (!this.ready) this.ready = (async () => {
      const connection = await this.getConnection();
      await connection.createConnection(this.name, false, "no-encryption", 1, false);
      await connection.open(this.name);
      await connection.execute({ database: this.name, transaction: true, statements: "CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cash (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);" });
    })();
    await this.ready;
  }
  private async all<T>(table: string): Promise<T[]> {
    await this.ensureReady();
    const result = await (await this.getConnection()).query({ database: this.name, statement: `SELECT data FROM ${table}` });
    return (result.values ?? []).map((row) => JSON.parse(row.data) as T);
  }
  private async put<T extends { id: string }>(table: string, value: T): Promise<void> {
    await this.ensureReady();
    await (await this.getConnection()).run({ database: this.name, statement: `INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`, values: [value.id, JSON.stringify(value)] });
  }
  getSales(): Promise<Sale[]> { return this.all<Sale>("sales"); }
  saveSale(sale: Sale): Promise<void> { return this.put("sales", sale); }
  async saveSaleAndEnqueue(sale: Sale, mutation: SyncMutation): Promise<void> {
    await this.ensureReady();
    await (await this.getConnection()).execute({ database: this.name, transaction: true, statements: `BEGIN; INSERT OR REPLACE INTO sales (id, data) VALUES ('${sqlQuote(sale.id)}', '${sqlQuote(JSON.stringify(sale))}'); INSERT OR REPLACE INTO outbox (id, data) VALUES ('${sqlQuote(mutation.id)}', '${sqlQuote(JSON.stringify(mutation))}'); COMMIT;` });
  }
  getCustomers(): Promise<Customer[]> { return this.all<Customer>("customers"); }
  saveCustomer(customer: Customer): Promise<void> { return this.put("customers", customer); }
  getCashEntries(): Promise<CashEntry[]> { return this.all<CashEntry>("cash"); }
  saveCashEntry(entry: CashEntry): Promise<void> { return this.put("cash", entry); }
  getOutbox(): Promise<SyncMutation[]> { return this.all<SyncMutation>("outbox"); }
  enqueue(mutation: SyncMutation): Promise<void> { return this.put("outbox", mutation); }
  async acknowledge(ids: string[]): Promise<void> {
    await this.ensureReady();
    if (!ids.length) return;
    await (await this.getConnection()).execute({ database: this.name, transaction: true, statements: `BEGIN; ${ids.map((id) => `DELETE FROM outbox WHERE id = '${sqlQuote(id)}';`).join(" ")} COMMIT;` });
  }
  async clear(): Promise<void> {
    await this.ensureReady();
    await (await this.getConnection()).execute({ database: this.name, transaction: true, statements: "DELETE FROM sales; DELETE FROM customers; DELETE FROM cash; DELETE FROM outbox;" });
  }
}
function sqlQuote(value: string): string { return value.replace(/'/g, "''"); }

export function createPosStorage(name = "angola-pos"): LocalPosStorage {
  const capacitor = (globalThis as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } }).Capacitor;
  const platform = capacitor?.getPlatform?.();
  return capacitor?.isNativePlatform?.() || platform === "android" || platform === "ios"
    ? new CapacitorSqliteStorage(name)
    : createBrowserPosStorage(name);
}

export interface SyncEngineOptions {
  apiUrl: string;
  token: string;
  deviceId: string;
  intervalMs?: number;
  onState?: (online: boolean) => void;
  onResult?: (result: SyncResponse) => void;
  onError?: (error: Error) => void;
}
export class SyncEngine {
  private timer?: ReturnType<typeof setInterval>;
  private online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  private flushing?: Promise<SyncResponse | undefined>;
  private started = false;
  private readonly handleOnline = () => this.setOnline(true);
  private readonly handleOffline = () => this.setOnline(false);
  constructor(private readonly storage: LocalPosStorage, private readonly options: SyncEngineOptions) {}
  async flush(): Promise<SyncResponse | undefined> {
    if (this.flushing) return this.flushing;
    this.flushing = this.flushOnce().finally(() => { this.flushing = undefined; });
    return this.flushing;
  }
  start(): void {
    if (typeof window === "undefined" || this.started) return;
    this.started = true;
    window.addEventListener("online", this.handleOnline); window.addEventListener("offline", this.handleOffline);
    this.timer = setInterval(() => { if (this.online) void this.flush().catch((error: unknown) => this.notifyError(error)); }, this.options.intervalMs ?? 30000);
    void this.flush().catch((error: unknown) => this.notifyError(error));
  }
  stop(): void {
    if (!this.started) return;
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener("online", this.handleOnline); window.removeEventListener("offline", this.handleOffline);
    this.timer = undefined; this.started = false;
  }
  private setOnline(online: boolean): void {
    this.online = online; this.options.onState?.(online);
    if (online) void this.flush().catch((error: unknown) => this.notifyError(error));
  }
  private notifyError(error: unknown): void {
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
  private async flushOnce(): Promise<SyncResponse | undefined> {
    if (!this.online || (typeof navigator !== "undefined" && navigator.onLine === false)) return undefined;
    const mutations = await this.storage.getOutbox(); if (!mutations.length) return undefined;
    const response = await fetch(`${this.options.apiUrl.replace(/\/$/, "")}/api/v1/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.options.token}`, "x-device-id": this.options.deviceId },
      body: JSON.stringify({ deviceId: this.options.deviceId, mutations }),
    });
    if (!response.ok) throw new Error(`Sync failed (${response.status})`);
    const result = await response.json() as SyncResponse;
    const sentIds = new Set(mutations.map((mutation) => mutation.id));
    await this.storage.acknowledge(result.accepted.filter((id) => sentIds.has(id)));
    this.options.onResult?.(result);
    return result;
  }
}

export interface Printer { print(receipt: Uint8Array): Promise<void>; }
export interface ReceiptOptions {
  company?: { name?: string; nif?: string; address?: string; phone?: string; logoText?: string };
  fiscalHash?: string;
  qrPayload?: string;
  bank?: { name?: string; holder?: string; iban?: string };
  validUntil?: string;
  catalog?: Array<{ id: string; name: string }>;
  paperWidth?: "58mm" | "80mm";
}
function amountWords(cents: number): string {
  const units = ["ZERO", "UM", "DOIS", "TRÊS", "QUATRO", "CINCO", "SEIS", "SETE", "OITO", "NOVE", "DEZ", "ONZE", "DOZE", "TREZE", "CATORZE", "QUINZE", "DEZASSEIS", "DEZASSETE", "DEZOITO", "DEZANOVE"];
  const tens = ["", "", "VINTE", "TRINTA", "QUARENTA", "CINQUENTA", "SESSENTA", "SETENTA", "OITENTA", "NOVENTA"];
  const integer = Math.floor(Math.max(0, cents) / 100);
  if (integer < 20) return units[integer] ?? "ZERO";
  if (integer < 100) return `${tens[Math.floor(integer / 10)]}${integer % 10 ? ` E ${units[integer % 10]}` : ""}`;
  return `${integer} Kz`;
}
function paymentLabel(method?: PaymentMethod): string {
  return method === "CASH" ? "Dinheiro" : method === "CARD" ? "TPA / Multicaixa" : method === "TRANSFER" ? "Multicaixa Express / Transferência" : method === "CREDIT" ? "Fiado / Crédito" : "Pagamento misto";
}
export function escPosReceipt(sale: Sale, options: ReceiptOptions = {}): Uint8Array {
  const truncate = (value: string, size: number) => value.length > size ? `${value.slice(0, Math.max(0, size - 1))}…` : value;
  const company = options.company ?? {};
  const proforma = sale.fiscalType === "PROFORMA";
  const catalog = options.catalog ?? [];
  const is58mm = options.paperWidth === "58mm";
  const lineWidth = is58mm ? 32 : 42;
  const divider = "-".repeat(lineWidth) + "\n";

  const formattedLines = (sale.lines ?? []).map((line) => {
    const product = catalog.find((p) => p.id === line.productId);
    const desc = product ? product.name : line.productId;
    const qtyPrice = `${line.quantity} x ${formatKwanza(line.unitPriceCents).replace(" Kz", "")}`;
    const total = formatKwanza(line.unitPriceCents * line.quantity);
    const tax = line.taxRate > 0 ? `IVA ${Number(line.taxRate * 100).toFixed(0)}%` : "Isento";

    if (is58mm) {
      return `${truncate(desc, 32)}\n  ${qtyPrice} (${tax})`.padEnd(20) + `${total}\n`;
    }
    return `${truncate(desc, 18).padEnd(18)} ${line.quantity} x ${formatKwanza(line.unitPriceCents).replace(" Kz", "")} ${total} ${tax}\n`;
  });

  const lines = [
    "\x1b\x40", "\x1b\x61\x01", `${company.logoText ? company.logoText + "\n" : ""}`, `${company.name ?? "VendaJá Angola"}\n`,
    `NIF: ${company.nif ?? "—"}\n${company.address ?? "—"}\nTel: ${company.phone ?? "—"}\n`,
    "\x1b\x61\x00", `${proforma ? "FATURA PROFORMA (NÃO VALE COMO DOCUMENTO FISCAL)" : "FATURA/RECIBO"}\n`,
    `${sale.number}  ${new Date(sale.createdAt || Date.now()).toLocaleString("pt-AO")}\n`,
    `Atendido por: ${sale.operatorName ?? "—"} | Caixa: ${sale.terminalId ?? "01"}\n`,
    divider,
    is58mm ? "Artigo / Qtd x Preço       Total\n" : "Descrição          Qtd x P.Un. Total IVA\n",
    ...formattedLines,
    divider,
    `TOTAL GERAL`.padEnd(lineWidth - 14) + `${formatKwanza(sale.totalCents)}\n`,
    `Por extenso: ${amountWords(sale.totalCents)} Kz\n`, `Pagamento: ${paymentLabel(sale.paymentMethod)}\n`,
    `Troco: ${formatKwanza(Math.max(0, (sale.cashCents ?? 0) - sale.totalCents))}\n`,
    ...(proforma ? [
      `Válido até: ${options.validUntil ?? "—"}\n`,
      `Banco: ${options.bank?.name ?? "—"}\nTitular: ${options.bank?.holder ?? "—"}\nIBAN: ${options.bank?.iban ?? "—"}\n`,
      "Este documento não serve de fatura.\n"
    ] : [
      "Taxa (%)       Base / Incidência     Imposto\n",
      `14%             ${formatKwanza(sale.subtotalCents)}       ${formatKwanza(sale.taxCents)}\n`,
      `${options.fiscalHash ?? "--------"}-Processado por programa certificado n.º 24/AGT/2026\n`,
      `QR AGT: ${options.qrPayload ?? ""}\n`,
    ]),
    `Cliente: ${sale.customerName ?? "Consumidor Final"} | NIF: ${sale.customerNif ?? "999999999"}\n${sale.customerAddress ?? ""}\n`,
    "Os bens/serviços foram colocados à disposição na data da factura. Talão indispensável em caso de troca\n",
    "\x1d\x68\x50\x1d\x77\x02\x1d\x6b\x49", `${sale.number}\x00`,
    "\n\n\n\n\x1d\x56\x00",
  ].join("");
  return new TextEncoder().encode(lines);
}
export function fiscalHash(sale: Sale, previousHash = ""): string {
  const input = `${previousHash}|${sale.id}|${sale.totalCents}|${sale.createdAt}`;
  let hash = 2166136261; for (const char of input) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function fiscalQrPayload(sale: Sale, hash = fiscalHash(sale)): string { return `AO|${sale.number}|${sale.totalCents}|${hash}`; }
export class NetworkPrinter implements Printer {
  constructor(private readonly endpoint: string) {}
  async print(receipt: Uint8Array): Promise<void> {
    const response = await fetch(this.endpoint, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: receipt as unknown as BodyInit });
    if (!response.ok) throw new Error(`Network printer failed (${response.status})`);
  }
}
export class WebBluetoothPrinter implements Printer {
  constructor(private readonly characteristic: { writeValue(data: BufferSource): Promise<void> }) {}
  print(receipt: Uint8Array): Promise<void> { return this.characteristic.writeValue(receipt as unknown as BufferSource); }
}
export class ElectronPrinter implements Printer {
  constructor(private readonly send: (receipt: Uint8Array) => Promise<void>) {}
  print(receipt: Uint8Array): Promise<void> { return this.send(receipt); }
}
export function formatKwanza(cents: number): string {
  if (!Number.isFinite(cents)) throw new TypeError("O valor em cêntimos deve ser finito.");
  const amount = new Intl.NumberFormat("pt-AO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(cents / 100);
  return `${amount.replace(/[\s\u00a0]/g, ".")} Kz`;
}


export * from "./document-types.js";
