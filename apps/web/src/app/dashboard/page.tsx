/**
 * Dashboard Page — Server Component Shell
 *
 * Renders the interactive dashboard as a client island and waits for nothing on the server.
 *
 * It used to read the auth token and await a server-side lead-stats prefetch before returning.
 * The page's script reference is the last thing the HTML stream delivers, so the dashboard's data
 * requests could not start until that wait was over: measured on production (16/11), the dashboard
 * batch started 2-8 ms after the document finished, 300-440 ms in. The prefetch bought nothing
 * visible. The page shows its loading skeleton until the auth status is known, so the server data
 * never reached the first paint, and with data present React Query refetches the tile on mount
 * anyway. The total-leads widget fetches `lead.stats` itself.
 *
 * Task: PG-129 - Dashboard Page, MVP-007
 */

import DashboardClient from './DashboardClient';

// Still rendered per request, as it was while it read the token: the client island reads the URL
// (useSearchParams, through useRequireAuth), and a page with no request-time API would otherwise be
// prerendered, which fails the build or turns the whole tree client-rendered. This removes the
// server wait, not the per-request render.
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return <DashboardClient />;
}
