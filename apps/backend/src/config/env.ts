import { z } from "zod";

const secret = (name: string) =>
  z.string().trim().min(32, `${name} must contain at least 32 characters`).refine(
    (value) => !/^(replace|change|default|development|test|secret|password|commerce|example)/i.test(value),
    `${name} must not use a placeholder or common secret`,
  ).refine(
    (value) => new Set(value).size >= 8,
    `${name} must contain sufficient character diversity`,
  );

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().trim().url(),
  JWT_SECRET: secret("JWT_SECRET"),
  FISCAL_CONFIG_KEY: secret("FISCAL_CONFIG_KEY"),
  FISCAL_PRIVATE_KEY: z.string().trim().min(1).optional(),
  COMPANY_NIF: z.string().trim().min(1),
  COMPANY_NAME: z.string().trim().min(1),
  CORS_ORIGIN: z.string().trim().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  SAFT_AO_XSD_PATH: z.string().trim().min(1).optional(),
  ADMIN_INITIAL_EMAIL: z.string().email().optional(),
  ADMIN_INITIAL_USERNAME: z.string().trim().min(1).optional(),
  ADMIN_INITIAL_NAME: z.string().trim().min(1).optional(),
  ADMIN_INITIAL_PASSWORD: z.string().min(1).optional(),
  ADMIN_INITIAL_PIN: z.string().regex(/^\d{4,6}$/).optional(),
});

export type AppEnv = z.infer<typeof rawEnvSchema>;

function productionRequirements() {
  const missing: string[] = [];
  for (const name of ["DATABASE_URL", "JWT_SECRET", "FISCAL_CONFIG_KEY", "COMPANY_NIF", "COMPANY_NAME"] as const) {
    if (!process.env[name]?.trim()) missing.push(name);
  }
  return missing;
}

export function loadEnv(): AppEnv {
  const result = rawEnvSchema.safeParse(process.env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".") || "environment").join(", ");
    throw new Error(`Invalid backend environment configuration: ${fields}`);
  }

  if (result.data.NODE_ENV === "production") {
    const missing = productionRequirements();
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
    }
  }

  return result.data;
}

export function getEnv(): AppEnv {
  return loadEnv();
}
