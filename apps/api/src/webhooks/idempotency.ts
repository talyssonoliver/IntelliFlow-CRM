/**
 * Idempotency Middleware
 *
 * Ensures webhook events are processed exactly once:
 * - Deduplication by event ID
 * - Concurrent request handling
 * - Configurable TTL for idempotency keys
 *
 * KPI Target: Zero duplicate webhooks
 */

import { createHash } from 'crypto';

// Idempotency entry
export interface IdempotencyEntry {
  key: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  response?: unknown;
  error?: string;
  attempts: number;
  lockUntil?: Date;
}

// Idempotency store interface
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyEntry | null>;
  set(key: string, entry: IdempotencyEntry): Promise<void>;
  update(key: string, updates: Partial<IdempotencyEntry>): Promise<void>;
  delete(key: string): Promise<boolean>;
  acquire(key: string, lockDurationMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
  cleanup(maxAgeMs: number): Promise<number>;
}

// Idempotency configuration
export interface IdempotencyConfig {
  ttlMs: number;
  lockTimeoutMs: number;
  maxRetries: number;
  cleanupIntervalMs: number;
  keyPrefix: string;
}

// Default configuration
const DEFAULT_CONFIG: IdempotencyConfig = {
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  lockTimeoutMs: 30 * 1000, // 30 seconds
  maxRetries: 3,
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
  keyPrefix: 'idempotency:',
};

/**
 * In-memory idempotency store
 * For production, use Redis or database-backed store
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private entries: Map<string, IdempotencyEntry> = new Map();
  private locks: Map<string, Date> = new Map();

  async get(key: string): Promise<IdempotencyEntry | null> {
    return this.entries.get(key) || null;
  }

  async set(key: string, entry: IdempotencyEntry): Promise<void> {
    this.entries.set(key, entry);
  }

  async update(key: string, updates: Partial<IdempotencyEntry>): Promise<void> {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.set(key, { ...existing, ...updates });
    }
  }

  async delete(key: string): Promise<boolean> {
    this.locks.delete(key);
    return this.entries.delete(key);
  }

  async acquire(key: string, lockDurationMs: number): Promise<boolean> {
    const now = new Date();
    const existingLock = this.locks.get(key);

    if (existingLock && existingLock > now) {
      return false; // Lock is still held
    }

    this.locks.set(key, new Date(now.getTime() + lockDurationMs));
    return true;
  }

  async release(key: string): Promise<void> {
    this.locks.delete(key);
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.entries) {
      const age = now - entry.createdAt.getTime();
      if (age > maxAgeMs) {
        this.entries.delete(key);
        this.locks.delete(key);
        removed++;
      }
    }

    return removed;
  }

  // For testing
  clear(): void {
    this.entries.clear();
    this.locks.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

/**
 * Result of idempotency check
 */
export interface IdempotencyCheckResult {
  shouldProcess: boolean;
  isDuplicate: boolean;
  previousResult?: unknown;
  entry?: IdempotencyEntry;
  reason?: string;
}

/**
 * Idempotency middleware class
 */
export class IdempotencyMiddleware {
  private store: IdempotencyStore;
  private config: IdempotencyConfig;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    store?: IdempotencyStore,
    config?: Partial<IdempotencyConfig>
  ) {
    this.store = store || new InMemoryIdempotencyStore();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start cleanup timer
    if (this.config.cleanupIntervalMs > 0) {
      this.startCleanup();
    }
  }

  /**
   * Generate idempotency key from event data
   */
  generateKey(source: string, eventId: string, additionalData?: string): string {
    const data = `${source}:${eventId}${additionalData ? ':' + additionalData : ''}`;
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 32);
    return `${this.config.keyPrefix}${hash}`;
  }

  /**
   * Check if request should be processed
   */
  async check(key: string): Promise<IdempotencyCheckResult> {
    const entry = await this.store.get(key);

    if (!entry) {
      // New request
      return {
        shouldProcess: true,
        isDuplicate: false,
      };
    }

    // Check if entry has expired
    const age = Date.now() - entry.createdAt.getTime();
    if (age > this.config.ttlMs) {
      await this.store.delete(key);
      return {
        shouldProcess: true,
        isDuplicate: false,
        reason: 'Previous entry expired',
      };
    }

    // Check status
    switch (entry.status) {
      case 'completed':
        return {
          shouldProcess: false,
          isDuplicate: true,
          previousResult: entry.response,
          entry,
          reason: 'Already processed successfully',
        };

      case 'failed':
        // Allow retry if under max retries
        if (entry.attempts < this.config.maxRetries) {
          return {
            shouldProcess: true,
            isDuplicate: true,
            entry,
            reason: `Retry attempt ${entry.attempts + 1} of ${this.config.maxRetries}`,
          };
        }
        return {
          shouldProcess: false,
          isDuplicate: true,
          entry,
          reason: 'Max retries exceeded',
        };

      case 'processing':
        // Check if lock has expired
        if (entry.lockUntil && entry.lockUntil < new Date()) {
          // Lock expired, allow retry
          return {
            shouldProcess: true,
            isDuplicate: true,
            entry,
            reason: 'Previous processing timed out',
          };
        }
        return {
          shouldProcess: false,
          isDuplicate: true,
          entry,
          reason: 'Currently being processed',
        };

      default:
        return {
          shouldProcess: true,
          isDuplicate: false,
        };
    }
  }

  /**
   * Start processing - acquire lock
   */
  async startProcessing(key: string): Promise<boolean> {
    const acquired = await this.store.acquire(key, this.config.lockTimeoutMs);

    if (!acquired) {
      return false;
    }

    const existingEntry = await this.store.get(key);
    const now = new Date();

    const entry: IdempotencyEntry = {
      key,
      status: 'processing',
      createdAt: existingEntry?.createdAt || now,
      attempts: (existingEntry?.attempts || 0) + 1,
      lockUntil: new Date(now.getTime() + this.config.lockTimeoutMs),
    };

    await this.store.set(key, entry);
    return true;
  }

  /**
   * Mark processing as completed
   */
  async completeProcessing(key: string, response?: unknown): Promise<void> {
    await this.store.update(key, {
      status: 'completed',
      completedAt: new Date(),
      response,
      lockUntil: undefined,
    });
    await this.store.release(key);
  }

  /**
   * Mark processing as failed
   */
  async failProcessing(key: string, error: string): Promise<void> {
    await this.store.update(key, {
      status: 'failed',
      completedAt: new Date(),
      error,
      lockUntil: undefined,
    });
    await this.store.release(key);
  }

  /**
   * Wrap a handler with idempotency logic
   */
  wrap<TInput, TOutput>(
    keyGenerator: (input: TInput) => string,
    handler: (input: TInput) => Promise<TOutput>
  ): (input: TInput) => Promise<{ result: TOutput; fromCache: boolean } | { error: string; fromCache: boolean }> {
    return async (input: TInput) => {
      const key = keyGenerator(input);

      // Check idempotency
      const check = await this.check(key);

      if (!check.shouldProcess) {
        if (check.previousResult !== undefined) {
          return { result: check.previousResult as TOutput, fromCache: true };
        }
        return {
          error: check.reason || 'Duplicate request',
          fromCache: true,
        };
      }

      // Acquire lock
      const acquired = await this.startProcessing(key);
      if (!acquired) {
        return {
          error: 'Failed to acquire processing lock',
          fromCache: false,
        };
      }

      try {
        const result = await handler(input);
        await this.completeProcessing(key, result);
        return { result, fromCache: false };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.failProcessing(key, errorMessage);
        throw error;
      }
    };
  }

  /**
   * Express/Hono middleware-style wrapper
   */
  middleware() {
    return async (
      req: { body: unknown; headers: Record<string, string> },
      next: () => Promise<unknown>
    ): Promise<{ response?: unknown; status: number; headers?: Record<string, string> }> => {
      // Extract idempotency key from header or generate from body
      const idempotencyKey =
        req.headers['idempotency-key'] ||
        req.headers['x-idempotency-key'] ||
        createHash('sha256')
          .update(JSON.stringify(req.body))
          .digest('hex')
          .slice(0, 32);

      const key = `${this.config.keyPrefix}${idempotencyKey}`;

      // Check idempotency
      const check = await this.check(key);

      if (!check.shouldProcess && check.isDuplicate) {
        return {
          response: check.previousResult,
          status: 200,
          headers: {
            'x-idempotent-replayed': 'true',
          },
        };
      }

      // Acquire lock
      const acquired = await this.startProcessing(key);
      if (!acquired) {
        return {
          response: { error: 'Request is being processed' },
          status: 409,
        };
      }

      try {
        const response = await next();
        await this.completeProcessing(key, response);
        return { response, status: 200 };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.failProcessing(key, errorMessage);
        return {
          response: { error: errorMessage },
          status: 500,
        };
      }
    };
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        const removed = await this.store.cleanup(this.config.ttlMs);
        if (removed > 0) {
          console.log(`Idempotency cleanup: removed ${removed} expired entries`);
        }
      } catch (error) {
        console.error('Idempotency cleanup error:', error);
      }
    }, this.config.cleanupIntervalMs);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Manual cleanup
   */
  async cleanup(): Promise<number> {
    return this.store.cleanup(this.config.ttlMs);
  }

  /**
   * Get entry by key
   */
  async getEntry(key: string): Promise<IdempotencyEntry | null> {
    return this.store.get(key);
  }

  /**
   * Delete entry
   */
  async deleteEntry(key: string): Promise<boolean> {
    return this.store.delete(key);
  }
}

/**
 * Redis-backed idempotency store (interface for production use)
 */
export interface RedisIdempotencyStoreConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

// Export factory functions
export function createIdempotencyMiddleware(
  store?: IdempotencyStore,
  config?: Partial<IdempotencyConfig>
): IdempotencyMiddleware {
  return new IdempotencyMiddleware(store, config);
}

export function createInMemoryStore(): InMemoryIdempotencyStore {
  return new InMemoryIdempotencyStore();
}

/**
 * Helper to create idempotency key for webhook events
 */
export function createWebhookIdempotencyKey(
  source: string,
  eventId: string,
  eventType?: string
): string {
  const data = [source, eventId, eventType].filter(Boolean).join(':');
  return createHash('sha256').update(data).digest('hex').slice(0, 32);
}
