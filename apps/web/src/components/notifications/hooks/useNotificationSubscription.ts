import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';

interface UseNotificationSubscriptionOptions {
  enabled?: boolean;
  /** Called when a new notification event arrives. The event is used as a signal; its shape is inferred by tRPC. */
  onData?: () => void;
}

/**
 * WebSocket subscription hook for real-time notification events.
 *
 * Pattern follows use-trpc-subscriptions.ts — onStarted, onData, onError callbacks.
 * Uses useAuth (non-redirecting) for tenant context.
 */
export function useNotificationSubscription({
  enabled = true,
  onData,
}: UseNotificationSubscriptionOptions = {}) {
  const { isAuthenticated } = useAuth();

  const handleData = useCallback(() => {
    onData?.();
  }, [onData]);

  trpc.notifications.onNew.useSubscription(
    {},
    {
      enabled: enabled && isAuthenticated,
      onData: handleData,
      onError: (err) => {
        console.error('[useNotificationSubscription] WebSocket error:', err);
      },
    }
  );
}
