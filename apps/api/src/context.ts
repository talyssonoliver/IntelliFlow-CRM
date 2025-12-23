/**
 * tRPC Context
 *
 * This defines the context available to all tRPC procedures.
 * The context includes:
 * - Prisma database client
 * - User authentication info (placeholder for now)
 * - Request metadata
 */

import { inferAsyncReturnType } from '@trpc/server';
import { prisma } from '@intelliflow/db/client';

/**
 * User session interface (will be replaced with actual auth implementation)
 */
export interface UserSession {
  userId: string;
  email: string;
  role: string;
}

/**
 * Create context for tRPC requests
 *
 * In a real app, this would:
 * - Extract auth token from headers
 * - Validate JWT/session
 * - Fetch user from database
 * - Handle rate limiting
 *
 * For now, we use a mock user for development
 */
export const createContext = async (opts?: { req?: Request; res?: Response }) => {
  // TODO: Extract user from auth token/session
  // For development, we'll use a mock user
  const mockUser: UserSession = {
    userId: 'mock-user-id',
    email: 'dev@intelliflow.ai',
    role: 'ADMIN',
  };

  return {
    prisma,
    user: mockUser as UserSession | null | undefined,
    req: opts?.req,
    res: opts?.res,
  };
};

/**
 * Context type that will be used in routers
 */
export type Context = inferAsyncReturnType<typeof createContext>;
