import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { ActivityFeedService } from '../ActivityFeedService';
import type { ActivityFeedRepositoryPort } from '../../ports/repositories/ActivityFeedRepositoryPort';
import type { CachePort } from '../../ports/external/CachePort';
import type { ActivityFeedStats } from '@intelliflow/domain';

// ---------------------------------------------------------------------------
// Use fake timers for deterministic time window calculation
// ---------------------------------------------------------------------------

vi.useFakeTimers();
vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

afterAll(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-stats-test';

const MOCK_STATS: ActivityFeedStats = {
  total: 42,
  byType: [
    { type: 'EMAIL', count: 15 },
    { type: 'CALL', count: 10 },
    { type: 'NOTE', count: 17 },
  ],
  bySource: [
    { source: 'LEAD_ACTIVITY', count: 20 },
    { source: 'EMAIL', count: 15 },
    { source: 'CALL', count: 7 },
  ],
  byEntityType: [
    { entityType: 'LEAD', count: 20 },
    { entityType: 'CONTACT', count: 22 },
  ],
};

function createMockRepository(): ActivityFeedRepositoryPort {
  return {
    getUnifiedFeed: vi.fn().mockResolvedValue([]),
    getEntityFeed: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue(MOCK_STATS),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityFeedService.getStats', () => {
  let service: ActivityFeedService;
  let mockRepo: ActivityFeedRepositoryPort;
  let mockCache: CachePort;

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockCache = createMockCache();
    service = new ActivityFeedService(mockRepo, mockCache);
  });

  it('delegates to repository with correct windowStart/windowEnd for 24h', async () => {
    const result = await service.getStats(TENANT_ID, '24h');

    expect(mockRepo.getStats).toHaveBeenCalledWith(
      TENANT_ID,
      new Date('2026-03-09T12:00:00Z'), // 24h before 2026-03-10T12:00:00Z
      new Date('2026-03-10T12:00:00Z'),
      {}
    );
    expect(result.timeWindow).toBe('24h');
  });

  it('delegates to repository with correct windowStart/windowEnd for 7d', async () => {
    await service.getStats(TENANT_ID, '7d');

    expect(mockRepo.getStats).toHaveBeenCalledWith(
      TENANT_ID,
      new Date('2026-03-03T12:00:00Z'), // 7d before 2026-03-10T12:00:00Z
      new Date('2026-03-10T12:00:00Z'),
      {}
    );
  });

  it('delegates to repository with correct windowStart/windowEnd for 30d', async () => {
    await service.getStats(TENANT_ID, '30d');

    expect(mockRepo.getStats).toHaveBeenCalledWith(
      TENANT_ID,
      new Date('2026-02-08T12:00:00Z'), // 30d before 2026-03-10T12:00:00Z
      new Date('2026-03-10T12:00:00Z'),
      {}
    );
  });

  it('passes null windowStart for time window "all"', async () => {
    await service.getStats(TENANT_ID, 'all');

    expect(mockRepo.getStats).toHaveBeenCalledWith(
      TENANT_ID,
      null, // all-time
      new Date('2026-03-10T12:00:00Z'),
      {}
    );
  });

  it('caches results with 60s TTL on cache miss', async () => {
    await service.getStats(TENANT_ID, '7d');

    expect(mockCache.set).toHaveBeenCalledWith(
      expect.stringContaining(`activity-stats:${TENANT_ID}:7d`),
      expect.objectContaining({ total: 42, timeWindow: '7d' }),
      60 // TTL
    );
  });

  it('returns cached result on cache hit (no repository call)', async () => {
    const cachedResult = {
      timeWindow: '7d' as const,
      windowStart: new Date('2026-03-03T12:00:00Z'),
      windowEnd: new Date('2026-03-10T12:00:00Z'),
      ...MOCK_STATS,
    };
    vi.mocked(mockCache.get).mockResolvedValue(cachedResult);

    const result = await service.getStats(TENANT_ID, '7d');

    expect(result).toEqual(cachedResult);
    expect(mockRepo.getStats).not.toHaveBeenCalled();
  });

  it('passes source and entityType filters through to repository', async () => {
    await service.getStats(TENANT_ID, '7d', {
      sources: ['LEAD_ACTIVITY', 'EMAIL'],
      entityType: 'LEAD',
    });

    expect(mockRepo.getStats).toHaveBeenCalledWith(TENANT_ID, expect.any(Date), expect.any(Date), {
      sources: ['LEAD_ACTIVITY', 'EMAIL'],
      entityType: 'LEAD',
    });
  });

  it('passes tenantId to repository.getStats', async () => {
    await service.getStats('other-tenant', '7d');

    expect(mockRepo.getStats).toHaveBeenCalledWith(
      'other-tenant',
      expect.any(Date),
      expect.any(Date),
      {}
    );
  });

  it('returns stats with timeWindow and windowStart/windowEnd metadata', async () => {
    const result = await service.getStats(TENANT_ID, '24h');

    expect(result.timeWindow).toBe('24h');
    expect(result.windowStart).toEqual(new Date('2026-03-09T12:00:00Z'));
    expect(result.windowEnd).toEqual(new Date('2026-03-10T12:00:00Z'));
    expect(result.total).toBe(42);
    expect(result.byType).toHaveLength(3);
    expect(result.bySource).toHaveLength(3);
    expect(result.byEntityType).toHaveLength(2);
  });
});
