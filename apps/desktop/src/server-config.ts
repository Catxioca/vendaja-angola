import fs from "node:fs/promises";
import { dirname } from "node:path";

export type ServerConfig = { apiUrl: string; terminalId: string };

export function validateServerUrl(value: string, allowPilotHttp = false): string {
  const input = value.trim();
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("URL da API inválida."); }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = hostname === "localhost" || hostname === "::1" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  const isPrivateLanAddress = /^10(?:\.\d{1,3}){3}$/.test(hostname) ||
    /^192\.168(?:\.\d{1,3}){2}$/.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(hostname);
  const isPilotLanHost = hostname.endsWith(".lan") || hostname.endsWith(".local");
  const hasCredentials = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*@/i.test(input);
  if (hasCredentials || input.includes("#")) throw new Error("A URL não pode conter credenciais ou fragmento.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (isLoopback || (allowPilotHttp && (isPrivateLanAddress || isPilotLanHost))))) {
    throw new Error("Em produção, a URL da API deve usar HTTPS. HTTP só é permitido para localhost ou rede piloto explicitamente autorizada.");
  }
  return url.toString().replace(/\/+$/, "");
}

export function validateServerConfig(config: ServerConfig, allowPilotHttp = false): ServerConfig {
  const next = { apiUrl: validateServerUrl(config.apiUrl, allowPilotHttp), terminalId: config.terminalId.trim() };
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(next.terminalId)) throw new Error("O terminalId deve conter 1-64 caracteres seguros.");
  return next;
}

export async function readServerConfigFile(filePath: string, allowPilotHttp = false): Promise<ServerConfig | null> {
  try {
    const config = JSON.parse(await fs.readFile(filePath, "utf8")) as Partial<ServerConfig>;
    if (!config.apiUrl || !config.terminalId) return null;
    return validateServerConfig({ apiUrl: config.apiUrl, terminalId: config.terminalId }, allowPilotHttp);
  } catch {
    return null;
  }
}

export async function writeServerConfigFile(filePath: string, config: ServerConfig, allowPilotHttp = false): Promise<ServerConfig> {
  const next = validateServerConfig(config, allowPilotHttp);
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(next), { encoding: "utf8", mode: 0o600 });
  return next;
}

export async function testServerConnection(apiUrl: string, allowPilotHttp = false): Promise<{ ok: boolean; status?: number; message: string }> {
  const base = validateServerUrl(apiUrl, allowPilotHttp);
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    return { ok: response.ok, status: response.status, message: response.ok ? "Ligação ao backend confirmada." : `Backend respondeu HTTP ${response.status}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? `Backend indisponível: ${error.message}` : "Backend indisponível." };
  }
}
