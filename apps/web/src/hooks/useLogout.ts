/**
 * useLogout Hook
 *
 * Orchestrates the logout flow with proper cleanup:
 * 1. Attempt server logout (best effort, 3s timeout), which needs the access token
 * 2. Clear client-side tokens (security-critical)
 * 3. Clear React Query cache
 * 4. Broadcast logout to other tabs
 * 5. Leave with a full page load to the public home page, which drops everything the
 *    running page holds in memory (see leaveAfterLogout)
 *
 * IMPLEMENTS: PG-018 (Logout Page)
 * - AC2: All auth tokens cleared
 * - AC3: React Query cache cleared
 * - AC6: Server notification attempted
 * - AC7: Graceful degradation when server unreachable
 * - AC8: Redirect to the public home page (owner decision, was /login)
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
import { cleanupSession, leaveAfterLogout } from '@/lib/shared/session-cleanup';
import { trpc } from '@/lib/trpc';

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

  // Use tRPC mutation for server-side logout
  const logoutMutation = trpc.auth.logout.useMutation();

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
      // Step 1: Server logout via tRPC (best effort, 3s timeout). This comes first
      // because the call needs the access token, to revoke the user's sessions.
      // IFC-007: Fixed to use tRPC instead of non-existent REST endpoint
      try {
        const serverResult = await Promise.race([
          logoutMutation.mutateAsync(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Server timeout')), SERVER_TIMEOUT_MS)
          ),
        ]);
        if (!serverResult.success) {
          console.warn(
            `[useLogout] Sessions not revoked on the server: ${serverResult.providerSignOut}`
          );
        }
      } catch (serverError) {
        // Log but don't fail - tokens are cleared next, whatever the server said
        console.warn('[useLogout] Server notification failed:', serverError);
      }

      // Step 2: Clear client-side tokens (security-critical), and tell other tabs. The
      // broadcast is sent synchronously, so the page load below cannot cancel it.
      await cleanupSession({
        clearLocalStorage: true,
        clearSessionStorage: true,
        clearCookies: true,
        clearIndexedDB: true,
        broadcastLogout: true,
        preservePreferences: true,
      });

      // Step 3: Clear React Query cache
      queryClient.clear();

      // Step 4: Leave
      leaveAfterLogout('/');
    } catch (err) {
      const logoutError = err instanceof Error ? err : new Error('Logout failed');
      setError(logoutError);
      console.error('[useLogout] Logout error:', err);

      // Even on error, leave the page, so nothing stays on screen
      leaveAfterLogout('/login?error=logout_failed');
    } finally {
      setIsLoggingOut(false);
      logoutInProgress.current = false;
    }
  }, [queryClient, logoutMutation]);

  return {
    logout,
    isLoggingOut,
    error,
  };
}
