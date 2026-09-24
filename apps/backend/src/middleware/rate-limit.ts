import type { Request, RequestHandler } from "express";
import { prisma } from "../db.js";
import { countMetric } from "../services/observability.js";

export function distributedRateLimit(options: { name: string; limit: number; windowMs: number; key?: (req: Request) => string }): RequestHandler {
  return async (req, res, next) => {
    const identity = options.key?.(req) ?? req.ip ?? "unknown";
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / options.windowMs) * options.windowMs);
    const key = `${options.name}:${identity}:${windowStart.getTime()}`;
    try {
      const bucket = await prisma.rateLimitBucket.upsert({
        where: { key },
        create: { key, windowStart, count: 1, expiresAt: new Date(windowStart.getTime() + options.windowMs) },
        update: { count: { increment: 1 } },
      });
      res.setHeader("X-RateLimit-Limit", options.limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, options.limit - bucket.count));
      if (bucket.count > options.limit) {
        countMetric(`rate_limit_blocked_total{route="${options.name}"}`);
        res.setHeader("Retry-After", Math.ceil((windowStart.getTime() + options.windowMs - now) / 1000));
        res.status(429).json({ error: "rate_limited", message: "Demasiados pedidos. Tente novamente mais tarde." });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
