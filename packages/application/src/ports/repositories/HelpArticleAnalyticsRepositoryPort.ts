/**
 * Help Article Analytics Repository Port (IFC-304 PR A)
 *
 * Write-side contract for privacy-preserving help-article analytics.
 * Implementation lives in the adapters layer
 * (`PrismaHelpArticleAnalyticsRepository`).
 *
 * No user/session identity is accepted or stored. Writes are atomic (DB-side
 * increment) and idempotent when the caller supplies an `idempotencyKey`.
 */

export interface RecordArticleViewInput {
  tenantId: string;
  articleId: string;
  /** Event time; bucketed to the UTC day by the adapter. Defaults to now. */
  occurredAt?: Date;
  /** Opaque caller-supplied nonce for idempotent retries. */
  idempotencyKey?: string;
}

export interface RecordSearchNoResultInput {
  tenantId: string;
  /** Already-normalized term (see `normalizeSearchTerm`). Must be non-empty. */
  normalizedTerm: string;
  /** Event time; bucketed to the UTC day by the adapter. Defaults to now. */
  occurredAt?: Date;
  /** Opaque caller-supplied nonce for idempotent retries. */
  idempotencyKey?: string;
}

export interface RecordAnalyticsResult {
  /** True when the aggregate counter was incremented. */
  recorded: boolean;
  /** True when the write was skipped because the idempotency key was seen. */
  deduped: boolean;
}

export interface AnalyticsPurgeResult {
  viewDailyPurged: number;
  searchNoResultPurged: number;
  dedupPurged: number;
  totalPurged: number;
}

export interface HelpArticleAnalyticsRepository {
  /** Atomically (and, with a key, idempotently) record one article view. */
  recordArticleView(input: RecordArticleViewInput): Promise<RecordAnalyticsResult>;

  /** Atomically (and, with a key, idempotently) record one no-result search. */
  recordSearchNoResult(input: RecordSearchNoResultInput): Promise<RecordAnalyticsResult>;

  /** Total recorded views for an article in a tenant (verification/read helper). */
  getArticleViewTotal(tenantId: string, articleId: string): Promise<number>;

  /** Total no-result searches for a normalized term in a tenant. */
  getSearchNoResultTotal(tenantId: string, normalizedTerm: string): Promise<number>;

  /**
   * Purge expired dedup rows and out-of-retention aggregates, in batches.
   * @param now       reference time (defaults to now)
   * @param batchSize  rows deleted per batch (defaults to 100)
   */
  purgeExpired(now?: Date, batchSize?: number): Promise<AnalyticsPurgeResult>;
}
