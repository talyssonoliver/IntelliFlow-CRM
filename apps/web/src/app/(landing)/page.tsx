import { HomePagePublicWithAuthFallback } from '@/components/home/HomePagePublicWithAuthFallback';
import { AuroraLandingPage } from '@/components/aurora-landing/AuroraLandingPage';
import { LANDING_METADATA } from '@/components/aurora-landing/landing-metadata';

export const metadata = LANDING_METADATA;

// Prerendered at build time and served from the CDN. Signed-in requests never reach this page:
// the proxy rewrites them to the signed-in home (lib/auth/home-paths).
export const dynamic = 'force-static';

/**
 * The landing page at `/` for signed-out visitors.
 *
 * The client wrapper still swaps in the signed-in home if the browser turns out to have a session
 * (the post-login cookie race), as it did when this page was rendered per request.
 */
export default function LandingPage() {
  return (
    <HomePagePublicWithAuthFallback>
      <AuroraLandingPage />
    </HomePagePublicWithAuthFallback>
  );
}
