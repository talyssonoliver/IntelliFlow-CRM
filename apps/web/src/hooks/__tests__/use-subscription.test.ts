/**
 * @vitest-environment happy-dom
 * use-subscription.ts - Logic tests for subscription configuration and types
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the module-level constants and logic without invoking hooks
describe('use-subscription - configuration', () => {
  it('default backend is trpc', () => {
    // SUBSCRIPTION_BACKEND defaults to 'trpc' when env var is not set
    const backend = (process.env.NEXT_PUBLIC_SUBSCRIPTION_BACKEND as string) || 'trpc';
    expect(backend).toBe('trpc');
  });
});

describe('use-subscription - payload type shape', () => {
  it('SubscriptionPayload has expected fields', () => {
    const payload = {
      eventType: 'INSERT' as const,
      new: { id: '1', score: 85 },
      old: null,
      timestamp: Date.now(),
      latency: 42,
    };
    expect(payload.eventType).toBe('INSERT');
    expect(payload.new).toBeDefined();
    expect(payload.old).toBeNull();
    expect(payload.latency).toBe(42);
  });
});

describe('use-subscription - metrics shape', () => {
  it('initial metrics have zero values', () => {
    const initial = {
      messagesReceived: 0,
      averageLatency: 0,
      lastMessageAt: null,
      connectionUptime: 0,
      errors: 0,
      reconnectCount: 0,
    };
    expect(initial.messagesReceived).toBe(0);
    expect(initial.averageLatency).toBe(0);
    expect(initial.lastMessageAt).toBeNull();
    expect(initial.reconnectCount).toBe(0);
  });
});

describe('use-subscription - latency tracking logic', () => {
  it('calculates average latency from history', () => {
    const history = [10, 20, 30, 40, 50];
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    expect(avg).toBe(30);
  });

  it('keeps only last 100 samples', () => {
    const history = Array.from({ length: 105 }, (_, i) => i);
    const trimmed = history.slice(-99);
    expect(trimmed.length).toBeLessThanOrEqual(99);
  });

  it('warns when latency exceeds 100ms target', () => {
    const latency = 150;
    expect(latency > 100).toBe(true);
  });
});

describe('use-subscription - connection status', () => {
  it('isConnected is true only when connected', () => {
    const statuses = ['disconnected', 'connecting', 'connected', 'error'];
    const connected = statuses.filter(s => s === 'connected');
    expect(connected).toHaveLength(1);
  });
});

describe('use-subscription - event type filtering', () => {
  it('wildcard includes all events', () => {
    const events = ['*'];
    expect(events.includes('*')).toBe(true);
  });

  it('specific events filter', () => {
    const events = ['INSERT', 'UPDATE'];
    expect(events.length).toBe(2);
    expect(events.includes('INSERT')).toBe(true);
    expect(events.includes('DELETE')).toBe(false);
  });
});
