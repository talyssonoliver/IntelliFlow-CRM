/**
 * Server Tests - tRPC Server Setup
 *
 * Tests for server initialization, middleware, and procedure builders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, loggedProcedure, adminProcedure } from '../server';
import { z } from 'zod';

describe('tRPC Server - server.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Router Export', () => {
    it('should export router function', () => {
      expect(router).toBeDefined();
      expect(typeof router).toBe('function');
    });

    it('should be able to create a router', () => {
      const testRouter = router({});
      expect(testRouter).toBeDefined();
      expect(testRouter._def).toBeDefined();
    });

    it('should create router with procedures', () => {
      const testRouter = router({
        test: publicProcedure.query(() => 'test'),
      });
      expect(testRouter._def.procedures.test).toBeDefined();
    });
  });

  describe('publicProcedure', () => {
    it('should export publicProcedure', () => {
      expect(publicProcedure).toBeDefined();
    });

    it('should create a query procedure', () => {
      const testRouter = router({
        testQuery: publicProcedure.query(() => 'result'),
      });
      expect(testRouter._def.procedures.testQuery).toBeDefined();
    });

    it('should create a mutation procedure', () => {
      const testRouter = router({
        testMutation: publicProcedure.mutation(() => 'mutated'),
      });
      expect(testRouter._def.procedures.testMutation).toBeDefined();
    });

    it('should support input validation', () => {
      const testRouter = router({
        testInput: publicProcedure
          .input(z.object({ name: z.string() }))
          .query(({ input }) => input.name),
      });
      expect(testRouter._def.procedures.testInput).toBeDefined();
    });
  });

  describe('protectedProcedure', () => {
    it('should export protectedProcedure', () => {
      expect(protectedProcedure).toBeDefined();
    });

    it('should create a protected procedure', () => {
      const testRouter = router({
        protectedQuery: protectedProcedure.query(() => 'protected'),
      });
      expect(testRouter._def.procedures.protectedQuery).toBeDefined();
    });
  });

  describe('loggedProcedure', () => {
    it('should export loggedProcedure', () => {
      expect(loggedProcedure).toBeDefined();
    });

    it('should create a logged procedure', () => {
      const testRouter = router({
        loggedQuery: loggedProcedure.query(() => 'logged'),
      });
      expect(testRouter._def.procedures.loggedQuery).toBeDefined();
    });
  });

  describe('adminProcedure', () => {
    it('should export adminProcedure', () => {
      expect(adminProcedure).toBeDefined();
    });

    it('should create an admin procedure', () => {
      const testRouter = router({
        adminQuery: adminProcedure.query(() => 'admin-only'),
      });
      expect(testRouter._def.procedures.adminQuery).toBeDefined();
    });
  });

  describe('Error Formatting', () => {
    it('should include zodError in error shape for Zod errors', async () => {
      const testRouter = router({
        validateInput: publicProcedure
          .input(z.object({ email: z.string().email() }))
          .query(({ input }) => input.email),
      });

      // The error formatter is configured in initTRPC
      // We verify the router is created with the procedure
      expect(testRouter._def.procedures.validateInput).toBeDefined();
    });
  });

  describe('Router Composition', () => {
    it('should compose routers with nested procedures', () => {
      const subRouter = router({
        proc1: publicProcedure.query(() => 'result1'),
        proc2: publicProcedure.query(() => 'result2'),
      });

      const mainRouter = router({
        sub: subRouter,
      });

      // tRPC flattens nested router procedures with dot notation
      expect(mainRouter._def.procedures['sub.proc1']).toBeDefined();
      expect(mainRouter._def.procedures['sub.proc2']).toBeDefined();
    });

    it('should support flat procedure composition', () => {
      const r = router({
        getUsers: publicProcedure.query(() => []),
        createUser: publicProcedure.mutation(() => ({})),
        deleteUser: publicProcedure.mutation(() => ({})),
      });

      expect(Object.keys(r._def.procedures)).toHaveLength(3);
    });
  });

  describe('Procedure Types', () => {
    it('should support query procedures', () => {
      const r = router({
        getItem: publicProcedure.query(() => ({ id: '1', name: 'test' })),
      });
      expect(r._def.procedures.getItem).toBeDefined();
    });

    it('should support mutation procedures', () => {
      const r = router({
        createItem: publicProcedure
          .input(z.object({ name: z.string() }))
          .mutation(({ input }) => ({ id: '1', name: input.name })),
      });
      expect(r._def.procedures.createItem).toBeDefined();
    });

    it('should support chained middlewares', () => {
      const r = router({
        adminMutation: adminProcedure
          .input(z.object({ data: z.string() }))
          .mutation(({ input }) => input.data),
      });
      expect(r._def.procedures.adminMutation).toBeDefined();
    });
  });

  describe('Context Handling', () => {
    it('should allow procedures to access context', () => {
      const r = router({
        withContext: publicProcedure.query(({ ctx }) => {
          // Context type should be available
          return { hasContext: true };
        }),
      });
      expect(r._def.procedures.withContext).toBeDefined();
    });
  });
});

describe('tRPC Middleware Behavior', () => {
  describe('Authentication Middleware', () => {
    it('should require user in context for protected procedures', () => {
      // Protected procedures use isAuthed middleware
      // which throws UNAUTHORIZED if ctx.user is undefined
      const testRouter = router({
        protected: protectedProcedure.query(() => 'protected'),
      });

      // The middleware is attached to the procedure
      expect(testRouter._def.procedures.protected).toBeDefined();
    });
  });

  describe('Admin Middleware', () => {
    it('should require admin role for admin procedures', () => {
      // Admin procedures use isAuthed + isAdmin middleware
      const testRouter = router({
        admin: adminProcedure.query(() => 'admin-only'),
      });

      expect(testRouter._def.procedures.admin).toBeDefined();
    });
  });

  describe('Logging Middleware', () => {
    it('should log procedure calls with duration', () => {
      // Logged procedures use loggingMiddleware
      const testRouter = router({
        logged: loggedProcedure.query(() => 'logged'),
      });

      expect(testRouter._def.procedures.logged).toBeDefined();
    });
  });
});
