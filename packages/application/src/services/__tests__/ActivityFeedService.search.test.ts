import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityFeedService } from '../ActivityFeedService';
import type { ActivityFeedRepositoryPort } from '../../ports/repositories/ActivityFeedRepositoryPort';
import type { CachePort } from '../../ports/external/CachePort';
import type { UnifiedActivityItem } from '@intelliflow/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  overrides: Partial<UnifiedActivityItem> & { id: string; timestamp: Date }
): UnifiedActivityItem {
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
    getStats: vi.fn().mockResolvedValue({ total: 0, byType: [], bySource: [], byEntityType: [] }),
    searchFeed: vi.fn().mockResolvedValue([]),
  };
}

function createMockCache(): CachePort {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ActivityFeedService.search', () => {
  let service: ActivityFeedService;
  let mockRepo: ActivityFeedRepositoryPort;
  let mockCache: CachePort;
  const tenantId = 'tenant-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    mockCache = createMockCache();
    service = new ActivityFeedService(mockRepo, mockCache);
  });

  it('delegates to repository.searchFeed with correct parameters', async () => {
    await service.search(tenantId, 'test query', 20, null, {});

    expect(mockRepo.searchFeed).toHaveBeenCalledWith(
      tenantId,
      'test query',
      21, // limit + 1 for hasMore detection
      null,
      expect.objectContaining({})
    );
  });

  it('decodes cursor from base64 correctly', async () => {
    const cursorStr = encodeCursor(new Date('2026-01-15T10:00:00Z'), 'item-1');
    await service.search(tenantId, 'test', 20, cursorStr, {});

    expect(mockRepo.searchFeed).toHaveBeenCalledWith(
      tenantId,
      'test',
      21,
      expect.objectContaining({
        timestamp: new Date('2026-01-15T10:00:00.000Z'),
        id: 'item-1',
      }),
      expect.anything()
    );
  });

  it('encodes nextCursor when hasMore is true', async () => {
    const items = Array.from({ length: 21 }, (_, i) =>
      makeItem({
        id: `item-${i}`,
        timestamp: new Date(`2026-01-${String(20 - i).padStart(2, '0')}`),
      })
    );
    (mockRepo.searchFeed as ReturnType<typeof vi.fn>).mockResolvedValue(items);

    const result = await service.search(tenantId, 'test', 20, null, {});
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    expect(result.items).toHaveLength(20);
  });

  it('deduplicates items with same ID', async () => {
    const items = [
      makeItem({ id: 'dup-1', timestamp: new Date('2026-01-15'), source: 'LEAD_ACTIVITY' }),
      makeItem({ id: 'dup-1', timestamp: new Date('2026-01-15'), source: 'CONTACT_ACTIVITY' }),
      makeItem({ id: 'unique-1', timestamp: new Date('2026-01-14') }),
    ];
    (mockRepo.searchFeed as ReturnType<typeof vi.fn>).mockResolvedValue(items);

    const result = await service.search(tenantId, 'test', 20, null, {});
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.id)).toEqual(['dup-1', 'unique-1']);
  });

  it('returns hasMore=false when results <= limit', async () => {
    const items = [
      makeItem({ id: 'item-1', timestamp: new Date('2026-01-15') }),
    ];
    (mockRepo.searchFeed as ReturnType<typeof vi.fn>).mockResolvedValue(items);

    const result = await service.search(tenantId, 'test', 20, null, {});
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('returns empty result for no matches', async () => {
    const result = await service.search(tenantId, 'nonexistent', 20, null, {});
    expect(result).toEqual({ items: [], nextCursor: null, hasMore: false });
  });

  it('boosts title matches within same-second groups', async () => {
    const sameTimestamp = new Date('2026-01-15T10:00:00Z');
    const items = [
      makeItem({
        id: 'desc-match',
        timestamp: sameTimestamp,
        title: 'Some unrelated title',
        description: 'Contains the search query',
      }),
      makeItem({
        id: 'title-match',
        timestamp: sameTimestamp,
        title: 'The search query is here',
        description: null,
      }),
    ];
    (mockRepo.searchFeed as ReturnType<typeof vi.fn>).mockResolvedValue(items);

    const result = await service.search(tenantId, 'search query', 20, null, {});
    // Title match should come first within same-second group
    expect(result.items[0].id).toBe('title-match');
    expect(result.items[1].id).toBe('desc-match');
  });

  it('does not cache search results', async () => {
    await service.search(tenantId, 'test', 20, null, {});
    expect(mockCache.get).not.toHaveBeenCalled();
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('passes filters through to repository', async () => {
    await service.search(tenantId, 'test', 20, null, {
      types: ['EMAIL'],
      sources: ['LEAD_ACTIVITY'],
      entityType: 'LEAD',
    });

    expect(mockRepo.searchFeed).toHaveBeenCalledWith(
      tenantId,
      'test',
      21,
      null,
      expect.objectContaining({
        types: ['EMAIL'],
        sources: ['LEAD_ACTIVITY'],
        entityType: 'LEAD',
      })
    );
  });
});
