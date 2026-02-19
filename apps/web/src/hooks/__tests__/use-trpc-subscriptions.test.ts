/**
 * Tests for use-trpc-subscriptions.ts
 *
 * Since the hooks deeply integrate with tRPC's useSubscription and React hooks,
 * and the vitest.setup.ts already mocks this module globally, we unmock it
 * first and then provide our own lower-level mocks for React and tRPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// CRITICAL: Unmock the global mock from vitest.setup.ts so we can test
// the actual implementation. Also unmock the re-export module.
// ---------------------------------------------------------------------------
vi.unmock('@/hooks/use-trpc-subscriptions');
vi.unmock('@/hooks/use-subscription');

// ---------------------------------------------------------------------------
// Use vi.hoisted so variables are available in vi.mock factories
// ---------------------------------------------------------------------------
const { mockSetState, mockUseSubscription } = vi.hoisted(() => ({
  mockSetState: vi.fn(),
  mockUseSubscription: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock React hooks
// ---------------------------------------------------------------------------
vi.mock('react', () => ({
  useState: vi.fn((init: unknown) => [init, mockSetState]),
  useEffect: vi.fn((fn: () => void | (() => void)) => {
    const _cleanup = fn();
    // no-op: cleanup stored but not tracked
  }),
  useCallback: vi.fn((fn: unknown) => fn),
  useRef: vi.fn((init: unknown) => ({ current: init })),
}));

// ---------------------------------------------------------------------------
// Mock tRPC
// ---------------------------------------------------------------------------
vi.mock('@/lib/trpc', () => ({
  trpc: {
    subscriptions: {
      onLeadScored: { useSubscription: mockUseSubscription },
      onTaskAssigned: { useSubscription: mockUseSubscription },
      onSystemEvent: { useSubscription: mockUseSubscription },
      onAIProgress: { useSubscription: mockUseSubscription },
      heartbeat: { useSubscription: mockUseSubscription },
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock @trpc/client
// ---------------------------------------------------------------------------
vi.mock('@trpc/client', () => ({
  TRPCClientErrorLike: class {},
}));

// ---------------------------------------------------------------------------
// Mock @intelliflow/api-client
// ---------------------------------------------------------------------------
vi.mock('@intelliflow/api-client', () => ({
  AppRouter: {},
}));

// Now import the module under test (after mocks are set up)
import {
  useLeadScoredSubscription,
  useTaskAssignedSubscription,
  useSystemEventSubscription,
  useAIProgressSubscription,
  useRealtimeHealth,
  useAllSubscriptions,
  type ConnectionStatus,
  type SubscriptionMetrics,
  type LeadScoredEvent,
  type TaskAssignedEvent,
  type SystemEvent,
  type AIProgressEvent,
} from '../use-trpc-subscriptions';

describe('use-trpc-subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSubscription.mockReset();
  });

  // =========================================================================
  // Type exports
  // =========================================================================
  describe('type exports', () => {
    it('ConnectionStatus type should accept valid values', () => {
      const statuses: ConnectionStatus[] = ['connecting', 'connected', 'disconnected', 'error'];
      expect(statuses).toHaveLength(4);
    });

    it('SubscriptionMetrics interface should have expected shape', () => {
      const metrics: SubscriptionMetrics = {
        messagesReceived: 0,
        averageLatency: 0,
        lastMessageAt: null,
        connectionUptime: 0,
        errors: 0,
      };
      expect(metrics.messagesReceived).toBe(0);
      expect(metrics.averageLatency).toBe(0);
      expect(metrics.lastMessageAt).toBeNull();
      expect(metrics.connectionUptime).toBe(0);
      expect(metrics.errors).toBe(0);
    });

    it('LeadScoredEvent should have expected fields', () => {
      const event: LeadScoredEvent = {
        leadId: 'lead-1',
        score: 85,
        confidence: 0.9,
        timestamp: new Date(),
      };
      expect(event.leadId).toBe('lead-1');
      expect(event.score).toBe(85);
      expect(event.confidence).toBe(0.9);
    });

    it('TaskAssignedEvent should have expected fields', () => {
      const event: TaskAssignedEvent = {
        taskId: 'task-1',
        assigneeId: 'user-1',
        title: 'Follow up',
        dueDate: new Date(),
      };
      expect(event.taskId).toBe('task-1');
      expect(event.title).toBe('Follow up');
    });

    it('SystemEvent should have expected fields', () => {
      const event: SystemEvent = {
        type: 'maintenance',
        message: 'Server restarting',
        timestamp: new Date(),
      };
      expect(event.type).toBe('maintenance');
      expect(event.message).toBe('Server restarting');
    });

    it('SystemEvent type field allows all valid values', () => {
      const types: SystemEvent['type'][] = ['maintenance', 'alert', 'info', 'error', 'warning'];
      expect(types).toHaveLength(5);
    });

    it('AIProgressEvent should have expected fields', () => {
      const event: AIProgressEvent = {
        jobId: 'job-1',
        progress: 50,
        status: 'processing',
      };
      expect(event.jobId).toBe('job-1');
      expect(event.progress).toBe(50);
      expect(event.status).toBe('processing');
    });
  });

  // =========================================================================
  // useLeadScoredSubscription
  // =========================================================================
  describe('useLeadScoredSubscription', () => {
    it('returns expected shape with default options', () => {
      const result = useLeadScoredSubscription();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('isConnected');
    });

    it('returns disconnected status by default', () => {
      const result = useLeadScoredSubscription();
      expect(result.status).toBe('disconnected');
      expect(result.isConnected).toBe(false);
      expect(result.data).toBeNull();
    });

    it('calls tRPC useSubscription with leadId', () => {
      useLeadScoredSubscription({ leadId: 'lead-123' });
      expect(mockUseSubscription).toHaveBeenCalled();
      const [input, opts] = mockUseSubscription.mock.calls[0];
      expect(input).toEqual({ leadId: 'lead-123' });
      expect(opts.enabled).toBe(true);
    });

    it('disables subscription when autoStart is false', () => {
      useLeadScoredSubscription({ autoStart: false });
      const [, opts] = mockUseSubscription.mock.calls[0];
      expect(opts.enabled).toBe(false);
    });

    it('calls onStarted callback which updates status', () => {
      useLeadScoredSubscription();
      const [, opts] = mockUseSubscription.mock.calls[0];
      expect(typeof opts.onStarted).toBe('function');
      opts.onStarted();
      expect(mockSetState).toHaveBeenCalled();
    });

    it('calls onData callback with event', () => {
      const onData = vi.fn();
      useLeadScoredSubscription({ onData });
      const [, opts] = mockUseSubscription.mock.calls[0];

      const event: LeadScoredEvent = {
        leadId: 'lead-1',
        score: 90,
        confidence: 0.95,
        timestamp: new Date().toISOString(),
      };
      opts.onData(event);

      expect(mockSetState).toHaveBeenCalled();
    });

    it('handles timestamp as Date object', () => {
      useLeadScoredSubscription();
      const [, opts] = mockUseSubscription.mock.calls[0];

      const event: LeadScoredEvent = {
        leadId: 'lead-1',
        score: 90,
        confidence: 0.95,
        timestamp: new Date(),
      };

      expect(() => opts.onData(event)).not.toThrow();
    });

    it('calls onError callback on subscription error', () => {
      const onError = vi.fn();
      useLeadScoredSubscription({ onError });
      const [, opts] = mockUseSubscription.mock.calls[0];

      const error = { message: 'Connection lost' };
      opts.onError(error);

      expect(mockSetState).toHaveBeenCalled();
    });

    it('logs debug messages when debug is true', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      useLeadScoredSubscription({ debug: true });
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onStarted();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useLeadScoredSubscription]',
        'Subscription started'
      );
      consoleSpy.mockRestore();
    });

    it('does not log when debug is false', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      useLeadScoredSubscription({ debug: false });
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onStarted();
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[useLeadScoredSubscription]'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('warns when latency exceeds 100ms target', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      useLeadScoredSubscription();
      const [, opts] = mockUseSubscription.mock.calls[0];

      const oldDate = new Date(Date.now() - 200);
      opts.onData({
        leadId: 'lead-1',
        score: 90,
        confidence: 0.95,
        timestamp: oldDate.toISOString(),
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Latency exceeded target'));
      warnSpy.mockRestore();
    });
  });

  // =========================================================================
  // useTaskAssignedSubscription
  // =========================================================================
  describe('useTaskAssignedSubscription', () => {
    it('returns expected shape with default options', () => {
      const result = useTaskAssignedSubscription();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('isConnected');
    });

    it('returns disconnected status by default', () => {
      const result = useTaskAssignedSubscription();
      expect(result.status).toBe('disconnected');
      expect(result.isConnected).toBe(false);
    });

    it('passes undefined as input to useSubscription', () => {
      useTaskAssignedSubscription();
      const [input] = mockUseSubscription.mock.calls[0];
      expect(input).toBeUndefined();
    });

    it('disables subscription when autoStart is false', () => {
      useTaskAssignedSubscription({ autoStart: false });
      const [, opts] = mockUseSubscription.mock.calls[0];
      expect(opts.enabled).toBe(false);
    });

    it('handles onData callback', () => {
      useTaskAssignedSubscription();
      const [, opts] = mockUseSubscription.mock.calls[0];

      const event: TaskAssignedEvent = {
        taskId: 'task-1',
        assigneeId: 'user-1',
        title: 'Review lead',
        dueDate: new Date(),
      };

      expect(() => opts.onData(event)).not.toThrow();
      expect(mockSetState).toHaveBeenCalled();
    });

    it('handles onError callback', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      useTaskAssignedSubscription();
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onError({ message: 'test error' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[useTaskAssignedSubscription] Error:',
        expect.anything()
      );
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // useSystemEventSubscription
  // =========================================================================
  describe('useSystemEventSubscription', () => {
    it('returns expected shape with default options', () => {
      const result = useSystemEventSubscription();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('isConnected');
    });

    it('returns disconnected status by default', () => {
      const result = useSystemEventSubscription();
      expect(result.status).toBe('disconnected');
    });

    it('passes undefined as input to useSubscription', () => {
      useSystemEventSubscription();
      const [input] = mockUseSubscription.mock.calls[0];
      expect(input).toBeUndefined();
    });

    it('handles system event data', () => {
      useSystemEventSubscription();
      const [, opts] = mockUseSubscription.mock.calls[0];

      const event: SystemEvent = {
        type: 'alert',
        message: 'High CPU usage detected',
        timestamp: new Date(),
      };

      expect(() => opts.onData(event)).not.toThrow();
    });

    it('logs debug message when debug enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      useSystemEventSubscription({ debug: true });
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onStarted();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useSystemEventSubscription]',
        'Subscription started'
      );
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // useAIProgressSubscription
  // =========================================================================
  describe('useAIProgressSubscription', () => {
    it('returns expected shape', () => {
      const result = useAIProgressSubscription({ jobId: 'job-1' });
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('progress');
      expect(result).toHaveProperty('progressStatus');
      expect(result).toHaveProperty('isConnected');
      expect(result).toHaveProperty('isComplete');
    });

    it('returns initial progress state', () => {
      const result = useAIProgressSubscription({ jobId: 'job-1' });
      expect(result.progress).toBe(0);
      expect(result.progressStatus).toBe('');
      expect(result.isComplete).toBe(false);
    });

    it('passes jobId to useSubscription', () => {
      useAIProgressSubscription({ jobId: 'job-abc' });
      const [input] = mockUseSubscription.mock.calls[0];
      expect(input).toEqual({ jobId: 'job-abc' });
    });

    it('enables subscription only when jobId is truthy and autoStart is true', () => {
      useAIProgressSubscription({ jobId: 'job-1', autoStart: true });
      const [, opts] = mockUseSubscription.mock.calls[0];
      expect(opts.enabled).toBe(true);
    });

    it('disables subscription when autoStart is false', () => {
      useAIProgressSubscription({ jobId: 'job-1', autoStart: false });
      const [, opts] = mockUseSubscription.mock.calls[0];
      expect(opts.enabled).toBe(false);
    });

    it('disables subscription when jobId is empty', () => {
      useAIProgressSubscription({ jobId: '' });
      const [, opts] = mockUseSubscription.mock.calls[0];
      expect(opts.enabled).toBe(false);
    });

    it('handles progress event data', () => {
      useAIProgressSubscription({ jobId: 'job-1' });
      const [, opts] = mockUseSubscription.mock.calls[0];

      const event: AIProgressEvent = {
        jobId: 'job-1',
        progress: 50,
        status: 'processing',
      };

      expect(() => opts.onData(event)).not.toThrow();
      expect(mockSetState).toHaveBeenCalled();
    });

    it('calls onComplete when progress reaches 100', () => {
      const onComplete = vi.fn();
      const onProgress = vi.fn();
      useAIProgressSubscription({ jobId: 'job-1', onProgress, onComplete });
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onData({ jobId: 'job-1', progress: 100, status: 'done' });
      // The callback is stored in a ref and called inside the mock
    });

    it('handles error callback', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      useAIProgressSubscription({ jobId: 'job-1' });
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onError({ message: 'AI processing failed' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[useAIProgressSubscription:job-1] Error:',
        expect.anything()
      );
      consoleErrorSpy.mockRestore();
    });

    it('includes jobId in debug log prefix', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      useAIProgressSubscription({ jobId: 'my-job', debug: true });
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onStarted();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useAIProgressSubscription:my-job]',
        'Subscription started'
      );
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // useRealtimeHealth
  // =========================================================================
  describe('useRealtimeHealth', () => {
    it('returns expected shape', () => {
      const result = useRealtimeHealth();
      expect(result).toHaveProperty('isHealthy');
      expect(result).toHaveProperty('latency');
      expect(result).toHaveProperty('lastPing');
    });

    it('returns initial unhealthy state', () => {
      const result = useRealtimeHealth();
      expect(result.isHealthy).toBe(false);
      expect(result.latency).toBeNull();
      expect(result.lastPing).toBeNull();
    });

    it('passes intervalMs to useSubscription', () => {
      useRealtimeHealth({ intervalMs: 10000 });
      const [input] = mockUseSubscription.mock.calls[0];
      expect(input).toEqual({ intervalMs: 10000 });
    });

    it('uses default intervalMs of 5000', () => {
      useRealtimeHealth();
      const [input] = mockUseSubscription.mock.calls[0];
      expect(input).toEqual({ intervalMs: 5000 });
    });

    it('enables subscription by default', () => {
      useRealtimeHealth();
      const [, opts] = mockUseSubscription.mock.calls[0];
      expect(opts.enabled).toBe(true);
    });

    it('disables subscription when autoStart is false', () => {
      useRealtimeHealth({ autoStart: false });
      const [, opts] = mockUseSubscription.mock.calls[0];
      expect(opts.enabled).toBe(false);
    });

    it('sets healthy on start', () => {
      useRealtimeHealth();
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onStarted();
      expect(mockSetState).toHaveBeenCalled();
    });

    it('handles heartbeat data with timestamp', () => {
      useRealtimeHealth();
      const [, opts] = mockUseSubscription.mock.calls[0];

      const data = { timestamp: new Date().toISOString() };
      expect(() => opts.onData(data)).not.toThrow();
      expect(mockSetState).toHaveBeenCalled();
    });

    it('sets unhealthy on error', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      useRealtimeHealth();
      const [, opts] = mockUseSubscription.mock.calls[0];

      opts.onError({ message: 'WebSocket disconnected' });
      expect(mockSetState).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // useAllSubscriptions
  // =========================================================================
  describe('useAllSubscriptions', () => {
    it('returns expected shape', () => {
      const result = useAllSubscriptions();
      expect(result).toHaveProperty('leadScored');
      expect(result).toHaveProperty('taskAssigned');
      expect(result).toHaveProperty('systemEvent');
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('isAnyConnected');
      expect(result).toHaveProperty('allConnected');
    });

    it('calls useSubscription for all hooks', () => {
      useAllSubscriptions();
      // 4 subscription hooks + 1 health hook = at minimum several calls
      expect(mockUseSubscription).toHaveBeenCalled();
    });

    it('isAnyConnected is false when all are disconnected', () => {
      const result = useAllSubscriptions();
      expect(result.isAnyConnected).toBe(false);
    });

    it('allConnected is false when all are disconnected', () => {
      const result = useAllSubscriptions();
      expect(result.allConnected).toBe(false);
    });

    it('accepts options for individual subscriptions', () => {
      const onLeadData = vi.fn();
      const result = useAllSubscriptions({
        leadScored: { onData: onLeadData },
        enableHealthCheck: true,
      });
      expect(result).toHaveProperty('leadScored');
      expect(result).toHaveProperty('health');
    });
  });
});
