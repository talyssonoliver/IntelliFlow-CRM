/**
 * Tests for AuthBroadcast utility
 *
 * @module apps/web/src/lib/__tests__/broadcast.test.ts
 * IMPLEMENTS: PG-018 (Logout Page) - AC4 Multi-tab synchronization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAuthBroadcast } from '../broadcast';

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private static instances: MockBroadcastChannel[] = [];

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    // Simulate broadcast to other channels with same name
    for (const instance of MockBroadcastChannel.instances) {
      if (instance !== this && instance.name === this.name && instance.onmessage) {
        instance.onmessage(new MessageEvent('message', { data }));
      }
    }
  }

  close(): void {
    const index = MockBroadcastChannel.instances.indexOf(this);
    if (index > -1) {
      MockBroadcastChannel.instances.splice(index, 1);
    }
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') {
      this.onmessage = listener;
    }
  }

  removeEventListener(): void {
    this.onmessage = null;
  }

  static clearInstances(): void {
    MockBroadcastChannel.instances = [];
  }
}

describe('AuthBroadcast', () => {
  let originalBroadcastChannel: typeof BroadcastChannel | undefined;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    vi.useFakeTimers();
    originalBroadcastChannel = globalThis.BroadcastChannel;
    originalLocalStorage = globalThis.localStorage;

    // Mock localStorage
    const storage: Record<string, string> = {};
    globalThis.localStorage = {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key];
      }),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    } as unknown as Storage;

    MockBroadcastChannel.clearInstances();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.BroadcastChannel = originalBroadcastChannel as typeof BroadcastChannel;
    globalThis.localStorage = originalLocalStorage;
    MockBroadcastChannel.clearInstances();
  });

  describe('BroadcastChannel support', () => {
    it('should use BroadcastChannel when available', () => {
      globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

      const broadcast = createAuthBroadcast();
      const callback = vi.fn();

      broadcast.subscribe(callback);
      broadcast.broadcast('LOGOUT_EVENT');

      // Allow for debounce
      vi.advanceTimersByTime(600);

      // The broadcast should have been sent via BroadcastChannel
      expect(callback).not.toHaveBeenCalled(); // Same instance doesn't receive
    });

    it('should fallback to localStorage when BroadcastChannel unavailable', () => {
      // @ts-expect-error - intentionally removing BroadcastChannel
      delete globalThis.BroadcastChannel;

      const broadcast = createAuthBroadcast();
      broadcast.broadcast('LOGOUT_EVENT');

      vi.advanceTimersByTime(600);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'intelliflow-logout-event',
        expect.any(String)
      );
    });
  });

  describe('logout broadcast', () => {
    it('should broadcast LOGOUT_EVENT to other tabs', () => {
      globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

      const broadcast1 = createAuthBroadcast();
      const broadcast2 = createAuthBroadcast();
      const callback = vi.fn();

      broadcast2.subscribe(callback);
      broadcast1.broadcast('LOGOUT_EVENT');

      vi.advanceTimersByTime(600);

      expect(callback).toHaveBeenCalled();
    });

    it('should debounce multiple rapid broadcasts', () => {
      globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

      const broadcast1 = createAuthBroadcast();
      const broadcast2 = createAuthBroadcast();
      const callback = vi.fn();

      broadcast2.subscribe(callback);

      // Rapid fire broadcasts
      broadcast1.broadcast('LOGOUT_EVENT');
      broadcast1.broadcast('LOGOUT_EVENT');
      broadcast1.broadcast('LOGOUT_EVENT');

      vi.advanceTimersByTime(600);

      // Should only receive once due to debounce
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle broadcast errors gracefully', () => {
      globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

      const broadcast = createAuthBroadcast();

      // Force an error by mocking postMessage to throw
      const mockChannel = MockBroadcastChannel as unknown as { prototype: { postMessage: () => void } };
      const originalPostMessage = mockChannel.prototype.postMessage;
      mockChannel.prototype.postMessage = () => {
        throw new Error('Broadcast failed');
      };

      // Should not throw
      expect(() => {
        broadcast.broadcast('LOGOUT_EVENT');
        vi.advanceTimersByTime(600);
      }).not.toThrow();

      mockChannel.prototype.postMessage = originalPostMessage;
    });
  });

  describe('listener', () => {
    it('should call callback when LOGOUT_EVENT received', () => {
      globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

      const broadcast1 = createAuthBroadcast();
      const broadcast2 = createAuthBroadcast();
      const callback = vi.fn();

      broadcast2.subscribe(callback);
      broadcast1.broadcast('LOGOUT_EVENT');

      vi.advanceTimersByTime(600);

      expect(callback).toHaveBeenCalled();
    });

    it('should unsubscribe when cleanup called', () => {
      globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

      const broadcast1 = createAuthBroadcast();
      const broadcast2 = createAuthBroadcast();
      const callback = vi.fn();

      const unsubscribe = broadcast2.subscribe(callback);
      unsubscribe(); // Cleanup

      broadcast1.broadcast('LOGOUT_EVENT');
      vi.advanceTimersByTime(600);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
