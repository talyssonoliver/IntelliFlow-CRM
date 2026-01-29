import { createHash } from 'crypto';

/**
 * Idempotency Manager
 * Prevents duplicate calendar operations through idempotency keys
 *
 * @see IFC-138: Idempotency implementation for sync operations
 */

export interface IdempotencyRecord {
  key: string;
  operation: 'create' | 'update' | 'delete';
  appointmentId: string;
  externalEventId?: string;
  createdAt: Date;
  expiresAt: Date;
  result?: 'success' | 'failure';
  error?: string;
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

/**
 * Idempotency Manager
 * Manages idempotency keys for calendar sync operations
 */
export class IdempotencyManager {
  private readonly ttlMinutes: number;

  constructor(
    private readonly store: IdempotencyStore,
    options?: { ttlMinutes?: number }
  ) {
    this.ttlMinutes = options?.ttlMinutes ?? 60; // Default 1 hour
  }

  /**
   * Generate a deterministic idempotency key
   */
  generateKey(
    appointmentId: string,
    operation: 'create' | 'update' | 'delete',
    provider: string
  ): string {
    const data = `${appointmentId}:${operation}:${provider}`;
    const hash = createHash('sha256').update(data).digest('hex').substring(0, 16);
    return `idem_${hash}`;
  }

  /**
   * Generate idempotency key with content hash for update operations
   * Ensures updates only happen when content actually changes
   */
  generateContentKey(
    appointmentId: string,
    operation: 'create' | 'update' | 'delete',
    provider: string,
    contentHash: string
  ): string {
    const data = `${appointmentId}:${operation}:${provider}:${contentHash}`;
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
    appointmentId: string,
    operation: 'create' | 'update' | 'delete',
    externalEventId?: string
  ): Promise<void> {
    const now = new Date();
    await this.store.set({
      key,
      operation,
      appointmentId,
      externalEventId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMinutes * 60 * 1000),
      result: 'success',
    });
  }

  /**
   * Record failed operation (to prevent immediate retry)
   */
  async recordFailure(
    key: string,
    appointmentId: string,
    operation: 'create' | 'update' | 'delete',
    error: string
  ): Promise<void> {
    const now = new Date();
    // Shorter TTL for failures to allow retry after cooldown
    const failureTtlMinutes = Math.min(5, this.ttlMinutes);
    await this.store.set({
      key,
      operation,
      appointmentId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + failureTtlMinutes * 60 * 1000),
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
 * Calculate content hash for an appointment
 * Used to detect if appointment actually changed
 */
export function calculateAppointmentHash(appointment: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendeeIds: readonly string[];
}): string {
  const content = JSON.stringify({
    title: appointment.title,
    description: appointment.description || '',
    startTime: appointment.startTime.toISOString(),
    endTime: appointment.endTime.toISOString(),
    location: appointment.location || '',
    attendees: [...appointment.attendeeIds].sort(),
  });
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}
