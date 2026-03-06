/**
 * getAllInsights Endpoint Tests
 *
 * Tests for the paginated AI insights endpoint with type filtering.
 *
 * Task: PG-160 — View All AI Insights page
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { homeRouter } from '../home.router';
import { prismaMock, createTestContext, createPublicContext } from '../../../test/setup';

describe('home.getAllInsights', () => {
  const ctx = createTestContext();
  const caller = homeRouter.createCaller(ctx);

  const publicCtx = createPublicContext();
  const publicCaller = homeRouter.createCaller(publicCtx);

  // Helper to create mock data that each DB query category returns
  function setupMockQueries(
    opts: {
      dealsAtRisk?: number;
      hotLeads?: number;
      overdueTasks?: number;
      staleContacts?: number;
    } = {}
  ) {
    const { dealsAtRisk = 2, hotLeads = 2, overdueTasks = 3, staleContacts = 2 } = opts;

    // Deals at risk (warning type)
    const mockDeals = Array.from({ length: dealsAtRisk }, (_, i) => ({
      id: `deal-${i}`,
      name: `Deal ${i}`,
      updatedAt: new Date('2025-01-01'),
    }));
    prismaMock.opportunity.findMany.mockResolvedValue(mockDeals as any);

    // Hot leads (opportunity type)
    const mockLeads = Array.from({ length: hotLeads }, (_, i) => ({
      id: `lead-${i}`,
      firstName: `Lead`,
      lastName: `${i}`,
      company: `Company ${i}`,
      score: 90,
    }));
    prismaMock.lead.findMany.mockResolvedValue(mockLeads as any);

    // Overdue tasks (reminder type)
    prismaMock.task.count.mockResolvedValue(overdueTasks);

    // Stale contacts (warning type)
    const mockContacts = Array.from({ length: staleContacts }, (_, i) => ({
      id: `contact-${i}`,
      firstName: `Contact`,
      lastName: `${i}`,
      lastContactedAt: new Date('2025-01-01'),
    }));
    prismaMock.contact.findMany.mockResolvedValue(mockContacts as any);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    // Cache-aside: getAllInsights checks AIInsight table first; default to empty so heuristic fallback runs
    (prismaMock.aIInsight as any).findMany.mockResolvedValue([]);
    (prismaMock.aIInsight as any).count.mockResolvedValue(0);
  });

  // =========================================================================
  // Basic Functionality
  // =========================================================================

  it('returns paginated insights with default limit', async () => {
    setupMockQueries();
    const result = await caller.getAllInsights({});

    expect(result.insights).toBeDefined();
    expect(Array.isArray(result.insights)).toBe(true);
    expect(result.insights.length).toBeLessThanOrEqual(20); // default limit
    expect(result.lastRefreshed).toBeInstanceOf(Date);
  });

  it('respects custom limit parameter', async () => {
    setupMockQueries({ dealsAtRisk: 10, hotLeads: 10, overdueTasks: 5, staleContacts: 10 });
    const result = await caller.getAllInsights({ limit: 3 });

    expect(result.insights.length).toBeLessThanOrEqual(3);
  });

  it('returns nextCursor when more items exist', async () => {
    setupMockQueries({ dealsAtRisk: 10, hotLeads: 10, overdueTasks: 5, staleContacts: 10 });
    const result = await caller.getAllInsights({ limit: 2 });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
    expect(typeof result.nextCursor).toBe('string');
  });

  it('returns hasMore: false when no more items', async () => {
    setupMockQueries({ dealsAtRisk: 1, hotLeads: 0, overdueTasks: 0, staleContacts: 0 });
    const result = await caller.getAllInsights({ limit: 50 });

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  // =========================================================================
  // Cursor Pagination
  // =========================================================================

  it('cursor pagination returns next page of results', async () => {
    setupMockQueries({ dealsAtRisk: 5, hotLeads: 5, overdueTasks: 3, staleContacts: 5 });

    // Get first page
    const page1 = await caller.getAllInsights({ limit: 3 });
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    // Get second page using cursor
    const page2 = await caller.getAllInsights({ limit: 3, cursor: page1.nextCursor! });
    expect(page2.insights).toBeDefined();
    // Pages should not overlap
    const page1Ids = page1.insights.map((i) => i.id);
    const page2Ids = page2.insights.map((i) => i.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });

  // =========================================================================
  // Type Filtering
  // =========================================================================

  it('filters by single type (warning)', async () => {
    setupMockQueries();
    const result = await caller.getAllInsights({ types: ['warning'] });

    result.insights.forEach((insight) => {
      expect(insight.type).toBe('warning');
    });
  });

  it('filters by multiple types', async () => {
    setupMockQueries();
    const result = await caller.getAllInsights({ types: ['warning', 'opportunity'] });

    result.insights.forEach((insight) => {
      expect(['warning', 'opportunity']).toContain(insight.type);
    });
  });

  it('returns all types when no types filter', async () => {
    setupMockQueries();
    const result = await caller.getAllInsights({});

    const types = new Set(result.insights.map((i) => i.type));
    // Should have at least 2 types (warning from deals/contacts, opportunity from leads)
    expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array when no insights match filter', async () => {
    setupMockQueries({ dealsAtRisk: 0, hotLeads: 0, overdueTasks: 0, staleContacts: 0 });
    const result = await caller.getAllInsights({ types: ['achievement'] });

    expect(result.insights).toHaveLength(0);
  });

  it('total reflects pre-pagination count after type filter', async () => {
    setupMockQueries({ dealsAtRisk: 5, hotLeads: 0, overdueTasks: 0, staleContacts: 3 });
    const result = await caller.getAllInsights({ types: ['warning'], limit: 2 });

    // Total should be all warning-type insights (deals at risk + stale contacts)
    expect(result.total).toBe(8); // 5 deals + 3 contacts
  });

  // =========================================================================
  // Response Shape
  // =========================================================================

  it('lastRefreshed is a Date', async () => {
    setupMockQueries();
    const result = await caller.getAllInsights({});

    expect(result.lastRefreshed).toBeInstanceOf(Date);
  });

  it('queries run in parallel (all categories populated)', async () => {
    setupMockQueries();
    const result = await caller.getAllInsights({});

    // All 4 query categories should have been called
    expect(prismaMock.opportunity.findMany).toHaveBeenCalled();
    expect(prismaMock.lead.findMany).toHaveBeenCalled();
    expect(prismaMock.task.count).toHaveBeenCalled();
    expect(prismaMock.contact.findMany).toHaveBeenCalled();
  });

  it('each DB category capped at take: 50', async () => {
    setupMockQueries();
    await caller.getAllInsights({});

    // Check opportunity.findMany was called with take: 50
    const oppCall = prismaMock.opportunity.findMany.mock.calls[0]?.[0];
    expect(oppCall?.take).toBe(50);

    // Check lead.findMany was called with take: 50
    const leadCall = prismaMock.lead.findMany.mock.calls[0]?.[0];
    expect(leadCall?.take).toBe(50);

    // Check contact.findMany was called with take: 50
    const contactCall = prismaMock.contact.findMany.mock.calls[0]?.[0];
    expect(contactCall?.take).toBe(50);
  });

  it('does NOT include synthetic achievement insight', async () => {
    // Even when no real insights, no "all-good" fallback
    setupMockQueries({ dealsAtRisk: 0, hotLeads: 0, overdueTasks: 0, staleContacts: 0 });
    const result = await caller.getAllInsights({});

    const achievements = result.insights.filter((i) => i.id === 'all-good');
    expect(achievements).toHaveLength(0);
  });

  // =========================================================================
  // Auth & Tenant Isolation
  // =========================================================================

  it('requires authentication', async () => {
    await expect(publicCaller.getAllInsights({})).rejects.toThrow(TRPCError);
    await expect(publicCaller.getAllInsights({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('enforces tenant isolation', async () => {
    setupMockQueries();
    await caller.getAllInsights({});

    // Check that tenantId is passed to queries
    const oppCall = prismaMock.opportunity.findMany.mock.calls[0]?.[0];
    expect(oppCall?.where?.tenantId).toBe('test-tenant-id');

    const contactCall = prismaMock.contact.findMany.mock.calls[0]?.[0];
    expect(contactCall?.where?.tenantId).toBe('test-tenant-id');
  });

  // =========================================================================
  // Input Validation
  // =========================================================================

  it('validates input schema (limit out of range)', async () => {
    await expect(caller.getAllInsights({ limit: 0 })).rejects.toThrow();
    await expect(caller.getAllInsights({ limit: 51 })).rejects.toThrow();
  });
});
