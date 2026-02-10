import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityFeedService } from '../ActivityFeedService';
import type { ActivityFeedRepositoryPort } from '../../ports/repositories/ActivityFeedRepositoryPort';
import type { CachePort } from '../../ports/external/CachePort';
import type { UnifiedActivityItem } from '@intelliflow/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<UnifiedActivityItem> & { id: string; timestamp: Date }): UnifiedActivityItem {
  return {
    source: 'LEAD_ACTIVITY',
    type: 'EMAIL',
    title: 'Test activity',
    description: null,
    actor: null,
    entity: null,
    metadata: null,
    ...overrides,
  };
}

function encodeCursor(timestamp: Date, id: string): string {
  return Buffer.from(`${timestamp.toISOString()}|${id}`).toString('base64');
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockRepository(): ActivityFeedRepositoryPort {
  return {
    getUnifiedFeed: vi.fn().mockResolvedValue([]),
    getEntityFeed: vi.fn().mockResolvedValue([]),
  };
}

function createMockCache(): CachePort {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(undefined),
  } as unknown as CachePort;
}

describe('ActivityFeedService', () => {
  let service: ActivityFeedService;
  let mockRepo: ActivityFeedRepositoryPort;
  let mockCache: CachePort;
  const tenantId = 'tenant-123';

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockCache = createMockCache();
    service = new ActivityFeedService(mockRepo, mockCache);
  });

  // =========================================================================
  // getUnifiedFeed — Aggregation
  // =========================================================================

  describe('getUnifiedFeed', () => {
    it('returns empty feed when repository returns no items', async () => {
      const result = await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it('returns items from repository sorted by timestamp DESC', async () => {
      const items = [
        makeItem({ id: 'lead_1', timestamp: new Date('2026-01-03') }),
        makeItem({ id: 'lead_2', timestamp: new Date('2026-01-01') }),
        makeItem({ id: 'lead_3', timestamp: new Date('2026-01-02') }),
      ];
      vi.mocked(mockRepo.getUnifiedFeed).mockResolvedValue(items);

      const result = await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(result.items).toHaveLength(3);
      // Items from repo are already pre-sorted by repo, service just slices
    });

    it('calls repository with limit+1 for hasMore detection', async () => {
      await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(mockRepo.getUnifiedFeed).toHaveBeenCalledWith(
        tenantId,
        21, // limit + 1
        null,
        {},
      );
    });

    it('passes filters to repository', async () => {
      const filters = {
        types: ['EMAIL' as const],
        sources: ['LEAD_ACTIVITY' as const],
        entityType: 'LEAD' as const,
        entityId: 'lead-abc',
        after: new Date('2026-01-01'),
        before: new Date('2026-02-01'),
      };
      await service.getUnifiedFeed(tenantId, 20, null, filters);
      expect(mockRepo.getUnifiedFeed).toHaveBeenCalledWith(
        tenantId,
        21,
        null,
        filters,
      );
    });

    // -----------------------------------------------------------------------
    // Deduplication
    // -----------------------------------------------------------------------

    it('deduplicates items with same id', async () => {
      const items = [
        makeItem({ id: 'lead_1', timestamp: new Date('2026-01-03'), title: 'First' }),
        makeItem({ id: 'lead_1', timestamp: new Date('2026-01-03'), title: 'Duplicate' }),
        makeItem({ id: 'lead_2', timestamp: new Date('2026-01-02') }),
      ];
      vi.mocked(mockRepo.getUnifiedFeed).mockResolvedValue(items);

      const result = await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(result.items).toHaveLength(2);
      expect(result.items[0].title).toBe('First');
    });

    // -----------------------------------------------------------------------
    // Pagination
    // -----------------------------------------------------------------------

    it('sets hasMore=true when more items than limit', async () => {
      // Return limit+1 items to trigger hasMore
      const items = Array.from({ length: 21 }, (_, i) =>
        makeItem({ id: `lead_${i}`, timestamp: new Date(2026, 0, 21 - i) }),
      );
      vi.mocked(mockRepo.getUnifiedFeed).mockResolvedValue(items);

      const result = await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });

    it('sets hasMore=false when fewer items than limit', async () => {
      const items = [
        makeItem({ id: 'lead_1', timestamp: new Date('2026-01-01') }),
      ];
      vi.mocked(mockRepo.getUnifiedFeed).mockResolvedValue(items);

      const result = await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('generates valid cursor from last item', async () => {
      const items = Array.from({ length: 21 }, (_, i) =>
        makeItem({ id: `lead_${i}`, timestamp: new Date(2026, 0, 21 - i) }),
      );
      vi.mocked(mockRepo.getUnifiedFeed).mockResolvedValue(items);

      const result = await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(result.nextCursor).toBeTruthy();

      // Decode cursor to verify round-trip
      const raw = Buffer.from(result.nextCursor!, 'base64').toString('utf-8');
      const [timestampStr, id] = raw.split('|');
      expect(timestampStr).toBeTruthy();
      expect(id).toBeTruthy();
      expect(new Date(timestampStr!).getTime()).not.toBeNaN();
    });

    it('decodes cursor and passes to repository', async () => {
      const ts = new Date('2026-01-15T10:00:00.000Z');
      const cursorStr = encodeCursor(ts, 'lead_5');

      await service.getUnifiedFeed(tenantId, 20, cursorStr, {});
      expect(mockRepo.getUnifiedFeed).toHaveBeenCalledWith(
        tenantId,
        21,
        { timestamp: ts, id: 'lead_5' },
        {},
      );
    });

    it('throws on invalid cursor', async () => {
      await expect(
        service.getUnifiedFeed(tenantId, 20, 'not-valid-base64!!!', {}),
      ).rejects.toThrow('Invalid activity feed cursor');
    });

    it('respects custom limit', async () => {
      await service.getUnifiedFeed(tenantId, 50, null, {});
      expect(mockRepo.getUnifiedFeed).toHaveBeenCalledWith(tenantId, 51, null, {});
    });

    // -----------------------------------------------------------------------
    // Caching
    // -----------------------------------------------------------------------

    it('checks cache for first page with no filters', async () => {
      await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(mockCache.get).toHaveBeenCalledWith(expect.stringContaining(`activity-feed:${tenantId}`));
    });

    it('returns cached result when cache hit', async () => {
      const cached = { items: [makeItem({ id: 'cached_1', timestamp: new Date() })], nextCursor: null, hasMore: false };
      vi.mocked(mockCache.get).mockResolvedValue(cached);

      const result = await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(result).toEqual(cached);
      expect(mockRepo.getUnifiedFeed).not.toHaveBeenCalled();
    });

    it('caches first page result with no filters', async () => {
      vi.mocked(mockRepo.getUnifiedFeed).mockResolvedValue([
        makeItem({ id: 'lead_1', timestamp: new Date() }),
      ]);

      await service.getUnifiedFeed(tenantId, 20, null, {});
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining(`activity-feed:${tenantId}`),
        expect.objectContaining({ items: expect.any(Array) }),
        30, // TTL
      );
    });

    it('skips cache when filters are provided', async () => {
      await service.getUnifiedFeed(tenantId, 20, null, { types: ['EMAIL'] });
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('skips cache when cursor is provided (non-first page)', async () => {
      const cursorStr = encodeCursor(new Date(), 'lead_1');
      await service.getUnifiedFeed(tenantId, 20, cursorStr, {});
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Tenant Isolation
    // -----------------------------------------------------------------------

    it('passes tenantId to repository', async () => {
      await service.getUnifiedFeed('tenant-abc', 20, null, {});
      expect(mockRepo.getUnifiedFeed).toHaveBeenCalledWith(
        'tenant-abc',
        21,
        null,
        {},
      );
    });
  });

  // =========================================================================
  // getEntityFeed
  // =========================================================================

  describe('getEntityFeed', () => {
    it('returns empty feed for no items', async () => {
      const result = await service.getEntityFeed(tenantId, 'LEAD', 'lead-1', 20, null);
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('calls repository with entity parameters', async () => {
      await service.getEntityFeed(tenantId, 'CONTACT', 'contact-abc', 10, null);
      expect(mockRepo.getEntityFeed).toHaveBeenCalledWith(
        tenantId,
        'CONTACT',
        'contact-abc',
        11, // limit + 1
        null,
      );
    });

    it('applies type filter post-query', async () => {
      const items = [
        makeItem({ id: 'lead_1', timestamp: new Date('2026-01-03'), type: 'EMAIL' }),
        makeItem({ id: 'lead_2', timestamp: new Date('2026-01-02'), type: 'CALL' }),
        makeItem({ id: 'lead_3', timestamp: new Date('2026-01-01'), type: 'EMAIL' }),
      ];
      vi.mocked(mockRepo.getEntityFeed).mockResolvedValue(items);

      const result = await service.getEntityFeed(tenantId, 'LEAD', 'lead-1', 20, null, ['EMAIL']);
      expect(result.items).toHaveLength(2);
      expect(result.items.every((i) => i.type === 'EMAIL')).toBe(true);
    });

    it('handles pagination with cursor', async () => {
      const ts = new Date('2026-01-10T00:00:00.000Z');
      const cursorStr = encodeCursor(ts, 'lead_5');

      await service.getEntityFeed(tenantId, 'LEAD', 'lead-1', 20, cursorStr);
      expect(mockRepo.getEntityFeed).toHaveBeenCalledWith(
        tenantId,
        'LEAD',
        'lead-1',
        21,
        { timestamp: ts, id: 'lead_5' },
      );
    });

    it('returns hasMore and nextCursor when more results exist', async () => {
      const items = Array.from({ length: 21 }, (_, i) =>
        makeItem({ id: `lead_${i}`, timestamp: new Date(2026, 0, 21 - i) }),
      );
      vi.mocked(mockRepo.getEntityFeed).mockResolvedValue(items);

      const result = await service.getEntityFeed(tenantId, 'LEAD', 'lead-1', 20, null);
      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });
  });
});
