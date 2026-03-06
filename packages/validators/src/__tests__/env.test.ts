/**
 * Env (Environment) Validators Tests
 *
 * Tests the Zod validation schemas for environment variable configuration.
 * Source: packages/validators/src/env.ts
 *
 * This file uses inline enum definitions (no @intelliflow/domain imports).
 * devEnvSchema defaults DATABASE_URL to postgresql://localhost:5432/intelliflow_dev.
 * testEnvSchema defaults DATABASE_URL to postgresql://localhost:5432/intelliflow_test.
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
} from '../env';

/** Minimal valid env object that satisfies the base envSchema */
const minimalValidEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://localhost:5432/intelliflow_dev',
  JWT_SECRET: 'a]veryLongSecretThatIsAtLeast32Chars!',
  SESSION_SECRET: 'a]veryLongSessionSecretAtLeast32Chars!',
};

/** Full valid env object with every field populated */
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

describe('Env Validators', () => {
  // =========================================================================
  // envSchema (base)
  // =========================================================================
  describe('envSchema', () => {
    it('should accept minimal valid env with required fields', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
    });

    it('should apply default NODE_ENV of "development"', () => {
      const { NODE_ENV: _, ...envWithoutNodeEnv } = minimalValidEnv;
      const result = envSchema.safeParse(envWithoutNodeEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
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
      const result = envSchema.safeParse({ ...minimalValidEnv, NODE_ENV: 'local' });
      expect(result.success).toBe(false);
    });

    it('should apply default PORT of 3000', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3000);
      }
    });

    it('should coerce PORT from string to number', () => {
      const result = envSchema.safeParse({ ...minimalValidEnv, PORT: '9090' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(9090);
      }
    });

    it('should reject negative PORT', () => {
      const result = envSchema.safeParse({ ...minimalValidEnv, PORT: '-1' });
      expect(result.success).toBe(false);
    });

    it('should apply default CORS_ORIGIN of "*"', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_ORIGIN).toBe('*');
      }
    });

    it('should reject DATABASE_URL not starting with postgresql://', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        DATABASE_URL: 'mysql://localhost:3306/db',
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-URL DATABASE_URL', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        DATABASE_URL: 'just-a-string',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing DATABASE_URL', () => {
      const { DATABASE_URL: _, ...env } = minimalValidEnv;
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(false);
    });

    it('should reject JWT_SECRET shorter than 32 characters', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        JWT_SECRET: 'tooshort',
      });
      expect(result.success).toBe(false);
    });

    it('should accept JWT_SECRET at exactly 32 characters', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        JWT_SECRET: 'a'.repeat(32),
      });
      expect(result.success).toBe(true);
    });

    it('should reject SESSION_SECRET shorter than 32 characters', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        SESSION_SECRET: 'tooshort',
      });
      expect(result.success).toBe(false);
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

    it('should accept all valid LOG_LEVEL values', () => {
      const levels = ['debug', 'info', 'warn', 'error'];
      levels.forEach((level) => {
        const result = envSchema.safeParse({ ...minimalValidEnv, LOG_LEVEL: level });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid LOG_LEVEL', () => {
      const result = envSchema.safeParse({
        ...minimalValidEnv,
        LOG_LEVEL: 'trace',
      });
      expect(result.success).toBe(false);
    });

    it('should default LOG_LEVEL to info', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LOG_LEVEL).toBe('info');
      }
    });

    it('should default OTEL_ENABLED to false', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OTEL_ENABLED).toBe(false);
      }
    });

    it('should accept full valid env with all fields', () => {
      const result = envSchema.safeParse(fullValidEnv);
      expect(result.success).toBe(true);
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

    it('should default AI_MAX_RETRIES to 3', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.AI_MAX_RETRIES).toBe(3);
      }
    });

    it('should default RATE_LIMIT_MAX to 100', () => {
      const result = envSchema.safeParse(minimalValidEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RATE_LIMIT_MAX).toBe(100);
      }
    });
  });

  // =========================================================================
  // devEnvSchema
  // =========================================================================
  describe('devEnvSchema', () => {
    it('should default DATABASE_URL when not provided', () => {
      const result = devEnvSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe('postgresql://localhost:5432/intelliflow_dev');
      }
    });

    it('should default JWT_SECRET in dev mode', () => {
      const result = devEnvSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe('dev-secret-change-in-production-min-32-chars');
      }
    });

    it('should default SESSION_SECRET in dev mode', () => {
      const result = devEnvSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SESSION_SECRET).toBe('dev-session-secret-change-in-production');
      }
    });

    it('should accept custom DATABASE_URL overriding default', () => {
      const result = devEnvSchema.safeParse({
        DATABASE_URL: 'postgresql://custom-host:5432/custom_db',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe('postgresql://custom-host:5432/custom_db');
      }
    });

    it('should allow custom JWT_SECRET in dev mode', () => {
      const result = devEnvSchema.safeParse({
        JWT_SECRET: 'my-custom-dev-jwt-secret-thats-long',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe('my-custom-dev-jwt-secret-thats-long');
      }
    });

    it('should accept empty object (all defaults apply)', () => {
      const result = devEnvSchema.safeParse({});
      expect(result.success).toBe(true);
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

    it('should accept specific CORS_ORIGIN in production', () => {
      const result = prodEnvSchema.safeParse({
        ...validProdEnv,
        CORS_ORIGIN: 'https://myapp.example.com',
      });
      expect(result.success).toBe(true);
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
    it('should accept minimal test env with only NODE_ENV', () => {
      const result = testEnvSchema.safeParse({ NODE_ENV: 'test' });
      expect(result.success).toBe(true);
    });

    it('should require NODE_ENV to be literally "test"', () => {
      const result = testEnvSchema.safeParse({ NODE_ENV: 'development' });
      expect(result.success).toBe(false);
    });

    it('should default DATABASE_URL in test mode', () => {
      const result = testEnvSchema.safeParse({ NODE_ENV: 'test' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe('postgresql://localhost:5432/intelliflow_test');
      }
    });

    it('should default JWT_SECRET in test mode', () => {
      const result = testEnvSchema.safeParse({ NODE_ENV: 'test' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe('test-secret-min-32-characters-long');
      }
    });

    it('should default SESSION_SECRET in test mode', () => {
      const result = testEnvSchema.safeParse({ NODE_ENV: 'test' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SESSION_SECRET).toBe('test-session-secret-min-32-chars');
      }
    });

    it('should accept explicit DATABASE_URL in test mode', () => {
      const result = testEnvSchema.safeParse({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost:5432/intelliflow_integration_test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe(
          'postgresql://localhost:5432/intelliflow_integration_test'
        );
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
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      // devEnvSchema has defaults for DATABASE_URL, JWT_SECRET, SESSION_SECRET
      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should use testEnvSchema for test NODE_ENV', () => {
      const env = {
        NODE_ENV: 'test',
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

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
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe('production');
    });

    it('should default to devEnvSchema when NODE_ENV is not set', () => {
      const env = {} as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should throw Error with descriptive message on invalid config', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const env = {
        NODE_ENV: 'production',
        // Missing required production fields
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      expect(() => validateEnv(env)).toThrow(
        'Invalid environment configuration. Check the errors above.'
      );

      vi.restoreAllMocks();
    });

    it('should call console.error on validation failure', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const env = {
        NODE_ENV: 'production',
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      try {
        validateEnv(env);
      } catch {
        // Expected to throw
      }

      expect(consoleErrorSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('should use devEnvSchema for staging NODE_ENV', () => {
      const env = {
        NODE_ENV: 'staging',
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      const result = validateEnv(env);
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // safeValidateEnv function
  // =========================================================================
  describe('safeValidateEnv', () => {
    it('should return success: true for valid test env', () => {
      const env = {
        NODE_ENV: 'test',
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      const result = safeValidateEnv(env);
      expect(result.success).toBe(true);
    });

    it('should return success: false for invalid production env', () => {
      const env = {
        NODE_ENV: 'production',
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      const result = safeValidateEnv(env);
      expect(result.success).toBe(false);
    });

    it('should not throw on invalid env', () => {
      const env = {
        NODE_ENV: 'production',
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      expect(() => safeValidateEnv(env)).not.toThrow();
    });

    it('should return error details on failure', () => {
      const env = {
        NODE_ENV: 'production',
      } as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      const result = safeValidateEnv(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('should default to dev schema when NODE_ENV is missing', () => {
      const env = {} as any; // intentional wrong type for validation test — plain object passed where NodeJS.ProcessEnv is expected;

      const result = safeValidateEnv(env);
      expect(result.success).toBe(true);
    });
  });
});
