/**
 * PrismaAnalyticsRepository Tests
 *
 * Tests the Prisma-based analytics repository implementation
 * using a mock Prisma client. Covers all public methods,
 * aggregation queries, date filtering, and private helper methods
 * (tested indirectly through getRecentAuditLogs).
 *
 * Coverage target: 100% of PrismaAnalyticsRepository
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaAnalyticsRepository } from '../PrismaAnalyticsRepository';

// Mock Prisma Client
const createMockPrismaClient = () => ({
  opportunity: {
    groupBy: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  },
  lead: {
    groupBy: vi.fn(),
    count: vi.fn(),
  },
  contact: {
    count: vi.fn(),
  },
  auditLogEntry: {
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
});

describe('PrismaAnalyticsRepository', () => {
  let repository: PrismaAnalyticsRepository;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const tenantId = 'tenant-analytics-test';

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaAnalyticsRepository(mockPrisma as any);
  });

  describe('getDealsWonByMonth()', () => {
    it('should group opportunities by closedAt with count and sum', async () => {
      const closedAt = new Date('2025-06-15T00:00:00Z');
      mockPrisma.opportunity.groupBy.mockResolvedValue([
        {
          closedAt,
          _count: 3,
          _sum: { value: 15000n },
        },
      ]);

      const result = await repository.getDealsWonByMonth(tenantId, 6);

      expect(result).toHaveLength(1);
      expect(result[0].closedAt).toEqual(closedAt);
      expect(result[0]._count).toBe(3);
      expect(result[0]._sum.value).toBe(15000);

      expect(mockPrisma.opportunity.groupBy).toHaveBeenCalledWith({
        by: ['closedAt'],
        where: {
          tenantId,
          stage: 'CLOSED_WON',
          closedAt: {
            gte: expect.any(Date),
          },
        },
        _count: true,
        _sum: { value: true },
      });
    });

    it('should calculate date correctly for months parameter', async () => {
      mockPrisma.opportunity.groupBy.mockResolvedValue([]);

      await repository.getDealsWonByMonth(tenantId, 12);

      const callArgs = mockPrisma.opportunity.groupBy.mock.calls[0][0];
      const gteDate = callArgs.where.closedAt.gte as Date;
      const now = new Date();
      // The monthsAgo date should be roughly 12 months ago
      const approxExpected = new Date();
      approxExpected.setMonth(approxExpected.getMonth() - 12);
      // Allow 5 seconds tolerance
      expect(Math.abs(gteDate.getTime() - approxExpected.getTime())).toBeLessThan(5000);
    });

    it('should return empty array when no deals found', async () => {
      mockPrisma.opportunity.groupBy.mockResolvedValue([]);

      const result = await repository.getDealsWonByMonth(tenantId, 3);

      expect(result).toHaveLength(0);
    });

    it('should handle null sum value', async () => {
      mockPrisma.opportunity.groupBy.mockResolvedValue([
        {
          closedAt: new Date(),
          _count: 1,
          _sum: { value: null },
        },
      ]);

      const result = await repository.getDealsWonByMonth(tenantId, 6);

      expect(result[0]._sum.value).toBeNull();
    });

    it('should convert BigInt sum values to numbers', async () => {
      mockPrisma.opportunity.groupBy.mockResolvedValue([
        {
          closedAt: new Date(),
          _count: 5,
          _sum: { value: 999999n },
        },
      ]);

      const result = await repository.getDealsWonByMonth(tenantId, 6);

      expect(result[0]._sum.value).toBe(999999);
      expect(typeof result[0]._sum.value).toBe('number');
    });

    it('should map multiple grouped results', async () => {
      mockPrisma.opportunity.groupBy.mockResolvedValue([
        { closedAt: new Date('2025-01-01'), _count: 2, _sum: { value: 5000 } },
        { closedAt: new Date('2025-02-01'), _count: 4, _sum: { value: 12000 } },
        { closedAt: new Date('2025-03-01'), _count: 1, _sum: { value: null } },
      ]);

      const result = await repository.getDealsWonByMonth(tenantId, 3);

      expect(result).toHaveLength(3);
      expect(result[0]._count).toBe(2);
      expect(result[1]._sum.value).toBe(12000);
      expect(result[2]._sum.value).toBeNull();
    });
  });

  describe('getMonthlyRevenue()', () => {
    it('should aggregate revenue in date range', async () => {
      const dateRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      };

      mockPrisma.opportunity.aggregate.mockResolvedValue({
        _sum: { value: 50000 },
      });

      const result = await repository.getMonthlyRevenue(tenantId, dateRange);

      expect(result).toBe(50000);
      expect(mockPrisma.opportunity.aggregate).toHaveBeenCalledWith({
        where: {
          tenantId,
          stage: 'CLOSED_WON',
          closedAt: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
        },
        _sum: { value: true },
      });
    });

    it('should return 0 when no revenue', async () => {
      mockPrisma.opportunity.aggregate.mockResolvedValue({
        _sum: { value: null },
      });

      const result = await repository.getMonthlyRevenue(tenantId, {
        startDate: new Date(),
        endDate: new Date(),
      });

      expect(result).toBe(0);
    });

    it('should convert BigInt revenue to number', async () => {
      mockPrisma.opportunity.aggregate.mockResolvedValue({
        _sum: { value: 123456n },
      });

      const result = await repository.getMonthlyRevenue(tenantId, {
        startDate: new Date(),
        endDate: new Date(),
      });

      expect(result).toBe(123456);
    });
  });

  describe('countLeadsInRange()', () => {
    it('should count leads within date range', async () => {
      const dateRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      };

      mockPrisma.lead.count.mockResolvedValue(42);

      const result = await repository.countLeadsInRange(tenantId, dateRange);

      expect(result).toBe(42);
      expect(mockPrisma.lead.count).toHaveBeenCalledWith({
        where: {
          tenantId,
          createdAt: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
        },
      });
    });

    it('should return 0 when no leads', async () => {
      mockPrisma.lead.count.mockResolvedValue(0);

      const result = await repository.countLeadsInRange(tenantId, {
        startDate: new Date(),
        endDate: new Date(),
      });

      expect(result).toBe(0);
    });
  });

  describe('countOpportunitiesInRange()', () => {
    it('should count opportunities within date range', async () => {
      const dateRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-06-30'),
      };

      mockPrisma.opportunity.count.mockResolvedValue(15);

      const result = await repository.countOpportunitiesInRange(tenantId, dateRange);

      expect(result).toBe(15);
      expect(mockPrisma.opportunity.count).toHaveBeenCalledWith({
        where: {
          tenantId,
          createdAt: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
        },
      });
    });

    it('should return 0 when no opportunities', async () => {
      mockPrisma.opportunity.count.mockResolvedValue(0);

      const result = await repository.countOpportunitiesInRange(tenantId, {
        startDate: new Date(),
        endDate: new Date(),
      });

      expect(result).toBe(0);
    });
  });

  describe('countContactsInRange()', () => {
    it('should count contacts within date range', async () => {
      const dateRange = {
        startDate: new Date('2025-03-01'),
        endDate: new Date('2025-03-31'),
      };

      mockPrisma.contact.count.mockResolvedValue(28);

      const result = await repository.countContactsInRange(tenantId, dateRange);

      expect(result).toBe(28);
      expect(mockPrisma.contact.count).toHaveBeenCalledWith({
        where: {
          tenantId,
          createdAt: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
        },
      });
    });

    it('should return 0 when no contacts', async () => {
      mockPrisma.contact.count.mockResolvedValue(0);

      const result = await repository.countContactsInRange(tenantId, {
        startDate: new Date(),
        endDate: new Date(),
      });

      expect(result).toBe(0);
    });
  });

  describe('getLeadsBySource()', () => {
    it('should group leads by source with count', async () => {
      mockPrisma.lead.groupBy.mockResolvedValue([
        { source: 'WEBSITE', _count: 50 },
        { source: 'REFERRAL', _count: 30 },
        { source: 'SOCIAL', _count: 20 },
      ]);

      const result = await repository.getLeadsBySource(tenantId);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ source: 'WEBSITE', _count: 50 });
      expect(result[1]).toEqual({ source: 'REFERRAL', _count: 30 });
      expect(result[2]).toEqual({ source: 'SOCIAL', _count: 20 });

      expect(mockPrisma.lead.groupBy).toHaveBeenCalledWith({
        by: ['source'],
        where: { tenantId },
        _count: true,
      });
    });

    it('should return empty array when no leads', async () => {
      mockPrisma.lead.groupBy.mockResolvedValue([]);

      const result = await repository.getLeadsBySource(tenantId);

      expect(result).toHaveLength(0);
    });
  });

  describe('getRecentAuditLogs()', () => {
    const createMockAuditEntry = (overrides: Record<string, unknown> = {}) => ({
      id: 'audit-1',
      action: 'CREATE',
      eventType: 'lead.created',
      metadata: { name: 'John Doe', resourceType: 'lead' },
      timestamp: new Date('2025-06-15T10:00:00Z'),
      tenantId,
      ...overrides,
    });

    it('should return recent audit logs with icon and description', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([createMockAuditEntry()]);

      const result = await repository.getRecentAuditLogs(tenantId, 10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('audit-1');
      expect(result[0].action).toBe('CREATE');
      expect(result[0].eventType).toBe('lead.created');
      expect(result[0].icon).toBe('add_circle');
      expect(result[0].description).toBe('New lead: John Doe');
      expect(result[0].createdAt).toEqual(new Date('2025-06-15T10:00:00Z'));
    });

    it('should apply limit parameter', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      await repository.getRecentAuditLogs(tenantId, 5);

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          orderBy: { timestamp: 'desc' },
        })
      );
    });

    it('should filter by actions when provided', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      await repository.getRecentAuditLogs(tenantId, 10, ['CREATE', 'UPDATE']);

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId,
            action: { in: ['CREATE', 'UPDATE'] },
          },
        })
      );
    });

    it('should not filter by actions when empty array provided', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      await repository.getRecentAuditLogs(tenantId, 10, []);

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
        })
      );
    });

    it('should not filter by actions when undefined', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      await repository.getRecentAuditLogs(tenantId, 10);

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
        })
      );
    });

    it('should map metadata correctly when it is an object', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([
        createMockAuditEntry({
          metadata: { customKey: 'customValue' },
        }),
      ]);

      const result = await repository.getRecentAuditLogs(tenantId, 10);

      expect(result[0].metadata).toEqual({ customKey: 'customValue' });
    });

    it('should handle null metadata gracefully', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([
        createMockAuditEntry({ metadata: null }),
      ]);

      const result = await repository.getRecentAuditLogs(tenantId, 10);

      expect(result[0].metadata).toEqual({});
    });

    it('should handle non-object metadata (e.g., string)', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([
        createMockAuditEntry({ metadata: 'string-metadata' }),
      ]);

      const result = await repository.getRecentAuditLogs(tenantId, 10);

      expect(result[0].metadata).toEqual({});
    });

    // Test getIconForAction via getRecentAuditLogs
    describe('icon mapping (getIconForAction)', () => {
      const testIconMapping = async (action: string, expectedIcon: string) => {
        mockPrisma.auditLogEntry.findMany.mockResolvedValue([createMockAuditEntry({ action })]);
        const result = await repository.getRecentAuditLogs(tenantId, 10);
        expect(result[0].icon).toBe(expectedIcon);
      };

      it('should return add_circle for CREATE', async () => {
        await testIconMapping('CREATE', 'add_circle');
      });

      it('should return check_circle for QUALIFY', async () => {
        await testIconMapping('QUALIFY', 'check_circle');
      });

      it('should return swap_horiz for CONVERT', async () => {
        await testIconMapping('CONVERT', 'swap_horiz');
      });

      it('should return edit for UPDATE', async () => {
        await testIconMapping('UPDATE', 'edit');
      });

      it('should return delete for DELETE', async () => {
        await testIconMapping('DELETE', 'delete');
      });

      it('should return person_add for lead.created', async () => {
        await testIconMapping('lead.created', 'person_add');
      });

      it('should return check_circle for lead.qualified', async () => {
        await testIconMapping('lead.qualified', 'check_circle');
      });

      it('should return swap_horiz for lead.converted', async () => {
        await testIconMapping('lead.converted', 'swap_horiz');
      });

      it('should return handshake for opportunity.created', async () => {
        await testIconMapping('opportunity.created', 'handshake');
      });

      it('should return celebration for opportunity.won', async () => {
        await testIconMapping('opportunity.won', 'celebration');
      });

      it('should return contacts for contact.created', async () => {
        await testIconMapping('contact.created', 'contacts');
      });

      it('should return task_alt for task.completed', async () => {
        await testIconMapping('task.completed', 'task_alt');
      });

      it('should return default "event" icon for unknown actions', async () => {
        await testIconMapping('UNKNOWN_ACTION', 'event');
      });
    });

    // Test getDescriptionForAction via getRecentAuditLogs
    describe('description mapping (getDescriptionForAction)', () => {
      const testDescription = async (
        action: string,
        metadata: unknown,
        expectedDescription: string
      ) => {
        mockPrisma.auditLogEntry.findMany.mockResolvedValue([
          createMockAuditEntry({ action, metadata }),
        ]);
        const result = await repository.getRecentAuditLogs(tenantId, 10);
        expect(result[0].description).toBe(expectedDescription);
      };

      it('should format CREATE with resourceType and name', async () => {
        await testDescription(
          'CREATE',
          { resourceType: 'lead', name: 'Jane Doe' },
          'New lead: Jane Doe'
        );
      });

      it('should format CREATE with default resourceType and name', async () => {
        await testDescription('CREATE', {}, 'New item: Unknown');
      });

      it('should format QUALIFY', async () => {
        await testDescription('QUALIFY', { name: 'Hot Lead' }, 'Qualified: Hot Lead');
      });

      it('should format QUALIFY with fallback name', async () => {
        await testDescription('QUALIFY', {}, 'Qualified: Unknown');
      });

      it('should format CONVERT', async () => {
        await testDescription('CONVERT', { name: 'Lead X' }, 'Converted: Lead X');
      });

      it('should format UPDATE', async () => {
        await testDescription('UPDATE', { name: 'Record Y' }, 'Updated: Record Y');
      });

      it('should format lead.created', async () => {
        await testDescription('lead.created', { name: 'New Lead' }, 'New lead: New Lead');
      });

      it('should format lead.qualified', async () => {
        await testDescription(
          'lead.qualified',
          { name: 'Qualified Lead' },
          'Lead qualified: Qualified Lead'
        );
      });

      it('should format lead.converted', async () => {
        await testDescription(
          'lead.converted',
          { name: 'Converted Lead' },
          'Lead converted to contact: Converted Lead'
        );
      });

      it('should format opportunity.created', async () => {
        await testDescription('opportunity.created', { name: 'Big Deal' }, 'New deal: Big Deal');
      });

      it('should format opportunity.won', async () => {
        await testDescription(
          'opportunity.won',
          { name: 'Won Deal', value: 5000 },
          'Deal won: Won Deal ($5000)'
        );
      });

      it('should format opportunity.won with default value', async () => {
        await testDescription('opportunity.won', { name: 'Won Deal' }, 'Deal won: Won Deal ($0)');
      });

      it('should format contact.created', async () => {
        await testDescription(
          'contact.created',
          { name: 'New Contact' },
          'New contact: New Contact'
        );
      });

      it('should format task.completed', async () => {
        await testDescription(
          'task.completed',
          { title: 'Important Task' },
          'Task completed: Important Task'
        );
      });

      it('should format task.completed with default title', async () => {
        await testDescription('task.completed', {}, 'Task completed: Unknown');
      });

      it('should return action as description for unknown actions', async () => {
        await testDescription('SOME_CUSTOM_ACTION', {}, 'SOME_CUSTOM_ACTION');
      });

      it('should handle string metadata by parsing JSON', async () => {
        await testDescription(
          'CREATE',
          JSON.stringify({ resourceType: 'contact', name: 'Parsed Name' }),
          'New contact: Parsed Name'
        );
      });

      it('should handle invalid JSON string metadata gracefully', async () => {
        await testDescription('CREATE', 'not valid json', 'CREATE');
      });

      it('should handle null metadata gracefully', async () => {
        await testDescription('CREATE', null, 'New item: Unknown');
      });

      it('should handle undefined metadata gracefully', async () => {
        await testDescription('CREATE', undefined, 'New item: Unknown');
      });
    });
  });

  describe('countTotalLeads()', () => {
    it('should count all leads for tenant', async () => {
      mockPrisma.lead.count.mockResolvedValue(100);

      const result = await repository.countTotalLeads(tenantId);

      expect(result).toBe(100);
      expect(mockPrisma.lead.count).toHaveBeenCalledWith({
        where: { tenantId },
      });
    });

    it('should return 0 when no leads', async () => {
      mockPrisma.lead.count.mockResolvedValue(0);

      const result = await repository.countTotalLeads(tenantId);

      expect(result).toBe(0);
    });
  });

  describe('countLeadsThisMonth()', () => {
    it('should count leads created this month', async () => {
      mockPrisma.lead.count.mockResolvedValue(25);

      const result = await repository.countLeadsThisMonth(tenantId);

      expect(result).toBe(25);

      const callArgs = mockPrisma.lead.count.mock.calls[0][0];
      expect(callArgs.where.tenantId).toBe(tenantId);
      expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);

      // Verify the start of month calculation
      const gteDate = callArgs.where.createdAt.gte as Date;
      const now = new Date();
      expect(gteDate.getFullYear()).toBe(now.getFullYear());
      expect(gteDate.getMonth()).toBe(now.getMonth());
      expect(gteDate.getDate()).toBe(1);
    });

    it('should return 0 when no leads this month', async () => {
      mockPrisma.lead.count.mockResolvedValue(0);

      const result = await repository.countLeadsThisMonth(tenantId);

      expect(result).toBe(0);
    });
  });

  // Regression: analytics.getSalesMetrics failed in production benchmark with
  // "relation 'Opportunity' does not exist" because the raw SQL used the model
  // name instead of the @@map'd table name. Guard the lowercase "opportunities"
  // table name in the emitted SQL so any future rename is caught by unit tests.
  describe('getAvgSalesCycleLength() raw SQL', () => {
    const dateRange = {
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-04-01T00:00:00Z'),
    };

    it('emits SQL against the lowercase "opportunities" table (Prisma @@map target)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ avg_days: 42 }]);

      await repository.getAvgSalesCycleLength(tenantId, dateRange);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const sqlArg = mockPrisma.$queryRaw.mock.calls[0][0];
      // Prisma.sql produces a tagged-template object with `.strings` and `.values`
      const joinedSql = (sqlArg.strings || []).join(' ');
      expect(joinedSql).toMatch(/FROM\s+"opportunities"/);
      expect(joinedSql).not.toMatch(/FROM\s+"Opportunity"/);
    });

    it('returns null when average is null (no closed-won deals in range)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ avg_days: null }]);

      const result = await repository.getAvgSalesCycleLength(tenantId, dateRange);

      expect(result).toBeNull();
    });

    it('rounds average days to one decimal', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ avg_days: 42.456 }]);

      const result = await repository.getAvgSalesCycleLength(tenantId, dateRange);

      expect(result).toBe(42.5);
    });
  });
});
