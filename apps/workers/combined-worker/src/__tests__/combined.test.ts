import http from 'node:http';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadCombinedConfig,
  startCombinedWorker,
  type CombinedWorkerHandle,
  type ManagedWorker,
  type WorkerLoaders,
  type WorkerName,
} from '../combined';

const silent = pino({ level: 'silent' });
const SIGNALS = ['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'] as const;

class FakeWorker implements ManagedWorker {
  state = 'idle';
  start = vi.fn(async () => {
    this.state = 'running';
  });
  stop = vi.fn(async () => {
    this.state = 'stopped';
  });
  getStatus() {
    return { state: this.state };
  }
}

function makeLoaders(overrides: Partial<Record<WorkerName, () => Promise<ManagedWorker>>> = {}) {
  const workers = {
    'ai-worker': new FakeWorker(),
    'events-worker': new FakeWorker(),
    'ingestion-worker': new FakeWorker(),
  };
  const loaders: WorkerLoaders = {
    'ai-worker': async () => workers['ai-worker'],
    'events-worker': async () => workers['events-worker'],
    'ingestion-worker': async () => workers['ingestion-worker'],
    ...overrides,
  };
  return { workers, loaders };
}

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

function listenerCounts() {
  return SIGNALS.map((event) => process.listenerCount(event));
}

describe('loadCombinedConfig', () => {
  it('defaults to all three workers on port 3100, fail-fast', () => {
    expect(loadCombinedConfig({})).toEqual({
      workers: ['ai-worker', 'events-worker', 'ingestion-worker'],
      healthPort: 3100,
      allowPartial: false,
      shutdownTimeoutMs: 30000,
    });
  });

  it('prefers COMBINED_HEALTH_PORT, then HEALTH_PORT, then PORT', () => {
    expect(loadCombinedConfig({ PORT: '8080' }).healthPort).toBe(8080);
    expect(loadCombinedConfig({ PORT: '8080', HEALTH_PORT: '9000' }).healthPort).toBe(9000);
    expect(
      loadCombinedConfig({ PORT: '8080', HEALTH_PORT: '9000', COMBINED_HEALTH_PORT: '7000' })
        .healthPort
    ).toBe(7000);
    expect(loadCombinedConfig({ COMBINED_HEALTH_PORT: '0' }).healthPort).toBe(0);
  });

  it('selects, trims and de-duplicates COMBINED_WORKERS', () => {
    const config = loadCombinedConfig({
      COMBINED_WORKERS: ' events-worker, ai-worker,events-worker ',
    });
    expect(config.workers).toEqual(['events-worker', 'ai-worker']);
  });

  it('reads the partial flag and shutdown timeout', () => {
    const config = loadCombinedConfig({
      COMBINED_ALLOW_PARTIAL: 'true',
      COMBINED_SHUTDOWN_TIMEOUT_MS: '500',
    });
    expect(config.allowPartial).toBe(true);
    expect(config.shutdownTimeoutMs).toBe(500);
  });

  it('rejects unknown workers, empty selections and bad numbers', () => {
    expect(() => loadCombinedConfig({ COMBINED_WORKERS: 'ai-worker,nope' })).toThrow(
      /Unknown worker\(s\) in COMBINED_WORKERS: nope/
    );
    expect(() => loadCombinedConfig({ COMBINED_WORKERS: ' , ' })).toThrow(/no workers/);
    expect(() => loadCombinedConfig({ HEALTH_PORT: 'abc' })).toThrow(/Invalid numeric value/);
    expect(() => loadCombinedConfig({ COMBINED_SHUTDOWN_TIMEOUT_MS: '0' })).toThrow(
      /Invalid numeric value/
    );
    expect(() => loadCombinedConfig({ HEALTH_PORT: '-1' })).toThrow(/Invalid numeric value/);
  });
});

describe('startCombinedWorker', () => {
  let handle: CombinedWorkerHandle | undefined;
  let exit: ReturnType<typeof vi.fn>;
  let env: NodeJS.ProcessEnv;
  let baseline: number[];

  beforeEach(() => {
    exit = vi.fn();
    env = { COMBINED_HEALTH_PORT: '0' };
    baseline = listenerCounts();
  });

  afterEach(async () => {
    if (handle) {
      await handle.shutdown('test cleanup');
      handle = undefined;
    }
    expect(listenerCounts()).toEqual(baseline);
  });

  it('starts every worker in order and serves aggregated health', async () => {
    const order: string[] = [];
    const { workers, loaders } = makeLoaders();
    for (const name of Object.keys(workers) as WorkerName[]) {
      workers[name].start.mockImplementation(async () => {
        order.push(name);
        workers[name].state = 'running';
      });
    }

    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

    expect(order).toEqual(['ai-worker', 'events-worker', 'ingestion-worker']);
    // Per-worker health servers must not fight over the real port.
    expect(env.HEALTH_PORT).toBe('0');

    const ready = await get(handle.healthPort, '/health');
    expect(ready.status).toBe(200);
    expect(JSON.parse(ready.body)).toEqual({
      status: 'ok',
      workers: {
        'ai-worker': { state: 'running' },
        'events-worker': { state: 'running' },
        'ingestion-worker': { state: 'running' },
      },
    });
    expect((await get(handle.healthPort, '/health/ready')).status).toBe(200);
    expect((await get(handle.healthPort, '/health/detailed?x=1')).status).toBe(200);
    expect((await get(handle.healthPort, '/health/live')).status).toBe(200);
    expect((await get(handle.healthPort, '/nope')).status).toBe(404);
  });

  it('reports 503 while any worker is not running', async () => {
    const { workers, loaders } = makeLoaders();
    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

    workers['events-worker'].state = 'error';
    const res = await get(handle.healthPort, '/health');
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body).status).toBe('degraded');
    // Liveness stays up so the platform does not restart for a degraded worker.
    expect((await get(handle.healthPort, '/health/live')).status).toBe(200);
  });

  it('only starts the workers selected by COMBINED_WORKERS', async () => {
    const { workers, loaders } = makeLoaders();
    env.COMBINED_WORKERS = 'events-worker';

    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

    expect(workers['events-worker'].start).toHaveBeenCalledTimes(1);
    expect(workers['ai-worker'].start).not.toHaveBeenCalled();
    expect(workers['ingestion-worker'].start).not.toHaveBeenCalled();
    expect(Object.keys(handle.getHealth().workers)).toEqual(['events-worker']);
  });

  it('shuts every worker down once, closes health, and exits 0', async () => {
    const { workers, loaders } = makeLoaders();
    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });
    const port = handle.healthPort;

    const first = handle.shutdown('test');
    const second = handle.shutdown('again');
    expect(second).toBe(first);
    await first;

    for (const worker of Object.values(workers)) {
      expect(worker.stop).toHaveBeenCalledTimes(1);
    }
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    await expect(get(port, '/health')).rejects.toThrow();
    handle = undefined;
  });

  it('reports draining while shutdown is in progress', async () => {
    const { workers, loaders } = makeLoaders();
    let release!: () => void;
    workers['ai-worker'].stop.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve))
    );
    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

    const done = handle.shutdown('test');
    expect(handle.getHealth().status).toBe('draining');
    release();
    await done;
    handle = undefined;
  });

  it('exits 1 when a worker fails to stop, but still stops the others', async () => {
    const { workers, loaders } = makeLoaders();
    workers['events-worker'].stop.mockRejectedValue(new Error('redis gone'));
    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

    await handle.shutdown('test');

    expect(workers['ai-worker'].stop).toHaveBeenCalled();
    expect(workers['ingestion-worker'].stop).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    handle = undefined;
  });

  it('forces exit 1 when shutdown exceeds the timeout', async () => {
    const { workers, loaders } = makeLoaders();
    workers['ai-worker'].stop.mockImplementation(() => new Promise<void>(() => undefined));
    env.COMBINED_SHUTDOWN_TIMEOUT_MS = '20';
    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

    void handle.shutdown('test');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    // The hung stop() never settles, so clean up listeners by hand.
    SIGNALS.forEach((event, i) => {
      for (const listener of process.listeners(event).slice(baseline[i])) {
        process.off(event, listener);
      }
    });
    handle = undefined;
  });

  it('routes SIGTERM and SIGINT through the single shutdown path', async () => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      exit.mockClear();
      const { workers, loaders } = makeLoaders();
      const started = await startCombinedWorker({ loaders, env, logger: silent, exit });

      process.emit(signal);
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

      for (const worker of Object.values(workers)) {
        expect(worker.stop).toHaveBeenCalledTimes(1);
      }
      expect(started.getHealth().status).toBe('draining');
    }
  });

  it('exits 1 on uncaught exceptions and unhandled rejections', async () => {
    const { loaders } = makeLoaders();
    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

    process.emit('uncaughtException', new Error('boom'));
    expect(exit).toHaveBeenLastCalledWith(1);
    exit.mockClear();
    process.emit('unhandledRejection', 'plain string' as unknown as Error, Promise.resolve());
    expect(exit).toHaveBeenLastCalledWith(1);
  });

  it('replaces the signal handlers that workers register on start', async () => {
    const { workers, loaders } = makeLoaders();
    const workerHandlers: Array<() => void> = [];
    for (const worker of Object.values(workers)) {
      worker.start.mockImplementation(async () => {
        const own = vi.fn();
        workerHandlers.push(own);
        process.on('SIGTERM', own);
        process.on('uncaughtException', own);
        worker.state = 'running';
      });
    }

    handle = await startCombinedWorker({ loaders, env, logger: silent, exit });
    expect(workerHandlers).toHaveLength(3);
    // Only the combined handlers remain (one each), the workers' are gone.
    expect(process.listenerCount('SIGTERM')).toBe(baseline[1] + 1);
    for (const own of workerHandlers) {
      expect(process.listeners('SIGTERM')).not.toContain(own);
      expect(process.listeners('uncaughtException')).not.toContain(own);
    }
  });

  describe('when one worker fails to start', () => {
    it('stops the already-started workers and rejects (fail-fast)', async () => {
      const { workers, loaders } = makeLoaders();
      workers['events-worker'].start.mockRejectedValue(new Error('no database'));

      await expect(startCombinedWorker({ loaders, env, logger: silent, exit })).rejects.toThrow(
        'Worker events-worker failed to start: no database'
      );

      expect(workers['ai-worker'].start).toHaveBeenCalled();
      expect(workers['ai-worker'].stop).toHaveBeenCalledTimes(1);
      // The failed worker releases its half-open resources too.
      expect(workers['events-worker'].stop).toHaveBeenCalledTimes(1);
      // Workers after the failure are never started.
      expect(workers['ingestion-worker'].start).not.toHaveBeenCalled();
      expect(listenerCounts()).toEqual(baseline);
      expect(exit).not.toHaveBeenCalled();
    });

    it('treats a loader (import) failure like a start failure', async () => {
      const { workers, loaders } = makeLoaders({
        'ai-worker': async () => {
          throw new Error('Cannot find module');
        },
      });

      await expect(startCombinedWorker({ loaders, env, logger: silent, exit })).rejects.toThrow(
        'Worker ai-worker failed to start: Cannot find module'
      );
      expect(workers['events-worker'].start).not.toHaveBeenCalled();
    });

    it('survives a stop() that throws while cleaning up the failed worker', async () => {
      const { workers, loaders } = makeLoaders();
      workers['ai-worker'].start.mockRejectedValue('string failure');
      workers['ai-worker'].stop.mockRejectedValue(new Error('not started'));

      await expect(startCombinedWorker({ loaders, env, logger: silent, exit })).rejects.toThrow(
        'Worker ai-worker failed to start: string failure'
      );
    });

    it('keeps the others running and reports degraded when partial mode is on', async () => {
      const { workers, loaders } = makeLoaders();
      workers['events-worker'].start.mockRejectedValue(new Error('no database'));
      env.COMBINED_ALLOW_PARTIAL = 'true';

      handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

      expect(workers['ingestion-worker'].start).toHaveBeenCalled();
      const res = await get(handle.healthPort, '/health');
      expect(res.status).toBe(503);
      expect(JSON.parse(res.body)).toEqual({
        status: 'degraded',
        workers: {
          'ai-worker': { state: 'running' },
          'events-worker': { state: 'failed', error: 'no database' },
          'ingestion-worker': { state: 'running' },
        },
      });

      await handle.shutdown('test');
      // Only the workers that actually started are stopped by the shutdown path.
      expect(workers['ai-worker'].stop).toHaveBeenCalledTimes(1);
      expect(workers['ingestion-worker'].stop).toHaveBeenCalledTimes(1);
      handle = undefined;
    });
  });

  it('fails startup and stops the workers when the health port is taken', async () => {
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, resolve));
    const taken = (blocker.address() as { port: number }).port;
    const { workers, loaders } = makeLoaders();
    env.COMBINED_HEALTH_PORT = String(taken);

    try {
      await expect(startCombinedWorker({ loaders, env, logger: silent, exit })).rejects.toThrow(
        /Combined health server failed to listen/
      );
      for (const worker of Object.values(workers)) {
        expect(worker.stop).toHaveBeenCalledTimes(1);
      }
      expect(listenerCounts()).toEqual(baseline);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it('uses the default logger and process.exit when none are injected', async () => {
    const { loaders } = makeLoaders();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    const started = await startCombinedWorker({ loaders, env });
    await started.shutdown('test');

    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
