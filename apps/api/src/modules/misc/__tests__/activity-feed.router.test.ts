import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestContext, createPublicContext } from '../../../test/setup';
import { activityFeedRouter } from '../activity-feed.router';
import type { ActivityFeedPage } from '@intelliflow/domain';

describe('activityFeedRouter', () => {
  const mockFeedPage: ActivityFeedPage = {
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
      {
        id: 'contact_2',
        source: 'CONTACT_ACTIVITY',
        type: 'CALL',
        title: 'Discovery call',
        description: 'Discussed requirements',
        timestamp: new Date('2026-01-14T09:00:00Z'),
        actor: { id: 'user-1', name: 'John Doe' },
        entity: { id: 'contact-1', type: 'CONTACT', name: 'Bob Wilson' },
        metadata: null,
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  let mockActivityFeedService: {
    getUnifiedFeed: ReturnType<typeof vi.fn>;
    getEntityFeed: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActivityFeedService = {
      getUnifiedFeed: vi.fn().mockResolvedValue(mockFeedPage),
      getEntityFeed: vi.fn().mockResolvedValue(mockFeedPage),
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
  // getUnifiedFeed
  // =========================================================================

  describe('getUnifiedFeed', () => {
    it('returns feed with default parameters', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      const result = await caller.getUnifiedFeed({});
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(mockActivityFeedService.getUnifiedFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        20, // default limit
        undefined, // no cursor
        expect.objectContaining({})
      );
    });

    it('passes limit parameter to service', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      await caller.getUnifiedFeed({ limit: 50 });
      expect(mockActivityFeedService.getUnifiedFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        50,
        undefined,
        expect.anything()
      );
    });

    it('passes cursor for pagination', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);
      const cursor = Buffer.from('2026-01-15T10:00:00.000Z|lead_1').toString('base64');

      await caller.getUnifiedFeed({ cursor });
      expect(mockActivityFeedService.getUnifiedFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        20,
        cursor,
        expect.anything()
      );
    });

    it('passes type filters to service', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      await caller.getUnifiedFeed({ types: ['EMAIL', 'CALL'] });
      expect(mockActivityFeedService.getUnifiedFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        20,
        undefined,
        expect.objectContaining({ types: ['EMAIL', 'CALL'] })
      );
    });

    it('passes source filters to service', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      await caller.getUnifiedFeed({ sources: ['LEAD_ACTIVITY', 'EMAIL'] });
      expect(mockActivityFeedService.getUnifiedFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        20,
        undefined,
        expect.objectContaining({ sources: ['LEAD_ACTIVITY', 'EMAIL'] })
      );
    });

    it('passes entityType filter to service', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      await caller.getUnifiedFeed({ entityType: 'LEAD' });
      expect(mockActivityFeedService.getUnifiedFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        20,
        undefined,
        expect.objectContaining({ entityType: 'LEAD' })
      );
    });

    it('passes entityId filter to service', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      await caller.getUnifiedFeed({ entityType: 'CONTACT', entityId: 'contact-123' });
      expect(mockActivityFeedService.getUnifiedFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        20,
        undefined,
        expect.objectContaining({ entityType: 'CONTACT', entityId: 'contact-123' })
      );
    });

    it('returns empty feed from service', async () => {
      mockActivityFeedService.getUnifiedFeed.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      const result = await caller.getUnifiedFeed({});
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Authorization
    // -----------------------------------------------------------------------

    it('uses tenantId from authenticated user context', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      await caller.getUnifiedFeed({});
      expect(mockActivityFeedService.getUnifiedFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        20,
        undefined,
        expect.objectContaining({})
      );
    });

    it('throws FORBIDDEN when user has no tenantId', async () => {
      const ctx = createCtxWithService();
      ctx.user = { ...ctx.user!, tenantId: undefined } as any;
      const caller = activityFeedRouter.createCaller(ctx);

      await expect(caller.getUnifiedFeed({})).rejects.toThrow(/Tenant context required/);
    });

    it('throws INTERNAL_SERVER_ERROR when service not in container', async () => {
      const ctx = createTestContext();
      ctx.container = {} as any; // empty container
      const caller = activityFeedRouter.createCaller(ctx);

      await expect(caller.getUnifiedFeed({})).rejects.toThrow(/ActivityFeedService not available/);
    });
  });

  // =========================================================================
  // getEntityFeed
  // =========================================================================

  describe('getEntityFeed', () => {
    it('returns entity-specific feed', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      const result = await caller.getEntityFeed({
        entityType: 'LEAD',
        entityId: 'lead-123',
      });
      expect(result.items).toHaveLength(2);
      expect(mockActivityFeedService.getEntityFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        'LEAD',
        'lead-123',
        20,
        undefined,
        undefined
      );
    });

    it('passes limit and cursor', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);
      const cursor = 'some-cursor';

      await caller.getEntityFeed({
        entityType: 'CONTACT',
        entityId: 'contact-1',
        limit: 10,
        cursor,
      });
      expect(mockActivityFeedService.getEntityFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        'CONTACT',
        'contact-1',
        10,
        cursor,
        undefined
      );
    });

    it('passes type filter', async () => {
      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      await caller.getEntityFeed({
        entityType: 'LEAD',
        entityId: 'lead-1',
        types: ['EMAIL', 'CALL'],
      });
      expect(mockActivityFeedService.getEntityFeed).toHaveBeenCalledWith(
        'test-tenant-id',
        'LEAD',
        'lead-1',
        20,
        undefined,
        ['EMAIL', 'CALL']
      );
    });

    it('returns empty feed for non-existent entity', async () => {
      mockActivityFeedService.getEntityFeed.mockResolvedValue({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      const ctx = createCtxWithService();
      const caller = activityFeedRouter.createCaller(ctx);

      const result = await caller.getEntityFeed({
        entityType: 'TICKET',
        entityId: 'nonexistent-id',
      });
      expect(result.items).toHaveLength(0);
    });

    it('throws FORBIDDEN when user has no tenantId', async () => {
      const ctx = createCtxWithService();
      ctx.user = { ...ctx.user!, tenantId: undefined } as any;
      const caller = activityFeedRouter.createCaller(ctx);

      await expect(
        caller.getEntityFeed({ entityType: 'LEAD', entityId: 'lead-1' })
      ).rejects.toThrow(/Tenant context required/);
    });

    it('throws INTERNAL_SERVER_ERROR when service not in container', async () => {
      const ctx = createTestContext();
      ctx.container = {} as any;
      const caller = activityFeedRouter.createCaller(ctx);

      await expect(
        caller.getEntityFeed({ entityType: 'LEAD', entityId: 'lead-1' })
      ).rejects.toThrow(/ActivityFeedService not available/);
    });
  });
});
