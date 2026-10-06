/**
 * #789: readiness must fail when Redis is gone, and detailed health must show
 * queues that have no consumer. Until 2026-10-05 the API reported ready for
 * months while Redis and every worker were down.
 */

import { describe, expect, it, vi } from 'vitest';
import { getDetailedHealth, getReadinessHealth, type HealthProbes } from '../health.service.js';
import { API_PRODUCED_QUEUES, buildHealthProbes } from '../health-probes.js';

// Built per use: the shared test setup resets vi.fn() mocks between tests.
const db = (ok: boolean) =>
  ({
    $queryRaw: ok
      ? async () => [{ '?column?': 1 }]
      : async () => {
          throw new Error('Database unavailable');
        },
  }) as any;

describe('getReadinessHealth with probes', () => {
  it('is ready when the database and Redis both answer', async () => {
    const probes: HealthProbes = { redisPing: async () => 'PONG' };
    await expect(getReadinessHealth({ prisma: db(true) }, probes)).resolves.toMatchObject({
      ready: true,
    });
  });

  it('is not ready when Redis is unreachable, and says why', async () => {
    const probes: HealthProbes = {
      redisPing: async () => {
        throw new Error('getaddrinfo ENOTFOUND redis.railway.internal');
      },
    };
    const result = await getReadinessHealth({ prisma: db(true) }, probes);
    expect(result.ready).toBe(false);
    expect(result.error).toBe('Redis: getaddrinfo ENOTFOUND redis.railway.internal');
  });

  it('treats an unexpected ping reply as a failure', async () => {
    const result = await getReadinessHealth(
      { prisma: db(true) },
      { redisPing: async () => 'NOPE' }
    );
    expect(result.ready).toBe(false);
    expect(result.error).toContain('Unexpected ping reply: NOPE');
  });

  it('reports both failures together', async () => {
    const result = await getReadinessHealth(
      { prisma: db(false) },
      { redisPing: () => Promise.reject(new Error('NOAUTH Authentication required.')) }
    );
    expect(result.error).toBe('Database unavailable; Redis: NOAUTH Authentication required.');
  });

  it('times out a hanging Redis instead of hanging the probe', async () => {
    vi.useFakeTimers();
    try {
      const pending = getReadinessHealth(
        { prisma: db(true) },
        { redisPing: () => new Promise<string>(() => {}) }
      );
      await vi.advanceTimersByTimeAsync(2000);
      const result = await pending;
      expect(result.ready).toBe(false);
      expect(result.error).toContain('timed out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the database-only behaviour when no probes are configured', async () => {
    await expect(getReadinessHealth({ prisma: db(true) })).resolves.toMatchObject({ ready: true });
  });
});

describe('getDetailedHealth with probes', () => {
  it('is degraded and names the queues that have no consumer', async () => {
    const result = await getDetailedHealth({ prisma: db(true) }, undefined, {
      redisPing: async () => 'PONG',
      queueConsumers: async () => ({ 'ai-scoring': 1, 'intelliflow-notifications-email': 0 }),
    });
    expect(result.status).toBe('degraded');
    expect(result.checks).toMatchObject({
      redis: { status: 'ok' },
      queues: { status: 'degraded', withoutConsumers: ['intelliflow-notifications-email'] },
    });
  });

  it('is healthy when every queue has a consumer', async () => {
    const result = await getDetailedHealth({ prisma: db(true) }, undefined, {
      redisPing: async () => 'PONG',
      queueConsumers: async () => ({ 'ai-scoring': 2 }),
    });
    expect(result.status).toBe('healthy');
  });

  it('reports a queue-count failure as degraded', async () => {
    const result = await getDetailedHealth({ prisma: db(true) }, undefined, {
      queueConsumers: () => Promise.reject(new Error('CLIENT LIST denied')),
    });
    expect(result.status).toBe('degraded');
    expect(result.checks).toMatchObject({
      queues: { status: 'error', error: 'CLIENT LIST denied' },
    });
  });
});

describe('buildHealthProbes', () => {
  function deps(env: NodeJS.ProcessEnv) {
    const ping = vi.fn().mockResolvedValue('PONG');
    const client = {
      status: 'wait',
      connect: vi.fn(async () => {
        client.status = 'ready';
      }),
      ping,
    };
    const createRedis = vi.fn().mockResolvedValue(client);
    const createQueue = vi.fn(async (name: string) => ({
      getWorkersCount: async () => (name === 'ai-scoring' ? 1 : 0),
    }));
    return { ping, createRedis, createQueue, env };
  }

  it('builds no probes outside production when Redis is not configured', () => {
    const d = deps({ NODE_ENV: 'test' });
    expect(buildHealthProbes(d)).toEqual({});
  });

  it('pings one lazily created, authenticated client', async () => {
    const d = deps({
      NODE_ENV: 'production',
      REDIS_HOST: 'redis.internal.example.invalid',
      REDIS_PASSWORD: 'x'.repeat(8),
      REDIS_TLS: 'true',
    });
    const probes = buildHealthProbes(d);
    await probes.redisPing!();
    await probes.redisPing!();
    expect(d.createRedis).toHaveBeenCalledTimes(1);
    expect(d.createRedis.mock.calls[0][0]).toMatchObject({
      host: 'redis.internal.example.invalid',
      password: 'x'.repeat(8),
      tls: {},
      enableOfflineQueue: false,
    });
    expect(d.ping).toHaveBeenCalledTimes(2);
    // connects once (status 'wait'), then reuses the open connection
    expect((await d.createRedis.mock.results[0].value).connect).toHaveBeenCalledTimes(1);
  });

  it('counts consumers for every queue the API produces to, reusing queues', async () => {
    const d = deps({ NODE_ENV: 'development', REDIS_HOST: 'localhost' });
    const probes = buildHealthProbes(d);
    const counts = await probes.queueConsumers!();
    await probes.queueConsumers!();
    expect(Object.keys(counts)).toEqual([...API_PRODUCED_QUEUES]);
    expect(counts['ai-scoring']).toBe(1);
    expect(counts['intelliflow-contact-embed']).toBe(0);
    expect(d.createQueue).toHaveBeenCalledTimes(API_PRODUCED_QUEUES.length);
  });
});
