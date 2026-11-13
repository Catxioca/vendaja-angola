/**
 * Gestão de sessão no browser para o site institucional e acesso ao ERP Web.
 *
 * Aviso de segurança:
 * - `localStorage` NÃO é armazenamento seguro ou confidencial; qualquer dado guardado
 *   no browser fica acessível a scripts da mesma origem.
 * - O refresh token é preferencialmente emitido e enviado pelo backend em cookie
 *   `HttpOnly` (`SameSite=Lax`, `Secure` em HTTPS/produção) com `credentials: "include"`.
 * - Nunca guardar palavra-passe, PIN ou registos empresariais completos no browser.
 * - Nunca registar tokens em `console.*` nem em mensagens de erro.
 */

export const SESSION_STORAGE_KEYS = [
  "accessToken",
  "refreshToken",
  "posUser",
  "companyId",
  "branchId",
  "vendaja-company-id",
  "vendaja-branch-id",
  "vendaja_omnichannel_view",
  "portal_admin_token",
  "portal_hr_token",
  "portal_commercial_token",
  "portal_customer_token",
  "portal_supplier_token",
  "portal_employee_token",
  "vendaja_sec_v2_vault",
  "vendaja_sec_v2_tenant",
] as const;

export interface SessionUserMinimal {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  role: string;
}

export interface SessionContextMinimal {
  companyId?: string;
  branchId?: string;
}

export interface SessionPersistPayload {
  accessToken: string;
  refreshToken?: string;
  user: SessionUserMinimal;
  context?: SessionContextMinimal | null;
}

function getSafeStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

export function sanitizeUserForStorage(user: SessionUserMinimal & Record<string, unknown>): SessionUserMinimal {
  return {
    id: String(user.id ?? ""),
    email: String(user.email ?? ""),
    username: String(user.username ?? ""),
    ...(user.displayName ? { displayName: String(user.displayName) } : {}),
    role: String(user.role ?? ""),
  };
}

export function persistBrowserSession(payload: SessionPersistPayload): void {
  const storage = getSafeStorage();
  if (!storage || !payload.accessToken) return;

  // Apenas o access token de curta duração e identificadores mínimos são mantidos em memória de browser.
  // O refresh token permanece preferencialmente em cookie HttpOnly gerido pelo backend.
  storage.setItem("accessToken", payload.accessToken);
  storage.removeItem("refreshToken");
  storage.setItem(
    "posUser",
    JSON.stringify(sanitizeUserForStorage(payload.user as SessionUserMinimal & Record<string, unknown>))
  );

  if (payload.context?.companyId) {
    storage.setItem("companyId", payload.context.companyId);
    storage.setItem("vendaja-company-id", payload.context.companyId);
  }
  if (payload.context?.branchId) {
    storage.setItem("branchId", payload.context.branchId);
    storage.setItem("vendaja-branch-id", payload.context.branchId);
  }
}

export function clearAllBrowserSession(): void {
  const storage = getSafeStorage();
  if (!storage) return;
  for (const key of SESSION_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // ignora erro isolado de remoção para continuar a limpeza restante
    }
  }
}

export async function logoutSession(
  apiUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<void> {
  const storage = getSafeStorage();
  const accessToken = storage?.getItem("accessToken") ?? "";
  const refreshToken = storage?.getItem("refreshToken") ?? "";

  try {
    if (typeof fetchImpl === "function") {
      await fetchImpl(`${apiUrl}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });
    }
  } catch {
    // Mesmo perante falha de rede ou HTTP 401, a sessão local tem de ser integralmente limpa.
  } finally {
    clearAllBrowserSession();
  }
}

export async function refreshSessionOrClear(
  apiUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<{ accessToken: string } | null> {
  const storage = getSafeStorage();
  const storedRefreshToken = storage?.getItem("refreshToken") ?? "";

  try {
    const response = await fetchImpl(`${apiUrl}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(storedRefreshToken ? { refreshToken: storedRefreshToken } : {}),
    });

    if (!response.ok) {
      clearAllBrowserSession();
      return null;
    }

    const data = (await response.json()) as { accessToken?: string };
    if (!data?.accessToken) {
      clearAllBrowserSession();
      return null;
    }

    storage?.setItem("accessToken", data.accessToken);
    storage?.removeItem("refreshToken");
    return { accessToken: data.accessToken };
  } catch {
    clearAllBrowserSession();
    return null;
  }
}
