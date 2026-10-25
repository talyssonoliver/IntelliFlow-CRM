import { describe, expect, it, vi } from 'vitest';
import { createBackgroundJobsWorker, type ApiBackgroundJobsModule } from '../background-jobs';

function makeModule(started = { approvalSweep: true, bounceScan: true }) {
  const mod: ApiBackgroundJobsModule = {
    startBackgroundJobs: vi.fn(() => started),
    stopBackgroundJobs: vi.fn(),
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
    expect(info).toHaveBeenCalledWith('[background-jobs] approval-sweep=on email-bounce-scan=on');
  });

  it('logs a job its scheduler declined to start (interval 0)', async () => {
    const info = vi.fn();
    const worker = createBackgroundJobsWorker(
      async () => makeModule({ approvalSweep: false, bounceScan: true }),
      { info }
    );

    await worker.start();

    expect(info).toHaveBeenCalledWith('[background-jobs] approval-sweep=off email-bounce-scan=on');
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

  it('checkHealth is ok while running and an error otherwise', async () => {
    const worker = createBackgroundJobsWorker(async () => makeModule(), { info: vi.fn() });
    expect(await worker.checkHealth!()).toEqual({
      timers: { status: 'error', message: 'background jobs are idle' },
    });

    await worker.start();
    expect(await worker.checkHealth!()).toEqual({ timers: { status: 'ok' } });

    await worker.stop();
    expect((await worker.checkHealth!()).timers.status).toBe('error');
  });

  it('defaults the logger to console', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const worker = createBackgroundJobsWorker(async () => makeModule());

    await worker.start();

    expect(spy).toHaveBeenCalled();
  });
});
