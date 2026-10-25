import { beforeEach, describe, expect, it, vi } from 'vitest';

const startCombinedWorker = vi.hoisted(() => vi.fn());
const aiStart = vi.hoisted(() => vi.fn());

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
}));
vi.mock('@intelliflow/events-worker', () => ({ eventsWorker: { name: 'events-instance' } }));
vi.mock('@intelliflow/ingestion-worker', () => ({
  ingestionWorker: { name: 'ingestion-instance' },
}));

import { defaultLoaders, main } from '../main';

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

  it('starts the combined runtime with the default loaders', async () => {
    startCombinedWorker.mockResolvedValue({});

    await main();

    expect(startCombinedWorker).toHaveBeenCalledWith({ loaders: defaultLoaders });
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
