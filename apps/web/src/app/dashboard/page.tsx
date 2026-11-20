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

import { Suspense } from 'react';
import DashboardClient from './DashboardClient';
import Loading from './loading';

// Prerendered, served from the CDN with no function run. The client island reads the URL
// (useSearchParams, through useRequireAuth), so it sits inside a Suspense boundary: the build
// prerenders the same skeleton the page already shows until the auth status is known
// (./loading), and the island renders on the client. The proxy still redirects signed-out
// visits to /login before any HTML is served, and the API checks every call.
// It was `force-dynamic`, which ran a function for every dashboard load (Vercel Hobby active
// CPU budget, 20/11).
export default function DashboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardClient />
    </Suspense>
  );
}
