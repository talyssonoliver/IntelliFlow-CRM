/**
 * Tour Storage — PG-126
 *
 * localStorage wrapper for the "first-visit" tour seen flag. Every accessor
 * SSR-guards on `typeof window === 'undefined'` so importing this module from
 * a Server Component (or rendering the calling component on the server) is
 * safe.
 */
const KEY_PREFIX = 'intelliflow.public.tour.';
const SEEN_SUFFIX = '.seen';

export function tourSeenKey(tourId: string): string {
  return `${KEY_PREFIX}${tourId}${SEEN_SUFFIX}`;
}

export function getTourSeenAt(tourId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(tourSeenKey(tourId));
  } catch {
    return null;
  }
}

export function markTourSeen(tourId: string): void {
  if (typeof window === 'undefined') return;
  try {
    // Idempotent: never overwrite an existing timestamp.
    if (window.localStorage.getItem(tourSeenKey(tourId))) return;
    window.localStorage.setItem(tourSeenKey(tourId), new Date().toISOString());
  } catch {
    /* quota exceeded / blocked — not a failure mode worth crashing on. */
  }
}

export function clearTourSeen(tourId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(tourSeenKey(tourId));
  } catch {
    /* no-op */
  }
}
