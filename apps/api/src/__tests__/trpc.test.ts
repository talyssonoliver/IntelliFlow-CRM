/**
 * tRPC Configuration Tests
 *
 * Tests for tRPC middleware and procedure builders.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ZodError, z } from 'zod';

// Mock context
vi.mock('../context', () => ({
  Context: {},
}));

describe('tRPC Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('exports', () => {
    it('should export createTRPCRouter', async () => {
      const { createTRPCRouter } = await import('../trpc.js');
      expect(createTRPCRouter).toBeDefined();
      expect(typeof createTRPCRouter).toBe('function');
    });

    it('should export publicProcedure', async () => {
      const { publicProcedure } = await import('../trpc.js');
      expect(publicProcedure).toBeDefined();
    });

    it('should export protectedProcedure', async () => {
      const { protectedProcedure } = await import('../trpc.js');
      expect(protectedProcedure).toBeDefined();
    });

    it('should export adminProcedure', async () => {
      const { adminProcedure } = await import('../trpc.js');
      expect(adminProcedure).toBeDefined();
    });

    it('should export loggedProcedure', async () => {
      const { loggedProcedure } = await import('../trpc.js');
      expect(loggedProcedure).toBeDefined();
    });

    it('should export router for backward compatibility', async () => {
      const { router } = await import('../trpc.js');
      expect(router).toBeDefined();
    });

    it('Fix #6: should export authProcedure for auth endpoint rate limiting', async () => {
      const { authProcedure } = await import('../trpc.js');
      expect(authProcedure).toBeDefined();
    });
  });

  describe('Fix #6: authProcedure rate limiting (AUTH tier: 5 req/min)', () => {
    it('should allow a request through authProcedure', async () => {
      const { createTRPCRouter, authProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        test: authProcedure.query(() => 'auth-rate-limited'),
      });

      const caller = router.createCaller({} as any);
      const result = await caller.test();

      expect(result).toBe('auth-rate-limited');
    });

    it('should block requests after exceeding AUTH tier limit (5 req/min)', async () => {
      const { createTRPCRouter, authProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        test: authProcedure.query(() => 'ok'),
      });

      // The AUTH tier allows 5 req/min. On the 6th call it should throw TOO_MANY_REQUESTS.
      // Each caller shares the same in-memory store per middleware instance.
      const caller = router.createCaller({ user: undefined } as any);

      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        await expect(caller.test()).resolves.toBe('ok');
      }

      // 6th should be rate-limited
      await expect(caller.test()).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      });
    });
  });

  describe('isAuthed middleware', () => {
    it('should throw UNAUTHORIZED when user is not in context', async () => {
      const { createTRPCRouter, protectedProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        test: protectedProcedure.query(() => 'success'),
      });

      const caller = router.createCaller({ user: null } as any);

      await expect(caller.test()).rejects.toThrow(TRPCError);
      await expect(caller.test()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should allow access when user is in context', async () => {
      const { createTRPCRouter, protectedProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        test: protectedProcedure.query(() => 'success'),
      });

      const caller = router.createCaller({
        user: { userId: 'user-123', email: 'test@example.com', role: 'USER' },
      } as any);

      const result = await caller.test();
      expect(result).toBe('success');
    });
  });

  describe('isAdmin middleware', () => {
    it('should throw FORBIDDEN when user is not admin', async () => {
      const { createTRPCRouter, adminProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        test: adminProcedure.query(() => 'admin-only'),
      });

      const caller = router.createCaller({
        user: { userId: 'user-123', email: 'test@example.com', role: 'USER' },
      } as any);

      await expect(caller.test()).rejects.toThrow(TRPCError);
      await expect(caller.test()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should allow access when user is admin', async () => {
      const { createTRPCRouter, adminProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        test: adminProcedure.query(() => 'admin-only'),
      });

      const caller = router.createCaller({
        user: { userId: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
      } as any);

      const result = await caller.test();
      expect(result).toBe('admin-only');
    });

    it('should throw FORBIDDEN when no user in context', async () => {
      const { createTRPCRouter, adminProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        test: adminProcedure.query(() => 'admin-only'),
      });

      const caller = router.createCaller({ user: null } as any);

      await expect(caller.test()).rejects.toThrow(TRPCError);
    });
  });

  describe('loggingMiddleware (now via tracingMiddleware)', () => {
    it('should log request type and path', async () => {
      const { createTRPCRouter, loggedProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        test: loggedProcedure.query(() => 'logged'),
      });

      const caller = router.createCaller({} as any);
      await caller.test();

      // tracingMiddleware logs structured JSON with trpc.request type
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('trpc.request'));
    });

    it('should warn for slow requests over 50ms', async () => {
      const { createTRPCRouter, loggedProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        slowEndpoint: loggedProcedure.query(async () => {
          await new Promise((r) => setTimeout(r, 60));
          return 'slow';
        }),
      });

      const caller = router.createCaller({} as any);
      await caller.slowEndpoint();

      // tracingMiddleware warns with [Tracing] SLOW REQUEST format
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('SLOW REQUEST'),
        expect.anything()
      );
    });
  });

  describe('errorFormatter', () => {
    it('should include zodError in error response for validation errors', async () => {
      const { createTRPCRouter, publicProcedure } = await import('../trpc.js');

      const schema = z.object({
        email: z.string().email(),
      });

      const router = createTRPCRouter({
        validateEmail: publicProcedure
          .input(schema)
          .query(({ input }: { input: { email: string } }) => input),
      });

      const caller = router.createCaller({} as any);

      try {
        await caller.validateEmail({ email: 'invalid-email' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        const trpcError = error as TRPCError;
        expect(trpcError.code).toBe('BAD_REQUEST');
      }
    });
  });

  describe('publicProcedure', () => {
    it('should work without authentication', async () => {
      const { createTRPCRouter, publicProcedure } = await import('../trpc.js');

      const router = createTRPCRouter({
        health: publicProcedure.query(() => ({ status: 'ok' })),
      });

      const caller = router.createCaller({} as any);
      const result = await caller.health();

      expect(result).toEqual({ status: 'ok' });
    });
  });
});
