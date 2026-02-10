/**
 * Activity Feed Service
 * IFC-069: Unified Activity Feed Service
 *
 * Orchestrates fetching unified activity feeds across all CRM entities.
 * Uses repository port (not PrismaClient directly) per hexagonal architecture.
 *
 * Responsibilities:
 * - Cursor encoding/decoding
 * - Cache-aside pattern for hot feeds
 * - Deduplication of items across sources
 * - Delegation of parallel querying to repository adapter
 */

import type { ActivityFeedRepositoryPort } from '../ports/repositories/ActivityFeedRepositoryPort';
import type { CachePort } from '../ports/external/CachePort';
import type {
  ActivityFeedPage,
  ActivityFeedCursor,
  ActivityFeedFilters,
  ActivityFeedType,
  ActivityFeedSource,
  ActivityFeedEntityType,
} from '@intelliflow/domain';

/** Cache TTL for feed pages (30 seconds — feeds are near-real-time) */
const FEED_CACHE_TTL_SECONDS = 30;

export class ActivityFeedService {
  constructor(
    private readonly feedRepository: ActivityFeedRepositoryPort,
    private readonly cache: CachePort,
  ) {}

  /**
   * Get a paginated unified activity feed for a tenant.
   */
  async getUnifiedFeed(
    tenantId: string,
    limit: number,
    cursorStr: string | null | undefined,
    filters: {
      types?: ActivityFeedType[];
      sources?: ActivityFeedSource[];
      entityType?: ActivityFeedEntityType;
      entityId?: string;
      after?: Date;
      before?: Date;
    },
  ): Promise<ActivityFeedPage> {
    const cursor = cursorStr ? decodeCursor(cursorStr) : null;

    // Cache-aside: try cache first for first page with no filters
    const cacheKey = this.buildCacheKey(tenantId, cursor, filters);
    const isFirstPageNoFilters = !cursor && !filters.types?.length && !filters.sources?.length
      && !filters.entityType && !filters.entityId && !filters.after && !filters.before;

    if (isFirstPageNoFilters) {
      const cached = await this.cache.get<ActivityFeedPage>(cacheKey);
      if (cached) return cached;
    }

    // Fetch limit+1 to detect hasMore
    const items = await this.feedRepository.getUnifiedFeed(
      tenantId,
      limit + 1,
      cursor,
      filters as ActivityFeedFilters,
    );

    // Deduplicate by id (items from different sources could overlap)
    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const hasMore = deduped.length > limit;
    const pageItems = deduped.slice(0, limit);
    const lastItem = pageItems[pageItems.length - 1];

    const result: ActivityFeedPage = {
      items: pageItems,
      nextCursor: hasMore && lastItem ? encodeCursor({ timestamp: lastItem.timestamp, id: lastItem.id }) : null,
      hasMore,
    };

    // Cache first page
    if (isFirstPageNoFilters) {
      await this.cache.set(cacheKey, result, FEED_CACHE_TTL_SECONDS);
    }

    return result;
  }

  /**
   * Get activity feed for a specific entity.
   */
  async getEntityFeed(
    tenantId: string,
    entityType: ActivityFeedEntityType,
    entityId: string,
    limit: number,
    cursorStr: string | null | undefined,
    types?: ActivityFeedType[],
  ): Promise<ActivityFeedPage> {
    const cursor = cursorStr ? decodeCursor(cursorStr) : null;

    const items = await this.feedRepository.getEntityFeed(
      tenantId,
      entityType,
      entityId,
      limit + 1,
      cursor,
    );

    // Apply type filter if provided (entity feed may not filter at DB level)
    const filtered = types?.length
      ? items.filter((item) => types.includes(item.type))
      : items;

    const hasMore = filtered.length > limit;
    const pageItems = filtered.slice(0, limit);
    const lastItem = pageItems[pageItems.length - 1];

    return {
      items: pageItems,
      nextCursor: hasMore && lastItem ? encodeCursor({ timestamp: lastItem.timestamp, id: lastItem.id }) : null,
      hasMore,
    };
  }

  private buildCacheKey(
    tenantId: string,
    cursor: ActivityFeedCursor | null,
    filters: ActivityFeedFilters,
  ): string {
    const parts = [`activity-feed:${tenantId}`];
    if (cursor) parts.push(`c:${cursor.id}`);
    if (filters.types?.length) parts.push(`t:${filters.types.join(',')}`);
    if (filters.sources?.length) parts.push(`s:${filters.sources.join(',')}`);
    if (filters.entityType) parts.push(`et:${filters.entityType}`);
    if (filters.entityId) parts.push(`eid:${filters.entityId}`);
    return parts.join(':');
  }
}

/**
 * Encode a cursor as a base64 string.
 * Format: "timestamp_iso|id"
 */
function encodeCursor(cursor: ActivityFeedCursor): string {
  const raw = `${cursor.timestamp.toISOString()}|${cursor.id}`;
  return Buffer.from(raw).toString('base64');
}

/**
 * Decode a cursor from a base64 string.
 */
function decodeCursor(cursorStr: string): ActivityFeedCursor {
  try {
    const raw = Buffer.from(cursorStr, 'base64').toString('utf-8');
    const [timestampStr, id] = raw.split('|');
    if (!timestampStr || !id) throw new Error('Invalid cursor format');
    return { timestamp: new Date(timestampStr), id };
  } catch {
    throw new Error('Invalid activity feed cursor');
  }
}
