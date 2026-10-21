import crypto from "node:crypto";

export interface VendaJaClientConfig {
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  oauth?: {
    clientId: string;
    clientSecret: string;
    scope?: string;
  };
  companyId?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface CustomerInput {
  name: string;
  nif?: string;
  email?: string;
  phone?: string;
  address?: string;
  creditLimitKz?: number;
}

export interface ProductInput {
  name: string;
  sku: string;
  priceKz: number;
  costKz?: number;
  stock?: number;
  taxRate?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  q?: string;
}

export class VendaJaApiError extends Error {
  public status: number;
  public code?: string;
  public details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "VendaJaApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class VendaJaClient {
  private config: VendaJaClientConfig;
  private cachedOAuthToken?: { token: string; expiresAt: number };

  constructor(config: VendaJaClientConfig) {
    this.config = {
      timeoutMs: 15000,
      maxRetries: 3,
      ...config,
      baseUrl: config.baseUrl.replace(/\/$/, ""),
    };
  }

  /**
   * Helper para verificação de assinaturas de Webhook recebidas do VendaJá Angola
   */
  public static verifyWebhookSignature(payload: string | object, signature: string, secret: string): boolean {
    try {
      const rawString = typeof payload === "string" ? payload : JSON.stringify(payload);
      const expected = crypto.createHmac("sha256", secret).update(rawString).digest("hex");
      const sigBuf = Buffer.from(signature, "utf-8");
      const expBuf = Buffer.from(expected, "utf-8");
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.config.companyId) {
      headers["x-company-id"] = this.config.companyId;
    }

    if (this.config.apiKey) {
      headers["x-api-key"] = this.config.apiKey;
      return headers;
    }

    if (this.config.bearerToken) {
      headers["Authorization"] = `Bearer ${this.config.bearerToken}`;
      return headers;
    }

    if (this.config.oauth) {
      const now = Date.now();
      if (this.cachedOAuthToken && this.cachedOAuthToken.expiresAt > now + 60000) {
        headers["Authorization"] = `Bearer ${this.cachedOAuthToken.token}`;
        return headers;
      }

      // Obter novo token M2M via OAuth2 Client Credentials
      const tokenRes = await fetch(`${this.config.baseUrl}/integrations/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.config.oauth.clientId,
          client_secret: this.config.oauth.clientSecret,
          scope: this.config.oauth.scope || "api:all",
        }),
      });

      if (!tokenRes.ok) {
        throw new VendaJaApiError("Falha na autenticação OAuth2 Client Credentials", tokenRes.status);
      }

      const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
      this.cachedOAuthToken = {
        token: tokenData.access_token,
        expiresAt: now + (tokenData.expires_in || 3600) * 1000,
      };

      headers["Authorization"] = `Bearer ${tokenData.access_token}`;
      return headers;
    }

    return headers;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const authHeaders = await this.getAuthHeaders();
    const url = `${this.config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    let lastError: Error | null = null;
    const maxRetries = this.config.maxRetries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(url, {
          ...options,
          headers: {
            ...authHeaders,
            ...options.headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 429 || response.status === 503) {
          if (attempt < maxRetries) {
            const backoffMs = Math.pow(2, attempt) * 500;
            await new Promise((res) => setTimeout(res, backoffMs));
            continue;
          }
        }

        if (!response.ok) {
          let errorData: any = {};
          try {
            errorData = await response.json();
          } catch {
            errorData = { message: response.statusText };
          }
          throw new VendaJaApiError(
            errorData.message || errorData.error || `HTTP ${response.status}`,
            response.status,
            errorData.error,
            errorData
          );
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return (await response.json()) as T;
        }
        return (await response.text()) as unknown as T;
      } catch (err: any) {
        lastError = err;
        if (err.name === "AbortError") {
          throw new VendaJaApiError("Tempo limite de requisição excedido (Timeout)", 408);
        }
        if (err instanceof VendaJaApiError && err.status < 500 && err.status !== 429) {
          throw err;
        }
        if (attempt === maxRetries) {
          throw lastError;
        }
        await new Promise((res) => setTimeout(res, 500));
      }
    }

    throw lastError || new Error("Falha desconhecida na requisição");
  }

  // ==========================================
  // CLIENTES
  // ==========================================
  public customers = {
    list: async (params?: PaginationParams) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.q) q.set("q", params.q);
      return this.request<{ data: any[]; meta: any }>(`/customers?${q.toString()}`);
    },
    get: async (id: string) => this.request<{ data: any }>(`/customers/${id}`),
    create: async (data: CustomerInput) =>
      this.request<{ data: any }>("/customers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: async (id: string, data: Partial<CustomerInput>) =>
      this.request<{ data: any }>(`/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: async (id: string) =>
      this.request<{ message: string }>(`/customers/${id}`, {
        method: "DELETE",
      }),
  };

  // ==========================================
  // PRODUTOS
  // ==========================================
  public products = {
    list: async (params?: PaginationParams) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      return this.request<{ data: any[]; meta: any }>(`/products?${q.toString()}`);
    },
    create: async (data: ProductInput) =>
      this.request<{ data: any }>("/products", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: async (id: string, data: Partial<ProductInput>) =>
      this.request<{ data: any }>(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: async (id: string) =>
      this.request<{ message: string }>(`/products/${id}`, {
        method: "DELETE",
      }),
  };

  // ==========================================
  // VENDAS & FATURAS
  // ==========================================
  public sales = {
    list: async (params?: PaginationParams) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      return this.request<{ data: any[]; meta: any }>(`/sales?${q.toString()}`);
    },
    getInvoice: async (id: string) => this.request<{ data: any }>(`/invoices/${id}`),
  };

  // ==========================================
  // POWER BI & DATASETS ANALÍTICOS
  // ==========================================
  public bi = {
    sales: async (since?: string | Date) => {
      const q = since ? `?since=${since instanceof Date ? since.toISOString() : since}` : "";
      return this.request<{ dataset: string; count: number; records: any[] }>(`/integrations/bi/sales${q}`);
    },
    purchases: async (since?: string | Date) => {
      const q = since ? `?since=${since instanceof Date ? since.toISOString() : since}` : "";
      return this.request<{ dataset: string; count: number; records: any[] }>(`/integrations/bi/purchases${q}`);
    },
    inventory: async () => this.request<{ dataset: string; count: number; records: any[] }>("/integrations/bi/inventory"),
    cashflow: async () => this.request<{ dataset: string; count: number; records: any[] }>("/integrations/bi/cashflow"),
    payroll: async () => this.request<{ dataset: string; count: number; records: any[] }>("/integrations/bi/payroll"),
  };

  // ==========================================
  // IMPORTAÇÃO / EXPORTAÇÃO UNIVERSAL
  // ==========================================
  public dataExchange = {
    exportData: async (entity: string, format: "excel" | "csv" | "json" | "xml") =>
      this.request<any>("/integrations/exchange/export", {
        method: "POST",
        body: JSON.stringify({ entity, format }),
      }),
    importData: async (entity: string, format: "excel" | "csv" | "json" | "xml", rawContent: string) =>
      this.request<{ processed: number; successCount: number; errorCount: number; errors: any[] }>(
        "/integrations/exchange/import",
        {
          method: "POST",
          body: JSON.stringify({ entity, format, rawContent }),
        }
      ),
  };
}
