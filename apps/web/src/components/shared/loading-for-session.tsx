'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { isTokenUsable } from '@/lib/auth/jwt';
import { readAccessTokenCookie } from '@/lib/shared/session-cleanup';

const noChanges = () => () => undefined;
const hasSessionCookie = () => isTokenUsable(readAccessTokenCookie());
/** The server sends this for loading states, because it cannot tell who will see them. */
const sessionUnknown = () => false;

/**
 * The loading state for routes that can show either the portal or a public page: the
 * portal's skeleton (children) with a session, otherwise a splash: the Aurora logo on the
 * landing page's background colour, so nobody without a session sees the portal's shape.
 */
export function LoadingForSession({ children }: { children: ReactNode }) {
  const hasSession = useSyncExternalStore(noChanges, hasSessionCookie, sessionUnknown);
  if (hasSession) return <>{children}</>;

  return (
    <output
      data-testid="neutral-loading"
      aria-label="Loading"
      className="flex min-h-screen items-center justify-center gap-3 bg-[#f5f7ff]"
    >
      <img src="/brand/aurora/aurora-wave.webp" alt="" className="h-9 w-auto" />
      <img src="/brand/aurora/aurora-wordmark.webp" alt="Aurora" className="h-7 w-auto" />
    </output>
  );
}
