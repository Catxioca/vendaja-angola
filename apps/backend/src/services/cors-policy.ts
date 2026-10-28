export const isLoopbackOrLocalOrigin = (origin: string): boolean => {
  if (
    origin === "null" ||
    origin.startsWith("file://") ||
    origin.startsWith("vscode-webview://") ||
    origin.startsWith("electron://") ||
    origin.startsWith("capacitor://")
  ) {
    return true;
  }
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
};

export const isAllowedDomainOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return (
      host === "vendaja.ao" ||
      host.endsWith(".vendaja.ao") ||
      host.endsWith(".onrender.com") ||
      host.endsWith(".pages.dev") ||
      host.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
};

export const isAllowedOrigin = (
  origin: string | undefined,
  nodeEnv: string = process.env.NODE_ENV || "development",
  explicitAllowed: string[] = (process.env.CORS_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean)
): boolean => {
  // Mobile applications, local webview bridges and server-to-server calls don't send an Origin header
  if (!origin) return true;

  // Desktop (Electron), Capacitor, and local loopback origins
  if (isLoopbackOrLocalOrigin(origin)) return true;

  // Explicitly configured origins (e.g. from CORS_ORIGIN environment variable)
  if (explicitAllowed.includes(origin)) return true;

  // Wildcard is strictly forbidden in production; only allowed in non-production environments
  if (explicitAllowed.includes("*") && nodeEnv !== "production") return true;

  // Recognized canonical VendaJá production web origins
  if (isAllowedDomainOrigin(origin)) return true;

  // In non-production environments with no configuration, default to permissive for local testing
  if (explicitAllowed.length === 0 && nodeEnv !== "production") return true;

  // Reject all other arbitrary origins
  return false;
};
