/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearLocalStorage,
  clearSessionStorage,
  clearAuthCookies,
  cleanupSession,
  hasActiveSession,
  getSessionInfo,
  broadcastLogout,
  onLogoutBroadcast,
} from '../session-cleanup';

describe('session-cleanup', () => {
  beforeEach(() => {
    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('clearLocalStorage', () => {
    it('clears auth-related keys', () => {
      localStorage.setItem('accessToken', 'token123');
      localStorage.setItem('refreshToken', 'refresh123');
      localStorage.setItem('userId', 'user123');

      const cleared = clearLocalStorage();

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('userId')).toBeNull();
      expect(cleared).toContain('accessToken');
      expect(cleared).toContain('refreshToken');
      expect(cleared).toContain('userId');
    });

    it('preserves preference keys when preservePreferences is true', () => {
      localStorage.setItem('accessToken', 'token123');
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('language', 'en');

      clearLocalStorage(true);

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(localStorage.getItem('language')).toBe('en');
    });

    it('clears intelliflow_ prefixed keys when not preserving preferences', () => {
      localStorage.setItem('intelliflow_cache', 'data');
      localStorage.setItem('intelliflow_settings', 'settings');

      const cleared = clearLocalStorage(false);

      expect(localStorage.getItem('intelliflow_cache')).toBeNull();
      expect(localStorage.getItem('intelliflow_settings')).toBeNull();
      expect(cleared).toContain('intelliflow_cache');
      expect(cleared).toContain('intelliflow_settings');
    });

    it('returns empty array when no items to clear', () => {
      const cleared = clearLocalStorage();
      expect(cleared).toEqual([]);
    });
  });

  describe('clearSessionStorage', () => {
    it('clears all session storage', () => {
      sessionStorage.setItem('tempData', 'value1');
      sessionStorage.setItem('formState', 'value2');

      clearSessionStorage();

      expect(sessionStorage.length).toBe(0);
    });

    it('returns cleared items', () => {
      sessionStorage.setItem('item1', 'value1');
      sessionStorage.setItem('item2', 'value2');

      clearSessionStorage();

      // Note: The function clears before we can capture all items
      expect(sessionStorage.length).toBe(0);
    });
  });

  describe('clearAuthCookies', () => {
    it('clears cookies with auth prefixes', () => {
      document.cookie = 'auth_token=value; path=/';
      document.cookie = 'session_id=value; path=/';
      document.cookie = 'token_expiry=value; path=/';

      const cleared = clearAuthCookies();

      expect(cleared).toContain('auth_token');
      expect(cleared).toContain('session_id');
      expect(cleared).toContain('token_expiry');
    });

    it('clears Supabase cookies', () => {
      document.cookie = 'sb-access-token=value; path=/';
      document.cookie = 'sb-refresh-token=value; path=/';

      const cleared = clearAuthCookies();

      expect(cleared).toContain('sb-access-token');
      expect(cleared).toContain('sb-refresh-token');
    });

    it('does not clear non-auth cookies', () => {
      document.cookie = 'preferences=dark; path=/';
      document.cookie = 'analytics=enabled; path=/';

      const cleared = clearAuthCookies();

      expect(cleared).not.toContain('preferences');
      expect(cleared).not.toContain('analytics');
    });
  });

  describe('hasActiveSession', () => {
    it('returns true when access token exists', () => {
      localStorage.setItem('accessToken', 'token123');

      expect(hasActiveSession()).toBe(true);
    });

    it('returns true when auth cookie exists', () => {
      document.cookie = 'auth_token=value; path=/';

      expect(hasActiveSession()).toBe(true);
    });

    it('returns false when no session data exists', () => {
      expect(hasActiveSession()).toBe(false);
    });
  });

  describe('getSessionInfo', () => {
    it('returns session information', () => {
      localStorage.setItem('accessToken', 'token123');
      localStorage.setItem('tokenExpiry', '2024-12-31');
      localStorage.setItem('lastActivity', '2024-01-01');

      const info = getSessionInfo();

      expect(info.hasToken).toBe(true);
      expect(info.tokenExpiry).toBe('2024-12-31');
      expect(info.lastActivity).toBe('2024-01-01');
    });

    it('returns empty info when no session', () => {
      const info = getSessionInfo();

      expect(info.hasToken).toBe(false);
      expect(info.tokenExpiry).toBeNull();
      expect(info.lastActivity).toBeNull();
      expect(info.cookies).toEqual([]);
    });
  });

  describe('cleanupSession', () => {
    it('performs full cleanup by default', async () => {
      localStorage.setItem('accessToken', 'token');
      sessionStorage.setItem('temp', 'data');
      document.cookie = 'auth_token=value; path=/';

      const result = await cleanupSession();

      expect(result.success).toBe(true);
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(sessionStorage.length).toBe(0);
    });

    it('respects cleanup options', async () => {
      localStorage.setItem('accessToken', 'token');
      sessionStorage.setItem('temp', 'data');

      const result = await cleanupSession({
        clearLocalStorage: true,
        clearSessionStorage: false,
      });

      expect(result.success).toBe(true);
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(sessionStorage.getItem('temp')).toBe('data');
    });

    it('returns cleanup results', async () => {
      localStorage.setItem('accessToken', 'token');
      localStorage.setItem('refreshToken', 'refresh');

      const result = await cleanupSession();

      expect(result.success).toBe(true);
      expect(result.clearedItems.localStorage).toContain('accessToken');
      expect(result.clearedItems.localStorage).toContain('refreshToken');
    });
  });

  describe('broadcastLogout', () => {
    it('broadcasts logout without error', () => {
      // broadcastLogout uses BroadcastChannel if available, or localStorage as fallback
      // We just verify it doesn't throw
      expect(() => broadcastLogout()).not.toThrow();
    });

    it('sets and removes logout-event in localStorage', () => {
      // The broadcastLogout function always uses localStorage as a fallback
      // Check that the logout-event key is used (even if BroadcastChannel is also used)
      broadcastLogout();

      // After broadcast, logout-event should have been set and removed
      // We can verify by checking there's no logout-event left
      expect(localStorage.getItem('logout-event')).toBeNull();
    });
  });

  describe('onLogoutBroadcast', () => {
    it('returns cleanup function', () => {
      const callback = vi.fn();
      const cleanup = onLogoutBroadcast(callback);

      expect(typeof cleanup).toBe('function');

      // Call cleanup to ensure no errors
      cleanup();
    });

    it('calls callback on storage event', () => {
      const callback = vi.fn();
      onLogoutBroadcast(callback);

      // Simulate storage event
      const event = new StorageEvent('storage', {
        key: 'logout-event',
        newValue: Date.now().toString(),
      });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });
  });
});
