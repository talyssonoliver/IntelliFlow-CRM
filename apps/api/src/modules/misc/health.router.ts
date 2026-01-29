/**
 * Health Router
 *
 * Provides health check endpoints for monitoring and orchestration.
 * These endpoints are used by:
 * - Load balancers for health checks
 * - Monitoring systems (uptime checks)
 * - CI/CD pipelines (smoke tests)
 * - Container orchestrators (liveness/readiness probes)
 *
 * KPI: Response time <50ms (per IFC-003)
 *
 * Enhanced for IFC-074: Full Stack Observability
 * - Version and build information
 * - Environment details
 * - Dependency health checks
 * - Correlation ID support
 */

import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../../trpc';
import { getCorrelationId } from '../../tracing/correlation';

export const healthRouter = createTRPCRouter({
  /**
   * Basic health check
   *
   * Returns 200 OK if the API server is running.
   * This is the fastest health check - use for basic uptime monitoring.
   *
   * @returns Simple status object with correlation ID
   */
  ping: publicProcedure.query(() => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      correlationId: getCorrelationId(),
    };
  }),

  /**
   * Detailed health check
   *
   * Checks connectivity to all critical dependencies:
   * - Database (Prisma/PostgreSQL)
   * - Future: Redis, external APIs, AI services
   *
   * Use this for readiness probes in Kubernetes or Docker healthchecks.
   *
   * @returns Detailed health status with dependency checks
   */
  check: publicProcedure.query(async ({ ctx }) => {
    const startTime = Date.now();
    const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {};

    // Database connectivity check
    try {
      const dbStart = Date.now();
      await ctx.prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbStart;

      checks.database = {
        status: 'ok',
        latency: dbLatency,
      };

      // Warn if database is slow (>20ms as per performance targets)
      if (dbLatency > 20) {
        console.warn(`[Health] Database latency high: ${dbLatency}ms (target: <20ms)`);
      }
    } catch (error) {
      checks.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }

    // Overall health status
    const allOk = Object.values(checks).every((check) => check.status === 'ok');
    const totalLatency = Date.now() - startTime;

    return {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      latency: totalLatency,
      checks,
      correlationId: getCorrelationId(),
      version: process.env.npm_package_version ?? '0.1.0',
      environment: process.env.NODE_ENV ?? 'development',
    };
  }),

  /**
   * Readiness check
   *
   * Determines if the service is ready to accept traffic.
   * Differs from liveness in that it checks all dependencies are available.
   *
   * Returns HTTP 503 if not ready (handled by error middleware).
   */
  ready: publicProcedure.query(async ({ ctx }) => {
    try {
      // Check database connectivity
      await ctx.prisma.$queryRaw`SELECT 1`;

      // Future checks:
      // - Redis connection
      // - Required environment variables
      // - AI worker availability

      return {
        ready: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ready: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Readiness check failed',
      };
    }
  }),

  /**
   * Liveness check
   *
   * Determines if the service is alive and should not be restarted.
   * This is a minimal check - just verifies the process is responsive.
   *
   * Use for Kubernetes liveness probes.
   */
  alive: publicProcedure.query(() => {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      correlationId: getCorrelationId(),
      pid: process.pid,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
    };
  }),

  /**
   * Database connection pool stats
   *
   * Returns Prisma connection pool metrics for monitoring.
   * Useful for diagnosing connection leaks or pool exhaustion.
   */
  dbStats: publicProcedure.query(async ({ ctx }) => {
    try {
      const metricsProvider = (
        ctx.prisma as unknown as { $metrics?: { json: () => Promise<unknown> } }
      ).$metrics;
      if (!metricsProvider?.json) {
        return {
          status: 'unsupported',
          timestamp: new Date().toISOString(),
          error:
            'Prisma metrics are not available in this Prisma client build. Enable Prisma metrics and regenerate.',
        };
      }

      const metrics = await metricsProvider.json();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        metrics,
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Failed to fetch database metrics',
      };
    }
  }),
});
