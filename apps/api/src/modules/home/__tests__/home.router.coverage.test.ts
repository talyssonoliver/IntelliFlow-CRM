/**
 * Home Router Coverage Tests
 *
 * Fills coverage gaps not addressed by existing home.router.test.ts (91+ tests)
 * and home.router.getAllInsights.test.ts. Focuses on:
 * - Auth rejection for all 9 endpoints
 * - Progressive fallback patterns (leads, deals)
 * - getAIInsights cache-hit path
 * - getDailyGoal all 5 goal types + edge cases
 * - updateDailyGoal preferences persistence
 * - getPinnedItems stale pin detection
 * - pinItem/unpinItem/reorderPinnedItems edge cases
 * - getAllInsights pagination
 *
 * Task: PG-163 — Home page integration tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { homeRouter } from '../home.router';
import {
  prismaMock,
  createAdminContext,
  createTestContext,
  createPublicContext,
  TEST_UUIDS,
} from '../../../test/setup';

// Module-level BullMQ mock to prevent Redis connections (AC-010)
const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockQueueAdd;
    close = mockQueueClose;
  },
}));

describe('Home Router Coverage Tests (PG-163)', () => {
  const ctx = createTestContext();
  const caller = homeRouter.createCaller(ctx);
  const publicCaller = homeRouter.createCaller(createPublicContext());

  beforeEach(() => {
    mockQueueAdd.mockClear();
    mockQueueClose.mockClear();

    // Default mocks for createProactiveNotifications (fire-and-forget dedup checks).
    // Individual tests can override with mockResolvedValueOnce as needed.
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.notification.create.mockResolvedValue({} as any);

    // Transaction mock: pass prismaMock as tx so inner tx.notification.* hits existing mocks
    (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock));

    // Default mocks for buildSmartSummaries Prisma calls.
    // All return "no data" so the achievement fallback triggers unless overridden.
    prismaMock.opportunity.count.mockResolvedValue(0);
    prismaMock.opportunity.aggregate.mockResolvedValue({
      _sum: { value: 0 },
      _count: 0,
      _avg: {},
      _min: {},
      _max: {},
    } as any);
    prismaMock.lead.count.mockResolvedValue(0);
  });

  // ===========================================================================
  // Auth Rejection — all 9 endpoints (AC-002)
  // ===========================================================================
  describe('Auth — all 9 endpoints reject unauthenticated calls', () => {
    it('getWelcomeSummary rejects unauthenticated', async () => {
      await expect(publicCaller.getWelcomeSummary()).rejects.toThrow(TRPCError);
      await expect(publicCaller.getWelcomeSummary()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('getAIInsights rejects unauthenticated', async () => {
      await expect(publicCaller.getAIInsights()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('getDailyGoal rejects unauthenticated', async () => {
      await expect(publicCaller.getDailyGoal()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('updateDailyGoal rejects unauthenticated', async () => {
      await expect(
        publicCaller.updateDailyGoal({ type: 'revenue', targetValue: 1000 })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('getPinnedItems rejects unauthenticated', async () => {
      await expect(publicCaller.getPinnedItems()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('pinItem rejects unauthenticated', async () => {
      await expect(
        publicCaller.pinItem({
          entityType: 'lead',
          entityId: 'test-id',
          title: 'Test',
          url: '/leads/test-id',
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('unpinItem rejects unauthenticated', async () => {
      await expect(
        publicCaller.unpinItem({ entityType: 'lead', entityId: 'test-id' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('reorderPinnedItems rejects unauthenticated', async () => {
      await expect(
        publicCaller.reorderPinnedItems({
          items: [{ entityType: 'lead', entityId: 'test-id', position: 0 }],
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('getAllInsights rejects unauthenticated', async () => {
      await expect(publicCaller.getAllInsights({ limit: 10 })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ===========================================================================
  // getWelcomeSummary — progressive fallbacks (AC-006)
  // ===========================================================================
  describe('getWelcomeSummary', () => {
    function setupWelcomeMocks(opts: {
      userName?: string | null;
      email?: string;
      leadCounts?: [number, number, number, number]; // [yesterday, week, month, total]
      dealCounts?: [number, number, number, number]; // [thisWeek, lastWeek, thisMonth, lastMonth]
    }) {
      const {
        userName = 'Test User',
        email = 'test@example.com',
        leadCounts = [0, 0, 0, 0],
        dealCounts = [0, 0, 0, 0],
      } = opts;

      prismaMock.user.findUnique.mockResolvedValue({
        name: userName,
        email,
      } as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);

      // 4 lead.count calls: yesterday, week, month, total
      leadCounts.forEach((count) => {
        prismaMock.lead.count.mockResolvedValueOnce(count);
      });

      // 4 opportunity.count calls: thisWeek, lastWeek, thisMonth, lastMonth
      dealCounts.forEach((count) => {
        prismaMock.opportunity.count.mockResolvedValueOnce(count);
      });
    }

    // Progressive lead fallback tests
    it('uses yesterday period when yesterday has leads', async () => {
      setupWelcomeMocks({ leadCounts: [5, 10, 20, 50] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.newLeadsPeriod).toBe('yesterday');
      expect(result.stats.newLeadsCount).toBe(5);
    });

    it('falls back to this_week when yesterday is 0', async () => {
      setupWelcomeMocks({ leadCounts: [0, 8, 20, 50] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.newLeadsPeriod).toBe('this_week');
      expect(result.stats.newLeadsCount).toBe(8);
    });

    it('falls back to this_month when yesterday and week are 0', async () => {
      setupWelcomeMocks({ leadCounts: [0, 0, 15, 50] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.newLeadsPeriod).toBe('this_month');
      expect(result.stats.newLeadsCount).toBe(15);
    });

    it('falls back to all_time when only total > 0', async () => {
      setupWelcomeMocks({ leadCounts: [0, 0, 0, 30] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.newLeadsPeriod).toBe('all_time');
      expect(result.stats.newLeadsCount).toBe(30);
    });

    it('returns 0 leads with yesterday period when all are 0', async () => {
      setupWelcomeMocks({ leadCounts: [0, 0, 0, 0] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.newLeadsPeriod).toBe('yesterday');
      expect(result.stats.newLeadsCount).toBe(0);
    });

    // Progressive deal trend fallback tests
    it('calculates weekly comparison when lastWeek > 0', async () => {
      setupWelcomeMocks({ dealCounts: [4, 2, 0, 0] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.dealClosingRateTrend).toBe(100); // (4-2)/2 * 100
      expect(result.stats.dealsTrendPeriod).toBe('this_week');
    });

    it('shows 100% improvement when lastWeek is 0 but thisWeek > 0', async () => {
      setupWelcomeMocks({ dealCounts: [3, 0, 0, 0] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.dealClosingRateTrend).toBe(100);
      expect(result.stats.dealsTrendPeriod).toBe('this_week');
    });

    it('falls back to monthly comparison when weekly both 0 and lastMonth > 0', async () => {
      setupWelcomeMocks({ dealCounts: [0, 0, 6, 3] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.dealClosingRateTrend).toBe(100); // (6-3)/3 * 100
      expect(result.stats.dealsTrendPeriod).toBe('this_month');
    });

    it('shows 100% for monthly when lastMonth is 0 but thisMonth > 0', async () => {
      setupWelcomeMocks({ dealCounts: [0, 0, 5, 0] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.dealClosingRateTrend).toBe(100);
      expect(result.stats.dealsTrendPeriod).toBe('this_month');
    });

    it('returns 0 trend when all deal counts are 0', async () => {
      setupWelcomeMocks({ dealCounts: [0, 0, 0, 0] });
      const result = await caller.getWelcomeSummary();
      expect(result.stats.dealClosingRateTrend).toBe(0);
      expect(result.stats.dealsTrendPeriod).toBe('this_week');
    });

    // User name fallback chain
    it('uses user name when available', async () => {
      setupWelcomeMocks({ userName: 'Alice Smith' });
      const result = await caller.getWelcomeSummary();
      expect(result.userName).toBe('Alice Smith');
    });

    it('uses email prefix when name is null', async () => {
      setupWelcomeMocks({ userName: null, email: 'bob@company.com' });
      const result = await caller.getWelcomeSummary();
      expect(result.userName).toBe('bob');
    });

    it('falls back to User when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.lead.count.mockResolvedValue(0);
      prismaMock.opportunity.count.mockResolvedValue(0);
      const result = await caller.getWelcomeSummary();
      expect(result.userName).toBe('User');
    });

    // Invalid timezone fallback
    it('does not crash with invalid timezone', async () => {
      const tzCtx = createTestContext({
        user: {
          userId: TEST_UUIDS.user1,
          email: 'test@example.com',
          role: 'USER',
          tenantId: TEST_UUIDS.tenant,
          timezone: 'Invalid/Timezone',
        },
      });
      const tzCaller = homeRouter.createCaller(tzCtx);

      setupWelcomeMocks({});
      const result = await tzCaller.getWelcomeSummary();
      expect(result.greeting).toMatch(/Good (morning|afternoon|evening)/);
    });
  });

  // ===========================================================================
  // getAIInsights — cache-hit path (AC-004)
  // ===========================================================================
  describe('getAIInsights', () => {
    it('returns cached insights when fresh rows exist (cache hit)', async () => {
      const now = new Date();
      const cachedRows = [
        {
          id: 'insight-1',
          type: 'anomaly',
          title: 'Deal at Risk',
          description: 'A deal needs attention',
          suggestedActions: ['Follow up'],
          entityType: 'opportunity',
          entityId: 'opp-1',
          priority: 'high',
          createdAt: now,
        },
        {
          id: 'insight-2',
          type: 'recommendation',
          title: 'Hot Lead',
          description: 'A lead is ready',
          suggestedActions: [],
          entityType: 'lead',
          entityId: 'lead-1',
          priority: 'medium',
          createdAt: new Date(now.getTime() - 1000),
        },
      ];

      (prismaMock.aIInsight as any).findMany.mockResolvedValue(cachedRows);
      // filterStaleInsights verifies referenced entities still exist
      prismaMock.opportunity.findMany.mockResolvedValue([{ id: 'opp-1' }] as any);
      prismaMock.lead.findMany.mockResolvedValue([{ id: 'lead-1' }] as any);

      const result = await caller.getAIInsights();

      expect(result.insights).toHaveLength(2);
      expect(result.insights[0].type).toBe('warning'); // anomaly → warning
      expect(result.insights[0].suggestedAction).toBe('Follow up');
      expect(result.insights[1].type).toBe('opportunity'); // recommendation → opportunity
      expect(result.insights[1].suggestedAction).toBeNull(); // empty array → null
      expect(result.lastRefreshed).toEqual(now);
    });

    it('falls back to heuristic insights on cache miss with user data', async () => {
      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);

      // User-scoped data — at least one category has data
      prismaMock.opportunity.findMany.mockResolvedValue([
        {
          id: 'deal-1',
          name: 'Risky Deal',
          updatedAt: new Date('2025-01-01'),
        },
      ] as any);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]);

      // buildSmartSummaries: return 1 active deal so pipeline-summary is produced
      prismaMock.opportunity.count.mockResolvedValueOnce(1); // activeDealCount
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: 5000 },
        _count: 1,
        _avg: {},
        _min: {},
        _max: {},
      } as any);

      const result = await caller.getAIInsights();

      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights[0].source).toBe('heuristic');
      expect(result.insights[0].id).toBe('pipeline-summary');
      expect(result.insights[0].type).toBe('opportunity');
    });

    it('falls back to tenant-scoped queries when an admin has no direct data', async () => {
      const adminCaller = homeRouter.createCaller(createAdminContext());
      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);

      // First call (user-scoped) — all empty
      prismaMock.opportunity.findMany.mockResolvedValueOnce([]);
      prismaMock.lead.findMany.mockResolvedValueOnce([]);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.contact.findMany.mockResolvedValueOnce([]);

      // Second call (tenant-scoped fallback) — has data
      prismaMock.opportunity.findMany.mockResolvedValueOnce([
        {
          id: 'tenant-deal-1',
          name: 'Tenant Deal',
          updatedAt: new Date('2025-01-01'),
        },
      ] as any);
      prismaMock.lead.findMany.mockResolvedValueOnce([]);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.contact.findMany.mockResolvedValueOnce([]);

      // buildSmartSummaries: return 1 active deal so pipeline-summary is produced
      prismaMock.opportunity.count.mockResolvedValueOnce(1); // activeDealCount
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: 0 },
        _count: 1,
        _avg: {},
        _min: {},
        _max: {},
      } as any);

      const result = await adminCaller.getAIInsights();

      // The tenant-scoped deal triggers a proactive notification (fire-and-forget).
      // Smart summaries are now returned as insights instead of per-deal alerts.
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights[0].source).toBe('heuristic');
      expect(result.insights[0].id).toBe('pipeline-summary');
    });

    it('returns achievement insight when all categories empty', async () => {
      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);

      // User-scoped — all empty
      prismaMock.opportunity.findMany.mockResolvedValueOnce([]);
      prismaMock.lead.findMany.mockResolvedValueOnce([]);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.contact.findMany.mockResolvedValueOnce([]);

      // Tenant-scoped — also all empty
      prismaMock.opportunity.findMany.mockResolvedValueOnce([]);
      prismaMock.lead.findMany.mockResolvedValueOnce([]);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.contact.findMany.mockResolvedValueOnce([]);

      const result = await caller.getAIInsights();

      expect(result.insights).toHaveLength(1);
      expect(result.insights[0].type).toBe('achievement');
      expect(result.insights[0].id).toBe('all-good');
      expect(result.insights[0].title).toContain('on track');
    });

    it('covers stale contact with null lastContactedAt', async () => {
      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);

      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([
        {
          id: 'contact-null',
          firstName: 'Jane',
          lastName: 'Doe',
          lastContactedAt: null,
        },
      ] as any);

      // Stale contact is routed to a notification (fire-and-forget).
      // A notification dedup check should occur via $transaction.
      const result = await caller.getAIInsights();

      // With staleContacts non-empty, the achievement fallback should NOT appear —
      // there ARE items needing attention (just routed to notifications).
      expect((prismaMock as any).$transaction).toHaveBeenCalled();
      const allGoodInsight = result.insights.find((i) => i.id === 'all-good');
      expect(allGoodInsight).toBeUndefined();
    });

    it('BullMQ enqueue is called on cache miss', async () => {
      // enqueueInsightGeneration requires a valid UUID tenantId
      const uuidCtx = createTestContext({
        user: { userId: TEST_UUIDS.user1, email: 'test@example.com', role: 'USER', tenantId: TEST_UUIDS.tenant, timezone: 'UTC' },
        tenant: { tenantId: TEST_UUIDS.tenant, tenantType: 'user' as const, userId: TEST_UUIDS.user1, role: 'USER', canAccessAllTenantData: false },
      });
      const uuidCaller = homeRouter.createCaller(uuidCtx);

      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(2);
      prismaMock.contact.findMany.mockResolvedValue([]);

      await uuidCaller.getAIInsights();

      // enqueueInsightGeneration is fire-and-forget (void), wait for microtask queue
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockQueueAdd).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalled();
    });

    it('BullMQ failure is silently caught', async () => {
      mockQueueAdd.mockRejectedValueOnce(new Error('Redis connection refused'));

      // enqueueInsightGeneration requires a valid UUID tenantId
      const uuidCtx = createTestContext({
        user: { userId: TEST_UUIDS.user1, email: 'test@example.com', role: 'USER', tenantId: TEST_UUIDS.tenant, timezone: 'UTC' },
        tenant: { tenantId: TEST_UUIDS.tenant, tenantType: 'user' as const, userId: TEST_UUIDS.user1, role: 'USER', canAccessAllTenantData: false },
      });
      const uuidCaller = homeRouter.createCaller(uuidCtx);

      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(1);
      prismaMock.contact.findMany.mockResolvedValue([]);

      // buildSmartSummaries: return 1 active deal so pipeline-summary is produced.
      // This is required because overdueTasksCount=1 blocks the achievement fallback,
      // so without a summary we'd return 0 insights.
      prismaMock.opportunity.count.mockResolvedValueOnce(2); // activeDealCount
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: 8000 },
        _count: 2,
        _avg: {},
        _min: {},
        _max: {},
      } as any);

      // Should not throw despite BullMQ error
      const result = await uuidCaller.getAIInsights();
      expect(result.insights.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // getDailyGoal — all 5 goal types (AC-003)
  // ===========================================================================
  describe('getDailyGoal', () => {
    it('calculates revenue goal from opportunity aggregate', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          dailyGoal: { type: 'revenue', targetValue: 5000 },
        },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: 2500 },
        _count: 0,
        _avg: {},
        _min: {},
        _max: {},
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('revenue');
      expect(result.goal.currentValue).toBe(2500);
      expect(result.goal.targetValue).toBe(5000);
      expect(result.goal.progress).toBe(50);
      expect(result.goal.remainingFormatted).toContain('$');
    });

    it('calculates calls goal from callRecord count', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          dailyGoal: { type: 'calls', targetValue: 10 },
        },
      } as any);
      (prismaMock.callRecord as any).count.mockResolvedValue(3);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('calls');
      expect(result.goal.currentValue).toBe(3);
      expect(result.goal.unit).toBe('calls');
    });

    it('calculates meetings goal from appointment count', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          dailyGoal: { type: 'meetings', targetValue: 3 },
        },
      } as any);
      prismaMock.appointment.count.mockResolvedValue(2);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('meetings');
      expect(result.goal.currentValue).toBe(2);
      expect(result.goal.unit).toBe('meetings');
    });

    it('calculates tasks goal from task count', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          dailyGoal: { type: 'tasks', targetValue: 5 },
        },
      } as any);
      prismaMock.task.count.mockResolvedValue(4);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('tasks');
      expect(result.goal.currentValue).toBe(4);
      expect(result.goal.unit).toBe('tasks');
    });

    it('returns 0 for custom goal type (no DB query)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          dailyGoal: { type: 'custom', targetValue: 10, customUnit: 'widgets' },
        },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('custom');
      expect(result.goal.currentValue).toBe(0);
    });

    it('falls back to revenue defaults when preferences malformed', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { someOtherKey: 'value' },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: 0 },
        _count: 0,
        _avg: {},
        _min: {},
        _max: {},
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('revenue');
      expect(result.goal.targetValue).toBe(5000); // GOAL_DEFAULTS.revenue
    });

    it('caps progress at 100 when currentValue exceeds target', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          dailyGoal: { type: 'tasks', targetValue: 3 },
        },
      } as any);
      prismaMock.task.count.mockResolvedValue(10);

      const result = await caller.getDailyGoal();

      expect(result.goal.progress).toBe(100);
      expect(result.goal.remainingToTarget).toBe(0);
    });

    it('ensures remainingToTarget never goes below 0', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          dailyGoal: { type: 'calls', targetValue: 5 },
        },
      } as any);
      (prismaMock.callRecord as any).count.mockResolvedValue(20);

      const result = await caller.getDailyGoal();

      expect(result.goal.remainingToTarget).toBe(0);
    });
  });

  // ===========================================================================
  // updateDailyGoal — preferences persistence (AC-001)
  // ===========================================================================
  describe('updateDailyGoal', () => {
    it('saves preferences with read-merge-write (preserves pinnedItems)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [{ entityType: 'lead', entityId: 'lead-1' }],
          otherPref: true,
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      await caller.updateDailyGoal({ type: 'calls', targetValue: 10 });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            preferences: expect.objectContaining({
              pinnedItems: [{ entityType: 'lead', entityId: 'lead-1' }],
              otherPref: true,
              dailyGoal: {
                type: 'calls',
                targetValue: 10,
                label: undefined,
                customUnit: undefined,
              },
            }),
          },
        })
      );
    });

    it('creates dailyGoal when preferences are empty', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: null,
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.updateDailyGoal({
        type: 'meetings',
        targetValue: 5,
      });

      expect(result.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalled();
    });

    it('rejects invalid input via Zod validation', async () => {
      await expect(
        caller.updateDailyGoal({
          type: 'revenue',
          targetValue: -1, // Negative — invalid
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // getPinnedItems — stale pin detection (AC-005)
  // ===========================================================================
  describe('getPinnedItems', () => {
    it('returns empty array when no pins exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {},
      } as any);

      const result = await caller.getPinnedItems();

      expect(result.items).toEqual([]);
      expect(result.maxItems).toBe(10);
    });

    it('marks entity as available when found in DB', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [
            {
              entityType: 'lead',
              entityId: 'lead-123',
              title: 'Test Lead',
              url: '/leads/lead-123',
              pinnedAt: new Date().toISOString(),
            },
          ],
        },
      } as any);
      (prismaMock as any).lead.findFirst.mockResolvedValue({ id: 'lead-123' });

      const result = await caller.getPinnedItems();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].isAvailable).toBe(true);
    });

    it('marks entity as unavailable when not found in DB', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [
            {
              entityType: 'lead',
              entityId: 'deleted-lead',
              title: 'Deleted Lead',
              url: '/leads/deleted-lead',
              pinnedAt: new Date().toISOString(),
            },
          ],
        },
      } as any);
      (prismaMock as any).lead.findFirst.mockResolvedValue(null);

      const result = await caller.getPinnedItems();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].isAvailable).toBe(false);
    });

    it('list entity type is always available (no DB check)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [
            {
              entityType: 'list',
              entityId: 'my-list',
              title: 'My List',
              url: '/lists/my-list',
              pinnedAt: new Date().toISOString(),
            },
          ],
        },
      } as any);

      const result = await caller.getPinnedItems();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].isAvailable).toBe(true);
    });

    it('report entity maps to reportDefinition model', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [
            {
              entityType: 'report',
              entityId: 'report-1',
              title: 'Sales Report',
              url: '/reports/report-1',
              pinnedAt: new Date().toISOString(),
            },
          ],
        },
      } as any);
      (prismaMock as any).reportDefinition = {
        findFirst: vi.fn().mockResolvedValue({ id: 'report-1' }),
      };

      const result = await caller.getPinnedItems();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].isAvailable).toBe(true);
      expect((prismaMock as any).reportDefinition.findFirst).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // pinItem (AC-001)
  // ===========================================================================
  describe('pinItem', () => {
    it('successfully pins an item', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems: [] },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.pinItem({
        entityType: 'lead',
        entityId: 'lead-1',
        title: 'Test Lead',
        url: '/leads/lead-1',
      });

      expect(result.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalled();
    });

    it('throws CONFLICT on duplicate pin', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [{ entityType: 'lead', entityId: 'lead-1', title: 'Lead' }],
        },
      } as any);

      await expect(
        caller.pinItem({
          entityType: 'lead',
          entityId: 'lead-1',
          title: 'Lead',
          url: '/leads/lead-1',
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('throws BAD_REQUEST at max 10 items', async () => {
      const tenItems = Array.from({ length: 10 }, (_, i) => ({
        entityType: 'lead',
        entityId: `lead-${i}`,
        title: `Lead ${i}`,
      }));
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems: tenItems },
      } as any);

      await expect(
        caller.pinItem({
          entityType: 'contact',
          entityId: 'contact-1',
          title: 'Contact',
          url: '/contacts/contact-1',
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ===========================================================================
  // unpinItem (AC-001)
  // ===========================================================================
  describe('unpinItem', () => {
    it('successfully unpins an item', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [
            { entityType: 'lead', entityId: 'lead-1', title: 'Lead 1' },
            { entityType: 'contact', entityId: 'contact-1', title: 'Contact 1' },
          ],
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.unpinItem({
        entityType: 'lead',
        entityId: 'lead-1',
      });

      expect(result.success).toBe(true);
    });

    it('throws NOT_FOUND for non-existent pin', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [{ entityType: 'lead', entityId: 'lead-1', title: 'Lead 1' }],
        },
      } as any);

      await expect(
        caller.unpinItem({
          entityType: 'contact',
          entityId: 'nonexistent',
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // ===========================================================================
  // reorderPinnedItems (AC-001)
  // ===========================================================================
  describe('reorderPinnedItems', () => {
    it('reorders items by position', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [
            { entityType: 'lead', entityId: 'lead-1', title: 'Lead 1' },
            { entityType: 'contact', entityId: 'contact-1', title: 'Contact 1' },
          ],
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.reorderPinnedItems({
        items: [
          { entityType: 'contact', entityId: 'contact-1', position: 0 },
          { entityType: 'lead', entityId: 'lead-1', position: 1 },
        ],
      });

      expect(result.success).toBe(true);
      // Verify update was called with reordered items
      const updateCall = prismaMock.user.update.mock.calls[0][0];
      const savedItems = (updateCall as any).data.preferences.pinnedItems;
      expect(savedItems[0].entityType).toBe('contact');
      expect(savedItems[1].entityType).toBe('lead');
    });

    it('silently filters out unmatched items', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [{ entityType: 'lead', entityId: 'lead-1', title: 'Lead 1' }],
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.reorderPinnedItems({
        items: [
          { entityType: 'lead', entityId: 'lead-1', position: 0 },
          { entityType: 'contact', entityId: 'nonexistent', position: 1 },
        ],
      });

      expect(result.success).toBe(true);
      const updateCall = prismaMock.user.update.mock.calls[0][0];
      const savedItems = (updateCall as any).data.preferences.pinnedItems;
      expect(savedItems).toHaveLength(1); // Only matched item kept
    });
  });

  // ===========================================================================
  // getAllInsights — pagination (AC-007)
  // ===========================================================================
  describe('getAllInsights', () => {
    it('returns paginated cached insights with hasMore', async () => {
      const cachedRows = Array.from({ length: 10 }, (_, i) => ({
        id: `insight-${i}`,
        type: 'anomaly',
        title: `Insight ${i}`,
        description: `Description ${i}`,
        suggestedActions: [],
        entityType: null,
        entityId: null,
        priority: 'medium',
        createdAt: new Date(Date.now() - i * 1000),
      }));

      (prismaMock.aIInsight as any).findMany.mockResolvedValue(cachedRows);

      const result = await caller.getAllInsights({ limit: 5 });

      expect(result.insights).toHaveLength(5);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
      expect(result.total).toBe(10);
    });

    it('supports cursor-based pagination (page 2)', async () => {
      const cachedRows = Array.from({ length: 10 }, (_, i) => ({
        id: `insight-${i}`,
        type: 'anomaly',
        title: `Insight ${i}`,
        description: `Description ${i}`,
        suggestedActions: [],
        entityType: null,
        entityId: null,
        priority: 'medium',
        createdAt: new Date(Date.now() - i * 1000),
      }));

      (prismaMock.aIInsight as any).findMany.mockResolvedValue(cachedRows);

      // Create a cursor pointing to offset 5
      const cursor = Buffer.from('5').toString('base64');
      const result = await caller.getAllInsights({ limit: 5, cursor });

      expect(result.insights).toHaveLength(5);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('filters by type', async () => {
      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);

      // Heuristic fallback — only deals and tasks
      prismaMock.opportunity.findMany.mockResolvedValue([
        { id: 'deal-1', name: 'Deal', updatedAt: new Date('2025-01-01') },
      ] as any);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(3);
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.getAllInsights({
        limit: 20,
        types: ['warning'],
      });

      // Only warning-type insights (deals at risk) should be returned
      result.insights.forEach((insight) => {
        expect(insight.type).toBe('warning');
      });
    });

    it('returns empty results when no data', async () => {
      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);
      prismaMock.opportunity.findMany.mockResolvedValueOnce([]);
      prismaMock.lead.findMany.mockResolvedValueOnce([]);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.contact.findMany.mockResolvedValueOnce([]);
      prismaMock.opportunity.findMany.mockResolvedValueOnce([]);
      prismaMock.lead.findMany.mockResolvedValueOnce([]);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.contact.findMany.mockResolvedValueOnce([]);

      const result = await caller.getAllInsights({
        limit: 20,
        types: ['opportunity'],
      });

      expect(result.insights).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('paginates heuristic fallback results', async () => {
      (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);

      // Generate heuristic data (goes to notifications, not insights)
      const deals = Array.from({ length: 5 }, (_, i) => ({
        id: `deal-${i}`,
        name: `Deal ${i}`,
        updatedAt: new Date('2025-01-01'),
      }));
      prismaMock.opportunity.findMany.mockResolvedValue(deals as any);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]);

      // buildSmartSummaries: mock all 3 summary types to produce 3 insights total.
      // pipeline-summary (activeDealCount > 0)
      prismaMock.opportunity.count.mockResolvedValueOnce(3); // activeDealCount
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: 15000 },
        _count: 3,
        _avg: {},
        _min: {},
        _max: {},
      } as any);
      // deal-trend (closedThisWeek > 0)
      prismaMock.opportunity.count.mockResolvedValueOnce(2); // closedThisWeek
      prismaMock.opportunity.count.mockResolvedValueOnce(1); // closedLastWeek
      // lead-queue (qualifiableLeads > 0)
      prismaMock.lead.count.mockResolvedValueOnce(4); // qualifiableLeads

      // With limit=2 and 3 total summaries, pagination should produce hasMore=true
      const result = await caller.getAllInsights({ limit: 2 });

      expect(result.insights).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(3);
    });
  });
});
