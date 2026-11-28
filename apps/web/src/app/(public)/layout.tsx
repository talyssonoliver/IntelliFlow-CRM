import * as React from 'react';
import { AuroraSiteFooter } from '@/components/aurora-site/AuroraSiteFooter';
import { manrope } from '@/components/aurora-site/fonts';
import { PublicLayoutShell } from './_components/PublicLayoutShell';

/**
 * Public route-group layout — Server Component
 *
 * It must not read cookies or headers: that would render every page under it in a
 * function on every request (visitors, crawlers and link prefetches). The pages
 * are prerendered with the public header and footer.
 *
 * For a signed-in visitor, `PublicLayoutShell` drops that chrome once the client
 * knows the session. Until then CSS hides it, keyed on the attribute that the root
 * layout's session-hint script sets before first paint, so it does not flash on
 * refresh (see lib/auth/session-hint).
 *
 * Auth pages (`/login`, `/signup`, etc.) render with no public chrome — the shell
 * detects the path. The signed-in home renders per request from its own layout in
 * `app/(signed-in)/`.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // The Aurora typeface's variable for every public screen, sign-in pages included;
    // `contents` keeps the wrapper out of the layout.
    <div className={manrope.variable} style={{ display: 'contents' }}>
      <PublicLayoutShell isAuthenticated={false} footer={<AuroraSiteFooter />}>
        {children}
      </PublicLayoutShell>
    </div>
  );
}
