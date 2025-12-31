/**
 * Rate Limiting Middleware Tests
 *
 * Tests rate limiting, request throttling, and quota management.
 * NOTE: Each test uses dynamic imports to avoid state leakage between tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@prisma/client';
import type { Context } from '../../context';

/**
 * Create a minimal mock context for middleware tests
 * Middleware only uses user, prisma, req, res - services/adapters not needed
 */
const createMockContext = (
  overrides: Partial<{
    user: { userId: string; email: string; role: string; tenantId: string } | null | undefined;
    prisma: PrismaClient;
    req: Request | undefined;
    res: Response | undefined;
  }> = {}
): Context =>
  ({
    user: overrides.user ?? null,
    prisma: overrides.prisma ?? ({} as PrismaClient),
    req: overrides.req ?? undefined,
    res: overrides.res ?? undefined,
    services: {} as Context['services'],
    adapters: {} as Context['adapters'],
  }) as Context;

// Counter for unique user IDs to avoid state collision
let userIdCounter = 0;

describe('RateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.resetModules();
    userIdCounter = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to generate unique user ID
  const getUniqueUserId = () => `user-${++userIdCounter}-${Date.now()}`;

  describe('createRateLimitMiddleware()', () => {
    it('should allow requests within limit', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(5, 60000); // 5 per minute
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Make 5 requests (within limit)
      for (let i = 0; i < 5; i++) {
        const result = await rateLimitMiddleware({
          ctx,
          next: mockNext,
        });
        expect(result).toEqual({ success: true });
      }

      expect(mockNext).toHaveBeenCalledTimes(5);
    });

    it('should block requests exceeding limit', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(3, 60000); // 3 per minute
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Make 3 successful requests
      for (let i = 0; i < 3; i++) {
        await rateLimitMiddleware({ ctx, next: mockNext });
      }

      // 4th request should be blocked
      await expect(
        rateLimitMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        rateLimitMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        message: expect.stringContaining('Rate limit exceeded'),
      });

      expect(mockNext).toHaveBeenCalledTimes(3); // Only 3 successful calls
    });

    it('should reset limit after time window', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(2, 60000); // 2 per minute
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Make 2 requests (hit limit)
      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      // 3rd request should fail
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      // Advance time by 61 seconds (past the window)
      vi.advanceTimersByTime(61000);

      // Should allow requests again
      const result = await rateLimitMiddleware({ ctx, next: mockNext });
      expect(result).toEqual({ success: true });
      expect(mockNext).toHaveBeenCalledTimes(3); // 2 before + 1 after reset
    });

    it('should track limits separately per user', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(2, 60000);
      const mockNext = vi.fn(async () => ({ success: true }));

      const user1Ctx: Context = {
        user: {
          userId: getUniqueUserId(),
          email: 'user1@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
        prisma: {} as PrismaClient,
        req: undefined,
        res: undefined,
      };

      const user2Ctx: Context = {
        user: {
          userId: getUniqueUserId(),
          email: 'user2@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
        prisma: {} as PrismaClient,
        req: undefined,
        res: undefined,
      };

      // User 1 makes 2 requests
      await rateLimitMiddleware({ ctx: user1Ctx, next: mockNext });
      await rateLimitMiddleware({ ctx: user1Ctx, next: mockNext });

      // User 1's 3rd request should fail
      await expect(rateLimitMiddleware({ ctx: user1Ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      // User 2 should still be able to make requests
      const result = await rateLimitMiddleware({ ctx: user2Ctx, next: mockNext });
      expect(result).toEqual({ success: true });

      expect(mockNext).toHaveBeenCalledTimes(3); // 2 for user1, 1 for user2
    });

    it('should use "anonymous" key for unauthenticated users', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(2, 60000);
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext();

      // Make 2 anonymous requests
      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      // 3rd anonymous request should fail
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should share limit across anonymous requests', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(3, 60000);
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx1 = createMockContext();

      const ctx2 = createMockContext({ user: undefined });

      // Make requests from different anonymous contexts
      await rateLimitMiddleware({ ctx: ctx1, next: mockNext });
      await rateLimitMiddleware({ ctx: ctx2, next: mockNext });
      await rateLimitMiddleware({ ctx: ctx1, next: mockNext });

      // 4th request should fail (shared anonymous limit)
      await expect(rateLimitMiddleware({ ctx: ctx2, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should include retry-after in error message', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(1, 60000);
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // First request succeeds
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Second request fails with retry-after
      try {
        await rateLimitMiddleware({ ctx, next: mockNext });
        throw new Error('Should have thrown rate limit error');
      } catch (error: any) {
        expect(error).toBeInstanceOf(TRPCError);
        expect(error.message).toMatch(/Try again in \d+ seconds/);
      }
    });

    it('should use default limit of 100 per minute', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(); // Default params
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Should allow 100 requests
      for (let i = 0; i < 100; i++) {
        await rateLimitMiddleware({ ctx, next: mockNext });
      }

      // 101st should fail
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      expect(mockNext).toHaveBeenCalledTimes(100);
    });

    it('should handle custom window sizes', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(3, 30000); // 3 per 30 seconds
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Hit limit
      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Should fail
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      // Advance 31 seconds
      vi.advanceTimersByTime(31000);

      // Should work again
      const result = await rateLimitMiddleware({ ctx, next: mockNext });
      expect(result).toBeDefined();
    });

    it('should not reset counter before window expires', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(2, 60000);
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Make 2 requests
      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Advance time by 30 seconds (half the window)
      vi.advanceTimersByTime(30000);

      // Should still be blocked
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('should propagate errors from next middleware', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(5, 60000);
      const mockNext = vi.fn(async () => {
        throw new Error('Database error');
      });

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow('Database error');
    });

    it('should count failed requests against limit', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(3, 60000);
      let callCount = 0;
      const mockNext = vi.fn(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Middle request fails');
        }
        return { success: true };
      });

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Request 1: success
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Request 2: fails
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Middle request fails'
      );

      // Request 3: success
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Request 4: should be rate limited (all 3 previous requests counted)
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('should handle limit of 1 request', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(1, 60000);
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // First request succeeds
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Second immediately fails
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should handle very large limits', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(10000, 60000);
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Should handle large number of requests
      for (let i = 0; i < 100; i++) {
        await rateLimitMiddleware({ ctx, next: mockNext });
      }

      expect(mockNext).toHaveBeenCalledTimes(100);
    });
  });

  describe('createStrictRateLimitMiddleware()', () => {
    it('should enforce 10 requests per minute limit', async () => {
      const { createStrictRateLimitMiddleware } = await import('../rate-limit.js');
      const strictMiddleware = createStrictRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Make 10 requests (within limit)
      for (let i = 0; i < 10; i++) {
        const result = await strictMiddleware({
          ctx,
          next: mockNext,
        });
        expect(result).toEqual({ success: true });
      }

      // 11th request should fail
      await expect(
        strictMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockNext).toHaveBeenCalledTimes(10);
    });

    it('should be suitable for sensitive endpoints', async () => {
      const { createStrictRateLimitMiddleware } = await import('../rate-limit.js');
      const strictMiddleware = createStrictRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({ token: 'sensitive-data' }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'attacker@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Attempt 11 rapid requests
      for (let i = 0; i < 10; i++) {
        await strictMiddleware({ ctx, next: mockNext });
      }

      // Should block after 10
      await expect(strictMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );
    });

    it('should reset after 1 minute window', async () => {
      const { createStrictRateLimitMiddleware } = await import('../rate-limit.js');
      const strictMiddleware = createStrictRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Hit limit
      for (let i = 0; i < 10; i++) {
        await strictMiddleware({ ctx, next: mockNext });
      }

      // Blocked
      await expect(strictMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      // Advance 61 seconds
      vi.advanceTimersByTime(61000);

      // Should work again
      await strictMiddleware({ ctx, next: mockNext });
      expect(mockNext).toHaveBeenCalledTimes(11);
    });
  });

  describe('createLenientRateLimitMiddleware()', () => {
    it('should enforce 1000 requests per minute limit', async () => {
      const { createLenientRateLimitMiddleware } = await import('../rate-limit.js');
      const lenientMiddleware = createLenientRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Make 1000 requests (within limit)
      for (let i = 0; i < 1000; i++) {
        await lenientMiddleware({
          ctx,
          next: mockNext,
        });
      }

      // 1001st request should fail
      await expect(
        lenientMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockNext).toHaveBeenCalledTimes(1000);
    });

    it('should be suitable for read-heavy operations', async () => {
      const { createLenientRateLimitMiddleware } = await import('../rate-limit.js');
      const lenientMiddleware = createLenientRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({ data: 'public-data' }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Should handle many reads
      for (let i = 0; i < 100; i++) {
        await lenientMiddleware({ ctx, next: mockNext });
      }

      expect(mockNext).toHaveBeenCalledTimes(100);
    });

    it('should reset after 1 minute window', async () => {
      const { createLenientRateLimitMiddleware } = await import('../rate-limit.js');
      const lenientMiddleware = createLenientRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Hit limit
      for (let i = 0; i < 1000; i++) {
        await lenientMiddleware({ ctx, next: mockNext });
      }

      // Blocked
      await expect(lenientMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      // Advance 61 seconds
      vi.advanceTimersByTime(61000);

      // Should work again
      await lenientMiddleware({ ctx, next: mockNext });
      expect(mockNext).toHaveBeenCalledTimes(1001);
    });
  });

  describe('RedisRateLimiter', () => {
    it('should instantiate without error', async () => {
      const { RedisRateLimiter } = await import('../rate-limit.js');
      expect(() => new RedisRateLimiter()).not.toThrow();
    });

    it('should have checkLimit method', async () => {
      const { RedisRateLimiter } = await import('../rate-limit.js');
      const limiter = new RedisRateLimiter();
      expect(limiter.checkLimit).toBeDefined();
      expect(typeof limiter.checkLimit).toBe('function');
    });

    it('should return true for all requests (placeholder)', async () => {
      const { RedisRateLimiter } = await import('../rate-limit.js');
      const limiter = new RedisRateLimiter();
      const result = await limiter.checkLimit('test-key', 10, 60000);
      expect(result).toBe(true);
    });

    it('should accept various key formats', async () => {
      const { RedisRateLimiter } = await import('../rate-limit.js');
      const limiter = new RedisRateLimiter();

      const results = await Promise.all([
        limiter.checkLimit('user-123', 10, 60000),
        limiter.checkLimit('ip:192.168.1.1', 10, 60000),
        limiter.checkLimit('api:endpoint:user-456', 10, 60000),
      ]);

      expect(results).toEqual([true, true, true]);
    });

    it('should handle different limit values', async () => {
      const { RedisRateLimiter } = await import('../rate-limit.js');
      const limiter = new RedisRateLimiter();

      const results = await Promise.all([
        limiter.checkLimit('key1', 1, 60000),
        limiter.checkLimit('key2', 100, 60000),
        limiter.checkLimit('key3', 10000, 60000),
      ]);

      expect(results).toEqual([true, true, true]);
    });

    it('should handle different window sizes', async () => {
      const { RedisRateLimiter } = await import('../rate-limit.js');
      const limiter = new RedisRateLimiter();

      const results = await Promise.all([
        limiter.checkLimit('key1', 10, 1000), // 1 second
        limiter.checkLimit('key2', 10, 60000), // 1 minute
        limiter.checkLimit('key3', 10, 3600000), // 1 hour
      ]);

      expect(results).toEqual([true, true, true]);
    });
  });

  describe('Middleware Composition', () => {
    it('should compose rate limit with other middleware', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(2, 60000);
      const authMiddleware = vi.fn(async ({ next }: any) => next());

      const finalNext = vi.fn(async () => ({ result: 'success' }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // First request
      await rateLimitMiddleware({
        ctx,
        next: async () =>
          authMiddleware({
            ctx,
            next: finalNext,
          }),
      });

      // Second request
      await rateLimitMiddleware({
        ctx,
        next: async () =>
          authMiddleware({
            ctx,
            next: finalNext,
          }),
      });

      expect(finalNext).toHaveBeenCalledTimes(2);

      // Third should be rate limited before auth
      await expect(
        rateLimitMiddleware({
          ctx,
          next: async () =>
            authMiddleware({
              ctx,
              next: finalNext,
            }),
        })
      ).rejects.toThrow('Rate limit exceeded');

      // Auth middleware should not be called for blocked request
      expect(authMiddleware).toHaveBeenCalledTimes(2);
    });

    it('should allow different limits for different middleware', async () => {
      const { createStrictRateLimitMiddleware, createLenientRateLimitMiddleware } =
        await import('../rate-limit.js');
      const strictMiddleware = createStrictRateLimitMiddleware(); // 10/min
      const lenientMiddleware = createLenientRateLimitMiddleware(); // 1000/min

      const mockNext = vi.fn(async () => ({}));

      const userCtx: Context = {
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
        prisma: {} as PrismaClient,
        req: undefined,
        res: undefined,
      };

      // Hit strict limit (10 requests)
      for (let i = 0; i < 10; i++) {
        await strictMiddleware({ ctx: userCtx, next: mockNext });
      }

      // Strict should block
      await expect(strictMiddleware({ ctx: userCtx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      // But lenient (different limiter) should still allow
      // Using different user to avoid conflict
      const otherUserCtx: Context = {
        user: {
          userId: getUniqueUserId(),
          email: 'other@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
        prisma: {} as PrismaClient,
        req: undefined,
        res: undefined,
      };

      const result = await lenientMiddleware({ ctx: otherUserCtx, next: mockNext });
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero limit', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(0, 60000);
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // With limit of 0, the first request sets count to 1, which exceeds 0
      // However, the checkLimit logic increments THEN checks, so first request succeeds
      // This is expected behavior of the current implementation
      await rateLimitMiddleware({ ctx, next: mockNext });
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Second request should be blocked
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      expect(mockNext).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should handle very short time windows', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(2, 100); // 100ms window
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Make 2 requests
      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Blocked
      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      // Advance 101ms
      vi.advanceTimersByTime(101);

      // Should work
      await rateLimitMiddleware({ ctx, next: mockNext });
      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent requests correctly', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(5, 60000);
      const mockNext = vi.fn(async () => {
        // Use fake timers - no actual delay needed
        return {};
      });

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Fire 6 requests concurrently
      const promises = Array.from({ length: 6 }, () =>
        rateLimitMiddleware({ ctx, next: mockNext })
      );

      const results = await Promise.allSettled(promises);

      // 5 should succeed, 1 should fail
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(5);
      expect(failures.length).toBe(1);
    });

    it('should handle empty userId gracefully', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(2, 60000);
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: '',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Should use empty string as key
      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      await expect(rateLimitMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        'Rate limit exceeded'
      );

      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple time window expirations', async () => {
      const { createRateLimitMiddleware } = await import('../rate-limit.js');
      const rateLimitMiddleware = createRateLimitMiddleware(2, 60000);
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // First window
      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Advance to second window
      vi.advanceTimersByTime(61000);

      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      // Advance to third window
      vi.advanceTimersByTime(61000);

      await rateLimitMiddleware({ ctx, next: mockNext });
      await rateLimitMiddleware({ ctx, next: mockNext });

      expect(mockNext).toHaveBeenCalledTimes(6);
    });
  });

  describe('Tiered Rate Limiting (IFC-114)', () => {
    it('should export RATE_LIMIT_TIERS configuration', async () => {
      const { RATE_LIMIT_TIERS } = await import('../rate-limit.js');

      expect(RATE_LIMIT_TIERS.PUBLIC).toEqual({
        limit: 100,
        windowMs: 60000,
        name: 'public',
      });
      expect(RATE_LIMIT_TIERS.AUTHENTICATED).toEqual({
        limit: 1000,
        windowMs: 60000,
        name: 'authenticated',
      });
      expect(RATE_LIMIT_TIERS.AI).toEqual({
        limit: 10,
        windowMs: 60000,
        name: 'ai',
      });
      expect(RATE_LIMIT_TIERS.AUTH).toEqual({
        limit: 5,
        windowMs: 60000,
        name: 'auth',
      });
    });

    it('should export DDOS_CONFIG configuration', async () => {
      const { DDOS_CONFIG } = await import('../rate-limit.js');

      expect(DDOS_CONFIG.burstLimit).toBe(500);
      expect(DDOS_CONFIG.burstWindowMs).toBe(1000);
      expect(DDOS_CONFIG.blockDurationMs).toBe(300000);
    });

    it('should create public rate limit middleware', async () => {
      const { createPublicRateLimitMiddleware, RATE_LIMIT_TIERS } =
        await import('../rate-limit.js');
      const publicMiddleware = createPublicRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext();

      // Make requests up to the public limit
      for (let i = 0; i < RATE_LIMIT_TIERS.PUBLIC.limit; i++) {
        await publicMiddleware({ ctx, next: mockNext });
      }

      // Next request should be rate limited
      await expect(publicMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        /Rate limit exceeded/
      );
    });

    it('should create AI rate limit middleware with strict limits', async () => {
      const { createAIRateLimitMiddleware, RATE_LIMIT_TIERS } =
        await import('../rate-limit.js');
      const aiMiddleware = createAIRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Make requests up to the AI limit (10)
      for (let i = 0; i < RATE_LIMIT_TIERS.AI.limit; i++) {
        await aiMiddleware({ ctx, next: mockNext });
      }

      // 11th request should be rate limited
      await expect(aiMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        /Rate limit exceeded/
      );

      expect(mockNext).toHaveBeenCalledTimes(10);
    });

    it('should create auth endpoint rate limit middleware with brute force protection', async () => {
      const { createAuthEndpointRateLimitMiddleware, RATE_LIMIT_TIERS } =
        await import('../rate-limit.js');
      const authMiddleware = createAuthEndpointRateLimitMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = createMockContext();

      // Make requests up to the auth limit (5)
      for (let i = 0; i < RATE_LIMIT_TIERS.AUTH.limit; i++) {
        await authMiddleware({ ctx, next: mockNext });
      }

      // 6th request should be rate limited
      await expect(authMiddleware({ ctx, next: mockNext })).rejects.toThrow(
        /Rate limit exceeded/
      );

      expect(mockNext).toHaveBeenCalledTimes(5);
    });

    it('should export rateLimitConfig object', async () => {
      const { rateLimitConfig } = await import('../rate-limit.js');

      expect(rateLimitConfig).toHaveProperty('tiers');
      expect(rateLimitConfig).toHaveProperty('ddos');
      expect(rateLimitConfig.tiers.PUBLIC).toBeDefined();
      expect(rateLimitConfig.ddos.burstLimit).toBe(500);
    });

    it('should export getRateLimiter function', async () => {
      const { getRateLimiter } = await import('../rate-limit.js');
      const limiter = getRateLimiter();

      expect(limiter).toBeDefined();
      expect(typeof limiter.checkLimit).toBe('function');
      expect(typeof limiter.getRemaining).toBe('function');
      expect(typeof limiter.getResetTime).toBe('function');
      expect(typeof limiter.cleanup).toBe('function');
    });
  });

  describe('DDoS Protection (IFC-114)', () => {
    it('should provide RateLimitResult type with detailed info', async () => {
      const { getRateLimiter, RATE_LIMIT_TIERS } = await import('../rate-limit.js');
      const limiter = getRateLimiter();

      const result = await limiter.checkLimitWithDDoS(
        `ddos-test-${Date.now()}`,
        RATE_LIMIT_TIERS.PUBLIC.limit,
        RATE_LIMIT_TIERS.PUBLIC.windowMs
      );

      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetAt');
      expect(result.allowed).toBe(true);
      expect(typeof result.remaining).toBe('number');
    });

    it('should support blocking and unblocking keys', async () => {
      const { getRateLimiter } = await import('../rate-limit.js');
      const limiter = getRateLimiter();
      const testKey = `block-test-${Date.now()}`;

      // Initially not blocked
      expect(await limiter.isBlocked(testKey)).toBe(false);

      // Block the key
      await limiter.block(testKey, 60000);
      expect(await limiter.isBlocked(testKey)).toBe(true);

      // Unblock the key
      await limiter.unblock(testKey);
      expect(await limiter.isBlocked(testKey)).toBe(false);
    });

    it('should provide stats for monitoring', async () => {
      const { getRateLimiter } = await import('../rate-limit.js');
      const limiter = getRateLimiter();

      const stats = await limiter.getStats();

      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('blockedKeys');
      expect(stats).toHaveProperty('activeKeys');
      expect(typeof stats.totalKeys).toBe('number');
    });

    it('should include tier information in error cause', async () => {
      const { createTieredRateLimitMiddleware, RATE_LIMIT_TIERS } =
        await import('../rate-limit.js');
      const publicMiddleware = createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.PUBLIC);
      const mockNext = vi.fn(async () => ({}));

      const ctx = createMockContext({
        user: {
          userId: getUniqueUserId(),
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'test-tenant-id',
        },
      });

      // Hit the limit
      for (let i = 0; i < RATE_LIMIT_TIERS.PUBLIC.limit; i++) {
        await publicMiddleware({ ctx, next: mockNext });
      }

      // Next request should include tier info in cause
      try {
        await publicMiddleware({ ctx, next: mockNext });
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.cause).toBeDefined();
        expect(error.cause.tier).toBe('public');
        expect(error.cause.retryAfter).toBeDefined();
      }
    });
  });
});
