/**
 * Real-time Subscription Hook
 *
 * Provides real-time updates for leads, contacts, and activities using
 * Supabase Realtime with optimistic UI updates.
 *
 * IFC-016: Real-time Subscriptions
 * KPIs: <100ms latency, connection stable
 *
 * @module apps/web/hooks/use-subscription
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { createClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Types for subscription events
export type SubscriptionEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface SubscriptionPayload<T> {
  eventType: SubscriptionEvent;
  new: T | null;
  old: T | null;
  timestamp: number;
  latency: number;
}

export interface SubscriptionOptions<T> {
  /** Table name to subscribe to */
  table: string;
  /** Schema name (defaults to 'public') */
  schema?: string;
  /** Filter for specific records (e.g., 'owner_id=eq.123') */
  filter?: string;
  /** Events to listen for */
  events?: SubscriptionEvent[];
  /** Callback when data changes */
  onData?: (payload: SubscriptionPayload<T>) => void;
  /** Callback when connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Enable debug logging */
  debug?: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface SubscriptionMetrics {
  messagesReceived: number;
  averageLatency: number;
  lastMessageAt: number | null;
  connectionUptime: number;
  reconnectCount: number;
}

// Supabase client initialization
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Hook for subscribing to real-time database changes
 *
 * @example
 * ```tsx
 * const { status, metrics, subscribe, unsubscribe } = useSubscription<Lead>({
 *   table: 'lead',
 *   events: ['INSERT', 'UPDATE'],
 *   onData: (payload) => {
 *     console.log('Lead changed:', payload);
 *     if (payload.eventType === 'UPDATE') {
 *       updateLeadInList(payload.new);
 *     }
 *   },
 * });
 * ```
 */
export function useSubscription<T = unknown>(options: SubscriptionOptions<T>) {
  const {
    table,
    schema = 'public',
    filter,
    events = ['*'],
    onData,
    onStatusChange,
    debug = false,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [metrics, setMetrics] = useState<SubscriptionMetrics>({
    messagesReceived: 0,
    averageLatency: 0,
    lastMessageAt: null,
    connectionUptime: 0,
    reconnectCount: 0,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const connectionStartRef = useRef<number | null>(null);
  const latencyHistoryRef = useRef<number[]>([]);

  // Store callbacks in refs to avoid recreating subscriptions when they change
  const onDataRef = useRef(onData);
  const onStatusChangeRef = useRef(onStatusChange);

  // Update refs when callbacks change
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[useSubscription:${table}]`, message, ...args);
      }
    },
    [debug, table]
  );

  const updateStatus = useCallback(
    (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
      onStatusChangeRef.current?.(newStatus);
      log(`Status changed to: ${newStatus}`);
    },
    [log]
  );

  const handlePayload = useCallback(
    (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
      const receivedAt = Date.now();
      const committedAt = payload.commit_timestamp
        ? new Date(payload.commit_timestamp).getTime()
        : receivedAt;
      const latency = receivedAt - committedAt;

      // Update latency history (keep last 100 samples)
      latencyHistoryRef.current = [...latencyHistoryRef.current.slice(-99), latency];
      const avgLatency =
        latencyHistoryRef.current.reduce((a, b) => a + b, 0) / latencyHistoryRef.current.length;

      setMetrics((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        averageLatency: Math.round(avgLatency),
        lastMessageAt: receivedAt,
      }));

      const subscriptionPayload: SubscriptionPayload<T> = {
        eventType: payload.eventType as SubscriptionEvent,
        new: payload.new as T | null,
        old: payload.old as T | null,
        timestamp: receivedAt,
        latency,
      };

      log(`Received ${payload.eventType} event (latency: ${latency}ms)`, subscriptionPayload);

      // Check latency KPI (<100ms target)
      if (latency > 100) {
        console.warn(
          `[useSubscription:${table}] Latency exceeded target: ${latency}ms (target: <100ms)`
        );
      }

      onDataRef.current?.(subscriptionPayload);
    },
    [log, table]
  );

  const subscribe = useCallback(() => {
    if (channelRef.current) {
      log('Already subscribed, skipping...');
      return;
    }

    updateStatus('connecting');
    connectionStartRef.current = Date.now();

    const channelName = `${schema}:${table}${filter ? `:${filter}` : ''}`;
    log(`Subscribing to channel: ${channelName}`);

    const channel = supabase.channel(channelName);

    // Configure postgres changes subscription
    const eventConfig = {
      event: events.includes('*') ? '*' : (events[0] as 'INSERT' | 'UPDATE' | 'DELETE'),
      schema,
      table,
      filter: filter || undefined,
    } as const;

    channel
      // @ts-expect-error - Supabase types don't properly support filter parameter
      .on('postgres_changes', eventConfig, handlePayload)
      .on('system', { event: '*' }, (payload) => {
        log('System event:', payload);
      })
      .subscribe((status, err) => {
        if (err) {
          console.error(`[useSubscription:${table}] Subscription error:`, err);
          updateStatus('error');
          return;
        }

        if (status === 'SUBSCRIBED') {
          updateStatus('connected');
          log('Successfully subscribed');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          updateStatus('disconnected');
          setMetrics((prev) => ({
            ...prev,
            reconnectCount: prev.reconnectCount + 1,
          }));
        }
      });

    channelRef.current = channel;
  }, [schema, table, filter, events, handlePayload, updateStatus, log]);

  const unsubscribe = useCallback(async () => {
    if (!channelRef.current) {
      log('Not subscribed, skipping...');
      return;
    }

    log('Unsubscribing...');
    await supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    updateStatus('disconnected');

    // Calculate total uptime
    if (connectionStartRef.current) {
      setMetrics((prev) => ({
        ...prev,
        connectionUptime: prev.connectionUptime + (Date.now() - connectionStartRef.current!),
      }));
      connectionStartRef.current = null;
    }
  }, [updateStatus, log]);

  // Auto-subscribe on mount - only runs once
  useEffect(() => {
    // Call subscribe directly on mount
    if (channelRef.current) {
      log('Already subscribed, skipping...');
      return;
    }

    log('Subscribing...');
    updateStatus('connecting');
    connectionStartRef.current = Date.now();

    const channel = supabase
      .channel(`${schema}:${table}:${filter || 'all'}`)
      .on(
        'postgres_changes' as any,
        {
          event: events.length === 1 && events[0] !== '*' ? events[0] : '*',
          schema,
          table,
          filter,
        },
        handlePayload
      )
      .subscribe((status, err) => {
        if (err) {
          console.error(`[useSubscription:${table}] Subscription error:`, err);
          updateStatus('error');
          return;
        }

        if (status === 'SUBSCRIBED') {
          updateStatus('connected');
          log('Successfully subscribed');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          updateStatus('disconnected');
          setMetrics((prev) => ({
            ...prev,
            reconnectCount: prev.reconnectCount + 1,
          }));
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (!channelRef.current) {
        return;
      }

      log('Unsubscribing...');
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      updateStatus('disconnected');

      // Calculate total uptime
      if (connectionStartRef.current) {
        setMetrics((prev) => ({
          ...prev,
          connectionUptime: prev.connectionUptime + (Date.now() - connectionStartRef.current!),
        }));
        connectionStartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount/unmount

  // Update uptime periodically when connected
  useEffect(() => {
    if (status !== 'connected') return;

    const interval = setInterval(() => {
      if (connectionStartRef.current) {
        setMetrics((prev) => ({
          ...prev,
          connectionUptime: prev.connectionUptime + 1000,
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  return {
    status,
    metrics,
    subscribe,
    unsubscribe,
    isConnected: status === 'connected',
  };
}

/**
 * Hook for subscribing to lead score updates
 *
 * @example
 * ```tsx
 * const { status, onScoreUpdate } = useLeadScoreSubscription({
 *   leadId: 'lead-123',
 *   onScoreChange: (newScore) => {
 *     console.log('New score:', newScore);
 *   },
 * });
 * ```
 */
export interface LeadScoreSubscriptionOptions {
  leadId?: string;
  onScoreChange?: (score: number, leadId: string) => void;
}

interface LeadRecord {
  id: string;
  score: number;
  status: string;
  updated_at: string;
}

export function useLeadScoreSubscription(options: LeadScoreSubscriptionOptions = {}) {
  const { leadId, onScoreChange } = options;

  return useSubscription<LeadRecord>({
    table: 'lead',
    events: ['UPDATE'],
    filter: leadId ? `id=eq.${leadId}` : undefined,
    onData: (payload) => {
      if (payload.new && payload.old) {
        const newScore = payload.new.score;
        const oldScore = payload.old.score;

        if (newScore !== oldScore) {
          onScoreChange?.(newScore, payload.new.id);
        }
      }
    },
  });
}

/**
 * Hook for subscribing to activity feed updates
 *
 * @example
 * ```tsx
 * const { activities } = useActivitySubscription({
 *   entityType: 'lead',
 *   entityId: 'lead-123',
 * });
 * ```
 */
export interface ActivitySubscriptionOptions {
  entityType?: 'lead' | 'contact' | 'account' | 'opportunity';
  entityId?: string;
  onActivity?: (activity: ActivityRecord) => void;
}

export interface ActivityRecord {
  id: string;
  type: string;
  title: string;
  description: string | null;
  timestamp: string;
  dateLabel: string | null;
  opportunityId: string | null;
  userId: string | null;
  agentName: string | null;
  agentStatus: string | null;
}

export function useActivitySubscription(options: ActivitySubscriptionOptions = {}) {
  const { entityType, entityId, onActivity } = options;
  const [activities, setActivities] = useState<ActivityRecord[]>([]);

  // Filter by opportunityId if entityType is 'opportunity'
  const filter =
    entityType === 'opportunity' && entityId
      ? `opportunityId=eq.${entityId}`
      : undefined;

  const subscription = useSubscription<ActivityRecord>({
    table: 'activity_events',
    events: ['INSERT', 'UPDATE'],
    filter,
    onData: (payload) => {
      if (payload.new) {
        setActivities((prev) => [payload.new!, ...prev].slice(0, 50));
        onActivity?.(payload.new);
      }
    },
  });

  return {
    ...subscription,
    activities,
  };
}

/**
 * Hook for monitoring real-time connection health
 *
 * @example
 * ```tsx
 * const { isHealthy, latency, reconnectCount } = useRealtimeHealth();
 * ```
 */
export function useRealtimeHealth() {
  const [isHealthy, setIsHealthy] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastPing, setLastPing] = useState<number | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      const start = Date.now();

      try {
        // Simple health check by subscribing/unsubscribing
        const channel = supabase.channel('health-check');
        await new Promise<void>((resolve, reject) => {
          channel.subscribe((status, err) => {
            if (err) reject(err);
            if (status === 'SUBSCRIBED') resolve();
          });

          // Timeout after 5 seconds
          setTimeout(() => reject(new Error('Health check timeout')), 5000);
        });

        await supabase.removeChannel(channel);

        const elapsed = Date.now() - start;
        setLatency(elapsed);
        setLastPing(Date.now());
        setIsHealthy(true);
      } catch {
        setIsHealthy(false);
      }
    };

    // Initial check
    checkHealth();

    // Check every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    isHealthy,
    latency,
    lastPing,
  };
}

// Export supabase client for direct use if needed
export { supabase };
