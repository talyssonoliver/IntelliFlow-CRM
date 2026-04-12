/**
 * Job Idempotency Utility for Prediction Jobs (IFC-095)
 *
 * Prevents duplicate prediction job processing using idempotency keys.
 * Supports TTL-based expiration and pluggable storage backends.
 *
 * @module utils/job-idempotency
 */

import { createHash } from 'node:crypto';
import pino from 'pino';

const logger = pino({
  name: 'job-idempotency',
  level: process.env.LOG_LEVEL || 'info',
});

type IdempotencyStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface IdempotencyEntry {
  status: IdempotencyStatus;
  result?: unknown;
  createdAt: number;
  expiresAt: number;
}

/**
 * Interface for idempotency storage backends
 */
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyEntry | null>;
  set(key: string, entry: IdempotencyEntry): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * In-memory idempotency store for testing and development
 * Production should use Redis or similar distributed cache
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, IdempotencyEntry>();

  async get(key: string): Promise<IdempotencyEntry | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check TTL expiration
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, entry: IdempotencyEntry): Promise<void> {
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

interface IdempotencyConfig {
  ttlMs: number;
  keyPrefix: string;
}

const DEFAULT_CONFIG: IdempotencyConfig = {
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  keyPrefix: 'prediction-job:',
};

/**
 * Generate an idempotency key from job parameters
 *
 * Format: entityType:entityId:predictionType:hash
 * The hash includes the correlation ID to allow different executions
 */
export function generateIdempotencyKey(
  entityType: string,
  entityId: string,
  predictionType: string,
  correlationId?: string
): string {
  const components = [entityType, entityId, predictionType, correlationId || ''].join(':');
  const hash = createHash('sha256').update(components).digest('hex').slice(0, 16);
  return `${entityType}:${entityId}:${predictionType}:${hash}`;
}

/**
 * Prediction job idempotency handler
 *
 * Prevents duplicate processing by tracking job status with TTL
 */
export class PredictionJobIdempotency {
  private readonly store: IdempotencyStore;
  private readonly config: IdempotencyConfig;

  constructor(store: IdempotencyStore, config?: Partial<IdempotencyConfig>) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a job is a duplicate
   *
   * @returns null if new job, 'PROCESSING' if in progress, or cached result if completed
   */
  async checkDuplicate(key: string): Promise<unknown> {
    const entry = await this.store.get(this.config.keyPrefix + key);

    if (!entry) {
      return null;
    }

    if (entry.status === 'PROCESSING') {
      logger.debug({ key }, 'Job is currently processing');
      return 'PROCESSING';
    }

    if (entry.status === 'COMPLETED' && entry.result) {
      logger.info({ key }, 'Returning cached result for duplicate job');
      return entry.result;
    }

    return null;
  }

  /**
   * Mark a job as currently processing
   */
  async markProcessing(key: string): Promise<void> {
    const now = Date.now();
    await this.store.set(this.config.keyPrefix + key, {
      status: 'PROCESSING',
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
    });
    logger.debug({ key }, 'Job marked as processing');
  }

  /**
   * Store the result of a completed job
   */
  async storeResult(key: string, result: unknown): Promise<void> {
    const now = Date.now();
    await this.store.set(this.config.keyPrefix + key, {
      status: 'COMPLETED',
      result,
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
    });
    logger.debug({ key }, 'Job result stored');
  }

  /**
   * Remove a failed job from the store (allow retry)
   */
  async markFailed(key: string): Promise<void> {
    await this.store.delete(this.config.keyPrefix + key);
    logger.debug({ key }, 'Failed job entry removed');
  }
}
