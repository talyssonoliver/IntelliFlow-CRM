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
export const TICKETS_LIST = 'tickets:list';
export const TICKETS_STATS = 'tickets:stats';
export const TASKS_LIST = 'tasks:list';
export const TASKS_STATS = 'tasks:stats';
export const DEALS_LIST = 'deals:list';
export const DEALS_FORECAST = 'deals:forecast';
export const HELP_ARTICLES_LIST = 'help-articles:list';

// ── Per-user hot-path tags ───────────────────────────────────────
/** Unread notification count — short TTL, per-user isolated */
export const NOTIFICATIONS_UNREAD = 'notifications:unread';
/** Enabled module list — long TTL, per-user/tenant isolated */
export const MODULE_ACCESS = 'module:access';
/** Unified activity feed — short TTL, per-user isolated */
export const ACTIVITY_FEED = 'activity:feed';

// ── Calendar tags ───────────────────────────────────────────────
/** Appointment list + stats on /calendar — short TTL, per-user isolated */
export const CALENDAR_EVENTS = 'calendar:events';

// ── Analytics tags ───────────────────────────────────────────────
/** Analytics overview + conversion funnel on /analytics — per-user isolated */
export const ANALYTICS_OVERVIEW = 'analytics:overview';

// ── Home page tags ──────────────────────────────────────────────
/** AI insights panel on the authenticated home page */
export const HOME_AI_INSIGHTS = 'home:ai-insights';

// ── Composite tags ──────────────────────────────────────────────
export const DASHBOARD = 'dashboard';

// ── Helper: record-specific tag ─────────────────────────────────
export function entityTag(entity: string, id: string): string {
  return `${entity}:${id}`;
}

// ── Helper: per-user tag ─────────────────────────────────────────
/**
 * Returns a per-user cache tag string, e.g. `"user:abc123"`.
 *
 * Pass this alongside entity tags inside `cacheTag()` so that
 * `revalidateTag(userTag(userId))` can flush all cached data for
 * a single user across all procedures (e.g. on logout or role change).
 *
 * If userId is null/undefined (unauthenticated path), returns null
 * so callers can guard with `userId && cacheTag(userTag(userId))`.
 */
export function userTag(userId: string): string {
  return `user:${userId}`;
}
