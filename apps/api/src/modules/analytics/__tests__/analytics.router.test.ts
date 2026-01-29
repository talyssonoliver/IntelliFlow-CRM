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
import type { UserSession } from '../../../context';

// Mock analytics service methods
const mockAnalyticsService = {
  getDealsWonTrend: vi.fn(),
  getGrowthTrend: vi.fn(),
  getTrafficSources: vi.fn(),
  getRecentActivity: vi.fn(),
  getLeadStats: vi.fn(),
};

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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await expect(caller.leadStats()).rejects.toThrow(TRPCError);
      await expect(caller.leadStats()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Analytics service not available',
      });
    });

    it('should throw INTERNAL_SERVER_ERROR when services object is undefined', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
        } as UserSession,
        services: undefined,
      };

      const caller = analyticsRouter.createCaller(
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await expect(caller.leadStats()).rejects.toThrow(TRPCError);
    });
  });

  describe('getTenantId (via endpoints)', () => {
    it('should throw UNAUTHORIZED when user has no tenantId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: undefined,
        } as UserSession,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await expect(caller.leadStats()).rejects.toThrow(TRPCError);
      await expect(caller.leadStats()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Tenant ID not found in user context',
      });
    });

    it('should throw UNAUTHORIZED when user object is undefined', async () => {
      const mockContext = {
        user: undefined,
        services: {
          analytics: mockAnalyticsService,
        },
      };

      const caller = analyticsRouter.createCaller(
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      const result = await caller.dealsWonTrend({ months: 6 });

      expect(result).toEqual(mockTrend);
      expect(mockAnalyticsService.getDealsWonTrend).toHaveBeenCalledWith('tenant_123', 6);
    });

    it('should use default months value of 6', async () => {
      mockAnalyticsService.getDealsWonTrend.mockResolvedValue([]);

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await caller.dealsWonTrend({});

      expect(mockAnalyticsService.getDealsWonTrend).toHaveBeenCalledWith('tenant_123', 6);
    });

    it('should accept months between 1 and 12', async () => {
      mockAnalyticsService.getDealsWonTrend.mockResolvedValue([]);

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      const result = await caller.growthTrends({ metric: 'revenue', months: 12 });

      expect(result).toEqual(mockTrends);
      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'revenue', 12);
    });

    it('should return leads growth trends', async () => {
      mockAnalyticsService.getGrowthTrend.mockResolvedValue({ data: [], total: 0, change: 0 });

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await caller.growthTrends({ metric: 'leads', months: 6 });

      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'leads', 6);
    });

    it('should return deals growth trends', async () => {
      mockAnalyticsService.getGrowthTrend.mockResolvedValue({ data: [], total: 0, change: 0 });

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await caller.growthTrends({ metric: 'deals', months: 3 });

      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'deals', 3);
    });

    it('should return contacts growth trends', async () => {
      mockAnalyticsService.getGrowthTrend.mockResolvedValue({ data: [], total: 0, change: 0 });

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await caller.growthTrends({ metric: 'contacts', months: 9 });

      expect(mockAnalyticsService.getGrowthTrend).toHaveBeenCalledWith('tenant_123', 'contacts', 9);
    });

    it('should use default months value of 12', async () => {
      mockAnalyticsService.getGrowthTrend.mockResolvedValue({ data: [], total: 0, change: 0 });

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      const result = await caller.trafficSources();

      expect(result).toEqual(mockSources);
      expect(mockAnalyticsService.getTrafficSources).toHaveBeenCalledWith('tenant_123');
    });

    it('should return empty array when no traffic sources', async () => {
      mockAnalyticsService.getTrafficSources.mockResolvedValue([]);

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
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
        { id: '2', icon: 'check-circle', description: 'Deal won: Acme Corp', time: '15 minutes ago' },
        { id: '3', icon: 'star', description: 'Lead qualified: Jane Smith', time: '1 hour ago' },
      ];

      mockAnalyticsService.getRecentActivity.mockResolvedValue(mockActivities);

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      const result = await caller.recentActivity({ limit: 10 });

      expect(result).toEqual(mockActivities);
      expect(mockAnalyticsService.getRecentActivity).toHaveBeenCalledWith('tenant_123', 10);
    });

    it('should use default limit of 10', async () => {
      mockAnalyticsService.getRecentActivity.mockResolvedValue([]);

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await caller.recentActivity({});

      expect(mockAnalyticsService.getRecentActivity).toHaveBeenCalledWith('tenant_123', 10);
    });

    it('should accept limit between 1 and 50', async () => {
      mockAnalyticsService.getRecentActivity.mockResolvedValue([]);

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      const result = await caller.leadStats();

      expect(result.total).toBe(0);
      expect(result.newThisMonth).toBe(0);
    });
  });

  // ============================================
  // Error handling tests
  // ============================================

  describe('error handling', () => {
    it('should propagate service errors', async () => {
      mockAnalyticsService.getLeadStats.mockRejectedValue(new Error('Database connection failed'));

      const mockContext = {
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
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
        mockContext as Parameters<typeof analyticsRouter.createCaller>[0]
      );

      await expect(caller.trafficSources()).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Tenant data not found',
      });
    });
  });
});
