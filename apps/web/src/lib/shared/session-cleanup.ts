/**
 * Session Cleanup Service
 *
 * Utilities for cleaning up user session data on logout.
 *
 * IMPLEMENTS: PG-018 (Logout page)
 *
 * Features:
 * - Clear localStorage tokens and preferences
 * - Clear sessionStorage data
 * - Clear cookies (auth-related)
 * - Clear IndexedDB caches
 * - Broadcast logout to other tabs
 * - Clean up service workers
 */

// ============================================
// Types
// ============================================

export interface CleanupOptions {
  clearLocalStorage?: boolean;
  clearSessionStorage?: boolean;
  clearCookies?: boolean;
  clearIndexedDB?: boolean;
  broadcastLogout?: boolean;
  preservePreferences?: boolean;
}

export interface CleanupResult {
  success: boolean;
  errors: string[];
  clearedItems: {
    localStorage: string[];
    sessionStorage: string[];
    cookies: string[];
    indexedDB: string[];
  };
}

// ============================================
// Constants
// ============================================

const AUTH_STORAGE_KEYS = [
  'accessToken',
  'refreshToken',
  'idToken',
  'tokenExpiry',
  'sessionId',
  'userId',
  'userRole',
  'mfaVerified',
  'lastActivity',
] as const;

const AUTH_COOKIE_PREFIXES = [
  'auth_',
  'session_',
  'token_',
  'sb-', // Supabase cookies
] as const;

const LOGOUT_CHANNEL = 'intelliflow-logout';

// ============================================
// LocalStorage Cleanup
// ============================================

/**
 * Clear auth-related items from localStorage
 */
export function clearLocalStorage(preservePreferences = false): string[] {
  if (typeof window === 'undefined') return [];

  const clearedItems: string[] = [];

  try {
    // Clear auth keys
    for (const key of AUTH_STORAGE_KEYS) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        clearedItems.push(key);
      }
    }

    // If not preserving preferences, clear all IntelliFlow-related data
    if (!preservePreferences) {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('intelliflow_')) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
        clearedItems.push(key);
      }
    }
  } catch (error) {
    console.error('[SessionCleanup] LocalStorage clear error:', error);
  }

  return clearedItems;
}

// ============================================
// SessionStorage Cleanup
// ============================================

/**
 * Clear all sessionStorage data
 */
export function clearSessionStorage(): string[] {
  if (typeof window === 'undefined') return [];

  const clearedItems: string[] = [];

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key) {
        clearedItems.push(key);
      }
    }
    sessionStorage.clear();
  } catch (error) {
    console.error('[SessionCleanup] SessionStorage clear error:', error);
  }

  return clearedItems;
}

// ============================================
// Cookie Cleanup
// ============================================

/**
 * Get all cookies as key-value pairs
 */
function getAllCookies(): Record<string, string> {
  if (typeof document === 'undefined') return {};

  const cookies: Record<string, string> = {};
  const cookieString = document.cookie;

  if (cookieString) {
    const pairs = cookieString.split(';');
    for (const pair of pairs) {
      const [name, value] = pair.trim().split('=');
      if (name) {
        cookies[name] = value || '';
      }
    }
  }

  return cookies;
}

/**
 * Delete a cookie by name
 */
function deleteCookie(name: string, paths: string[] = ['/', '/api']): void {
  if (typeof document === 'undefined') return;

  const domains = [
    '', // Current domain
    window.location.hostname,
    `.${window.location.hostname}`,
  ];

  for (const path of paths) {
    for (const domain of domains) {
      const domainPart = domain ? `; domain=${domain}` : '';
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domainPart}`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domainPart}; secure`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domainPart}; secure; samesite=lax`;
    }
  }
}

/**
 * Clear auth-related cookies
 */
export function clearAuthCookies(): string[] {
  if (typeof document === 'undefined') return [];

  const clearedCookies: string[] = [];
  const cookies = getAllCookies();

  for (const cookieName of Object.keys(cookies)) {
    const isAuthCookie = AUTH_COOKIE_PREFIXES.some((prefix) =>
      cookieName.toLowerCase().startsWith(prefix)
    );

    if (isAuthCookie) {
      deleteCookie(cookieName);
      clearedCookies.push(cookieName);
    }
  }

  return clearedCookies;
}

// ============================================
// IndexedDB Cleanup
// ============================================

/**
 * Clear IndexedDB databases related to auth/session
 */
export async function clearIndexedDB(): Promise<string[]> {
  if (typeof window === 'undefined' || !window.indexedDB) return [];

  const clearedDatabases: string[] = [];

  try {
    // Get list of databases (if supported)
    if ('databases' in indexedDB) {
      const databases = await indexedDB.databases();

      for (const db of databases) {
        if (db.name && (db.name.includes('auth') || db.name.includes('session'))) {
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(db.name!);
            request.onsuccess = () => {
              clearedDatabases.push(db.name!);
              resolve();
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
              console.warn(`[SessionCleanup] IndexedDB ${db.name} deletion blocked`);
              resolve();
            };
          });
        }
      }
    }
  } catch (error) {
    console.error('[SessionCleanup] IndexedDB clear error:', error);
  }

  return clearedDatabases;
}

// ============================================
// Broadcast Channel (Multi-Tab Logout)
// ============================================

/**
 * Broadcast logout event to other tabs
 */
export function broadcastLogout(): void {
  if (typeof window === 'undefined') return;

  try {
    // Use BroadcastChannel if available
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(LOGOUT_CHANNEL);
      channel.postMessage({ type: 'logout', timestamp: Date.now() });
      channel.close();
    }

    // Fallback: Use localStorage event
    localStorage.setItem('logout-event', Date.now().toString());
    localStorage.removeItem('logout-event');
  } catch (error) {
    console.error('[SessionCleanup] Broadcast error:', error);
  }
}

/**
 * Listen for logout events from other tabs
 */
export function onLogoutBroadcast(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const cleanupFunctions: (() => void)[] = [];

  // BroadcastChannel listener
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(LOGOUT_CHANNEL);
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'logout') {
        callback();
      }
    };
    channel.addEventListener('message', handler);
    cleanupFunctions.push(() => {
      channel.removeEventListener('message', handler);
      channel.close();
    });
  }

  // localStorage fallback listener
  const storageHandler = (event: StorageEvent) => {
    if (event.key === 'logout-event' && event.newValue) {
      callback();
    }
  };
  window.addEventListener('storage', storageHandler);
  cleanupFunctions.push(() => window.removeEventListener('storage', storageHandler));

  // Return cleanup function
  return () => {
    for (const cleanup of cleanupFunctions) {
      cleanup();
    }
  };
}

// ============================================
// Service Worker Cleanup
// ============================================

/**
 * Unregister service workers and clear caches
 */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Clear Cache Storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.includes('auth') || name.includes('user'))
          .map((name) => caches.delete(name))
      );
    }

    // Note: We don't unregister service workers on logout
    // as they may be needed for offline functionality
  } catch (error) {
    console.error('[SessionCleanup] Service worker cache clear error:', error);
  }
}

// ============================================
// Main Cleanup Function
// ============================================

const DEFAULT_OPTIONS: CleanupOptions = {
  clearLocalStorage: true,
  clearSessionStorage: true,
  clearCookies: true,
  clearIndexedDB: true,
  broadcastLogout: true,
  preservePreferences: true,
};

/**
 * Perform complete session cleanup
 *
 * @param options - Cleanup options
 * @returns Result of cleanup operation
 *
 * @example
 * ```tsx
 * // Full cleanup preserving user preferences
 * const result = await cleanupSession();
 *
 * // Full cleanup including preferences
 * const result = await cleanupSession({ preservePreferences: false });
 *
 * // Selective cleanup
 * const result = await cleanupSession({
 *   clearLocalStorage: true,
 *   clearCookies: true,
 *   clearIndexedDB: false,
 * });
 * ```
 */
export async function cleanupSession(
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: CleanupResult = {
    success: true,
    errors: [],
    clearedItems: {
      localStorage: [],
      sessionStorage: [],
      cookies: [],
      indexedDB: [],
    },
  };

  try {
    // Clear localStorage
    if (opts.clearLocalStorage) {
      result.clearedItems.localStorage = clearLocalStorage(opts.preservePreferences);
    }

    // Clear sessionStorage
    if (opts.clearSessionStorage) {
      result.clearedItems.sessionStorage = clearSessionStorage();
    }

    // Clear cookies
    if (opts.clearCookies) {
      result.clearedItems.cookies = clearAuthCookies();
    }

    // Clear IndexedDB
    if (opts.clearIndexedDB) {
      result.clearedItems.indexedDB = await clearIndexedDB();
    }

    // Clear service worker caches
    await clearServiceWorkerCaches();

    // Broadcast logout to other tabs
    if (opts.broadcastLogout) {
      broadcastLogout();
    }

    console.log('[SessionCleanup] Session cleanup complete:', result.clearedItems);
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    console.error('[SessionCleanup] Session cleanup error:', error);
  }

  return result;
}

/**
 * Check if there's an active session
 */
export function hasActiveSession(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for access token in localStorage
  const hasToken = localStorage.getItem('accessToken') !== null;

  // Check for session cookie
  const cookies = getAllCookies();
  const hasSessionCookie = Object.keys(cookies).some((name) =>
    AUTH_COOKIE_PREFIXES.some((prefix) => name.toLowerCase().startsWith(prefix))
  );

  return hasToken || hasSessionCookie;
}

/**
 * Get session info for debugging
 */
export function getSessionInfo(): {
  hasToken: boolean;
  tokenExpiry: string | null;
  lastActivity: string | null;
  cookies: string[];
} {
  if (typeof window === 'undefined') {
    return {
      hasToken: false,
      tokenExpiry: null,
      lastActivity: null,
      cookies: [],
    };
  }

  return {
    hasToken: localStorage.getItem('accessToken') !== null,
    tokenExpiry: localStorage.getItem('tokenExpiry'),
    lastActivity: localStorage.getItem('lastActivity'),
    cookies: Object.keys(getAllCookies()).filter((name) =>
      AUTH_COOKIE_PREFIXES.some((prefix) => name.toLowerCase().startsWith(prefix))
    ),
  };
}
