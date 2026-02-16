/**
 * tRPC Subscription Hooks
 *
 * React hooks for real-time subscriptions using tRPC WebSocket transport.
 * These hooks replace Supabase Realtime with native tRPC subscriptions.
 *
 * IFC-016: Real-time Subscriptions (tRPC implementation)
 * KPIs: <100ms latency, connection stable
 *
 * @module apps/web/src/hooks/use-trpc-subscriptions
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { TRPCClientErrorLike } from '@trpc/client';
import type { AppRouter } from '@intelliflow/api-client';

// tRPC error type for subscriptions
type SubscriptionError = TRPCClientErrorLike<AppRouter>;

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SubscriptionMetrics {
  messagesReceived: number;
  averageLatency: number;
  lastMessageAt: number | null;
  connectionUptime: number;
  errors: number;
}

export interface LeadScoredEvent {
  leadId: string;
  score: number;
  confidence: number;
  timestamp: Date | string;
}

export interface TaskAssignedEvent {
  taskId: string;
  assigneeId: string;
  title: string;
  dueDate: Date | string;
}

export interface SystemEvent {
  type: 'maintenance' | 'alert' | 'info' | 'error' | 'warning';
  message: string;
  timestamp: Date | string;
}

export interface AIProgressEvent {
  jobId: string;
  progress: number;
  status: string;
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Internal hook for tracking subscription metrics
 */
function useSubscriptionMetrics() {
  const [metrics, setMetrics] = useState<SubscriptionMetrics>({
    messagesReceived: 0,
    averageLatency: 0,
    lastMessageAt: null,
    connectionUptime: 0,
    errors: 0,
  });

  const latencyHistory = useRef<number[]>([]);
  const connectionStart = useRef<number | null>(null);

  const recordMessage = useCallback((latency?: number) => {
    const now = Date.now();

    if (latency !== undefined) {
      // Keep last 100 latency samples
      latencyHistory.current = [...latencyHistory.current.slice(-99), latency];
      const avgLatency =
        latencyHistory.current.reduce((a, b) => a + b, 0) / latencyHistory.current.length;

      setMetrics((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        averageLatency: Math.round(avgLatency),
        lastMessageAt: now,
      }));
    } else {
      setMetrics((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        lastMessageAt: now,
      }));
    }
  }, []);

  const recordError = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      errors: prev.errors + 1,
    }));
  }, []);

  const startConnection = useCallback(() => {
    connectionStart.current = Date.now();
  }, []);

  const endConnection = useCallback(() => {
    if (connectionStart.current) {
      const uptime = Date.now() - connectionStart.current;
      setMetrics((prev) => ({
        ...prev,
        connectionUptime: prev.connectionUptime + uptime,
      }));
      connectionStart.current = null;
    }
  }, []);

  return {
    metrics,
    recordMessage,
    recordError,
    startConnection,
    endConnection,
  };
}

// ============================================================================
// Lead Score Subscription Hook
// ============================================================================

export interface UseLeadScoredSubscriptionOptions {
  /** Filter for a specific lead ID */
  leadId?: string;
  /** Callback when a lead score event is received */
  onData?: (event: LeadScoredEvent) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-start subscription on mount (default: true) */
  autoStart?: boolean;
}

/**
 * Subscribe to lead score updates via tRPC WebSocket
 *
 * Uses tRPC's built-in useSubscription hook with React Query integration.
 *
 * @example
 * ```tsx
 * const { status, metrics, data } = useLeadScoredSubscription({
 *   leadId: 'lead-123',
 *   onData: (event) => {
 *     console.log('Lead scored:', event.score);
 *   },
 * });
 * ```
 */
export function useLeadScoredSubscription(options: UseLeadScoredSubscriptionOptions = {}) {
  const { leadId, onData, onError, debug = false, autoStart = true } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [data, setData] = useState<LeadScoredEvent | null>(null);
  const { metrics, recordMessage, recordError, startConnection, endConnection } =
    useSubscriptionMetrics();

  const onDataRef = useRef(onData);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[useLeadScoredSubscription]`, message, ...args);
      }
    },
    [debug]
  );

  // Use tRPC's useSubscription hook
  trpc.subscriptions.onLeadScored.useSubscription(
    { leadId },
    {
      enabled: autoStart,
      onStarted: () => {
        log('Subscription started');
        setStatus('connected');
        startConnection();
      },
      onData: (event: LeadScoredEvent) => {
        const timestamp =
          typeof event.timestamp === 'string'
            ? new Date(event.timestamp).getTime()
            : event.timestamp.getTime();
        const latency = Date.now() - timestamp;
        log('Received event', { ...event, latency });

        // Check latency KPI (<100ms target)
        if (latency > 100) {
          console.warn(
            `[useLeadScoredSubscription] Latency exceeded target: ${latency}ms (target: <100ms)`
          );
        }

        recordMessage(latency);
        setData(event);
        onDataRef.current?.(event);
      },
      onError: (err: SubscriptionError) => {
        console.error('[useLeadScoredSubscription] Error:', err);
        setStatus('error');
        recordError();
        onErrorRef.current?.(err as unknown as Error);
      },
    }
  );

  // Set connecting status when starting
  useEffect(() => {
    if (autoStart) {
      setStatus('connecting');
    }
  }, [autoStart]);

  // Cleanup
  useEffect(() => {
    return () => {
      endConnection();
    };
  }, [endConnection]);

  return {
    status,
    metrics,
    data,
    isConnected: status === 'connected',
  };
}

// ============================================================================
// Task Assigned Subscription Hook
// ============================================================================

export interface UseTaskAssignedSubscriptionOptions {
  /** Callback when a task is assigned to the current user */
  onData?: (event: TaskAssignedEvent) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-start subscription on mount (default: true) */
  autoStart?: boolean;
}

/**
 * Subscribe to task assignments for the current user
 *
 * @example
 * ```tsx
 * const { status, data } = useTaskAssignedSubscription({
 *   onData: (event) => {
 *     toast.info(`New task assigned: ${event.title}`);
 *   },
 * });
 * ```
 */
export function useTaskAssignedSubscription(options: UseTaskAssignedSubscriptionOptions = {}) {
  const { onData, onError, debug = false, autoStart = true } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [data, setData] = useState<TaskAssignedEvent | null>(null);
  const { metrics, recordMessage, recordError, startConnection, endConnection } =
    useSubscriptionMetrics();

  const onDataRef = useRef(onData);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[useTaskAssignedSubscription]`, message, ...args);
      }
    },
    [debug]
  );

  trpc.subscriptions.onTaskAssigned.useSubscription(undefined, {
    enabled: autoStart,
    onStarted: () => {
      log('Subscription started');
      setStatus('connected');
      startConnection();
    },
    onData: (event: TaskAssignedEvent) => {
      log('Received event', event);
      recordMessage();
      setData(event);
      onDataRef.current?.(event);
    },
    onError: (err: SubscriptionError) => {
      console.error('[useTaskAssignedSubscription] Error:', err);
      setStatus('error');
      recordError();
      onErrorRef.current?.(err as unknown as Error);
    },
  });

  useEffect(() => {
    if (autoStart) {
      setStatus('connecting');
    }
  }, [autoStart]);

  useEffect(() => {
    return () => {
      endConnection();
    };
  }, [endConnection]);

  return {
    status,
    metrics,
    data,
    isConnected: status === 'connected',
  };
}

// ============================================================================
// System Event Subscription Hook
// ============================================================================

export interface UseSystemEventSubscriptionOptions {
  /** Callback when a system event is received */
  onData?: (event: SystemEvent) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-start subscription on mount (default: true) */
  autoStart?: boolean;
}

/**
 * Subscribe to system-wide events (maintenance, alerts, info)
 *
 * @example
 * ```tsx
 * const { status, data } = useSystemEventSubscription({
 *   onData: (event) => {
 *     if (event.type === 'maintenance') {
 *       toast.warning(event.message);
 *     }
 *   },
 * });
 * ```
 */
export function useSystemEventSubscription(options: UseSystemEventSubscriptionOptions = {}) {
  const { onData, onError, debug = false, autoStart = true } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [data, setData] = useState<SystemEvent | null>(null);
  const { metrics, recordMessage, recordError, startConnection, endConnection } =
    useSubscriptionMetrics();

  const onDataRef = useRef(onData);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[useSystemEventSubscription]`, message, ...args);
      }
    },
    [debug]
  );

  trpc.subscriptions.onSystemEvent.useSubscription(undefined, {
    enabled: autoStart,
    onStarted: () => {
      log('Subscription started');
      setStatus('connected');
      startConnection();
    },
    onData: (event: SystemEvent) => {
      log('Received event', event);
      recordMessage();
      setData(event);
      onDataRef.current?.(event);
    },
    onError: (err: SubscriptionError) => {
      console.error('[useSystemEventSubscription] Error:', err);
      setStatus('error');
      recordError();
      onErrorRef.current?.(err as unknown as Error);
    },
  });

  useEffect(() => {
    if (autoStart) {
      setStatus('connecting');
    }
  }, [autoStart]);

  useEffect(() => {
    return () => {
      endConnection();
    };
  }, [endConnection]);

  return {
    status,
    metrics,
    data,
    isConnected: status === 'connected',
  };
}

// ============================================================================
// AI Progress Subscription Hook
// ============================================================================

export interface UseAIProgressSubscriptionOptions {
  /** Job ID to track progress for */
  jobId: string;
  /** Callback when progress updates are received */
  onProgress?: (event: AIProgressEvent) => void;
  /** Callback when the job completes (progress reaches 100%) */
  onComplete?: () => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-start subscription on mount (default: true) */
  autoStart?: boolean;
}

/**
 * Subscribe to AI job progress updates
 *
 * @example
 * ```tsx
 * const { status, progress, progressStatus } = useAIProgressSubscription({
 *   jobId: 'batch-scoring-123',
 *   onProgress: (event) => {
 *     console.log(`Progress: ${event.progress}%`);
 *   },
 *   onComplete: () => {
 *     toast.success('AI processing complete!');
 *   },
 * });
 * ```
 */
export function useAIProgressSubscription(options: UseAIProgressSubscriptionOptions) {
  const { jobId, onProgress, onComplete, onError, debug = false, autoStart = true } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [progress, setProgress] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const { metrics, recordMessage, recordError, startConnection, endConnection } =
    useSubscriptionMetrics();

  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[useAIProgressSubscription:${jobId}]`, message, ...args);
      }
    },
    [debug, jobId]
  );

  trpc.subscriptions.onAIProgress.useSubscription(
    { jobId },
    {
      enabled: autoStart && !!jobId,
      onStarted: () => {
        log('Subscription started');
        setStatus('connected');
        startConnection();
      },
      onData: (event: AIProgressEvent) => {
        log('Received progress update', event);
        recordMessage();
        setProgress(event.progress);
        setProgressStatus(event.status);
        onProgressRef.current?.(event);

        if (event.progress >= 100) {
          onCompleteRef.current?.();
        }
      },
      onError: (err: SubscriptionError) => {
        console.error(`[useAIProgressSubscription:${jobId}] Error:`, err);
        setStatus('error');
        recordError();
        onErrorRef.current?.(err as unknown as Error);
      },
    }
  );

  useEffect(() => {
    if (autoStart && jobId) {
      setStatus('connecting');
    }
  }, [autoStart, jobId]);

  useEffect(() => {
    return () => {
      endConnection();
    };
  }, [endConnection]);

  return {
    status,
    metrics,
    progress,
    progressStatus,
    isConnected: status === 'connected',
    isComplete: progress >= 100,
  };
}

// ============================================================================
// Heartbeat / Connection Health Hook
// ============================================================================

export interface UseRealtimeHealthOptions {
  /** Heartbeat interval in milliseconds (default: 5000) */
  intervalMs?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-start on mount (default: true) */
  autoStart?: boolean;
}

/**
 * Monitor WebSocket connection health using heartbeat subscription
 *
 * @example
 * ```tsx
 * const { isHealthy, latency, lastPing } = useRealtimeHealth();
 *
 * if (!isHealthy) {
 *   return <Banner>Connection lost. Reconnecting...</Banner>;
 * }
 * ```
 */
export function useRealtimeHealth(options: UseRealtimeHealthOptions = {}) {
  const { intervalMs = 5000, debug = false, autoStart = true } = options;

  const [isHealthy, setIsHealthy] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastPing, setLastPing] = useState<number | null>(null);
  const lastHeartbeatRef = useRef<number | null>(null);

  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[useRealtimeHealth]`, message, ...args);
      }
    },
    [debug]
  );

  trpc.subscriptions.heartbeat.useSubscription(
    { intervalMs },
    {
      enabled: autoStart,
      onStarted: () => {
        log('Heartbeat started');
        setIsHealthy(true);
      },
      onData: (data: { timestamp: string }) => {
        const receivedAt = Date.now();
        const serverTime = new Date(data.timestamp).getTime();
        const currentLatency = Math.abs(receivedAt - serverTime);

        // Calculate round-trip latency if we have a previous heartbeat
        if (lastHeartbeatRef.current) {
          const elapsed = receivedAt - lastHeartbeatRef.current;
          log('Heartbeat received', { elapsed, latency: currentLatency });
        }

        lastHeartbeatRef.current = receivedAt;
        setLatency(currentLatency);
        setLastPing(receivedAt);
        setIsHealthy(true);
      },
      onError: (err: SubscriptionError) => {
        console.error('[useRealtimeHealth] Error:', err);
        setIsHealthy(false);
      },
    }
  );

  return {
    isHealthy,
    latency,
    lastPing,
  };
}

// ============================================================================
// Combined Subscription Hook
// ============================================================================

export interface UseAllSubscriptionsOptions {
  /** Options for lead scored subscription */
  leadScored?: UseLeadScoredSubscriptionOptions;
  /** Options for task assigned subscription */
  taskAssigned?: UseTaskAssignedSubscriptionOptions;
  /** Options for system event subscription */
  systemEvent?: UseSystemEventSubscriptionOptions;
  /** Enable health monitoring */
  enableHealthCheck?: boolean;
}

/**
 * Subscribe to multiple event types at once
 *
 * @example
 * ```tsx
 * const { leadScored, taskAssigned, systemEvent, health } = useAllSubscriptions({
 *   leadScored: {
 *     onData: handleLeadScored,
 *   },
 *   taskAssigned: {
 *     onData: handleTaskAssigned,
 *   },
 *   enableHealthCheck: true,
 * });
 * ```
 */
export function useAllSubscriptions(options: UseAllSubscriptionsOptions = {}) {
  const {
    leadScored: leadOptions,
    taskAssigned: taskOptions,
    systemEvent: systemOptions,
    enableHealthCheck = false,
  } = options;

  const leadScored = useLeadScoredSubscription(leadOptions ?? { autoStart: false });
  const taskAssigned = useTaskAssignedSubscription(taskOptions ?? { autoStart: false });
  const systemEvent = useSystemEventSubscription(systemOptions ?? { autoStart: false });
  const health = useRealtimeHealth({ autoStart: enableHealthCheck });

  return {
    leadScored,
    taskAssigned,
    systemEvent,
    health,
    isAnyConnected: leadScored.isConnected || taskAssigned.isConnected || systemEvent.isConnected,
    allConnected: leadScored.isConnected && taskAssigned.isConnected && systemEvent.isConnected,
  };
}
