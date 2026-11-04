import net from "node:net";

export async function probePort(port: number, host = "127.0.0.1", timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      resolved = true;
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.once("error", () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.connect(port, host);
  });
}

export async function getEffectiveTestDatabaseUrl(): Promise<string | undefined> {
  const raw = process.env.TEST_DATABASE_URL || "postgresql://vendaja_test:VendaJ%402309@127.0.0.1:5432/vendaja_test?schema=public";
  try {
    const is5432Reachable = await probePort(5432, "127.0.0.1");
    const is5433Reachable = !is5432Reachable && await probePort(5433, "127.0.0.1");
    if (!is5432Reachable && !is5433Reachable) return undefined;

    const url = new URL(raw);
    let resolved = raw;
    if (is5433Reachable) {
      url.port = "5433";
      resolved = url.toString();
    }
    process.env.DATABASE_URL = resolved;
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "k9X0m2P9vL5nQ8rT1wY4bZ7cE0aD3fG6h8K1";
    }
    if (!process.env.FISCAL_CONFIG_KEY) {
      process.env.FISCAL_CONFIG_KEY = "j8V0n3Q9wM6oR9sU2xZ5cA8dF1bE4gH7m3J2";
    }
    return resolved;
  } catch {
    return undefined;
  }
}
