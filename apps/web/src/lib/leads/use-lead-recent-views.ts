'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * PG-059 — Recently-Viewed Leads (client-side)
 *
 * Backs the `/leads?view=recent` sidebar entry. Maintains a capped,
 * de-duplicated list of lead ids in localStorage so the Lead List can fetch
 * only the leads the user has recently opened via `api.lead.list({ ids })`.
 *
 * Server-side persistence is intentionally out of scope for this task:
 * "recently viewed" is inherently a per-device UX signal. If a team-wide
 * audit is needed later, the `ids` filter on `lead.list` is already a reusable
 * building block.
 */

const STORAGE_KEY = 'intelliflow:leads:recent-views';
const MAX_RECENT = 20;

function safeRead(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function safeWrite(ids: readonly string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* quota exceeded / private mode — silently ignore */
  }
}

export function pushRecentLeadView(id: string): void {
  if (!id) return;
  const current = safeRead();
  const next = [id, ...current.filter((existing) => existing !== id)].slice(0, MAX_RECENT);
  safeWrite(next);
}

export function useLeadRecentViews(): {
  readonly recentIds: readonly string[];
  readonly push: (id: string) => void;
  readonly clear: () => void;
} {
  const [recentIds, setRecentIds] = useState<readonly string[]>(() => safeRead());

  useEffect(() => {
    // React to cross-tab updates.
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) setRecentIds(safeRead());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const push = useCallback((id: string) => {
    pushRecentLeadView(id);
    setRecentIds(safeRead());
  }, []);

  const clear = useCallback(() => {
    safeWrite([]);
    setRecentIds([]);
  }, []);

  return { recentIds, push, clear };
}
