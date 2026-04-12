'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from '@intelliflow/ui';

export interface CommentItem {
  id: string;
  text: string;
  user: string;
  timestamp: string;
}

/**
 * Hook for managing activity comments (replies).
 * Wraps activityFeed.getComments query + activityFeed.addComment mutation.
 */
export function useActivityComments(activityIds: string[], activitySource: string) {
  const [optimisticComments, setOptimisticComments] = useState<Record<string, CommentItem[]>>({});

  const utils = api.useUtils();

  const { data: serverComments } = api.activityFeed.getComments.useQuery(
    { activityIds, activitySource },
    { enabled: activityIds.length > 0 }
  );

  useEffect(() => {
    if (serverComments) {
      setOptimisticComments(serverComments);
    }
  }, [serverComments]);

  const addCommentMutation = api.activityFeed.addComment.useMutation({
    onSuccess: () => {
      toast({ title: 'Reply added', description: 'Your reply has been posted.' });
      utils.activityFeed.getComments.invalidate();
    },
    onError: (err) => {
      toast({ title: 'Reply failed', description: err.message, variant: 'destructive' });
      // Revert optimistic update
      if (serverComments) {
        setOptimisticComments(serverComments);
      }
    },
  });

  const addComment = useCallback(
    (activityId: string, text: string) => {
      // Optimistic update
      const optimistic: CommentItem = {
        id: `temp-${Date.now()}`,
        text,
        user: 'You',
        timestamp: new Date().toISOString(),
      };
      setOptimisticComments((prev) => ({
        ...prev,
        [activityId]: [...(prev[activityId] ?? []), optimistic],
      }));

      addCommentMutation.mutate({ activityId, activitySource, text });
    },
    [activitySource, addCommentMutation]
  );

  return {
    comments: optimisticComments,
    addComment,
    isAdding: addCommentMutation.isPending,
  };
}
