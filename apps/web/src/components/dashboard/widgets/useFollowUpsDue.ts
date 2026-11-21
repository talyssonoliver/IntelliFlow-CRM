'use client';

import { useMemo } from 'react';
import { api } from '@/lib/api';
import {
  FOLLOW_UP_CARD_LIMIT,
  FOLLOW_UP_SCAN_LIMIT,
  followUpCutoff,
  followUpStatus,
} from '@/lib/leads/follow-ups-due';
import type { FollowUpLead } from './FollowUpsDueSection';

/**
 * The contacted leads whose follow-up is due or overdue, from the same lead.list query the Leads
 * page uses (no new endpoint).
 *
 * Newest due first (#46, 21/11): a follow-up falls due 7 days after the last contact, so sorting
 * by last contact newest first puts the ones due today at the top, then the most recently overdue
 * (still warm), and the oldest last. Sorted the other way the card only ever showed the three
 * leads contacted longest ago ("Overdue by 40 days") and nothing said what was due today.
 *
 * Both the dashboard card and the Tasks page read the first FOLLOW_UP_SCAN_LIMIT rows (one shared
 * query, so their numbers cannot differ) and list the first `limit` of them. `dueToday` counts
 * the rows due today among those read; `dueTodayIsLowerBound` says every row read was due today
 * and there are more, so the true number is at least that.
 */
export function useFollowUpsDue(limit: number = FOLLOW_UP_CARD_LIMIT): {
  leads: FollowUpLead[];
  total: number;
  dueToday: number;
  dueTodayIsLowerBound: boolean;
  isLoading: boolean;
} {
  // Fixed for the life of the card so the query key does not change on every render.
  const now = useMemo(() => new Date(), []);
  const cutoff = useMemo(() => followUpCutoff(now), [now]);

  const { data, isLoading } = api.lead.list.useQuery({
    status: ['CONTACTED'],
    lastContactedBefore: cutoff,
    sortBy: 'lastContactedAt',
    sortOrder: 'desc',
    limit: Math.max(limit, FOLLOW_UP_SCAN_LIMIT),
    page: 1,
  });

  const read: FollowUpLead[] = (data?.data ?? []).map((lead) => ({
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    email: lead.email,
    lastContactedAt: lead.lastContactedAt,
  }));
  const total = data?.total ?? 0;
  const dueToday = read.filter(
    (l) => followUpStatus(l.lastContactedAt, now).tone === 'today'
  ).length;

  return {
    leads: read.slice(0, limit),
    total,
    dueToday,
    dueTodayIsLowerBound: read.length > 0 && dueToday === read.length && total > read.length,
    isLoading,
  };
}
