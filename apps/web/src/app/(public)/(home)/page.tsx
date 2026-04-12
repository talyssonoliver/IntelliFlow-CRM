import type { Metadata } from 'next';
import { getAccessToken } from '@/lib/trpc-server';
import { fetchWelcomeSummary } from '@/lib/cached-queries/home-queries';
import { HomePagePublicWithAuthFallback } from '@/components/home/HomePagePublicWithAuthFallback';
import { AuthenticatedHomePage } from '@/components/home/AuthenticatedHomePage';

export const metadata: Metadata = {
  title: 'AI-first CRM with Governance Built In | IntelliFlow CRM',
  description:
    'IntelliFlow CRM pairs automation with governance-grade validation. Launch AI-first sales, pipeline, and service flows with evidence-backed quality gates.',
  openGraph: {
    title: 'IntelliFlow CRM — AI-first CRM with governed automation',
    description:
      'Automate sales and service with AI while keeping governance, accessibility, and performance guardrails in place.',
    url: 'https://intelliflow-crm.com',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IntelliFlow CRM — Governed AI for Sales Teams',
    description:
      'Automation with safeguards, audit-ready validation, WCAG-aligned experiences, and performance-first UX.',
  },
};

/**
 * Home page — Server Component
 *
 * Reads the auth cookie server-side and renders the correct experience:
 * - Authenticated users → `<AuthenticatedHomePage />` with welcome data prefetched
 *   server-side and passed as `initialWelcomeData`. The greeting and user name
 *   are in the initial HTML, so no client-side hydration flash.
 * - Unauthenticated visitors → `<PublicHomePage />` SSR'd directly with full
 *   marketing content visible to crawlers and Lighthouse on first paint.
 *
 * This is the `/` route's counterpart to `/dashboard/page.tsx`, following the
 * same cached-query prefetch pattern used across the app.
 */
export default async function HomePage() {
  const token = await getAccessToken();

  if (!token) {
    // Server didn't see a token — render the public page. But wrap it in a
    // client component that re-checks auth and swaps to AuthenticatedHomePage
    // if the client turns out to be authenticated (post-login cookie race).
    return <HomePagePublicWithAuthFallback />;
  }

  // Prefetch welcome summary server-side — cached for 60s via 'use cache'.
  // Errors are non-fatal: AuthenticatedHomePage's client-side React Query
  // will fetch on its own if initialWelcomeData is null.
  // JSON roundtrip serialises Date → string across the RSC → client boundary
  // (matches the wire format the client's tRPC React Query cache expects).
  let initialWelcomeData: unknown = null;
  try {
    const raw = await fetchWelcomeSummary(token);
    initialWelcomeData = JSON.parse(JSON.stringify(raw)); // NOSONAR typescript:S7784 — intentional JSON roundtrip for RSC→client boundary
  } catch {
    // Silently fall through — client-side React Query will fetch
  }

  return <AuthenticatedHomePage initialWelcomeData={initialWelcomeData} />;
}
