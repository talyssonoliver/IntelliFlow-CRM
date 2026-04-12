'use client';

import { useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { PinnableEntityType } from '@intelliflow/validators';

export interface UseEntityPinOptions {
  entityType: PinnableEntityType;
  entityId: string;
  title: string;
  subtitle?: string;
  icon?: string;
  url: string;
}

export interface UseEntityPinReturn {
  isPinned: boolean;
  isLoading: boolean;
  togglePin: () => void;
  pin: () => void;
  unpin: () => void;
}

export function useEntityPin(options: UseEntityPinOptions): UseEntityPinReturn {
  const { entityType, entityId, title, subtitle, icon, url } = options;

  const utils = trpc.useUtils();

  const { data: pinnedData, isLoading: queryLoading } = trpc.home.getPinnedItems.useQuery(
    undefined,
    { staleTime: 30_000 }
  );

  const isPinned = useMemo(() => {
    if (!pinnedData?.items) return false;
    return pinnedData.items.some(
      (item) => item.entityType === entityType && item.entityId === entityId
    );
  }, [pinnedData, entityType, entityId]);

  const pinMutation = trpc.home.pinItem.useMutation({
    onSuccess: () => {
      utils.home.getPinnedItems.invalidate();
    },
  });

  const unpinMutation = trpc.home.unpinItem.useMutation({
    onSuccess: () => {
      utils.home.getPinnedItems.invalidate();
    },
  });

  const isMutating = pinMutation.isPending || unpinMutation.isPending;

  const pin = useCallback(() => {
    if (isMutating || isPinned) return;
    pinMutation.mutate({ entityType, entityId, title, subtitle, icon, url });
  }, [entityType, entityId, title, subtitle, icon, url, isMutating, isPinned, pinMutation]);

  const unpin = useCallback(() => {
    if (isMutating || !isPinned) return;
    unpinMutation.mutate({ entityType, entityId });
  }, [entityType, entityId, isMutating, isPinned, unpinMutation]);

  const togglePin = useCallback(() => {
    if (isPinned) {
      unpin();
    } else {
      pin();
    }
  }, [isPinned, pin, unpin]);

  return {
    isPinned,
    isLoading: queryLoading || isMutating,
    togglePin,
    pin,
    unpin,
  };
}
