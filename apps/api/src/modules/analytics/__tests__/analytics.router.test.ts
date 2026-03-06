/**
 * Analytics Router Tests
 *
 * Tests for dashboard analytics endpoints:
 * - Deals won trends
 * - Growth metrics (revenue, leads, deals, contacts)
 * - Traffic source distribution
 * - Recent activity feed
 * - Lead statistics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { analyticsRouter } from '../analytics.router';
import type { UserSession, Context } from '../../../context';

// Mock prisma client
const mockPrisma = {} as Context['prisma'];

// Mock analytics service methods (matches AnalyticsAggregationService interface)
const mockAnalyticsService = {
  getDealsWonTrend: vi.fn(),
  getGrowthTrend: vi.fn(),
  getTrafficSources: vi.fn(),
  getRecentActivity: vi.fn(),
  getLeadStats: vi.fn(),
  exportMetrics: vi.fn(),
  exportConversionFunnel: vi.fn(),
  // IFC-190: 6 new composite endpoints
  getOverview: vi.fn(),
  getSalesMetrics: vi.fn(),
  getLeadMetrics: vi.fn(),
  getConversionFunnel: vi.fn(),
  getTimeSeriesData: vi.fn(),
  exportReport: vi.fn(),
};

/** Factory helper to create a valid mock context with analytics service + tenantId */
function makeCtx(overrides?: {
  tenantId?: string | undefined;
  analytics?: typeof mockAnalyticsService | undefined;
}) {
  return {
    prisma: mockPrisma,
    user: {
      userId: 'user_123',
      email: 'test@example.com',
      role: 'USER',
      tenantId: overrides && 'tenantId' in overrides ? overrides.tenantId : 'tenant_123',
    } as any, // test-only mock
    services: {
      analytics: overrides && 'analytics' in overrides ? overrides.analytics : mockAnalyticsService,
    },
  } as any; // test-only mock
}

describe('analyticsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Helper function tests
  // ============================================

  describe('getAnalyticsService (via endpoints)', () => {
    it('should throw INTERNAL_SERVER_ERROR when analytics service is not available', async () => {
      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: undefined,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(caller.leadStats()).rejects.toThrow(TRPCError);
      await expect(caller.leadStats()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Analytics service not available',
      });
    });

    it('should throw INTERNAL_SERVER_ERROR when services object is undefined', async () => {
      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: undefined,
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(caller.leadStats()).rejects.toThrow(TRPCError);
    });
  });

  describe('getTenantId (via endpoints)', () => {
    it('should throw UNAUTHORIZED when user has no tenantId', async () => {
      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: undefined,
        } as any, // test-only mock
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(caller.leadStats()).rejects.toThrow(TRPCError);
      await expect(caller.leadStats()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Tenant ID not found in user context',
      });
    });

    it('should throw UNAUTHORIZED when user object is undefined', async () => {
      const mockContext = {
        prisma: mockPrisma,
        user: undefined,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(caller.leadStats()).rejects.toThrow(TRPCError);
    });
  });

  // ============================================
  // dealsWonTrend Tests
  // ============================================

  describe('dealsWonTrend', () => {
    it('should return deals won trend with default months', async () => {
      const mockTrend = [
        { month: '2025-01', value: 10, label: 'Jan 2025' },
        { month: '2025-02', value: 15, label: 'Feb 2025' },
        { month: '2025-03', value: 12, label: 'Mar 2025' },
        { month: '2025-04', value: 18, label: 'Apr 2025' },
        { month: '2025-05', value: 20, label: 'May 2025' },
        { month: '2025-06', value: 25, label: 'Jun 2025' },
      ];

      mockAnalyticsService.getDealsWonTrend.mockResolvedValue(mockTrend);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.dealsWonTrend({ months: 6 });

      expect(result).toEqual(mockTrend);
      expect(mockAnalyticsService.getDealsWonTrend).toHaveBeenCalledWith('tenant_123', 6);
    });

    it('should use default months value of 6', async () => {
      mockAnalyticsService.getDealsWonTrend.mockResolvedValue([]);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await caller.dealsWonTrend({});

      expect(mockAnalyticsService.getDealsWonTrend).toHaveBeenCalledWith('tenant_123', 6);
    });

    it('should accept months between 1 and 12', async () => {
      mockAnalyticsService.getDealsWonTrend.mockResolvedValue([]);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      // Test minimum value
      await caller.dealsWonTrend({ months: 1 });
      expect(mockAnalyticsService.getDealsWonTrend).toHaveBeenCalledWith('tenant_123', 1);

      // Test maximum value
      await caller.dealsWonTrend({ months: 12 });
      expect(mockAnalyticsService.getDealsWonTrend).toHaveBeenCalledWith('tenant_123', 12);
    });
  });

  // ============================================
  // growthTrends Tests
  // ============================================

  describe('growthTrends', () => {
    it('should return revenue growth trends', async () => {
      const mockTrends = {
        data: [
          { month: '2025-01', value: 50000 },
          { month: '2025-02', value: 55000 },
        ],
        total: 105000,
        change: 10,
      };

      mockAnalyticsService.getGrowthTrend.mockResolvedValue(mockTrends);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.growthTrends({ metric: 'revenue', months: 12 });

      expect(result).toEqual(mockTrends);
      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'revenue', 12);
    });

    it('should return leads growth trends', async () => {
      mockAnalyticsService.getGrowthTrend.mockResolvedValue({ data: [], total: 0, change: 0 });

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await caller.growthTrends({ metric: 'leads', months: 6 });

      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'leads', 6);
    });

    it('should return deals growth trends', async () => {
      mockAnalyticsService.getGrowthTrend.mockResolvedValue({ data: [], total: 0, change: 0 });

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await caller.growthTrends({ metric: 'deals', months: 3 });

      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'deals', 3);
    });

    it('should return contacts growth trends', async () => {
      mockAnalyticsService.getGrowthTrend.mockResolvedValue({ data: [], total: 0, change: 0 });

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await caller.growthTrends({ metric: 'contacts', months: 9 });

      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'contacts', 9);
    });

    it('should use default months value of 12', async () => {
      mockAnalyticsService.getGrowthTrend.mockResolvedValue({ data: [], total: 0, change: 0 });

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await caller.growthTrends({ metric: 'revenue' });

      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'revenue', 12);
    });
  });

  // ============================================
  // trafficSources Tests
  // ============================================

  describe('trafficSources', () => {
    it('should return traffic source distribution', async () => {
      const mockSources = [
        { name: 'Website', value: 40, color: '#3B82F6', percentage: 40 },
        { name: 'Referral', value: 30, color: '#10B981', percentage: 30 },
        { name: 'Social', value: 20, color: '#F59E0B', percentage: 20 },
        { name: 'Other', value: 10, color: '#6B7280', percentage: 10 },
      ];

      mockAnalyticsService.getTrafficSources.mockResolvedValue(mockSources);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.trafficSources();

      expect(result).toEqual(mockSources);
      expect(mockAnalyticsService.getTrafficSources).toHaveBeenCalledWith('tenant_123');
    });

    it('should return empty array when no traffic sources', async () => {
      mockAnalyticsService.getTrafficSources.mockResolvedValue([]);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.trafficSources();

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // recentActivity Tests
  // ============================================

  describe('recentActivity', () => {
    it('should return recent activity feed', async () => {
      const mockActivities = [
        { id: '1', icon: 'user-plus', description: 'New lead: John Doe', time: '2 minutes ago' },
        {
          id: '2',
          icon: 'check-circle',
          description: 'Deal won: Acme Corp',
          time: '15 minutes ago',
        },
        { id: '3', icon: 'star', description: 'Lead qualified: Jane Smith', time: '1 hour ago' },
      ];

      mockAnalyticsService.getRecentActivity.mockResolvedValue(mockActivities);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.recentActivity({ limit: 10 });

      expect(result).toEqual(mockActivities);
      expect(mockAnalyticsService.getRecentActivity).toHaveBeenCalledWith('tenant_123', 10);
    });

    it('should use default limit of 10', async () => {
      mockAnalyticsService.getRecentActivity.mockResolvedValue([]);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await caller.recentActivity({});

      expect(mockAnalyticsService.getRecentActivity).toHaveBeenCalledWith('tenant_123', 10);
    });

    it('should accept limit between 1 and 50', async () => {
      mockAnalyticsService.getRecentActivity.mockResolvedValue([]);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      // Test minimum value
      await caller.recentActivity({ limit: 1 });
      expect(mockAnalyticsService.getRecentActivity).toHaveBeenCalledWith('tenant_123', 1);

      // Test maximum value
      await caller.recentActivity({ limit: 50 });
      expect(mockAnalyticsService.getRecentActivity).toHaveBeenCalledWith('tenant_123', 50);
    });

    it('should return empty array when no activities', async () => {
      mockAnalyticsService.getRecentActivity.mockResolvedValue([]);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.recentActivity({ limit: 10 });

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // leadStats Tests
  // ============================================

  describe('leadStats', () => {
    it('should return lead statistics', async () => {
      const mockStats = {
        total: 150,
        newThisMonth: 25,
        qualified: 45,
        converted: 30,
      };

      mockAnalyticsService.getLeadStats.mockResolvedValue(mockStats);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.leadStats();

      expect(result).toEqual(mockStats);
      expect(mockAnalyticsService.getLeadStats).toHaveBeenCalledWith('tenant_123');
    });

    it('should return zeros when no leads exist', async () => {
      const mockStats = {
        total: 0,
        newThisMonth: 0,
        qualified: 0,
        converted: 0,
      };

      mockAnalyticsService.getLeadStats.mockResolvedValue(mockStats);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.leadStats();

      expect(result.total).toBe(0);
      expect(result.newThisMonth).toBe(0);
    });
  });

  // ============================================
  // exportMetrics Tests (IFC-200)
  // ============================================

  describe('exportMetrics', () => {
    it('should return metrics data for valid date range and metric types', async () => {
      const mockData = [
        { month: 'Jan 2026', metric: 'leads', value: 42 },
        { month: 'Feb 2026', metric: 'leads', value: 55 },
      ];
      mockAnalyticsService.exportMetrics.mockResolvedValue(mockData);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.exportMetrics({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-02-28T23:59:59Z',
        metrics: ['leads'],
      });

      expect(result).toEqual(mockData);
      expect(mockAnalyticsService.exportMetrics).toHaveBeenCalledWith(
        'tenant_123',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
        ['leads']
      );
    });

    it('should throw INTERNAL_SERVER_ERROR when analytics service unavailable', async () => {
      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: undefined,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(
        caller.exportMetrics({
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-02-28T23:59:59Z',
          metrics: ['leads'],
        })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('should throw UNAUTHORIZED when no tenantId', async () => {
      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: undefined,
        } as any, // test-only mock
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(
        caller.exportMetrics({
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-02-28T23:59:59Z',
          metrics: ['revenue'],
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ============================================
  // exportConversionFunnel Tests (IFC-200)
  // ============================================

  describe('exportConversionFunnel', () => {
    it('should return conversion funnel data for valid date range', async () => {
      const mockData = {
        leads: 100,
        opportunities: 30,
        closedWon: 10,
        conversionRate: 10,
      };
      mockAnalyticsService.exportConversionFunnel.mockResolvedValue(mockData);

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.exportConversionFunnel({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-02-28T23:59:59Z',
      });

      expect(result).toEqual(mockData);
      expect(mockAnalyticsService.exportConversionFunnel).toHaveBeenCalledWith(
        'tenant_123',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      );
    });

    it('should return zeros when no data exists', async () => {
      mockAnalyticsService.exportConversionFunnel.mockResolvedValue({
        leads: 0,
        opportunities: 0,
        closedWon: 0,
        conversionRate: 0,
      });

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      const result = await caller.exportConversionFunnel({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-02-28T23:59:59Z',
      });

      expect(result.leads).toBe(0);
      expect(result.conversionRate).toBe(0);
    });

    it('should throw INTERNAL_SERVER_ERROR when analytics service unavailable', async () => {
      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: undefined,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(
        caller.exportConversionFunnel({
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-02-28T23:59:59Z',
        })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });
  });

  // ============================================
  // Error handling tests
  // ============================================

  describe('error handling', () => {
    it('should propagate service errors', async () => {
      mockAnalyticsService.getLeadStats.mockRejectedValue(new Error('Database connection failed'));

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(caller.leadStats()).rejects.toThrow('Database connection failed');
    });

    it('should handle TRPCError from service', async () => {
      mockAnalyticsService.getTrafficSources.mockRejectedValue(
        new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tenant data not found',
        })
      );

      const mockContext = {
        prisma: mockPrisma,
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as any // test-only mock
      );

      await expect(caller.trafficSources()).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Tenant data not found',
      });
    });
  });

  // ============================================
  // IFC-190: getOverview Tests (6 tests)
  // ============================================

  describe('getOverview', () => {
    it('should return composite overview metrics', async () => {
      const mockOverview = {
        totalLeads: 150,
        leadDelta: 12,
        totalRevenue: 500000,
        revenueDelta: 25000,
        openOpportunities: 42,
        newContacts: 18,
        winRate: 65,
        recentActivity: [
          {
            id: '1',
            action: 'CREATE',
            icon: 'add_circle',
            description: 'New lead',
            createdAt: new Date(),
            metadata: {},
          },
        ],
      };
      mockAnalyticsService.getOverview.mockResolvedValue(mockOverview);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getOverview({});

      expect(result).toEqual(mockOverview);
      expect(result.totalLeads).toBe(150);
      expect(result.totalRevenue).toBe(500000);
      expect(result.winRate).toBe(65);
      expect(result.recentActivity).toHaveLength(1);
      expect(mockAnalyticsService.getOverview).toHaveBeenCalledWith('tenant_123', undefined);
    });

    it('should return zeros and empty arrays when no data', async () => {
      mockAnalyticsService.getOverview.mockResolvedValue({
        totalLeads: 0,
        leadDelta: 0,
        totalRevenue: 0,
        revenueDelta: 0,
        openOpportunities: 0,
        newContacts: 0,
        winRate: 0,
        recentActivity: [],
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getOverview({});

      expect(result.totalLeads).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.recentActivity).toEqual([]);
    });

    it('should throw INTERNAL_SERVER_ERROR when analytics service undefined', async () => {
      const caller = analyticsRouter.createCaller(makeCtx({ analytics: undefined as any }));
      await expect(caller.getOverview({})).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('should throw UNAUTHORIZED when tenantId is undefined', async () => {
      const caller = analyticsRouter.createCaller(makeCtx({ tenantId: undefined }));
      await expect(caller.getOverview({})).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should propagate service errors', async () => {
      mockAnalyticsService.getOverview.mockRejectedValue(new Error('DB connection failed'));
      const caller = analyticsRouter.createCaller(makeCtx());
      await expect(caller.getOverview({})).rejects.toThrow('DB connection failed');
    });

    it('should pass explicit date range to service', async () => {
      mockAnalyticsService.getOverview.mockResolvedValue({
        totalLeads: 10,
        leadDelta: 0,
        totalRevenue: 0,
        revenueDelta: 0,
        openOpportunities: 0,
        newContacts: 0,
        winRate: 0,
        recentActivity: [],
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.getOverview({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-31T23:59:59Z',
      });

      expect(mockAnalyticsService.getOverview).toHaveBeenCalledWith(
        'tenant_123',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      );
    });
  });

  // ============================================
  // IFC-190: getSalesMetrics Tests (8 tests)
  // ============================================

  describe('getSalesMetrics', () => {
    const validInput = {
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-01-31T23:59:59Z',
    };

    it('should return all 7 sales KPIs', async () => {
      const mockSales = {
        pipelineValue: 1200000,
        winRate: 72.5,
        avgDealSize: 45000,
        avgSalesCycleDays: 32,
        totalRevenue: 890000,
        closedWonCount: 20,
        closedLostCount: 8,
      };
      mockAnalyticsService.getSalesMetrics.mockResolvedValue(mockSales);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getSalesMetrics(validInput);

      expect(result.pipelineValue).toBe(1200000);
      expect(result.winRate).toBe(72.5);
      expect(result.avgDealSize).toBe(45000);
      expect(result.avgSalesCycleDays).toBe(32);
      expect(result.totalRevenue).toBe(890000);
      expect(result.closedWonCount).toBe(20);
      expect(result.closedLostCount).toBe(8);
    });

    it('should pass date range to service', async () => {
      mockAnalyticsService.getSalesMetrics.mockResolvedValue({
        pipelineValue: 0,
        winRate: 0,
        avgDealSize: 0,
        avgSalesCycleDays: null,
        totalRevenue: 0,
        closedWonCount: 0,
        closedLostCount: 0,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.getSalesMetrics(validInput);

      expect(mockAnalyticsService.getSalesMetrics).toHaveBeenCalledWith(
        'tenant_123',
        expect.objectContaining({ startDate: expect.any(Date), endDate: expect.any(Date) }),
        undefined
      );
    });

    it('should pass optional ownerId to service', async () => {
      mockAnalyticsService.getSalesMetrics.mockResolvedValue({
        pipelineValue: 0,
        winRate: 0,
        avgDealSize: 0,
        avgSalesCycleDays: null,
        totalRevenue: 0,
        closedWonCount: 0,
        closedLostCount: 0,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.getSalesMetrics({ ...validInput, ownerId: 'owner_456' });

      expect(mockAnalyticsService.getSalesMetrics).toHaveBeenCalledWith(
        'tenant_123',
        expect.any(Object),
        'owner_456'
      );
    });

    it('should return zero win rate when no closed deals (AC-009)', async () => {
      mockAnalyticsService.getSalesMetrics.mockResolvedValue({
        pipelineValue: 500000,
        winRate: 0,
        avgDealSize: 0,
        avgSalesCycleDays: null,
        totalRevenue: 0,
        closedWonCount: 0,
        closedLostCount: 0,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getSalesMetrics(validInput);

      expect(result.winRate).toBe(0);
      expect(result.closedWonCount).toBe(0);
    });

    it('should return null avgSalesCycleDays when no closed deals', async () => {
      mockAnalyticsService.getSalesMetrics.mockResolvedValue({
        pipelineValue: 0,
        winRate: 0,
        avgDealSize: 0,
        avgSalesCycleDays: null,
        totalRevenue: 0,
        closedWonCount: 0,
        closedLostCount: 0,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getSalesMetrics(validInput);

      expect(result.avgSalesCycleDays).toBeNull();
    });

    it('should reject invalid date strings', async () => {
      const caller = analyticsRouter.createCaller(makeCtx());
      await expect(
        caller.getSalesMetrics({ startDate: 'not-a-date', endDate: '2026-01-31T23:59:59Z' })
      ).rejects.toThrow();
    });

    it('should throw INTERNAL_SERVER_ERROR when service unavailable', async () => {
      const caller = analyticsRouter.createCaller(makeCtx({ analytics: undefined as any }));
      await expect(caller.getSalesMetrics(validInput)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('should throw UNAUTHORIZED when tenantId missing', async () => {
      const caller = analyticsRouter.createCaller(makeCtx({ tenantId: undefined }));
      await expect(caller.getSalesMetrics(validInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ============================================
  // IFC-190: getLeadMetrics Tests (7 tests)
  // ============================================

  describe('getLeadMetrics', () => {
    const validInput = {
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-01-31T23:59:59Z',
    };

    it('should return lead metrics with source and status breakdown', async () => {
      const mockLeads = {
        total: 200,
        bySource: [
          { source: 'WEBSITE', name: 'Website', count: 80, percentage: 40 },
          { source: 'REFERRAL', name: 'Referral', count: 60, percentage: 30 },
        ],
        byStatus: [
          { status: 'NEW', count: 100, percentage: 50 },
          { status: 'QUALIFIED', count: 60, percentage: 30 },
        ],
        conversionRate: 15,
      };
      mockAnalyticsService.getLeadMetrics.mockResolvedValue(mockLeads);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getLeadMetrics(validInput);

      expect(result.total).toBe(200);
      expect(result.bySource).toHaveLength(2);
      expect(result.byStatus).toHaveLength(2);
      expect(result.conversionRate).toBe(15);
    });

    it('should return zeros and empty arrays when no leads (AC-009)', async () => {
      mockAnalyticsService.getLeadMetrics.mockResolvedValue({
        total: 0,
        bySource: [],
        byStatus: [],
        conversionRate: 0,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getLeadMetrics(validInput);

      expect(result.total).toBe(0);
      expect(result.conversionRate).toBe(0);
      expect(result.bySource).toEqual([]);
    });

    it('should compute correct conversion rate', async () => {
      mockAnalyticsService.getLeadMetrics.mockResolvedValue({
        total: 100,
        bySource: [],
        byStatus: [],
        conversionRate: 25,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getLeadMetrics(validInput);

      expect(result.conversionRate).toBe(25);
    });

    it('should have source percentages that are consistent', async () => {
      mockAnalyticsService.getLeadMetrics.mockResolvedValue({
        total: 100,
        bySource: [
          { source: 'WEBSITE', name: 'Website', count: 60, percentage: 60 },
          { source: 'REFERRAL', name: 'Referral', count: 40, percentage: 40 },
        ],
        byStatus: [],
        conversionRate: 10,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getLeadMetrics(validInput);

      const totalPercentage = result.bySource.reduce(
        (sum: number, s: { percentage: number }) => sum + s.percentage,
        0
      );
      expect(totalPercentage).toBe(100);
    });

    it('should reject missing required dates', async () => {
      const caller = analyticsRouter.createCaller(makeCtx());
      await expect((caller as any).getLeadMetrics({})).rejects.toThrow();
    });

    it('should throw INTERNAL_SERVER_ERROR when service unavailable', async () => {
      const caller = analyticsRouter.createCaller(makeCtx({ analytics: undefined as any }));
      await expect(caller.getLeadMetrics(validInput)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('should throw UNAUTHORIZED when tenantId missing', async () => {
      const caller = analyticsRouter.createCaller(makeCtx({ tenantId: undefined }));
      await expect(caller.getLeadMetrics(validInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ============================================
  // IFC-190: getConversionFunnel Tests (8 tests)
  // ============================================

  describe('getConversionFunnel', () => {
    const validInput = {
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-01-31T23:59:59Z',
    };

    it('should return 7 stages with counts, values, and conversion rates', async () => {
      const mockFunnel = {
        stages: [
          {
            stage: 'PROSPECTING',
            label: 'Prospecting',
            count: 100,
            value: 500000,
            conversionFromPrevious: null,
          },
          {
            stage: 'QUALIFICATION',
            label: 'Qualification',
            count: 80,
            value: 400000,
            conversionFromPrevious: 80,
          },
          {
            stage: 'NEEDS_ANALYSIS',
            label: 'Needs Analysis',
            count: 60,
            value: 300000,
            conversionFromPrevious: 75,
          },
          {
            stage: 'PROPOSAL',
            label: 'Proposal',
            count: 40,
            value: 200000,
            conversionFromPrevious: 66.7,
          },
          {
            stage: 'NEGOTIATION',
            label: 'Negotiation',
            count: 30,
            value: 150000,
            conversionFromPrevious: 75,
          },
          {
            stage: 'CLOSED_WON',
            label: 'Closed Won',
            count: 20,
            value: 100000,
            conversionFromPrevious: 66.7,
          },
          {
            stage: 'CLOSED_LOST',
            label: 'Closed Lost',
            count: 10,
            value: 50000,
            conversionFromPrevious: 33.3,
          },
        ],
        totalLeads: 200,
        overallConversionRate: 20,
      };
      mockAnalyticsService.getConversionFunnel.mockResolvedValue(mockFunnel);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getConversionFunnel(validInput);

      expect(result.stages).toHaveLength(7);
      expect(result.stages[0].stage).toBe('PROSPECTING');
      expect(result.stages[0].conversionFromPrevious).toBeNull();
      expect(result.totalLeads).toBe(200);
    });

    it('should return zero-filled stages when no data', async () => {
      const mockFunnel = {
        stages: [
          {
            stage: 'PROSPECTING',
            label: 'Prospecting',
            count: 0,
            value: 0,
            conversionFromPrevious: null,
          },
          {
            stage: 'QUALIFICATION',
            label: 'Qualification',
            count: 0,
            value: 0,
            conversionFromPrevious: 0,
          },
          {
            stage: 'NEEDS_ANALYSIS',
            label: 'Needs Analysis',
            count: 0,
            value: 0,
            conversionFromPrevious: 0,
          },
          { stage: 'PROPOSAL', label: 'Proposal', count: 0, value: 0, conversionFromPrevious: 0 },
          {
            stage: 'NEGOTIATION',
            label: 'Negotiation',
            count: 0,
            value: 0,
            conversionFromPrevious: 0,
          },
          {
            stage: 'CLOSED_WON',
            label: 'Closed Won',
            count: 0,
            value: 0,
            conversionFromPrevious: 0,
          },
          {
            stage: 'CLOSED_LOST',
            label: 'Closed Lost',
            count: 0,
            value: 0,
            conversionFromPrevious: 0,
          },
        ],
        totalLeads: 0,
        overallConversionRate: 0,
      };
      mockAnalyticsService.getConversionFunnel.mockResolvedValue(mockFunnel);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getConversionFunnel(validInput);

      expect(result.stages).toHaveLength(7);
      expect(result.stages.every((s: { count: number }) => s.count === 0)).toBe(true);
    });

    it('should have null conversionFromPrevious for first stage', async () => {
      mockAnalyticsService.getConversionFunnel.mockResolvedValue({
        stages: [
          {
            stage: 'PROSPECTING',
            label: 'Prospecting',
            count: 50,
            value: 250000,
            conversionFromPrevious: null,
          },
        ],
        totalLeads: 100,
        overallConversionRate: 50,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getConversionFunnel(validInput);

      expect(result.stages[0].conversionFromPrevious).toBeNull();
    });

    it('should validate funnel stage ordering', async () => {
      const stages = [
        'PROSPECTING',
        'QUALIFICATION',
        'NEEDS_ANALYSIS',
        'PROPOSAL',
        'NEGOTIATION',
        'CLOSED_WON',
        'CLOSED_LOST',
      ];
      const mockFunnel = {
        stages: stages.map((stage, i) => ({
          stage,
          label: stage,
          count: 100 - i * 10,
          value: (100 - i * 10) * 1000,
          conversionFromPrevious: i === 0 ? null : 90,
        })),
        totalLeads: 150,
        overallConversionRate: 30,
      };
      mockAnalyticsService.getConversionFunnel.mockResolvedValue(mockFunnel);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getConversionFunnel(validInput);

      expect(result.stages.map((s: { stage: string }) => s.stage)).toEqual(stages);
    });

    it('should include totalLeads when includeLeads is true', async () => {
      mockAnalyticsService.getConversionFunnel.mockResolvedValue({
        stages: [],
        totalLeads: 200,
        overallConversionRate: 0,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.getConversionFunnel({ ...validInput, includeLeads: true });

      expect(mockAnalyticsService.getConversionFunnel).toHaveBeenCalledWith(
        'tenant_123',
        expect.any(Object),
        true
      );
    });

    it('should omit lead count when includeLeads is false', async () => {
      mockAnalyticsService.getConversionFunnel.mockResolvedValue({
        stages: [],
        totalLeads: 0,
        overallConversionRate: 0,
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.getConversionFunnel({ ...validInput, includeLeads: false });

      expect(mockAnalyticsService.getConversionFunnel).toHaveBeenCalledWith(
        'tenant_123',
        expect.any(Object),
        false
      );
    });

    it('should throw INTERNAL_SERVER_ERROR when service unavailable', async () => {
      const caller = analyticsRouter.createCaller(makeCtx({ analytics: undefined as any }));
      await expect(caller.getConversionFunnel(validInput)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('should throw UNAUTHORIZED when tenantId missing', async () => {
      const caller = analyticsRouter.createCaller(makeCtx({ tenantId: undefined }));
      await expect(caller.getConversionFunnel(validInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ============================================
  // IFC-190: getTimeSeriesData Tests (11 tests)
  // ============================================

  describe('getTimeSeriesData', () => {
    const validInput = {
      metric: 'revenue' as const,
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-01-31T23:59:59Z',
      granularity: 'month' as const,
    };

    it('should return time series points for revenue metric', async () => {
      const mockData = [{ period: '2026-01', periodLabel: 'Jan 2026', value: 50000 }];
      mockAnalyticsService.getTimeSeriesData.mockResolvedValue(mockData);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getTimeSeriesData(validInput);

      expect(result).toEqual(mockData);
      expect(result[0].value).toBe(50000);
    });

    it('should return time series points for leads metric', async () => {
      mockAnalyticsService.getTimeSeriesData.mockResolvedValue([
        { period: '2026-01', periodLabel: 'Jan 2026', value: 42 },
      ]);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getTimeSeriesData({ ...validInput, metric: 'leads' });

      expect(result[0].value).toBe(42);
    });

    it('should return time series points for deals metric', async () => {
      mockAnalyticsService.getTimeSeriesData.mockResolvedValue([
        { period: '2026-01', periodLabel: 'Jan 2026', value: 15 },
      ]);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.getTimeSeriesData({ ...validInput, metric: 'deals' });

      expect(result[0].value).toBe(15);
    });

    it('should return time series for contacts metric', async () => {
      mockAnalyticsService.getTimeSeriesData.mockResolvedValue([]);

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.getTimeSeriesData({ ...validInput, metric: 'contacts' });

      expect(mockAnalyticsService.getTimeSeriesData).toHaveBeenCalled();
    });

    it('should return time series for pipeline_value metric', async () => {
      mockAnalyticsService.getTimeSeriesData.mockResolvedValue([]);

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.getTimeSeriesData({ ...validInput, metric: 'pipeline_value' });

      expect(mockAnalyticsService.getTimeSeriesData).toHaveBeenCalled();
    });

    it('should return time series for win_rate metric', async () => {
      mockAnalyticsService.getTimeSeriesData.mockResolvedValue([]);

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.getTimeSeriesData({ ...validInput, metric: 'win_rate' });

      expect(mockAnalyticsService.getTimeSeriesData).toHaveBeenCalled();
    });

    it('should accept day, week, and month granularity', async () => {
      mockAnalyticsService.getTimeSeriesData.mockResolvedValue([]);

      const caller = analyticsRouter.createCaller(makeCtx());

      for (const granularity of ['day', 'week', 'month'] as const) {
        await caller.getTimeSeriesData({ ...validInput, granularity });
        expect(mockAnalyticsService.getTimeSeriesData).toHaveBeenCalled();
      }
    });

    it('should reject invalid metric enum values', async () => {
      const caller = analyticsRouter.createCaller(makeCtx());
      await expect(
        caller.getTimeSeriesData({ ...validInput, metric: 'invalid_metric' as any })
      ).rejects.toThrow();
    });

    it('should reject daily granularity exceeding 31 days (NF-003)', async () => {
      const caller = analyticsRouter.createCaller(makeCtx());
      await expect(
        caller.getTimeSeriesData({
          metric: 'revenue',
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-03-01T00:00:00Z',
          granularity: 'day',
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('should reject weekly granularity exceeding 365 days (NF-003)', async () => {
      const caller = analyticsRouter.createCaller(makeCtx());
      await expect(
        caller.getTimeSeriesData({
          metric: 'revenue',
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2026-01-02T00:00:00Z',
          granularity: 'week',
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('should throw service/tenant guards', async () => {
      const caller1 = analyticsRouter.createCaller(makeCtx({ analytics: undefined as any }));
      await expect(caller1.getTimeSeriesData(validInput)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });

      const caller2 = analyticsRouter.createCaller(makeCtx({ tenantId: undefined }));
      await expect(caller2.getTimeSeriesData(validInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ============================================
  // IFC-190: exportReport Tests (10 tests)
  // ============================================

  describe('exportReport', () => {
    const validInput = {
      format: 'json' as const,
      reportType: 'sales' as const,
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-01-31T23:59:59Z',
    };

    it('should return JSON format export', async () => {
      const mockExport = {
        format: 'json',
        data: { pipelineValue: 100000 },
        filename: 'intelliflow-sales-2026-01-01-2026-01-31.json',
      };
      mockAnalyticsService.exportReport.mockResolvedValue(mockExport);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.exportReport(validInput);

      expect(result.format).toBe('json');
      expect(result.filename).toContain('.json');
      expect(result.data).toBeDefined();
    });

    it('should return CSV format export', async () => {
      const mockExport = {
        format: 'csv',
        data: 'pipelineValue,winRate\n100000,72.5',
        filename: 'intelliflow-sales-2026-01-01-2026-01-31.csv',
      };
      mockAnalyticsService.exportReport.mockResolvedValue(mockExport);

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.exportReport({ ...validInput, format: 'csv' });

      expect(result.format).toBe('csv');
      expect(typeof result.data).toBe('string');
      expect(result.filename).toContain('.csv');
    });

    it('should delegate sales report type', async () => {
      mockAnalyticsService.exportReport.mockResolvedValue({
        format: 'json',
        data: {},
        filename: 'f.json',
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.exportReport({ ...validInput, reportType: 'sales' });

      expect(mockAnalyticsService.exportReport).toHaveBeenCalledWith(
        'tenant_123',
        'sales',
        expect.any(Object),
        'json',
        expect.any(Object)
      );
    });

    it('should delegate leads report type', async () => {
      mockAnalyticsService.exportReport.mockResolvedValue({
        format: 'json',
        data: {},
        filename: 'f.json',
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.exportReport({ ...validInput, reportType: 'leads' });

      expect(mockAnalyticsService.exportReport).toHaveBeenCalledWith(
        'tenant_123',
        'leads',
        expect.any(Object),
        'json',
        expect.any(Object)
      );
    });

    it('should delegate funnel report type', async () => {
      mockAnalyticsService.exportReport.mockResolvedValue({
        format: 'json',
        data: {},
        filename: 'f.json',
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.exportReport({ ...validInput, reportType: 'funnel' });

      expect(mockAnalyticsService.exportReport).toHaveBeenCalledWith(
        'tenant_123',
        'funnel',
        expect.any(Object),
        'json',
        expect.any(Object)
      );
    });

    it('should delegate timeseries report type', async () => {
      mockAnalyticsService.exportReport.mockResolvedValue({
        format: 'json',
        data: {},
        filename: 'f.json',
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.exportReport({ ...validInput, reportType: 'timeseries' });

      expect(mockAnalyticsService.exportReport).toHaveBeenCalledWith(
        'tenant_123',
        'timeseries',
        expect.any(Object),
        'json',
        expect.any(Object)
      );
    });

    it('should delegate overview report type', async () => {
      mockAnalyticsService.exportReport.mockResolvedValue({
        format: 'json',
        data: {},
        filename: 'f.json',
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      await caller.exportReport({ ...validInput, reportType: 'overview' });

      expect(mockAnalyticsService.exportReport).toHaveBeenCalledWith(
        'tenant_123',
        'overview',
        expect.any(Object),
        'json',
        expect.any(Object)
      );
    });

    it('should include CSV headers in CSV output', async () => {
      mockAnalyticsService.exportReport.mockResolvedValue({
        format: 'csv',
        data: 'pipelineValue,winRate,avgDealSize\n100000,72.5,45000',
        filename: 'report.csv',
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.exportReport({ ...validInput, format: 'csv' });

      expect(typeof result.data).toBe('string');
      expect(result.data as string).toContain('pipelineValue');
    });

    it('should handle empty data gracefully', async () => {
      mockAnalyticsService.exportReport.mockResolvedValue({
        format: 'json',
        data: {},
        filename: 'empty.json',
      });

      const caller = analyticsRouter.createCaller(makeCtx());
      const result = await caller.exportReport(validInput);

      expect(result.data).toBeDefined();
      expect(result.filename).toContain('.json');
    });

    it('should throw service/tenant guards', async () => {
      const caller1 = analyticsRouter.createCaller(makeCtx({ analytics: undefined as any }));
      await expect(caller1.exportReport(validInput)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });

      const caller2 = analyticsRouter.createCaller(makeCtx({ tenantId: undefined }));
      await expect(caller2.exportReport(validInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });
});
