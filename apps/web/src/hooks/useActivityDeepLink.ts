'use client';

import { useEffect, useMemo } from 'react';
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
 * Reads `?activityId=` from the URL and auto-switches to the activity tab.
 * Returns both the original (prefixed) ID and stripped (raw) ID so timelines
 * using either format can match.
 */
export function useActivityDeepLink(
  activeTab: string,
  setActiveTab: (tab: 'activity') => void
) {
  const searchParams = useSearchParams();
  const rawParam = searchParams.get('activityId') ?? null;

  const selectedActivityId = useMemo(() => {
    if (!rawParam) return null;
    const stripped = stripSourcePrefix(rawParam);
    // Return both forms so timeline can match either prefixed or raw ID
    return { prefixed: rawParam, raw: stripped };
  }, [rawParam]);

  // Auto-switch to activity tab when deep-link param is present
  useEffect(() => {
    if (selectedActivityId && activeTab !== 'activity') {
      setActiveTab('activity');
    }
  }, [selectedActivityId, activeTab, setActiveTab]);

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
