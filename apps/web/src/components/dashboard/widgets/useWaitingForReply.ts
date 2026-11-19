'use client';

import { api } from '@/lib/api';
import { WAITING_CARD_LIMIT } from '@/lib/leads/waiting-for-reply';
import type { WaitingPerson } from './WaitingForReplySection';

/** Who is waiting for our reply, oldest first, from the waiting.list query (MVP-014). */
export function useWaitingForReply(): {
  people: WaitingPerson[];
  total: number;
  leadTotal: number;
  isLoading: boolean;
} {
  const { data, isLoading } = api.waiting.list.useQuery({ limit: WAITING_CARD_LIMIT });
  return {
    people: data?.items ?? [],
    total: data?.total ?? 0,
    leadTotal: data?.leadTotal ?? 0,
    isLoading,
  };
}
