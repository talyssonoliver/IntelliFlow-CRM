/**
 * OAuth return page for mailbox sign-in — PG-207 (/email/oauth/callback).
 *
 * A redirect target, not a destination: it has no sidebar entry (documented
 * in navigation-reachability-audit.md). Server shell + Suspense because the
 * client content reads the query.
 */
import { Suspense } from 'react';
import OAuthCallbackContent from './OAuthCallbackContent';

export const metadata = {
  title: 'Connecting Mailbox — Aurora',
  robots: { index: false, follow: false },
};

export default function EmailOAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
