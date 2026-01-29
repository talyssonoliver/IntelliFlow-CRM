/**
 * Subscription Demo Router Tests
 *
 * Tests for the tRPC subscription procedures and event emission functions.
 * These tests verify the observable-based real-time event system.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  emitLeadScored,
  emitTaskAssigned,
  emitSystemEvent,
  emitAIProgress,
  subscriptionRouter,
} from '../subscription-demo';
import { createTestContext } from '../../test/setup';

// Mock context for testing
const mockContext = createTestContext();

describe('Subscription Demo Router', () => {
  describe('Event Emitters', () => {
    it('emitLeadScored should emit without error', () => {
      expect(() =>
        emitLeadScored({
          leadId: 'lead-123',
          score: 85,
          confidence: 0.92,
          timestamp: new Date(),
        })
      ).not.toThrow();
    });

    it('emitTaskAssigned should emit without error', () => {
      expect(() =>
        emitTaskAssigned({
          taskId: 'task-123',
          assigneeId: 'user-123',
          title: 'Test Task',
          dueDate: new Date(),
        })
      ).not.toThrow();
    });

    it('emitSystemEvent should emit without error', () => {
      expect(() =>
        emitSystemEvent({
          type: 'info',
          message: 'System maintenance scheduled',
        })
      ).not.toThrow();
    });

    it('emitAIProgress should emit without error', () => {
      expect(() =>
        emitAIProgress({ jobId: 'job-123', progress: 50, status: 'Processing...' })
      ).not.toThrow();
    });

    it('emitSystemEvent with warning type', () => {
      expect(() =>
        emitSystemEvent({
          type: 'warning',
          message: 'High memory usage detected',
        })
      ).not.toThrow();
    });

    it('emitSystemEvent with error type', () => {
      expect(() =>
        emitSystemEvent({
          type: 'error',
          message: 'Database connection lost',
        })
      ).not.toThrow();
    });

    it('emitLeadScored with high confidence', () => {
      expect(() =>
        emitLeadScored({
          leadId: 'lead-high',
          score: 100,
          confidence: 1.0,
          timestamp: new Date(),
        })
      ).not.toThrow();
    });

    it('emitLeadScored with low confidence', () => {
      expect(() =>
        emitLeadScored({
          leadId: 'lead-low',
          score: 0,
          confidence: 0.0,
          timestamp: new Date(),
        })
      ).not.toThrow();
    });

    it('emitAIProgress at completion', () => {
      expect(() =>
        emitAIProgress({ jobId: 'job-complete', progress: 100, status: 'Done' })
      ).not.toThrow();
    });

    it('emitAIProgress at start', () => {
      expect(() =>
        emitAIProgress({ jobId: 'job-start', progress: 0, status: 'Starting...' })
      ).not.toThrow();
    });
  });

  describe('Subscription Observables', () => {
    describe('onLeadScored', () => {
      it('should create a valid subscription observable', async () => {
        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onLeadScored({});

        expect(subscription).toBeDefined();
        expect(typeof subscription.subscribe).toBe('function');

        // Create subscriber and immediately unsubscribe
        const sub = subscription.subscribe({
          next: () => {},
          error: () => {},
          complete: () => {},
        });

        sub.unsubscribe();
      });

      it('should receive emitted events', async () => {
        const receivedEvents: any[] = [];

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onLeadScored({});

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Emit an event
        emitLeadScored({
          leadId: 'lead-456',
          score: 90,
          confidence: 0.95,
          timestamp: new Date(),
        });

        // Give time for event to propagate
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(receivedEvents.length).toBeGreaterThanOrEqual(1);

        sub.unsubscribe();
      });

      it('should filter by leadId when provided', async () => {
        const receivedEvents: any[] = [];

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onLeadScored({ leadId: 'lead-specific' });

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Emit event for different lead - should not be received
        emitLeadScored({ leadId: 'lead-other', score: 80, confidence: 0.8, timestamp: new Date() });

        // Emit event for specific lead - should be received
        emitLeadScored({ leadId: 'lead-specific', score: 95, confidence: 0.99, timestamp: new Date() });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(receivedEvents.length).toBe(1);
        expect(receivedEvents[0].leadId).toBe('lead-specific');

        sub.unsubscribe();
      });

      it('should cleanup handler on unsubscribe', async () => {
        const receivedEvents: any[] = [];

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onLeadScored({});

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Unsubscribe first
        sub.unsubscribe();

        // Emit event - should not be received since we unsubscribed
        emitLeadScored({ leadId: 'lead-789', score: 70, confidence: 0.7, timestamp: new Date() });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(receivedEvents).toHaveLength(0);
      });
    });

    describe('onTaskAssigned', () => {
      it('should create a valid subscription observable', async () => {
        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onTaskAssigned();

        expect(subscription).toBeDefined();
        expect(typeof subscription.subscribe).toBe('function');

        const sub = subscription.subscribe({ next: () => {} });
        sub.unsubscribe();
      });

      it('should receive task events for current user', async () => {
        const receivedEvents: any[] = [];
        const userId = mockContext.user!.userId;

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onTaskAssigned();

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Emit event for current user - should be received
        emitTaskAssigned({
          taskId: 'task-mine',
          assigneeId: userId,
          title: 'My Task',
          dueDate: new Date(),
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(receivedEvents.length).toBeGreaterThanOrEqual(1);

        sub.unsubscribe();
      });

      it('should filter by assigneeId', async () => {
        const receivedEvents: any[] = [];
        const userId = mockContext.user!.userId;

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onTaskAssigned();

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Emit event for different user - should not be received
        emitTaskAssigned({
          taskId: 'task-other',
          assigneeId: 'different-user-id',
          title: 'Other Task',
          dueDate: new Date(),
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(receivedEvents).toHaveLength(0);

        sub.unsubscribe();
      });
    });

    describe('onSystemEvent', () => {
      it('should create a valid subscription observable', async () => {
        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onSystemEvent();

        expect(subscription).toBeDefined();
        expect(typeof subscription.subscribe).toBe('function');

        const sub = subscription.subscribe({ next: () => {} });
        sub.unsubscribe();
      });

      it('should receive all system events', async () => {
        const receivedEvents: any[] = [];

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onSystemEvent();

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Emit multiple events
        emitSystemEvent({
          type: 'info',
          message: 'Maintenance 1',
        });
        emitSystemEvent({
          type: 'warning',
          message: 'Alert 1',
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(receivedEvents.length).toBeGreaterThanOrEqual(2);

        sub.unsubscribe();
      });
    });

    describe('onAIProgress', () => {
      it('should create a valid subscription observable', async () => {
        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onAIProgress({ jobId: 'test-job' });

        expect(subscription).toBeDefined();
        expect(typeof subscription.subscribe).toBe('function');

        const sub = subscription.subscribe({ next: () => {} });
        sub.unsubscribe();
      });

      it('should receive progress events for specific job', async () => {
        const receivedEvents: any[] = [];

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onAIProgress({ jobId: 'my-job' });

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Emit event for our job - should be received
        emitAIProgress({ jobId: 'my-job', progress: 75, status: 'Almost done' });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(receivedEvents.length).toBeGreaterThanOrEqual(1);

        sub.unsubscribe();
      });

      it('should filter by jobId', async () => {
        const receivedEvents: any[] = [];

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onAIProgress({ jobId: 'specific-job' });

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Emit event for different job - should not be received
        emitAIProgress({ jobId: 'other-job', progress: 50, status: 'Working' });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(receivedEvents).toHaveLength(0);

        sub.unsubscribe();
      });

      it('should complete when progress reaches 100%', async () => {
        let completed = false;

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.onAIProgress({ jobId: 'complete-job' });

        const sub = subscription.subscribe({
          next: () => {},
          complete: () => {
            completed = true;
          },
        });

        // Emit completion event
        emitAIProgress({ jobId: 'complete-job', progress: 100, status: 'Done' });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(completed).toBe(true);

        sub.unsubscribe();
      });
    });

    describe('heartbeat', () => {
      it('should create a valid subscription observable', async () => {
        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.heartbeat({ intervalMs: 5000 });

        expect(subscription).toBeDefined();
        expect(typeof subscription.subscribe).toBe('function');

        const sub = subscription.subscribe({ next: () => {} });
        sub.unsubscribe();
      });

      it('should emit timestamps at specified interval', async () => {
        const receivedEvents: any[] = [];

        const caller = subscriptionRouter.createCaller(mockContext);
        // Use minimum allowed interval
        const subscription = await caller.heartbeat({ intervalMs: 1000 });

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Wait for at least one heartbeat
        await new Promise((resolve) => setTimeout(resolve, 1100));

        expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
        expect(receivedEvents[0].timestamp).toBeDefined();
        expect(new Date(receivedEvents[0].timestamp).getTime()).toBeGreaterThan(0);

        sub.unsubscribe();
      });

      it('should cleanup interval on unsubscribe', async () => {
        const receivedEvents: any[] = [];

        const caller = subscriptionRouter.createCaller(mockContext);
        const subscription = await caller.heartbeat({ intervalMs: 1000 });

        const sub = subscription.subscribe({
          next: (event) => receivedEvents.push(event),
        });

        // Wait for first heartbeat
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const countAfterFirst = receivedEvents.length;

        // Unsubscribe
        sub.unsubscribe();

        // Wait more - no new events should be received
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Count should be same or very close (race condition tolerance)
        expect(receivedEvents.length).toBeLessThanOrEqual(countAfterFirst + 1);
      });

      it('should use default interval', async () => {
        const caller = subscriptionRouter.createCaller(mockContext);
        // Default intervalMs is 5000
        const subscription = await caller.heartbeat({});

        expect(subscription).toBeDefined();

        const sub = subscription.subscribe({ next: () => {} });
        sub.unsubscribe();
      });
    });
  });

  describe('Router Structure', () => {
    it('should have all expected procedures', () => {
      const procedures = Object.keys(subscriptionRouter._def.procedures);

      expect(procedures).toContain('onLeadScored');
      expect(procedures).toContain('onTaskAssigned');
      expect(procedures).toContain('onSystemEvent');
      expect(procedures).toContain('onAIProgress');
      expect(procedures).toContain('heartbeat');
      expect(procedures).toHaveLength(5);
    });

    it('should export subscriptionRouter', () => {
      expect(subscriptionRouter).toBeDefined();
      expect(subscriptionRouter._def).toBeDefined();
    });
  });
});
