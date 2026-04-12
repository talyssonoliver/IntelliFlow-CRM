/**
 * Real-Time Event Emitter Tests
 *
 * Tests for the shared event emitter functions,
 * channel subscriptions, and event emission.
 *
 * Coverage target: >90% for platform layer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  emitLeadScored,
  emitTaskAssigned,
  emitSystemEvent,
  emitAIProgress,
  subscribeToChannel,
  getRealtimeEmitter,
  REALTIME_CHANNELS,
  type LeadScoredEvent,
  type TaskAssignedEvent,
  type AIProgressEvent,
  type SystemEvent,
} from '../event-emitter';

describe('Event Emitter', () => {
  // Track unsubscribe functions to clean up after each test
  const unsubscribers: Array<() => void> = [];

  afterEach(() => {
    for (const unsub of unsubscribers) {
      unsub();
    }
    unsubscribers.length = 0;
  });

  describe('REALTIME_CHANNELS', () => {
    it('should have LEAD_SCORED channel', () => {
      expect(REALTIME_CHANNELS.LEAD_SCORED).toBe('lead:scored');
    });

    it('should have TASK_ASSIGNED channel', () => {
      expect(REALTIME_CHANNELS.TASK_ASSIGNED).toBe('task:assigned');
    });

    it('should have SYSTEM_EVENT channel', () => {
      expect(REALTIME_CHANNELS.SYSTEM_EVENT).toBe('system:event');
    });

    it('should have AI_PROGRESS channel', () => {
      expect(REALTIME_CHANNELS.AI_PROGRESS).toBe('ai:progress');
    });

    it('should have exactly 4 channels', () => {
      expect(Object.keys(REALTIME_CHANNELS)).toHaveLength(4);
    });
  });

  describe('getRealtimeEmitter()', () => {
    it('should return an EventEmitter instance', () => {
      const emitter = getRealtimeEmitter();

      expect(emitter).toBeInstanceOf(EventEmitter);
    });

    it('should return the same instance on multiple calls', () => {
      const emitter1 = getRealtimeEmitter();
      const emitter2 = getRealtimeEmitter();

      expect(emitter1).toBe(emitter2);
    });
  });

  describe('emitLeadScored() + subscribeToChannel', () => {
    it('should emit and receive a LeadScoredEvent', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<LeadScoredEvent>(REALTIME_CHANNELS.LEAD_SCORED, handler);
      unsubscribers.push(unsub);

      const event: LeadScoredEvent = {
        leadId: 'lead-001',
        score: 85,
        confidence: 0.92,
        timestamp: new Date(),
      };

      emitLeadScored(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should deliver event to multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = subscribeToChannel<LeadScoredEvent>(REALTIME_CHANNELS.LEAD_SCORED, handler1);
      const unsub2 = subscribeToChannel<LeadScoredEvent>(REALTIME_CHANNELS.LEAD_SCORED, handler2);
      unsubscribers.push(unsub1, unsub2);

      const event: LeadScoredEvent = {
        leadId: 'lead-002',
        score: 60,
        confidence: 0.75,
        timestamp: new Date(),
      };

      emitLeadScored(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should include correct event data', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<LeadScoredEvent>(REALTIME_CHANNELS.LEAD_SCORED, handler);
      unsubscribers.push(unsub);

      const timestamp = new Date('2025-06-15T10:00:00Z');
      emitLeadScored({
        leadId: 'lead-003',
        score: 95,
        confidence: 0.99,
        timestamp,
      });

      const received = handler.mock.calls[0][0] as LeadScoredEvent;
      expect(received.leadId).toBe('lead-003');
      expect(received.score).toBe(95);
      expect(received.confidence).toBe(0.99);
      expect(received.timestamp).toBe(timestamp);
    });
  });

  describe('emitTaskAssigned() + subscribeToChannel', () => {
    it('should emit and receive a TaskAssignedEvent', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<TaskAssignedEvent>(REALTIME_CHANNELS.TASK_ASSIGNED, handler);
      unsubscribers.push(unsub);

      const event: TaskAssignedEvent = {
        taskId: 'task-001',
        assigneeId: 'user-456',
        title: 'Follow up with client',
        dueDate: new Date('2025-07-01'),
      };

      emitTaskAssigned(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should include correct task data', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<TaskAssignedEvent>(REALTIME_CHANNELS.TASK_ASSIGNED, handler);
      unsubscribers.push(unsub);

      const dueDate = new Date('2025-08-15');
      emitTaskAssigned({
        taskId: 'task-100',
        assigneeId: 'user-789',
        title: 'Prepare proposal',
        dueDate,
      });

      const received = handler.mock.calls[0][0] as TaskAssignedEvent;
      expect(received.taskId).toBe('task-100');
      expect(received.assigneeId).toBe('user-789');
      expect(received.title).toBe('Prepare proposal');
      expect(received.dueDate).toBe(dueDate);
    });
  });

  describe('emitSystemEvent()', () => {
    it('should add timestamp automatically', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<SystemEvent>(REALTIME_CHANNELS.SYSTEM_EVENT, handler);
      unsubscribers.push(unsub);

      const before = new Date();
      emitSystemEvent({
        type: 'info',
        message: 'System maintenance scheduled',
      });
      const after = new Date();

      expect(handler).toHaveBeenCalledTimes(1);
      const received = handler.mock.calls[0][0] as SystemEvent;

      expect(received.type).toBe('info');
      expect(received.message).toBe('System maintenance scheduled');
      expect(received.timestamp).toBeInstanceOf(Date);
      expect(received.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(received.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should emit warning type', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<SystemEvent>(REALTIME_CHANNELS.SYSTEM_EVENT, handler);
      unsubscribers.push(unsub);

      emitSystemEvent({
        type: 'warning',
        message: 'High CPU usage detected',
      });

      const received = handler.mock.calls[0][0] as SystemEvent;
      expect(received.type).toBe('warning');
    });

    it('should emit error type', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<SystemEvent>(REALTIME_CHANNELS.SYSTEM_EVENT, handler);
      unsubscribers.push(unsub);

      emitSystemEvent({
        type: 'error',
        message: 'Database connection lost',
      });

      const received = handler.mock.calls[0][0] as SystemEvent;
      expect(received.type).toBe('error');
      expect(received.message).toBe('Database connection lost');
    });
  });

  describe('emitAIProgress()', () => {
    it('should emit and receive an AIProgressEvent', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<AIProgressEvent>(REALTIME_CHANNELS.AI_PROGRESS, handler);
      unsubscribers.push(unsub);

      const event: AIProgressEvent = {
        jobId: 'job-001',
        progress: 50,
        status: 'Processing batch 5 of 10',
      };

      emitAIProgress(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should include correct progress data', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<AIProgressEvent>(REALTIME_CHANNELS.AI_PROGRESS, handler);
      unsubscribers.push(unsub);

      emitAIProgress({
        jobId: 'scoring-042',
        progress: 100,
        status: 'Complete',
      });

      const received = handler.mock.calls[0][0] as AIProgressEvent;
      expect(received.jobId).toBe('scoring-042');
      expect(received.progress).toBe(100);
      expect(received.status).toBe('Complete');
    });
  });

  describe('subscribeToChannel() unsubscribe', () => {
    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<LeadScoredEvent>(REALTIME_CHANNELS.LEAD_SCORED, handler);

      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should stop receiving events after unsubscribing', () => {
      const handler = vi.fn();
      const unsub = subscribeToChannel<LeadScoredEvent>(REALTIME_CHANNELS.LEAD_SCORED, handler);

      // Emit first event - should be received
      emitLeadScored({
        leadId: 'lead-x',
        score: 50,
        confidence: 0.8,
        timestamp: new Date(),
      });

      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsub();

      // Emit second event - should NOT be received
      emitLeadScored({
        leadId: 'lead-y',
        score: 60,
        confidence: 0.9,
        timestamp: new Date(),
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not affect other subscribers when one unsubscribes', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = subscribeToChannel<TaskAssignedEvent>(
        REALTIME_CHANNELS.TASK_ASSIGNED,
        handler1
      );
      const unsub2 = subscribeToChannel<TaskAssignedEvent>(
        REALTIME_CHANNELS.TASK_ASSIGNED,
        handler2
      );
      unsubscribers.push(unsub2);

      // Unsubscribe handler1
      unsub1();

      // Emit event
      emitTaskAssigned({
        taskId: 'task-z',
        assigneeId: 'user-z',
        title: 'Test task',
        dueDate: new Date(),
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('cross-channel isolation', () => {
    it('should not receive events from other channels', () => {
      const leadHandler = vi.fn();
      const taskHandler = vi.fn();

      const unsub1 = subscribeToChannel<LeadScoredEvent>(
        REALTIME_CHANNELS.LEAD_SCORED,
        leadHandler
      );
      const unsub2 = subscribeToChannel<TaskAssignedEvent>(
        REALTIME_CHANNELS.TASK_ASSIGNED,
        taskHandler
      );
      unsubscribers.push(unsub1, unsub2);

      emitLeadScored({
        leadId: 'lead-iso',
        score: 70,
        confidence: 0.85,
        timestamp: new Date(),
      });

      expect(leadHandler).toHaveBeenCalledTimes(1);
      expect(taskHandler).not.toHaveBeenCalled();
    });
  });
});
