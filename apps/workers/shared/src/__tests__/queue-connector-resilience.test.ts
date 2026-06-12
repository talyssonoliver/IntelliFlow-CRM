/**
 * QueueConnector Redis-retry resilience tests (issue #401)
 *
 * Verifies that connect() does NOT throw / exit the process when Redis is
 * transiently unavailable and instead retries with exponential backoff until
 * the connection succeeds.
 *
 * Uses fake timers so tests complete in milliseconds without real waits.
 *
 * @module @intelliflow/worker-shared/tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── IORedis mock ────────────────────────────────────────────────────────────
// Vitest requires vi.mock with a class (or factory returning class) when the
// module default export is used as a constructor (new IORedis(...)).
//
// We expose module-level arrays so individual tests can configure behaviour:
//   connectSequence – each call to connect() pops from this array.
//   pingSequence    – each call to ping() pops from this array.
// When the array is exhausted the call succeeds (resolves).

type ConnectResult = Error | null;
type PingResult = Error | null;

export const connectSequence: ConnectResult[] = [];
export const pingSequence: PingResult[] = [];

const mockOnCalls: [string, unknown][] = [];

vi.mock('ioredis', () => {
  class MockIORedis {
    connect() {
      const next = connectSequence.shift();
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve();
    }
    ping() {
      const next = pingSequence.shift();
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve('PONG');
    }
    quit() {
      return Promise.resolve(undefined);
    }
    disconnect() {}
    on(event: string, handler: unknown) {
      mockOnCalls.push([event, handler]);
    }
    duplicate() {
      return new MockIORedis();
    }
  }

  return { default: MockIORedis };
});

// ─── BullMQ mock ─────────────────────────────────────────────────────────────
vi.mock('bullmq', () => ({
  Queue: class {
    close = vi.fn().mockResolvedValue(undefined);
  },
  Worker: class {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn().mockResolvedValue(undefined);
    resume = vi.fn();
  },
  QueueEvents: class {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import { QueueConnector } from '../queue-connector';

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeConnector(): QueueConnector {
  return new QueueConnector({
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
      tls: false,
    },
    queue: {
      concurrency: 1,
      lockDuration: 30_000,
      stalledInterval: 30_000,
      maxStalledCount: 1,
    },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QueueConnector.connect() — Redis retry resilience (#401)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset sequences and spy arrays.
    connectSequence.length = 0;
    pingSequence.length = 0;
    mockOnCalls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('connects on first attempt when Redis is immediately available', async () => {
    // Default sequences are empty → connect() and ping() resolve immediately.
    const connector = makeConnector();
    await expect(connector.connect()).resolves.toBeUndefined();
  });

  it('does NOT throw and eventually resolves after N failed connect attempts', async () => {
    const FAIL_ATTEMPTS = 3;

    // Queue N ECONNREFUSED errors; the (N+1)th attempt has nothing queued → succeeds.
    for (let i = 0; i < FAIL_ATTEMPTS; i++) {
      connectSequence.push(new Error('ECONNREFUSED'));
    }

    const connector = makeConnector();
    const connectPromise = connector.connect();

    // Drive the retry loop: each iteration = one failed attempt + one setTimeout.
    for (let i = 0; i < FAIL_ATTEMPTS; i++) {
      // Drain microtasks so the current attempt (and its throw/catch) completes.
      await Promise.resolve();
      // Advance past the longest possible backoff sleep (30 s cap).
      await vi.advanceTimersByTimeAsync(30_001);
    }

    await expect(connectPromise).resolves.toBeUndefined();

    // All queued errors were consumed — means we retried exactly FAIL_ATTEMPTS times
    // before the success.
    expect(connectSequence).toHaveLength(0);
  });

  it('does NOT throw and retries when ping fails (connection is closed)', async () => {
    // connect() passes but ping() fails twice, then succeeds.
    pingSequence.push(new Error('Connection is closed'));
    pingSequence.push(new Error('Connection is closed'));

    const connector = makeConnector();
    const connectPromise = connector.connect();

    for (let i = 0; i < 2; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30_001);
    }

    await expect(connectPromise).resolves.toBeUndefined();
    expect(pingSequence).toHaveLength(0);
  });

  it('does NOT call process.exit at any point during the retry cycle', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    connectSequence.push(new Error('ECONNREFUSED'));

    const connector = makeConnector();
    const connectPromise = connector.connect();

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_001);

    await expect(connectPromise).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it('registers an error listener on the IORedis instance to suppress unhandled events', async () => {
    const connector = makeConnector();
    await connector.connect();

    // .on('error', handler) must have been called at least once on the instance
    // created inside connect().
    const errorListeners = mockOnCalls.filter(([event]) => event === 'error');
    expect(errorListeners.length).toBeGreaterThanOrEqual(1);
    expect(typeof errorListeners[0]![1]).toBe('function');
  });
});
