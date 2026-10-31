import { describe, expect, it, vi } from 'vitest';
import { createBackgroundJobsWorker, type ApiBackgroundJobsModule } from '../background-jobs';

function makeModule(started = { approvalSweep: true, bounceScan: true, dsarSla: true }) {
  const mod: ApiBackgroundJobsModule = {
    startBackgroundJobs: vi.fn(() => started),
    stopBackgroundJobs: vi.fn(async () => undefined),
    checkBackgroundJobsHealth: vi.fn(async () => ({ status: 'ok' as const })),
  };
  return mod;
}

describe('createBackgroundJobsWorker', () => {
  it('is idle until started and does not import the api before then', () => {
    const load = vi.fn(async () => makeModule());
    const worker = createBackgroundJobsWorker(load, { info: vi.fn() });

    expect(worker.getStatus()).toEqual({ state: 'idle' });
    expect(load).not.toHaveBeenCalled();
  });

  it('start loads the api module, starts the jobs and reports running', async () => {
    const mod = makeModule();
    const info = vi.fn();
    const worker = createBackgroundJobsWorker(async () => mod, { info });

    await worker.start();

    expect(mod.startBackgroundJobs).toHaveBeenCalledTimes(1);
    expect(worker.getStatus()).toEqual({ state: 'running' });
    expect(info).toHaveBeenCalledWith(
      '[background-jobs] approval-sweep=on email-bounce-scan=on dsar-sla=on'
    );
  });

  it('logs a job its scheduler declined to start (interval 0)', async () => {
    const info = vi.fn();
    const worker = createBackgroundJobsWorker(
      async () => makeModule({ approvalSweep: false, bounceScan: true, dsarSla: false }),
      { info }
    );

    await worker.start();

    expect(info).toHaveBeenCalledWith(
      '[background-jobs] approval-sweep=off email-bounce-scan=on dsar-sla=off'
    );
  });

  it('stop stops the jobs and reports stopped', async () => {
    const mod = makeModule();
    const worker = createBackgroundJobsWorker(async () => mod, { info: vi.fn() });
    await worker.start();

    await worker.stop();

    expect(mod.stopBackgroundJobs).toHaveBeenCalledTimes(1);
    expect(worker.getStatus()).toEqual({ state: 'stopped' });
  });

  it('stop before start is a no-op that still reports stopped', async () => {
    const worker = createBackgroundJobsWorker(async () => makeModule(), { info: vi.fn() });

    await expect(worker.stop()).resolves.toBeUndefined();
    expect(worker.getStatus()).toEqual({ state: 'stopped' });
  });

  it('start rejects (so the combined runtime fails fast) when the api module cannot load', async () => {
    const worker = createBackgroundJobsWorker(
      async () => {
        throw new Error('Cannot find module');
      },
      { info: vi.fn() }
    );

    await expect(worker.start()).rejects.toThrow('Cannot find module');
    expect(worker.getStatus()).toEqual({ state: 'idle' });
  });

  it('stop waits for the api to finish its in-flight tick', async () => {
    let finish!: () => void;
    const mod = makeModule();
    mod.stopBackgroundJobs = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const worker = createBackgroundJobsWorker(async () => mod, { info: vi.fn() });
    await worker.start();

    let stopped = false;
    const stopping = worker.stop().then(() => (stopped = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stopped).toBe(false);
    expect(worker.getStatus()).toEqual({ state: 'running' });

    finish();
    await stopping;
    expect(worker.getStatus()).toEqual({ state: 'stopped' });
  });

  it('checkHealth is an error before start and after stop', async () => {
    const worker = createBackgroundJobsWorker(async () => makeModule(), { info: vi.fn() });
    expect(await worker.checkHealth!()).toEqual({
      timers: { status: 'error', message: 'background jobs are idle' },
    });

    await worker.start();
    await worker.stop();
    expect((await worker.checkHealth!()).timers.status).toBe('error');
  });

  it('checkHealth is ok while running with a fresh heartbeat', async () => {
    const worker = createBackgroundJobsWorker(async () => makeModule(), { info: vi.fn() });
    await worker.start();

    expect(await worker.checkHealth!()).toEqual({
      timers: { status: 'ok' },
      heartbeat: { status: 'ok' },
    });
  });

  it('checkHealth reports degraded (never error) when no sweep has ticked', async () => {
    const mod = makeModule();
    mod.checkBackgroundJobsHealth = vi.fn(async () => ({
      status: 'degraded' as const,
      message: 'No tick from approvalSweep',
    }));
    const worker = createBackgroundJobsWorker(async () => mod, { info: vi.fn() });
    await worker.start();

    expect(await worker.checkHealth!()).toEqual({
      timers: { status: 'ok' },
      heartbeat: { status: 'degraded', message: 'No tick from approvalSweep' },
    });
  });

  it('checkHealth passes an unknown heartbeat through as ok with its message', async () => {
    const mod = makeModule();
    mod.checkBackgroundJobsHealth = vi.fn(async () => ({
      status: 'unknown' as const,
      message: 'REDIS_HOST is not set',
    }));
    const worker = createBackgroundJobsWorker(async () => mod, { info: vi.fn() });
    await worker.start();

    expect((await worker.checkHealth!()).heartbeat).toEqual({
      status: 'ok',
      message: 'REDIS_HOST is not set',
    });
  });

  it('checkHealth degrades when the heartbeat read throws', async () => {
    const mod = makeModule();
    mod.checkBackgroundJobsHealth = vi.fn(async () => {
      throw new Error('redis down');
    });
    const worker = createBackgroundJobsWorker(async () => mod, { info: vi.fn() });
    await worker.start();

    expect((await worker.checkHealth!()).heartbeat).toEqual({
      status: 'degraded',
      message: 'redis down',
    });
  });

  it('checkHealth stringifies a non-Error heartbeat failure', async () => {
    const mod = makeModule();
    mod.checkBackgroundJobsHealth = vi.fn(() => Promise.reject('plain'));
    const worker = createBackgroundJobsWorker(async () => mod, { info: vi.fn() });
    await worker.start();

    expect((await worker.checkHealth!()).heartbeat?.message).toBe('plain');
  });

  it('defaults the logger to console', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const worker = createBackgroundJobsWorker(async () => makeModule());

    await worker.start();

    expect(spy).toHaveBeenCalled();
  });
});
