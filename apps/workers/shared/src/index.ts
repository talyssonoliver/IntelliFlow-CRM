/**
 * Worker Shared Infrastructure
 *
 * Exports all shared utilities for IntelliFlow workers.
 *
 * @module @intelliflow/worker-shared
 * @task IFC-163
 */

// Configuration
export {
  WorkerConfigSchema,
  RedisConfigSchema,
  QueueConfigSchema,
  TelemetryConfigSchema,
  CircuitBreakerConfigSchema,
  HealthCheckConfigSchema,
  loadWorkerConfig,
  validateConfig,
  createTestConfig,
  getRedisConfig,
} from './worker-config';

export type {
  WorkerConfig,
  RedisConfig,
  QueueConfig,
  TelemetryConfig,
  CircuitBreakerConfig,
  HealthCheckConfig,
} from './worker-config';

// Base Worker
export { BaseWorker } from './base-worker';
export type { BaseWorkerOptions } from './base-worker';

// Queue Connector
export { QueueConnector } from './queue-connector';
export type { QueueConnectionOptions, QueueStats, JobProcessor } from './queue-connector';

// Health Server
export { HealthServer, createDefaultHealthProvider } from './health-server';
export type { HealthProvider, HealthServerOptions } from './health-server';

// Graceful Shutdown
export {
  setupGracefulShutdown,
  createCompositeShutdown,
} from './graceful-shutdown';
export type { GracefulShutdownOptions, ShutdownHandler } from './graceful-shutdown';

// Types
export type {
  HealthStatus,
  ComponentHealth,
  HealthResponse,
  ReadinessResponse,
  LivenessResponse,
  DetailedHealthResponse,
  JobResult,
  JobContext,
  WorkerState,
  WorkerStatus,
  WorkerMetrics,
  WorkerEventType,
  WorkerEvent,
  QueueConnection,
  ConnectionHealth,
} from './types';
