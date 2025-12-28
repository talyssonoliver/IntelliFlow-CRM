/**
 * Authentication Middleware
 *
 * Handles user authentication for tRPC procedures.
 * Integrates with Supabase Auth for token verification.
 *
 * IMPLEMENTS: FLOW-001 (Login + MFA)
 *
 * @see apps/api/src/lib/supabase.ts - Supabase client and verifyToken
 * @see apps/web/proxy.ts - Next.js 16 proxy for route protection
 * @module apps/api/src/middleware/auth
 */

import { TRPCError } from '@trpc/server';
import { Context } from '../context';
import { verifyToken as supabaseVerifyToken } from '../lib/supabase';

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
 * Verify JWT token using Supabase Auth
 *
 * Uses Supabase Admin API to validate access tokens and retrieve user info.
 * Returns user data if token is valid, null otherwise.
 *
 * @param token - JWT access token from Authorization header
 * @returns User info (userId, email, role) or null if invalid
 */
export async function verifyToken(token: string): Promise<{
  userId: string;
  email: string;
  role: string;
} | null> {
  try {
    const { user, error } = await supabaseVerifyToken(token);

    if (error || !user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email || '',
      role: (user.user_metadata?.role as string) || 'USER',
    };
  } catch {
    return null;
  }
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
