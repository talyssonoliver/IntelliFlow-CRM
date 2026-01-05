/**
 * EventDispatcher Unit Tests
 *
 * @module @intelliflow/events-worker/tests
 * @task IFC-163
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import {
  EventDispatcher,
  DOMAIN_EVENT_TYPES,
  type OutboxEvent,
  type EventHandler,
} from '../outbox/event-dispatcher';

describe('EventDispatcher', () => {
  let dispatcher: EventDispatcher;
  const mockLogger = pino({ level: 'silent' });

  const createMockEvent = (eventType: string, id = '1'): OutboxEvent => ({
    id,
    eventType,
    aggregateType: eventType.split('.')[0] || 'Unknown',
    aggregateId: `aggregate-${id}`,
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
    dispatcher = new EventDispatcher(mockLogger);
  });

  describe('constructor', () => {
    it('should create dispatcher with default logger', () => {
      const dispatcherWithDefaultLogger = new EventDispatcher();
      expect(dispatcherWithDefaultLogger).toBeDefined();
    });

    it('should create dispatcher with custom logger', () => {
      expect(dispatcher).toBeDefined();
    });
  });

  describe('register()', () => {
    it('should register exact match handler', () => {
      const handler = vi.fn();
      dispatcher.register('lead.created', handler);

      expect(dispatcher.getRegisteredPatterns()).toContain('lead.created');
    });

    it('should register aggregate wildcard handler', () => {
      const handler = vi.fn();
      dispatcher.register('lead.*', handler);

      expect(dispatcher.getRegisteredPatterns()).toContain('lead');
    });

    it('should register global wildcard handler', () => {
      const handler = vi.fn();
      dispatcher.register('*', handler);

      expect(dispatcher.getRegisteredPatterns()).toContain('*');
    });

    it('should allow multiple handlers for same pattern', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      dispatcher.register('lead.created', handler1, 'handler1');
      dispatcher.register('lead.created', handler2, 'handler2');

      expect(dispatcher.hasHandlers('lead.created')).toBe(true);
    });
  });

  describe('unregister()', () => {
    it('should unregister exact match handlers', () => {
      dispatcher.register('lead.created', vi.fn());
      dispatcher.unregister('lead.created');

      expect(dispatcher.hasHandlers('lead.created')).toBe(false);
    });

    it('should unregister aggregate wildcard handlers', () => {
      dispatcher.register('lead.*', vi.fn());
      dispatcher.unregister('lead.*');

      expect(dispatcher.hasHandlers('lead.created')).toBe(false);
    });

    it('should unregister global wildcard handlers', () => {
      dispatcher.register('*', vi.fn());
      dispatcher.unregister('*');

      expect(dispatcher.getRegisteredPatterns()).not.toContain('*');
    });
  });

  describe('dispatch()', () => {
    it('should dispatch to exact match handler', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      dispatcher.register('lead.created', handler);

      const event = createMockEvent('lead.created');
      await dispatcher.dispatch(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should dispatch to aggregate wildcard handler', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      dispatcher.register('lead.*', handler);

      const event = createMockEvent('lead.created');
      await dispatcher.dispatch(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should dispatch to global wildcard handler', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      dispatcher.register('*', handler);

      const event = createMockEvent('lead.created');
      await dispatcher.dispatch(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should dispatch to multiple matching handlers', async () => {
      const exactHandler = vi.fn().mockResolvedValue(undefined);
      const wildcardHandler = vi.fn().mockResolvedValue(undefined);
      const globalHandler = vi.fn().mockResolvedValue(undefined);

      dispatcher.register('lead.created', exactHandler);
      dispatcher.register('lead.*', wildcardHandler);
      dispatcher.register('*', globalHandler);

      const event = createMockEvent('lead.created');
      await dispatcher.dispatch(event);

      expect(exactHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledTimes(1);
      expect(globalHandler).toHaveBeenCalledTimes(1);
    });

    it('should not throw for events with no handlers', async () => {
      const event = createMockEvent('unhandled.event');

      await expect(dispatcher.dispatch(event)).resolves.not.toThrow();
    });

    it('should throw if any handler fails', async () => {
      const successHandler = vi.fn().mockResolvedValue(undefined);
      const failHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      dispatcher.register('lead.created', successHandler);
      dispatcher.register('lead.created', failHandler);

      const event = createMockEvent('lead.created');

      await expect(dispatcher.dispatch(event)).rejects.toThrow('Handler failed');
    });

    it('should execute all handlers in parallel', async () => {
      const executionOrder: number[] = [];

      const handler1 = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push(1);
      });
      const handler2 = vi.fn(async () => {
        executionOrder.push(2);
      });

      dispatcher.register('lead.created', handler1);
      dispatcher.register('lead.created', handler2);

      const event = createMockEvent('lead.created');
      await dispatcher.dispatch(event);

      // Handler2 should complete first since it doesn't have delay
      expect(executionOrder).toEqual([2, 1]);
    });
  });

  describe('getRegisteredPatterns()', () => {
    it('should return empty array when no handlers registered', () => {
      expect(dispatcher.getRegisteredPatterns()).toEqual([]);
    });

    it('should return all registered patterns', () => {
      dispatcher.register('lead.created', vi.fn());
      dispatcher.register('contact.*', vi.fn());
      dispatcher.register('*', vi.fn());

      const patterns = dispatcher.getRegisteredPatterns();

      expect(patterns).toContain('lead.created');
      expect(patterns).toContain('contact');
      expect(patterns).toContain('*');
    });
  });

  describe('hasHandlers()', () => {
    it('should return false when no handlers', () => {
      expect(dispatcher.hasHandlers('lead.created')).toBe(false);
    });

    it('should return true for exact match', () => {
      dispatcher.register('lead.created', vi.fn());
      expect(dispatcher.hasHandlers('lead.created')).toBe(true);
    });

    it('should return true for aggregate wildcard match', () => {
      dispatcher.register('lead.*', vi.fn());
      expect(dispatcher.hasHandlers('lead.created')).toBe(true);
    });

    it('should return true for global wildcard match', () => {
      dispatcher.register('*', vi.fn());
      expect(dispatcher.hasHandlers('lead.created')).toBe(true);
    });
  });
});

describe('DOMAIN_EVENT_TYPES', () => {
  it('should export lead event types', () => {
    expect(DOMAIN_EVENT_TYPES.LEAD_CREATED).toBe('lead.created');
    expect(DOMAIN_EVENT_TYPES.LEAD_SCORED).toBe('lead.scored');
    expect(DOMAIN_EVENT_TYPES.LEAD_QUALIFIED).toBe('lead.qualified');
    expect(DOMAIN_EVENT_TYPES.LEAD_CONVERTED).toBe('lead.converted');
    expect(DOMAIN_EVENT_TYPES.LEAD_UPDATED).toBe('lead.updated');
  });

  it('should export contact event types', () => {
    expect(DOMAIN_EVENT_TYPES.CONTACT_CREATED).toBe('contact.created');
    expect(DOMAIN_EVENT_TYPES.CONTACT_UPDATED).toBe('contact.updated');
  });

  it('should export opportunity event types', () => {
    expect(DOMAIN_EVENT_TYPES.OPPORTUNITY_CREATED).toBe('opportunity.created');
    expect(DOMAIN_EVENT_TYPES.OPPORTUNITY_STAGE_CHANGED).toBe('opportunity.stage_changed');
    expect(DOMAIN_EVENT_TYPES.OPPORTUNITY_WON).toBe('opportunity.won');
    expect(DOMAIN_EVENT_TYPES.OPPORTUNITY_LOST).toBe('opportunity.lost');
  });

  it('should export task event types', () => {
    expect(DOMAIN_EVENT_TYPES.TASK_CREATED).toBe('task.created');
    expect(DOMAIN_EVENT_TYPES.TASK_COMPLETED).toBe('task.completed');
    expect(DOMAIN_EVENT_TYPES.TASK_ASSIGNED).toBe('task.assigned');
  });

  it('should export notification event types', () => {
    expect(DOMAIN_EVENT_TYPES.NOTIFICATION_CREATED).toBe('notification.created');
    expect(DOMAIN_EVENT_TYPES.NOTIFICATION_SENT).toBe('notification.sent');
    expect(DOMAIN_EVENT_TYPES.NOTIFICATION_FAILED).toBe('notification.failed');
  });

  it('should export AI event types', () => {
    expect(DOMAIN_EVENT_TYPES.AI_ANALYSIS_COMPLETED).toBe('ai.analysis_completed');
    expect(DOMAIN_EVENT_TYPES.AI_PREDICTION_MADE).toBe('ai.prediction_made');
  });
});
