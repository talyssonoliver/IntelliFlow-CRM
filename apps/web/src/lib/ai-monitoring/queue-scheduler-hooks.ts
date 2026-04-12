'use client';

/**
 * Queue Scheduler Hooks — IFC-296
 *
 * Wraps queuesAdmin tRPC procedures for queue list and mutations.
 * Pattern: useFailedJobs in hooks.ts
 */

import { api } from '@/lib/api';
import type { QueueSchedulerData, SchedulerQueueName } from './types';

// ---------------------------------------------------------------------------
// useQueueScheduler — list all queues with 60s auto-refresh (AC-012)
// ---------------------------------------------------------------------------

export function useQueueScheduler() {
  const query = api.queuesAdmin.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const data = query.data as QueueSchedulerData | undefined;

  return {
    data: data ?? null,
    isLoading: query.isLoading,
    isUnavailable: !query.isLoading && !!query.error,
    error: query.error as Error | null,
    refetch: () => {
      query.refetch();
    },
  };
}

// ---------------------------------------------------------------------------
// useQueueMutations — pause/resume/retry/delete with auto-invalidation
// ---------------------------------------------------------------------------

export function useQueueMutations() {
  const utils = api.useUtils();

  const invalidate = () => {
    utils.queuesAdmin.list.invalidate();
  };

  const pauseMutation = api.queuesAdmin.pause.useMutation({ onSuccess: invalidate });
  const resumeMutation = api.queuesAdmin.resume.useMutation({ onSuccess: invalidate });
  const retryFailedMutation = api.queuesAdmin.retryFailed.useMutation({ onSuccess: invalidate });
  const deleteSchedulerMutation = api.queuesAdmin.deleteScheduler.useMutation({
    onSuccess: invalidate,
  });

  // Build isPending map safely — variables may be undefined when not pending
  const pending: Partial<Record<SchedulerQueueName, boolean>> = {};
  const vars = [
    pauseMutation.isPending ? pauseMutation.variables : null,
    resumeMutation.isPending ? resumeMutation.variables : null,
    retryFailedMutation.isPending ? retryFailedMutation.variables : null,
    deleteSchedulerMutation.isPending ? deleteSchedulerMutation.variables : null,
  ];
  for (const v of vars) {
    if (v && typeof v === 'object' && 'name' in v && typeof v.name === 'string') {
      pending[v.name as SchedulerQueueName] = true;
    }
  }

  return {
    pause: (name: SchedulerQueueName) => pauseMutation.mutate({ name }),
    resume: (name: SchedulerQueueName) => resumeMutation.mutate({ name }),
    retryFailed: (name: SchedulerQueueName) => retryFailedMutation.mutate({ name }),
    deleteScheduler: (name: SchedulerQueueName, schedulerId: string) =>
      deleteSchedulerMutation.mutate({ name, schedulerId }),
    isPending: pending,
  };
}
