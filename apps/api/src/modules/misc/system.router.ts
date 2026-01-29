/**
 * System Router
 *
 * Provides system information and metadata endpoints.
 * These endpoints expose:
 * - API version information
 * - Runtime environment details
 * - Feature flags
 * - System configuration (non-sensitive)
 *
 * Useful for:
 * - Client version compatibility checks
 * - Debugging environment issues
 * - Feature detection
 * - Monitoring dashboards
 */

import { z } from 'zod';
import { createTRPCRouter, publicProcedure, adminProcedure } from '../../trpc';

/**
 * API version information
 * Update this when making breaking API changes
 */
const API_VERSION = '1.0.0';
const API_BUILD = process.env.BUILD_ID || 'development';

export const systemRouter = createTRPCRouter({
  /**
   * Get API version information
   *
   * Returns the current API version and build information.
   * Clients can use this to check compatibility.
   *
   * @example
   * const { version } = await client.system.version.query();
   * if (version !== expectedVersion) {
   *   console.warn('API version mismatch');
   * }
   */
  version: publicProcedure.query(() => {
    return {
      version: API_VERSION,
      build: API_BUILD,
      timestamp: new Date().toISOString(),
    };
  }),

  /**
   * Get system information
   *
   * Returns runtime environment details.
   * Useful for debugging and monitoring.
   */
  info: publicProcedure.query(() => {
    return {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      memory: {
        total: process.memoryUsage().heapTotal,
        used: process.memoryUsage().heapUsed,
        external: process.memoryUsage().external,
      },
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    };
  }),

  /**
   * Get feature flags
   *
   * Returns enabled/disabled features for the current environment.
   * Allows client-side feature detection and conditional rendering.
   *
   * @example
   * const { features } = await client.system.features.query();
   * if (features.aiScoring) {
   *   // Show AI scoring UI
   * }
   */
  features: publicProcedure.query(() => {
    // Feature flags - can be driven by environment variables in production
    const features = {
      // Core features (always enabled in foundation phase)
      leadManagement: true,
      contactManagement: true,
      accountManagement: true,
      opportunityManagement: true,
      taskManagement: true,

      // AI features (placeholder - will be enabled when implemented)
      aiScoring: process.env.ENABLE_AI_SCORING === 'true',
      aiEmailGeneration: process.env.ENABLE_AI_EMAIL === 'true',
      aiWorkflows: process.env.ENABLE_AI_WORKFLOWS === 'true',

      // Advanced features (future sprints)
      analytics: false,
      reporting: false,
      customDashboards: false,
      apiIntegrations: false,

      // Real-time features
      subscriptions: process.env.ENABLE_SUBSCRIPTIONS === 'true',
      notifications: false,
    };

    return {
      features,
      timestamp: new Date().toISOString(),
    };
  }),

  /**
   * Get system configuration (admin only)
   *
   * Returns non-sensitive system configuration.
   * Only accessible to administrators.
   *
   * @security Admin role required
   */
  config: adminProcedure.query(() => {
    return {
      database: {
        type: 'postgresql',
        maxConnections: process.env.DATABASE_POOL_MAX || '10',
        connectionTimeout: process.env.DATABASE_TIMEOUT || '5000',
      },
      api: {
        version: API_VERSION,
        build: API_BUILD,
        rateLimit: {
          enabled: process.env.ENABLE_RATE_LIMIT === 'true',
          maxRequests: process.env.RATE_LIMIT_MAX || '100',
          windowMs: process.env.RATE_LIMIT_WINDOW || '60000',
        },
      },
      ai: {
        provider: process.env.AI_PROVIDER || 'ollama',
        model: process.env.AI_MODEL || 'llama2',
        timeout: process.env.AI_TIMEOUT || '30000',
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
      },
      timestamp: new Date().toISOString(),
    };
  }),

  /**
   * Performance metrics (admin only)
   *
   * Returns aggregated performance metrics for monitoring.
   * Includes request counts, average latencies, error rates.
   *
   * @security Admin role required
   */
  metrics: adminProcedure.query(() => {
    // In production, this would fetch real metrics from monitoring system
    // For now, return basic process metrics
    const memUsage = process.memoryUsage();

    return {
      process: {
        uptime: process.uptime(),
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          rss: memUsage.rss,
          external: memUsage.external,
        },
        cpu: process.cpuUsage(),
      },
      // Placeholder for future metrics
      requests: {
        total: 0,
        success: 0,
        errors: 0,
      },
      latency: {
        p50: 0,
        p95: 0,
        p99: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }),

  /**
   * API capabilities
   *
   * Returns a list of available API endpoints and their capabilities.
   * Useful for API discovery and documentation.
   */
  capabilities: publicProcedure.query(() => {
    return {
      endpoints: {
        lead: {
          operations: ['create', 'read', 'update', 'delete', 'list', 'qualify', 'convert', 'score'],
          features: ['filtering', 'pagination', 'sorting', 'search'],
        },
        contact: {
          operations: ['create', 'read', 'update', 'delete', 'list'],
          features: ['filtering', 'pagination', 'sorting', 'search'],
        },
        account: {
          operations: ['create', 'read', 'update', 'delete', 'list'],
          features: ['filtering', 'pagination', 'sorting', 'search'],
        },
        opportunity: {
          operations: ['create', 'read', 'update', 'delete', 'list'],
          features: ['filtering', 'pagination', 'sorting', 'search'],
        },
        task: {
          operations: ['create', 'read', 'update', 'delete', 'list', 'complete'],
          features: ['filtering', 'pagination', 'sorting', 'search', 'due-dates'],
        },
        health: {
          operations: ['ping', 'check', 'ready', 'alive', 'dbStats'],
          features: ['monitoring', 'diagnostics'],
        },
        system: {
          operations: ['version', 'info', 'features', 'config', 'metrics', 'capabilities'],
          features: ['metadata', 'feature-flags', 'monitoring'],
        },
      },
      authentication: {
        methods: ['jwt', 'session'],
        roles: ['USER', 'ADMIN'],
      },
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    };
  }),
});
