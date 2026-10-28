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
    return resolved;
  } catch {
    process.env.DATABASE_URL = raw;
    return raw;
  }
}
