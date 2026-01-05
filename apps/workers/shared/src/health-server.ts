/**
 * Health Check Server
 *
 * HTTP server for worker health checks and metrics.
 * Endpoints match: infra/monitoring/health-checks.yaml
 *
 * @module worker-shared/health-server
 * @task IFC-163
 */

import http from 'http';
import pino from 'pino';
import type {
  HealthResponse,
  ReadinessResponse,
  LivenessResponse,
  DetailedHealthResponse,
  ComponentHealth,
  HealthStatus,
} from './types';
import type { HealthCheckConfig } from './worker-config';

// ============================================================================
// Types
// ============================================================================

export interface HealthProvider {
  /** Get basic health status */
  getHealth: () => Promise<HealthResponse>;
  /** Get readiness status with dependency checks */
  getReadiness: () => Promise<ReadinessResponse>;
  /** Get detailed health with metrics */
  getDetailedHealth: () => Promise<DetailedHealthResponse>;
  /** Get Prometheus-formatted metrics */
  getMetrics: () => Promise<string>;
}

export interface HealthServerOptions {
  config: HealthCheckConfig;
  provider: HealthProvider;
  logger?: pino.Logger;
  version: string;
}

// ============================================================================
// Implementation
// ============================================================================

export class HealthServer {
  private server: http.Server | null = null;
  private readonly config: HealthCheckConfig;
  private readonly provider: HealthProvider;
  private readonly logger: pino.Logger;
  private readonly version: string;
  private readonly startTime: number;

  constructor(options: HealthServerOptions) {
    this.config = options.config;
    this.provider = options.provider;
    this.version = options.version;
    this.startTime = Date.now();
    this.logger =
      options.logger ||
      pino({
        name: 'health-server',
        level: 'info',
      });
  }

  /**
   * Start the health check HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);
        const path = url.pathname;

        this.logger.debug({ path, method: req.method }, 'Health check request');

        try {
          switch (path) {
            case this.config.path:
              await this.handleHealth(res);
              break;
            case this.config.readyPath:
              await this.handleReadiness(res);
              break;
            case this.config.livePath:
              await this.handleLiveness(res);
              break;
            case this.config.detailedPath:
              await this.handleDetailed(res);
              break;
            case this.config.metricsPath:
              await this.handleMetrics(res);
              break;
            default:
              this.handleNotFound(res);
          }
        } catch (error) {
          this.handleError(res, error);
        }
      });

      this.server.on('error', (error) => {
        this.logger.error({ error: error.message }, 'Health server error');
        reject(error);
      });

      this.server.listen(this.config.port, () => {
        this.logger.info(
          { port: this.config.port },
          'Health check server started'
        );
        resolve();
      });
    });
  }

  /**
   * Stop the health check HTTP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          this.logger.error({ error: error.message }, 'Error closing health server');
          reject(error);
        } else {
          this.logger.info('Health check server stopped');
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get the server address (useful for testing with port 0)
   */
  getAddress(): { port: number; address: string } | null {
    if (!this.server) return null;
    const addr = this.server.address();
    if (typeof addr === 'string' || !addr) return null;
    return { port: addr.port, address: addr.address };
  }

  // ============================================================================
  // Request Handlers
  // ============================================================================

  private async handleHealth(res: http.ServerResponse): Promise<void> {
    const health = await this.provider.getHealth();
    const statusCode = this.statusToHttpCode(health.status);

    this.sendJson(res, statusCode, health);
  }

  private async handleReadiness(res: http.ServerResponse): Promise<void> {
    const readiness = await this.provider.getReadiness();
    const statusCode = readiness.ready ? 200 : 503;

    this.sendJson(res, statusCode, readiness);
  }

  private async handleLiveness(res: http.ServerResponse): Promise<void> {
    const uptime = Date.now() - this.startTime;
    const response: LivenessResponse = {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime,
    };

    this.sendJson(res, 200, response);
  }

  private async handleDetailed(res: http.ServerResponse): Promise<void> {
    const detailed = await this.provider.getDetailedHealth();
    const statusCode = this.statusToHttpCode(detailed.status);

    this.sendJson(res, statusCode, detailed);
  }

  private async handleMetrics(res: http.ServerResponse): Promise<void> {
    const metrics = await this.provider.getMetrics();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(metrics);
  }

  private handleNotFound(res: http.ServerResponse): void {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private handleError(res: http.ServerResponse, error: unknown): void {
    this.logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Health check error'
    );

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    );
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }

  private statusToHttpCode(status: HealthStatus): number {
    switch (status) {
      case 'healthy':
        return 200;
      case 'degraded':
        return 200; // Still operational, just degraded
      case 'unhealthy':
        return 503;
      default:
        return 500;
    }
  }
}

// ============================================================================
// Default Health Provider
// ============================================================================

/**
 * Create a default health provider for basic health checks
 */
export function createDefaultHealthProvider(
  workerName: string,
  version: string,
  getDependencyHealth: () => Promise<Record<string, ComponentHealth>>,
  getQueueStats: () => Promise<
    Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }>
  >
): HealthProvider {
  const startTime = Date.now();

  const determineOverallStatus = (checks: Record<string, ComponentHealth>): HealthStatus => {
    const statuses = Object.values(checks).map((c) => c.status);
    if (statuses.some((s) => s === 'error')) return 'unhealthy';
    if (statuses.some((s) => s === 'degraded')) return 'degraded';
    return 'healthy';
  };

  return {
    getHealth: async () => {
      const checks = await getDependencyHealth();
      const status = determineOverallStatus(checks);

      return {
        status,
        timestamp: new Date().toISOString(),
        version,
        uptime: Date.now() - startTime,
        checks,
      };
    },

    getReadiness: async () => {
      const checks = await getDependencyHealth();
      const ready = Object.values(checks).every((c) => c.status !== 'error');

      return {
        ready,
        timestamp: new Date().toISOString(),
        checks,
      };
    },

    getDetailedHealth: async () => {
      const checks = await getDependencyHealth();
      const status = determineOverallStatus(checks);
      const queues = await getQueueStats();
      const memUsage = process.memoryUsage();

      return {
        status,
        timestamp: new Date().toISOString(),
        version,
        uptime: Date.now() - startTime,
        checks,
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
        },
        queues,
      };
    },

    getMetrics: async () => {
      const queues = await getQueueStats();
      const memUsage = process.memoryUsage();
      const uptime = Date.now() - startTime;

      const lines: string[] = [
        '# HELP worker_uptime_seconds Worker uptime in seconds',
        '# TYPE worker_uptime_seconds gauge',
        `worker_uptime_seconds{worker="${workerName}"} ${uptime / 1000}`,
        '',
        '# HELP worker_memory_bytes Memory usage in bytes',
        '# TYPE worker_memory_bytes gauge',
        `worker_memory_bytes{worker="${workerName}",type="heap_used"} ${memUsage.heapUsed}`,
        `worker_memory_bytes{worker="${workerName}",type="heap_total"} ${memUsage.heapTotal}`,
        `worker_memory_bytes{worker="${workerName}",type="rss"} ${memUsage.rss}`,
        '',
        '# HELP worker_queue_jobs Queue job counts',
        '# TYPE worker_queue_jobs gauge',
      ];

      for (const [queueName, stats] of Object.entries(queues)) {
        lines.push(
          `worker_queue_jobs{worker="${workerName}",queue="${queueName}",status="waiting"} ${stats.waiting}`
        );
        lines.push(
          `worker_queue_jobs{worker="${workerName}",queue="${queueName}",status="active"} ${stats.active}`
        );
        lines.push(
          `worker_queue_jobs{worker="${workerName}",queue="${queueName}",status="completed"} ${stats.completed}`
        );
        lines.push(
          `worker_queue_jobs{worker="${workerName}",queue="${queueName}",status="failed"} ${stats.failed}`
        );
        lines.push(
          `worker_queue_jobs{worker="${workerName}",queue="${queueName}",status="delayed"} ${stats.delayed}`
        );
      }

      return lines.join('\n');
    },
  };
}
