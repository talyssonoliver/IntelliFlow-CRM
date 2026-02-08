/**
 * tRPC API Server Entry Point
 *
 * This file exports the tRPC router and types for use in different contexts:
 * - Next.js API routes
 * - Express/Fastify servers
 * - Standalone HTTP servers
 */

// Initialize OpenTelemetry tracing before any other imports/setup
import { startTracing } from './tracing/otel';
import { disconnectPrisma } from '@intelliflow/db';
import { shutdownAllQueues } from '@intelliflow/platform/queues';

if (process.env.OTEL_ENABLED !== 'false') {
  startTracing();
}

// Graceful shutdown on SIGTERM (container orchestrators, Railway, etc.)
process.on('SIGTERM', async () => {
  console.log('[API] SIGTERM received — shutting down gracefully');
  await shutdownAllQueues();
  await disconnectPrisma();
  process.exit(0);
});

export { appRouter, type AppRouter } from './router';
export { createContext, type Context } from './context';
export { router, protectedProcedure, publicProcedure } from './server';

// Re-export for convenience
export type { UserSession } from './context';

// Agent module (IFC-139)
export * from './agent';

// Security module (IFC-098, IFC-113, IFC-127)
export * from './security';

// Middleware (auth, logging, rate limiting)
export * from './middleware';

// Tracing & Observability (IFC-074)
export * from './tracing';

// Workflow Engine (IFC-028)
export * from './workflow';
