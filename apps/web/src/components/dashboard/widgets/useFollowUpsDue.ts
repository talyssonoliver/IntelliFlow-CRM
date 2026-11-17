'use client';

import { useMemo } from 'react';
import { api } from '@/lib/api';
import { FOLLOW_UP_CARD_LIMIT, followUpCutoff } from '@/lib/leads/follow-ups-due';
import type { FollowUpLead } from './FollowUpsDueSection';

/**
 * The contacted leads whose follow-up is due or overdue, the most overdue first, from the same
 * lead.list query the Leads page uses (no new endpoint). `total` counts them all; `leads` holds
 * the few the dashboard card lists.
 */
export function useFollowUpsDue(): { leads: FollowUpLead[]; total: number; isLoading: boolean } {
  // Fixed for the life of the card so the query key does not change on every render.
  const cutoff = useMemo(() => followUpCutoff(new Date()), []);

  const { data, isLoading } = api.lead.list.useQuery({
    status: ['CONTACTED'],
    lastContactedBefore: cutoff,
    sortBy: 'lastContactedAt',
    sortOrder: 'asc',
    limit: FOLLOW_UP_CARD_LIMIT,
    page: 1,
  });

  const leads = (data?.data ?? []).map((lead) => ({
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    email: lead.email,
    lastContactedAt: lead.lastContactedAt,
  }));

  return { leads, total: data?.total ?? 0, isLoading };
}
