/**
 * Named cache profiles mapping to Next.js built-in cacheLife presets.
 *
 * Usage inside `'use cache'` blocks:
 *   cacheLife(DASHBOARD_STATS)
 *
 * See https://nextjs.org/docs/app/api-reference/directives/use-cache
 */

/** 60-second revalidation — dashboard stats, list pages */
export const DASHBOARD_STATS = 'minutes' as const;

/** 60-second revalidation — entity list pages */
export const LIST_PAGE = 'minutes' as const;

/** ~1 hour revalidation — record detail pages */
export const RECORD_DETAIL = 'hours' as const;

/** ~1 day revalidation — rarely-changing reference data */
export const REFERENCE = 'days' as const;
