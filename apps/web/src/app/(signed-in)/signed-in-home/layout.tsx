import * as React from 'react';
import { AuroraSiteFooter } from '@/components/aurora-site/AuroraSiteFooter';
import { manrope } from '@/components/aurora-site/fonts';
import { PublicLayoutShell } from '@/app/(public)/_components/PublicLayoutShell';
import { getAccessToken } from '@/lib/trpc-server';

/**
 * Layout for the signed-in home. It sits outside `(public)/` on purpose: it reads
 * the auth cookie, so it renders per request. The public pages must not, or every
 * visit, crawler and link prefetch runs a function.
 */
export default async function SignedInHomeLayout({ children }: { children: React.ReactNode }) {
  const token = await getAccessToken();
  const isAuthenticated = token !== null;

  return (
    <div className={manrope.variable} style={{ display: 'contents' }}>
      <PublicLayoutShell
        isAuthenticated={isAuthenticated}
        footer={isAuthenticated ? undefined : <AuroraSiteFooter />}
      >
        {children}
      </PublicLayoutShell>
    </div>
  );
}
