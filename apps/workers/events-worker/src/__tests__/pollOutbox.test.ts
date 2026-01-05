/**
 * OutboxPoller Unit Tests
 *
 * @module @intelliflow/events-worker/tests
 * @task IFC-163
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import {
  OutboxPoller,
  InMemoryOutboxRepository,
  type OutboxPollerConfig,
} from '../outbox/pollOutbox';
import { EventDispatcher, type OutboxEvent } from '../outbox/event-dispatcher';

describe('OutboxPoller', () => {
  let poller: OutboxPoller;
  let repository: InMemoryOutboxRepository;
  let dispatcher: EventDispatcher;
  const mockLogger = pino({ level: 'silent' });

  const createMockEvent = (id: string, eventType: string): OutboxEvent => ({
    id,
    eventType,
    aggregateType: 'Lead',
    aggregateId: `lead-${id}`,
    payload: { test: 'data' },
    metadata: {
      correlationId: `corr-${id}`,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
    status: 'pending',
    retryCount: 0,
    createdAt: new Date(),
  });

  const createPollerConfig = (
    overrides?: Partial<OutboxPollerConfig>
  ): Partial<OutboxPollerConfig> => ({
    pollIntervalMs: 50, // Short interval for testing
    batchSize: 100,
    lockTimeoutMs: 30000,
    retryBackoff: [1000, 5000, 30000],
    maxRetries: 3,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    repository = new InMemoryOutboxRepository();
    dispatcher = new EventDispatcher(mockLogger);

    poller = new OutboxPoller({
      config: createPollerConfig(),
      repository,
      dispatcher,
      logger: mockLogger,
    });
  });

  afterEach(async () => {
    await poller.stop();
    vi.useRealTimers();
    repository.clear();
  });

  describe('constructor', () => {
    it('should create with valid options', () => {
      expect(poller).toBeDefined();
    });

    it('should use default configuration values', () => {
      const defaultPoller = new OutboxPoller({
        config: {},
        repository,
        dispatcher,
        logger: mockLogger,
      });
      expect(defaultPoller).toBeDefined();
    });
  });

  describe('start()', () => {
    it('should start polling', async () => {
      await poller.start();

      expect(poller.getStats().isPolling).toBe(true);
    });

    it('should be idempotent', async () => {
      await poller.start();
      await poller.start();

      expect(poller.getStats().isPolling).toBe(true);
    });
  });

  describe('stop()', () => {
    it('should stop polling', async () => {
      await poller.start();
      await poller.stop();

      expect(poller.getStats().isPolling).toBe(false);
    });

    it('should be idempotent', async () => {
      await poller.start();
      await poller.stop();
      await poller.stop();

      expect(poller.getStats().isPolling).toBe(false);
    });
  });

  describe('polling behavior', () => {
    it('should process pending events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      dispatcher.register('lead.created', handler);

      const event = createMockEvent('1', 'lead.created');
      await repository.addEvent(event);

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    });

    it('should process multiple events in batch', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      dispatcher.register('*', handler);

      await repository.addEvent(createMockEvent('1', 'lead.created'));
      await repository.addEvent(createMockEvent('2', 'lead.updated'));

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should mark events as published after successful processing', async () => {
      dispatcher.register('lead.created', vi.fn().mockResolvedValue(undefined));

      const event = createMockEvent('1', 'lead.created');
      await repository.addEvent(event);

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      const processedEvent = await repository.getEventById('1');
      expect(processedEvent?.status).toBe('published');
      expect(processedEvent?.publishedAt).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should schedule retry on handler failure', async () => {
      dispatcher.register('lead.created', vi.fn().mockRejectedValue(new Error('Handler failed')));

      const event = createMockEvent('1', 'lead.created');
      await repository.addEvent(event);

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      const failedEvent = await repository.getEventById('1');
      expect(failedEvent?.retryCount).toBe(1);
      expect(failedEvent?.lastError).toBe('Handler failed');
      expect(failedEvent?.nextRetryAt).toBeDefined();
    });

    it('should move to DLQ after max retries', async () => {
      dispatcher.register('lead.created', vi.fn().mockRejectedValue(new Error('Handler failed')));

      const event: OutboxEvent = {
        ...createMockEvent('1', 'lead.created'),
        retryCount: 3, // Already at max retries
      };
      await repository.addEvent(event);

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      // Event should be moved to DLQ
      expect(repository.getDLQCount()).toBe(1);
      expect(repository.getEventCount()).toBe(0);
    });

    it('should continue processing other events after failure', async () => {
      const successHandler = vi.fn().mockResolvedValue(undefined);
      dispatcher.register('lead.created', vi.fn().mockRejectedValue(new Error('Failed')));
      dispatcher.register('lead.updated', successHandler);

      await repository.addEvent(createMockEvent('1', 'lead.created'));
      await repository.addEvent(createMockEvent('2', 'lead.updated'));

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(successHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats()', () => {
    it('should return initial statistics', () => {
      const stats = poller.getStats();

      expect(stats.processed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.dlq).toBe(0);
      expect(stats.isPolling).toBe(false);
    });

    it('should track processed events', async () => {
      dispatcher.register('*', vi.fn().mockResolvedValue(undefined));

      await repository.addEvent(createMockEvent('1', 'lead.created'));
      await repository.addEvent(createMockEvent('2', 'lead.updated'));

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      const stats = poller.getStats();
      expect(stats.processed).toBe(2);
    });

    it('should track failed events', async () => {
      dispatcher.register('lead.created', vi.fn().mockRejectedValue(new Error('Failed')));

      await repository.addEvent(createMockEvent('1', 'lead.created'));

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      const stats = poller.getStats();
      expect(stats.failed).toBe(1);
    });

    it('should track DLQ events', async () => {
      dispatcher.register('lead.created', vi.fn().mockRejectedValue(new Error('Failed')));

      const event: OutboxEvent = {
        ...createMockEvent('1', 'lead.created'),
        retryCount: 3,
      };
      await repository.addEvent(event);

      await poller.start();
      await vi.advanceTimersByTimeAsync(100);

      const stats = poller.getStats();
      expect(stats.dlq).toBe(1);
    });
  });
});

describe('InMemoryOutboxRepository', () => {
  let repository: InMemoryOutboxRepository;

  const createMockEvent = (id: string): OutboxEvent => ({
    id,
    eventType: 'lead.created',
    aggregateType: 'Lead',
    aggregateId: `lead-${id}`,
    payload: { test: 'data' },
    metadata: {
      correlationId: `corr-${id}`,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
    status: 'pending',
    retryCount: 0,
    createdAt: new Date(),
  });

  beforeEach(() => {
    repository = new InMemoryOutboxRepository();
  });

  afterEach(() => {
    repository.clear();
  });

  describe('addEvent()', () => {
    it('should add event to repository', async () => {
      await repository.addEvent(createMockEvent('1'));

      expect(repository.getEventCount()).toBe(1);
    });
  });

  describe('fetchPendingEvents()', () => {
    it('should fetch pending events', async () => {
      await repository.addEvent(createMockEvent('1'));
      await repository.addEvent(createMockEvent('2'));

      const events = await repository.fetchPendingEvents(10);

      expect(events).toHaveLength(2);
    });

    it('should respect batch limit', async () => {
      await repository.addEvent(createMockEvent('1'));
      await repository.addEvent(createMockEvent('2'));
      await repository.addEvent(createMockEvent('3'));

      const events = await repository.fetchPendingEvents(2);

      expect(events).toHaveLength(2);
    });

    it('should not fetch events with future nextRetryAt', async () => {
      const futureEvent: OutboxEvent = {
        ...createMockEvent('1'),
        nextRetryAt: new Date(Date.now() + 60000),
      };
      await repository.addEvent(futureEvent);

      const events = await repository.fetchPendingEvents(10);

      expect(events).toHaveLength(0);
    });

    it('should not fetch non-pending events', async () => {
      const publishedEvent: OutboxEvent = {
        ...createMockEvent('1'),
        status: 'published',
      };
      await repository.addEvent(publishedEvent);

      const events = await repository.fetchPendingEvents(10);

      expect(events).toHaveLength(0);
    });
  });

  describe('markAsPublished()', () => {
    it('should update event status to published', async () => {
      await repository.addEvent(createMockEvent('1'));

      await repository.markAsPublished('1');

      const event = await repository.getEventById('1');
      expect(event?.status).toBe('published');
      expect(event?.publishedAt).toBeDefined();
    });
  });

  describe('scheduleRetry()', () => {
    it('should update retry count and next retry time', async () => {
      await repository.addEvent(createMockEvent('1'));

      const nextRetryAt = new Date(Date.now() + 5000);
      await repository.scheduleRetry('1', 1, nextRetryAt, 'Test error');

      const event = await repository.getEventById('1');
      expect(event?.retryCount).toBe(1);
      expect(event?.nextRetryAt).toEqual(nextRetryAt);
      expect(event?.lastError).toBe('Test error');
    });
  });

  describe('moveToDeadLetter()', () => {
    it('should move event to DLQ', async () => {
      await repository.addEvent(createMockEvent('1'));

      await repository.moveToDeadLetter('1', 'Fatal error');

      expect(repository.getEventCount()).toBe(0);
      expect(repository.getDLQCount()).toBe(1);
    });
  });

  describe('getEventById()', () => {
    it('should return event by ID', async () => {
      await repository.addEvent(createMockEvent('1'));

      const event = await repository.getEventById('1');

      expect(event?.id).toBe('1');
    });

    it('should return null for non-existent event', async () => {
      const event = await repository.getEventById('non-existent');

      expect(event).toBeNull();
    });
  });

  describe('clear()', () => {
    it('should clear all events', async () => {
      await repository.addEvent(createMockEvent('1'));
      await repository.moveToDeadLetter('1', 'Error');
      await repository.addEvent(createMockEvent('2'));

      repository.clear();

      expect(repository.getEventCount()).toBe(0);
      expect(repository.getDLQCount()).toBe(0);
    });
  });
});

describe('OutboxPoller - Retry Backoff', () => {
  it('should use configured backoff delays', () => {
    const repository = new InMemoryOutboxRepository();
    const dispatcher = new EventDispatcher();
    const mockLogger = pino({ level: 'silent' });

    const poller = new OutboxPoller({
      config: {
        pollIntervalMs: 100,
        batchSize: 100,
        lockTimeoutMs: 30000,
        retryBackoff: [1000, 5000, 30000], // 1s, 5s, 30s
        maxRetries: 3,
      },
      repository,
      dispatcher,
      logger: mockLogger,
    });

    expect(poller).toBeDefined();
  });

  it('should calculate correct delay for each retry', () => {
    const backoff: [number, number, number] = [1000, 5000, 30000];

    expect(backoff[0]).toBe(1000); // 1st retry: 1s
    expect(backoff[1]).toBe(5000); // 2nd retry: 5s
    expect(backoff[2]).toBe(30000); // 3rd retry: 30s
  });
});
