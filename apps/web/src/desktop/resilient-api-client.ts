/**
 * Resilient API Client & Distributed Systems Diagnostics Engine
 * 
 * Implements:
 * 1. Friendly Diagnostic Error Translation (Zero generic "Failed to fetch")
 * 2. Circuit Breaker Pattern (CLOSED, OPEN, HALF_OPEN)
 * 3. Configurable Timeouts with AbortController
 * 4. Automatic Retries with Exponential Backoff
 * 5. Safe Fallbacks for Offline & Degraded Operations
 */

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number; // consecutive failures before opening circuit
  cooldownPeriodMs: number; // time to wait before trying half-open
  timeoutMs: number; // request timeout
}

export interface DetailedNetworkError {
  isNetworkError: boolean;
  isNetworkFailure?: boolean;
  isTimeout?: boolean;
  code: string;
  category?: string;
  statusCode?: number;
  userMessage: string;
  technicalDetails: string;
  status?: number;
  url: string;
  timestamp: string;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownPeriodMs: 12000,
  timeoutMs: 8000,
};

// Global circuit breaker registry by service / endpoint prefix
export class ServiceCircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  public readonly name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  public getState(): CircuitBreakerState {
    if (this.state === "OPEN") {
      const now = Date.now();
      if (now - this.lastFailureTime > this.config.cooldownPeriodMs) {
        this.state = "HALF_OPEN";
      }
    }
    return this.state;
  }

  public canExecute(): boolean {
    const s = this.getState();
    return s === "CLOSED" || s === "HALF_OPEN";
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
  }

  public recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = "OPEN";
    }
  }

  public reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }
}

const circuitBreakers = new Map<string, ServiceCircuitBreaker>();

export function getCircuitBreaker(serviceName: string): ServiceCircuitBreaker {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(serviceName, new ServiceCircuitBreaker(serviceName));
  }
  return circuitBreakers.get(serviceName)!;
}

export function resetAllCircuitBreakers(): void {
  for (const cb of circuitBreakers.values()) {
    cb.reset();
  }
}

/**
 * Classifies raw fetch/network errors into human-readable, actionable Portuguese enterprise messages.
 */
export function classifyNetworkError(
  err: unknown,
  url = "",
  timeoutMs = 8000
): DetailedNetworkError {
  const timestamp = new Date().toISOString();
  let origin = "";
  let pathname = "";
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    pathname = parsed.pathname;
  } catch {
    origin = url;
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const isAbort =
    (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError") ||
    rawMsg.toLowerCase().includes("abort") ||
    rawMsg.toLowerCase().includes("timeout");

  // 1. Timeout / Abort
  if (isAbort) {
    return {
      isNetworkError: true,
      isNetworkFailure: true,
      isTimeout: true,
      code: "TIMEOUT",
      category: "TIMEOUT",
      userMessage: `Tempo limite de comunicação excedido após ${Math.round(timeoutMs / 1000)} segundos. O servidor ${origin || "de destino"} demorou demasiado a responder.`,
      technicalDetails: `Request aborted after ${timeoutMs}ms timeout on ${pathname || url}`,
      url,
      timestamp,
    };
  }

  // 2. Browser offline check
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      isNetworkError: true,
      isNetworkFailure: true,
      code: "DEVICE_OFFLINE",
      category: "OFFLINE",
      userMessage: "Sem ligação de rede. O computador ou dispositivo encontra-se atualmente offline.",
      technicalDetails: "navigator.onLine is false",
      url,
      timestamp,
    };
  }

  // 3. HTTP status codes inside message
  if (rawMsg.includes("401") || rawMsg.includes("Unauthorized")) {
    return {
      isNetworkError: false,
      code: "UNAUTHORIZED",
      category: "UNAUTHORIZED",
      statusCode: 401,
      status: 401,
      userMessage: "Sessão expirada ou credenciais inválidas. Por favor inicie sessão novamente no ERP.",
      technicalDetails: rawMsg,
      url,
      timestamp,
    };
  }

  if (rawMsg.includes("403") || rawMsg.includes("Forbidden")) {
    return {
      isNetworkError: false,
      code: "FORBIDDEN",
      category: "FORBIDDEN",
      statusCode: 403,
      status: 403,
      userMessage: "Acesso negado. O seu perfil de utilizador não tem permissão para aceder a este recurso.",
      technicalDetails: rawMsg,
      url,
      timestamp,
    };
  }

  if (rawMsg.includes("502") || rawMsg.includes("503") || rawMsg.includes("504") || rawMsg.includes("Service Unavailable")) {
    return {
      isNetworkError: true,
      isNetworkFailure: true,
      code: "SERVICE_UNAVAILABLE",
      category: "SERVICE_UNAVAILABLE",
      statusCode: 503,
      status: 503,
      userMessage: "Serviço central temporariamente indisponível. O servidor está em manutenção ou sobrecarregado.",
      technicalDetails: rawMsg,
      url,
      timestamp,
    };
  }

  // 4. Generic "Failed to fetch" inspection
  if (
    rawMsg.includes("Failed to fetch") ||
    rawMsg.includes("NetworkError") ||
    rawMsg.includes("Load failed") ||
    rawMsg.includes("fetch failed") ||
    rawMsg.includes("ECONNREFUSED")
  ) {
    // Specific service categorization
    let serviceLabel = "Servidor de automação ou backend";
    if (pathname.includes("/automation")) {
      serviceLabel = "Serviço de Automação & Workflows";
    } else if (pathname.includes("/security")) {
      serviceLabel = "Serviço de Segurança e Governação";
    } else if (pathname.includes("/financial")) {
      serviceLabel = "Serviço Financeiro & Tesouraria";
    } else if (pathname.includes("/bi")) {
      serviceLabel = "Serviço de Business Intelligence";
    } else if (pathname.includes("/saas")) {
      serviceLabel = "Servidor Cloud SaaS";
    }

    return {
      isNetworkError: true,
      isNetworkFailure: true,
      code: "SERVICE_UNREACHABLE",
      category: "CONNECTION_REFUSED",
      userMessage: `${serviceLabel} inacessível ou indisponível em ${origin || "127.0.0.1:4000"}. Verifique se o serviço VendaJá Backend está em execução.`,
      technicalDetails: `Failed to connect to ${url}: ${rawMsg}. Ensure the backend service is running and CORS/port 4000 is open.`,
      url,
      timestamp,
    };
  }

  // 5. Fallback generic error
  return {
    isNetworkError: false,
    code: "UNKNOWN_ERROR",
    category: "UNKNOWN",
    userMessage: rawMsg || "Erro de comunicação desconhecido com o servidor.",
    technicalDetails: String(err),
    url,
    timestamp,
  };
}

export interface ResilientRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  serviceName?: string;
  fallbackData?: unknown;
  silentFallback?: boolean;
}

/**
 * Resilient HTTP request executor with Circuit Breaker, automatic retries, and offline fallback.
 */
export async function resilientRequest<T>(
  url: string,
  token: string,
  options: ResilientRequestOptions = {}
): Promise<{ data: T; fromFallback: boolean; circuitState?: string; error?: DetailedNetworkError }> {
  // Support offline PIN session immediately
  if (token === "offline-local-session" && options.fallbackData !== undefined) {
    return {
      data: options.fallbackData as T,
      fromFallback: true,
      circuitState: "OFFLINE_LOCAL",
    };
  }

  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRetries = options.retries ?? (options.method && options.method !== "GET" ? 0 : 2);
  const serviceName = options.serviceName ?? (url.includes("/api/v1/automation") ? "automation" : "backend");
  const cb = getCircuitBreaker(serviceName);

  // Check Circuit Breaker
  if (cb.getState() === "OPEN") {
    const error: DetailedNetworkError = {
      isNetworkError: true,
      isNetworkFailure: true,
      code: "CIRCUIT_BREAKER_OPEN",
      category: "CIRCUIT_BREAKER_OPEN",
      userMessage: `Circuit Breaker ativo para o serviço ${serviceName}: Servidor temporariamente indisponível após falhas consecutivas. Modo resiliente ativo.`,
      technicalDetails: `Circuit breaker state: OPEN for service: ${serviceName}`,
      url,
      timestamp: new Date().toISOString(),
    };

    if (options.fallbackData !== undefined) {
      return { data: options.fallbackData as T, fromFallback: true, circuitState: "OPEN", error };
    }
    throw new Error(error.userMessage);
  }

  const baseHeaders: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token && token !== "offline-local-session") {
    baseHeaders["authorization"] = `Bearer ${token}`;
  }

  const mergedHeaders = { ...baseHeaders, ...(options.headers as Record<string, string> | undefined) };

  let lastError: DetailedNetworkError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: mergedHeaders,
      });

      clearTimeout(timer);

      // Handle HTTP error responses cleanly
      if (!response.ok) {
        let errorBody = "";
        try {
          const bodyJson = await response.json();
          errorBody = bodyJson.message || bodyJson.error || JSON.stringify(bodyJson);
        } catch {
          errorBody = await response.text().catch(() => "");
        }

        const is401 = response.status === 401;
        const is403 = response.status === 403;
        const is404 = response.status === 404;

        const detailed: DetailedNetworkError = {
          isNetworkError: response.status >= 500,
          code: `HTTP_${response.status}`,
          status: response.status,
          userMessage: is401
            ? "Sessão expirada ou credenciais insuficientes. Inicie sessão novamente."
            : is403
            ? "Sem permissão de acesso para esta funcionalidade."
            : is404
            ? `Endpoint não encontrado no servidor (${response.status}): ${url}`
            : response.status >= 500
            ? `O servidor devolveu um erro interno (${response.status}): ${errorBody || "Falha interna no serviço."}`
            : errorBody || `Erro na resposta do servidor (${response.status}).`,
          technicalDetails: `HTTP ${response.status} ${response.statusText}: ${errorBody}`,
          url,
          timestamp: new Date().toISOString(),
        };

        if (response.status >= 500) {
          cb.recordFailure();
        } else {
          cb.recordSuccess();
        }

        if (options.fallbackData !== undefined && response.status >= 500) {
          return { data: options.fallbackData as T, fromFallback: true, error: detailed };
        }

        throw new Error(detailed.userMessage);
      }

      // Success
      cb.recordSuccess();
      const data = (await response.json()) as T;
      return { data, fromFallback: false };
    } catch (err: unknown) {
      clearTimeout(timer);
      lastError = classifyNetworkError(err, url, timeoutMs);
      cb.recordFailure();

      if (attempt < maxRetries) {
        const backoffMs = 250 * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  // All retries failed
  window.dispatchEvent(
    new CustomEvent("backend-status", {
      detail: { online: false, url, error: lastError?.userMessage },
    })
  );

  if (options.fallbackData !== undefined) {
    return {
      data: options.fallbackData as T,
      fromFallback: true,
      error: lastError,
    };
  }

  throw new Error(lastError?.userMessage || "Erro de ligação ao servidor.");
}

// =========================================================================
// SAFE FALLBACK MOCK DATA FOR ENTERPRISE AUTOMATION
// =========================================================================

export const AUTOMATION_FALLBACK_DASHBOARD = {
  operationalCockpit: {
    workflows: {
      totalDefinitions: 4,
      activeInstances: 0,
      pendingApprovalsForUser: 0,
      completedInstances: 0,
    },
    tasks: {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      blocked: 0,
    },
    notifications: {
      unread: 0,
      critical: 0,
      total: 0,
    },
    queue: {
      totalJobs: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
    },
    rules: {
      activeRules: 2,
      totalRules: 2,
    },
  },
  pendingApprovals: [],
  recentTasks: [],
};

export const AUTOMATION_FALLBACK_WORKFLOWS = [
  {
    id: "wf-purchase-approval",
    name: "Aprovação de Compras Escaladas",
    entity: "Purchase",
    active: true,
    stepsCount: 3,
    description: "Workflows multinível para requisições de compras acima do teto de operador.",
  },
  {
    id: "wf-credit-override",
    name: "Autorização de Crédito a Clientes",
    entity: "CreditSale",
    active: true,
    stepsCount: 2,
    description: "Aprovação administrativa para concessão de crédito em conta corrente.",
  },
  {
    id: "wf-stock-adjustment",
    name: "Quebras e Regularização de Inventário",
    entity: "StockAdjustment",
    active: true,
    stepsCount: 2,
    description: "Revisão e confirmação de desvios em auditorias físicas de armazém.",
  },
];

export const AUTOMATION_FALLBACK_RULES = [
  {
    id: "rule-fb-01",
    name: "Alerta Imediato para Stock em Rutura",
    triggerEvent: "STOCK_BELOW_MINIMUM",
    active: true,
    action: "DISPATCH_NOTIFICATION",
    description: "Gera aviso prioritário quando qualquer artigo atinge a margem de segurança.",
  },
  {
    id: "rule-fb-02",
    name: "Backup Automático Após Fecho de Turno",
    triggerEvent: "SHIFT_CLOSED",
    active: true,
    action: "TRIGGER_LOCAL_BACKUP",
    description: "Executa snapshot encriptado do ficheiro de dados do POS.",
  },
  {
    id: "rule-fb-03",
    name: "Notificação de Documento Faturado > 500.000 Kz",
    triggerEvent: "INVOICE_ISSUED",
    active: true,
    action: "SEND_ADMIN_ALERT",
    description: "Informa os gestores sobre vendas corporativas de elevado valor.",
  },
];
