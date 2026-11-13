/**
 * IFC-097: BaseWorker.handleJob runs every job inside runConsumerJob, so each job is one
 * CONSUMER span that continues the producer's trace. The span itself is tested in
 * packages/observability/src/consumer-span.test.ts; this checks the wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runConsumerJob } = vi.hoisted(() => ({
  runConsumerJob: vi.fn(
    (_job: unknown, fn: () => Promise<unknown>, _options?: unknown): Promise<unknown> => fn()
  ),
}));

vi.mock('@intelliflow/observability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/observability')>()),
  runConsumerJob,
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
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
  QueueEvents: class {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

import { BaseWorker, type ComponentHealth } from '../base-worker';
import { isExpectedJobOutcome } from '../job-outcome';

class EchoWorker extends BaseWorker<{ value: string }, string> {
  inSpan = false;
  constructor() {
    super({ name: 'events-worker', queues: ['outbox-events'] });
  }
  protected async onStart(): Promise<void> {}
  protected async onStop(): Promise<void> {}
  protected async processJob(job: { data: { value: string } }): Promise<string> {
    this.inSpan = runConsumerJob.mock.calls.length > 0;
    return job.data.value;
  }
  protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
    return {};
  }
}

const handleJobOf = (worker: EchoWorker) =>
  (worker as unknown as { handleJob: (job: unknown) => Promise<string> }).handleJob.bind(worker);

describe('BaseWorker.handleJob consumer span', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development'); // a valid worker config, as in base-worker.test
    runConsumerJob.mockClear();
  });

  it('runs processJob inside runConsumerJob with the job, worker and carrier', async () => {
    const worker = new EchoWorker();
    const data = {
      value: 'v',
      _otelCarrier: { traceparent: '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-01' },
    };
    const job = { id: 'j7', name: 'dispatch', queueName: 'outbox-events', data, attemptsMade: 2 };

    await expect(handleJobOf(worker)(job)).resolves.toBe('v');

    expect(worker.inSpan).toBe(true);
    expect(runConsumerJob).toHaveBeenCalledTimes(1);
    expect(runConsumerJob.mock.calls[0]![0]).toEqual({
      queueName: 'outbox-events',
      jobName: 'dispatch',
      jobId: 'j7',
      attempt: 3,
      workerName: 'events-worker',
      data,
    });
    expect(runConsumerJob.mock.calls[0]![2]).toEqual({ isExpectedError: isExpectedJobOutcome });
  });

  it('still counts and rethrows a failure raised inside the span', async () => {
    const worker = new EchoWorker();
    runConsumerJob.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await expect(
      handleJobOf(worker)({ id: 'j8', queueName: 'outbox-events', data: {}, attemptsMade: 0 })
    ).rejects.toThrow('boom');
    expect(worker.getStatus()).toMatchObject({ failedJobs: 1 });
  });
});
