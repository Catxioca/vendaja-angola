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
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    let resolved = raw;
    if ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.port === "5432") {
      const is5432Reachable = await probePort(5432, "127.0.0.1");
      if (!is5432Reachable) {
        const is5433Reachable = await probePort(5433, "127.0.0.1");
        if (is5433Reachable) {
          url.port = "5433";
          resolved = url.toString();
        }
      }
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
    process.env.DATABASE_URL = raw;
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "k9X0m2P9vL5nQ8rT1wY4bZ7cE0aD3fG6h8K1";
    }
    if (!process.env.FISCAL_CONFIG_KEY) {
      process.env.FISCAL_CONFIG_KEY = "j8V0n3Q9wM6oR9sU2xZ5cA8dF1bE4gH7m3J2";
    }
    return raw;
  }
}
