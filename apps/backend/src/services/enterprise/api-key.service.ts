import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";

export interface ApiKeyRecord {
  id: string;
  companyId?: string | null;
  branchId?: string | null;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  rateLimitPerMinute: number;
  active: boolean;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
}

export class EnterpriseApiKeyService {
  private static inMemoryKeys = new Map<string, ApiKeyRecord>();

  /**
   * Generates a new API Key with a secure prefix and cryptographically random token
   * Format: vj_live_[32 random hex characters]
   */
  public static async createKey(params: {
    name: string;
    companyId?: string;
    branchId?: string;
    scopes: string[];
    rateLimitPerMinute?: number;
    expiresInDays?: number;
    createdById?: string;
  }): Promise<{ apiKey: string; record: ApiKeyRecord }> {
    const randomBytes = crypto.randomBytes(24).toString("hex");
    const rawKey = `vj_live_${randomBytes}`;
    const prefix = `vj_live_${randomBytes.slice(0, 6)}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const expiresAt = params.expiresInDays
      ? new Date(Date.now() + params.expiresInDays * 86_400_000).toISOString()
      : null;

    const record: ApiKeyRecord = {
      id: crypto.randomUUID(),
      companyId: params.companyId ?? null,
      branchId: params.branchId ?? null,
      name: params.name,
      prefix,
      keyHash,
      scopes: params.scopes,
      rateLimitPerMinute: params.rateLimitPerMinute ?? 120,
      active: true,
      expiresAt,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    };

    // Store in-memory cache
    this.inMemoryKeys.set(keyHash, record);

    try {
      await prisma.apiKey.create({
        data: {
          id: record.id,
          companyId: record.companyId,
          branchId: record.branchId,
          name: record.name,
          prefix: record.prefix,
          keyHash: record.keyHash,
          scopes: record.scopes as unknown as object,
          rateLimitPerMinute: record.rateLimitPerMinute,
          active: record.active,
          expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
          createdById: params.createdById,
        },
      });
    } catch (error) {
      logger.warn("API_KEY", "PERSIST_OFFLINE", "API key stored in memory cache while DB is offline", { metadata: { keyId: record.id } });
    }

    return { apiKey: rawKey, record };
  }

  /**
   * Validates an API Key from request header, checks active status, expiration, and required scopes
   */
  public static async validateKey(
    rawKey: string,
    requiredScope?: string
  ): Promise<{ valid: boolean; reason?: string; key?: ApiKeyRecord }> {
    if (!rawKey || !rawKey.startsWith("vj_live_")) {
      return { valid: false, reason: "invalid_format" };
    }

    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    let keyRecord = this.inMemoryKeys.get(keyHash);

    if (!keyRecord) {
      try {
        const dbKey = await prisma.apiKey.findUnique({ where: { keyHash } });
        if (dbKey) {
          keyRecord = {
            id: dbKey.id,
            companyId: dbKey.companyId,
            branchId: dbKey.branchId,
            name: dbKey.name,
            prefix: dbKey.prefix,
            keyHash: dbKey.keyHash,
            scopes: Array.isArray(dbKey.scopes) ? (dbKey.scopes as string[]) : [],
            rateLimitPerMinute: dbKey.rateLimitPerMinute,
            active: dbKey.active,
            expiresAt: dbKey.expiresAt?.toISOString() ?? null,
            lastUsedAt: dbKey.lastUsedAt?.toISOString() ?? null,
            createdAt: dbKey.createdAt.toISOString(),
          };
          this.inMemoryKeys.set(keyHash, keyRecord);
        }
      } catch {
        // use in-memory fallback
      }
    }

    if (!keyRecord) {
      return { valid: false, reason: "key_not_found" };
    }

    if (!keyRecord.active) {
      return { valid: false, reason: "key_inactive" };
    }

    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt).getTime() < Date.now()) {
      return { valid: false, reason: "key_expired" };
    }

    if (requiredScope && !keyRecord.scopes.includes(requiredScope) && !keyRecord.scopes.includes("*") && !keyRecord.scopes.includes("API.Admin")) {
      return { valid: false, reason: "insufficient_scope" };
    }

    // Update last used timestamp
    keyRecord.lastUsedAt = new Date().toISOString();
    try {
      await prisma.apiKey.update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      });
    } catch {
      // ignore offline update error
    }

    return { valid: true, key: keyRecord };
  }

  /**
   * Revokes or deletes an API Key
   */
  public static async revokeKey(keyId: string): Promise<boolean> {
    for (const [hash, record] of this.inMemoryKeys.entries()) {
      if (record.id === keyId) {
        record.active = false;
        this.inMemoryKeys.set(hash, record);
      }
    }

    try {
      await prisma.apiKey.update({
        where: { id: keyId },
        data: { active: false },
      });
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Lists API keys for a tenant
   */
  public static async listKeys(companyId?: string): Promise<ApiKeyRecord[]> {
    try {
      const dbKeys = await prisma.apiKey.findMany({
        where: companyId ? { companyId } : {},
        orderBy: { createdAt: "desc" },
      });
      return dbKeys.map((k) => ({
        id: k.id,
        companyId: k.companyId,
        branchId: k.branchId,
        name: k.name,
        prefix: k.prefix,
        keyHash: k.keyHash,
        scopes: Array.isArray(k.scopes) ? (k.scopes as string[]) : [],
        rateLimitPerMinute: k.rateLimitPerMinute,
        active: k.active,
        expiresAt: k.expiresAt?.toISOString() ?? null,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      }));
    } catch {
      return Array.from(this.inMemoryKeys.values()).filter(
        (k) => !companyId || k.companyId === companyId
      );
    }
  }

  public static async generateApiKey(
    companyId: string,
    name: string,
    scopes: string[],
    rateLimitRpm = 120,
    expiresAt?: Date
  ): Promise<{ id: string; rawKey: string; name: string; companyId: string; scopes: string[]; rateLimitRpm: number }> {
    const res = await this.createKey({
      name,
      companyId,
      scopes,
      rateLimitPerMinute: rateLimitRpm,
      expiresInDays: expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) : undefined,
    });
    return {
      id: res.record.id,
      rawKey: res.apiKey,
      name: res.record.name,
      companyId: res.record.companyId || companyId,
      scopes: res.record.scopes,
      rateLimitRpm: res.record.rateLimitPerMinute,
    };
  }

  public static async verifyApiKey(rawKey: string, requiredScope?: string) {
    const res = await this.validateKey(rawKey, requiredScope);
    if (!res.valid || !res.key) return null;
    return {
      id: res.key.id,
      companyId: res.key.companyId || "default",
      branchId: res.key.branchId,
      scopes: res.key.scopes,
      rateLimitRpm: res.key.rateLimitPerMinute,
    };
  }

  public static async revokeApiKey(keyId: string, _companyId?: string): Promise<boolean> {
    return this.revokeKey(keyId);
  }

  public static async listApiKeys(companyId?: string): Promise<ApiKeyRecord[]> {
    return this.listKeys(companyId);
  }
}

export { EnterpriseApiKeyService as ApiKeyService };
