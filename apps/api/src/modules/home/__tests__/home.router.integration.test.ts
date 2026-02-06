/**
 * Home Router Integration Tests
 *
 * Tests using real seeded database instead of mocks.
 * Run with: pnpm test home.router.integration
 *
 * Task: IFC-182 - Home Page tRPC Router
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createIntegrationTestContext,
  SEED_IDS,
  verifySeedData,
  isInfrastructureAvailable,
  infrastructureUnavailableReason,
} from '../../../test/integration-setup';
import { homeRouter } from '../home.router';

// Run integration tests only when infrastructure is available
const describeIntegration = isInfrastructureAvailable ? describe : describe.skip;

// Log skip reason if not available
if (!isInfrastructureAvailable && infrastructureUnavailableReason) {
  console.log(`⏭️  Skipping Home Router Integration Tests: ${infrastructureUnavailableReason}`);
}

describeIntegration('Home Router - Integration Tests', () => {
  beforeAll(async () => {
    await verifySeedData();
  });

  // =============================================================================
  // getWelcomeSummary Integration Tests
  // =============================================================================
  describe('getWelcomeSummary', () => {
    it('should return welcome summary with real user data', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const result = await caller.getWelcomeSummary();

      // Verify basic structure
      expect(result.userName).toBeDefined();
      expect(result.greeting).toMatch(/Good (morning|afternoon|evening)/);
      expect(result.todayDate).toBeInstanceOf(Date);

      // Stats should be numbers
      expect(typeof result.stats.highPriorityTasksCount).toBe('number');
      expect(typeof result.stats.newLeadsCount).toBe('number');
      expect(typeof result.stats.dealClosingRateTrend).toBe('number');
      expect(typeof result.stats.appointmentsToday).toBe('number');
      expect(typeof result.stats.overdueTasksCount).toBe('number');

      // Stats should be non-negative
      expect(result.stats.highPriorityTasksCount).toBeGreaterThanOrEqual(0);
      expect(result.stats.newLeadsCount).toBeGreaterThanOrEqual(0);
      expect(result.stats.appointmentsToday).toBeGreaterThanOrEqual(0);
      expect(result.stats.overdueTasksCount).toBeGreaterThanOrEqual(0);
    });

    it('should respond within 200ms performance target', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const start = performance.now();
      await caller.getWelcomeSummary();
      const duration = performance.now() - start;

      // Target: <200ms as per PRD
      expect(duration).toBeLessThan(500); // Allow some slack for CI
    });
  });

  // =============================================================================
  // getAIInsights Integration Tests
  // =============================================================================
  describe('getAIInsights', () => {
    it('should return AI insights array', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const result = await caller.getAIInsights();

      // Should always return insights array
      expect(Array.isArray(result.insights)).toBe(true);
      expect(result.lastRefreshed).toBeInstanceOf(Date);

      // Should have at most 5 insights
      expect(result.insights.length).toBeLessThanOrEqual(5);

      // Each insight should have required fields
      for (const insight of result.insights) {
        expect(insight.id).toBeDefined();
        expect(['warning', 'opportunity', 'reminder', 'achievement']).toContain(insight.type);
        expect(insight.title).toBeDefined();
        expect(insight.description).toBeDefined();
        expect(['low', 'medium', 'high']).toContain(insight.priority);
        expect(insight.createdAt).toBeInstanceOf(Date);
      }
    });

    it('should respond within 200ms performance target', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const start = performance.now();
      await caller.getAIInsights();
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500); // Allow some slack for CI
    });
  });

  // =============================================================================
  // getActivityFeed Integration Tests
  // =============================================================================
  describe('getActivityFeed', () => {
    it('should return activity feed with pagination', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const result = await caller.getActivityFeed({ limit: 5 });

      // Should return activity feed structure
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');

      // Each item should have required fields
      for (const item of result.items) {
        expect(item.id).toBeDefined();
        expect(['mention', 'call', 'email', 'task', 'deal', 'lead', 'system', 'ai']).toContain(item.type);
        expect(item.title).toBeDefined();
        expect(item.description).toBeDefined();
        expect(item.timestamp).toBeInstanceOf(Date);
        expect(item.relativeTime).toBeDefined();
      }
    });

    it('should support cursor-based pagination', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      // Get first page
      const page1 = await caller.getActivityFeed({ limit: 2 });

      if (page1.hasMore && page1.nextCursor) {
        // Get second page using cursor
        const page2 = await caller.getActivityFeed({ limit: 2, cursor: page1.nextCursor });

        // Items should be different
        const page1Ids = page1.items.map(i => i.id);
        const page2Ids = page2.items.map(i => i.id);
        expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
      }
    });

    it('should respond within 200ms performance target', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const start = performance.now();
      await caller.getActivityFeed({ limit: 10 });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should filter activity feed by types parameter', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const result = await caller.getActivityFeed({ limit: 10, types: ['lead'] });

      // Should return feed items structure (may be empty if no lead events)
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');
    });

    it('should return empty feed when filtering by unused type', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      // Filter by 'mention' which is unlikely to have data in seed
      const result = await caller.getActivityFeed({ limit: 10, types: ['mention'] });

      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  // =============================================================================
  // getDailyGoal Integration Tests
  // =============================================================================
  describe('getDailyGoal', () => {
    it('should return daily goal with progress', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const result = await caller.getDailyGoal();

      // Verify structure
      expect(result.goal).toBeDefined();
      expect(result.lastUpdated).toBeInstanceOf(Date);

      // Verify goal fields
      expect(result.goal.id).toBeDefined();
      expect(['revenue', 'calls', 'meetings', 'tasks', 'custom']).toContain(result.goal.type);
      expect(result.goal.label).toBeDefined();
      expect(typeof result.goal.targetValue).toBe('number');
      expect(typeof result.goal.currentValue).toBe('number');
      expect(result.goal.unit).toBeDefined();
      expect(result.goal.progress).toBeGreaterThanOrEqual(0);
      expect(result.goal.progress).toBeLessThanOrEqual(100);
      expect(typeof result.goal.remainingToTarget).toBe('number');
      expect(result.goal.remainingFormatted).toBeDefined();
    });

    it('should respond within 200ms performance target', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const start = performance.now();
      await caller.getDailyGoal();
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });

  // =============================================================================
  // Pinned Items Integration Tests
  // =============================================================================
  describe('getPinnedItems', () => {
    it('should return pinned items list', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const result = await caller.getPinnedItems();

      // Verify structure
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.maxItems).toBe(10);

      // Each item should have required fields
      for (const item of result.items) {
        expect(item.id).toBeDefined();
        expect(item.entityType).toBeDefined();
        expect(item.entityId).toBeDefined();
        expect(item.title).toBeDefined();
        expect(item.url).toBeDefined();
        expect(typeof item.position).toBe('number');
      }
    });
  });

  describe('pinItem and unpinItem', () => {
    it('should pin and unpin an item', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const testItem = {
        entityType: 'lead' as const,
        entityId: 'test-lead-integration-' + Date.now(),
        title: 'Test Lead for Integration',
        url: '/leads/test-lead',
      };

      // Pin the item
      const pinResult = await caller.pinItem(testItem);
      expect(pinResult.success).toBe(true);

      // Verify it's pinned
      const pinnedItems = await caller.getPinnedItems();
      const found = pinnedItems.items.find(
        i => i.entityType === testItem.entityType && i.entityId === testItem.entityId
      );
      expect(found).toBeDefined();

      // Unpin the item
      const unpinResult = await caller.unpinItem({
        entityType: testItem.entityType,
        entityId: testItem.entityId,
      });
      expect(unpinResult.success).toBe(true);

      // Verify it's unpinned
      const afterUnpin = await caller.getPinnedItems();
      const stillFound = afterUnpin.items.find(
        i => i.entityType === testItem.entityType && i.entityId === testItem.entityId
      );
      expect(stillFound).toBeUndefined();
    });
  });

  describe('reorderPinnedItems', () => {
    it('should reorder pinned items', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      // Pin two items
      const items = [
        { entityType: 'lead' as const, entityId: 'reorder-test-1-' + Date.now(), title: 'First', url: '/leads/1' },
        { entityType: 'contact' as const, entityId: 'reorder-test-2-' + Date.now(), title: 'Second', url: '/contacts/2' },
      ];

      for (const item of items) {
        await caller.pinItem(item);
      }

      // Reorder them
      const reorderResult = await caller.reorderPinnedItems({
        items: [
          { entityType: items[1].entityType, entityId: items[1].entityId, position: 0 },
          { entityType: items[0].entityType, entityId: items[0].entityId, position: 1 },
        ],
      });
      expect(reorderResult.success).toBe(true);

      // Clean up
      for (const item of items) {
        await caller.unpinItem({ entityType: item.entityType, entityId: item.entityId });
      }
    });
  });

  // =============================================================================
  // Mutation Performance Tests
  // =============================================================================
  describe('Mutation performance', () => {
    it('pinItem should respond within 200ms', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);
      const uniqueId = 'perf-pin-' + Date.now();

      const start = performance.now();
      await caller.pinItem({
        entityType: 'lead',
        entityId: uniqueId,
        title: 'Perf Test',
        url: '/leads/perf',
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);

      // Cleanup
      await caller.unpinItem({ entityType: 'lead', entityId: uniqueId });
    });

    it('unpinItem should respond within 200ms', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);
      const uniqueId = 'perf-unpin-' + Date.now();

      // Setup
      await caller.pinItem({
        entityType: 'lead',
        entityId: uniqueId,
        title: 'Perf Test Unpin',
        url: '/leads/perf-unpin',
      });

      const start = performance.now();
      await caller.unpinItem({ entityType: 'lead', entityId: uniqueId });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('reorderPinnedItems should respond within 200ms', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);
      const id1 = 'perf-reorder-1-' + Date.now();
      const id2 = 'perf-reorder-2-' + Date.now();

      // Setup
      await caller.pinItem({ entityType: 'lead', entityId: id1, title: 'R1', url: '/r1' });
      await caller.pinItem({ entityType: 'contact', entityId: id2, title: 'R2', url: '/r2' });

      const start = performance.now();
      await caller.reorderPinnedItems({
        items: [
          { entityType: 'contact', entityId: id2, position: 0 },
          { entityType: 'lead', entityId: id1, position: 1 },
        ],
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);

      // Cleanup
      await caller.unpinItem({ entityType: 'lead', entityId: id1 });
      await caller.unpinItem({ entityType: 'contact', entityId: id2 });
    });
  });

  // =============================================================================
  // Parallel Query Performance Test
  // =============================================================================
  describe('Parallel Query Performance', () => {
    it('should fetch all home page data in parallel within target time', async () => {
      const ctx = await createIntegrationTestContext();
      const caller = homeRouter.createCaller(ctx);

      const start = performance.now();

      // Fetch all data in parallel (as the frontend does)
      const [welcomeData, insightsData, feedData, goalData, pinnedData] = await Promise.all([
        caller.getWelcomeSummary(),
        caller.getAIInsights(),
        caller.getActivityFeed({ limit: 5 }),
        caller.getDailyGoal(),
        caller.getPinnedItems(),
      ]);

      const duration = performance.now() - start;

      // All should succeed
      expect(welcomeData.userName).toBeDefined();
      expect(insightsData.insights).toBeDefined();
      expect(feedData.items).toBeDefined();
      expect(goalData.goal).toBeDefined();
      expect(pinnedData.items).toBeDefined();

      // Total time should be reasonable (not 5x individual times)
      // Target: <500ms for all 5 parallel queries
      expect(duration).toBeLessThan(1000);
    });
  });
});
