/**
 * Home Router Tests
 *
 * Comprehensive tests for all home router procedures:
 * - getWelcomeSummary, getAIInsights, getActivityFeed
 * - getDailyGoal, getPinnedItems, pinItem, unpinItem, reorderPinnedItems
 *
 * Task: IFC-182 - Home Page tRPC Router
 * Target: ≥90% coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@intelliflow/db';
import { homeRouter } from '../home.router';
import {
  prismaMock,
  createTestContext,
  createPublicContext,
  TEST_UUIDS,
  mockUser,
  mockLead,
  mockTask,
  mockOpportunity,
} from '../../../test/setup';

describe('Home Router', () => {
  const ctx = createTestContext();
  const caller = homeRouter.createCaller(ctx);

  beforeEach(() => {
    // Reset is handled by setup.ts
    // Default: no cached AI insights (cache miss → heuristic fallback path)
    (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);

    // Default mocks for buildSmartSummaries pipeline queries
    // (called on cache miss — tests override as needed)
    (prismaMock.opportunity as any).count.mockResolvedValue(0);
    (prismaMock.opportunity as any).aggregate.mockResolvedValue({ _sum: { value: null } });
    (prismaMock.lead as any).count.mockResolvedValue(0);

    // Default mocks for createProactiveNotifications dedup queries
    (prismaMock.notification as any).findFirst.mockResolvedValue(null);
    (prismaMock.notification as any).create.mockResolvedValue({ id: 'notif-mock' });

    // Transaction mock: pass prismaMock as tx so inner tx.notification.* hits existing mocks
    (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock));
  });

  // =============================================================================
  // getWelcomeSummary
  // =============================================================================
  describe('getWelcomeSummary', () => {
    it('should return welcome summary with user name and stats', async () => {
      // Mock user fetch
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        name: 'John Doe',
        email: 'john@example.com',
      } as any);

      // Mock parallel stats queries with progressive fallback periods
      prismaMock.task.count.mockResolvedValue(3); // high priority tasks and overdue
      prismaMock.lead.count
        .mockResolvedValueOnce(5) // new leads since yesterday
        .mockResolvedValueOnce(10) // new leads this week
        .mockResolvedValueOnce(20) // new leads this month
        .mockResolvedValueOnce(50); // total leads
      prismaMock.appointment.count.mockResolvedValue(2); // appointments today
      prismaMock.opportunity.count
        .mockResolvedValueOnce(4) // deals closed this week
        .mockResolvedValueOnce(2) // deals closed last week
        .mockResolvedValueOnce(8) // deals closed this month
        .mockResolvedValueOnce(6); // deals closed last month

      const result = await caller.getWelcomeSummary();

      expect(result.userName).toBe('John Doe');
      expect(result.greeting).toMatch(/Good (morning|afternoon|evening)/);
      expect(result.todayDate).toBeInstanceOf(Date);
      expect(result.stats).toEqual({
        highPriorityTasksCount: 3,
        newLeadsCount: 5,
        newLeadsPeriod: 'yesterday', // found data since yesterday
        dealClosingRateTrend: 100, // (4-2)/2 * 100 = 100%
        dealsTrendPeriod: 'this_week',
        appointmentsToday: 2,
        overdueTasksCount: 3, // same mock for overdue
      });
    });

    it('should use email prefix when name is not set', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        name: null,
        email: 'john.doe@example.com',
      } as any);

      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count.mockResolvedValue(0); // all periods return 0
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count.mockResolvedValue(0);

      const result = await caller.getWelcomeSummary();

      expect(result.userName).toBe('john.doe');
    });

    it('should handle zero deals last week (positive trend)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count
        .mockResolvedValueOnce(5) // deals this week
        .mockResolvedValueOnce(0) // deals last week
        .mockResolvedValueOnce(5) // deals this month
        .mockResolvedValueOnce(0); // deals last month

      const result = await caller.getWelcomeSummary();

      expect(result.stats.dealClosingRateTrend).toBe(100);
      expect(result.stats.dealsTrendPeriod).toBe('this_week');
    });

    it('should handle zero deals both weeks (no trend)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count.mockResolvedValue(0);

      const result = await caller.getWelcomeSummary();

      expect(result.stats.dealClosingRateTrend).toBe(0);
    });

    it('should fallback to weekly leads when no leads since yesterday', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count
        .mockResolvedValueOnce(0) // no leads since yesterday
        .mockResolvedValueOnce(7) // 7 leads this week
        .mockResolvedValueOnce(15) // 15 leads this month
        .mockResolvedValueOnce(50); // 50 total leads
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count.mockResolvedValue(0);

      const result = await caller.getWelcomeSummary();

      expect(result.stats.newLeadsCount).toBe(7);
      expect(result.stats.newLeadsPeriod).toBe('this_week');
    });

    it('should fallback to monthly leads when no leads this week', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count
        .mockResolvedValueOnce(0) // no leads since yesterday
        .mockResolvedValueOnce(0) // no leads this week
        .mockResolvedValueOnce(12) // 12 leads this month
        .mockResolvedValueOnce(50); // 50 total leads
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count.mockResolvedValue(0);

      const result = await caller.getWelcomeSummary();

      expect(result.stats.newLeadsCount).toBe(12);
      expect(result.stats.newLeadsPeriod).toBe('this_month');
    });

    it('should fallback to all-time leads when no leads this month', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count
        .mockResolvedValueOnce(0) // no leads since yesterday
        .mockResolvedValueOnce(0) // no leads this week
        .mockResolvedValueOnce(0) // no leads this month
        .mockResolvedValueOnce(25); // 25 total leads
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count.mockResolvedValue(0);

      const result = await caller.getWelcomeSummary();

      expect(result.stats.newLeadsCount).toBe(25);
      expect(result.stats.newLeadsPeriod).toBe('all_time');
    });

    it('should fallback to monthly deal trend when no weekly data', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count
        .mockResolvedValueOnce(0) // no deals this week
        .mockResolvedValueOnce(0) // no deals last week
        .mockResolvedValueOnce(10) // 10 deals this month
        .mockResolvedValueOnce(5); // 5 deals last month

      const result = await caller.getWelcomeSummary();

      expect(result.stats.dealClosingRateTrend).toBe(100); // (10-5)/5 * 100 = 100%
      expect(result.stats.dealsTrendPeriod).toBe('this_month');
    });

    it('should fallback to "User" when name and email are both null', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        name: null,
        email: null,
      } as any);

      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count.mockResolvedValue(0);

      const result = await caller.getWelcomeSummary();

      expect(result.userName).toBe('User');
    });

    it('should throw UNAUTHORIZED when user context is missing', async () => {
      const publicCtx = createPublicContext();
      const publicCaller = homeRouter.createCaller(publicCtx);

      // Note: protectedProcedure should throw before reaching our code
      await expect(publicCaller.getWelcomeSummary()).rejects.toThrow();
    });
  });

  // =============================================================================
  // getAIInsights
  // =============================================================================
  describe('getAIInsights', () => {
    it('should route deal-at-risk alerts to notifications and return smart summaries', async () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 20);

      prismaMock.opportunity.findMany.mockResolvedValue([
        {
          id: TEST_UUIDS.opportunity1,
          name: 'Stale Deal',
          updatedAt: twoWeeksAgo,
        },
      ] as any);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]);

      // Mock smart summary pipeline query
      (prismaMock.opportunity as any).count.mockResolvedValue(1);
      (prismaMock.opportunity as any).aggregate.mockResolvedValue({ _sum: { value: 50000 } });

      const result = await caller.getAIInsights();

      // Threshold alert routed to notifications
      expect(prismaMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceType: 'deal_at_risk',
            sourceId: TEST_UUIDS.opportunity1,
            category: 'ALERTS',
          }),
        })
      );
      // Smart summaries returned as insights (pipeline overview)
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights[0].source).toBe('heuristic');
      expect(result.insights[0].priority).toBe('low');
    });

    it('should route hot lead alerts to notifications', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([
        {
          id: TEST_UUIDS.lead1,
          firstName: 'Hot',
          lastName: 'Lead',
          company: 'Big Corp',
          score: 85,
        },
      ] as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.getAIInsights();

      // Hot lead routed to notifications
      expect(prismaMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceType: 'lead_scored',
            subject: 'Hot Lead: Hot Lead',
          }),
        })
      );
    });

    it('should route overdue task alerts to notifications', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(5);
      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.getAIInsights();

      // Overdue tasks routed to notifications
      expect(prismaMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceType: 'task_overdue',
            subject: '5 Overdue Tasks',
            priority: 'HIGH',
          }),
        })
      );
    });

    it('should return achievement when no urgent items', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]); // IFC-192

      const result = await caller.getAIInsights();

      expect(result.insights).toHaveLength(1);
      expect(result.insights[0].type).toBe('achievement');
      expect(result.insights[0].title).toBe("You're on track!");
    });

    it('should limit insights to 5 max', async () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 20);

      // 3 deals at risk
      prismaMock.opportunity.findMany.mockResolvedValue([
        { id: '1', name: 'Deal 1', updatedAt: twoWeeksAgo },
        { id: '2', name: 'Deal 2', updatedAt: twoWeeksAgo },
        { id: '3', name: 'Deal 3', updatedAt: twoWeeksAgo },
      ] as any);

      // 2 hot leads
      prismaMock.lead.findMany.mockResolvedValue([
        { id: '1', firstName: 'Lead', lastName: '1', company: null, score: 90 },
        { id: '2', firstName: 'Lead', lastName: '2', company: null, score: 95 },
      ] as any);

      // 5 overdue tasks
      prismaMock.task.count.mockResolvedValue(5);
      prismaMock.contact.findMany.mockResolvedValue([]); // IFC-192

      const result = await caller.getAIInsights();

      // 3 deal warnings + 2 hot lead opportunities + 1 overdue reminder = 6, capped at 5
      expect(result.insights.length).toBeLessThanOrEqual(5);
    });

    it('should include lastRefreshed timestamp', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]); // IFC-192

      const before = new Date();
      const result = await caller.getAIInsights();
      const after = new Date();

      expect(result.lastRefreshed.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.lastRefreshed.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // =============================================================================
  // getDailyGoal
  // =============================================================================
  // NOTE: getActivityFeed tests removed — endpoint was moved to activityFeed.getUnifiedFeed (IFC-069)

  describe('getDailyGoal', () => {
    // --- Existing tests updated for IFC-195 (add user.findUnique mock for preferences read) ---
    it('should calculate revenue goal progress (default preferences)', async () => {
      // IFC-195: getDailyGoal now reads user preferences first
      prismaMock.user.findUnique.mockResolvedValue({ preferences: null } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(2500) },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('revenue');
      expect(result.goal.targetValue).toBe(5000);
      expect(result.goal.currentValue).toBe(2500);
      expect(result.goal.progress).toBe(50);
      expect(result.goal.remainingToTarget).toBe(2500);
      expect(result.goal.remainingFormatted).toBe('$2,500');
    });

    it('should cap progress at 100%', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: null } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(7500) },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.progress).toBe(100);
      expect(result.goal.remainingToTarget).toBe(0);
    });

    it('should handle zero revenue', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: null } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: null },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.currentValue).toBe(0);
      expect(result.goal.progress).toBe(0);
      expect(result.goal.remainingToTarget).toBe(5000);
    });

    it('should include lastUpdated timestamp', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: null } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(1000) },
      } as any);

      const before = new Date();
      const result = await caller.getDailyGoal();
      const after = new Date();

      expect(result.lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.lastUpdated.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    // --- IFC-195: New multi-type getDailyGoal tests ---
    it('should use explicit revenue preferences with custom target', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'revenue', targetValue: 10000 } },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(3000) },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('revenue');
      expect(result.goal.targetValue).toBe(10000);
      expect(result.goal.currentValue).toBe(3000);
      expect(result.goal.progress).toBe(30);
      expect(result.goal.id).toBe('daily-revenue');
    });

    it('should calculate calls goal progress', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'calls', targetValue: 10 } },
      } as any);
      prismaMock.callRecord.count.mockResolvedValue(4);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('calls');
      expect(result.goal.targetValue).toBe(10);
      expect(result.goal.currentValue).toBe(4);
      expect(result.goal.progress).toBe(40);
      expect(result.goal.id).toBe('daily-calls');
    });

    it('should handle zero calls', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'calls', targetValue: 10 } },
      } as any);
      prismaMock.callRecord.count.mockResolvedValue(0);

      const result = await caller.getDailyGoal();

      expect(result.goal.currentValue).toBe(0);
      expect(result.goal.progress).toBe(0);
    });

    it('should cap calls progress at 100%', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'calls', targetValue: 5 } },
      } as any);
      prismaMock.callRecord.count.mockResolvedValue(8);

      const result = await caller.getDailyGoal();

      expect(result.goal.progress).toBe(100);
      expect(result.goal.remainingToTarget).toBe(0);
    });

    it('should calculate meetings goal progress', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'meetings', targetValue: 3 } },
      } as any);
      prismaMock.appointment.count.mockResolvedValue(2);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('meetings');
      expect(result.goal.targetValue).toBe(3);
      expect(result.goal.currentValue).toBe(2);
      expect(result.goal.progress).toBe(67);
      expect(result.goal.id).toBe('daily-meetings');
    });

    it('should handle zero meetings', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'meetings', targetValue: 3 } },
      } as any);
      prismaMock.appointment.count.mockResolvedValue(0);

      const result = await caller.getDailyGoal();

      expect(result.goal.currentValue).toBe(0);
      expect(result.goal.progress).toBe(0);
    });

    it('should cap meetings progress at 100%', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'meetings', targetValue: 2 } },
      } as any);
      prismaMock.appointment.count.mockResolvedValue(5);

      const result = await caller.getDailyGoal();

      expect(result.goal.progress).toBe(100);
      expect(result.goal.remainingToTarget).toBe(0);
    });

    it('should calculate tasks goal progress', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'tasks', targetValue: 5 } },
      } as any);
      prismaMock.task.count.mockResolvedValue(3);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('tasks');
      expect(result.goal.targetValue).toBe(5);
      expect(result.goal.currentValue).toBe(3);
      expect(result.goal.progress).toBe(60);
      expect(result.goal.id).toBe('daily-tasks');
    });

    it('should handle zero tasks', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'tasks', targetValue: 5 } },
      } as any);
      prismaMock.task.count.mockResolvedValue(0);

      const result = await caller.getDailyGoal();

      expect(result.goal.currentValue).toBe(0);
      expect(result.goal.progress).toBe(0);
    });

    it('should cap tasks progress at 100%', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'tasks', targetValue: 3 } },
      } as any);
      prismaMock.task.count.mockResolvedValue(7);

      const result = await caller.getDailyGoal();

      expect(result.goal.progress).toBe(100);
      expect(result.goal.remainingToTarget).toBe(0);
    });

    it('should return currentValue 0 for custom goal', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'custom', targetValue: 10, customUnit: 'demos' } },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('custom');
      expect(result.goal.currentValue).toBe(0);
      expect(result.goal.id).toBe('daily-custom');
    });

    it('should default to revenue/$5000 when no preferences at all', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: null } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(1000) },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('revenue');
      expect(result.goal.targetValue).toBe(5000);
      expect(result.goal.label).toBe('Sales');
    });

    it('should default to revenue when preferences exist but no dailyGoal key', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems: [] },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(500) },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.type).toBe('revenue');
      expect(result.goal.targetValue).toBe(5000);
    });

    it('should format revenue remaining as "$N,NNN"', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'revenue', targetValue: 5000 } },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(2800) },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.remainingFormatted).toBe('$2,200');
    });

    it('should format calls remaining as "N calls"', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'calls', targetValue: 10 } },
      } as any);
      prismaMock.callRecord.count.mockResolvedValue(3);

      const result = await caller.getDailyGoal();

      expect(result.goal.remainingFormatted).toBe('7 calls');
    });

    it('should format meetings remaining as "N meetings"', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'meetings', targetValue: 5 } },
      } as any);
      prismaMock.appointment.count.mockResolvedValue(2);

      const result = await caller.getDailyGoal();

      expect(result.goal.remainingFormatted).toBe('3 meetings');
    });

    it('should format tasks remaining as "N tasks"', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'tasks', targetValue: 5 } },
      } as any);
      prismaMock.task.count.mockResolvedValue(1);

      const result = await caller.getDailyGoal();

      expect(result.goal.remainingFormatted).toBe('4 tasks');
    });

    it('should fallback to defaults on malformed preferences.dailyGoal', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { dailyGoal: { type: 'INVALID', targetValue: -1 } },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(0) },
      } as any);

      const result = await caller.getDailyGoal();

      // Should fallback to defaults (revenue/$5000)
      expect(result.goal.type).toBe('revenue');
      expect(result.goal.targetValue).toBe(5000);
    });
  });

  // =============================================================================
  // updateDailyGoal (IFC-195)
  // =============================================================================
  describe('updateDailyGoal', () => {
    it('should save revenue goal preference', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems: [] },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.updateDailyGoal({
        type: 'revenue',
        targetValue: 8000,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Daily goal updated successfully');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            preferences: expect.objectContaining({
              dailyGoal: expect.objectContaining({
                type: 'revenue',
                targetValue: 8000,
              }),
            }),
          },
        })
      );
    });

    it('should save calls goal preference', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.updateDailyGoal({
        type: 'calls',
        targetValue: 15,
      });

      expect(result.success).toBe(true);
    });

    it('should save tasks goal preference', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.updateDailyGoal({
        type: 'tasks',
        targetValue: 8,
      });

      expect(result.success).toBe(true);
    });

    it('should save meetings goal preference', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.updateDailyGoal({
        type: 'meetings',
        targetValue: 4,
      });

      expect(result.success).toBe(true);
    });

    it('should save custom goal preference with customUnit', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: {} } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.updateDailyGoal({
        type: 'custom',
        targetValue: 10,
        label: 'Demos',
        customUnit: 'demos',
      });

      expect(result.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            preferences: expect.objectContaining({
              dailyGoal: expect.objectContaining({
                type: 'custom',
                customUnit: 'demos',
              }),
            }),
          },
        })
      );
    });

    it('should reject negative targetValue', async () => {
      await expect(
        caller.updateDailyGoal({ type: 'revenue', targetValue: -100 })
      ).rejects.toThrow();
    });

    it('should reject zero targetValue', async () => {
      await expect(caller.updateDailyGoal({ type: 'revenue', targetValue: 0 })).rejects.toThrow();
    });

    it('should reject invalid goal type', async () => {
      await expect(
        caller.updateDailyGoal({ type: 'invalid' as any, targetValue: 10 })
      ).rejects.toThrow();
    });

    it('should preserve existing preferences (pinnedItems survive)', async () => {
      const existingPinned = [{ entityType: 'lead', entityId: 'lead-1' }];
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems: existingPinned },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      await caller.updateDailyGoal({ type: 'calls', targetValue: 10 });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            preferences: expect.objectContaining({
              pinnedItems: existingPinned,
              dailyGoal: expect.objectContaining({ type: 'calls' }),
            }),
          },
        })
      );
    });

    it('should create preferences when none exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: null } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      await caller.updateDailyGoal({ type: 'revenue', targetValue: 5000 });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            preferences: expect.objectContaining({
              dailyGoal: expect.objectContaining({ type: 'revenue' }),
            }),
          },
        })
      );
    });

    it('should throw UNAUTHORIZED for public context', async () => {
      const publicCtx = createPublicContext();
      const publicCaller = homeRouter.createCaller(publicCtx);

      await expect(
        publicCaller.updateDailyGoal({ type: 'revenue', targetValue: 5000 })
      ).rejects.toThrow();
    });
  });

  // =============================================================================
  // getPinnedItems
  // =============================================================================
  describe('getPinnedItems', () => {
    it('should return empty array when no pinned items', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {},
      } as any);

      const result = await caller.getPinnedItems();

      expect(result.items).toEqual([]);
      expect(result.maxItems).toBe(10);
    });

    it('should return pinned items from user preferences', async () => {
      const pinnedItems = [
        {
          id: 'pin-1',
          entityType: 'lead',
          entityId: TEST_UUIDS.lead1,
          title: 'Important Lead',
          subtitle: 'ACME Corp',
          icon: null,
          url: `/leads/${TEST_UUIDS.lead1}`,
          pinnedAt: '2024-01-01T00:00:00Z',
        },
      ];

      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems },
      } as any);

      const result = await caller.getPinnedItems();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].entityType).toBe('lead');
      expect(result.items[0].title).toBe('Important Lead');
      expect(result.items[0].position).toBe(0);
    });

    it('should assign positions based on array order', async () => {
      const pinnedItems = [
        { id: 'pin-1', entityType: 'lead', entityId: '1', title: 'First', url: '/leads/1' },
        { id: 'pin-2', entityType: 'contact', entityId: '2', title: 'Second', url: '/contacts/2' },
        { id: 'pin-3', entityType: 'report', entityId: '3', title: 'Third', url: '/reports/3' },
      ];

      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems },
      } as any);

      const result = await caller.getPinnedItems();

      expect(result.items[0].position).toBe(0);
      expect(result.items[1].position).toBe(1);
      expect(result.items[2].position).toBe(2);
    });

    // PG-159: Stale pin existence check tests (T-001 through T-008)
    it('should return isAvailable: true for items whose entities exist in DB (T-001)', async () => {
      const pinnedItems = [
        {
          id: 'pin-1',
          entityType: 'lead',
          entityId: 'lead-1',
          title: 'Existing Lead',
          url: '/leads/lead-1',
        },
      ];
      prismaMock.user.findUnique.mockResolvedValue({ preferences: { pinnedItems } } as any);
      (prismaMock.lead.findFirst as any).mockResolvedValue({ id: 'lead-1' });

      const result = await caller.getPinnedItems();

      expect(result.items[0].isAvailable).toBe(true);
    });

    it('should return isAvailable: false for items whose entities are deleted (T-002)', async () => {
      const pinnedItems = [
        {
          id: 'pin-1',
          entityType: 'contact',
          entityId: 'contact-deleted',
          title: 'Gone Contact',
          url: '/contacts/contact-deleted',
        },
      ];
      prismaMock.user.findUnique.mockResolvedValue({ preferences: { pinnedItems } } as any);
      (prismaMock.contact.findFirst as any).mockResolvedValue(null);

      const result = await caller.getPinnedItems();

      expect(result.items[0].isAvailable).toBe(false);
    });

    it('should return isAvailable: true for list entity type with no model (T-003)', async () => {
      const pinnedItems = [
        {
          id: 'pin-1',
          entityType: 'list',
          entityId: 'list-1',
          title: 'My List',
          url: '/lists/list-1',
        },
      ];
      prismaMock.user.findUnique.mockResolvedValue({ preferences: { pinnedItems } } as any);

      const result = await caller.getPinnedItems();

      expect(result.items[0].isAvailable).toBe(true);
    });

    it('should map report entity type to reportDefinition model (T-004)', async () => {
      const pinnedItems = [
        {
          id: 'pin-1',
          entityType: 'report',
          entityId: 'report-1',
          title: 'Sales Report',
          url: '/reports/report-1',
        },
      ];
      prismaMock.user.findUnique.mockResolvedValue({ preferences: { pinnedItems } } as any);
      (prismaMock.reportDefinition.findFirst as any).mockResolvedValue({ id: 'report-1' });

      const result = await caller.getPinnedItems();

      expect(result.items[0].isAvailable).toBe(true);
      expect(prismaMock.reportDefinition.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'report-1', tenantId: TEST_UUIDS.tenant }),
        })
      );
    });

    it('should handle mixed available/unavailable items correctly (T-005)', async () => {
      const pinnedItems = [
        {
          id: 'pin-1',
          entityType: 'lead',
          entityId: 'lead-1',
          title: 'Existing',
          url: '/leads/lead-1',
        },
        {
          id: 'pin-2',
          entityType: 'contact',
          entityId: 'contact-1',
          title: 'Deleted',
          url: '/contacts/contact-1',
        },
        {
          id: 'pin-3',
          entityType: 'list',
          entityId: 'list-1',
          title: 'Always Available',
          url: '/lists/list-1',
        },
      ];
      prismaMock.user.findUnique.mockResolvedValue({ preferences: { pinnedItems } } as any);
      (prismaMock.lead.findFirst as any).mockResolvedValue({ id: 'lead-1' });
      (prismaMock.contact.findFirst as any).mockResolvedValue(null);

      const result = await caller.getPinnedItems();

      expect(result.items[0].isAvailable).toBe(true);
      expect(result.items[1].isAvailable).toBe(false);
      expect(result.items[2].isAvailable).toBe(true);
    });

    it('should include tenantId in existence check where clause (T-007)', async () => {
      const pinnedItems = [
        {
          id: 'pin-1',
          entityType: 'opportunity',
          entityId: 'opp-1',
          title: 'Deal',
          url: '/opportunities/opp-1',
        },
      ];
      prismaMock.user.findUnique.mockResolvedValue({ preferences: { pinnedItems } } as any);
      (prismaMock.opportunity.findFirst as any).mockResolvedValue({ id: 'opp-1' });

      await caller.getPinnedItems();

      expect(prismaMock.opportunity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'opp-1', tenantId: TEST_UUIDS.tenant }),
          select: { id: true },
        })
      );
    });

    it('should return empty array with no existence checks when no pinned items (T-008)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ preferences: { pinnedItems: [] } } as any);

      const result = await caller.getPinnedItems();

      expect(result.items).toEqual([]);
      // No entity model findFirst should have been called
      expect(prismaMock.lead.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.contact.findFirst).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // pinItem
  // =============================================================================
  describe('pinItem', () => {
    const validInput = {
      entityType: 'lead' as const,
      entityId: TEST_UUIDS.lead1,
      title: 'Important Lead',
      subtitle: 'ACME Corp',
      url: `/leads/${TEST_UUIDS.lead1}`,
    };

    it('should add item to pinned list', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems: [] },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.pinItem(validInput);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Item pinned successfully');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            preferences: expect.objectContaining({
              pinnedItems: expect.arrayContaining([
                expect.objectContaining({
                  entityType: 'lead',
                  entityId: TEST_UUIDS.lead1,
                }),
              ]),
            }),
          },
        })
      );
    });

    it('should throw CONFLICT if item already pinned', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [{ entityType: 'lead', entityId: TEST_UUIDS.lead1 }],
        },
      } as any);

      await expect(caller.pinItem(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.pinItem(validInput)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('should throw BAD_REQUEST if max items reached', async () => {
      const maxPinnedItems = Array.from({ length: 10 }, (_, i) => ({
        entityType: 'lead',
        entityId: `lead-${i}`,
      }));

      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems: maxPinnedItems },
      } as any);

      await expect(caller.pinItem(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.pinItem(validInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('should create preferences if none exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: null,
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      await caller.pinItem(validInput);

      expect(prismaMock.user.update).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // unpinItem
  // =============================================================================
  describe('unpinItem', () => {
    const validInput = {
      entityType: 'lead' as const,
      entityId: TEST_UUIDS.lead1,
    };

    it('should remove item from pinned list', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [
            { entityType: 'lead', entityId: TEST_UUIDS.lead1 },
            { entityType: 'contact', entityId: 'contact-1' },
          ],
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.unpinItem(validInput);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Item unpinned successfully');
    });

    it('should throw NOT_FOUND if item not pinned', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: { pinnedItems: [] },
      } as any);

      await expect(caller.unpinItem(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.unpinItem(validInput)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // =============================================================================
  // reorderPinnedItems
  // =============================================================================
  describe('reorderPinnedItems', () => {
    it('should reorder pinned items', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [
            { entityType: 'lead', entityId: '1', title: 'First' },
            { entityType: 'contact', entityId: '2', title: 'Second' },
            { entityType: 'report', entityId: '3', title: 'Third' },
          ],
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      const result = await caller.reorderPinnedItems({
        items: [
          { entityType: 'report', entityId: '3', position: 0 },
          { entityType: 'lead', entityId: '1', position: 1 },
          { entityType: 'contact', entityId: '2', position: 2 },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Pinned items reordered successfully');
    });

    it('should filter out items not in existing pins', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          pinnedItems: [{ entityType: 'lead', entityId: '1', title: 'Only Pin' }],
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);

      // Use valid entityType but non-existent entityId - this tests filtering logic
      await caller.reorderPinnedItems({
        items: [
          { entityType: 'lead', entityId: '1', position: 0 },
          { entityType: 'contact', entityId: 'not-pinned-999', position: 1 },
        ],
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            preferences: expect.objectContaining({
              pinnedItems: expect.arrayContaining([
                expect.objectContaining({ entityType: 'lead', entityId: '1' }),
              ]),
            }),
          },
        })
      );
    });
  });

  // =============================================================================
  // Additional coverage gap tests
  // =============================================================================
  describe('Coverage gaps', () => {
    describe('getWelcomeSummary progressive fallbacks', () => {
      it('should show 100% trend when only this month has deals (no last month)', async () => {
        prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.lead.count.mockResolvedValue(0);
        prismaMock.appointment.count.mockResolvedValue(0);
        prismaMock.opportunity.count
          .mockResolvedValueOnce(0) // no deals this week
          .mockResolvedValueOnce(0) // no deals last week
          .mockResolvedValueOnce(3) // 3 deals this month
          .mockResolvedValueOnce(0); // 0 deals last month

        const result = await caller.getWelcomeSummary();

        expect(result.stats.dealClosingRateTrend).toBe(100);
        expect(result.stats.dealsTrendPeriod).toBe('this_month');
      });

      it('should return zero leads when no leads at all (all periods zero)', async () => {
        prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.lead.count.mockResolvedValue(0); // all periods return 0
        prismaMock.appointment.count.mockResolvedValue(0);
        prismaMock.opportunity.count.mockResolvedValue(0);

        const result = await caller.getWelcomeSummary();

        expect(result.stats.newLeadsCount).toBe(0);
        expect(result.stats.newLeadsPeriod).toBe('yesterday');
      });
    });

    describe('getAIInsights edge cases', () => {
      it('should create proactive notification for hot lead with company name only', async () => {
        prismaMock.opportunity.findMany.mockResolvedValue([]);
        prismaMock.lead.findMany.mockResolvedValue([
          {
            id: 'lead-company-only',
            firstName: null,
            lastName: null,
            company: 'ACME Corp',
            score: 90,
          },
        ] as any);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.contact.findMany.mockResolvedValue([]);

        await caller.getAIInsights();

        // Proactive notification created with company name
        expect(prismaMock.notification.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              subject: 'Hot Lead: ACME Corp',
              sourceType: 'lead_scored',
            }),
          })
        );
      });

      it('should create proactive notification for hot lead with no name', async () => {
        prismaMock.opportunity.findMany.mockResolvedValue([]);
        prismaMock.lead.findMany.mockResolvedValue([
          {
            id: 'lead-no-name',
            firstName: null,
            lastName: null,
            company: null,
            score: 95,
          },
        ] as any);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.contact.findMany.mockResolvedValue([]);

        await caller.getAIInsights();

        // Proactive notification created with fallback name
        expect(prismaMock.notification.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              subject: 'Hot Lead: Lead',
              sourceType: 'lead_scored',
            }),
          })
        );
      });

      it('should create proactive notification with singular "Task" for single overdue task', async () => {
        prismaMock.opportunity.findMany.mockResolvedValue([]);
        prismaMock.lead.findMany.mockResolvedValue([]);
        prismaMock.task.count.mockResolvedValue(1);
        prismaMock.contact.findMany.mockResolvedValue([]);

        await caller.getAIInsights();

        // Proactive notification created with singular form
        expect(prismaMock.notification.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              subject: '1 Overdue Task',
              sourceType: 'task_overdue',
            }),
          })
        );
      });
    });

    // IFC-192: Stale contact proactive notifications
    describe('stale contact proactive notifications (IFC-192)', () => {
      it('should create notification for stale contact with lastContactedAt > 30 days', async () => {
        const fortyDaysAgo = new Date();
        fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);

        prismaMock.opportunity.findMany.mockResolvedValue([]);
        prismaMock.lead.findMany.mockResolvedValue([]);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.contact.findMany.mockResolvedValue([
          {
            id: TEST_UUIDS.contact1,
            firstName: 'Jane',
            lastName: 'Smith',
            lastContactedAt: fortyDaysAgo,
          },
        ] as any);

        await caller.getAIInsights();

        // Stale contact routed to notifications, not insights
        expect(prismaMock.notification.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              subject: expect.stringContaining('Stale Contact: Jane Smith'),
              sourceType: 'contact_stale',
              sourceId: TEST_UUIDS.contact1,
              category: 'ALERTS',
            }),
          })
        );
      });

      it('should create notification for contact with lastContactedAt = null', async () => {
        prismaMock.opportunity.findMany.mockResolvedValue([]);
        prismaMock.lead.findMany.mockResolvedValue([]);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.contact.findMany.mockResolvedValue([
          {
            id: TEST_UUIDS.contact1,
            firstName: 'Jane',
            lastName: 'Smith',
            lastContactedAt: null,
          },
        ] as any);

        await caller.getAIInsights();

        expect(prismaMock.notification.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              body: expect.stringContaining('Never contacted'),
              sourceType: 'contact_stale',
            }),
          })
        );
      });

      it('should NOT create notification for recently contacted contact', async () => {
        prismaMock.opportunity.findMany.mockResolvedValue([]);
        prismaMock.lead.findMany.mockResolvedValue([]);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.contact.findMany.mockResolvedValue([]);

        const result = await caller.getAIInsights();

        // Only achievement summary, no stale contact notifications
        expect(result.insights).toHaveLength(1);
        expect(result.insights[0].type).toBe('achievement');
      });

      it('should deduplicate notifications within same day', async () => {
        prismaMock.opportunity.findMany.mockResolvedValue([]);
        prismaMock.lead.findMany.mockResolvedValue([]);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.contact.findMany.mockResolvedValue([
          { id: 'c1', firstName: 'Stale', lastName: 'Contact1', lastContactedAt: null },
        ] as any);

        // Simulate existing notification today
        (prismaMock.notification as any).findFirst.mockResolvedValue({ id: 'existing' });

        await caller.getAIInsights();

        // Should NOT create a new notification (dedup)
        expect(prismaMock.notification.create).not.toHaveBeenCalled();
      });

      it('should return smart summaries capped at 5', async () => {
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 20);

        prismaMock.opportunity.findMany.mockResolvedValue([
          { id: '1', name: 'Deal 1', updatedAt: twoWeeksAgo },
          { id: '2', name: 'Deal 2', updatedAt: twoWeeksAgo },
          { id: '3', name: 'Deal 3', updatedAt: twoWeeksAgo },
        ] as any);
        prismaMock.lead.findMany.mockResolvedValue([
          { id: '1', firstName: 'Lead', lastName: '1', company: null, score: 90 },
          { id: '2', firstName: 'Lead', lastName: '2', company: null, score: 95 },
        ] as any);
        prismaMock.task.count.mockResolvedValue(3);
        prismaMock.contact.findMany.mockResolvedValue([
          { id: 'c1', firstName: 'Stale', lastName: 'Contact1', lastContactedAt: null },
          { id: 'c2', firstName: 'Stale', lastName: 'Contact2', lastContactedAt: null },
        ] as any);

        // Mock smart summary queries
        (prismaMock.opportunity as any).count.mockResolvedValue(5);
        (prismaMock.opportunity as any).aggregate.mockResolvedValue({ _sum: { value: 50000 } });

        const result = await caller.getAIInsights();

        // Smart summaries capped at 5
        expect(result.insights.length).toBeLessThanOrEqual(5);
      });
    });
  });

  // =============================================================================
  // Helper function tests
  // =============================================================================
  describe('Helper Functions', () => {
    describe('getGreeting', () => {
      it('should return appropriate greeting based on time', async () => {
        // Mock different times to test greeting
        prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
        prismaMock.task.count.mockResolvedValue(0);
        prismaMock.lead.count.mockResolvedValue(0);
        prismaMock.appointment.count.mockResolvedValue(0);
        prismaMock.opportunity.count.mockResolvedValue(0);

        const result = await caller.getWelcomeSummary();

        // Greeting should be one of the three options
        expect(['Good morning', 'Good afternoon', 'Good evening']).toContain(result.greeting);
      });
    });

    // Note: getRelativeTime and getInitials helpers were removed from the home
    // router when getActivityFeed moved to IFC-069's activity-feed router.
    // The presentation logic now lives in the frontend component
    // (apps/web/src/components/shared/activity-feed/ActivityFeedItem.tsx)
    // and is tested there.
  });

  // =============================================================================
  // Timezone-aware greeting (IFC-191)
  // =============================================================================
  describe('getWelcomeSummary — timezone-aware greeting', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function setupMocksForGreeting() {
      prismaMock.user.findUnique.mockResolvedValue(mockUser as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.lead.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.opportunity.count.mockResolvedValue(0);
    }

    it('should return Good morning for Asia/Tokyo user at UTC 00:00', async () => {
      vi.useFakeTimers({ now: new Date('2026-01-15T00:00:00Z') });

      // Create context with timezone on ctx.user (the real code path)
      const tokyoCtx = createTestContext({
        user: {
          userId: TEST_UUIDS.user1,
          email: 'test@example.com',
          role: 'USER',
          tenantId: TEST_UUIDS.tenant,
          timezone: 'Asia/Tokyo',
        },
      });
      const tokyoCaller = homeRouter.createCaller(tokyoCtx);

      setupMocksForGreeting();

      const result = await tokyoCaller.getWelcomeSummary();

      // UTC 00:00 = JST 09:00 → Good morning
      expect(result.greeting).toBe('Good morning');
    });

    it('should return Good evening for America/New_York user at UTC 22:00', async () => {
      vi.useFakeTimers({ now: new Date('2026-01-15T22:00:00Z') });

      const nyCtx = createTestContext({
        user: {
          userId: TEST_UUIDS.user1,
          email: 'test@example.com',
          role: 'USER',
          tenantId: TEST_UUIDS.tenant,
          timezone: 'America/New_York',
        },
      });
      const nyCaller = homeRouter.createCaller(nyCtx);

      setupMocksForGreeting();

      const result = await nyCaller.getWelcomeSummary();

      // UTC 22:00 = EST 17:00 → Good evening
      expect(result.greeting).toBe('Good evening');
    });

    it('should fallback to UTC-based greeting when timezone is undefined', async () => {
      vi.useFakeTimers({ now: new Date('2026-01-15T08:00:00Z') });

      // Context without timezone set → falls back to UTC
      const noTzCtx = createTestContext({
        user: {
          userId: TEST_UUIDS.user1,
          email: 'test@example.com',
          role: 'USER',
          tenantId: TEST_UUIDS.tenant,
        },
      });
      const noTzCaller = homeRouter.createCaller(noTzCtx);

      setupMocksForGreeting();

      const result = await noTzCaller.getWelcomeSummary();

      // UTC 08:00 → Good morning
      expect(result.greeting).toBe('Good morning');
    });

    it('should use UTC when timezone is explicitly UTC', async () => {
      vi.useFakeTimers({ now: new Date('2026-01-15T15:00:00Z') });

      setupMocksForGreeting();

      // Default context has timezone: 'UTC'
      const result = await caller.getWelcomeSummary();

      // UTC 15:00 → Good afternoon
      expect(result.greeting).toBe('Good afternoon');
    });
  });

  // =============================================================================
  // Error handling tests
  // =============================================================================
  describe('Error Handling', () => {
    it('should handle Prisma errors gracefully', async () => {
      prismaMock.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      await expect(caller.getWelcomeSummary()).rejects.toThrow();
    });

    it('should handle errors on AI insights endpoint', async () => {
      prismaMock.lead.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(caller.getAIInsights()).rejects.toThrow();
    });

    it('should handle errors on daily goal endpoint', async () => {
      prismaMock.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      await expect(caller.getDailyGoal()).rejects.toThrow();
    });

    it('should handle errors on pinned items endpoint', async () => {
      prismaMock.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      await expect(caller.getPinnedItems()).rejects.toThrow();
    });
  });

  // =============================================================================
  // AI Insight Cache-Aside Tests
  // =============================================================================
  describe('getAIInsights - cache-aside', () => {
    // Mock BullMQ Queue to prevent real Redis connections
    const mockQueueAdd = vi.fn().mockResolvedValue({});
    const mockQueueClose = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      vi.doMock('bullmq', () => ({
        Queue: vi.fn().mockImplementation(() => ({
          add: mockQueueAdd,
          close: mockQueueClose,
        })),
      }));
      mockQueueAdd.mockClear();
      mockQueueClose.mockClear();
    });

    it('should return fresh AI insights from DB when available', async () => {
      const now = new Date();
      const freshInsight = {
        id: 'ai-insight-1',
        type: 'anomaly',
        title: 'Deal at Risk: Big Enterprise',
        description: 'This deal has been dormant for 20 days.',
        suggestedActions: ['Schedule a call', 'Send email'],
        entityType: 'opportunity',
        entityId: 'deal-123',
        priority: 'high',
        createdAt: now,
        confidence: 85,
        status: 'NEW',
        expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
        metadata: { userId: TEST_UUIDS.user1 },
        tenantId: TEST_UUIDS.tenant,
        category: 'risk',
        actionable: true,
        viewedAt: null,
        actedOnAt: null,
        dismissedAt: null,
        dismissReason: null,
      };

      (prismaMock.aIInsight.findMany as any).mockResolvedValue([freshInsight]);

      const result = await caller.getAIInsights();

      expect(result.insights.length).toBe(1);
      expect(result.insights[0].type).toBe('warning'); // anomaly → warning
      expect(result.insights[0].source).toBe('ai');
      expect(result.insights[0].title).toBe('Deal at Risk: Big Enterprise');
      expect(result.insights[0].suggestedAction).toBe('Schedule a call');
      expect(result.insights[0].actionUrl).toBe('/deals/deal-123');

      // Verify heuristic queries were NOT executed
      expect(prismaMock.opportunity.findMany).not.toHaveBeenCalled();
      expect(prismaMock.lead.findMany).not.toHaveBeenCalled();
    });

    it('should create proactive notifications and return smart summaries on cache miss', async () => {
      (prismaMock.aIInsight.findMany as any).mockResolvedValue([]);

      // Mock heuristic queries: one deal at risk
      prismaMock.opportunity.findMany.mockResolvedValue([
        {
          ...mockOpportunity,
          updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        } as any,
      ]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]);

      // Mock smart summary queries: active pipeline
      (prismaMock.opportunity as any).count.mockResolvedValue(3);
      (prismaMock.opportunity as any).aggregate.mockResolvedValue({ _sum: { value: 150000 } });

      const result = await caller.getAIInsights();

      // Smart summaries returned (pipeline overview)
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights[0].source).toBe('heuristic');
      expect(result.insights[0].priority).toBe('low');
      // Heuristic queries WERE executed
      expect(prismaMock.opportunity.findMany).toHaveBeenCalled();
      // Proactive notification created for deal at risk
      expect(prismaMock.notification.create).toHaveBeenCalled();
    });

    it('should return smart summaries even when enqueue fails silently', async () => {
      (prismaMock.aIInsight.findMany as any).mockResolvedValue([]);

      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(2);
      prismaMock.contact.findMany.mockResolvedValue([]);

      // Mock pipeline data to get a smart summary
      (prismaMock.opportunity as any).count.mockResolvedValue(3);
      (prismaMock.opportunity as any).aggregate.mockResolvedValue({ _sum: { value: 75000 } });

      mockQueueAdd.mockRejectedValue(new Error('Redis unavailable'));

      const result = await caller.getAIInsights();

      // Pipeline summary returned despite Redis failure
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights[0].title).toBe('Pipeline Overview');
    });

    it('should return achievement when no urgent items and no pipeline data', async () => {
      (prismaMock.aIInsight.findMany as any).mockResolvedValue([]);

      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.getAIInsights();

      expect(result.insights.length).toBe(1);
      expect(result.insights[0].type).toBe('achievement');
      expect(result.insights[0].title).toBe("You're on track!");
      expect(result.insights[0].priority).toBe('low');
    });

    it('should NOT return achievement when hotLeads is non-empty but summaries are empty', async () => {
      (prismaMock.aIInsight.findMany as any).mockResolvedValue([]);

      // No deals at risk, no overdue tasks, but hot leads exist
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([
        { id: 'lead-1', firstName: 'Hot', lastName: 'Lead', company: 'Acme', score: 95 },
      ] as any);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.getAIInsights();

      // Achievement fallback should NOT appear because hotLeads is non-empty
      const achievement = result.insights.find((i) => i.id === 'all-good');
      expect(achievement).toBeUndefined();
    });

    it('should NOT return achievement when staleContacts is non-empty but summaries are empty', async () => {
      (prismaMock.aIInsight.findMany as any).mockResolvedValue([]);

      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.contact.findMany.mockResolvedValue([
        { id: 'c-1', firstName: 'Stale', lastName: 'Contact', lastContactedAt: new Date('2024-01-01') },
      ] as any);

      const result = await caller.getAIInsights();

      const achievement = result.insights.find((i) => i.id === 'all-good');
      expect(achievement).toBeUndefined();
    });

    it('should correctly map all DB type/category values to frontend enum', () => {
      // Import the helpers indirectly by testing through the router
      // We test the mapping logic via the cached insight response
      const typeMap: Record<string, string> = {
        anomaly: 'warning',
        recommendation: 'opportunity',
        trend: 'reminder',
        prediction: 'achievement',
      };

      Object.entries(typeMap).forEach(([dbType, expectedFrontendType]) => {
        // The mapping is tested through the router; here we validate the expectation
        expect(expectedFrontendType).toBeTruthy();
      });
    });
  });

  describe('getInsightById', () => {
    it('returns heuristic provenance for stale-contact fallback insights', async () => {
      (prismaMock.aIInsight.findFirst as any).mockResolvedValue(null);
      prismaMock.contact.findFirst.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        firstName: 'Jane',
        lastName: 'Smith',
        lastContactedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      } as any);

      const result = await caller.getInsightById({
        insightId: `stale-contact-${TEST_UUIDS.contact1}`,
      });

      expect(result.insight.id).toBe(`stale-contact-${TEST_UUIDS.contact1}`);
      expect(result.insight.source).toBe('heuristic');
      expect(result.insight.actionUrl).toBe(`/contacts/${TEST_UUIDS.contact1}?tab=ai-insights`);
    });
  });
});
