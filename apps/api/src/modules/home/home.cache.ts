import type { CachePort, EventBusPort } from '@intelliflow/application';
import type { DomainEvent } from '@intelliflow/domain';

/**
 * Home page response cache (IFC-196)
 *
 * Read-through cache over `home.getWelcomeSummary` with domain-event driven
 * invalidation. Cache key is keyed by userId only — tenant scoping is enforced
 * by the underlying Prisma-with-tenant queries, and userIds are globally
 * unique, so tenantId in the key would be redundant. Domain events expose
 * `ownerId` / `changedBy` / `completedBy` / etc. (user-UUID fields) but do not
 * carry tenantId, which drove this simplification from the original spec.
 */

export const HOME_SUMMARY_TTL_SECONDS = 300;
export const HOME_SUMMARY_KEY_PREFIX = 'home:summary';

export function buildHomeSummaryKey(userId: string): string {
  return `${HOME_SUMMARY_KEY_PREFIX}:${userId}`;
}

export interface HomeCacheMetrics {
  hits: number;
  misses: number;
  errors: number;
  invalidations: number;
}

export interface HomeCacheServiceOptions {
  disabled?: boolean;
  ttlSeconds?: number;
  onLog?: (level: 'warn' | 'info', msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Event types the cache subscribes to. Each entry maps the event type string
 * to a payload extractor that returns the affected userId(s). `null` means
 * the event is malformed and must be skipped silently.
 */
type UserIdExtractor = (event: DomainEvent) => readonly string[] | null;

const EVENT_SUBSCRIPTIONS: ReadonlyArray<readonly [string, UserIdExtractor]> = [
  // Lead events
  ['lead.created', (e) => extractUserIds(e, ['ownerId'])],
  ['lead.scored', (e) => extractUserIds(e, ['ownerId'])],
  ['lead.status_changed', (e) => extractUserIds(e, ['ownerId', 'changedBy'])],
  ['lead.qualified', (e) => extractUserIds(e, ['ownerId', 'qualifiedBy'])],
  ['lead.converted', (e) => extractUserIds(e, ['ownerId', 'convertedBy'])],

  // Opportunity events
  ['opportunity.created', (e) => extractUserIds(e, ['ownerId'])],
  ['opportunity.stage_changed', (e) => extractUserIds(e, ['ownerId', 'changedBy'])],
  ['opportunity.won', (e) => extractUserIds(e, ['ownerId', 'closedBy'])],
  ['opportunity.lost', (e) => extractUserIds(e, ['ownerId', 'closedBy'])],
  ['opportunity.reopened', (e) => extractUserIds(e, ['ownerId', 'reopenedBy'])],
  ['deal.won.enriched', (e) => extractUserIds(e, ['ownerId', 'closedBy'])],

  // Task events
  ['task.created', (e) => extractUserIds(e, ['ownerId'])],
  ['task.status_changed', (e) => extractUserIds(e, ['ownerId', 'changedBy'])],
  ['task.completed', (e) => extractUserIds(e, ['ownerId', 'completedBy'])],
  ['task.cancelled', (e) => extractUserIds(e, ['ownerId', 'cancelledBy'])],
  ['task.priority_changed', (e) => extractUserIds(e, ['ownerId', 'changedBy'])],
  ['task.due_date_changed', (e) => extractUserIds(e, ['ownerId', 'changedBy'])],
  ['task.updated', (e) => extractUserIds(e, ['ownerId', 'updatedBy'])],
  ['task.deleted', (e) => extractUserIds(e, ['ownerId', 'deletedBy'])],
  ['task.assigned', (e) => extractUserIds(e, ['assigneeId', 'previousAssigneeId', 'assignedBy'])],
  ['task.linked_to_entity', (e) => extractUserIds(e, ['linkedBy'])],
];

export const HOME_CACHE_SUBSCRIBED_EVENT_TYPES: readonly string[] = EVENT_SUBSCRIPTIONS.map(
  ([eventType]) => eventType
);

function extractUserIds(event: DomainEvent, fields: readonly string[]): readonly string[] | null {
  const ids: string[] = [];
  const record = event as unknown as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.length > 0) {
      ids.push(value);
    }
  }
  return ids.length > 0 ? Array.from(new Set(ids)) : null;
}

export class HomeCacheService {
  private readonly metrics: HomeCacheMetrics = {
    hits: 0,
    misses: 0,
    errors: 0,
    invalidations: 0,
  };
  private readonly ttlSeconds: number;
  private readonly disabled: boolean;
  private registered = false;

  constructor(
    private readonly cache: CachePort,
    private readonly eventBus: EventBusPort,
    private readonly opts: HomeCacheServiceOptions = {}
  ) {
    this.ttlSeconds = opts.ttlSeconds ?? HOME_SUMMARY_TTL_SECONDS;
    this.disabled = opts.disabled ?? process.env.DISABLE_HOME_CACHE === '1';
  }

  getMetrics(): Readonly<HomeCacheMetrics> {
    return { ...this.metrics };
  }

  isEnabled(): boolean {
    return !this.disabled;
  }

  async getWelcomeSummary<T>(
    _tenantId: string,
    userId: string,
    compute: () => Promise<T>
  ): Promise<T> {
    if (this.disabled) {
      return compute();
    }

    const key = buildHomeSummaryKey(userId);

    try {
      const cached = await this.cache.get<T>(key);
      if (cached !== null && cached !== undefined) {
        this.metrics.hits += 1;
        return cached;
      }
    } catch (err) {
      this.metrics.errors += 1;
      this.opts.onLog?.('warn', '[home.cache] cache.get threw', { key, err });
    }

    this.metrics.misses += 1;
    const value = await compute();

    try {
      await this.cache.set(key, value, this.ttlSeconds);
    } catch (err) {
      this.metrics.errors += 1;
      this.opts.onLog?.('warn', '[home.cache] cache.set threw', { key, err });
    }

    return value;
  }

  async invalidate(userId: string): Promise<void> {
    try {
      await this.cache.delete(buildHomeSummaryKey(userId));
      this.metrics.invalidations += 1;
    } catch (err) {
      this.metrics.errors += 1;
      this.opts.onLog?.('warn', '[home.cache] cache.delete threw', { userId, err });
    }
  }

  /**
   * Wire subscriptions so mutation events drop cached summaries.
   * Idempotent: calling twice does NOT double-subscribe.
   */
  async registerInvalidationHandlers(): Promise<void> {
    if (this.registered) return;
    this.registered = true;

    for (const [eventType, extractor] of EVENT_SUBSCRIPTIONS) {
      await this.eventBus.subscribe(eventType, async (event: DomainEvent) => {
        const userIds = extractor(event);
        if (!userIds) return;
        await Promise.all(userIds.map((id) => this.invalidate(id)));
      });
    }
  }

  /** Test-only: reset idempotency guard so a fresh bus can be attached. */
  _resetForTest(): void {
    this.registered = false;
    this.metrics.hits = 0;
    this.metrics.misses = 0;
    this.metrics.errors = 0;
    this.metrics.invalidations = 0;
  }
}
