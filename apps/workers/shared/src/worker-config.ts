/**
 * Worker Configuration Schema
 *
 * Zod schema for validating and loading worker configuration.
 * Pattern from: apps/ai-worker/src/config/ai.config.ts
 *
 * @module worker-shared/config
 * @task IFC-163
 */

import { z } from 'zod';

// ============================================================================
// Configuration Schemas
// ============================================================================

/**
 * Redis connection configuration
 */
export const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().int().min(1).max(65535).default(6379),
  password: z.string().optional(),
  tls: z.boolean().default(false),
  db: z.number().int().min(0).max(15).default(0),
  maxRetriesPerRequest: z.number().int().min(0).nullable().default(null),
  enableOfflineQueue: z.boolean().default(false),
  lazyConnect: z.boolean().default(true),
});

/**
 * Queue processing configuration
 */
export const QueueConfigSchema = z.object({
  concurrency: z.number().int().min(1).max(100).default(5),
  rateLimiter: z
    .object({
      max: z.number().int().positive(),
      duration: z.number().int().positive(),
    })
    .optional(),
  lockDuration: z.number().int().min(1000).default(30000),
  stalledInterval: z.number().int().min(1000).default(30000),
  maxStalledCount: z.number().int().min(1).default(3),
});

/**
 * Telemetry/observability configuration
 */
export const TelemetryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  serviceName: z.string(),
  serviceVersion: z.string().default('1.0.0'),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  metricsEnabled: z.boolean().default(true),
  tracingEnabled: z.boolean().default(true),
});

/**
 * Circuit breaker configuration
 */
export const CircuitBreakerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  failureThreshold: z.number().int().min(1).default(5),
  successThreshold: z.number().int().min(1).default(2),
  resetTimeoutMs: z.number().int().min(1000).default(30000),
  halfOpenMaxCalls: z.number().int().min(1).default(3),
  failureWindowMs: z.number().int().min(1000).default(60000),
});

/**
 * Health check configuration
 */
export const HealthCheckConfigSchema = z.object({
  port: z.number().int().min(0).max(65535).default(0), // 0 = random available port
  path: z.string().default('/health'),
  readyPath: z.string().default('/health/ready'),
  livePath: z.string().default('/health/live'),
  detailedPath: z.string().default('/health/detailed'),
  metricsPath: z.string().default('/metrics'),
});

/**
 * Main worker configuration schema
 */
export const WorkerConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  shutdownTimeoutMs: z.number().int().min(5000).max(300000).default(30000),
  redis: RedisConfigSchema,
  queue: QueueConfigSchema,
  telemetry: TelemetryConfigSchema,
  circuitBreaker: CircuitBreakerConfigSchema,
  healthCheck: HealthCheckConfigSchema,
});

// ============================================================================
// Types
// ============================================================================

export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type QueueConfig = z.infer<typeof QueueConfigSchema>;
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export type HealthCheckConfig = z.infer<typeof HealthCheckConfigSchema>;
export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Load worker configuration from environment variables
 *
 * Environment variables:
 * - WORKER_NAME: Worker identifier (required)
 * - WORKER_VERSION: Semantic version (default: 1.0.0)
 * - WORKER_SHUTDOWN_TIMEOUT_MS: Shutdown grace period (default: 30000)
 * - REDIS_HOST: Redis host (default: localhost)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password (optional)
 * - REDIS_TLS: Enable TLS (default: false)
 * - QUEUE_CONCURRENCY: Job concurrency (default: 5)
 * - QUEUE_RATE_LIMIT_MAX: Rate limit max (optional)
 * - QUEUE_RATE_LIMIT_DURATION: Rate limit window in ms (optional)
 * - TELEMETRY_ENABLED: Enable telemetry (default: true)
 * - LOG_LEVEL: Log level (default: info)
 * - NODE_ENV: Environment (default: development)
 * - HEALTH_PORT: Health check port (default: 3100)
 */
export function loadWorkerConfig(workerName: string): WorkerConfig {
  const rateLimiter =
    process.env.QUEUE_RATE_LIMIT_MAX && process.env.QUEUE_RATE_LIMIT_DURATION
      ? {
          max: parseInt(process.env.QUEUE_RATE_LIMIT_MAX, 10),
          duration: parseInt(process.env.QUEUE_RATE_LIMIT_DURATION, 10),
        }
      : undefined;

  const config = {
    name: workerName,
    version: process.env.WORKER_VERSION || process.env.npm_package_version || '1.0.0',
    shutdownTimeoutMs: parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || '30000', 10),
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_TLS === 'true',
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES ? parseInt(process.env.REDIS_MAX_RETRIES, 10) : null,
      enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE === 'true',
      lazyConnect: process.env.REDIS_LAZY_CONNECT !== 'false',
    },
    queue: {
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
      rateLimiter,
      lockDuration: parseInt(process.env.QUEUE_LOCK_DURATION || '30000', 10),
      stalledInterval: parseInt(process.env.QUEUE_STALLED_INTERVAL || '30000', 10),
      maxStalledCount: parseInt(process.env.QUEUE_MAX_STALLED || '3', 10),
    },
    telemetry: {
      enabled: process.env.TELEMETRY_ENABLED !== 'false',
      serviceName: workerName,
      serviceVersion: process.env.WORKER_VERSION || '1.0.0',
      environment:
        (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development',
      logLevel:
        (process.env.LOG_LEVEL as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal') ||
        'info',
      metricsEnabled: process.env.METRICS_ENABLED !== 'false',
      tracingEnabled: process.env.TRACING_ENABLED !== 'false',
    },
    circuitBreaker: {
      enabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10),
      successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '2', 10),
      resetTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000', 10),
      halfOpenMaxCalls: parseInt(process.env.CIRCUIT_BREAKER_HALF_OPEN_MAX || '3', 10),
      failureWindowMs: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_WINDOW || '60000', 10),
    },
    healthCheck: {
      port: parseInt(process.env.HEALTH_PORT || '0', 10), // 0 = random available port
      path: process.env.HEALTH_PATH || '/health',
      readyPath: process.env.HEALTH_READY_PATH || '/health/ready',
      livePath: process.env.HEALTH_LIVE_PATH || '/health/live',
      detailedPath: process.env.HEALTH_DETAILED_PATH || '/health/detailed',
      metricsPath: process.env.METRICS_PATH || '/metrics',
    },
  };

  return WorkerConfigSchema.parse(config);
}

/**
 * Validate a partial configuration object
 */
export function validateConfig(config: unknown): WorkerConfig {
  return WorkerConfigSchema.parse(config);
}

/**
 * Get Redis connection options for BullMQ
 *
 * @returns Redis connection options compatible with BullMQ
 */
export function getRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true',
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES ? parseInt(process.env.REDIS_MAX_RETRIES, 10) : null,
    enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE === 'true',
    lazyConnect: process.env.REDIS_LAZY_CONNECT !== 'false',
  };
}

/**
 * Create a default configuration for testing
 */
export function createTestConfig(overrides?: Partial<WorkerConfig>): WorkerConfig {
  const defaults: WorkerConfig = {
    name: 'test-worker',
    version: '1.0.0',
    shutdownTimeoutMs: 5000,
    redis: {
      host: 'localhost',
      port: 6379,
      tls: false,
      db: 0,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
    },
    queue: {
      concurrency: 1,
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 3,
    },
    telemetry: {
      enabled: false,
      serviceName: 'test-worker',
      serviceVersion: '1.0.0',
      environment: 'development',
      logLevel: 'debug',
      metricsEnabled: false,
      tracingEnabled: false,
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,
      successThreshold: 1,
      resetTimeoutMs: 5000,
      halfOpenMaxCalls: 1,
      failureWindowMs: 10000,
    },
    healthCheck: {
      port: 0, // Random port for testing
      path: '/health',
      readyPath: '/health/ready',
      livePath: '/health/live',
      detailedPath: '/health/detailed',
      metricsPath: '/metrics',
    },
  };

  return { ...defaults, ...overrides };
}
