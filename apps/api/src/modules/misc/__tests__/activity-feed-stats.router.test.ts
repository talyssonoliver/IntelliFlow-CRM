import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestContext } from '../../../test/setup';
import { activityFeedRouter } from '../activity-feed.router';
import type { ActivityFeedStats } from '@intelliflow/domain';

describe('activityFeedRouter.getStats', () => {
  const mockStats: ActivityFeedStats & {
    timeWindow: string;
    windowStart: Date | null;
    windowEnd: Date;
  } = {
    timeWindow: '7d',
    windowStart: new Date('2026-03-03T12:00:00Z'),
    windowEnd: new Date('2026-03-10T12:00:00Z'),
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

  let mockActivityFeedService: {
    getUnifiedFeed: ReturnType<typeof vi.fn>;
    getEntityFeed: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActivityFeedService = {
      getUnifiedFeed: vi.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
      getEntityFeed: vi.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
      getStats: vi.fn().mockResolvedValue(mockStats),
    };
  });

  function createCtxWithService(overrides?: Record<string, unknown>) {
    const ctx = createTestContext();
    ctx.container = {
      ...ctx.container,
      activityFeedService: mockActivityFeedService,
    } as any;
    if (overrides) {
      Object.assign(ctx, overrides);
    }
    return ctx;
  }

  it('returns stats with default time window (7d)', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    const result = await caller.getStats({});

    expect(result.total).toBe(42);
    expect(result.timeWindow).toBe('7d');
    expect(mockActivityFeedService.getStats).toHaveBeenCalledWith(
      'test-tenant-id',
      '7d', // default
      { sources: undefined, entityType: undefined }
    );
  });

  it('returns stats for each time window (24h, 7d, 30d, all)', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    for (const tw of ['24h', '7d', '30d', 'all'] as const) {
      mockActivityFeedService.getStats.mockResolvedValue({ ...mockStats, timeWindow: tw });
      const result = await caller.getStats({ timeWindow: tw });
      expect(result.timeWindow).toBe(tw);
      expect(mockActivityFeedService.getStats).toHaveBeenCalledWith(
        'test-tenant-id',
        tw,
        expect.any(Object)
      );
    }
  });

  it('applies source filter correctly (passes to service)', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    await caller.getStats({ sources: ['LEAD_ACTIVITY', 'EMAIL'] });

    expect(mockActivityFeedService.getStats).toHaveBeenCalledWith(
      'test-tenant-id',
      '7d',
      { sources: ['LEAD_ACTIVITY', 'EMAIL'], entityType: undefined }
    );
  });

  it('applies entityType filter correctly (passes to service)', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    await caller.getStats({ entityType: 'LEAD' });

    expect(mockActivityFeedService.getStats).toHaveBeenCalledWith(
      'test-tenant-id',
      '7d',
      { sources: undefined, entityType: 'LEAD' }
    );
  });

  it('returns empty stats for tenant with no data', async () => {
    const emptyStats = {
      ...mockStats,
      total: 0,
      byType: [],
      bySource: [],
      byEntityType: [],
    };
    mockActivityFeedService.getStats.mockResolvedValue(emptyStats);

    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);
    const result = await caller.getStats({});

    expect(result.total).toBe(0);
    expect(result.byType).toEqual([]);
    expect(result.bySource).toEqual([]);
    expect(result.byEntityType).toEqual([]);
  });

  it('throws FORBIDDEN when no tenantId in context', async () => {
    const ctx = createCtxWithService({ user: { userId: 'u1', email: 'test@test.com', role: 'USER' } });
    const caller = activityFeedRouter.createCaller(ctx);

    await expect(caller.getStats({})).rejects.toThrow(/tenant/i);
  });

  it('throws INTERNAL_SERVER_ERROR when service not in container', async () => {
    const ctx = createTestContext();
    ctx.container = {} as any;
    const caller = activityFeedRouter.createCaller(ctx);

    await expect(caller.getStats({})).rejects.toThrow(/ActivityFeedService/i);
  });
});
