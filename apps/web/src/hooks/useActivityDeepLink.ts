'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Strip the source prefix (e.g., "lead_", "contact_", "chat_") from a unified
 * activity feed ID to get the raw database UUID.
 *
 * The unified feed prefixes IDs like `lead_<uuid>`, `contact_<uuid>`, `chat_<uuid>`.
 * Entity timelines may use either the prefixed or raw format depending on
 * whether they source data from the unified feed (contacts) or directly from
 * Prisma includes (leads). We return both so the timeline can match either.
 */
const SOURCE_PREFIXES = ['lead_', 'contact_', 'opp_', 'ticket_', 'email_', 'call_', 'chat_'];

function stripSourcePrefix(id: string): string {
  for (const prefix of SOURCE_PREFIXES) {
    if (id.startsWith(prefix)) {
      return id.slice(prefix.length);
    }
  }
  return id;
}

/**
 * Reads `?activityId=` from the URL once: it switches to the activity tab, keeps
 * the target for highlighting, and removes the param from the URL. While the
 * param stayed in the URL, every tab change re-ran the switch and the page
 * snapped back to Activity (UI-020).
 *
 * Returns both the original (prefixed) ID and stripped (raw) ID so timelines
 * using either format can match. `_activeTab` is kept for the callers' signature.
 */
export function useActivityDeepLink(_activeTab: string, setActiveTab: (tab: 'activity') => void) {
  const searchParams = useSearchParams();
  const rawParam = searchParams.get('activityId') ?? null;

  // The target outlives the URL param, so the highlight survives its removal.
  const [target, setTarget] = useState<string | null>(rawParam);
  // The param value already acted on; cleared once the URL no longer carries it,
  // so a later link to the same activity works again.
  const consumedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rawParam) {
      consumedRef.current = null;
      return;
    }
    if (consumedRef.current === rawParam) return;
    consumedRef.current = rawParam;
    setTarget(rawParam);
    setActiveTab('activity');

    // The native History API syncs with useSearchParams in the App Router, without a
    // navigation or a refetch.
    const url = new URL(window.location.href);
    url.searchParams.delete('activityId');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  }, [rawParam, setActiveTab]);

  const selectedActivityId = useMemo(() => {
    if (!target) return null;
    // Return both forms so timeline can match either prefixed or raw ID
    return { prefixed: target, raw: stripSourcePrefix(target) };
  }, [target]);

  return { selectedActivityId };
}

/** Check if an activity ID matches the deep-linked target (either prefixed or raw form) */
export function isDeepLinkedActivity(
  activityId: string,
  target: { prefixed: string; raw: string } | null
): boolean {
  if (!target) return false;
  return activityId === target.prefixed || activityId === target.raw;
}
