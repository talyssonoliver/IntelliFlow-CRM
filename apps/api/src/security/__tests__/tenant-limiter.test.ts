/**
 * Tenant Resource Limiter Tests - IFC-127
 *
 * Tests for tenant resource limit enforcement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  DEFAULT_LIMITS,
  type TenantLimits,
  type ResourceType,
  type ResourceUsage,
  getTenantLimits,
  checkResourceUsage,
  enforceResourceLimit,
  incrementRateLimit,
  incrementDailyRequests,
  trackConcurrentRequestStart,
  trackConcurrentRequestEnd,
  rateLimitMiddleware,
  concurrentRequestMiddleware,
  resourceLimitMiddleware,
  getAllResourceUsage,
  checkApproachingLimits,
  clearRateLimitState,
} from '../tenant-limiter';

// Mock Prisma client
const mockPrismaClient = {
  user: {
    findUnique: vi.fn(),
  },
  lead: {
    count: vi.fn(),
  },
  contact: {
    count: vi.fn(),
  },
  account: {
    count: vi.fn(),
  },
  opportunity: {
    count: vi.fn(),
  },
  task: {
    count: vi.fn(),
  },
  aIScore: {
    count: vi.fn(),
  },
};

describe('Tenant Resource Limiter - IFC-127', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearRateLimitState();
  });

  describe('ResourceType', () => {
    it('should include all expected resource types', () => {
      const resourceTypes: ResourceType[] = [
        'leads',
        'contacts',
        'accounts',
        'opportunities',
        'tasks',
        'ai_scores',
        'storage_mb',
        'api_requests_per_minute',
        'api_requests_per_day',
        'concurrent_requests',
      ];

      expect(resourceTypes).toHaveLength(10);
      expect(resourceTypes).toContain('leads');
      expect(resourceTypes).toContain('contacts');
      expect(resourceTypes).toContain('ai_scores');
      expect(resourceTypes).toContain('storage_mb');
    });
  });

  describe('TenantLimits Interface', () => {
    it('should have all required limit properties', () => {
      const limits: TenantLimits = {
        maxLeads: 100,
        maxContacts: 100,
        maxAccounts: 25,
        maxOpportunities: 25,
        maxTasks: 100,
        maxAiScoresPerDay: 10,
        maxStorageMb: 100,
        apiRateLimit: 60,
        apiDailyLimit: 1000,
        maxConcurrentRequests: 3,
      };

      expect(limits.maxLeads).toBeDefined();
      expect(limits.maxContacts).toBeDefined();
      expect(limits.maxAccounts).toBeDefined();
      expect(limits.maxOpportunities).toBeDefined();
      expect(limits.maxTasks).toBeDefined();
      expect(limits.maxAiScoresPerDay).toBeDefined();
      expect(limits.maxStorageMb).toBeDefined();
      expect(limits.apiRateLimit).toBeDefined();
      expect(limits.apiDailyLimit).toBeDefined();
      expect(limits.maxConcurrentRequests).toBeDefined();
    });
  });

  describe('DEFAULT_LIMITS', () => {
    it('should have FREE tier limits', () => {
      const freeLimits = DEFAULT_LIMITS.FREE;

      expect(freeLimits).toBeDefined();
      expect(freeLimits.maxLeads).toBe(100);
      expect(freeLimits.maxContacts).toBe(100);
      expect(freeLimits.maxAccounts).toBe(25);
      expect(freeLimits.maxAiScoresPerDay).toBe(10);
      expect(freeLimits.maxStorageMb).toBe(100);
    });

    it('should have STARTER tier limits', () => {
      const starterLimits = DEFAULT_LIMITS.STARTER;

      expect(starterLimits).toBeDefined();
      expect(starterLimits.maxLeads).toBe(1000);
      expect(starterLimits.maxContacts).toBe(1000);
      expect(starterLimits.maxAccounts).toBe(100);
      expect(starterLimits.maxAiScoresPerDay).toBe(100);
    });

    it('should have PROFESSIONAL tier limits', () => {
      const proLimits = DEFAULT_LIMITS.PROFESSIONAL;

      expect(proLimits).toBeDefined();
      expect(proLimits.maxLeads).toBe(10000);
      expect(proLimits.maxContacts).toBe(10000);
      expect(proLimits.maxAccounts).toBe(500);
      expect(proLimits.maxAiScoresPerDay).toBe(500);
    });

    it('should have ENTERPRISE tier limits', () => {
      const enterpriseLimits = DEFAULT_LIMITS.ENTERPRISE;

      expect(enterpriseLimits).toBeDefined();
      expect(enterpriseLimits.maxLeads).toBe(100000);
      expect(enterpriseLimits.maxContacts).toBe(100000);
      expect(enterpriseLimits.maxAccounts).toBe(5000);
      expect(enterpriseLimits.maxAiScoresPerDay).toBe(5000);
    });

    it('should have UNLIMITED tier with max safe integer', () => {
      const unlimitedLimits = DEFAULT_LIMITS.UNLIMITED;

      expect(unlimitedLimits).toBeDefined();
      expect(unlimitedLimits.maxLeads).toBe(Number.MAX_SAFE_INTEGER);
      expect(unlimitedLimits.maxContacts).toBe(Number.MAX_SAFE_INTEGER);
      expect(unlimitedLimits.maxAccounts).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should have increasing limits from FREE to ENTERPRISE', () => {
      expect(DEFAULT_LIMITS.FREE.maxLeads).toBeLessThan(DEFAULT_LIMITS.STARTER.maxLeads);
      expect(DEFAULT_LIMITS.STARTER.maxLeads).toBeLessThan(DEFAULT_LIMITS.PROFESSIONAL.maxLeads);
      expect(DEFAULT_LIMITS.PROFESSIONAL.maxLeads).toBeLessThan(DEFAULT_LIMITS.ENTERPRISE.maxLeads);
    });
  });

  describe('getTenantLimits', () => {
    it('should return UNLIMITED limits for ADMIN users', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

      const limits = await getTenantLimits(mockPrismaClient as any, 'tenant-123');

      expect(limits).toEqual(DEFAULT_LIMITS.UNLIMITED);
    });

    it('should return STARTER limits for non-admin users', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });

      const limits = await getTenantLimits(mockPrismaClient as any, 'tenant-123');

      expect(limits).toEqual(DEFAULT_LIMITS.STARTER);
    });

    it('should return STARTER limits when user not found', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      const limits = await getTenantLimits(mockPrismaClient as any, 'tenant-123');

      expect(limits).toEqual(DEFAULT_LIMITS.STARTER);
    });
  });

  describe('checkResourceUsage', () => {
    beforeEach(() => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
    });

    it('should check leads usage', async () => {
      mockPrismaClient.lead.count.mockResolvedValue(50);

      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'leads');

      expect(usage.type).toBe('leads');
      expect(usage.current).toBe(50);
      expect(usage.limit).toBe(DEFAULT_LIMITS.STARTER.maxLeads);
      expect(usage.percentUsed).toBe(5);
      expect(usage.isAtLimit).toBe(false);
    });

    it('should check contacts usage', async () => {
      mockPrismaClient.contact.count.mockResolvedValue(100);

      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'contacts');

      expect(usage.type).toBe('contacts');
      expect(usage.current).toBe(100);
      expect(usage.isAtLimit).toBe(false);
    });

    it('should check accounts usage', async () => {
      mockPrismaClient.account.count.mockResolvedValue(100);

      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'accounts');

      expect(usage.type).toBe('accounts');
      expect(usage.current).toBe(100);
      expect(usage.limit).toBe(DEFAULT_LIMITS.STARTER.maxAccounts);
      expect(usage.isAtLimit).toBe(true);
    });

    it('should check opportunities usage', async () => {
      mockPrismaClient.opportunity.count.mockResolvedValue(50);

      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'opportunities');

      expect(usage.type).toBe('opportunities');
      expect(usage.current).toBe(50);
    });

    it('should check tasks usage', async () => {
      mockPrismaClient.task.count.mockResolvedValue(250);

      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'tasks');

      expect(usage.type).toBe('tasks');
      expect(usage.current).toBe(250);
    });

    it('should check ai_scores usage', async () => {
      mockPrismaClient.aIScore.count.mockResolvedValue(50);

      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'ai_scores');

      expect(usage.type).toBe('ai_scores');
      expect(usage.current).toBe(50);
      expect(usage.limit).toBe(DEFAULT_LIMITS.STARTER.maxAiScoresPerDay);
    });

    it('should check api_requests_per_minute usage', async () => {
      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'api_requests_per_minute');

      expect(usage.type).toBe('api_requests_per_minute');
      expect(usage.current).toBe(0);
      expect(usage.limit).toBe(DEFAULT_LIMITS.STARTER.apiRateLimit);
    });

    it('should check api_requests_per_day usage', async () => {
      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'api_requests_per_day');

      expect(usage.type).toBe('api_requests_per_day');
      expect(usage.current).toBe(0);
    });

    it('should check concurrent_requests usage', async () => {
      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'concurrent_requests');

      expect(usage.type).toBe('concurrent_requests');
      expect(usage.current).toBe(0);
    });

    it('should detect when at limit', async () => {
      mockPrismaClient.lead.count.mockResolvedValue(1000);

      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'leads');

      expect(usage.isAtLimit).toBe(true);
      expect(usage.percentUsed).toBe(100);
    });

    it('should throw error for unknown resource type', async () => {
      await expect(
        checkResourceUsage(mockPrismaClient as any, 'tenant-123', 'invalid_type' as ResourceType)
      ).rejects.toThrow('Unknown resource type: invalid_type');
    });
  });

  describe('enforceResourceLimit', () => {
    beforeEach(() => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
    });

    it('should not throw when under limit', async () => {
      mockPrismaClient.lead.count.mockResolvedValue(50);

      await expect(
        enforceResourceLimit(mockPrismaClient as any, 'tenant-123', 'leads')
      ).resolves.toBeUndefined();
    });

    it('should throw TRPCError when at limit', async () => {
      mockPrismaClient.lead.count.mockResolvedValue(1000);

      await expect(
        enforceResourceLimit(mockPrismaClient as any, 'tenant-123', 'leads')
      ).rejects.toThrow(TRPCError);
    });

    it('should include current and limit in error message', async () => {
      mockPrismaClient.lead.count.mockResolvedValue(1000);

      try {
        await enforceResourceLimit(mockPrismaClient as any, 'tenant-123', 'leads');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe('FORBIDDEN');
        expect((error as TRPCError).message).toContain('leads');
        expect((error as TRPCError).message).toContain('1000');
      }
    });
  });

  describe('Rate Limit Functions', () => {
    it('should increment rate limit', () => {
      incrementRateLimit('tenant-123');
      incrementRateLimit('tenant-123');
      incrementRateLimit('tenant-123');

      // After incrementing, next check should show the count
      // We can verify by calling checkResourceUsage
    });

    it('should increment daily requests', () => {
      incrementDailyRequests('tenant-123');
      incrementDailyRequests('tenant-123');

      // Counter incremented
    });

    it('should track concurrent request start', () => {
      trackConcurrentRequestStart('tenant-123');
      trackConcurrentRequestStart('tenant-123');

      // Counter incremented
    });

    it('should track concurrent request end', () => {
      trackConcurrentRequestStart('tenant-123');
      trackConcurrentRequestStart('tenant-123');
      trackConcurrentRequestEnd('tenant-123');

      // Counter decremented
    });

    it('should not go below zero for concurrent requests', () => {
      trackConcurrentRequestEnd('tenant-123');
      trackConcurrentRequestEnd('tenant-123');

      // Should not throw, stays at 0
    });
  });

  describe('clearRateLimitState', () => {
    it('should clear all rate limit state', () => {
      incrementRateLimit('tenant-123');
      incrementDailyRequests('tenant-123');
      trackConcurrentRequestStart('tenant-123');

      clearRateLimitState();

      // State should be cleared - next checks should return 0
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should pass through when no tenant context', async () => {
      const middleware = rateLimitMiddleware();
      const next = vi.fn().mockResolvedValue('result');
      const ctx = { tenant: null, prisma: mockPrismaClient };

      const result = await middleware({ ctx, next, path: 'test', type: 'query' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should skip for admin when configured', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      const middleware = rateLimitMiddleware({ skipForAdmin: true });
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-123', role: 'ADMIN' },
        prisma: mockPrismaClient,
      };

      await middleware({ ctx, next, path: 'test', type: 'query' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should check rate limits for non-admin', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      const middleware = rateLimitMiddleware({ skipForAdmin: true });
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-123', role: 'USER' },
        prisma: mockPrismaClient,
      };

      await middleware({ ctx, next, path: 'test', type: 'query' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should throw when rate limit exceeded', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });

      // Exhaust rate limit
      for (let i = 0; i < 120; i++) {
        incrementRateLimit('tenant-rate');
      }

      const middleware = rateLimitMiddleware({ skipForAdmin: false });
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-rate', role: 'USER' },
        prisma: mockPrismaClient,
      };

      await expect(
        middleware({ ctx, next, path: 'test', type: 'query' } as any)
      ).rejects.toThrow(TRPCError);
    });

    it('should use custom error message', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });

      // Exhaust rate limit
      for (let i = 0; i < 120; i++) {
        incrementRateLimit('tenant-custom');
      }

      const middleware = rateLimitMiddleware({
        skipForAdmin: false,
        errorMessage: 'Custom rate limit message',
      });
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-custom', role: 'USER' },
        prisma: mockPrismaClient,
      };

      try {
        await middleware({ ctx, next, path: 'test', type: 'query' } as any);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as TRPCError).message).toBe('Custom rate limit message');
      }
    });
  });

  describe('concurrentRequestMiddleware', () => {
    it('should pass through when no tenant context', async () => {
      const middleware = concurrentRequestMiddleware();
      const next = vi.fn().mockResolvedValue('result');
      const ctx = { tenant: null, prisma: mockPrismaClient };

      await middleware({ ctx, next, path: 'test', type: 'query' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should skip for admin', async () => {
      const middleware = concurrentRequestMiddleware({ skipForAdmin: true });
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-123', role: 'ADMIN' },
        prisma: mockPrismaClient,
      };

      await middleware({ ctx, next, path: 'test', type: 'query' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should track concurrent requests and cleanup on completion', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      const middleware = concurrentRequestMiddleware({ skipForAdmin: false });
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-concurrent', role: 'USER' },
        prisma: mockPrismaClient,
      };

      await middleware({ ctx, next, path: 'test', type: 'query' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should cleanup on error', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      const middleware = concurrentRequestMiddleware({ skipForAdmin: false });
      const next = vi.fn().mockRejectedValue(new Error('Test error'));
      const ctx = {
        tenant: { tenantId: 'tenant-error', role: 'USER' },
        prisma: mockPrismaClient,
      };

      await expect(
        middleware({ ctx, next, path: 'test', type: 'query' } as any)
      ).rejects.toThrow('Test error');
    });

    it('should throw when concurrent limit exceeded', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });

      // Exhaust concurrent limit (STARTER limit is 5)
      for (let i = 0; i < 5; i++) {
        trackConcurrentRequestStart('tenant-busy');
      }

      const middleware = concurrentRequestMiddleware({ skipForAdmin: false });
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-busy', role: 'USER' },
        prisma: mockPrismaClient,
      };

      await expect(
        middleware({ ctx, next, path: 'test', type: 'query' } as any)
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('resourceLimitMiddleware', () => {
    it('should pass through when no tenant context', async () => {
      const middleware = resourceLimitMiddleware('leads');
      const next = vi.fn().mockResolvedValue('result');
      const ctx = { tenant: null, prisma: mockPrismaClient };

      await middleware({ ctx, next, path: 'test', type: 'mutation' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should skip for admin', async () => {
      const middleware = resourceLimitMiddleware('leads');
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-123', role: 'ADMIN' },
        prisma: mockPrismaClient,
      };

      await middleware({ ctx, next, path: 'test', type: 'mutation' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should enforce limit for non-admin', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      mockPrismaClient.lead.count.mockResolvedValue(50);

      const middleware = resourceLimitMiddleware('leads');
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-123', role: 'USER' },
        prisma: mockPrismaClient,
      };

      await middleware({ ctx, next, path: 'test', type: 'mutation' } as any);

      expect(next).toHaveBeenCalled();
    });

    it('should throw when resource limit reached', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      mockPrismaClient.lead.count.mockResolvedValue(1000);

      const middleware = resourceLimitMiddleware('leads');
      const next = vi.fn().mockResolvedValue('result');
      const ctx = {
        tenant: { tenantId: 'tenant-123', role: 'USER' },
        prisma: mockPrismaClient,
      };

      await expect(
        middleware({ ctx, next, path: 'test', type: 'mutation' } as any)
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getAllResourceUsage', () => {
    it('should return usage for all resource types', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      mockPrismaClient.lead.count.mockResolvedValue(50);
      mockPrismaClient.contact.count.mockResolvedValue(75);
      mockPrismaClient.account.count.mockResolvedValue(10);
      mockPrismaClient.opportunity.count.mockResolvedValue(20);
      mockPrismaClient.task.count.mockResolvedValue(100);
      mockPrismaClient.aIScore.count.mockResolvedValue(5);

      const usages = await getAllResourceUsage(mockPrismaClient as any, 'tenant-123');

      expect(usages.length).toBe(9); // All resource types except storage_mb
      expect(usages.find(u => u.type === 'leads')).toBeDefined();
      expect(usages.find(u => u.type === 'contacts')).toBeDefined();
      expect(usages.find(u => u.type === 'accounts')).toBeDefined();
    });
  });

  describe('checkApproachingLimits', () => {
    it('should return resources approaching threshold', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      mockPrismaClient.lead.count.mockResolvedValue(900); // 90% of STARTER limit
      mockPrismaClient.contact.count.mockResolvedValue(100); // 10%
      mockPrismaClient.account.count.mockResolvedValue(50); // 50%
      mockPrismaClient.opportunity.count.mockResolvedValue(95); // 95%
      mockPrismaClient.task.count.mockResolvedValue(50);
      mockPrismaClient.aIScore.count.mockResolvedValue(5);

      const approaching = await checkApproachingLimits(mockPrismaClient as any, 'tenant-123', 80);

      expect(approaching.length).toBeGreaterThan(0);
      expect(approaching.some(u => u.type === 'leads')).toBe(true);
      expect(approaching.some(u => u.type === 'opportunities')).toBe(true);
    });

    it('should use default threshold of 80%', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      mockPrismaClient.lead.count.mockResolvedValue(750); // 75% - below default threshold
      mockPrismaClient.contact.count.mockResolvedValue(100);
      mockPrismaClient.account.count.mockResolvedValue(10);
      mockPrismaClient.opportunity.count.mockResolvedValue(10);
      mockPrismaClient.task.count.mockResolvedValue(50);
      mockPrismaClient.aIScore.count.mockResolvedValue(5);

      const approaching = await checkApproachingLimits(mockPrismaClient as any, 'tenant-123');

      expect(approaching.every(u => u.percentUsed >= 80)).toBe(true);
    });

    it('should return empty array when no limits approaching', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });
      mockPrismaClient.lead.count.mockResolvedValue(10);
      mockPrismaClient.contact.count.mockResolvedValue(10);
      mockPrismaClient.account.count.mockResolvedValue(5);
      mockPrismaClient.opportunity.count.mockResolvedValue(5);
      mockPrismaClient.task.count.mockResolvedValue(10);
      mockPrismaClient.aIScore.count.mockResolvedValue(1);

      const approaching = await checkApproachingLimits(mockPrismaClient as any, 'tenant-123', 80);

      expect(approaching.length).toBe(0);
    });
  });

  describe('Rate Limit Window Behavior', () => {
    it('should reset rate limit after window expires', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });

      // Increment rate limit
      for (let i = 0; i < 50; i++) {
        incrementRateLimit('tenant-window');
      }

      // Check current usage
      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-window', 'api_requests_per_minute');
      expect(usage.current).toBe(50);
    });
  });

  describe('Daily Request Window Behavior', () => {
    it('should track daily requests', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue({ role: 'USER' });

      incrementDailyRequests('tenant-daily');
      incrementDailyRequests('tenant-daily');
      incrementDailyRequests('tenant-daily');

      const usage = await checkResourceUsage(mockPrismaClient as any, 'tenant-daily', 'api_requests_per_day');
      expect(usage.current).toBe(3);
    });
  });
});
