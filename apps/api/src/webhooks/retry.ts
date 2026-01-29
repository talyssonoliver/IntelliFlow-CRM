/**
 * Webhook Retry Logic
 *
 * Handles retry mechanisms for failed webhook processing:
 * - Exponential backoff with jitter
 * - Dead letter queue integration
 * - Retry budgets
 * - Circuit breaker pattern
 */

import { createHash } from 'crypto';
import { z } from 'zod';

// Retry entry schema
export const RetryEntrySchema = z.object({
  id: z.string(),
  source: z.string(),
  eventId: z.string(),
  eventType: z.string(),
  payload: z.unknown(),
  attempts: z.number().default(0),
  maxAttempts: z.number(),
  lastAttemptAt: z.date().optional(),
  nextAttemptAt: z.date(),
  createdAt: z.date(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'dead_letter']),
});

export type RetryEntry = z.infer<typeof RetryEntrySchema>;

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableErrors: string[];
  deadLetterThreshold: number;
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 300000, // 5 minutes
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  retryableErrors: [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'NETWORK_ERROR',
    'SERVICE_UNAVAILABLE',
    'INTERNAL_ERROR',
    'RATE_LIMITED',
  ],
  deadLetterThreshold: 5,
};

// Retry queue interface
export interface RetryQueue {
  enqueue(entry: RetryEntry): Promise<void>;
  dequeue(count?: number): Promise<RetryEntry[]>;
  peek(count?: number): Promise<RetryEntry[]>;
  update(id: string, updates: Partial<RetryEntry>): Promise<void>;
  remove(id: string): Promise<boolean>;
  moveToDeadLetter(id: string): Promise<void>;
  getDeadLetterEntries(count?: number): Promise<RetryEntry[]>;
  reprocessDeadLetter(id: string): Promise<boolean>;
  getStats(): Promise<RetryQueueStats>;
  clear(): Promise<void>;
}

// Queue statistics
export interface RetryQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  oldestPendingAt?: Date;
  newestPendingAt?: Date;
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential backoff
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (randomization to prevent thundering herd)
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;

  return Math.max(config.baseDelayMs, Math.floor(cappedDelay + jitter));
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(
  error: Error | string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorCode = typeof error === 'string' ? error : (error as { code?: string }).code;

  return config.retryableErrors.some(
    retryable =>
      errorMessage.includes(retryable) ||
      errorCode === retryable ||
      errorMessage.toUpperCase().includes(retryable)
  );
}

/**
 * In-memory retry queue implementation
 */
export class InMemoryRetryQueue implements RetryQueue {
  private entries: Map<string, RetryEntry> = new Map();
  private deadLetter: Map<string, RetryEntry> = new Map();

  async enqueue(entry: RetryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async dequeue(count = 10): Promise<RetryEntry[]> {
    const now = new Date();
    const ready: RetryEntry[] = [];

    for (const [id, entry] of this.entries) {
      if (entry.status === 'pending' && entry.nextAttemptAt <= now) {
        entry.status = 'processing';
        ready.push(entry);
        if (ready.length >= count) break;
      }
    }

    return ready;
  }

  async peek(count = 10): Promise<RetryEntry[]> {
    const now = new Date();
    const ready: RetryEntry[] = [];

    for (const entry of this.entries.values()) {
      if (entry.status === 'pending' && entry.nextAttemptAt <= now) {
        ready.push(entry);
        if (ready.length >= count) break;
      }
    }

    return ready;
  }

  async update(id: string, updates: Partial<RetryEntry>): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      Object.assign(entry, updates);
    }
  }

  async remove(id: string): Promise<boolean> {
    return this.entries.delete(id);
  }

  async moveToDeadLetter(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.status = 'dead_letter';
      this.deadLetter.set(id, entry);
      this.entries.delete(id);
    }
  }

  async getDeadLetterEntries(count = 100): Promise<RetryEntry[]> {
    const entries: RetryEntry[] = [];
    for (const entry of this.deadLetter.values()) {
      entries.push(entry);
      if (entries.length >= count) break;
    }
    return entries;
  }

  async reprocessDeadLetter(id: string): Promise<boolean> {
    const entry = this.deadLetter.get(id);
    if (entry) {
      entry.status = 'pending';
      entry.attempts = 0;
      entry.nextAttemptAt = new Date();
      this.entries.set(id, entry);
      this.deadLetter.delete(id);
      return true;
    }
    return false;
  }

  async getStats(): Promise<RetryQueueStats> {
    const stats: RetryQueueStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      deadLetter: this.deadLetter.size,
    };

    let oldest: Date | undefined;
    let newest: Date | undefined;

    for (const entry of this.entries.values()) {
      switch (entry.status) {
        case 'pending':
          stats.pending++;
          if (!oldest || entry.createdAt < oldest) oldest = entry.createdAt;
          if (!newest || entry.createdAt > newest) newest = entry.createdAt;
          break;
        case 'processing':
          stats.processing++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'failed':
          stats.failed++;
          break;
      }
    }

    stats.oldestPendingAt = oldest;
    stats.newestPendingAt = newest;

    return stats;
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.deadLetter.clear();
  }

  // For testing
  size(): number {
    return this.entries.size;
  }

  deadLetterSize(): number {
    return this.deadLetter.size;
  }
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half_open';
  failures: number;
  successes: number;
  lastFailureAt?: Date;
  lastSuccessAt?: Date;
  openedAt?: Date;
  nextRetryAt?: Date;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  openDurationMs: number;
  halfOpenMaxRequests: number;
}

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  openDurationMs: 60000, // 1 minute
  halfOpenMaxRequests: 3,
};

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;
  private halfOpenRequests = 0;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.state = {
      status: 'closed',
      failures: 0,
      successes: 0,
    };
  }

  /**
   * Check if request is allowed
   */
  canRequest(): boolean {
    this.updateState();

    switch (this.state.status) {
      case 'closed':
        return true;

      case 'open':
        return false;

      case 'half_open':
        return this.halfOpenRequests < this.config.halfOpenMaxRequests;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.state.lastSuccessAt = new Date();

    switch (this.state.status) {
      case 'closed':
        this.state.failures = 0;
        break;

      case 'half_open':
        this.state.successes++;
        this.halfOpenRequests--;
        if (this.state.successes >= this.config.successThreshold) {
          this.close();
        }
        break;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.state.lastFailureAt = new Date();
    this.state.failures++;

    switch (this.state.status) {
      case 'closed':
        if (this.state.failures >= this.config.failureThreshold) {
          this.open();
        }
        break;

      case 'half_open':
        this.halfOpenRequests--;
        this.open();
        break;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    this.updateState();
    return { ...this.state };
  }

  /**
   * Force circuit to close
   */
  forceClose(): void {
    this.close();
  }

  /**
   * Force circuit to open
   */
  forceOpen(durationMs?: number): void {
    this.open();
    if (durationMs) {
      this.state.nextRetryAt = new Date(Date.now() + durationMs);
    }
  }

  private updateState(): void {
    if (this.state.status === 'open' && this.state.nextRetryAt) {
      if (new Date() >= this.state.nextRetryAt) {
        this.halfOpen();
      }
    }
  }

  private open(): void {
    this.state.status = 'open';
    this.state.openedAt = new Date();
    this.state.nextRetryAt = new Date(Date.now() + this.config.openDurationMs);
    this.state.successes = 0;
    console.warn('Circuit breaker opened');
  }

  private halfOpen(): void {
    this.state.status = 'half_open';
    this.state.successes = 0;
    this.halfOpenRequests = 0;
    console.info('Circuit breaker half-open');
  }

  private close(): void {
    this.state.status = 'closed';
    this.state.failures = 0;
    this.state.successes = 0;
    this.state.openedAt = undefined;
    this.state.nextRetryAt = undefined;
    this.halfOpenRequests = 0;
    console.info('Circuit breaker closed');
  }
}

/**
 * Retry handler options
 */
export interface RetryHandlerOptions<T> {
  handler: (entry: RetryEntry) => Promise<T>;
  onSuccess?: (entry: RetryEntry, result: T) => void;
  onFailure?: (entry: RetryEntry, error: Error) => void;
  onDeadLetter?: (entry: RetryEntry) => void;
}

/**
 * Retry manager class
 */
export class RetryManager {
  private queue: RetryQueue;
  private config: RetryConfig;
  private circuitBreaker?: CircuitBreaker;
  private isProcessing = false;
  private processingInterval?: ReturnType<typeof setInterval>;

  constructor(
    queue?: RetryQueue,
    config?: Partial<RetryConfig>,
    circuitBreaker?: CircuitBreaker
  ) {
    this.queue = queue || new InMemoryRetryQueue();
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Schedule a webhook for retry
   */
  async scheduleRetry(
    source: string,
    eventId: string,
    eventType: string,
    payload: unknown,
    error?: string,
    existingAttempts = 0
  ): Promise<RetryEntry> {
    const attempts = existingAttempts;
    const delay = calculateRetryDelay(attempts, this.config);

    const entry: RetryEntry = {
      id: createHash('sha256')
        .update(`${source}:${eventId}:${Date.now()}`)
        .digest('hex')
        .slice(0, 16),
      source,
      eventId,
      eventType,
      payload,
      attempts,
      maxAttempts: this.config.maxAttempts,
      createdAt: new Date(),
      nextAttemptAt: new Date(Date.now() + delay),
      error,
      status: 'pending',
    };

    await this.queue.enqueue(entry);
    return entry;
  }

  /**
   * Process a single retry entry
   */
  async processEntry<T>(
    entry: RetryEntry,
    options: RetryHandlerOptions<T>
  ): Promise<{ success: boolean; result?: T; error?: Error }> {
    // Check circuit breaker
    if (this.circuitBreaker && !this.circuitBreaker.canRequest()) {
      return {
        success: false,
        error: new Error('Circuit breaker is open'),
      };
    }

    try {
      const result = await options.handler(entry);

      // Update entry as completed
      await this.queue.update(entry.id, {
        status: 'completed',
        lastAttemptAt: new Date(),
        attempts: entry.attempts + 1,
      });

      // Record success with circuit breaker
      this.circuitBreaker?.recordSuccess();

      // Callback
      options.onSuccess?.(entry, result);

      return { success: true, result };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Record failure with circuit breaker
      this.circuitBreaker?.recordFailure();

      // Update attempt count
      const attempts = entry.attempts + 1;

      if (attempts >= this.config.maxAttempts) {
        // Move to dead letter
        await this.queue.moveToDeadLetter(entry.id);
        options.onDeadLetter?.(entry);
      } else if (isRetryableError(err, this.config)) {
        // Schedule next retry
        const delay = calculateRetryDelay(attempts, this.config);
        await this.queue.update(entry.id, {
          status: 'pending',
          attempts,
          lastAttemptAt: new Date(),
          nextAttemptAt: new Date(Date.now() + delay),
          error: err.message,
        });
      } else {
        // Non-retryable error - move to dead letter
        await this.queue.moveToDeadLetter(entry.id);
        options.onDeadLetter?.(entry);
      }

      // Callback
      options.onFailure?.(entry, err);

      return { success: false, error: err };
    }
  }

  /**
   * Process pending retries
   */
  async processPending<T>(
    options: RetryHandlerOptions<T>,
    batchSize = 10
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const entries = await this.queue.dequeue(batchSize);

    let succeeded = 0;
    let failed = 0;

    for (const entry of entries) {
      const result = await this.processEntry(entry, options);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    return {
      processed: entries.length,
      succeeded,
      failed,
    };
  }

  /**
   * Start automatic retry processing
   */
  startProcessing<T>(
    options: RetryHandlerOptions<T>,
    intervalMs = 5000,
    batchSize = 10
  ): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processingInterval = setInterval(async () => {
      try {
        await this.processPending(options, batchSize);
      } catch (error) {
        console.error('Retry processing error:', error);
      }
    }, intervalMs);

    // Don't prevent process exit
    if (this.processingInterval.unref) {
      this.processingInterval.unref();
    }
  }

  /**
   * Stop automatic retry processing
   */
  stopProcessing(): void {
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<RetryQueueStats> {
    return this.queue.getStats();
  }

  /**
   * Get dead letter entries
   */
  async getDeadLetterEntries(count?: number): Promise<RetryEntry[]> {
    return this.queue.getDeadLetterEntries(count);
  }

  /**
   * Reprocess a dead letter entry
   */
  async reprocessDeadLetter(id: string): Promise<boolean> {
    return this.queue.reprocessDeadLetter(id);
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState | null {
    return this.circuitBreaker?.getState() || null;
  }
}

// Export factory functions
export function createRetryManager(
  queue?: RetryQueue,
  config?: Partial<RetryConfig>,
  useCircuitBreaker = true
): RetryManager {
  const circuitBreaker = useCircuitBreaker ? new CircuitBreaker() : undefined;
  return new RetryManager(queue, config, circuitBreaker);
}

export function createInMemoryRetryQueue(): InMemoryRetryQueue {
  return new InMemoryRetryQueue();
}

export function createCircuitBreaker(
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return new CircuitBreaker(config);
}
