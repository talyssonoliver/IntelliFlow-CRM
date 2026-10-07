/**
 * createSerialJobWorker + the three scheduled jobs that use it.
 *
 * Each job must get a one-at-a-time Worker with the shared idle drainDelay
 * (30 s by default, BullMQ's own default is 5 s), and log failures with its label.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workerInstances: Array<{
  name: string;
  processor: (job: unknown) => Promise<unknown>;
  opts: Record<string, unknown>;
  handlers: Record<string, (...args: unknown[]) => void>;
}> = [];

vi.mock('bullmq', () => {
  class Worker {
    handlers: Record<string, (...args: unknown[]) => void> = {};
    constructor(
      name: string,
      processor: (job: unknown) => Promise<unknown>,
      opts: Record<string, unknown>
    ) {
      workerInstances.push({ name, processor, opts, handlers: this.handlers });
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers[event] = handler;
      return this;
    }
    close = vi.fn().mockResolvedValue(undefined);
  }
  class Queue {
    close = vi.fn().mockResolvedValue(undefined);
  }
  class QueueEvents {
    close = vi.fn().mockResolvedValue(undefined);
  }
  return { Worker, Queue, QueueEvents };
});

import { createSerialJobWorker } from '../serial-job-worker';
import { CaseDeadlineMonitorWorker } from '../case-deadline-monitor.job';
import { TicketAutoCloseWorker } from '../ticket-auto-close.job';
import { TicketSlaMonitorWorker } from '../ticket-sla-monitor.job';

const connection = { host: 'localhost', port: 6379 };

describe('createSerialJobWorker', () => {
  const saved = process.env.QUEUE_DRAIN_DELAY_SECONDS;

  beforeEach(() => {
    workerInstances.length = 0;
    delete process.env.QUEUE_DRAIN_DELAY_SECONDS;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.QUEUE_DRAIN_DELAY_SECONDS;
    else process.env.QUEUE_DRAIN_DELAY_SECONDS = saved;
    vi.restoreAllMocks();
  });

  it('builds a one-at-a-time worker that idles for 30 s between checks', async () => {
    const process = vi.fn().mockResolvedValue('done');
    createSerialJobWorker('q-test', process, connection, 'test-job');

    const w = workerInstances[0];
    expect(w.name).toBe('q-test');
    expect(w.opts).toEqual({ connection, concurrency: 1, drainDelay: 30 });
    await expect(w.processor({ id: 'j1' })).resolves.toBe('done');
    expect(process).toHaveBeenCalledWith({ id: 'j1' });
  });

  it('logs failures with the job label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createSerialJobWorker('q-test', vi.fn(), connection, 'test-job');

    workerInstances[0].handlers.failed({ id: 'j9' }, new Error('boom'));

    expect(warn).toHaveBeenCalledWith('[test-job] job j9 failed:', 'boom');
  });

  it.each([
    ['case-deadline-monitor', CaseDeadlineMonitorWorker],
    ['ticket-auto-close', TicketAutoCloseWorker],
    ['ticket-sla-monitor', TicketSlaMonitorWorker],
  ] as const)('%s starts a serial worker that runs its own process()', async (label, JobWorker) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const job = new JobWorker({} as never, connection, {} as never);
    const processSpy = vi.spyOn(job, 'process').mockResolvedValue({} as never);

    await job.start();

    const w = workerInstances[0];
    expect(w.opts).toEqual({ connection, concurrency: 1, drainDelay: 30 });
    await w.processor({ id: 'j1' });
    expect(processSpy).toHaveBeenCalledWith({ id: 'j1' });
    w.handlers.failed({ id: 'j2' }, new Error('x'));
    expect(warn).toHaveBeenCalledWith(`[${label}] job j2 failed:`, 'x');

    await job.stop();
  });
});
