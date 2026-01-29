/**
 * tRPC Server Setup
 *
 * This file initializes the tRPC server with:
 * - Type-safe procedure builders
 * - Error handling
 * - Middleware (auth, logging, etc.)
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import { ZodError } from 'zod';

/**
 * Initialize tRPC with context type
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure builders
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Middleware to check if user is authenticated
 *
 * In production, this would verify JWT tokens, session cookies, etc.
 * For now, we just check if user exists in context
 */
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Not authenticated',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // user is now guaranteed to be defined
    },
  });
});

/**
 * Protected procedure that requires authentication
 */
export const protectedProcedure = t.procedure.use(isAuthed);

/**
 * Middleware for logging (optional)
 */
const loggingMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;

  console.log(`[tRPC] ${type} ${path} - ${durationMs}ms`);

  return result;
});

/**
 * Procedure with logging enabled
 */
export const loggedProcedure = t.procedure.use(loggingMiddleware);

/**
 * Admin-only procedure
 */
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
  return next();
});

export const adminProcedure = t.procedure.use(isAuthed).use(isAdmin);
