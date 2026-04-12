/**
 * Cache tag constants for Next.js Cache Components.
 *
 * Tags are used with `cacheTag()` inside `'use cache'` blocks and
 * with `revalidateTag()` inside Server Actions to selectively
 * invalidate cached data.
 */

// ── Entity list tags ────────────────────────────────────────────
export const LEADS_LIST = 'leads:list';
export const LEADS_STATS = 'leads:stats';
export const CONTACTS_LIST = 'contacts:list';
export const CONTACTS_STATS = 'contacts:stats';
export const ACCOUNTS_LIST = 'accounts:list';
export const ACCOUNTS_STATS = 'accounts:stats';

// ── Composite tags ──────────────────────────────────────────────
export const DASHBOARD = 'dashboard';

// ── Helper: record-specific tag ─────────────────────────────────
export function entityTag(entity: string, id: string): string {
  return `${entity}:${id}`;
}
