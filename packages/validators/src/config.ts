import { z } from 'zod';
import { NODE_ENVIRONMENTS, LOG_LEVELS } from '@intelliflow/domain';

/**
 * Environment Variable Validation
 *
 * Following 2025 best practices for early-stage validation.
 * Validates process.env at application startup to prevent silent failures.
 * All enums derive from @intelliflow/domain constants (single source of truth).
 *
 * Usage:
 * ```typescript
 * import { envSchema } from '@intelliflow/validators';
 * const env = envSchema.parse(process.env);
 * ```
 */

// Node environment - derived from domain constants
const nodeEnvSchema = z.enum(NODE_ENVIRONMENTS).default('development');

// Database configuration
const databaseUrlSchema = z.string().url().startsWith('postgresql://');

// API configuration
const apiConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  API_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000), // 15 minutes
});

// Authentication configuration
const authConfigSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
});

// AI/LLM configuration
const aiConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default('gpt-4'),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
});

// Email configuration
const emailConfigSchema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
});

// Observability configuration - LOG_LEVEL derived from domain constants
const observabilityConfigSchema = z.object({
  SENTRY_DSN: z.string().url().optional(),
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_ENDPOINT: z.string().url().optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

// Redis/cache configuration
const cacheConfigSchema = z.object({
  REDIS_URL: z.string().url().optional(),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});

// Supabase configuration
const supabaseConfigSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

// Feature flags
const featureFlagsSchema = z.object({
  ENABLE_AI_SCORING: z.coerce.boolean().default(true),
  ENABLE_EMAIL_NOTIFICATIONS: z.coerce.boolean().default(false),
  ENABLE_WEBHOOKS: z.coerce.boolean().default(false),
  ENABLE_ANALYTICS: z.coerce.boolean().default(true),
});

/**
 * Main environment schema
 *
 * Combines all configuration sections into a single validated schema.
 * Use .parse() for strict validation (throws on error) or
 * .safeParse() for graceful error handling.
 */
export const envSchema = z.object({
  // Node environment
  NODE_ENV: nodeEnvSchema,

  // Database
  DATABASE_URL: databaseUrlSchema,

  // API
  ...apiConfigSchema.shape,

  // Authentication
  ...authConfigSchema.shape,

  // AI/LLM
  ...aiConfigSchema.shape,

  // Email
  ...emailConfigSchema.shape,

  // Observability
  ...observabilityConfigSchema.shape,

  // Cache
  ...cacheConfigSchema.shape,

  // Supabase
  ...supabaseConfigSchema.shape,

  // Feature flags
  ...featureFlagsSchema.shape,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Development-specific schema (relaxed validation)
 *
 * In development, many services are optional (e.g., Redis, Sentry).
 * This schema allows development without full infrastructure.
 */
export const devEnvSchema = envSchema.extend({
  // NOTE: No default for DATABASE_URL - must be explicitly set in .env file
  // This prevents accidental connection to wrong database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  JWT_SECRET: z.string().optional().default('dev-secret-change-in-production-min-32-chars'),
  SESSION_SECRET: z.string().optional().default('dev-session-secret-change-in-production'),
});

/**
 * Production-specific schema (strict validation)
 *
 * In production, all critical services must be configured.
 * No defaults for secrets or sensitive configuration.
 */
export const prodEnvSchema = envSchema.extend({
  NODE_ENV: z.literal('production'),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  SENTRY_DSN: z.string().url(), // Required in production
  CORS_ORIGIN: z.string().refine(
    (val) => val !== '*',
    'CORS_ORIGIN must be specific in production (not *)'
  ),
});

/**
 * Test-specific schema (minimal validation)
 *
 * In test environment, use in-memory databases and mock services.
 */
export const testEnvSchema = envSchema.extend({
  NODE_ENV: z.literal('test'),
  // NOTE: Test DATABASE_URL should be set in .env.test, not defaulted
  DATABASE_URL: z.string().url().startsWith('postgresql://').optional(),
  JWT_SECRET: z.string().optional().default('test-secret-min-32-characters-long'),
  SESSION_SECRET: z.string().optional().default('test-session-secret-min-32-chars'),
});

/**
 * Validate environment variables based on NODE_ENV
 *
 * @param env - process.env object
 * @returns Validated environment configuration
 * @throws ZodError if validation fails
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const nodeEnv = (env.NODE_ENV || 'development') as string;

  let schema: z.ZodTypeAny;

  if (nodeEnv === 'production') {
    schema = prodEnvSchema;
  } else if (nodeEnv === 'test') {
    schema = testEnvSchema;
  } else {
    // development, staging, and any other value use dev schema
    schema = devEnvSchema;
  }

  try {
    return schema.parse(env) as Env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      console.error(JSON.stringify(error.format(), null, 2));
      throw new Error('Invalid environment configuration. Check the errors above.');
    }
    throw error;
  }
}

/**
 * Graceful environment validation (returns Result-like object)
 *
 * @param env - process.env object
 * @returns { success: true, data: Env } or { success: false, error: ZodError }
 */
export function safeValidateEnv(env: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = (env.NODE_ENV || 'development') as string;

  let schema: z.ZodTypeAny;

  if (nodeEnv === 'production') {
    schema = prodEnvSchema;
  } else if (nodeEnv === 'test') {
    schema = testEnvSchema;
  } else {
    // development, staging, and any other value use dev schema
    schema = devEnvSchema;
  }

  return schema.safeParse(env);
}
