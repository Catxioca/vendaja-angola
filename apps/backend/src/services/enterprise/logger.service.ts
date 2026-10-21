import crypto from "node:crypto";

export type LogSeverity = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface EnterpriseLogEntry {
  id: string;
  timestamp: string;
  correlationId?: string;
  userId?: string;
  companyId?: string;
  module: string;
  severity: LogSeverity;
  action: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export interface LogFilterOptions {
  module?: string;
  severity?: LogSeverity;
  userId?: string;
  companyId?: string;
  limit?: number;
  since?: string;
}

class EnterpriseLoggerService {
  private readonly maxBufferSize = 1000;
  private readonly buffer: EnterpriseLogEntry[] = [];

  public log(entry: Omit<EnterpriseLogEntry, "id" | "timestamp">): EnterpriseLogEntry {
    const fullEntry: EnterpriseLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.buffer.unshift(fullEntry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.pop();
    }

    // Output formatted JSON for container/cloud log collectors
    const output = JSON.stringify(fullEntry);
    if (entry.severity === "ERROR" || entry.severity === "CRITICAL") {
      process.stderr.write(`${output}\n`);
    } else {
      process.stdout.write(`${output}\n`);
    }

    return fullEntry;
  }

  public info(module: string, action: string, message: string, context?: { correlationId?: string; userId?: string; companyId?: string; metadata?: Record<string, unknown> } & Record<string, unknown>): EnterpriseLogEntry {
    return this.log({ module, severity: "INFO", action, message, ...context });
  }

  public warn(module: string, action: string, message: string, context?: { correlationId?: string; userId?: string; companyId?: string; metadata?: Record<string, unknown> } & Record<string, unknown>): EnterpriseLogEntry {
    return this.log({ module, severity: "WARN", action, message, ...context });
  }

  public error(module: string, action: string, message: string, error?: unknown, context?: { correlationId?: string; userId?: string; companyId?: string; metadata?: Record<string, unknown> } & Record<string, unknown>): EnterpriseLogEntry {
    const stack = error instanceof Error ? error.stack : undefined;
    return this.log({
      module,
      severity: "ERROR",
      action,
      message: `${message}${error instanceof Error ? `: ${error.message}` : ""}`,
      stack,
      ...context,
    });
  }

  public critical(module: string, action: string, message: string, error?: unknown, context?: { correlationId?: string; userId?: string; companyId?: string; metadata?: Record<string, unknown> } & Record<string, unknown>): EnterpriseLogEntry {
    const stack = error instanceof Error ? error.stack : undefined;
    return this.log({
      module,
      severity: "CRITICAL",
      action,
      message: `${message}${error instanceof Error ? `: ${error.message}` : ""}`,
      stack,
      ...context,
    });
  }

  public queryLogs(options: LogFilterOptions = {}): EnterpriseLogEntry[] {
    let result = [...this.buffer];

    if (options.module) {
      const targetModule = options.module.toLowerCase();
      result = result.filter((e) => e.module.toLowerCase().includes(targetModule));
    }

    if (options.severity) {
      result = result.filter((e) => e.severity === options.severity);
    }

    if (options.userId) {
      result = result.filter((e) => e.userId === options.userId);
    }

    if (options.companyId) {
      result = result.filter((e) => e.companyId === options.companyId);
    }

    if (options.since) {
      const sinceTime = Date.parse(options.since);
      if (!Number.isNaN(sinceTime)) {
        result = result.filter((e) => Date.parse(e.timestamp) >= sinceTime);
      }
    }

    const limit = Math.min(Math.max(1, options.limit ?? 100), 500);
    return result.slice(0, limit);
  }

  public getLogs(options: LogFilterOptions = {}): EnterpriseLogEntry[] {
    return this.queryLogs(options);
  }

  public clear(): void {
    this.buffer.length = 0;
  }
}

export const logger = new EnterpriseLoggerService();
export const EnterpriseLogger = logger;
export { EnterpriseLoggerService };
