/**
 * HealthServer Unit Tests
 *
 * @module @intelliflow/worker-shared/tests
 * @task IFC-163
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import pino from 'pino';
import {
  HealthServer,
  createDefaultHealthProvider,
  type HealthProvider,
} from '../health-server';
import type { HealthCheckConfig } from '../worker-config';
import type { HealthStatus, ComponentHealth, DetailedHealthResponse } from '../types';

describe('HealthServer', () => {
  let server: HealthServer;
  let testPort: number;
  const mockLogger = pino({ level: 'silent' });

  const getTestConfig = (port: number): HealthCheckConfig => ({
    port,
    path: '/health',
    readyPath: '/health/ready',
    livePath: '/health/live',
    detailedPath: '/health/detailed',
    metricsPath: '/metrics',
  });

  // Create a provider that returns types matching the actual interface
  const createMockProvider = (): HealthProvider => ({
    getHealth: async () => ({
      status: 'healthy' as HealthStatus,
      uptime: 1000,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    }),
    getReadiness: async () => ({
      ready: true,
      timestamp: new Date().toISOString(),
      checks: {
        redis: {
          status: 'ok' as const,
          message: 'Connected',
          lastCheck: new Date().toISOString(),
        },
      },
    }),
    getDetailedHealth: async (): Promise<DetailedHealthResponse> => ({
      status: 'healthy' as HealthStatus,
      uptime: 1000,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: 10000000,
        heapTotal: 50000000,
        external: 1000000,
        rss: 60000000,
      },
      queues: {
        'test-queue': {
          waiting: 5,
          active: 2,
          completed: 100,
          failed: 3,
          delayed: 1,
        },
      },
    }),
    getMetrics: async () =>
      '# HELP worker_uptime_seconds Worker uptime\nworker_uptime_seconds 1000\n',
  });

  beforeEach(() => {
    // Use random port to avoid conflicts
    testPort = 14000 + Math.floor(Math.random() * 1000);

    server = new HealthServer({
      config: getTestConfig(testPort),
      provider: createMockProvider(),
      logger: mockLogger,
      version: '1.0.0',
    });
  });

  afterEach(async () => {
    await server.stop().catch(() => {});
  });

  describe('constructor', () => {
    it('should create server with config', () => {
      expect(server).toBeDefined();
    });
  });

  describe('start()', () => {
    it('should start HTTP server on specified port', async () => {
      await server.start();

      const response = await fetchEndpoint(`http://localhost:${testPort}/health`);
      expect(response.status).toBe(200);
    });
  });

  describe('stop()', () => {
    it('should stop HTTP server', async () => {
      await server.start();
      await server.stop();

      // Server should no longer be listening
      await expect(
        fetchEndpoint(`http://localhost:${testPort}/health`)
      ).rejects.toThrow();
    });

    it('should be idempotent', async () => {
      await server.start();
      await server.stop();
      await server.stop(); // Should not throw
    });
  });

  describe('GET /health', () => {
    it('should return 200 for healthy status', async () => {
      await server.start();
      const response = await fetchEndpoint(`http://localhost:${testPort}/health`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('healthy');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      await server.start();
      const response = await fetchEndpoint(`http://localhost:${testPort}/health/ready`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.ready).toBe(true);
      expect(body.checks).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('should always return 200', async () => {
      await server.start();
      const response = await fetchEndpoint(`http://localhost:${testPort}/health/live`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.alive).toBe(true);
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health', async () => {
      await server.start();
      const response = await fetchEndpoint(`http://localhost:${testPort}/health/detailed`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('healthy');
      expect(body.memory).toBeDefined();
      expect(body.queues).toBeDefined();
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus format', async () => {
      await server.start();
      const response = await fetchEndpoint(`http://localhost:${testPort}/metrics`);
      expect(response.status).toBe(200);

      const body = await response.text();
      expect(body).toContain('worker_uptime_seconds');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown paths', async () => {
      await server.start();
      const response = await fetchEndpoint(`http://localhost:${testPort}/unknown`);
      expect(response.status).toBe(404);
    });
  });
});

describe('createDefaultHealthProvider', () => {
  it('should create a provider with all methods', () => {
    const getDependencyHealth = async (): Promise<Record<string, ComponentHealth>> => ({
      redis: { status: 'ok', message: 'Connected' },
    });

    const getQueueStats = async () => ({
      'test-queue': { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 },
    });

    const provider = createDefaultHealthProvider(
      'test-worker',
      '1.0.0',
      getDependencyHealth,
      getQueueStats
    );

    expect(provider).toBeDefined();
    expect(typeof provider.getHealth).toBe('function');
    expect(typeof provider.getReadiness).toBe('function');
    expect(typeof provider.getDetailedHealth).toBe('function');
    expect(typeof provider.getMetrics).toBe('function');
  });

  it('should return healthy status when all dependencies are ok', async () => {
    const getDependencyHealth = async (): Promise<Record<string, ComponentHealth>> => ({
      redis: { status: 'ok', message: 'Connected' },
      database: { status: 'ok', message: 'Connected' },
    });

    const getQueueStats = async () => ({});

    const provider = createDefaultHealthProvider(
      'test-worker',
      '1.0.0',
      getDependencyHealth,
      getQueueStats
    );

    const health = await provider.getHealth();
    expect(health.status).toBe('healthy');
  });

  it('should return degraded status when a dependency is degraded', async () => {
    const getDependencyHealth = async (): Promise<Record<string, ComponentHealth>> => ({
      redis: { status: 'ok', message: 'Connected' },
      database: { status: 'degraded', message: 'High latency' },
    });

    const getQueueStats = async () => ({});

    const provider = createDefaultHealthProvider(
      'test-worker',
      '1.0.0',
      getDependencyHealth,
      getQueueStats
    );

    const health = await provider.getHealth();
    expect(health.status).toBe('degraded');
  });

  it('should return unhealthy status when a dependency has error', async () => {
    const getDependencyHealth = async (): Promise<Record<string, ComponentHealth>> => ({
      redis: { status: 'error', message: 'Connection refused' },
    });

    const getQueueStats = async () => ({});

    const provider = createDefaultHealthProvider(
      'test-worker',
      '1.0.0',
      getDependencyHealth,
      getQueueStats
    );

    const health = await provider.getHealth();
    expect(health.status).toBe('unhealthy');
  });

  it('should return readiness with checks', async () => {
    const getDependencyHealth = async (): Promise<Record<string, ComponentHealth>> => ({
      redis: { status: 'ok', message: 'Connected' },
    });

    const getQueueStats = async () => ({});

    const provider = createDefaultHealthProvider(
      'test-worker',
      '1.0.0',
      getDependencyHealth,
      getQueueStats
    );

    const readiness = await provider.getReadiness();
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.redis).toBeDefined();
  });

  it('should return detailed health with memory and queues', async () => {
    const getDependencyHealth = async (): Promise<Record<string, ComponentHealth>> => ({
      redis: { status: 'ok' },
    });

    const getQueueStats = async () => ({
      'main-queue': { waiting: 10, active: 2, completed: 500, failed: 5, delayed: 3 },
    });

    const provider = createDefaultHealthProvider(
      'test-worker',
      '1.0.0',
      getDependencyHealth,
      getQueueStats
    );

    const detailed = await provider.getDetailedHealth();
    expect(detailed.memory).toBeDefined();
    expect(detailed.memory.heapUsed).toBeGreaterThan(0);
    expect(detailed.queues['main-queue']).toBeDefined();
    expect(detailed.queues['main-queue'].waiting).toBe(10);
  });

  it('should return Prometheus-formatted metrics', async () => {
    const getDependencyHealth = async (): Promise<Record<string, ComponentHealth>> => ({});

    const getQueueStats = async () => ({
      'events': { waiting: 5, active: 1, completed: 100, failed: 2, delayed: 0 },
    });

    const provider = createDefaultHealthProvider(
      'test-worker',
      '1.0.0',
      getDependencyHealth,
      getQueueStats
    );

    const metrics = await provider.getMetrics();
    expect(metrics).toContain('worker_uptime_seconds');
    expect(metrics).toContain('worker_memory_bytes');
    expect(metrics).toContain('worker_queue_jobs');
    expect(metrics).toContain('queue="events"');
  });
});

// Helper function to fetch endpoint
async function fetchEndpoint(url: string): Promise<{
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 500,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}
