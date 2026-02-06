/**
 * Config (Environment) Validators Tests
 *
 * Tests the Zod validation schemas for environment variable configuration.
 * Source: packages/validators/src/config.ts
 *
 * This file imports NODE_ENVIRONMENTS and LOG_LEVELS from @intelliflow/domain.
 * devEnvSchema requires DATABASE_URL (no default).
 * testEnvSchema makes DATABASE_URL optional (no default).
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect, vi } from 'vitest';

import {
  envSchema,
  devEnvSchema,
  prodEnvSchema,
  testEnvSchema,
  validateEnv,
  safeValidateEnv,
} from '../config';

/** Minimal valid env object that satisfies the base envSchema */
const minimalValidEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
  JWT_SECRET: 'a]veryLongSecretThatIsAtLeast32Chars!',
  SESSION_SECRET: 'a]veryLongSessionSecretAtLeast32Chars!',
};

/** Full valid env object with all optional fields populated */
const fullValidEnv = {
  ...minimalValidEnv,
  PORT: '4000',
  API_URL: 'http://localhost:4000',
  CORS_ORIGIN: 'http://localhost:3000',
  RATE_LIMIT_MAX: '200',
  RATE_LIMIT_WINDOW_MS: '60000',
  JWT_EXPIRES_IN: '24h',
  BCRYPT_ROUNDS: '12',
  OPENAI_API_KEY: 'sk-test-key-1234',
  OPENAI_MODEL: 'gpt-4-turbo',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  AI_TIMEOUT_MS: '15000',
  AI_MAX_RETRIES: '2',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'user@example.com',
  SMTP_PASSWORD: 'password123',
  EMAIL_FROM: 'noreply@example.com',
  SENTRY_DSN: 'https://examplePublicKey@sentry.io/1',
  OTEL_ENABLED: 'true',
  OTEL_ENDPOINT: 'http://localhost:4318',
  LOG_LEVEL: 'debug',
  REDIS_URL: 'redis://localhost:6379',
  CACHE_TTL_SECONDS: '1800',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-value',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
  ENABLE_AI_SCORING: 'true',
  ENABLE_EMAIL_NOTIFICATIONS: 'true',
  ENABLE_WEBHOOKS: 'true',
  ENABLE_ANALYTICS: 'false',
};

describe('Config Validators', () => {
  // =========================================================================
  // envSchema (base)
  // =========================================================================
  describe('envSchema', () => {
    it('should accept minimal valid env with required fields', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
    });

    it('should apply defaults for NODE_ENV when not provided', () => {
      const { NODE_ENV: _, ...envWithoutNodeEnv } = minimalValidEnv;
      const result = envSchema.safeParse(envWithoutNodeEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
      }
    });

    it('should apply default PORT of 3000', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3000);
      }
    });

    it('should coerce PORT from string to number', () => {
      const result = envSchema.safeParse({ ...minimalValidEnv, PORT: '8080' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(8080);
      }
    });

    it('should apply default feature flags', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ENABLE_AI_SCORING).toBe(true);
        expect(result.data.ENABLE_EMAIL_NOTIFICATIONS).toBe(false);
        expect(result.data.ENABLE_WEBHOOKS).toBe(false);
        expect(result.data.ENABLE_ANALYTICS).toBe(true);
      }
    });

    it('should accept all valid NODE_ENV values', () => {
      const envs = ['development', 'test', 'staging', 'production'];
      envs.forEach((nodeEnv) => {
        const result = envSchema.safeParse({ ...minimalValidEnv, NODE_ENV: nodeEnv });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid NODE_ENV', () => {
      const result = envSchema.safeParse({ ...minimalValidEnv, NODE_ENV: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should reject DATABASE_URL that does not start with postgresql://', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        DATABASE_URL: 'mysql://localhost:3306/db',
      });
      expect(result.success).toBe(false);
    });

    it('should reject DATABASE_URL that is not a valid URL', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        DATABASE_URL: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should reject JWT_SECRET shorter than 32 characters', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        JWT_SECRET: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should accept JWT_SECRET at exactly 32 characters', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        JWT_SECRET: 'x'.repeat(32),
      });
      expect(result.success).toBe(true);
    });

    it('should reject SESSION_SECRET shorter than 32 characters', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        SESSION_SECRET: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should accept full valid env with all fields populated', () => {
      const result = envSchema.safeParse(fullValidEnv);
      expect(result.success).toBe(true);
    });

    it('should reject invalid LOG_LEVEL', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        LOG_LEVEL: 'verbose',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid LOG_LEVEL values', () => {
      const levels = ['debug', 'info', 'warn', 'error'];
      levels.forEach((level) => {
        const result = envSchema.safeParse({ ...minimalValidEnv, LOG_LEVEL: level });
        expect(result.success).toBe(true);
      });
    });

    it('should default LOG_LEVEL to info', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LOG_LEVEL).toBe('info');
      }
    });

    it('should reject invalid EMAIL_FROM', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        EMAIL_FROM: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should default BCRYPT_ROUNDS to 12', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.BCRYPT_ROUNDS).toBe(12);
      }
    });

    it('should reject BCRYPT_ROUNDS below 10', () => {
      const result = envSchema.safeParse({ ...minimalValidEnv, BCRYPT_ROUNDS: '9' });
      expect(result.success).toBe(false);
    });

    it('should reject BCRYPT_ROUNDS above 15', () => {
      const result = envSchema.safeParse({ ...minimalValidEnv, BCRYPT_ROUNDS: '16' });
      expect(result.success).toBe(false);
    });

    it('should reject missing DATABASE_URL', () => {
      const { DATABASE_URL: _, ...env } = minimalValidEnv;
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // devEnvSchema
  // =========================================================================
  describe('devEnvSchema', () => {
    it('should accept valid dev env with DATABASE_URL', () => {
      const result = devEnvSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
      });
      expect(result.success).toBe(true);
    });

    it('should default JWT_SECRET in dev mode', () => {
      const result = devEnvSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe('dev-secret-change-in-production-min-32-chars');
      }
    });

    it('should default SESSION_SECRET in dev mode', () => {
      const result = devEnvSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SESSION_SECRET).toBe('dev-session-secret-change-in-production');
      }
    });

    it('should require DATABASE_URL (no default)', () => {
      // devEnvSchema in config.ts does NOT default DATABASE_URL - it must be set
      const result = devEnvSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid DATABASE_URL in dev mode', () => {
      const result = devEnvSchema.safeParse({
        DATABASE_URL: 'mysql://localhost/db',
      });
      expect(result.success).toBe(false);
    });

    it('should allow custom JWT_SECRET in dev mode', () => {
      const result = devEnvSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
        JWT_SECRET: 'my-custom-dev-secret-very-long-string',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe('my-custom-dev-secret-very-long-string');
      }
    });
  });

  // =========================================================================
  // prodEnvSchema
  // =========================================================================
  describe('prodEnvSchema', () => {
    const validProdEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod-host:5432/intelliflow_prod',
      JWT_SECRET: 'a]veryLongProductionSecretThatIsAtLeast32Characters!',
      SESSION_SECRET: 'a]veryLongProductionSessionSecretAtLeast32Chars!',
      SENTRY_DSN: 'https://examplePublicKey@sentry.io/1',
      CORS_ORIGIN: 'https://app.intelliflow.com',
    };

    it('should accept valid production env', () => {
      const result = prodEnvSchema.safeParse(validProdEnv);
      expect(result.success).toBe(true);
    });

    it('should require NODE_ENV to be literally "production"', () => {
      const result = prodEnvSchema.safeParse({
        ...validProdEnv,
        NODE_ENV: 'development',
      });
      expect(result.success).toBe(false);
    });

    it('should require SENTRY_DSN in production', () => {
      const { SENTRY_DSN: _, ...env } = validProdEnv;
      const result = prodEnvSchema.safeParse(env);
      expect(result.success).toBe(false);
    });

    it('should reject CORS_ORIGIN of "*" in production', () => {
      const result = prodEnvSchema.safeParse({
        ...validProdEnv,
        CORS_ORIGIN: '*',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short JWT_SECRET in production', () => {
      const result = prodEnvSchema.safeParse({
        ...validProdEnv,
        JWT_SECRET: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short SESSION_SECRET in production', () => {
      const result = prodEnvSchema.safeParse({
        ...validProdEnv,
        SESSION_SECRET: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should require DATABASE_URL in production', () => {
      const { DATABASE_URL: _, ...env } = validProdEnv;
      const result = prodEnvSchema.safeParse(env);
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // testEnvSchema
  // =========================================================================
  describe('testEnvSchema', () => {
    it('should accept minimal test env', () => {
      const result = testEnvSchema.safeParse({
        NODE_ENV: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('should require NODE_ENV to be literally "test"', () => {
      const result = testEnvSchema.safeParse({
        NODE_ENV: 'development',
      });
      expect(result.success).toBe(false);
    });

    it('should make DATABASE_URL optional', () => {
      const result = testEnvSchema.safeParse({
        NODE_ENV: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('should default JWT_SECRET in test mode', () => {
      const result = testEnvSchema.safeParse({
        NODE_ENV: 'test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe('test-secret-min-32-characters-long');
      }
    });

    it('should default SESSION_SECRET in test mode', () => {
      const result = testEnvSchema.safeParse({
        NODE_ENV: 'test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SESSION_SECRET).toBe('test-session-secret-min-32-chars');
      }
    });

    it('should accept explicit DATABASE_URL in test mode', () => {
      const result = testEnvSchema.safeParse({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe('postgresql://localhost:5432/intelliflow_test');
      }
    });
  });

  // =========================================================================
  // validateEnv function
  // =========================================================================
  describe('validateEnv', () => {
    it('should use devEnvSchema for development NODE_ENV', () => {
      const env = {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
      } as unknown as NodeJS.ProcessEnv;

      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should use testEnvSchema for test NODE_ENV', () => {
      const env = {
        NODE_ENV: 'test',
      } as unknown as NodeJS.ProcessEnv;

      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe('test');
    });

    it('should use prodEnvSchema for production NODE_ENV', () => {
      const env = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://prod:5432/intelliflow',
        JWT_SECRET: 'a]veryLongProductionSecretThatIsAtLeast32Characters!',
        SESSION_SECRET: 'a]veryLongProductionSessionSecretAtLeast32Chars!',
        SENTRY_DSN: 'https://examplePublicKey@sentry.io/1',
        CORS_ORIGIN: 'https://app.intelliflow.com',
      } as unknown as NodeJS.ProcessEnv;

      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe('production');
    });

    it('should default to devEnvSchema when NODE_ENV is not set', () => {
      const env = {
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
      } as unknown as NodeJS.ProcessEnv;

      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should throw Error with message on invalid config', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const env = {
        NODE_ENV: 'production',
        // Missing required production fields
      } as unknown as NodeJS.ProcessEnv;

      expect(() => validateEnv(env)).toThrow(
        'Invalid environment configuration. Check the errors above.'
      );

      vi.restoreAllMocks();
    });

    it('should use devEnvSchema for staging NODE_ENV', () => {
      const env = {
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_staging',
      } as unknown as NodeJS.ProcessEnv;

      const result = validateEnv(env);
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // safeValidateEnv function
  // =========================================================================
  describe('safeValidateEnv', () => {
    it('should return success: true for valid env', () => {
      const env = {
        NODE_ENV: 'test',
      } as unknown as NodeJS.ProcessEnv;

      const result = safeValidateEnv(env);
      expect(result.success).toBe(true);
    });

    it('should return success: false for invalid env', () => {
      const env = {
        NODE_ENV: 'production',
        // Missing required production fields
      } as unknown as NodeJS.ProcessEnv;

      const result = safeValidateEnv(env);
      expect(result.success).toBe(false);
    });

    it('should not throw on invalid env', () => {
      const env = {
        NODE_ENV: 'production',
      } as unknown as NodeJS.ProcessEnv;

      expect(() => safeValidateEnv(env)).not.toThrow();
    });

    it('should default to dev schema when NODE_ENV is missing', () => {
      const env = {
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
      } as unknown as NodeJS.ProcessEnv;

      const result = safeValidateEnv(env);
      expect(result.success).toBe(true);
    });

    it('should use test schema for test NODE_ENV', () => {
      const env = {
        NODE_ENV: 'test',
      } as unknown as NodeJS.ProcessEnv;

      const result = safeValidateEnv(env);
      expect(result.success).toBe(true);
    });
  });
});
