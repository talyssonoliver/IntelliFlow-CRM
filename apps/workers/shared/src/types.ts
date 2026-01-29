/**
 * Shared Type Definitions
 *
 * Common types used across all workers.
 *
 * @module worker-shared/types
 * @task IFC-163
 */

import type { Job, Worker, Queue } from 'bullmq';

// ============================================================================
// Health Check Types
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: 'ok' | 'degraded' | 'error';
  latency?: number;
  message?: string;
  lastCheck?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  uptime: number;
  checks?: Record<string, ComponentHealth>;
}

export interface ReadinessResponse {
  ready: boolean;
  timestamp: string;
  checks: Record<string, ComponentHealth>;
}

export interface LivenessResponse {
  alive: boolean;
  timestamp: string;
  uptime: number;
}

export interface DetailedHealthResponse extends HealthResponse {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  queues: Record<
    string,
    {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    }
  >;
}

// ============================================================================
// Job Processing Types
// ============================================================================

export interface JobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  processingTimeMs: number;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

export interface JobContext {
  correlationId: string;
  tenantId?: string;
  userId?: string;
  startedAt: Date;
  attempt: number;
}

// ============================================================================
// Worker Lifecycle Types
// ============================================================================

export type WorkerState = 'starting' | 'running' | 'draining' | 'stopped' | 'error';

export interface WorkerStatus {
  name: string;
  state: WorkerState;
  startedAt?: Date;
  uptime?: number;
  processedJobs: number;
  failedJobs: number;
  activeJobs: number;
  queues: string[];
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface WorkerMetrics {
  jobsProcessed: number;
  jobsFailed: number;
  jobsActive: number;
  jobsWaiting: number;
  processingTimeMs: {
    p50: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  throughputPerMinute: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type WorkerEventType =
  | 'worker:starting'
  | 'worker:started'
  | 'worker:stopping'
  | 'worker:stopped'
  | 'worker:error'
  | 'job:started'
  | 'job:completed'
  | 'job:failed'
  | 'job:progress'
  | 'health:check'
  | 'circuit:open'
  | 'circuit:close'
  | 'circuit:half-open';

export interface WorkerEvent<T = unknown> {
  type: WorkerEventType;
  timestamp: Date;
  workerName: string;
  data?: T;
}

// ============================================================================
// Queue Connection Types
// ============================================================================

export interface QueueConnection {
  queue: Queue;
  worker: Worker;
  isConnected: boolean;
}

export interface ConnectionHealth {
  redis: ComponentHealth;
  queues: Record<string, ComponentHealth>;
}
