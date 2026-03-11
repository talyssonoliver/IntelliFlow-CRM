import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestContext } from '../../../test/setup';
import { activityFeedRouter } from '../activity-feed.router';
import type { ActivityFeedPage } from '@intelliflow/domain';

describe('activityFeedRouter.search', () => {
  const mockSearchResult: ActivityFeedPage = {
    items: [
      {
        id: 'lead_1',
        source: 'LEAD_ACTIVITY',
        type: 'EMAIL',
        title: 'Sent follow-up email',
        description: null,
        timestamp: new Date('2026-01-15T10:00:00Z'),
        actor: { id: 'user-1', name: 'John Doe' },
        entity: { id: 'lead-1', type: 'LEAD', name: 'Jane Smith' },
        metadata: null,
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  let mockActivityFeedService: {
    getUnifiedFeed: ReturnType<typeof vi.fn>;
    getEntityFeed: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActivityFeedService = {
      getUnifiedFeed: vi.fn().mockResolvedValue(mockSearchResult),
      getEntityFeed: vi.fn().mockResolvedValue(mockSearchResult),
      getStats: vi.fn().mockResolvedValue({}),
      search: vi.fn().mockResolvedValue(mockSearchResult),
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

  // =========================================================================
  // Valid queries
  // =========================================================================

  it('returns ActivityFeedPage for valid search query', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    const result = await caller.search({ query: 'email' });
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('delegates to ActivityFeedService.search with correct arguments', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    await caller.search({
      query: 'test search',
      limit: 10,
      types: ['EMAIL'],
      sources: ['LEAD_ACTIVITY'],
      entityType: 'LEAD',
    });

    expect(mockActivityFeedService.search).toHaveBeenCalledWith(
      'test-tenant-id',
      'test search',
      10,
      undefined,
      expect.objectContaining({
        types: ['EMAIL'],
        sources: ['LEAD_ACTIVITY'],
        entityType: 'LEAD',
      })
    );
  });

  it('uses default limit when not specified', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    await caller.search({ query: 'test' });

    expect(mockActivityFeedService.search).toHaveBeenCalledWith(
      'test-tenant-id',
      'test',
      20, // ACTIVITY_FEED_DEFAULT_LIMIT
      undefined,
      expect.objectContaining({})
    );
  });

  it('passes cursor to service', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);
    const cursorStr = Buffer.from('2026-01-15T10:00:00.000Z|item-1').toString('base64');

    await caller.search({ query: 'test', cursor: cursorStr });

    expect(mockActivityFeedService.search).toHaveBeenCalledWith(
      'test-tenant-id',
      'test',
      20,
      cursorStr,
      expect.anything()
    );
  });

  // =========================================================================
  // Input validation
  // =========================================================================

  it('rejects empty query string', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    await expect(caller.search({ query: '' })).rejects.toThrow();
  });

  it('rejects query longer than 500 characters', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    await expect(caller.search({ query: 'x'.repeat(501) })).rejects.toThrow();
  });

  it('trims whitespace from query', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    await caller.search({ query: '  test  ' });

    expect(mockActivityFeedService.search).toHaveBeenCalledWith(
      'test-tenant-id',
      'test',
      20,
      undefined,
      expect.anything()
    );
  });

  it('accepts optional filter parameters', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    // Should not throw
    const result = await caller.search({
      query: 'test',
      types: ['EMAIL', 'CALL'],
      sources: ['LEAD_ACTIVITY', 'CONTACT_ACTIVITY'],
      entityType: 'LEAD',
    });

    expect(result).toBeDefined();
  });

  // =========================================================================
  // Tenant isolation
  // =========================================================================

  it('passes tenant ID from context', async () => {
    const ctx = createCtxWithService();
    const caller = activityFeedRouter.createCaller(ctx);

    await caller.search({ query: 'test' });

    expect(mockActivityFeedService.search).toHaveBeenCalledWith(
      'test-tenant-id',
      expect.any(String),
      expect.any(Number),
      undefined,
      expect.objectContaining({})
    );
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  it('throws INTERNAL_SERVER_ERROR when service unavailable', async () => {
    const ctx = createTestContext();
    ctx.container = { ...ctx.container } as any;
    // Do NOT add activityFeedService
    const caller = activityFeedRouter.createCaller(ctx);

    await expect(caller.search({ query: 'test' })).rejects.toThrow(
      'ActivityFeedService not available in container'
    );
  });
});
