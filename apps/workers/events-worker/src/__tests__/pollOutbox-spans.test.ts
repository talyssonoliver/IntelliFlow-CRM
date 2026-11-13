/**
 * IFC-097: each outbox poll cycle is one span ("outbox.poll") and each event it
 * dispatches is a child span ("outbox.dispatch"), so the poller's queries no
 * longer start one root trace each. The span helper is tested in
 * packages/observability/src/consumer-span.test.ts; this checks the wiring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';

type SpanCall = { name: string; attributes: Record<string, unknown>; set: Record<string, unknown> };
const { calls, runWorkSpan } = vi.hoisted(() => {
  const calls: SpanCall[] = [];
  const runWorkSpan = vi.fn(
    async (
      name: string,
      attributes: Record<string, unknown>,
      fn: (span: { setAttribute: (k: string, v: unknown) => void }) => Promise<unknown>
    ) => {
      const call: SpanCall = { name, attributes, set: {} };
      calls.push(call);
      return fn({ setAttribute: (k, v) => (call.set[k] = v) });
    }
  );
  return { calls, runWorkSpan };
});

vi.mock('@intelliflow/worker-shared', () => ({
  runWorkSpan,
  createOutboxMetrics: () => ({ recordDispatch: () => undefined }),
}));

import { OutboxPoller, InMemoryOutboxRepository } from '../outbox/pollOutbox';
import { EventDispatcher, type OutboxEvent } from '../outbox/event-dispatcher';

const logger = pino({ level: 'silent' });
const event = (id: string, eventType: string, retryCount = 0): OutboxEvent => ({
  id,
  eventType,
  aggregateType: 'Lead',
  aggregateId: `lead-${id}`,
  payload: {},
  metadata: { correlationId: `c-${id}`, timestamp: new Date().toISOString(), version: '1.0.0' },
  status: 'pending',
  retryCount,
  createdAt: new Date(),
});

describe('OutboxPoller spans', () => {
  let repository: InMemoryOutboxRepository;
  let dispatcher: EventDispatcher;
  let poller: OutboxPoller;

  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers();
    repository = new InMemoryOutboxRepository();
    dispatcher = new EventDispatcher(logger);
    poller = new OutboxPoller({
      config: { pollIntervalMs: 50, batchSize: 25, maxRetries: 3, retryBackoff: [1000] },
      repository,
      dispatcher,
      logger,
    });
  });

  afterEach(async () => {
    await poller.stop();
    vi.useRealTimers();
  });

  it('wraps a poll in outbox.poll and each event in outbox.dispatch', async () => {
    dispatcher.register('*', vi.fn().mockResolvedValue(undefined));
    await repository.addEvent(event('1', 'lead.created'));
    await repository.addEvent(event('2', 'lead.updated', 1));

    await poller.start();
    await vi.advanceTimersByTimeAsync(10);

    const firstPoll = calls.findIndex((c) => c.name === 'outbox.poll');
    expect(calls[firstPoll]).toEqual({
      name: 'outbox.poll',
      attributes: { 'outbox.batch_size': 25 },
      set: { 'outbox.events': 2 },
    });
    expect(calls.filter((c) => c.name === 'outbox.dispatch').map((c) => c.attributes)).toEqual([
      { 'outbox.event.type': 'lead.created', 'outbox.event.id': '1', 'outbox.event.attempt': 1 },
      { 'outbox.event.type': 'lead.updated', 'outbox.event.id': '2', 'outbox.event.attempt': 2 },
    ]);
    expect((await repository.getEventById('1'))?.status).toBe('published');
  });

  it('records an empty poll with zero events', async () => {
    await poller.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(calls[0]).toEqual({
      name: 'outbox.poll',
      attributes: { 'outbox.batch_size': 25 },
      set: { 'outbox.events': 0 },
    });
  });

  it('a failed dispatch still reaches the retry path (the span rethrows)', async () => {
    dispatcher.register('lead.created', vi.fn().mockRejectedValue(new Error('Handler failed')));
    await repository.addEvent(event('1', 'lead.created'));

    await poller.start();
    await vi.advanceTimersByTimeAsync(10);

    const failed = await repository.getEventById('1');
    expect(failed?.retryCount).toBe(1);
    expect(failed?.lastError).toBe('Handler failed');
  });
});
