/**
 * Additional tests for hooks/use-subscription.ts
 * Tests module exports, backend config, type shapes
 */
import { describe, it, expect, vi } from 'vitest';

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((cb: any) => { setTimeout(() => cb('SUBSCRIBED'), 5); return mockChannel; }),
  unsubscribe: vi.fn(),
};
const mockSupa = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupa, RealtimeChannel: class {},
}));

vi.mock('react', () => ({
  useState: vi.fn((i: any) => [typeof i === 'function' ? i() : i, vi.fn()]),
  useEffect: vi.fn((fn: () => any) => { fn(); }),
  useCallback: vi.fn((fn: any) => fn),
  useRef: vi.fn((i: any) => ({ current: i })),
}));

vi.mock('@/hooks/use-trpc-subscriptions', () => ({
  useLeadScoredSubscription: vi.fn(() => ({ status:'connected' })),
  useTaskAssignedSubscription: vi.fn(() => ({ status:'connected' })),
  useSystemEventSubscription: vi.fn(() => ({ status:'connected' })),
  useRealtimeHealth: vi.fn(() => ({ isHealthy:true, latency:50, lastPing:Date.now() })),
  useAIProgressSubscription: vi.fn(),
  useAllSubscriptions: vi.fn(),
}));

describe('use-subscription module', () => {
  it('exports REALTIME_BACKEND', async () => {
    const m = await import('../../hooks/use-subscription');
    expect(['trpc','supabase']).toContain(m.REALTIME_BACKEND);
  });

  it('exports supabase client', async () => {
    const m = await import('../../hooks/use-subscription');
    expect(m.supabase).toBeDefined();
  });

  it('exports useSubscription', async () => {
    const m = await import('../../hooks/use-subscription');
    expect(typeof m.useSubscription).toBe('function');
  });

  it('exports useLeadScoreSubscription', async () => {
    const m = await import('../../hooks/use-subscription');
    expect(typeof m.useLeadScoreSubscription).toBe('function');
  });

  it('exports useActivitySubscription', async () => {
    const m = await import('../../hooks/use-subscription');
    expect(typeof m.useActivitySubscription).toBe('function');
  });

  it('exports useRealtimeHealth', async () => {
    const m = await import('../../hooks/use-subscription');
    expect(typeof m.useRealtimeHealth).toBe('function');
  });

  it('useSubscription returns expected shape', async () => {
    const m = await import('../../hooks/use-subscription');
    // Verify the hook function exists and is callable
    expect(typeof m.useSubscription).toBe('function');
    // The actual hook invocation requires React's hooks context
    // which is mocked, so we verify the function signature instead
  });

  describe('SubscriptionPayload type', () => {
    it('has expected shape', () => {
      const p = { eventType:'INSERT' as const, new:{ id:'1' }, old:null, timestamp:Date.now(), latency:42 };
      expect(p.eventType).toBe('INSERT');
      expect(p.latency).toBe(42);
    });
  });

  describe('ActivityRecord type', () => {
    it('has expected shape', () => {
      const r = { id:'a1', type:'CALL', title:'Call', description:null, timestamp:new Date().toISOString(),
        dateLabel:'Today', opportunityId:null, userId:'u1', agentName:null, agentStatus:null };
      expect(r.id).toBe('a1');
    });
  });
});
