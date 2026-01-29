/**
 * useLogout Hook
 *
 * Orchestrates the logout flow with proper cleanup:
 * 1. Clear client-side tokens (synchronous, security-critical)
 * 2. Clear React Query cache
 * 3. Broadcast logout to other tabs
 * 4. Attempt server notification (best effort, 3s timeout)
 * 5. Redirect to login page
 *
 * IMPLEMENTS: PG-018 (Logout Page)
 * - AC2: All auth tokens cleared
 * - AC3: React Query cache cleared
 * - AC6: Server notification attempted
 * - AC7: Graceful degradation when server unreachable
 * - AC8: Redirect to /login
 *
 * @example
 * ```tsx
 * function LogoutButton() {
 *   const { logout, isLoggingOut, error } = useLogout();
 *
 *   return (
 *     <button onClick={logout} disabled={isLoggingOut}>
 *       {isLoggingOut ? 'Signing out...' : 'Sign out'}
 *     </button>
 *   );
 * }
 * ```
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authBroadcast } from '@/lib/broadcast';
import { cleanupSession } from '@/lib/shared/session-cleanup';

// ============================================
// Types
// ============================================

export interface UseLogoutReturn {
  /** Execute logout */
  logout: () => Promise<void>;
  /** Whether logout is in progress */
  isLoggingOut: boolean;
  /** Error if logout failed */
  error: Error | null;
}

// ============================================
// Constants
// ============================================

const SERVER_TIMEOUT_MS = 3000;

// ============================================
// Hook
// ============================================

/**
 * Hook for handling user logout with full cleanup
 */
export function useLogout(): UseLogoutReturn {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Use ref to track if logout is in progress (for idempotency)
  const logoutInProgress = useRef(false);

  const logout = useCallback(async () => {
    // Idempotency: Don't run if already logging out
    if (logoutInProgress.current) {
      return;
    }

    logoutInProgress.current = true;
    setIsLoggingOut(true);
    setError(null);

    try {
      // Step 1: Clear client-side tokens immediately (security-critical)
      await cleanupSession({
        clearLocalStorage: true,
        clearSessionStorage: true,
        clearCookies: true,
        clearIndexedDB: true,
        broadcastLogout: false, // We'll handle broadcast separately
        preservePreferences: true,
      });

      // Step 2: Clear React Query cache
      queryClient.clear();

      // Step 3: Broadcast logout to other tabs
      if (authBroadcast) {
        authBroadcast.broadcast('LOGOUT_EVENT');
      }

      // Step 4: Server notification (best effort, 3s timeout)
      try {
        await Promise.race([
          fetch('/api/auth/logout', { method: 'POST' }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Server timeout')), SERVER_TIMEOUT_MS)
          ),
        ]);
      } catch (serverError) {
        // Log but don't fail - tokens are already cleared
        console.warn('[useLogout] Server notification failed:', serverError);
      }

      // Step 5: Redirect to login
      router.push('/login?logged_out=true');
    } catch (err) {
      const logoutError = err instanceof Error ? err : new Error('Logout failed');
      setError(logoutError);
      console.error('[useLogout] Logout error:', err);

      // Even on error, try to redirect to prevent stuck state
      router.push('/login?error=logout_failed');
    } finally {
      setIsLoggingOut(false);
      logoutInProgress.current = false;
    }
  }, [queryClient, router]);

  return {
    logout,
    isLoggingOut,
    error,
  };
}
