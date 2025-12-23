import { TEST_UUIDS } from '../../../test/setup';
/**
 * Health Router Tests
 *
 * Comprehensive tests for all health router procedures:
 * - ping, check, ready, alive, dbStats
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { healthRouter } from '../health.router';
import { prismaMock, createPublicContext } from '../../../test/setup';

// Mock correlation module
vi.mock('../../../tracing/correlation', () => ({
  getCorrelationId: vi.fn(() => 'test-correlation-id'),
}));

describe('Health Router', () => {
  const caller = healthRouter.createCaller(createPublicContext());

  beforeEach(() => {
    // Reset is handled by setup.ts
    vi.clearAllMocks();
  });

  describe('ping', () => {
    it('should return ok status with timestamp', async () => {
      const result = await caller.ping();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.correlationId).toBe('test-correlation-id');
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should return valid ISO timestamp', async () => {
      const result = await caller.ping();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });

  describe('check', () => {
    it('should return healthy status when database is ok', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await caller.check();

      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.database.latency).toBeDefined();
      expect(result.checks.database.latency).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
      expect(result.correlationId).toBe('test-correlation-id');
      expect(result.version).toBeDefined();
      expect(result.environment).toBeDefined();
    });

    it('should return degraded status when database fails', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('Connection failed'));

      const result = await caller.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.error).toBe('Connection failed');
    });

    it('should measure database latency', async () => {
      prismaMock.$queryRaw.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return [{ '?column?': 1 }];
      });

      const result = await caller.check();

      expect(result.checks.database.latency).toBeGreaterThanOrEqual(10);
    });

    it('should warn if database latency is high', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      prismaMock.$queryRaw.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
        return [{ '?column?': 1 }];
      });

      await caller.check();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database latency high')
      );

      consoleSpy.mockRestore();
    });

    it('should include version and environment', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await caller.check();

      expect(result.version).toBeDefined();
      expect(result.environment).toBeDefined();
    });
  });

  describe('ready', () => {
    it('should return ready when database is accessible', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await caller.ready();

      expect(result.ready).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return not ready when database fails', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('Database unavailable'));

      const result = await caller.ready();

      expect(result.ready).toBe(false);
      expect(result.timestamp).toBeDefined();
      expect(result.error).toBe('Database unavailable');
    });
  });

  describe('alive', () => {
    it('should return alive status with process info', async () => {
      const result = await caller.alive();

      expect(result.alive).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.correlationId).toBe('test-correlation-id');
      expect(result.pid).toBe(process.pid);
      expect(result.nodeVersion).toBe(process.version);
      expect(result.memoryUsage).toBeDefined();
      expect(result.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(result.memoryUsage.heapTotal).toBeGreaterThan(0);
    });

    it('should include memory usage details', async () => {
      const result = await caller.alive();

      expect(result.memoryUsage).toHaveProperty('rss');
      expect(result.memoryUsage).toHaveProperty('heapTotal');
      expect(result.memoryUsage).toHaveProperty('heapUsed');
      expect(result.memoryUsage).toHaveProperty('external');
    });
  });

  describe('dbStats', () => {
    it('should return unsupported if metrics not available', async () => {
      const result = await caller.dbStats();

      expect(result.status).toBe('unsupported');
      expect(result.timestamp).toBeDefined();
      expect(result.error).toContain('not available');
    });

    it('should return metrics if available', async () => {
      const mockMetrics = {
        counters: [{ key: 'test', value: 1 }],
        gauges: [{ key: 'test', value: 5 }],
      };

      // Mock Prisma with metrics support that actually works
      const mockPrismaWithMetrics = {
        ...prismaMock,
        $metrics: {
          json: vi.fn().mockResolvedValue(mockMetrics),
        },
      } as any;

      // Need to explicitly check if $metrics.json exists (like the router does)
      const callerWithMetrics = healthRouter.createCaller({
        ...createPublicContext(),
        prisma: mockPrismaWithMetrics,
      });

      const result = await callerWithMetrics.dbStats();

      // The router checks if $metrics?.json exists, which it does in our mock
      expect(result.status).toBe('ok');
      expect(result.metrics).toEqual(mockMetrics);
    });

    it('should handle metrics error gracefully', async () => {
      const mockPrismaWithMetrics = {
        ...prismaMock,
        $metrics: {
          json: vi.fn().mockRejectedValue(new Error('Metrics failed')),
        },
      } as any;

      const callerWithMetrics = healthRouter.createCaller({
        ...createPublicContext(),
        prisma: mockPrismaWithMetrics,
      });

      const result = await callerWithMetrics.dbStats();

      expect(result.status).toBe('error');
      // The actual error message comes from Prisma trying to access metrics
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });
});
