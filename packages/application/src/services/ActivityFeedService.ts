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
  ActivityFeedTimeWindow,
  ActivityFeedStats,
  UnifiedActivityItem,
} from '@intelliflow/domain';

/** Cache TTL for feed pages (30 seconds — feeds are near-real-time) */
const FEED_CACHE_TTL_SECONDS = 30;

/** Cache TTL for stats (60 seconds — stats are less volatile) */
const STATS_CACHE_TTL_SECONDS = 60;

export class ActivityFeedService {
  constructor(
    private readonly feedRepository: ActivityFeedRepositoryPort,
    private readonly cache: CachePort
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
    }
  ): Promise<ActivityFeedPage> {
    const cursor = cursorStr ? decodeCursor(cursorStr) : null;

    // Cache-aside: try cache first for first page with no filters
    const cacheKey = this.buildCacheKey(tenantId, limit, cursor, filters);
    const isFirstPageNoFilters =
      !cursor &&
      !filters.types?.length &&
      !filters.sources?.length &&
      !filters.entityType &&
      !filters.entityId &&
      !filters.after &&
      !filters.before;

    if (isFirstPageNoFilters) {
      const cached = await this.cache.get<ActivityFeedPage>(cacheKey);
      if (cached) return cached;
    }

    // Fetch limit+1 to detect hasMore
    const items = await this.feedRepository.getUnifiedFeed(
      tenantId,
      limit + 1,
      cursor,
      filters as ActivityFeedFilters
    );

    // Deduplicate by id AND by content — different source tables can
    // surface the same real-world event with different IDs.
    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      if (seen.has(item.id)) return false;
      // Content-based dedup: same title+description within same minute
      const contentKey = `${item.title}|${item.description}|${Math.floor(new Date(item.timestamp).getTime() / 60000)}`;
      if (seen.has(contentKey)) return false;
      seen.add(item.id);
      seen.add(contentKey);
      return true;
    });

    const hasMore = deduped.length > limit;
    const pageItems = deduped.slice(0, limit);
    const lastItem = pageItems.at(-1);

    const result: ActivityFeedPage = {
      items: pageItems,
      nextCursor:
        hasMore && lastItem
          ? encodeCursor({ timestamp: lastItem.timestamp, id: lastItem.id })
          : null,
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
    types?: ActivityFeedType[]
  ): Promise<ActivityFeedPage> {
    const cursor = cursorStr ? decodeCursor(cursorStr) : null;

    const items = await this.feedRepository.getEntityFeed(
      tenantId,
      entityType,
      entityId,
      limit + 1,
      cursor
    );

    // Deduplicate by id and content (same pattern as unified feed)
    const seen = new Set<string>();
    const dedupedItems = items.filter((item) => {
      if (seen.has(item.id)) return false;
      const contentKey = `${item.title}|${item.description}|${Math.floor(new Date(item.timestamp).getTime() / 60000)}`;
      if (seen.has(contentKey)) return false;
      seen.add(item.id);
      seen.add(contentKey);
      return true;
    });

    // Apply type filter if provided (entity feed may not filter at DB level)
    const filtered = types?.length
      ? dedupedItems.filter((item) => types.includes(item.type))
      : dedupedItems;

    const hasMore = filtered.length > limit;
    const pageItems = filtered.slice(0, limit);
    const lastItem = pageItems.at(-1);

    return {
      items: pageItems,
      nextCursor:
        hasMore && lastItem
          ? encodeCursor({ timestamp: lastItem.timestamp, id: lastItem.id })
          : null,
      hasMore,
    };
  }

  /**
   * Get aggregate stats from the activity feed.
   * IFC-202: Counts by type, source, and entity type over configurable time windows.
   */
  async getStats(
    tenantId: string,
    timeWindow: ActivityFeedTimeWindow,
    filters?: { sources?: ActivityFeedSource[]; entityType?: ActivityFeedEntityType }
  ) {
    const windowEnd = new Date();
    const windowStart = resolveWindowStart(timeWindow, windowEnd);

    // Cache-aside with 60s TTL (stats are less real-time than feed)
    const filterHash = filters
      ? `${(filters.sources || []).join(',')}:${filters.entityType || ''}`
      : '';
    const cacheKey = `activity-stats:${tenantId}:${timeWindow}:${filterHash}`;
    const cached = await this.cache.get<
      {
        timeWindow: ActivityFeedTimeWindow;
        windowStart: Date | null;
        windowEnd: Date;
      } & ActivityFeedStats
    >(cacheKey);
    if (cached) return cached;

    const stats = await this.feedRepository.getStats(
      tenantId,
      windowStart,
      windowEnd,
      filters ?? {}
    );

    const result = {
      timeWindow,
      windowStart,
      windowEnd,
      ...stats,
    };

    await this.cache.set(cacheKey, result, STATS_CACHE_TTL_SECONDS);
    return result;
  }

  /**
   * Search activities across all sources using text matching.
   * IFC-203: Full-text search with ILIKE across titles, descriptions, and actor names.
   * No caching — search results are always fresh.
   */
  async search(
    tenantId: string,
    query: string,
    limit: number,
    cursorStr: string | null | undefined,
    filters: {
      types?: ActivityFeedType[];
      sources?: ActivityFeedSource[];
      entityType?: ActivityFeedEntityType;
    }
  ): Promise<ActivityFeedPage> {
    const cursor = cursorStr ? decodeCursor(cursorStr) : null;

    const items = await this.feedRepository.searchFeed(tenantId, query, limit + 1, cursor, filters);

    // Deduplicate by ID and content (same event from different source tables)
    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      if (seen.has(item.id)) return false;
      const contentKey = `${item.title}|${item.description}|${Math.floor(new Date(item.timestamp).getTime() / 60000)}`;
      if (seen.has(contentKey)) return false;
      seen.add(item.id);
      seen.add(contentKey);
      return true;
    });

    // Relevance boost: within same-second groups, title matches come first
    const boosted = boostTitleMatches(deduped, query);

    const hasMore = boosted.length > limit;
    const pageItems = boosted.slice(0, limit);
    const lastItem = pageItems.at(-1);

    return {
      items: pageItems,
      nextCursor:
        hasMore && lastItem
          ? encodeCursor({ timestamp: lastItem.timestamp, id: lastItem.id })
          : null,
      hasMore,
    };
  }

  private buildCacheKey(
    tenantId: string,
    limit: number,
    cursor: ActivityFeedCursor | null,
    filters: ActivityFeedFilters
  ): string {
    const parts = [`activity-feed:${tenantId}`, `l:${limit}`];
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

/**
 * Resolve a time window enum to a start Date (or null for 'all').
 * Server-side date math — clients send only the window name.
 */
function resolveWindowStart(timeWindow: ActivityFeedTimeWindow, windowEnd: Date): Date | null {
  const MS_PER_HOUR = 3600_000;
  const MS_PER_DAY = 24 * MS_PER_HOUR;

  switch (timeWindow) {
    case '24h':
      return new Date(windowEnd.getTime() - MS_PER_DAY);
    case '7d':
      return new Date(windowEnd.getTime() - 7 * MS_PER_DAY);
    case '30d':
      return new Date(windowEnd.getTime() - 30 * MS_PER_DAY);
    case 'all':
      return null;
  }
}

/**
 * Boost title matches within same-second timestamp groups.
 * Items with the query appearing in the title sort before items
 * where it only appears in description/other fields.
 */
function boostTitleMatches(items: UnifiedActivityItem[], query: string): UnifiedActivityItem[] {
  if (items.length <= 1) return items;

  const lowerQuery = query.toLowerCase();
  const result: UnifiedActivityItem[] = [];
  let groupStart = 0;

  for (let i = 0; i <= items.length; i++) {
    const current = items[i];
    const prev = items[i - 1];

    // Detect group boundary: different second or end of array
    const isBoundary =
      i === items.length ||
      !prev ||
      Math.floor(current!.timestamp.getTime() / 1000) !==
        Math.floor(prev.timestamp.getTime() / 1000);

    if (isBoundary && i > groupStart) {
      const group = items.slice(groupStart, i);
      if (group.length > 1) {
        // Stable sort: title matches first
        group.sort((a, b) => {
          const aTitle = a.title?.toLowerCase().includes(lowerQuery) ? 0 : 1;
          const bTitle = b.title?.toLowerCase().includes(lowerQuery) ? 0 : 1;
          return aTitle - bTitle;
        });
      }
      result.push(...group);
      groupStart = i;
    }
  }

  return result;
}
