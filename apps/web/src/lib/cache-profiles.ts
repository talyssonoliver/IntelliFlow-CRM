/**
 * Named cache profiles mapping to Next.js built-in cacheLife presets.
 *
 * Usage inside `'use cache'` blocks:
 *   cacheLife(DASHBOARD_STATS)
 *
 * See https://nextjs.org/docs/app/api-reference/directives/use-cache
 */

/**
 * ~30-second revalidation — hot-path per-user data that changes
 * frequently (e.g. unread notification count).
 *
 * Short enough to stay fresh across a page session; long enough to
 * collapse the 3× per-page duplicate requests observed in dev logs
 * into a single upstream tRPC call.
 */
export const REALTIME = 'seconds' as const;

/** 60-second revalidation — dashboard stats, list pages */
export const DASHBOARD_STATS = 'minutes' as const;

/** 60-second revalidation — entity list pages */
export const LIST_PAGE = 'minutes' as const;

/** ~1 hour revalidation — record detail pages */
export const RECORD_DETAIL = 'hours' as const;

/** ~1 day revalidation — rarely-changing reference data */
export const REFERENCE = 'days' as const;
