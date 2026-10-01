/**
 * Quota Repository Port
 *
 * Persistence for per-tenant quota overrides and usage counters, plus the live
 * counts that back the non-metered quota keys (contacts, seats, active workflows).
 */

import type { QuotaKey } from '@intelliflow/domain';

export interface TenantQuotaOverrideRecord {
  key: QuotaKey;
  /** null = unlimited */
  limit: number | null;
}

export interface QuotaRepositoryPort {
  /** Overrides configured for the tenant. Rows with an unknown key are skipped. */
  getOverrides(tenantId: string): Promise<TenantQuotaOverrideRecord[]>;

  /** Live count of contacts in the tenant. */
  countContacts(tenantId: string): Promise<number>;

  /** Live count of users (seats) in the tenant. */
  countUsers(tenantId: string): Promise<number>;

  /** Live count of active, non-deleted workflow definitions in the tenant. */
  countActiveWorkflows(tenantId: string): Promise<number>;

  /** Current counter value for (tenant, key, period); 0 when no row exists. */
  getCounter(tenantId: string, key: QuotaKey, period: string): Promise<number>;

  /** Atomically add `by` to the counter (creating it at 0 first); returns the new value. */
  incrementCounter(tenantId: string, key: QuotaKey, period: string, by: number): Promise<number>;

  /**
   * Atomically add `by` to the counter only if the result stays within `limit`
   * (insert-if-missing included). Returns the new value, or null when it would exceed the limit.
   */
  reserveCounter(
    tenantId: string,
    key: QuotaKey,
    period: string,
    by: number,
    limit: number
  ): Promise<number | null>;

  /** Subtract `by` from the counter, never going below 0 (compensation for a failed action). */
  decrementCounter(tenantId: string, key: QuotaKey, period: string, by: number): Promise<void>;

  /**
   * Run `fn` while holding a per-(tenant, key) exclusive lock, so a live-count check and the
   * create that follows it cannot interleave with another request for the same tenant and key.
   * The lock is released when `fn` settles.
   */
  runExclusive<T>(tenantId: string, key: QuotaKey, fn: () => Promise<T>): Promise<T>;
}
