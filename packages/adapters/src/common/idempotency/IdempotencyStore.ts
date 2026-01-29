/**
 * Idempotency Store Interface and Implementations
 * Provides storage abstraction for idempotency records
 *
 * Extracted from calendar/shared/IdempotencyManager.ts for reuse
 */

export interface IdempotencyRecord {
  key: string;
  operation: string;
  resourceId: string;
  externalId?: string;
  createdAt: Date;
  expiresAt: Date;
  result?: 'success' | 'failure';
  error?: string;
  data?: unknown;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(record: IdempotencyRecord): Promise<void>;
  delete(key: string): Promise<void>;
  cleanup(expiredBefore: Date): Promise<number>;
}

/**
 * In-memory idempotency store for development/testing
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(key);
    if (!record) return null;

    // Check expiration
    if (record.expiresAt < new Date()) {
      this.records.delete(key);
      return null;
    }

    return record;
  }

  async set(record: IdempotencyRecord): Promise<void> {
    this.records.set(record.key, record);
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  async cleanup(expiredBefore: Date): Promise<number> {
    let count = 0;
    for (const [key, record] of this.records) {
      if (record.expiresAt < expiredBefore) {
        this.records.delete(key);
        count++;
      }
    }
    return count;
  }

  // For testing
  clear(): void {
    this.records.clear();
  }

  size(): number {
    return this.records.size;
  }
}
