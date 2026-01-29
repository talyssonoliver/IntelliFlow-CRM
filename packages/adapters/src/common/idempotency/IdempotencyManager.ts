import { createHash } from 'crypto';
import { IdempotencyStore, IdempotencyRecord } from './IdempotencyStore';

/**
 * Idempotency Manager
 * Prevents duplicate operations through idempotency keys
 *
 * Extracted from calendar/shared/IdempotencyManager.ts and generalized
 * @see IFC-138: Idempotency implementation for sync operations
 */

export interface IdempotencyConfig {
  /** Time-to-live for success records in minutes */
  ttlMinutes: number;
  /** Time-to-live for failure records in minutes (shorter for retry) */
  failureTtlMinutes: number;
}

export const DEFAULT_IDEMPOTENCY_CONFIG: IdempotencyConfig = {
  ttlMinutes: 60, // 1 hour
  failureTtlMinutes: 5, // 5 minutes for failures
};

/**
 * Generic Idempotency Manager for adapter operations
 */
export class IdempotencyManager {
  private readonly config: IdempotencyConfig;

  constructor(
    private readonly store: IdempotencyStore,
    private readonly provider: string,
    config: Partial<IdempotencyConfig> = {}
  ) {
    this.config = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };
  }

  /**
   * Generate a deterministic idempotency key
   */
  generateKey(resourceId: string, operation: string): string {
    const data = `${resourceId}:${operation}:${this.provider}`;
    const hash = createHash('sha256').update(data).digest('hex').substring(0, 16);
    return `idem_${hash}`;
  }

  /**
   * Generate idempotency key with content hash
   * Ensures updates only happen when content actually changes
   */
  generateContentKey(
    resourceId: string,
    operation: string,
    contentHash: string
  ): string {
    const data = `${resourceId}:${operation}:${this.provider}:${contentHash}`;
    const hash = createHash('sha256').update(data).digest('hex').substring(0, 16);
    return `idem_${hash}`;
  }

  /**
   * Check if operation was already processed
   */
  async checkDuplicate(key: string): Promise<{
    isDuplicate: boolean;
    previousResult?: IdempotencyRecord;
  }> {
    const existing = await this.store.get(key);
    if (existing) {
      return {
        isDuplicate: true,
        previousResult: existing,
      };
    }
    return { isDuplicate: false };
  }

  /**
   * Record successful operation
   */
  async recordSuccess(
    key: string,
    resourceId: string,
    operation: string,
    options?: {
      externalId?: string;
      data?: unknown;
    }
  ): Promise<void> {
    const now = new Date();
    await this.store.set({
      key,
      operation,
      resourceId,
      externalId: options?.externalId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.ttlMinutes * 60 * 1000),
      result: 'success',
      data: options?.data,
    });
  }

  /**
   * Record failed operation (to prevent immediate retry)
   */
  async recordFailure(
    key: string,
    resourceId: string,
    operation: string,
    error: string
  ): Promise<void> {
    const now = new Date();
    await this.store.set({
      key,
      operation,
      resourceId,
      createdAt: now,
      expiresAt: new Date(
        now.getTime() + this.config.failureTtlMinutes * 60 * 1000
      ),
      result: 'failure',
      error,
    });
  }

  /**
   * Clear idempotency record (for retry after failure resolution)
   */
  async clearRecord(key: string): Promise<void> {
    await this.store.delete(key);
  }

  /**
   * Cleanup expired records
   */
  async cleanup(): Promise<number> {
    return this.store.cleanup(new Date());
  }
}

/**
 * Calculate content hash for any object
 * Used to detect if content actually changed
 */
export function calculateContentHash(content: Record<string, unknown>): string {
  const normalized = JSON.stringify(content, Object.keys(content).sort());
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}
