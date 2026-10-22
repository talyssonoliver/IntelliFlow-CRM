/**
 * PG-203 — enqueueLeadScoring, extracted from lead.router create so the public
 * booking flow queues AI scoring exactly like an in-app lead (owner Q8/Q9).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const add = vi.fn();
const on = vi.fn();
const Queue = vi.fn(function (this: Record<string, unknown>, name: string, opts: unknown) {
  this.name = name;
  this.opts = opts;
  this.add = add;
  this.on = on;
});

vi.mock('../../../lib/load-bullmq', () => ({ loadBullMQ: vi.fn(async () => ({ Queue })) }));
vi.mock('@intelliflow/platform/queues/types', () => ({
  QUEUE_NAMES: { AI_SCORING: 'ai-scoring' },
}));
const getDefaultConnectionConfig = vi.fn(() => ({
  host: 'redis.example.invalid',
  port: 6380,
  db: 2,
  tls: true,
}));
vi.mock('@intelliflow/platform/queues/connection', () => ({ getDefaultConnectionConfig }));

import { loadBullMQ } from '../../../lib/load-bullmq';

import type * as EnqueueModule from '../lead-scoring-enqueue';

let enqueueLeadScoring: typeof EnqueueModule.enqueueLeadScoring;

const input = {
  leadId: 'lead-1',
  tenantId: 'tenant-1',
  lead: {
    email: 'ada@example.invalid',
    source: 'BOOKING',
    firstName: 'Ada',
    lastName: 'Lovelace',
    company: undefined,
    title: undefined,
    phone: undefined,
  },
  correlationId: 'lead-create-lead-1',
};

describe('enqueueLeadScoring', () => {
  beforeEach(async () => {
    add.mockReset().mockResolvedValue(undefined);
    on.mockReset();
    Queue.mockClear();
    // A fresh module per test: the queue is process-wide by design.
    vi.resetModules();
    ({ enqueueLeadScoring } = await import('../lead-scoring-enqueue.js'));
  });

  it('adds a score-lead job to the AI scoring queue with the lead payload and an OTel carrier', async () => {
    await enqueueLeadScoring(input);
    // The shared worker connection settings, TLS and db included, failing fast (codex).
    expect(Queue).toHaveBeenCalledWith('ai-scoring', {
      connection: {
        host: 'redis.example.invalid',
        port: 6380,
        password: undefined,
        db: 2,
        tls: {},
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
    });
    expect(add).toHaveBeenCalledWith('score-lead', {
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      lead: input.lead,
      correlationId: 'lead-create-lead-1',
      _otelCarrier: expect.any(Object),
    });
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('reuses one queue across calls, also after Redis rejected an add (codex: no leaked clients)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    add.mockRejectedValueOnce(new Error('redis down'));
    await enqueueLeadScoring(input);
    await enqueueLeadScoring(input);
    await enqueueLeadScoring(input);
    expect(Queue).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(3);
    // Connection errors are logged by class only, at most once a minute.
    const onError = on.mock.calls[0]![1] as (e: Error) => void;
    warn.mockClear();
    onError(new Error('ECONNREFUSED 127.0.0.1'));
    onError(new Error('ECONNREFUSED 127.0.0.1'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('127.0.0.1');
    warn.mockRestore();
  });

  it('refuses new calls while 50 earlier adds are still unsettled (bounded during an outage)', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      let release: () => void = () => {};
      const stuck = new Promise<void>((resolve) => {
        release = resolve;
      });
      add.mockReturnValue(stuck);
      const calls = Array.from({ length: 50 }, () => enqueueLeadScoring(input));
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.all(calls); // each gave up waiting, but its add is still pending
      expect(add).toHaveBeenCalledTimes(50);
      await enqueueLeadScoring(input);
      expect(add).toHaveBeenCalledTimes(50);
      expect(JSON.stringify(warn.mock.calls.at(-1))).toContain('still waiting on Redis');
      // Once Redis answers, the slots are free again.
      release();
      await vi.advanceTimersByTimeAsync(0);
      add.mockResolvedValue(undefined);
      await enqueueLeadScoring(input);
      expect(add).toHaveBeenCalledTimes(51);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('gives up on an add that never settles instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      add.mockReturnValueOnce(new Promise(() => {}));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pending = enqueueLeadScoring(input);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toBeUndefined();
      expect(JSON.stringify(warn.mock.calls[0])).toContain('timed out');
      warn.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never throws: a queue failure is logged without PII and swallowed', async () => {
    add.mockRejectedValueOnce(new Error('redis down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enqueueLeadScoring(input)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).toContain('lead-1');
    expect(logged).not.toContain('ada@example.invalid');
    warn.mockRestore();
  });

  it('swallows a failure to load BullMQ too, and tries again on the next call', async () => {
    vi.mocked(loadBullMQ).mockRejectedValueOnce(new Error('no bullmq'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enqueueLeadScoring(input)).resolves.toBeUndefined();
    await enqueueLeadScoring(input);
    expect(add).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
