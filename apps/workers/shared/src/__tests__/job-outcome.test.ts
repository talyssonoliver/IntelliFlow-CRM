/**
 * #1242: a job failure marked as an expected outcome is logged as a warning by both shared
 * logging paths (BaseWorker.handleJob and QueueConnector's worker `failed` listener), so it
 * does not raise error-level alerts. A real failure stays at error level.
 */
import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';

const { workerHandlers } = vi.hoisted(() => ({
  workerHandlers: new Map<string, (...args: unknown[]) => void>(),
}));

vi.mock('ioredis', () => ({
  default: class {
    on = vi.fn();
    quit = vi.fn().mockResolvedValue(undefined);
    status = 'ready';
  },
}));
vi.mock('bullmq', () => ({
  Queue: class {
    close = vi.fn().mockResolvedValue(undefined);
  },
  Worker: class {
    on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      workerHandlers.set(event, handler);
    });
    close = vi.fn().mockResolvedValue(undefined);
  },
  QueueEvents: class {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

import { isExpectedJobOutcome, markExpectedJobOutcome } from '../job-outcome';
import { QueueConnector } from '../queue-connector';
import { BaseWorker, type ComponentHealth } from '../base-worker';

function spyLogger() {
  const logger = pino({ level: 'silent' });
  const warn = vi.spyOn(logger, 'warn');
  const error = vi.spyOn(logger, 'error');
  return { logger, warn, error };
}

const expected = () => markExpectedJobOutcome(new Error('Lead scoring failed (inconclusive)'));

describe('expected job outcomes', () => {
  it('are recognised only when marked', () => {
    expect(isExpectedJobOutcome(expected())).toBe(true);
    expect(isExpectedJobOutcome(new Error('provider down'))).toBe(false);
    expect(isExpectedJobOutcome(null)).toBe(false);
  });

  it("are a warning in QueueConnector's worker failed listener; a fault stays an error", () => {
    const { logger, warn, error } = spyLogger();
    const connector = new QueueConnector({
      redis: { host: 'localhost', port: 6379, db: 0, lazyConnect: true } as never,
      queue: { concurrency: 1 } as never,
      logger,
    });
    // No Redis in this test: the worker is a mock that only records its event handlers.
    vi.spyOn(
      connector as unknown as { getBullConnection: () => unknown },
      'getBullConnection'
    ).mockReturnValue({});
    connector.createWorker('ai-scoring', async () => undefined);
    const failed = workerHandlers.get('failed')!;

    failed({ id: 'j1' }, expected());
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'j1' }),
      expect.stringContaining('expected outcome')
    );
    expect(error).not.toHaveBeenCalled();

    failed({ id: 'j2' }, new Error('provider down'));
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'j2' }), 'Job failed');
  });

  it('are a warning in BaseWorker.handleJob; a fault stays an error', async () => {
    vi.stubEnv('NODE_ENV', 'development'); // a valid worker config, as in base-worker.test
    class ThrowingWorker extends BaseWorker<unknown, unknown> {
      failure: Error = expected();
      constructor() {
        super({ name: 'test-worker', queues: ['test-queue'] });
      }
      protected async onStart(): Promise<void> {}
      protected async onStop(): Promise<void> {}
      protected async processJob(): Promise<unknown> {
        throw this.failure;
      }
      protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
        return {};
      }
    }
    const worker = new ThrowingWorker();
    const child = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.spyOn((worker as unknown as { logger: pino.Logger }).logger, 'child').mockReturnValue(
      child as never
    );
    const handleJob = (
      worker as unknown as { handleJob: (job: unknown) => Promise<unknown> }
    ).handleJob.bind(worker);
    const job = { id: 'j1', queueName: 'test-queue', data: {}, attemptsMade: 0 };

    await expect(handleJob(job)).rejects.toThrow('inconclusive');
    expect(child.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1 }),
      expect.stringContaining('expected outcome')
    );
    expect(child.error).not.toHaveBeenCalled();

    worker.failure = new Error('provider down');
    await expect(handleJob(job)).rejects.toThrow('provider down');
    expect(child.error).toHaveBeenCalledWith(expect.anything(), 'Job failed');
  });
});
