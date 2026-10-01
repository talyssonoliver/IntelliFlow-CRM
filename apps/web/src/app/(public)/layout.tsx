import * as React from 'react';
import { AuroraSiteFooter } from '@/components/aurora-site/AuroraSiteFooter';
import { manrope } from '@/components/aurora-site/fonts';
import { PublicLayoutShell } from './_components/PublicLayoutShell';
import { getAccessToken } from '@/lib/trpc-server';

/**
 * Public route-group layout — Server Component
 *
 * Reads the auth cookie server-side to decide what shell to wrap around the
 * public-group children. This is what avoids the PublicHeader flash on refresh
 * for authenticated users: the decision is made at SSR time, before any HTML
 * is sent to the browser.
 *
 * Strategy:
 * - Auth pages (`/login`, `/signup`, etc.) always render with no public chrome —
 *   they have their own full-screen backgrounds. The `PublicLayoutShell` client
 *   component detects the path via `usePathname()` and handles this.
 * - For other public routes, the server decides based on the token cookie
 *   whether to show the Aurora header and footer. Authenticated users on `/`
 *   skip the public chrome entirely so only the authenticated shell renders.
 * - The root `app/layout.tsx` already renders the authenticated `<Navigation />`
 *   globally, so authed users get their normal app chrome wrapping whatever the
 *   server-rendered content is.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const token = await getAccessToken();
  const isAuthenticated = token !== null;

  return (
    // The Aurora typeface's variable for every public screen, sign-in pages included;
    // `contents` keeps the wrapper out of the layout.
    <div className={manrope.variable} style={{ display: 'contents' }}>
      {/* The footer is rendered here, on the server, so it follows the server's
          auth decision and never flashes in or out on hydration. */}
      <PublicLayoutShell
        isAuthenticated={isAuthenticated}
        footer={isAuthenticated ? undefined : <AuroraSiteFooter />}
      >
        {children}
      </PublicLayoutShell>
    </div>
  );
}
