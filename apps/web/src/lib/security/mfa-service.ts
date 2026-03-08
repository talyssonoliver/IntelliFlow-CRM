'use client';

/**
 * MFA Service Hooks
 * Client-side hooks for MFA management operations
 * PG-125: AC-001 (data layer)
 */

import { trpc } from '@/lib/trpc';

/**
 * Hook for querying MFA status
 * Return type is inferred from tRPC — no separate frontend type needed
 */
export function useMfaStatus() {
  return trpc.auth.getMfaStatus.useQuery();
}

/**
 * Hook for disabling MFA
 * Invalidates getMfaStatus query on success
 */
export function useDisableMfa() {
  const utils = trpc.useUtils();
  return trpc.auth.disableMfa.useMutation({
    onSuccess: () => {
      utils.auth.getMfaStatus.invalidate();
    },
  });
}

/**
 * Hook for regenerating backup codes
 * Invalidates getMfaStatus query on success
 */
export function useRegenerateBackupCodes() {
  const utils = trpc.useUtils();
  return trpc.auth.regenerateBackupCodes.useMutation({
    onSuccess: () => {
      utils.auth.getMfaStatus.invalidate();
    },
  });
}
