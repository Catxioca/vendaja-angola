/**
 * Configuração Explícita de Canais Institucionais — VendaJá Angola
 * Nunca expõe telefone, e-mail ou endereço sem configuração explícita aprovada.
 * Não inclui canais pessoais ou de terceiros.
 */

export const INSTITUTIONAL_CONTACT_UNAVAILABLE_MESSAGE = "Canais institucionais em configuração";

export interface InstitutionalContactConfig {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface ResolvedInstitutionalContact {
  email: string | null;
  phone: string | null;
  address: string | null;
  hasAnyChannel: boolean;
  fallbackMessage: typeof INSTITUTIONAL_CONTACT_UNAVAILABLE_MESSAGE;
}

function normalizeOptionalChannel(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readEnvChannel(key: string): string | null {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> })?.env;
    if (metaEnv && typeof metaEnv[key] === "string") {
      return normalizeOptionalChannel(metaEnv[key] as string);
    }
  } catch {
    // Fallback seguro para ambientes Node/SSR sem import.meta.env
  }

  if (typeof process !== "undefined" && process.env && typeof process.env[key] === "string") {
    return normalizeOptionalChannel(process.env[key]);
  }

  return null;
}

export function resolveInstitutionalContactChannels(
  overrides?: Partial<InstitutionalContactConfig>
): ResolvedInstitutionalContact {
  const email =
    overrides && "email" in overrides
      ? normalizeOptionalChannel(overrides.email)
      : readEnvChannel("VITE_INSTITUTIONAL_CONTACT_EMAIL");

  const phone =
    overrides && "phone" in overrides
      ? normalizeOptionalChannel(overrides.phone)
      : readEnvChannel("VITE_INSTITUTIONAL_CONTACT_PHONE");

  const address =
    overrides && "address" in overrides
      ? normalizeOptionalChannel(overrides.address)
      : readEnvChannel("VITE_INSTITUTIONAL_CONTACT_ADDRESS");

  return {
    email,
    phone,
    address,
    hasAnyChannel: Boolean(email || phone || address),
    fallbackMessage: INSTITUTIONAL_CONTACT_UNAVAILABLE_MESSAGE,
  };
}
