import { getAccessToken } from '@/lib/trpc-server';
import { decodeJwtPayload } from '@/lib/auth/jwt';
import { fetchWelcomeSummary } from '@/lib/cached-queries/home-queries';
import { fetchAIInsights } from '@/lib/cached-queries/ai-insights-queries';
import { serializeForClient } from '@/lib/shared/serialize-for-client';
import { HomePagePublicWithAuthFallback } from '@/components/home/HomePagePublicWithAuthFallback';
import { AuroraLandingPage } from '@/components/aurora-landing/AuroraLandingPage';
import { AuthenticatedHomePage } from '@/components/home/AuthenticatedHomePage';
import { LANDING_METADATA } from '@/components/aurora-landing/landing-metadata';

export const metadata = LANDING_METADATA;

/**
 * Signed-in home — Server Component, rendered per request.
 *
 * The proxy rewrites `/` here when the request carries a usable access token (see
 * lib/auth/home-paths). Signed-out visits to `/` never reach this page: they get the prerendered
 * landing page in `app/(landing)`, served from the CDN.
 *
 * Reads the auth cookie server-side and renders the correct experience:
 * - Users whose session the API accepts → `<AuthenticatedHomePage />` with welcome data prefetched
 *   server-side and passed as `initialWelcomeData`. The greeting and user name
 *   are in the initial HTML, so no client-side hydration flash.
 * - A token the API does not accept → the Aurora landing page, as before.
 *
 * This is the `/` route's counterpart to `/dashboard/page.tsx`, following the
 * same cached-query prefetch pattern used across the app.
 */
export default async function HomePage() {
  const token = await getAccessToken();

  // No session the server can vouch for: render the public page. But wrap it in a
  // client component that re-checks auth and swaps to AuthenticatedHomePage
  // if the client turns out to be authenticated (post-login cookie race).
  const publicPage = (
    <HomePagePublicWithAuthFallback>
      <AuroraLandingPage />
    </HomePagePublicWithAuthFallback>
  );

  if (!token) return publicPage;

  // Decode userId from the JWT payload (outside 'use cache' boundary — safe here).
  const userId = decodeJwtPayload(token)?.sub ?? null;

  // getAccessToken only reads the cookie's expiry, so the portal waits for the API to have
  // accepted this exact token. Any failure renders the public page, and the client wrapper
  // still swaps in the portal for a real session if the API was only briefly unreachable.
  // This is not a live check: 'use cache' answers from the entry for this token while it
  // lasts, without asking the API, and the API accepts a token until it expires (#1160).
  // JSON roundtrip serialises Date → string across the RSC → client boundary
  // (matches the wire format the client's tRPC React Query cache expects).
  let initialWelcomeData: unknown;
  try {
    const raw = await fetchWelcomeSummary(token, userId);
    initialWelcomeData = serializeForClient(raw);
  } catch {
    return publicPage;
  }

  // Prefetch AI insights server-side — cached for ~60s via 'use cache'.
  // Primes the Next.js cache so the client-side React Query request for
  // home.getAIInsights resolves from cache (< 1ms) instead of hitting the
  // database (observed at 263ms). Errors are non-fatal: the client query
  // will re-fetch independently if this warm-up fails.
  try {
    await fetchAIInsights(token, userId);
  } catch {
    // Silently fall through — client-side React Query will fetch
  }

  return <AuthenticatedHomePage initialWelcomeData={initialWelcomeData} />;
}
