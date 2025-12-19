/**
 * Authentication Middleware
 *
 * Handles user authentication for tRPC procedures.
 * Currently uses mock authentication for development.
 * In production, this should:
 * - Verify JWT tokens
 * - Validate session cookies
 * - Check API keys
 * - Integrate with authentication providers (Supabase, Auth0, etc.)
 */

import { TRPCError } from '@trpc/server';
import { Context } from '../context';

/**
 * Middleware options type for authentication middleware
 */
interface MiddlewareOpts<TContext> {
  ctx: TContext;
  next: (opts?: { ctx: unknown }) => Promise<unknown>;
}

/**
 * Creates middleware to check if user is authenticated
 * Use with t.middleware() in server.ts
 */
export function createAuthMiddleware() {
  return async ({ ctx, next }: MiddlewareOpts<Context>) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  };
}

/**
 * Creates middleware to check if user has admin role
 * Use with t.middleware() in server.ts
 */
export function createAdminMiddleware() {
  return async ({
    ctx,
    next,
  }: MiddlewareOpts<Context & { user: NonNullable<Context['user']> }>) => {
    if (ctx.user.role !== 'ADMIN') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });
    }

    return next();
  };
}

/**
 * Creates middleware to check if user has manager role or above
 * Use with t.middleware() in server.ts
 */
export function createManagerMiddleware() {
  return async ({
    ctx,
    next,
  }: MiddlewareOpts<Context & { user: NonNullable<Context['user']> }>) => {
    if (!['ADMIN', 'MANAGER'].includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Manager access required',
      });
    }

    return next();
  };
}

/**
 * Helper to verify JWT token
 * TODO: Implement actual JWT verification
 */
export async function verifyToken(token: string): Promise<{
  userId: string;
  email: string;
  role: string;
} | null> {
  // Placeholder implementation
  // In production:
  // - Verify JWT signature
  // - Check expiration
  // - Validate claims
  // - Return user info or null

  return null;
}

/**
 * Helper to extract token from request headers
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  // Support Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }

  return null;
}
