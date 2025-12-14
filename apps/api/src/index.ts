/**
 * tRPC API Server Entry Point
 *
 * This file exports the tRPC router and types for use in different contexts:
 * - Next.js API routes
 * - Express/Fastify servers
 * - Standalone HTTP servers
 */

export { appRouter, type AppRouter } from './router';
export { createContext, type Context } from './context';
export { router, protectedProcedure, publicProcedure } from './server';

// Re-export for convenience
export type { UserSession } from './context';
