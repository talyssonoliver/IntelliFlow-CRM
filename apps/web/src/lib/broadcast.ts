/**
 * AuthBroadcast - Cross-Tab Communication Utility
 *
 * Provides cross-tab communication for logout synchronization.
 * Uses BroadcastChannel API with localStorage fallback.
 *
 * IMPLEMENTS: PG-018 (Logout Page) - AC4 Multi-tab synchronization
 *
 * @example
 * ```tsx
 * // Broadcast logout to other tabs
 * authBroadcast.broadcast('LOGOUT_EVENT');
 *
 * // Listen for logout in other tabs
 * useEffect(() => {
 *   const unsubscribe = authBroadcast.subscribe(() => {
 *     // Handle logout from another tab
 *     router.push('/login');
 *   });
 *   return unsubscribe;
 * }, []);
 * ```
 */

// ============================================
// Constants
// ============================================

const CHANNEL_NAME = 'intelliflow-auth-sync';
const STORAGE_KEY = 'intelliflow-logout-event';
const DEBOUNCE_MS = 500;

// ============================================
// Types
// ============================================

type AuthEvent = 'LOGOUT_EVENT';

interface AuthBroadcastMessage {
  type: AuthEvent;
  timestamp: number;
}

// ============================================
// AuthBroadcast Class
// ============================================

export class AuthBroadcast {
  private channel: BroadcastChannel | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBroadcast = 0;
  private subscribers: Set<() => void> = new Set();
  private storageHandler: ((event: StorageEvent) => void) | null = null;

  constructor() {
    if (typeof window === 'undefined') return;

    this.initChannel();
    this.initStorageFallback();
  }

  /**
   * Initialize BroadcastChannel if supported
   */
  private initChannel(): void {
    try {
      if ('BroadcastChannel' in window) {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
          if (event.data?.type === 'LOGOUT_EVENT') {
            this.notifySubscribers();
          }
        };
      }
    } catch (error) {
      console.warn('[AuthBroadcast] BroadcastChannel init failed:', error);
    }
  }

  /**
   * Initialize localStorage fallback for browsers without BroadcastChannel
   */
  private initStorageFallback(): void {
    this.storageHandler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        this.notifySubscribers();
      }
    };
    window.addEventListener('storage', this.storageHandler);
  }

  /**
   * Notify all subscribers of a logout event
   */
  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback();
      } catch (error) {
        console.error('[AuthBroadcast] Subscriber error:', error);
      }
    }
  }

  /**
   * Broadcast an auth event to other tabs
   * Debounced to prevent rapid-fire events
   */
  broadcast(event: AuthEvent): void {
    if (typeof window === 'undefined') return;

    const now = Date.now();

    // Debounce: ignore if called too soon after last broadcast
    if (now - this.lastBroadcast < DEBOUNCE_MS) {
      return;
    }

    // Clear any pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      try {
        const message: AuthBroadcastMessage = {
          type: event,
          timestamp: Date.now(),
        };

        // Try BroadcastChannel first
        if (this.channel) {
          this.channel.postMessage(message);
        }

        // Also use localStorage for fallback (triggers storage event in other tabs)
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
        // Clean up immediately to allow future events
        localStorage.removeItem(STORAGE_KEY);

        this.lastBroadcast = Date.now();
      } catch (error) {
        console.error('[AuthBroadcast] Broadcast error:', error);
      }
    }, 100); // Small delay for debouncing
  }

  /**
   * Subscribe to auth events from other tabs
   * @returns Unsubscribe function
   */
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    if (this.storageHandler) {
      window.removeEventListener('storage', this.storageHandler);
      this.storageHandler = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.subscribers.clear();
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new AuthBroadcast instance
 * Useful for testing or when you need isolated instances
 */
export function createAuthBroadcast(): AuthBroadcast {
  return new AuthBroadcast();
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Singleton instance for app-wide use
 */
export const authBroadcast = typeof window !== 'undefined'
  ? new AuthBroadcast()
  : (null as unknown as AuthBroadcast);
