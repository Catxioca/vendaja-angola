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

export type MutationState =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "REJECTED"
  | "RETRYABLE"
  | "CONFLICT";

export type SyncEntity =
  | "SALE"
  | "PRODUCT"
  | "PAYMENT"
  | "REFUND"
  | "STOCK"
  | "DOCUMENT";

export interface Product {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
  taxRate: number;
  active: boolean;
  exemptionCode?: string | null;
  costCents?: number;
  barcode?: string | null;
  qrCode?: string | null;
  imageUrl?: string | null;
  brand?: string | null;
  model?: string | null;
  categoryId?: string | null;
}

export interface SaleLine {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  taxRate: number;
}

export interface Sale {
  id: string;
  number: string;
  lines: SaleLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: typeof CURRENCY;
  createdAt: string;
  discountCents?: number;
  paymentMethod?: PaymentMethod;
  cashCents?: number;
  cardCents?: number;
  transferCents?: number;
  tenderedCents?: number;
  changeCents?: number;
  cashSessionId?: string | null;
  customerId?: string | null;
  dueDate?: string | null;
  customerName?: string;
  customerNif?: string;
  customerAddress?: string;
  fiscalType?: FiscalDocumentType;
  operatorName?: string;
  operatorNif?: string;
  operatorPhone?: string;
  terminalId?: string;
}

export interface SyncMutation {
  id: string;
  operation: SyncOperation;
  entity: SyncEntity | (string & {});
  payload: unknown;
  occurredAt: string;
  companyId?: string;
  branchId?: string;
  userId?: string;
  terminalId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  state?: MutationState;
  attempts?: number;
  lastAttemptAt?: string;
  errorSanitized?: string | null;
}

export interface SyncRequest {
  deviceId: string;
  mutations: SyncMutation[];
  lastCursor?: string;
}

export interface SyncResponse {
  accepted: string[];
  rejected: { id: string; reason: string }[];
  cursor: string;
}

export interface Customer {
  id: string;
  name: string;
  taxNumber?: string;
  phone?: string;
  createdAt: string;
}

export interface CashEntry {
  id: string;
  type: "OPEN" | "CLOSE" | "IN" | "OUT";
  amountCents: number;
  note?: string;
  createdAt: string;
}

export interface OutboxFilter {
  companyId?: string;
  branchId?: string;
  userId?: string;
  terminalId?: string;
  state?: MutationState | MutationState[];
}

export interface OutboxDiagnosticItem {
  id: string;
  correlationId: string;
  entity: string;
  operation: string;
  companyId: string;
  branchId: string;
  userId: string;
  terminalId: string;
  state: MutationState;
  attempts: number;
  lastAttemptAt?: string;
  errorSanitized?: string | null;
  occurredAt: string;
}

export interface OutboxDiagnosticsReport {
  total: number;
  counts: {
    pending: number;
    processing: number;
    retryable: number;
    rejected: number;
    conflict: number;
    sent: number;
  };
  items: OutboxDiagnosticItem[];
}

export interface LocalPosStorage {
  getSales(): Promise<Sale[]>;
  saveSale(sale: Sale): Promise<void>;
  saveSaleAndEnqueue(sale: Sale, mutation: SyncMutation): Promise<void>;
  getCustomers(): Promise<Customer[]>;
  saveCustomer(customer: Customer): Promise<void>;
  getCashEntries(): Promise<CashEntry[]>;
  saveCashEntry(entry: CashEntry): Promise<void>;
  getOutbox(filter?: OutboxFilter): Promise<SyncMutation[]>;
  enqueue(mutation: SyncMutation): Promise<void>;
  acknowledge(ids: string[]): Promise<void>;
  updateMutationState(id: string, state: MutationState, errorSanitized?: string | null): Promise<void>;
  getOutboxDiagnostics(filter?: OutboxFilter): Promise<OutboxDiagnosticsReport>;
  retryMutation(id: string, operatorContext: { userId: string; role: string }): Promise<{ success: boolean; mutation?: SyncMutation; error?: string }>;
  clear?(): Promise<void>;
}

export function sanitizeSyncError(error: unknown): string {
  if (!error) return "unknown_error";
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:password|secret|token|key|privateKey)[:=]\s*["']?[^"',\s]+["']?/gi, "$1=[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[REDACTED]")
    .replace(/\bat\s+.+\(.*:\d+:\d+\)/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 300) || "sync_error";
}

export function computeIdempotencyKey(params: {
  entity: string;
  operation?: string;
  companyId: string;
  branchId: string;
  terminalId: string;
  referenceId?: string;
  documentNumber?: string;
  amountCents?: number;
  occurredAt?: string;
}): string {
  const comp = (params.companyId || "default-company").trim();
  const branch = (params.branchId || "default-branch").trim();
  const term = (params.terminalId || "default-terminal").trim();
  const ent = (params.entity || "MUTATION").toUpperCase().trim();
  const op = (params.operation || "CREATE").toUpperCase().trim();
  const ref = (params.documentNumber || params.referenceId || "").trim();
  const amt = params.amountCents !== undefined ? `:${params.amountCents}` : "";
  const time = params.occurredAt ? `:${params.occurredAt.slice(0, 19)}` : "";
  return `${comp}:${branch}:${term}:${ent}:${op}:${ref}${amt}${time}`;
}

export function computeSaleIdempotencyKey(
  sale: Partial<Sale> & { id: string },
  context: { companyId: string; branchId: string; terminalId: string }
): string {
  return computeIdempotencyKey({
    entity: "SALE",
    operation: "CREATE",
    companyId: context.companyId,
    branchId: context.branchId,
    terminalId: context.terminalId,
    referenceId: sale.id,
    documentNumber: sale.number,
    amountCents: sale.totalCents,
    occurredAt: sale.createdAt,
  });
}

export function computePaymentIdempotencyKey(
  payment: { paymentId: string; amountCents: number; paymentMethod?: string; saleId?: string; createdAt?: string },
  context: { companyId: string; branchId: string; terminalId: string }
): string {
  return computeIdempotencyKey({
    entity: "PAYMENT",
    operation: "CREATE",
    companyId: context.companyId,
    branchId: context.branchId,
    terminalId: context.terminalId,
    referenceId: payment.paymentId,
    amountCents: payment.amountCents,
    occurredAt: payment.createdAt,
  });
}

export function computeRefundIdempotencyKey(
  refund: { refundId: string; saleId: string; amountCents: number; reason?: string; createdAt?: string },
  context: { companyId: string; branchId: string; terminalId: string }
): string {
  return computeIdempotencyKey({
    entity: "REFUND",
    operation: "CREATE",
    companyId: context.companyId,
    branchId: context.branchId,
    terminalId: context.terminalId,
    referenceId: `${refund.saleId}:${refund.refundId}`,
    amountCents: refund.amountCents,
    occurredAt: refund.createdAt,
  });
}

export function computeStockMovementIdempotencyKey(
  movement: { productId: string; quantity: number; type: string; reference?: string; createdAt?: string },
  context: { companyId: string; branchId: string; terminalId: string }
): string {
  return computeIdempotencyKey({
    entity: "STOCK",
    operation: "CREATE",
    companyId: context.companyId,
    branchId: context.branchId,
    terminalId: context.terminalId,
    referenceId: `${movement.productId}:${movement.type}:${movement.reference ?? ""}`,
    amountCents: movement.quantity,
    occurredAt: movement.createdAt,
  });
}

export function computeFiscalDocumentIdempotencyKey(
  doc: { documentType: string; documentNumber: string; series?: string; totalCents?: number; issuedAt?: string },
  context: { companyId: string; branchId: string; terminalId: string }
): string {
  return computeIdempotencyKey({
    entity: "DOCUMENT",
    operation: "CREATE",
    companyId: context.companyId,
    branchId: context.branchId,
    terminalId: context.terminalId,
    referenceId: `${doc.series ?? "A"}-${doc.documentType}-${doc.documentNumber}`,
    amountCents: doc.totalCents,
    occurredAt: doc.issuedAt,
  });
}

function matchesOutboxFilter(mutation: SyncMutation, filter?: OutboxFilter): boolean {
  if (!filter) return true;
  if (filter.companyId !== undefined && mutation.companyId && mutation.companyId !== filter.companyId) return false;
  if (filter.branchId !== undefined && mutation.branchId && mutation.branchId !== filter.branchId) return false;
  if (filter.userId !== undefined && mutation.userId && mutation.userId !== filter.userId) return false;
  if (filter.terminalId !== undefined && mutation.terminalId && mutation.terminalId !== filter.terminalId) return false;
  if (filter.state !== undefined) {
    const states = Array.isArray(filter.state) ? filter.state : [filter.state];
    const currentState = mutation.state ?? "PENDING";
    if (!states.includes(currentState)) return false;
  }
  return true;
}

function normalizeMutation(mutation: SyncMutation): SyncMutation {
  return {
    ...mutation,
    state: mutation.state ?? "PENDING",
    attempts: mutation.attempts ?? 0,
    correlationId:
      mutation.correlationId ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `corr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    errorSanitized: mutation.errorSanitized ?? null,
  };
}

function buildDiagnosticsReport(mutations: SyncMutation[], filter?: OutboxFilter): OutboxDiagnosticsReport {
  const filtered = mutations.filter((m) => matchesOutboxFilter(m, filter));
  const counts = {
    pending: 0,
    processing: 0,
    retryable: 0,
    rejected: 0,
    conflict: 0,
    sent: 0,
  };
  for (const m of filtered) {
    const s = m.state ?? "PENDING";
    if (s === "PENDING") counts.pending++;
    else if (s === "PROCESSING") counts.processing++;
    else if (s === "RETRYABLE") counts.retryable++;
    else if (s === "REJECTED") counts.rejected++;
    else if (s === "CONFLICT") counts.conflict++;
    else if (s === "SENT") counts.sent++;
  }
  const items: OutboxDiagnosticItem[] = filtered.map((m) => ({
    id: m.id,
    correlationId: m.correlationId ?? m.id,
    entity: m.entity,
    operation: m.operation,
    companyId: m.companyId ?? "default",
    branchId: m.branchId ?? "default",
    userId: m.userId ?? "system",
    terminalId: m.terminalId ?? "pos-1",
    state: m.state ?? "PENDING",
    attempts: m.attempts ?? 0,
    lastAttemptAt: m.lastAttemptAt,
    errorSanitized: m.errorSanitized ?? null,
    occurredAt: m.occurredAt,
  }));
  return {
    total: filtered.length,
    counts,
    items,
  };
}

const AUTHORIZED_RETRY_ROLES = new Set(["ADMIN", "SUPERVISOR", "OPERATOR", "MANAGER", "GERENTE"]);
function canRetryMutation(role: string): boolean {
  return AUTHORIZED_RETRY_ROLES.has((role || "").toUpperCase().trim());
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
    const normalized = normalizeMutation(mutation);
    if (!indexed) {
      const sales = memory<Sale>(`${name}:sales`).filter((item) => item.id !== sale.id);
      const outbox = memory<SyncMutation>(`${name}:outbox`).filter((item) => item.id !== normalized.id);
      sales.push(clone(sale));
      outbox.push(clone(normalized));
      memoryStore.set(`${name}:sales`, sales);
      memoryStore.set(`${name}:outbox`, outbox);
      return;
    }
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      try {
        const transaction = db.transaction(["sales", "outbox"], "readwrite");
        transaction.objectStore("sales").put(sale);
        transaction.objectStore("outbox").put(normalized);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("Transação de armazenamento abortada"));
      } catch (err) {
        reject(err);
      }
    });
  }

  async function getOutbox(filter?: OutboxFilter): Promise<SyncMutation[]> {
    const raw = await all<SyncMutation>("outbox");
    return raw.map(normalizeMutation).filter((m) => matchesOutboxFilter(m, filter));
  }

  async function updateMutationState(id: string, state: MutationState, errorSanitized?: string | null): Promise<void> {
    const raw = await all<SyncMutation>("outbox");
    const item = raw.find((m) => m.id === id);
    if (!item) return;
    const updated: SyncMutation = {
      ...item,
      state,
      attempts: (item.attempts ?? 0) + 1,
      lastAttemptAt: new Date().toISOString(),
      errorSanitized: errorSanitized !== undefined ? (errorSanitized ? sanitizeSyncError(errorSanitized) : null) : item.errorSanitized ?? null,
    };
    await put("outbox", updated);
  }

  async function getOutboxDiagnostics(filter?: OutboxFilter): Promise<OutboxDiagnosticsReport> {
    const raw = await all<SyncMutation>("outbox");
    return buildDiagnosticsReport(raw.map(normalizeMutation), filter);
  }

  async function retryMutation(
    id: string,
    operatorContext: { userId: string; role: string }
  ): Promise<{ success: boolean; mutation?: SyncMutation; error?: string }> {
    if (!canRetryMutation(operatorContext.role)) {
      return { success: false, error: "unauthorized_operator" };
    }
    const raw = await all<SyncMutation>("outbox");
    const item = raw.find((m) => m.id === id);
    if (!item) {
      return { success: false, error: "mutation_not_found" };
    }
    const updated: SyncMutation = {
      ...item,
      state: "PENDING",
      errorSanitized: null,
    };
    await put("outbox", updated);
    return { success: true, mutation: updated };
  }

  return {
    getSales: () => all<Sale>("sales"),
    saveSale: (sale) => put("sales", sale),
    saveSaleAndEnqueue,
    getCustomers: () => all<Customer>("customers"),
    saveCustomer: (customer) => put("customers", customer),
    getCashEntries: () => all<CashEntry>("cash"),
    saveCashEntry: (entry) => put("cash", entry),
    getOutbox,
    enqueue: (mutation) => put("outbox", normalizeMutation(mutation)),
    updateMutationState,
    getOutboxDiagnostics,
    retryMutation,
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
    const normalized = normalizeMutation(mutation);
    await (await this.getConnection()).execute({ database: this.name, transaction: true, statements: `BEGIN; INSERT OR REPLACE INTO sales (id, data) VALUES ('${sqlQuote(sale.id)}', '${sqlQuote(JSON.stringify(sale))}'); INSERT OR REPLACE INTO outbox (id, data) VALUES ('${sqlQuote(normalized.id)}', '${sqlQuote(JSON.stringify(normalized))}'); COMMIT;` });
  }
  getCustomers(): Promise<Customer[]> { return this.all<Customer>("customers"); }
  saveCustomer(customer: Customer): Promise<void> { return this.put("customers", customer); }
  getCashEntries(): Promise<CashEntry[]> { return this.all<CashEntry>("cash"); }
  saveCashEntry(entry: CashEntry): Promise<void> { return this.put("cash", entry); }
  async getOutbox(filter?: OutboxFilter): Promise<SyncMutation[]> {
    const raw = await this.all<SyncMutation>("outbox");
    return raw.map(normalizeMutation).filter((m) => matchesOutboxFilter(m, filter));
  }
  enqueue(mutation: SyncMutation): Promise<void> {
    return this.put("outbox", normalizeMutation(mutation));
  }
  async updateMutationState(id: string, state: MutationState, errorSanitized?: string | null): Promise<void> {
    const raw = await this.all<SyncMutation>("outbox");
    const item = raw.find((m) => m.id === id);
    if (!item) return;
    const updated: SyncMutation = {
      ...item,
      state,
      attempts: (item.attempts ?? 0) + 1,
      lastAttemptAt: new Date().toISOString(),
      errorSanitized: errorSanitized !== undefined ? (errorSanitized ? sanitizeSyncError(errorSanitized) : null) : item.errorSanitized ?? null,
    };
    await this.put("outbox", updated);
  }
  async getOutboxDiagnostics(filter?: OutboxFilter): Promise<OutboxDiagnosticsReport> {
    const raw = await this.all<SyncMutation>("outbox");
    return buildDiagnosticsReport(raw.map(normalizeMutation), filter);
  }
  async retryMutation(
    id: string,
    operatorContext: { userId: string; role: string }
  ): Promise<{ success: boolean; mutation?: SyncMutation; error?: string }> {
    if (!canRetryMutation(operatorContext.role)) {
      return { success: false, error: "unauthorized_operator" };
    }
    const raw = await this.all<SyncMutation>("outbox");
    const item = raw.find((m) => m.id === id);
    if (!item) {
      return { success: false, error: "mutation_not_found" };
    }
    const updated: SyncMutation = {
      ...item,
      state: "PENDING",
      errorSanitized: null,
    };
    await this.put("outbox", updated);
    return { success: true, mutation: updated };
  }
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
  companyId?: string;
  branchId?: string;
  userId?: string;
  terminalId?: string;
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
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    this.timer = setInterval(() => {
      if (this.online) void this.flush().catch((error: unknown) => this.notifyError(error));
    }, this.options.intervalMs ?? 30000);
    void this.flush().catch((error: unknown) => this.notifyError(error));
  }

  stop(): void {
    if (!this.started) return;
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    this.timer = undefined;
    this.started = false;
  }

  private setOnline(online: boolean): void {
    this.online = online;
    this.options.onState?.(online);
    if (online) void this.flush().catch((error: unknown) => this.notifyError(error));
  }

  private notifyError(error: unknown): void {
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  private async flushOnce(): Promise<SyncResponse | undefined> {
    if (!this.online || (typeof navigator !== "undefined" && navigator.onLine === false)) return undefined;

    // Filter mutations by company and branch context if provided, only selecting PENDING and RETRYABLE
    const mutations = await this.storage.getOutbox({
      companyId: this.options.companyId,
      branchId: this.options.branchId,
      userId: this.options.userId,
      terminalId: this.options.terminalId,
      state: ["PENDING", "RETRYABLE"],
    });
    if (!mutations.length) return undefined;

    // Strict multi-tenant isolation guard:
    // If an item has a different companyId/branchId than configured options, do not leak or flush it.
    const tenantMutations = mutations.filter((m) => {
      if (this.options.companyId && m.companyId && m.companyId !== this.options.companyId) return false;
      if (this.options.branchId && m.branchId && m.branchId !== this.options.branchId) return false;
      return true;
    });
    if (!tenantMutations.length) return undefined;

    // Mark items as PROCESSING
    for (const m of tenantMutations) {
      await this.storage.updateMutationState(m.id, "PROCESSING");
    }

    let response: Response;
    try {
      response = await fetch(`${this.options.apiUrl.replace(/\/$/, "")}/api/v1/sync`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.token}`,
          "x-device-id": this.options.deviceId,
          ...(this.options.companyId ? { "x-company-id": this.options.companyId } : {}),
          ...(this.options.branchId ? { "x-branch-id": this.options.branchId } : {}),
        },
        body: JSON.stringify({ deviceId: this.options.deviceId, mutations: tenantMutations }),
      });
    } catch (networkError) {
      const sanitized = sanitizeSyncError(networkError);
      for (const m of tenantMutations) {
        await this.storage.updateMutationState(m.id, "RETRYABLE", sanitized);
      }
      this.notifyError(networkError);
      return undefined;
    }

    if (!response.ok) {
      const errText = `Sync failed (${response.status})`;
      for (const m of tenantMutations) {
        await this.storage.updateMutationState(m.id, "RETRYABLE", errText);
      }
      throw new Error(errText);
    }

    const result = (await response.json()) as SyncResponse;
    const sentIds = new Set(tenantMutations.map((mutation) => mutation.id));

    // Acknowledge only accepted mutations
    const acceptedSent = result.accepted.filter((id) => sentIds.has(id));
    if (acceptedSent.length > 0) {
      await this.storage.acknowledge(acceptedSent);
    }

    // Process rejected mutations without deleting them!
    if (result.rejected && result.rejected.length > 0) {
      for (const rej of result.rejected) {
        if (!sentIds.has(rej.id)) continue;
        const reasonLower = (rej.reason || "").toLowerCase();
        let targetState: MutationState = "REJECTED";
        if (
          reasonLower.includes("conflict") ||
          reasonLower.includes("mismatch") ||
          reasonLower.includes("duplicate")
        ) {
          targetState = "CONFLICT";
        } else if (
          reasonLower.includes("rate_limit") ||
          reasonLower.includes("timeout") ||
          reasonLower.includes("busy") ||
          reasonLower.includes("temporary")
        ) {
          targetState = "RETRYABLE";
        }
        await this.storage.updateMutationState(
          rej.id,
          targetState,
          sanitizeSyncError(rej.reason)
        );
      }
    }

    this.options.onResult?.(result);
    return result;
  }
}

export interface StorageProtectionCapabilities {
  platform: "electron" | "android" | "browser" | "node";
  isHardwareBacked: boolean;
  isEncrypted: boolean;
  encryptionAlgorithm: "DPAPI" | "AES-256-GCM-KEYSTORE" | "WEB-CRYPTO" | "NONE";
  adapter: string;
  warning?: string;
}

export interface SecureCredentialVault {
  getCapabilities(): Promise<StorageProtectionCapabilities>;
  protectCredential(plaintext: string): Promise<string>;
  unprotectCredential(cipher: string): Promise<string>;
}

export function createSecureCredentialVault(options?: {
  platform?: "electron" | "android" | "browser" | "node";
  electronBridge?: {
    getSecureCapabilities?: () => Promise<StorageProtectionCapabilities>;
    protectSecret?: (text: string) => Promise<string>;
    unprotectSecret?: (cipher: string) => Promise<string>;
  };
  androidBridge?: {
    isAvailable?: () => Promise<boolean>;
    encrypt?: (text: string) => Promise<string>;
    decrypt?: (cipher: string) => Promise<string>;
  };
}): SecureCredentialVault {
  const detectPlatform = (): "electron" | "android" | "browser" | "node" => {
    if (options?.platform) return options.platform;
    const globalObj = globalThis as {
      pos?: { protectSecret?: unknown; getSecureCapabilities?: unknown };
      Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
      process?: { versions?: { electron?: string; node?: string } };
    };
    if (globalObj.pos?.protectSecret || globalObj.process?.versions?.electron) return "electron";
    const cap = globalObj.Capacitor;
    if (cap?.isNativePlatform?.() && cap?.getPlatform?.() === "android") return "android";
    if (typeof window !== "undefined") return "browser";
    return "node";
  };

  const currentPlatform = detectPlatform();

  if (currentPlatform === "electron") {
    const bridge = options?.electronBridge ?? (globalThis as { pos?: any }).pos;
    return {
      async getCapabilities(): Promise<StorageProtectionCapabilities> {
        if (bridge?.getSecureCapabilities) {
          return bridge.getSecureCapabilities();
        }
        return {
          platform: "electron",
          isHardwareBacked: true,
          isEncrypted: true,
          encryptionAlgorithm: "DPAPI",
          adapter: "ELECTRON_SAFESTORAGE_DPAPI",
        };
      },
      async protectCredential(plaintext: string): Promise<string> {
        if (bridge?.protectSecret) {
          return bridge.protectSecret(plaintext);
        }
        throw new Error("Electron DPAPI bridge unavailable");
      },
      async unprotectCredential(cipher: string): Promise<string> {
        if (bridge?.unprotectSecret) {
          return bridge.unprotectSecret(cipher);
        }
        throw new Error("Electron DPAPI bridge unavailable");
      },
    };
  }

  if (currentPlatform === "android") {
    const bridge = options?.androidBridge;
    return {
      async getCapabilities(): Promise<StorageProtectionCapabilities> {
        const available = bridge?.isAvailable ? await bridge.isAvailable() : false;
        if (available) {
          return {
            platform: "android",
            isHardwareBacked: true,
            isEncrypted: true,
            encryptionAlgorithm: "AES-256-GCM-KEYSTORE",
            adapter: "ANDROID_KEYSTORE_HARDWARE",
          };
        }
        return {
          platform: "android",
          isHardwareBacked: false,
          isEncrypted: false,
          encryptionAlgorithm: "NONE",
          adapter: "ANDROID_PLAINTEXT_FALLBACK",
          warning: "Native Keystore adapter not registered. Hardware encryption is not guaranteed.",
        };
      },
      async protectCredential(plaintext: string): Promise<string> {
        if (bridge?.encrypt) return bridge.encrypt(plaintext);
        throw new Error("Android Keystore bridge not configured. Refusing to persist unencrypted credentials.");
      },
      async unprotectCredential(cipher: string): Promise<string> {
        if (bridge?.decrypt) return bridge.decrypt(cipher);
        throw new Error("Android Keystore bridge not configured.");
      },
    };
  }

  if (currentPlatform === "browser") {
    return {
      async getCapabilities(): Promise<StorageProtectionCapabilities> {
        return {
          platform: "browser",
          isHardwareBacked: false,
          isEncrypted: false,
          encryptionAlgorithm: "NONE",
          adapter: "BROWSER_UNPROTECTED_LOCAL_STORAGE",
          warning: "Hardware-backed DPAPI/Keystore encryption not available in browser sandbox. Tokens must use short expiry and session memory.",
        };
      },
      async protectCredential(_plaintext: string): Promise<string> {
        throw new Error("Hardware-backed encryption unavailable in standard browser sandbox.");
      },
      async unprotectCredential(_cipher: string): Promise<string> {
        throw new Error("Hardware-backed encryption unavailable in standard browser sandbox.");
      },
    };
  }

  return {
    async getCapabilities(): Promise<StorageProtectionCapabilities> {
      return {
        platform: "node",
        isHardwareBacked: false,
        isEncrypted: false,
        encryptionAlgorithm: "NONE",
        adapter: "NODE_IN_MEMORY_UNPROTECTED",
        warning: "Node environment without DPAPI/Keystore hardware backing.",
      };
    },
    async protectCredential(_plaintext: string): Promise<string> {
      throw new Error("Hardware-backed encryption unavailable in pure Node environment.");
    },
    async unprotectCredential(_cipher: string): Promise<string> {
      throw new Error("Hardware-backed encryption unavailable in pure Node environment.");
    },
  };
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
