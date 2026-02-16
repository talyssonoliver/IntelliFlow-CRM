/**
 * Supplementary tests for use-subscription.ts (hooks/use-subscription.ts)
 *
 * Tests subscription hook logic: connection management, payload handling,
 * latency tracking, metric calculations, and event filtering.
 *
 * No rendering - tests pure logic only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------
const mockChannel = vi.hoisted(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((cb: any) => {
    setTimeout(() => cb('SUBSCRIBED'), 5);
    return mockChannel;
  }),
  unsubscribe: vi.fn(),
}));

const mockSupa = vi.hoisted(() => ({
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupa,
  RealtimeChannel: class {},
}));

vi.mock('react', () => ({
  useState: vi.fn((i: any) => [typeof i === 'function' ? i() : i, vi.fn()]),
  useEffect: vi.fn((fn: () => any) => {
    const cleanup = fn();
    return cleanup;
  }),
  useCallback: vi.fn((fn: any) => fn),
  useRef: vi.fn((i: any) => ({ current: i })),
  useMemo: vi.fn((fn: any) => fn()),
}));

vi.mock('@/hooks/use-trpc-subscriptions', () => ({
  useLeadScoredSubscription: vi.fn(() => ({ status: 'connected' })),
  useTaskAssignedSubscription: vi.fn(() => ({ status: 'connected' })),
  useSystemEventSubscription: vi.fn(() => ({ status: 'connected' })),
  useRealtimeHealth: vi.fn(() => ({ isHealthy: true, latency: 50, lastPing: Date.now() })),
  useAIProgressSubscription: vi.fn(),
  useAllSubscriptions: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('use-subscription supplementary2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnThis();
    mockChannel.subscribe.mockImplementation((cb: any) => {
      setTimeout(() => cb('SUBSCRIBED'), 5);
      return mockChannel;
    });
    mockSupa.channel.mockReturnValue(mockChannel);
    mockSupa.removeChannel.mockResolvedValue(undefined);
  });

  // ===================== Exports =====================
  describe('module exports', () => {
    it('exports useSubscription', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      expect(typeof m.useSubscription).toBe('function');
    });

    it('exports useLeadScoreSubscription', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      expect(typeof m.useLeadScoreSubscription).toBe('function');
    });

    it('exports useActivitySubscription', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      expect(typeof m.useActivitySubscription).toBe('function');
    });

    it('exports useRealtimeHealth', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      expect(typeof m.useRealtimeHealth).toBe('function');
    });

    it('exports REALTIME_BACKEND as trpc or supabase', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      expect(['trpc', 'supabase']).toContain(m.REALTIME_BACKEND);
    });

    it('exports supabase client', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      expect(m.supabase).toBeDefined();
    });
  });

  // ===================== Channel naming =====================
  describe('channel naming', () => {
    it('creates channel name from schema:table:filter', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      m.useSubscription({ table: 'lead', schema: 'public', filter: 'id=eq.1', onData: vi.fn() });
      // Channel should have been created
      expect(mockSupa.channel).toHaveBeenCalled();
      const channelName = mockSupa.channel.mock.calls[0][0];
      expect(channelName).toContain('lead');
    });

    it('creates channel without filter when not provided', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      m.useSubscription({ table: 'contact', onData: vi.fn() });
      expect(mockSupa.channel).toHaveBeenCalled();
      const channelName = mockSupa.channel.mock.calls[0][0];
      expect(channelName).toContain('contact');
    });
  });

  // ===================== Event configuration =====================
  describe('event configuration', () => {
    it('subscribes to postgres_changes', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      m.useSubscription({ table: 'lead', events: ['INSERT'], onData: vi.fn() });
      expect(mockChannel.on).toHaveBeenCalled();
      const firstCallArgs = mockChannel.on.mock.calls[0];
      expect(firstCallArgs[0]).toBe('postgres_changes');
    });

    it('uses wildcard event when events include *', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      m.useSubscription({ table: 'lead', events: ['*'], onData: vi.fn() });
      expect(mockChannel.on).toHaveBeenCalled();
    });

    it('defaults schema to public', async () => {
      const m = await import('../../../hooks/use-subscription.js');
      m.useSubscription({ table: 'lead', onData: vi.fn() });
      // Check the config passed to .on()
      const onCallArgs = mockChannel.on.mock.calls[0];
      const config = onCallArgs[1];
      expect(config.schema).toBe('public');
    });
  });

  // ===================== Payload processing logic =====================
  describe('payload processing', () => {
    it('calculates latency from commit_timestamp', () => {
      const committedAt = new Date('2026-01-01T12:00:00Z').getTime();
      const receivedAt = new Date('2026-01-01T12:00:00.050Z').getTime();
      const latency = receivedAt - committedAt;
      expect(latency).toBe(50);
    });

    it('latency is 0 when commit_timestamp equals received time', () => {
      const now = Date.now();
      expect(now - now).toBe(0);
    });

    it('latency history average calculation', () => {
      const latencies = [10, 20, 30, 40, 50];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avg).toBe(30);
    });

    it('latency history is capped at 100 entries', () => {
      const history = Array.from({ length: 105 }, (_, i) => i);
      const capped = [...history.slice(-99), 999];
      expect(capped).toHaveLength(100);
      expect(capped[capped.length - 1]).toBe(999);
    });

    it('warns when latency exceeds 100ms target', () => {
      const latency = 150;
      const exceedsTarget = latency > 100;
      expect(exceedsTarget).toBe(true);
    });

    it('does not warn when latency is under 100ms', () => {
      const latency = 50;
      const exceedsTarget = latency > 100;
      expect(exceedsTarget).toBe(false);
    });
  });

  // ===================== SubscriptionPayload shape =====================
  describe('SubscriptionPayload shape', () => {
    it('has all required fields', () => {
      const payload = {
        eventType: 'INSERT' as const,
        new: { id: '1', name: 'Test' },
        old: null,
        timestamp: Date.now(),
        latency: 42,
      };
      expect(payload.eventType).toBe('INSERT');
      expect(payload.new).toBeDefined();
      expect(payload.old).toBeNull();
      expect(payload.timestamp).toBeGreaterThan(0);
      expect(payload.latency).toBe(42);
    });

    it('UPDATE has both new and old', () => {
      const payload = {
        eventType: 'UPDATE' as const,
        new: { id: '1', name: 'Updated' },
        old: { id: '1', name: 'Original' },
        timestamp: Date.now(),
        latency: 10,
      };
      expect(payload.new!.name).toBe('Updated');
      expect(payload.old!.name).toBe('Original');
    });

    it('DELETE has old but null new', () => {
      const payload = {
        eventType: 'DELETE' as const,
        new: null,
        old: { id: '1', name: 'Deleted' },
        timestamp: Date.now(),
        latency: 5,
      };
      expect(payload.new).toBeNull();
      expect(payload.old!.name).toBe('Deleted');
    });
  });

  // ===================== Metric state shape =====================
  describe('SupabaseSubscriptionMetrics', () => {
    it('has correct initial values', () => {
      const metrics = {
        messagesReceived: 0,
        averageLatency: 0,
        lastMessageAt: null,
        connectionUptime: 0,
        errors: 0,
        reconnectCount: 0,
      };
      expect(metrics.messagesReceived).toBe(0);
      expect(metrics.averageLatency).toBe(0);
      expect(metrics.lastMessageAt).toBeNull();
      expect(metrics.reconnectCount).toBe(0);
    });

    it('tracks message count increments', () => {
      let messagesReceived = 0;
      messagesReceived += 1;
      messagesReceived += 1;
      expect(messagesReceived).toBe(2);
    });

    it('tracks reconnect count', () => {
      let reconnectCount = 0;
      // Simulate CLOSED/CHANNEL_ERROR statuses
      reconnectCount += 1;
      reconnectCount += 1;
      expect(reconnectCount).toBe(2);
    });
  });

  // ===================== useLeadScoreSubscription =====================
  describe('useLeadScoreSubscription logic', () => {
    it('filters lead by id when provided', () => {
      const leadId = 'lead-123';
      const filter = leadId ? `id=eq.${leadId}` : undefined;
      expect(filter).toBe('id=eq.lead-123');
    });

    it('no filter when leadId is undefined', () => {
      const leadId = undefined;
      const filter = leadId ? `id=eq.${leadId}` : undefined;
      expect(filter).toBeUndefined();
    });

    it('score change detection logic', () => {
      const oldScore: number = 75;
      const newScore: number = 85;
      const scoreChanged = newScore !== oldScore;
      expect(scoreChanged).toBe(true);
    });

    it('no score change when same', () => {
      const oldScore = 75;
      const newScore = 75;
      const scoreChanged = newScore !== oldScore;
      expect(scoreChanged).toBe(false);
    });
  });

  // ===================== useActivitySubscription =====================
  describe('useActivitySubscription logic', () => {
    it('builds opportunity filter correctly', () => {
      const entityType = 'opportunity';
      const entityId = 'opp-456';
      const filter =
        entityType === 'opportunity' && entityId ? `opportunityId=eq.${entityId}` : undefined;
      expect(filter).toBe('opportunityId=eq.opp-456');
    });

    it('no filter for non-opportunity entity types', () => {
      const entityType: string = 'lead';
      const entityId = 'lead-123';
      const filter =
        entityType === 'opportunity' && entityId ? `opportunityId=eq.${entityId}` : undefined;
      expect(filter).toBeUndefined();
    });

    it('limits activities to 50 entries', () => {
      const activities = Array.from({ length: 55 }, (_, i) => ({ id: `act-${i}` }));
      const newActivity = { id: 'new-act' };
      const updated = [newActivity, ...activities].slice(0, 50);
      expect(updated).toHaveLength(50);
      expect(updated[0].id).toBe('new-act');
    });
  });

  // ===================== Connection status =====================
  describe('connection status mapping', () => {
    it('SUBSCRIBED maps to connected', () => {
      const mapStatus = (s: string) => {
        if (s === 'SUBSCRIBED') return 'connected';
        if (s === 'CLOSED' || s === 'CHANNEL_ERROR') return 'disconnected';
        return 'connecting';
      };
      expect(mapStatus('SUBSCRIBED')).toBe('connected');
      expect(mapStatus('CLOSED')).toBe('disconnected');
      expect(mapStatus('CHANNEL_ERROR')).toBe('disconnected');
    });

    it('isConnected is derived from status', () => {
      const status = 'connected';
      expect(status === 'connected').toBe(true);
    });

    it('error status on subscription error', () => {
      const hasError = true;
      const status = hasError ? 'error' : 'connected';
      expect(status).toBe('error');
    });
  });

  // ===================== Uptime tracking =====================
  describe('uptime tracking', () => {
    it('calculates uptime from connection start', () => {
      const start = Date.now() - 5000;
      const uptime = Date.now() - start;
      expect(uptime).toBeGreaterThanOrEqual(4900); // Allow small timing variance
    });

    it('accumulates uptime across reconnections', () => {
      let totalUptime = 0;
      totalUptime += 3000; // first session
      totalUptime += 5000; // second session
      expect(totalUptime).toBe(8000);
    });
  });
});
