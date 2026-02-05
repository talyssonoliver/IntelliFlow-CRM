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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
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
        .mockResolvedValueOnce(5)  // new leads since yesterday
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
        .mockResolvedValueOnce(0)  // no leads since yesterday
        .mockResolvedValueOnce(7)  // 7 leads this week
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
        .mockResolvedValueOnce(0)  // no leads since yesterday
        .mockResolvedValueOnce(0)  // no leads this week
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
        .mockResolvedValueOnce(0)  // no leads since yesterday
        .mockResolvedValueOnce(0)  // no leads this week
        .mockResolvedValueOnce(0)  // no leads this month
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
        .mockResolvedValueOnce(0)  // no deals this week
        .mockResolvedValueOnce(0)  // no deals last week
        .mockResolvedValueOnce(10) // 10 deals this month
        .mockResolvedValueOnce(5); // 5 deals last month

      const result = await caller.getWelcomeSummary();

      expect(result.stats.dealClosingRateTrend).toBe(100); // (10-5)/5 * 100 = 100%
      expect(result.stats.dealsTrendPeriod).toBe('this_month');
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
    it('should return warning insights for deals at risk', async () => {
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

      const result = await caller.getAIInsights();

      expect(result.insights).toHaveLength(1);
      expect(result.insights[0].type).toBe('warning');
      expect(result.insights[0].title).toContain('Deal at Risk');
      expect(result.insights[0].entityType).toBe('opportunity');
      expect(result.insights[0].actionUrl).toBe(`/deals/${TEST_UUIDS.opportunity1}`);
    });

    it('should return opportunity insights for hot leads', async () => {
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

      const result = await caller.getAIInsights();

      expect(result.insights).toHaveLength(1);
      expect(result.insights[0].type).toBe('opportunity');
      expect(result.insights[0].title).toBe('Hot Lead Detected');
      expect(result.insights[0].description).toContain('score of 85');
    });

    it('should return reminder insights for overdue tasks', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(5);

      const result = await caller.getAIInsights();

      expect(result.insights).toHaveLength(1);
      expect(result.insights[0].type).toBe('reminder');
      expect(result.insights[0].title).toBe('5 Overdue Tasks');
      expect(result.insights[0].actionUrl).toBe('/tasks?filter=overdue');
    });

    it('should return achievement when no urgent items', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);

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

      const result = await caller.getAIInsights();

      // 3 deal warnings + 2 hot lead opportunities + 1 overdue reminder = 6, capped at 5
      expect(result.insights.length).toBeLessThanOrEqual(5);
    });

    it('should include lastRefreshed timestamp', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);

      const before = new Date();
      const result = await caller.getAIInsights();
      const after = new Date();

      expect(result.lastRefreshed.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.lastRefreshed.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // =============================================================================
  // getActivityFeed
  // =============================================================================
  describe('getActivityFeed', () => {
    it('should return activity feed from audit logs', async () => {
      const mockAuditLog = {
        id: 'audit-1',
        eventType: 'LEAD_CREATED',
        resourceType: 'Lead',
        resourceId: TEST_UUIDS.lead1,
        timestamp: new Date(),
        actorType: 'USER',
        user: {
          id: TEST_UUIDS.user1,
          name: 'John Doe',
          avatarUrl: null,
        },
      };

      prismaMock.auditLogEntry.findMany.mockResolvedValue([mockAuditLog] as any);

      const result = await caller.getActivityFeed({ limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('lead');
      expect(result.items[0].title).toBe('LEAD_CREATED');
      expect(result.items[0].actor?.name).toBe('John Doe');
      expect(result.hasMore).toBe(false);
    });

    it('should identify different activity types from eventType', async () => {
      const logs = [
        { id: '1', eventType: 'EMAIL_SENT', resourceType: 'Email', resourceId: '1', timestamp: new Date(), actorType: 'USER', user: null },
        { id: '2', eventType: 'CALL_LOGGED', resourceType: 'Call', resourceId: '2', timestamp: new Date(), actorType: 'USER', user: null },
        { id: '3', eventType: 'TASK_COMPLETED', resourceType: 'Task', resourceId: '3', timestamp: new Date(), actorType: 'USER', user: null },
        { id: '4', eventType: 'DEAL_CLOSED', resourceType: 'Deal', resourceId: '4', timestamp: new Date(), actorType: 'USER', user: null },
        { id: '5', eventType: 'AI_SCORE_GENERATED', resourceType: 'Lead', resourceId: '5', timestamp: new Date(), actorType: 'AI_AGENT', user: null },
      ];

      prismaMock.auditLogEntry.findMany.mockResolvedValue(logs as any);

      const result = await caller.getActivityFeed({ limit: 10 });

      expect(result.items[0].type).toBe('email');
      expect(result.items[1].type).toBe('call');
      expect(result.items[2].type).toBe('task');
      expect(result.items[3].type).toBe('deal');
      expect(result.items[4].type).toBe('ai');
    });

    it('should support cursor-based pagination', async () => {
      const logs = Array.from({ length: 6 }, (_, i) => ({
        id: `audit-${i}`,
        eventType: 'SYSTEM_EVENT',
        resourceType: 'System',
        resourceId: `${i}`,
        timestamp: new Date(),
        actorType: 'SYSTEM',
        user: null,
      }));

      prismaMock.auditLogEntry.findMany.mockResolvedValue(logs as any);

      const result = await caller.getActivityFeed({ limit: 5 });

      expect(result.items).toHaveLength(5);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('audit-4');
    });

    it('should filter by cursor when provided', async () => {
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);

      await caller.getActivityFeed({ limit: 5, cursor: 'previous-cursor' });

      expect(prismaMock.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { lt: 'previous-cursor' },
          }),
        })
      );
    });

    it('should return relative time for timestamps', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      prismaMock.auditLogEntry.findMany.mockResolvedValue([
        {
          id: 'audit-1',
          eventType: 'SYSTEM_EVENT',
          resourceType: 'System',
          resourceId: '1',
          timestamp: fiveMinutesAgo,
          actorType: 'SYSTEM',
          user: null,
        },
      ] as any);

      const result = await caller.getActivityFeed({ limit: 5 });

      expect(result.items[0].relativeTime).toBe('5m ago');
    });

    it('should generate initials from user name', async () => {
      prismaMock.auditLogEntry.findMany.mockResolvedValue([
        {
          id: 'audit-1',
          eventType: 'SYSTEM_EVENT',
          resourceType: 'System',
          resourceId: '1',
          timestamp: new Date(),
          actorType: 'USER',
          user: { id: '1', name: 'John Doe', avatarUrl: null },
        },
      ] as any);

      const result = await caller.getActivityFeed({ limit: 5 });

      expect(result.items[0].actor?.initials).toBe('JD');
    });
  });

  // =============================================================================
  // getDailyGoal
  // =============================================================================
  describe('getDailyGoal', () => {
    it('should calculate revenue goal progress', async () => {
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
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(7500) },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.progress).toBe(100);
      expect(result.goal.remainingToTarget).toBe(0);
    });

    it('should handle zero revenue', async () => {
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: null },
      } as any);

      const result = await caller.getDailyGoal();

      expect(result.goal.currentValue).toBe(0);
      expect(result.goal.progress).toBe(0);
      expect(result.goal.remainingToTarget).toBe(5000);
    });

    it('should include lastUpdated timestamp', async () => {
      prismaMock.opportunity.aggregate.mockResolvedValue({
        _sum: { value: new Prisma.Decimal(1000) },
      } as any);

      const before = new Date();
      const result = await caller.getDailyGoal();
      const after = new Date();

      expect(result.lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.lastUpdated.getTime()).toBeLessThanOrEqual(after.getTime());
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
          pinnedItems: [
            { entityType: 'lead', entityId: '1', title: 'Only Pin' },
          ],
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
        expect(['Good morning', 'Good afternoon', 'Good evening']).toContain(
          result.greeting
        );
      });
    });

    describe('getRelativeTime', () => {
      it('should format timestamps correctly', async () => {
        const now = new Date();
        const timestamps = [
          { date: new Date(now.getTime() - 30 * 1000), expected: 'Just now' },
          { date: new Date(now.getTime() - 5 * 60 * 1000), expected: '5m ago' },
          { date: new Date(now.getTime() - 2 * 60 * 60 * 1000), expected: '2h ago' },
          { date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), expected: '3d ago' },
        ];

        for (const { date, expected } of timestamps) {
          prismaMock.auditLogEntry.findMany.mockResolvedValue([
            {
              id: 'test',
              eventType: 'TEST',
              resourceType: 'Test',
              resourceId: '1',
              timestamp: date,
              actorType: 'SYSTEM',
              user: null,
            },
          ] as any);

          const result = await caller.getActivityFeed({ limit: 1 });
          expect(result.items[0].relativeTime).toBe(expected);
        }
      });
    });

    describe('getInitials', () => {
      it('should generate initials from various name formats', async () => {
        const testCases = [
          { name: 'John Doe', expected: 'JD' },
          { name: 'Alice', expected: 'AL' },
          { name: 'Bob Smith Jr', expected: 'BJ' },
          { name: null, expected: '??' },
          { name: '', expected: '??' },
        ];

        for (const { name, expected } of testCases) {
          prismaMock.auditLogEntry.findMany.mockResolvedValue([
            {
              id: 'test',
              eventType: 'TEST',
              resourceType: 'Test',
              resourceId: '1',
              timestamp: new Date(),
              actorType: 'USER',
              user: { id: '1', name, avatarUrl: null },
            },
          ] as any);

          const result = await caller.getActivityFeed({ limit: 1 });
          expect(result.items[0].actor?.initials).toBe(expected);
        }
      });
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

    it('should validate input schemas', async () => {
      // Invalid limit
      await expect(
        caller.getActivityFeed({ limit: 100 }) // max is 50
      ).rejects.toThrow();

      // Invalid cursor type
      await expect(
        caller.getActivityFeed({ limit: 5, cursor: 123 as any })
      ).rejects.toThrow();
    });
  });
});
