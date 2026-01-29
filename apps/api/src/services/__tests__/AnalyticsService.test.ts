/**
 * AnalyticsService Tests
 *
 * Comprehensive tests for analytics service functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsService } from '../AnalyticsService';
import type { PrismaClient } from '@intelliflow/db';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockPrisma: {
    opportunity: {
      groupBy: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    lead: {
      groupBy: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    contact: {
      count: ReturnType<typeof vi.fn>;
    };
    auditLogEntry: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
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
    };

    service = new AnalyticsService(mockPrisma as unknown as PrismaClient);
  });

  describe('getDealsWonTrend', () => {
    it('should return deals won trend for specified months', async () => {
      const mockOpportunities = [
        {
          closedAt: new Date(),
          _count: 2,
          _sum: { value: 50000 },
        },
      ];

      mockPrisma.opportunity.groupBy.mockResolvedValue(mockOpportunities);

      const result = await service.getDealsWonTrend('tenant-123', 6);

      expect(result).toHaveLength(6);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('value');
      expect(result[0]).toHaveProperty('revenue');
      expect(mockPrisma.opportunity.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['closedAt'],
          where: expect.objectContaining({
            tenantId: 'tenant-123',
            stage: 'CLOSED_WON',
          }),
        })
      );
    });

    it('should fill missing months with zeros', async () => {
      mockPrisma.opportunity.groupBy.mockResolvedValue([]);

      const result = await service.getDealsWonTrend('tenant-123', 3);

      expect(result).toHaveLength(3);
      result.forEach((item) => {
        expect(item.value).toBe(0);
        expect(item.revenue).toBe(0);
      });
    });

    it('should handle opportunities without closedAt', async () => {
      const mockOpportunities = [
        {
          closedAt: null,
          _count: 1,
          _sum: { value: 10000 },
        },
      ];

      mockPrisma.opportunity.groupBy.mockResolvedValue(mockOpportunities);

      const result = await service.getDealsWonTrend('tenant-123', 6);

      expect(result).toHaveLength(6);
      // All zeros since closedAt is null
      result.forEach((item) => {
        expect(item.value).toBe(0);
      });
    });

    it('should use default months value of 6', async () => {
      mockPrisma.opportunity.groupBy.mockResolvedValue([]);

      const result = await service.getDealsWonTrend('tenant-123');

      expect(result).toHaveLength(6);
    });

    it('should aggregate multiple deals in same month', async () => {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      mockPrisma.opportunity.groupBy.mockResolvedValue([
        {
          closedAt: now,
          _count: 3,
          _sum: { value: 75000 },
        },
        {
          closedAt: now,
          _count: 2,
          _sum: { value: 25000 },
        },
      ]);

      const result = await service.getDealsWonTrend('tenant-123', 1);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(5); // 3 + 2
      expect(result[0].revenue).toBe(100000); // 75000 + 25000
    });
  });

  describe('getGrowthTrend', () => {
    it('should return revenue growth trend', async () => {
      mockPrisma.opportunity.aggregate.mockResolvedValue({
        _sum: { value: 100000 },
      });

      const result = await service.getGrowthTrend('tenant-123', 'revenue', 3);

      expect(result).toHaveLength(3);
      result.forEach((item) => {
        expect(item).toHaveProperty('month');
        expect(item).toHaveProperty('value');
      });
    });

    it('should return leads growth trend', async () => {
      mockPrisma.lead.count.mockResolvedValue(50);

      const result = await service.getGrowthTrend('tenant-123', 'leads', 3);

      expect(result).toHaveLength(3);
      expect(mockPrisma.lead.count).toHaveBeenCalled();
    });

    it('should return deals growth trend', async () => {
      mockPrisma.opportunity.count.mockResolvedValue(25);

      const result = await service.getGrowthTrend('tenant-123', 'deals', 3);

      expect(result).toHaveLength(3);
      expect(mockPrisma.opportunity.count).toHaveBeenCalled();
    });

    it('should return contacts growth trend', async () => {
      mockPrisma.contact.count.mockResolvedValue(100);

      const result = await service.getGrowthTrend('tenant-123', 'contacts', 3);

      expect(result).toHaveLength(3);
      expect(mockPrisma.contact.count).toHaveBeenCalled();
    });

    it('should use default months value of 12', async () => {
      mockPrisma.lead.count.mockResolvedValue(10);

      const result = await service.getGrowthTrend('tenant-123', 'leads');

      expect(result).toHaveLength(12);
    });

    it('should calculate YoY change when enough data', async () => {
      mockPrisma.lead.count.mockResolvedValue(100);

      const result = await service.getGrowthTrend('tenant-123', 'leads', 12);

      expect(result).toHaveLength(12);
      const latest = result.at(-1);
      expect(latest).toHaveProperty('yoyChange');
    });

    it('should handle null revenue sum', async () => {
      mockPrisma.opportunity.aggregate.mockResolvedValue({
        _sum: { value: null },
      });

      const result = await service.getGrowthTrend('tenant-123', 'revenue', 1);

      expect(result[0].value).toBe(0);
    });
  });

  describe('getTrafficSources', () => {
    it('should return traffic source distribution', async () => {
      const mockLeadsBySource = [
        { source: 'WEBSITE', _count: 50 },
        { source: 'REFERRAL', _count: 30 },
        { source: 'SOCIAL', _count: 20 },
      ];

      mockPrisma.lead.groupBy.mockResolvedValue(mockLeadsBySource);

      const result = await service.getTrafficSources('tenant-123');

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('percentage');
      expect(result[0]).toHaveProperty('color');

      // Should be sorted by percentage (descending)
      expect(result[0].percentage).toBeGreaterThanOrEqual(result[1].percentage);
    });

    it('should return empty array when no leads', async () => {
      mockPrisma.lead.groupBy.mockResolvedValue([]);

      const result = await service.getTrafficSources('tenant-123');

      expect(result).toHaveLength(0);
    });

    it('should map source names correctly', async () => {
      const mockLeadsBySource = [
        { source: 'COLD_CALL', _count: 10 },
      ];

      mockPrisma.lead.groupBy.mockResolvedValue(mockLeadsBySource);

      const result = await service.getTrafficSources('tenant-123');

      expect(result[0].name).toBe('Cold call');
    });

    it('should use default color for unknown sources', async () => {
      const mockLeadsBySource = [
        { source: 'UNKNOWN_SOURCE', _count: 5 },
      ];

      mockPrisma.lead.groupBy.mockResolvedValue(mockLeadsBySource);

      const result = await service.getTrafficSources('tenant-123');

      expect(result[0].color).toBe('bg-gray-500');
    });

    it('should calculate percentages correctly', async () => {
      const mockLeadsBySource = [
        { source: 'WEBSITE', _count: 60 },
        { source: 'REFERRAL', _count: 40 },
      ];

      mockPrisma.lead.groupBy.mockResolvedValue(mockLeadsBySource);

      const result = await service.getTrafficSources('tenant-123');

      expect(result[0].percentage).toBe(60);
      expect(result[1].percentage).toBe(40);
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent activities', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'CREATE',
          metadata: JSON.stringify({ name: 'Test Lead' }),
          timestamp: new Date(),
        },
        {
          id: 'activity-2',
          action: 'QUALIFY',
          metadata: JSON.stringify({ name: 'Qualified Lead' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123', 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('icon');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('createdAt');
    });

    it('should use default limit of 10', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      await service.getRecentActivity('tenant-123');

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it('should handle empty activities', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      const result = await service.getRecentActivity('tenant-123');

      expect(result).toHaveLength(0);
    });

    it('should filter by specific actions', async () => {
      mockPrisma.auditLogEntry.findMany.mockResolvedValue([]);

      await service.getRecentActivity('tenant-123');

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: {
              in: ['CREATE', 'QUALIFY', 'CONVERT', 'UPDATE'],
            },
          }),
        })
      );
    });

    it('should handle metadata as object', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'lead.created',
          metadata: { name: 'Object Metadata Lead' },
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toContain('Object Metadata Lead');
    });

    it('should handle metadata parsing errors gracefully', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'lead.created',
          metadata: 'invalid json {{{',
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      // Should return the action as description when metadata parsing fails
      expect(result[0].description).toBe('lead.created');
    });
  });

  describe('getIconForAction (via getRecentActivity)', () => {
    it('should return correct icon for lead.created', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'lead.created',
          metadata: JSON.stringify({ name: 'Test' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].icon).toBe('person_add');
    });

    it('should return correct icon for lead.qualified', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'lead.qualified',
          metadata: JSON.stringify({ name: 'Test' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].icon).toBe('check_circle');
    });

    it('should return correct icon for opportunity.won', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'opportunity.won',
          metadata: JSON.stringify({ name: 'Deal', value: 50000 }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].icon).toBe('celebration');
    });

    it('should return default icon for unknown action', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'unknown.action',
          metadata: JSON.stringify({}),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].icon).toBe('event');
    });
  });

  describe('getDescriptionForAction (via getRecentActivity)', () => {
    it('should format lead.created description', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'lead.created',
          metadata: JSON.stringify({ name: 'John Doe' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toBe('New lead: John Doe');
    });

    it('should format lead.qualified description', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'lead.qualified',
          metadata: JSON.stringify({ name: 'Jane Smith' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toBe('Lead qualified: Jane Smith');
    });

    it('should format lead.converted description', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'lead.converted',
          metadata: JSON.stringify({ name: 'Bob Wilson' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toBe('Lead converted to contact: Bob Wilson');
    });

    it('should format opportunity.created description', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'opportunity.created',
          metadata: JSON.stringify({ name: 'Big Deal' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toBe('New deal: Big Deal');
    });

    it('should format opportunity.won description with value', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'opportunity.won',
          metadata: JSON.stringify({ name: 'Enterprise Deal', value: 100000 }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toBe('Deal won: Enterprise Deal ($100000)');
    });

    it('should format contact.created description', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'contact.created',
          metadata: JSON.stringify({ name: 'Alice Brown' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toBe('New contact: Alice Brown');
    });

    it('should format task.completed description', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'task.completed',
          metadata: JSON.stringify({ title: 'Follow up call' }),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toBe('Task completed: Follow up call');
    });

    it('should handle missing name in metadata', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          action: 'lead.created',
          metadata: JSON.stringify({}),
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLogEntry.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity('tenant-123');

      expect(result[0].description).toBe('New lead: Unknown');
    });
  });

  describe('getLeadStats', () => {
    it('should return lead statistics', async () => {
      mockPrisma.lead.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(25); // newThisMonth

      const result = await service.getLeadStats('tenant-123');

      expect(result).toHaveProperty('total', 100);
      expect(result).toHaveProperty('newThisMonth', 25);
    });

    it('should query total leads without date filter', async () => {
      mockPrisma.lead.count.mockResolvedValue(0);

      await service.getLeadStats('tenant-123');

      expect(mockPrisma.lead.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-123',
          },
        })
      );
    });

    it('should query new leads with start of month filter', async () => {
      mockPrisma.lead.count.mockResolvedValue(0);

      await service.getLeadStats('tenant-123');

      // Second call should have createdAt filter
      expect(mockPrisma.lead.count).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-123',
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('should return zeros when no leads', async () => {
      mockPrisma.lead.count.mockResolvedValue(0);

      const result = await service.getLeadStats('tenant-123');

      expect(result.total).toBe(0);
      expect(result.newThisMonth).toBe(0);
    });
  });
});
