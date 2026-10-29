import { beforeEach, describe, expect, it, vi } from 'vitest';

const startCombinedWorker = vi.hoisted(() => vi.fn());
const aiStart = vi.hoisted(() => vi.fn());
const sdk = vi.hoisted(() => ({
  get: vi.fn(() => 'sdk-instance'),
  shutdown: vi.fn(async () => undefined),
}));

vi.mock('../combined', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../combined')>()),
  startCombinedWorker,
}));

// The real workers pull in Prisma, BullMQ and OpenTelemetry; only their
// export shape matters here.
vi.mock('@intelliflow/ai-worker', () => ({
  AIWorker: class {
    start = aiStart;
  },
  getSDKInstance: sdk.get,
  shutdownOpenTelemetry: sdk.shutdown,
}));
vi.mock('@intelliflow/events-worker', () => ({ eventsWorker: { name: 'events-instance' } }));
vi.mock('@intelliflow/ingestion-worker', () => ({
  ingestionWorker: { name: 'ingestion-instance' },
}));

import { defaultLoaders, flushOpenTelemetry, isAiWorkerLoaded, main } from '../main';

describe('combined-worker main', () => {
  beforeEach(() => {
    startCombinedWorker.mockReset();
  });

  it('loads a fresh AIWorker and the exported events/ingestion instances', async () => {
    const ai = await defaultLoaders['ai-worker']();
    expect(ai).toHaveProperty('start', aiStart);
    expect(await defaultLoaders['events-worker']()).toEqual({ name: 'events-instance' });
    expect(await defaultLoaders['ingestion-worker']()).toEqual({ name: 'ingestion-instance' });
  });

  it('loads the api background jobs lazily, only when the loader runs', async () => {
    const start = vi.fn(() => ({ approvalSweep: true, bounceScan: true }));
    const stop = vi.fn();
    vi.doMock('@intelliflow/api/dist/background-jobs.js', () => ({
      startBackgroundJobs: start,
      stopBackgroundJobs: stop,
    }));
    try {
      const worker = await defaultLoaders['background-jobs']!();
      expect(start).not.toHaveBeenCalled();
      await worker.start();
      expect(start).toHaveBeenCalledTimes(1);
      await worker.stop();
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock('@intelliflow/api/dist/background-jobs.js');
    }
  });

  it('starts the combined runtime with the default loaders', async () => {
    startCombinedWorker.mockResolvedValue({});

    await main();

    expect(startCombinedWorker).toHaveBeenCalledWith({
      loaders: defaultLoaders,
      onShutdown: flushOpenTelemetry,
    });
  });

  it('flushes ai-worker OpenTelemetry on shutdown once ai-worker was loaded', async () => {
    await defaultLoaders['ai-worker']();

    await flushOpenTelemetry();

    expect(sdk.shutdown).toHaveBeenCalledWith('sdk-instance');
  });

  it('flushes whenever an SDK exists, even if only another worker lazily loaded ai-worker', async () => {
    await flushOpenTelemetry(() => true);

    expect(sdk.shutdown).toHaveBeenCalledWith('sdk-instance');
  });

  it('does nothing when ai-worker was never loaded', async () => {
    await flushOpenTelemetry(() => false);

    expect(sdk.shutdown).not.toHaveBeenCalled();
  });

  it('does nothing when ai-worker has no SDK instance', async () => {
    sdk.get.mockReturnValue(null as never);

    await flushOpenTelemetry(() => true);

    expect(sdk.shutdown).not.toHaveBeenCalled();
  });

  it('detects ai-worker through the loader flag, and reports false on a fresh process', async () => {
    vi.resetModules();
    const fresh = await import('../main');
    expect(fresh.isAiWorkerLoaded()).toBe(false);

    await fresh.defaultLoaders['ai-worker']();
    expect(fresh.isAiWorkerLoaded()).toBe(true);
    expect(isAiWorkerLoaded).toBeTypeOf('function');
  });

  it('exits 1 when startup fails', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    startCombinedWorker.mockRejectedValue(new Error('Worker events-worker failed to start'));

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 on a non-Error rejection', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    startCombinedWorker.mockRejectedValue('plain');

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
