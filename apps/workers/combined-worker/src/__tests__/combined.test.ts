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
  checks: Record<string, { status: 'ok' | 'degraded' | 'error'; message?: string }> = {
    redis: { status: 'ok' },
  };
  checkHealth = vi.fn(async () => this.checks);
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

  it('leaves the api timer jobs off unless COMBINED_BACKGROUND_JOBS is on', () => {
    expect(loadCombinedConfig({}).workers).not.toContain('background-jobs');
    expect(loadCombinedConfig({ COMBINED_BACKGROUND_JOBS: 'off' }).workers).not.toContain(
      'background-jobs'
    );
    expect(loadCombinedConfig({ COMBINED_BACKGROUND_JOBS: '' }).workers).not.toContain(
      'background-jobs'
    );
  });

  it.each(['on', 'ON', 'true', '1', ' yes '])(
    'COMBINED_BACKGROUND_JOBS=%s adds background-jobs after the selected workers',
    (value) => {
      expect(loadCombinedConfig({ COMBINED_BACKGROUND_JOBS: value }).workers).toEqual([
        'ai-worker',
        'events-worker',
        'ingestion-worker',
        'background-jobs',
      ]);
      expect(
        loadCombinedConfig({ COMBINED_WORKERS: 'events-worker', COMBINED_BACKGROUND_JOBS: value })
          .workers
      ).toEqual(['events-worker', 'background-jobs']);
    }
  );

  it('does not accept background-jobs through COMBINED_WORKERS', () => {
    expect(() => loadCombinedConfig({ COMBINED_WORKERS: 'background-jobs' })).toThrow(
      /Unknown worker\(s\)/
    );
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

  it('runs the background jobs as a fourth worker only when the flag is on', async () => {
    const jobs = new FakeWorker();
    const { workers, loaders } = makeLoaders();
    const withJobs: WorkerLoaders = { ...loaders, 'background-jobs': async () => jobs };

    env.COMBINED_BACKGROUND_JOBS = 'on';
    handle = await startCombinedWorker({ loaders: withJobs, env, logger: silent, exit });

    expect(jobs.start).toHaveBeenCalledTimes(1);
    expect(workers['ai-worker'].start).toHaveBeenCalledTimes(1);
    const health = JSON.parse((await get(handle.healthPort, '/health')).body);
    expect(health.workers['background-jobs']).toEqual({
      state: 'running',
      checks: { redis: { status: 'ok' } },
    });

    await handle.shutdown('test');
    expect(jobs.stop).toHaveBeenCalledTimes(1);
    handle = undefined;
  });

  it('works with COMBINED_WORKERS subsets: the selected workers plus the jobs', async () => {
    const jobs = new FakeWorker();
    const { workers, loaders } = makeLoaders();
    env.COMBINED_WORKERS = 'events-worker';
    env.COMBINED_BACKGROUND_JOBS = 'on';

    handle = await startCombinedWorker({
      loaders: { ...loaders, 'background-jobs': async () => jobs },
      env,
      logger: silent,
      exit,
    });

    expect(Object.keys((await handle.getHealth()).workers)).toEqual([
      'events-worker',
      'background-jobs',
    ]);
    expect(workers['ai-worker'].start).not.toHaveBeenCalled();
  });

  it('reports unhealthy (503) when the jobs health check errors', async () => {
    const jobs = new FakeWorker();
    jobs.checks = { timers: { status: 'error', message: 'stopped' } };
    const { loaders } = makeLoaders();
    env.COMBINED_BACKGROUND_JOBS = 'on';

    handle = await startCombinedWorker({
      loaders: { ...loaders, 'background-jobs': async () => jobs },
      env,
      logger: silent,
      exit,
    });

    expect((await get(handle.healthPort, '/health')).status).toBe(503);
    expect((await handle.getHealth()).workers['background-jobs']?.state).toBe('unhealthy');
  });

  it('fail-fast cleanup stops the started workers and the jobs once when the jobs fail to start', async () => {
    const jobs = new FakeWorker();
    jobs.start.mockRejectedValue(new Error('no container'));
    const { workers, loaders } = makeLoaders();
    env.COMBINED_BACKGROUND_JOBS = 'on';

    await expect(
      startCombinedWorker({
        loaders: { ...loaders, 'background-jobs': async () => jobs },
        env,
        logger: silent,
        exit,
      })
    ).rejects.toThrow('Worker background-jobs failed to start: no container');

    for (const worker of Object.values(workers)) expect(worker.stop).toHaveBeenCalledTimes(1);
    expect(jobs.stop).toHaveBeenCalledTimes(1);
    expect(listenerCounts()).toEqual(baseline);
  });

  it('SIGTERM stops the jobs through the shared shutdown path, once, and runs onShutdown', async () => {
    const jobs = new FakeWorker();
    const { workers, loaders } = makeLoaders();
    const onShutdown = vi.fn(async () => undefined);
    env.COMBINED_BACKGROUND_JOBS = 'on';

    handle = await startCombinedWorker({
      loaders: { ...loaders, 'background-jobs': async () => jobs },
      env,
      logger: silent,
      exit,
      onShutdown,
    });
    process.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(jobs.stop).toHaveBeenCalledTimes(1);
    expect(workers['ai-worker'].stop).toHaveBeenCalledTimes(1);
    expect(onShutdown).toHaveBeenCalledTimes(1);
    handle = undefined;
  });

  it('SIGTERM while the jobs are still starting waits for them, then stops them', async () => {
    const jobs = new FakeWorker();
    let finishStart!: () => void;
    jobs.start.mockImplementation(() => new Promise<void>((resolve) => (finishStart = resolve)));
    const { loaders } = makeLoaders();
    env.COMBINED_BACKGROUND_JOBS = 'on';

    const starting = startCombinedWorker({
      loaders: { ...loaders, 'background-jobs': async () => jobs },
      env,
      logger: silent,
      exit,
    });
    await vi.waitFor(() => expect(jobs.start).toHaveBeenCalled());
    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(jobs.stop).not.toHaveBeenCalled();

    finishStart();
    await starting;
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(jobs.stop).toHaveBeenCalledTimes(1);
  });

  it('does not touch the background jobs loader when the flag is off', async () => {
    const jobs = new FakeWorker();
    const { loaders } = makeLoaders();
    const withJobs: WorkerLoaders = { ...loaders, 'background-jobs': async () => jobs };

    handle = await startCombinedWorker({ loaders: withJobs, env, logger: silent, exit });

    expect(jobs.start).not.toHaveBeenCalled();
    const health = JSON.parse((await get(handle.healthPort, '/health')).body);
    expect(health.workers).not.toHaveProperty('background-jobs');
  });

  it('fails fast when the flag is on but no loader is registered', async () => {
    const { loaders } = makeLoaders();
    env.COMBINED_BACKGROUND_JOBS = 'on';

    await expect(startCombinedWorker({ loaders, env, logger: silent, exit })).rejects.toThrow(
      /No loader registered for background-jobs/
    );
  });

  it('starts every worker in order and serves aggregated health', async () => {
    const order: string[] = [];
    const { workers, loaders } = makeLoaders();
    for (const name of Object.keys(workers) as Array<keyof typeof workers>) {
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
        'ai-worker': { state: 'running', checks: { redis: { status: 'ok' } } },
        'events-worker': { state: 'running', checks: { redis: { status: 'ok' } } },
        'ingestion-worker': { state: 'running', checks: { redis: { status: 'ok' } } },
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
    expect(Object.keys((await handle.getHealth()).workers)).toEqual(['events-worker']);
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
    expect((await handle.getHealth()).status).toBe('draining');
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
      expect((await started.getHealth()).status).toBe('draining');
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
          'ai-worker': { state: 'running', checks: { redis: { status: 'ok' } } },
          'events-worker': { state: 'failed', error: 'no database' },
          'ingestion-worker': { state: 'running', checks: { redis: { status: 'ok' } } },
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

  describe('dependency health', () => {
    it('includes each worker own dependency checks', async () => {
      const { loaders } = makeLoaders();
      handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

      const res = JSON.parse((await get(handle.healthPort, '/health')).body);
      expect(res.workers['events-worker'].checks).toEqual({ redis: { status: 'ok' } });
    });

    it('returns 503 when a dependency check errors, e.g. Redis down', async () => {
      const { workers, loaders } = makeLoaders();
      handle = await startCombinedWorker({ loaders, env, logger: silent, exit });
      workers['ai-worker'].checks = { redis: { status: 'error', message: 'ECONNREFUSED' } };

      for (const path of ['/health', '/health/ready', '/health/detailed']) {
        const res = await get(handle.healthPort, path);
        expect(res.status).toBe(503);
        const body = JSON.parse(res.body);
        expect(body.status).toBe('degraded');
        expect(body.workers['ai-worker'].state).toBe('unhealthy');
        expect(body.workers['ai-worker'].checks.redis.message).toBe('ECONNREFUSED');
        expect(body.workers['events-worker'].state).toBe('running');
      }
      // Liveness never depends on dependencies.
      expect((await get(handle.healthPort, '/health/live')).status).toBe(200);
    });

    it('treats a degraded dependency as still serving, like the standalone servers', async () => {
      const { workers, loaders } = makeLoaders();
      handle = await startCombinedWorker({ loaders, env, logger: silent, exit });
      workers['ingestion-worker'].checks = { provider: { status: 'degraded' } };

      expect((await get(handle.healthPort, '/health')).status).toBe(200);
    });

    it('returns 503 when a health check itself throws', async () => {
      const { workers, loaders } = makeLoaders();
      handle = await startCombinedWorker({ loaders, env, logger: silent, exit });
      workers['events-worker'].checkHealth.mockRejectedValue(new Error('probe crashed'));

      const res = await get(handle.healthPort, '/health');
      expect(res.status).toBe(503);
      expect(JSON.parse(res.body).workers['events-worker'].checks.health.message).toBe(
        'probe crashed'
      );
    });

    it('works with workers that expose no checkHealth', async () => {
      const { workers, loaders } = makeLoaders();
      (workers['ai-worker'] as { checkHealth?: unknown }).checkHealth = undefined;
      handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

      expect((await get(handle.healthPort, '/health')).status).toBe(200);
    });
  });

  describe('signals during startup', () => {
    it('has the combined handlers installed before any worker is loaded', async () => {
      const seen: number[] = [];
      const { loaders } = makeLoaders({
        'ai-worker': async () => {
          seen.push(process.listenerCount('SIGTERM'));
          return new FakeWorker();
        },
      });
      handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

      expect(seen).toEqual([baseline[1] + 1]);
    });

    it('keeps dropping handlers for the life of the process and restores process.on on exit', async () => {
      const originalOn = process.on;
      const rogue = vi.fn();
      const { workers, loaders } = makeLoaders({
        'ai-worker': async () => {
          // what ai-worker's OpenTelemetry module does on import
          process.on('SIGTERM', rogue);
          process.once('SIGINT', rogue);
          process.prependListener('uncaughtException', rogue);
          return workers['ai-worker'];
        },
      });
      handle = await startCombinedWorker({ loaders, env, logger: silent, exit });

      expect(process.listeners('SIGTERM')).not.toContain(rogue);
      expect(process.listeners('SIGINT')).not.toContain(rogue);
      expect(process.listeners('uncaughtException')).not.toContain(rogue);
      // A lazy import after startup (ingestion-worker loading ai-worker on its
      // first job) registers OpenTelemetry's handlers; they must still be dropped.
      process.on('SIGTERM', rogue);
      process.addListener('SIGINT', rogue);
      process.on('beforeExit', rogue);
      expect(process.listeners('SIGTERM')).not.toContain(rogue);
      expect(process.listeners('SIGINT')).not.toContain(rogue);
      expect(process.listeners('beforeExit')).not.toContain(rogue);
      // Unrelated events still register normally.
      const other = vi.fn();
      process.on('SIGUSR2', other);
      expect(process.listeners('SIGUSR2')).toContain(other);
      process.off('SIGUSR2', other);

      await handle.shutdown('test');
      handle = undefined;
      expect(process.on).toBe(originalOn);
    });

    it('stops started and in-flight workers and skips the rest on SIGTERM mid-startup', async () => {
      const { workers, loaders } = makeLoaders();
      let finishStart!: () => void;
      workers['events-worker'].start.mockImplementation(
        () => new Promise<void>((resolve) => (finishStart = resolve))
      );

      const starting = startCombinedWorker({ loaders, env, logger: silent, exit });
      await vi.waitFor(() => expect(workers['events-worker'].start).toHaveBeenCalled());

      process.emit('SIGTERM');
      // Shutdown waits for the in-flight start instead of racing it.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(workers['events-worker'].stop).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();

      finishStart();
      const result = await starting;
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

      expect(workers['ai-worker'].stop).toHaveBeenCalledTimes(1);
      expect(workers['events-worker'].stop).toHaveBeenCalledTimes(1);
      expect(workers['events-worker'].stop.mock.invocationCallOrder[0]).toBeGreaterThan(
        workers['events-worker'].start.mock.invocationCallOrder[0]
      );
      expect(workers['ingestion-worker'].start).not.toHaveBeenCalled();
      expect(result.healthPort).toBe(0);
      expect((await result.getHealth()).status).toBe('draining');
    });

    it('does not report a start failure caused by the interrupting signal', async () => {
      const { workers, loaders } = makeLoaders();
      let failStart!: (error: Error) => void;
      workers['ai-worker'].start.mockImplementation(
        () => new Promise<void>((_, reject) => (failStart = reject))
      );

      const starting = startCombinedWorker({ loaders, env, logger: silent, exit });
      await vi.waitFor(() => expect(workers['ai-worker'].start).toHaveBeenCalled());
      process.emit('SIGINT');
      failStart(new Error('connection closed'));

      await expect(starting).resolves.toMatchObject({ healthPort: 0 });
      expect(exit).toHaveBeenCalledWith(0);
    });
  });

  describe('signal during a loader', () => {
    it('waits for the load, never starts that worker, and skips the rest', async () => {
      const { workers, loaders } = makeLoaders();
      let finishLoad!: () => void;
      const gated = new FakeWorker();
      loaders['events-worker'] = () =>
        new Promise<ManagedWorker>((resolve) => (finishLoad = () => resolve(gated)));

      const starting = startCombinedWorker({ loaders, env, logger: silent, exit });
      await vi.waitFor(() => expect(finishLoad).toBeDefined());

      process.emit('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(exit).not.toHaveBeenCalled();

      finishLoad();
      await starting;
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

      expect(gated.start).not.toHaveBeenCalled();
      expect(workers['ai-worker'].stop).toHaveBeenCalledTimes(1);
      expect(workers['ingestion-worker'].start).not.toHaveBeenCalled();
    });

    it('still exits after the shutdown timeout if the load never finishes', async () => {
      const { loaders } = makeLoaders({ 'ai-worker': () => new Promise<ManagedWorker>(() => {}) });
      env.COMBINED_SHUTDOWN_TIMEOUT_MS = '20';

      void startCombinedWorker({ loaders, env, logger: silent, exit });
      await new Promise((resolve) => setTimeout(resolve, 10));
      process.emit('SIGTERM');

      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
      expect(listenerCounts()).toEqual(baseline);
    });
  });

  describe('signal while a startup-abort cleanup is stopping workers', () => {
    it('stops each worker once and exits only after the stops resolve (failed worker stop)', async () => {
      const { workers, loaders } = makeLoaders();
      workers['events-worker'].start.mockRejectedValue(new Error('no database'));
      let finishStop!: () => void;
      workers['events-worker'].stop.mockImplementation(
        () => new Promise<void>((resolve) => (finishStop = resolve))
      );
      const order: string[] = [];
      const onShutdown = vi.fn(async () => void order.push('hook'));
      exit.mockImplementation(() => order.push('exit'));

      const starting = startCombinedWorker({ loaders, env, logger: silent, exit, onShutdown });
      const rejected = expect(starting).rejects.toThrow(/events-worker failed to start/);
      await vi.waitFor(() => expect(workers['events-worker'].stop).toHaveBeenCalled());

      process.emit('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(order).toEqual([]);

      finishStop();
      await rejected;
      await vi.waitFor(() => expect(order).toContain('exit'));

      expect(order).toEqual(['hook', 'exit']);
      expect(workers['events-worker'].stop).toHaveBeenCalledTimes(1);
      expect(workers['ai-worker'].stop).toHaveBeenCalledTimes(1);
    });

    it('stops each worker once and exits only after the stops resolve (running workers)', async () => {
      const { workers, loaders } = makeLoaders();
      workers['events-worker'].start.mockRejectedValue(new Error('no database'));
      let finishStop!: () => void;
      workers['ai-worker'].stop.mockImplementation(
        () => new Promise<void>((resolve) => (finishStop = resolve))
      );
      const order: string[] = [];
      const onShutdown = vi.fn(async () => void order.push('hook'));
      exit.mockImplementation(() => order.push('exit'));

      const starting = startCombinedWorker({ loaders, env, logger: silent, exit, onShutdown });
      const rejected = expect(starting).rejects.toThrow(/events-worker failed to start/);
      await vi.waitFor(() => expect(workers['ai-worker'].stop).toHaveBeenCalled());

      process.emit('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(order).toEqual([]);
      expect(onShutdown).not.toHaveBeenCalled();

      finishStop();
      await rejected;
      await vi.waitFor(() => expect(order).toContain('exit'));

      expect(order).toEqual(['hook', 'exit']);
      expect(workers['ai-worker'].stop).toHaveBeenCalledTimes(1);
      expect(workers['events-worker'].stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('shutdown hook on startup-abort paths', () => {
    it('runs onShutdown when a worker fails to start (fail-fast)', async () => {
      const { workers, loaders } = makeLoaders();
      workers['events-worker'].start.mockRejectedValue(new Error('no database'));
      const onShutdown = vi.fn(async () => undefined);

      await expect(
        startCombinedWorker({ loaders, env, logger: silent, exit, onShutdown })
      ).rejects.toThrow(/events-worker failed to start/);

      expect(onShutdown).toHaveBeenCalledTimes(1);
      expect(exit).not.toHaveBeenCalled();
    });

    it('runs onShutdown when the health port is taken', async () => {
      const blocker = http.createServer();
      await new Promise<void>((resolve) => blocker.listen(0, resolve));
      env.COMBINED_HEALTH_PORT = String((blocker.address() as { port: number }).port);
      const { loaders } = makeLoaders();
      const onShutdown = vi.fn(async () => undefined);

      try {
        await expect(
          startCombinedWorker({ loaders, env, logger: silent, exit, onShutdown })
        ).rejects.toThrow(/health server failed to listen/);
        expect(onShutdown).toHaveBeenCalledTimes(1);
      } finally {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
    });

    it('gives the process events back after an aborted startup', async () => {
      const originalOn = process.on;
      const { workers, loaders } = makeLoaders();
      workers['ai-worker'].start.mockRejectedValue(new Error('boom'));

      await expect(startCombinedWorker({ loaders, env, logger: silent, exit })).rejects.toThrow();

      expect(process.on).toBe(originalOn);
      expect(listenerCounts()).toEqual(baseline);
    });
  });

  describe('onShutdown hook', () => {
    it('runs after the workers stopped and before exit', async () => {
      const { workers, loaders } = makeLoaders();
      const order: string[] = [];
      workers['ai-worker'].stop.mockImplementation(async () => void order.push('stop'));
      exit.mockImplementation(() => order.push('exit'));
      const onShutdown = vi.fn(async () => void order.push('flush'));

      const started = await startCombinedWorker({ loaders, env, logger: silent, exit, onShutdown });
      await started.shutdown('test');

      expect(order).toEqual(['stop', 'flush', 'exit']);
    });

    it('logs a failing hook but still exits cleanly', async () => {
      const { loaders } = makeLoaders();
      const onShutdown = vi.fn().mockRejectedValue(new Error('flush failed'));

      const started = await startCombinedWorker({ loaders, env, logger: silent, exit, onShutdown });
      await started.shutdown('test');

      expect(exit).toHaveBeenCalledWith(0);
    });
  });

  it('uses the default logger and process.exit when none are injected', async () => {
    const { loaders } = makeLoaders();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    const started = await startCombinedWorker({ loaders, env });
    await started.shutdown('test');

    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
