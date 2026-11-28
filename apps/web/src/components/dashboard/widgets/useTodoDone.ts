'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';

/**
 * The "done" action of the two to-do kinds that are not stored tasks (MVP-012), shared by the
 * Dashboard card and the Tasks page so a checkbox means the same everywhere.
 */

/** Follow-up done: logs a "Followed up" note on the lead, which sets lastContactedAt. */
export function useFollowUpDone() {
  const utils = api.useUtils();
  const mutation = api.lead.logActivity.useMutation({
    // The follow-ups query is lead.list: the lead leaves it once its last contact is today.
    onSuccess: () => utils.lead.list.invalidate(),
  });
  const { mutate } = mutation;
  const markDone = useCallback(
    (leadId: string) => mutate({ leadId, type: 'NOTE', title: 'Followed up' }),
    [mutate]
  );
  return {
    markDone,
    pendingLeadId: mutation.isPending ? mutation.variables?.leadId : undefined,
  };
}

/** Reply done ("handled without a reply"): hides the wait until a newer email arrives. */
export function useWaitingDismiss() {
  const utils = api.useUtils();
  const mutation = api.waiting.dismiss.useMutation({
    // The Leads list filter "Waiting for reply" reads the same loader.
    onSuccess: () => Promise.all([utils.waiting.list.invalidate(), utils.lead.list.invalidate()]),
  });
  return {
    markDone: (kind: 'lead' | 'contact', id: string) => mutation.mutate({ kind, id }),
    pendingKey: mutation.isPending
      ? `${mutation.variables?.kind}:${mutation.variables?.id}`
      : undefined,
  };
}
