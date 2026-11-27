import * as React from 'react';
import { AuroraSiteFooter } from '@/components/aurora-site/AuroraSiteFooter';
import { manrope } from '@/components/aurora-site/fonts';
import { PublicLayoutShell } from '../(public)/_components/PublicLayoutShell';

/**
 * Layout for the prerendered landing page at `/`.
 *
 * It is the signed-out branch of the `(public)` layout, without the cookie read: only signed-out
 * requests reach this page, because the proxy rewrites a signed-in `/` to the signed-in home
 * (lib/auth/home-paths). Reading no cookie is what lets `/` be prerendered and served from the
 * CDN instead of running a function on every visit.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={manrope.variable} style={{ display: 'contents' }}>
      <PublicLayoutShell isAuthenticated={false} footer={<AuroraSiteFooter />}>
        {children}
      </PublicLayoutShell>
    </div>
  );
}
