'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
}

/**
 * Hook for managing activity reactions.
 * Wraps activityFeed.getReactions query + activityFeed.toggleReaction mutation.
 * Provides optimistic updates for instant emoji toggle feedback.
 */
export function useActivityReactions(
  activityIds: string[],
  activitySource: string,
  currentUserId?: string
) {
  // Local optimistic state
  const [optimisticReactions, setOptimisticReactions] = useState<
    Record<string, ReactionGroup[]>
  >({});

  const utils = api.useUtils();

  // Batch-fetch reactions for visible activities
  const { data: serverReactions } = api.activityFeed.getReactions.useQuery(
    { activityIds, activitySource },
    { enabled: activityIds.length > 0 }
  );

  // Sync server data into optimistic state when it arrives
  useEffect(() => {
    if (serverReactions) {
      setOptimisticReactions(serverReactions);
    }
  }, [serverReactions]);

  const toggleMutation = api.activityFeed.toggleReaction.useMutation({
    onSuccess: (data) => {
      // Replace optimistic data with server-confirmed data
      setOptimisticReactions((prev) => ({
        ...prev,
        [data.activityId]: data.reactions,
      }));
      // Invalidate to keep cache consistent
      utils.activityFeed.getReactions.invalidate();
    },
  });

  const toggleReaction = useCallback(
    (activityId: string, emoji: string) => {
      // Optimistic update
      setOptimisticReactions((prev) => {
        const current = [...(prev[activityId] ?? [])];
        const existing = current.find((g) => g.emoji === emoji);
        const userName = currentUserId ?? '';

        if (existing && existing.users.includes(userName)) {
          // Remove reaction optimistically
          existing.count--;
          existing.users = existing.users.filter((u) => u !== userName);
          if (existing.count <= 0) {
            return { ...prev, [activityId]: current.filter((g) => g.emoji !== emoji) };
          }
          return { ...prev, [activityId]: current };
        } else if (existing) {
          // Add user to existing emoji group
          existing.count++;
          existing.users.push(userName);
          return { ...prev, [activityId]: current };
        } else {
          // New emoji group
          return {
            ...prev,
            [activityId]: [...current, { emoji, count: 1, users: [userName] }],
          };
        }
      });

      // Fire mutation
      toggleMutation.mutate({ activityId, activitySource, emoji });
    },
    [activitySource, currentUserId, toggleMutation]
  );

  return {
    reactions: optimisticReactions,
    toggleReaction,
    isToggling: toggleMutation.isPending,
  };
}
