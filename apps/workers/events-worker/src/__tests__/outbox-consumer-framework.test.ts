/**
 * IFC-151: the outbox consumer framework.
 *
 * - idempotent retries: a handler that succeeded is recorded and skipped on retry
 * - poison messages: dead-lettered at once, no retries
 * - metrics: one outcome per dispatch attempt
 * - chaos: seeded random handler failures; every event ends published or dead-lettered,
 *   no handler runs twice for one event, retry success > 90%, DLQ drain > 95%
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { OutboxPoller, InMemoryOutboxRepository } from '../outbox/pollOutbox';
import {
  EventDispatcher,
  PoisonMessageError,
  isPoisonMessage,
  type OutboxEvent,
} from '../outbox/event-dispatcher';
import type { OutboxMetrics, OutboxOutcome } from '@intelliflow/worker-shared';

const logger = pino({ level: 'silent' });

const makeEvent = (id: string, eventType = 'lead.created', retryCount = 0): OutboxEvent => ({
  id,
  eventType,
  aggregateType: 'Lead',
  aggregateId: `lead-${id}`,
  payload: {},
  metadata: { correlationId: `c-${id}`, timestamp: '2026-11-12T00:00:00.000Z', version: '1.0' },
  status: 'pending',
  retryCount,
  createdAt: new Date(),
});

function recordingMetrics() {
  const outcomes: Array<[OutboxOutcome, string]> = [];
  const metrics: OutboxMetrics = {
    recordDispatch: (outcome, eventType, durationMs) => {
      expect(durationMs).toBeGreaterThanOrEqual(0);
      outcomes.push([outcome, eventType]);
    },
  };
  return { outcomes, metrics };
}

/** Deterministic PRNG (mulberry32), so the chaos run is the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('EventDispatcher (IFC-151)', () => {
  it('skips handlers that already succeeded and reports what ran', async () => {
    const d = new EventDispatcher(logger);
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    d.register('lead.created', a, 'a');
    d.register('lead.*', b, 'b');

    const result = await d.dispatch(makeEvent('1'), { alreadyHandled: new Set(['a']) });

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ran: ['b'], skipped: ['a'] });
  });

  it('records each success, even when another handler fails', async () => {
    const d = new EventDispatcher(logger);
    d.register('lead.created', vi.fn().mockResolvedValue(undefined), 'ok');
    d.register('lead.created', vi.fn().mockRejectedValue(new Error('down')), 'bad');
    const onHandled = vi.fn().mockResolvedValue(undefined);

    await expect(d.dispatch(makeEvent('1'), { onHandled })).rejects.toThrow('down');
    expect(onHandled.mock.calls).toEqual([['ok']]);
  });

  it('reports a poison failure ahead of an ordinary one', async () => {
    const d = new EventDispatcher(logger);
    d.register('lead.created', vi.fn().mockRejectedValue(new Error('transient')), 'x');
    d.register(
      'lead.created',
      vi.fn().mockRejectedValue(new PoisonMessageError('bad payload')),
      'y'
    );

    const error = await d.dispatch(makeEvent('1')).catch((e: unknown) => e);
    expect(isPoisonMessage(error)).toBe(true);
    expect((error as Error).message).toBe('bad payload');
  });

  it('gives colliding handler names a unique suffix and frees them on unregister', async () => {
    const d = new EventDispatcher(logger);
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    d.register('lead.created', first);
    d.register('lead.created', second);

    const result = await d.dispatch(makeEvent('1'), {
      alreadyHandled: new Set(['handler-lead.created']),
    });
    expect(result).toEqual({ ran: ['handler-lead.created#2'], skipped: ['handler-lead.created'] });
    expect(first).not.toHaveBeenCalled();

    d.unregister('lead.created');
    d.register('lead.created', first);
    expect((await d.dispatch(makeEvent('2'))).ran).toEqual(['handler-lead.created']);
  });

  it('frees names of wildcard and aggregate handlers on unregister', async () => {
    const d = new EventDispatcher(logger);
    d.register('*', vi.fn().mockResolvedValue(undefined), 'all');
    d.register('lead.*', vi.fn().mockResolvedValue(undefined), 'leads');
    d.unregister('*');
    d.unregister('lead.*');
    d.register('*', vi.fn().mockResolvedValue(undefined), 'all');
    d.register('lead.*', vi.fn().mockResolvedValue(undefined), 'leads');
    expect((await d.dispatch(makeEvent('1'))).ran.sort()).toEqual(['all', 'leads']);
  });

  it('returns an empty result when nothing handles the event', async () => {
    expect(await new EventDispatcher(logger).dispatch(makeEvent('1'))).toEqual({
      ran: [],
      skipped: [],
    });
  });

  it('isPoisonMessage recognises the class and the poison flag only', () => {
    expect(isPoisonMessage(new PoisonMessageError('x'))).toBe(true);
    expect(isPoisonMessage(Object.assign(new Error('copy'), { poison: true }))).toBe(true);
    expect(isPoisonMessage(new Error('x'))).toBe(false);
    expect(isPoisonMessage('poison')).toBe(false);
    expect(new PoisonMessageError('x', { cause: 'c' }).cause).toBe('c');
  });
});

describe('OutboxPoller consumer framework (IFC-151)', () => {
  let repository: InMemoryOutboxRepository;
  let dispatcher: EventDispatcher;
  let poller: OutboxPoller;
  let outcomes: Array<[OutboxOutcome, string]>;

  const start = async (overrides: Partial<ConstructorParameters<typeof OutboxPoller>[0]> = {}) => {
    const m = recordingMetrics();
    outcomes = m.outcomes;
    poller = new OutboxPoller({
      config: {
        pollIntervalMs: 10,
        maxPollIntervalMs: 10,
        retryBackoff: [100, 100, 100],
        maxRetries: 3,
      },
      repository,
      dispatcher,
      logger,
      metrics: m.metrics,
      random: () => 0.5,
      ...overrides,
    });
    await poller.start();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    repository = new InMemoryOutboxRepository();
    dispatcher = new EventDispatcher(logger);
  });

  afterEach(async () => {
    await poller?.stop();
    vi.useRealTimers();
  });

  it('a retry runs only the handler that failed', async () => {
    const ok = vi.fn().mockResolvedValue(undefined);
    const flaky = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined);
    dispatcher.register('lead.created', ok, 'ok');
    dispatcher.register('lead.created', flaky, 'flaky');
    await repository.addEvent(makeEvent('1'));

    await start();
    await vi.advanceTimersByTimeAsync(500);

    expect(ok).toHaveBeenCalledTimes(1);
    expect(flaky).toHaveBeenCalledTimes(2);
    const event = await repository.getEventById('1');
    expect(event?.status).toBe('published');
    expect(event?.metadata.handledBy?.sort()).toEqual(['flaky', 'ok']);
    expect(outcomes).toEqual([
      ['retried', 'lead.created'],
      ['published', 'lead.created'],
    ]);
  });

  it('dead-letters a poison message at once, without retries', async () => {
    const handler = vi.fn().mockRejectedValue(new PoisonMessageError('missing leadId'));
    dispatcher.register('lead.created', handler, 'h');
    await repository.addEvent(makeEvent('1'));

    await start();
    await vi.advanceTimersByTimeAsync(500);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(repository.getDLQCount()).toBe(1);
    const [entry] = await repository.listDeadLetters();
    expect(entry!.error).toBe('poison: missing leadId');
    expect(poller.getStats()).toMatchObject({ poisoned: 1, dlq: 1, failed: 0 });
    expect(outcomes).toEqual([['poisoned', 'lead.created']]);
  });

  it('dead-letters after the retries are used up and counts it', async () => {
    dispatcher.register('lead.created', vi.fn().mockRejectedValue('string failure'), 'h');
    await repository.addEvent(makeEvent('1'));

    await start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(repository.getDLQCount()).toBe(1);
    expect(outcomes.map((o) => o[0])).toEqual(['retried', 'retried', 'dead_lettered']);
  });

  it('a metrics failure never changes what happens to the event', async () => {
    dispatcher.register('lead.created', vi.fn().mockResolvedValue(undefined), 'h');
    await repository.addEvent(makeEvent('1'));

    await start({
      metrics: {
        recordDispatch: () => {
          throw new Error('meter down');
        },
      },
    });
    await vi.advanceTimersByTimeAsync(50);

    expect((await repository.getEventById('1'))?.status).toBe('published');
  });

  it('works with a repository that cannot record handlers (every handler re-runs)', async () => {
    const ok = vi.fn().mockResolvedValue(undefined);
    dispatcher.register('lead.created', ok, 'ok');
    dispatcher.register(
      'lead.created',
      vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined),
      'flaky'
    );
    await repository.addEvent(makeEvent('1'));
    const plain = Object.assign(Object.create(repository), { recordHandled: undefined });

    await start({ repository: plain });
    await vi.advanceTimersByTimeAsync(500);

    expect(ok).toHaveBeenCalledTimes(2);
    expect((await repository.getEventById('1'))?.status).toBe('published');
  });

  it('a replayed dead letter re-runs only the handlers that never succeeded', async () => {
    const ok = vi.fn().mockResolvedValue(undefined);
    let broken = true;
    const flaky = vi.fn(async () => {
      if (broken) throw new Error('down');
    });
    dispatcher.register('lead.created', ok, 'ok');
    dispatcher.register('lead.created', flaky, 'flaky');
    await repository.addEvent(makeEvent('1'));

    await start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(repository.getDLQCount()).toBe(1);

    broken = false;
    expect(await repository.requeueDeadLetter('1')).toBe(true);
    expect(await repository.requeueDeadLetter('1')).toBe(false);
    await vi.advanceTimersByTimeAsync(200);

    expect(ok).toHaveBeenCalledTimes(1);
    expect((await repository.getEventById('1'))?.status).toBe('published');
    expect((await repository.getEventById('1'))?.lastError).toContain('replayed after');
  });
});

describe('chaos: seeded random handler failures (IFC-151 KPIs)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('every event ends published or dead-lettered; retry success > 90%; DLQ drain > 95%', async () => {
    vi.useFakeTimers();
    const random = seeded(151);
    const EVENTS = 400;
    const FAILURE_RATE = 0.2; // per handler call, transient
    const POISON_EVERY = 25; // 4% of events are unprocessable

    const repository = new InMemoryOutboxRepository();
    const dispatcher = new EventDispatcher(logger);
    const runs = new Map<string, number>(); // `${eventId}:${handler}` -> successful runs
    let chaos = true;

    for (const name of ['audit', 'notify']) {
      dispatcher.register(
        '*',
        async (event) => {
          if (Number(event.id) % POISON_EVERY === 0) throw new PoisonMessageError('bad payload');
          if (chaos && random() < FAILURE_RATE) throw new Error(`${name} transient`);
          const key = `${event.id}:${name}`;
          runs.set(key, (runs.get(key) ?? 0) + 1);
        },
        name
      );
    }
    for (let i = 1; i <= EVENTS; i++)
      await repository.addEvent(makeEvent(String(i), 'lead.updated'));

    const { outcomes, metrics } = recordingMetrics();
    const poller = new OutboxPoller({
      config: {
        pollIntervalMs: 10,
        maxPollIntervalMs: 10,
        batchSize: 100,
        retryBackoff: [50, 50, 50],
        maxRetries: 3,
      },
      repository,
      dispatcher,
      logger,
      metrics,
      random,
    });
    await poller.start();
    await vi.advanceTimersByTimeAsync(5_000);

    // Every event ended in a final state.
    const poisoned = Math.floor(EVENTS / POISON_EVERY);
    const published = outcomes.filter((o) => o[0] === 'published').length;
    const dead = outcomes.filter((o) => o[0] === 'dead_lettered').length;
    expect(outcomes.filter((o) => o[0] === 'poisoned').length).toBe(poisoned);
    expect(published + dead + poisoned).toBe(EVENTS);
    expect(repository.getEventCount() - published).toBe(0);

    // Idempotent: no handler succeeded twice for one event.
    expect([...runs.values()].every((n) => n === 1)).toBe(true);

    // Retry success: of the events that needed a retry, how many still got published.
    const retriedIds = new Set<string>();
    const all = await Promise.all(
      Array.from({ length: EVENTS }, (_, i) => repository.getEventById(String(i + 1)))
    );
    for (const e of all) if (e && e.retryCount > 0) retriedIds.add(e.id);
    const retriedThenPublished = all.filter((e) => e?.status === 'published' && e.retryCount > 0);
    const retrySuccess = retriedThenPublished.length / (retriedThenPublished.length + dead);
    expect(retriedIds.size).toBeGreaterThan(50);
    expect(retrySuccess).toBeGreaterThan(0.9);

    // DLQ drain: the outage ends; replay every non-poison dead letter.
    chaos = false;
    const letters = await repository.listDeadLetters(1000);
    const replayable = letters.filter((l) => !l.error.startsWith('poison:'));
    expect(replayable.length).toBe(dead);
    for (const l of replayable) await repository.requeueDeadLetter(l.event.id);
    await vi.advanceTimersByTimeAsync(1_000);

    const drained = (
      await Promise.all(replayable.map((l) => repository.getEventById(l.event.id)))
    ).filter((e) => e?.status === 'published').length;
    expect(replayable.length === 0 ? 1 : drained / replayable.length).toBeGreaterThan(0.95);
    if (process.env.IFC151_REPORT) {
      // Evidence for the IFC-151 attestation (KPIs: retry success > 90%, DLQ drain > 95%).
      console.log(
        JSON.stringify({
          events: EVENTS,
          failureRate: FAILURE_RATE,
          published,
          retried: retriedIds.size,
          deadLettered: dead,
          poisoned,
          retrySuccess,
          dlqDrain: replayable.length === 0 ? 1 : drained / replayable.length,
        })
      );
    }
    expect([...runs.values()].every((n) => n === 1)).toBe(true);
    await poller.stop();
  });
});
