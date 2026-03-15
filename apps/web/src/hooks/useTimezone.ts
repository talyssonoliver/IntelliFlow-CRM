'use client';

/**
 * Timezone Hook
 *
 * Provides the authenticated user's IANA timezone preference
 * from the backend (User.timezone field).
 *
 * Falls back to browser timezone for unauthenticated users,
 * and to 'UTC' when neither is available.
 *
 * Uses the same pattern as useEnabledModules: trpc query gated
 * on authentication state with 5-minute stale time.
 */

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export interface UseTimezoneResult {
  /** The user's IANA timezone (e.g., "America/New_York") */
  timezone: string;
  /** Whether the timezone is still loading from the server */
  isLoading: boolean;
  /** The browser's detected timezone (independent of user preference) */
  browserTimezone: string;
}

export function useTimezone(): UseTimezoneResult {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data, isLoading } = trpc.user.getProfile.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    select: (profile) => profile.timezone,
  });

  const browserTimezone = getBrowserTimezone();

  // Priority: user preference > browser timezone > UTC
  const timezone = data ?? browserTimezone;

  return {
    timezone,
    isLoading: authLoading || isLoading,
    browserTimezone,
  };
}
