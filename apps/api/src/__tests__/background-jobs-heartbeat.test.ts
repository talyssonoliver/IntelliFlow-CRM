/**
 * Heartbeat for the approval sweep and bounce scan: written by each finished
 * tick, read only when a health endpoint is requested.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HEARTBEAT_STALE_FACTOR,
  closeHeartbeatStore,
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
    disconnect: vi.fn(),
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

describe('connection lifecycle', () => {
  const env = { REDIS_HOST: 'redis.example.invalid' };

  it('builds a fresh client after the connection ended', async () => {
    const clients = [fakeRedis(), fakeRedis()];
    const create = vi.fn(async () => clients[create.mock.calls.length - 1]!);
    const store = createRedisHeartbeatStore(env, create)!;

    await store.record('approvalSweep', 1);
    // ioredis emits "end" once it gives up (retryStrategy returns null).
    const onEnd = clients[0]!.on.mock.calls.find(([event]) => event === 'end')![1] as () => void;
    onEnd();
    await store.record('approvalSweep', 2);

    expect(create).toHaveBeenCalledTimes(2);
    expect(clients[1]!.set).toHaveBeenCalledTimes(1);
  });

  it('disconnects and forgets a client whose command failed, then reconnects', async () => {
    const dead = fakeRedis();
    dead.set.mockRejectedValue(new Error('Connection is closed'));
    const live = fakeRedis();
    const clients = [dead, live];
    const create = vi.fn(async () => clients[create.mock.calls.length - 1]!);
    const store = createRedisHeartbeatStore(env, create)!;

    await expect(store.record('approvalSweep', 1)).rejects.toThrow('Connection is closed');
    expect(dead.disconnect).toHaveBeenCalledTimes(1);

    await store.record('approvalSweep', 2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(live.set).toHaveBeenCalledTimes(1);
  });

  it('forgets a client that failed to build, so the next call retries', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('import failed'))
      .mockResolvedValue(fakeRedis());
    const store = createRedisHeartbeatStore(env, create)!;

    await expect(store.read()).rejects.toThrow('import failed');
    await expect(store.read()).resolves.toEqual({ approvalSweep: null, bounceScan: null });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('close disconnects the open client, is safe when none is open, and reconnects on next use', async () => {
    const redis = fakeRedis();
    const create = vi.fn(async () => redis);
    const store = createRedisHeartbeatStore(env, create)!;

    await expect(store.close()).resolves.toBeUndefined(); // nothing open yet
    expect(create).not.toHaveBeenCalled();

    await store.record('bounceScan', 1);
    await store.close();
    expect(redis.disconnect).toHaveBeenCalledTimes(1);

    await store.record('bounceScan', 2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('closeHeartbeatStore closes the shared store, and is a no-op without one', async () => {
    await expect(closeHeartbeatStore()).resolves.toBeUndefined();
    resetHeartbeatStore();
    expect(getHeartbeatStore({})).toBeNull();
    await expect(closeHeartbeatStore()).resolves.toBeUndefined();
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
    // Never reconnect on its own: a dead Redis must not keep an idle api dialling.
    const retry = instances[0]!.options.retryStrategy as () => unknown;
    expect(retry()).toBeNull();
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

  it('keeps watching on Vercel/Lambda, where only local timers are disabled', () => {
    const serverless = {
      APPROVAL_SWEEP_INTERVAL_MS: '5000',
      EMAIL_BOUNCE_SCAN_INTERVAL_MS: '7000',
    };
    expect(heartbeatIntervals({ ...serverless, VERCEL: '1' })).toEqual({
      approvalSweep: 5000,
      bounceScan: 7000,
    });
    expect(heartbeatIntervals({ ...serverless, AWS_LAMBDA_FUNCTION_NAME: 'fn' })).toEqual({
      approvalSweep: 5000,
      bounceScan: 7000,
    });
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
      runsJobsHere: true,
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
      runsJobsHere: true,
    });
    expect(result.status).toBe('degraded');
    expect(result.jobs!.approvalSweep.status).toBe('stale');
    expect(result.jobs!.bounceScan.status).toBe('ok');
    expect(result.message).toContain('approvalSweep');
    expect(result.message).toContain('COMBINED_BACKGROUND_JOBS=on');
  });

  it('gives a job that never ticked its first 3x interval of process uptime', () => {
    const reads = { approvalSweep: null, bounceScan: null };
    expect(
      evaluateHeartbeats({ now: NOW, reads, intervals, uptimeMs: limit, runsJobsHere: true }).status
    ).toBe('ok');
    const late = evaluateHeartbeats({
      now: NOW,
      reads,
      intervals,
      uptimeMs: limit + 1,
      runsJobsHere: true,
    });
    expect(late.status).toBe('degraded');
    expect(late.jobs!.approvalSweep.lastRunAt).toBeNull();
  });

  it('an observer that does not run the jobs gets no grace for a missing heartbeat', () => {
    const reads = { approvalSweep: null, bounceScan: NOW - 1000 };
    const result = evaluateHeartbeats({
      now: NOW,
      reads,
      intervals,
      uptimeMs: 1000,
      runsJobsHere: false,
    });
    expect(result.status).toBe('degraded');
    expect(result.jobs!.approvalSweep.status).toBe('stale');
    expect(result.jobs!.bounceScan.status).toBe('ok');
  });

  it('skips a job whose interval is 0 (disabled on purpose)', () => {
    const result = evaluateHeartbeats({
      now: NOW,
      reads: { approvalSweep: null, bounceScan: null },
      intervals: { approvalSweep: 0, bounceScan: 0 },
      uptimeMs: 99 * MINUTE,
      runsJobsHere: true,
    });
    expect(result.status).toBe('ok');
    expect(result.jobs!.approvalSweep.status).toBe('disabled');
  });
});

describe('checkBackgroundJobsHeartbeat', () => {
  const env = {} as NodeJS.ProcessEnv;
  const store = (read: HeartbeatStore['read']): HeartbeatStore => ({
    record: vi.fn(),
    close: vi.fn(async () => undefined),
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
