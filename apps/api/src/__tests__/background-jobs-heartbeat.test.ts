/**
 * Heartbeat for the approval sweep and bounce scan: written by each finished
 * tick, read only when a health endpoint is requested.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HEARTBEAT_STALE_FACTOR,
  checkBackgroundJobsHeartbeat,
  createRedisHeartbeatStore,
  evaluateHeartbeats,
  getHeartbeatStore,
  heartbeatIntervals,
  resetHeartbeatStore,
  type HeartbeatRedis,
  type HeartbeatStore,
} from '../background-jobs-heartbeat';

const MINUTE = 60_000;
const NOW = 1_000_000_000_000;

beforeEach(() => {
  resetHeartbeatStore();
});

function fakeRedis(values: Array<string | null> = [null, null]) {
  const redis = {
    set: vi.fn(async () => 'OK'),
    mget: vi.fn(async () => values),
    on: vi.fn(),
  };
  return redis satisfies HeartbeatRedis;
}

describe('createRedisHeartbeatStore', () => {
  it('is null without REDIS_HOST and never opens a connection', () => {
    const create = vi.fn();
    expect(createRedisHeartbeatStore({}, create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('opens the connection lazily, on first record or read, and reuses it', async () => {
    const redis = fakeRedis();
    const create = vi.fn(async () => redis);
    const store = createRedisHeartbeatStore({ REDIS_HOST: 'redis.example.invalid' }, create)!;
    expect(create).not.toHaveBeenCalled();

    await store.record('approvalSweep', 123);
    await store.read();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('records with a TTL under a per-job key', async () => {
    const redis = fakeRedis();
    const store = createRedisHeartbeatStore({ REDIS_HOST: 'h' }, async () => redis)!;

    await store.record('bounceScan', 42);

    expect(redis.set).toHaveBeenCalledWith(
      'ifc:background-jobs:heartbeat:bounceScan',
      '42',
      'EX',
      expect.any(Number)
    );
  });

  it('reads both jobs, mapping missing or garbage values to null', async () => {
    const redis = fakeRedis(['1700', 'garbage']);
    const store = createRedisHeartbeatStore({ REDIS_HOST: 'h' }, async () => redis)!;

    expect(await store.read()).toEqual({ approvalSweep: 1700, bounceScan: null });
    expect(redis.mget).toHaveBeenCalledWith(
      'ifc:background-jobs:heartbeat:approvalSweep',
      'ifc:background-jobs:heartbeat:bounceScan'
    );
  });

  it('shares one process-wide store', () => {
    const env = { REDIS_HOST: 'h' };
    expect(getHeartbeatStore(env)).toBe(getHeartbeatStore(env));
    resetHeartbeatStore();
    expect(getHeartbeatStore({})).toBeNull();
  });
});

describe('default redis client', () => {
  it('is built from the REDIS_* env, with an error listener', async () => {
    const instances: Array<{ options: Record<string, unknown>; on: ReturnType<typeof vi.fn> }> = [];
    vi.resetModules();
    vi.doMock('ioredis', () => ({
      default: class {
        options: Record<string, unknown>;
        on = vi.fn();
        set = vi.fn(async () => 'OK');
        constructor(options: Record<string, unknown>) {
          this.options = options;
          instances.push(this as never);
        }
      },
    }));
    const mod = await import('../background-jobs-heartbeat.js');
    const store = mod.createRedisHeartbeatStore({
      REDIS_HOST: 'redis.example.invalid',
      REDIS_PORT: '6380',
      REDIS_TLS: 'true',
    })!;

    await store.record('approvalSweep', 1);

    expect(instances).toHaveLength(1);
    expect(instances[0]!.options).toMatchObject({
      host: 'redis.example.invalid',
      port: 6380,
      tls: {},
    });
    expect(instances[0]!.on).toHaveBeenCalledWith('error', expect.any(Function));
    vi.doUnmock('ioredis');
  });
});

describe('heartbeatIntervals', () => {
  it('reads each job interval from its env, 0 when disabled', () => {
    expect(
      heartbeatIntervals({ APPROVAL_SWEEP_INTERVAL_MS: '5000', EMAIL_BOUNCE_SCAN_INTERVAL_MS: '0' })
    ).toEqual({ approvalSweep: 5000, bounceScan: 0 });
  });
});

describe('evaluateHeartbeats', () => {
  const intervals = { approvalSweep: MINUTE, bounceScan: MINUTE };
  const limit = HEARTBEAT_STALE_FACTOR * MINUTE;

  it('is ok when both jobs ticked within 3x their interval', () => {
    const result = evaluateHeartbeats({
      now: NOW,
      reads: { approvalSweep: NOW - 10_000, bounceScan: NOW - limit },
      intervals,
      uptimeMs: 10 * MINUTE,
    });
    expect(result.status).toBe('ok');
    expect(result.jobs!.approvalSweep).toMatchObject({ status: 'ok' });
  });

  it('is degraded, naming the fix, when a job is silent for more than 3x its interval', () => {
    const result = evaluateHeartbeats({
      now: NOW,
      reads: { approvalSweep: NOW - limit - 1, bounceScan: NOW },
      intervals,
      uptimeMs: 10 * MINUTE,
    });
    expect(result.status).toBe('degraded');
    expect(result.jobs!.approvalSweep.status).toBe('stale');
    expect(result.jobs!.bounceScan.status).toBe('ok');
    expect(result.message).toContain('approvalSweep');
    expect(result.message).toContain('COMBINED_BACKGROUND_JOBS=on');
  });

  it('gives a job that never ticked its first 3x interval of process uptime', () => {
    const reads = { approvalSweep: null, bounceScan: null };
    expect(evaluateHeartbeats({ now: NOW, reads, intervals, uptimeMs: limit }).status).toBe('ok');
    const late = evaluateHeartbeats({ now: NOW, reads, intervals, uptimeMs: limit + 1 });
    expect(late.status).toBe('degraded');
    expect(late.jobs!.approvalSweep.lastRunAt).toBeNull();
  });

  it('skips a job whose interval is 0 (disabled on purpose)', () => {
    const result = evaluateHeartbeats({
      now: NOW,
      reads: { approvalSweep: null, bounceScan: null },
      intervals: { approvalSweep: 0, bounceScan: 0 },
      uptimeMs: 99 * MINUTE,
    });
    expect(result.status).toBe('ok');
    expect(result.jobs!.approvalSweep.status).toBe('disabled');
  });
});

describe('checkBackgroundJobsHeartbeat', () => {
  const env = {} as NodeJS.ProcessEnv;
  const store = (read: HeartbeatStore['read']): HeartbeatStore => ({
    record: vi.fn(),
    read,
  });

  it('is unknown, never degraded, without a store', async () => {
    const result = await checkBackgroundJobsHeartbeat({ env, store: null });
    expect(result.status).toBe('unknown');
    expect(result.message).toContain('REDIS_HOST');
  });

  it('is unknown when the heartbeat cannot be read', async () => {
    const result = await checkBackgroundJobsHeartbeat({
      env,
      store: store(() => Promise.reject(new Error('redis down'))),
    });
    expect(result).toEqual({ status: 'unknown', message: 'heartbeat unreadable: redis down' });

    const plain = await checkBackgroundJobsHeartbeat({
      env,
      store: store(() => Promise.reject('plain')),
    });
    expect(plain.message).toBe('heartbeat unreadable: plain');
  });

  it('judges the stored heartbeat against the env intervals', async () => {
    const fresh = await checkBackgroundJobsHeartbeat({
      env,
      now: () => NOW,
      uptimeMs: () => 10 * MINUTE,
      store: store(async () => ({ approvalSweep: NOW - 1000, bounceScan: NOW - 1000 })),
    });
    expect(fresh.status).toBe('ok');

    const silent = await checkBackgroundJobsHeartbeat({
      env,
      now: () => NOW,
      uptimeMs: () => 10 * MINUTE,
      store: store(async () => ({ approvalSweep: null, bounceScan: null })),
    });
    expect(silent.status).toBe('degraded');
  });

  it('defaults to the shared store, the real clock and the process uptime', async () => {
    const result = await checkBackgroundJobsHeartbeat({ env: {} });
    expect(result.status).toBe('unknown'); // no REDIS_HOST in this env
  });
});
