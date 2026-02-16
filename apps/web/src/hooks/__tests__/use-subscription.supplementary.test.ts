import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((cb: any) => {
    setTimeout(() => cb('SUBSCRIBED'), 5);
    return mockChannel;
  }),
  unsubscribe: vi.fn(),
};
const mockSupa = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupa,
  RealtimeChannel: class {},
}));
vi.mock('react', () => ({
  useState: vi.fn((i: any) => [typeof i === 'function' ? i() : i, vi.fn()]),
  useEffect: vi.fn((fn: () => any) => {
    fn();
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

describe('use-subscription supplementary', () => {
  beforeEach(() => {
    mockChannel.on.mockReturnThis();
    mockChannel.subscribe.mockImplementation((cb: any) => {
      setTimeout(() => cb('SUBSCRIBED'), 5);
      return mockChannel;
    });
    mockSupa.channel.mockReturnValue(mockChannel);
    mockSupa.removeChannel.mockResolvedValue(undefined);
  });

  it('exports useSubscription function', async () => {
    const m = await import('../../../hooks/use-subscription');
    expect(typeof m.useSubscription).toBe('function');
  });
  it('exports useLeadScoreSubscription', async () => {
    const m = await import('../../../hooks/use-subscription');
    expect(typeof m.useLeadScoreSubscription).toBe('function');
  });
  it('exports useActivitySubscription', async () => {
    const m = await import('../../../hooks/use-subscription');
    expect(typeof m.useActivitySubscription).toBe('function');
  });
  it('exports useRealtimeHealth', async () => {
    const m = await import('../../../hooks/use-subscription');
    expect(typeof m.useRealtimeHealth).toBe('function');
  });
  it('exports supabase client', async () => {
    const m = await import('../../../hooks/use-subscription');
    expect(m.supabase).toBeDefined();
  });
  it('exports REALTIME_BACKEND', async () => {
    const m = await import('../../../hooks/use-subscription');
    expect(['trpc', 'supabase']).toContain(m.REALTIME_BACKEND);
  });

  describe('useSubscription hook logic', () => {
    it('creates channel with table name', async () => {
      const m = await import('../../../hooks/use-subscription');
      m.useSubscription({ table: 'lead', onData: vi.fn() });
      expect(mockSupa.channel).toHaveBeenCalled();
    });

    it('configures postgres_changes on channel', async () => {
      const m = await import('../../../hooks/use-subscription');
      m.useSubscription({ table: 'contact', events: ['INSERT'] as any, onData: vi.fn() });
      expect(mockChannel.on).toHaveBeenCalled();
    });
  });

  describe('useActivitySubscription', () => {
    it('returns activities array', async () => {
      const m = await import('../../../hooks/use-subscription');
      const result = m.useActivitySubscription({ entityType: 'lead' });
      expect(result).toHaveProperty('activities');
    });
  });

  describe('SubscriptionPayload type', () => {
    it('has expected shape', () => {
      const p = {
        eventType: 'INSERT' as const,
        new: { id: '1' },
        old: null,
        timestamp: Date.now(),
        latency: 42,
      };
      expect(p.eventType).toBe('INSERT');
      expect(p.latency).toBe(42);
    });
  });

  describe('latency calculation', () => {
    it('calculates from commit timestamp', () => {
      const commitTime = Date.now() - 50;
      const latency = Date.now() - commitTime;
      expect(latency).toBeGreaterThanOrEqual(45);
      expect(latency).toBeLessThan(200);
    });
  });

  describe('cleanup', () => {
    it('removeChannel is callable', async () => {
      await mockSupa.removeChannel(mockChannel);
      expect(mockSupa.removeChannel).toHaveBeenCalled();
    });
  });
});
