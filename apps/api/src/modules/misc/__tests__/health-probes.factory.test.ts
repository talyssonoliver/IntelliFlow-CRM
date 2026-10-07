/**
 * getHealthProbes() wires the real ioredis / BullMQ constructors. Both are
 * mocked at the module boundary here; the live behaviour against a real Redis
 * is covered by the manual check recorded in the #789 fix commit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  redis: [] as Array<(e: unknown) => void>,
  queue: [] as Array<(e: unknown) => void>,
}));

vi.mock('ioredis', () => {
  class FakeRedis {
    status = 'wait';
    constructor(public options: Record<string, unknown>) {}
    on(_event: string, fn: (e: unknown) => void) {
      handlers.redis.push(fn);
    }
    async connect() {
      this.status = 'ready';
    }
    async ping() {
      return 'PONG';
    }
  }
  return { default: FakeRedis };
});

vi.mock('../../../lib/load-bullmq', () => ({
  loadBullMQ: async () => ({
    Queue: class {
      on(_event: string, fn: (e: unknown) => void) {
        handlers.queue.push(fn);
      }
      async getWorkersCount() {
        return 1;
      }
    },
  }),
}));

describe('getHealthProbes', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    handlers.redis.length = 0;
    handlers.queue.length = 0;
    process.env.NODE_ENV = 'production';
    process.env.REDIS_HOST = 'redis.internal.example.invalid';
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it('pings through a real client and counts consumers through real queues', async () => {
    const { getHealthProbes } = await import('../health-probes.js');
    const probes = getHealthProbes();
    expect(getHealthProbes()).toBe(probes);
    await expect(probes.redisPing!()).resolves.toBe('PONG');
    const counts = await probes.queueConsumers!();
    expect(Object.values(counts).every((n) => n === 1)).toBe(true);
  });

  it('logs client errors, at most once a minute per client', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getHealthProbes } = await import('../health-probes.js');
    const probes = getHealthProbes();
    await probes.redisPing!();
    await probes.queueConsumers!();
    const [redisError] = handlers.redis;
    redisError(new Error('ENOTFOUND'));
    redisError(new Error('ENOTFOUND again'));
    handlers.queue[0]('not an Error');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]).toEqual(['[health] redis probe error:', 'ENOTFOUND']);
    expect(warn.mock.calls[1][1]).toBe('not an Error');
  });
});
