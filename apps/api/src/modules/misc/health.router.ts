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

import { createTRPCRouter, publicProcedure } from '../../trpc';
import {
  getDatabaseStats,
  getDetailedHealth,
  getLivenessHealth,
  getPingHealth,
  getReadinessHealth,
} from './health.service';

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
    return getPingHealth();
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
    return getDetailedHealth(ctx);
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
    return getReadinessHealth(ctx);
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
    return getLivenessHealth();
  }),

  /**
   * Database connection pool stats
   *
   * Returns Prisma connection pool metrics for monitoring.
   * Useful for diagnosing connection leaks or pool exhaustion.
   */
  dbStats: publicProcedure.query(async ({ ctx }) => {
    return getDatabaseStats(ctx);
  }),
});
