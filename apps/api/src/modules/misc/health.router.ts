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
import { checkDatabaseHealth } from '@intelliflow/db';
import { connectionRegistry } from '@intelliflow/platform/queues';

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
  check: publicProcedure.query(async () => {
    const startTime = Date.now();
    const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {};

    // Database connectivity check via @intelliflow/db helper
    const dbHealth = await checkDatabaseHealth();
    checks.database = {
      status: dbHealth.connected ? 'ok' : 'error',
      latency: Math.round(dbHealth.latency),
      ...(dbHealth.error && { error: dbHealth.error }),
    };
    if (dbHealth.connected && dbHealth.latency > 20) {
      console.warn(`[Health] Database latency high: ${Math.round(dbHealth.latency)}ms (target: <20ms)`);
    }

    // Redis connectivity check via @intelliflow/platform connection registry
    const registeredConnections = connectionRegistry.getRegisteredNames();
    checks.redis = registeredConnections.length > 0
      ? { status: 'ok' as const, latency: 0 }
      : { status: 'error' as const, error: 'No Redis connections registered' };

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
  ready: publicProcedure.query(async () => {
    try {
      // Check database connectivity
      const dbHealth = await checkDatabaseHealth();
      if (!dbHealth.connected) {
        return {
          ready: false,
          timestamp: new Date().toISOString(),
          error: dbHealth.error ?? 'Database not connected',
        };
      }

      // Check Redis connectivity via connection registry
      const redisRegistered = connectionRegistry.getRegisteredNames().length > 0;
      if (!redisRegistered) {
        return {
          ready: false,
          timestamp: new Date().toISOString(),
          error: 'No Redis connections registered',
        };
      }

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
