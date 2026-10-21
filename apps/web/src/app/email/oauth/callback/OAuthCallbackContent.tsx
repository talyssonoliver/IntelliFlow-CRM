'use client';

/**
 * Where Google / Microsoft send the user back after a mailbox sign-in
 * (PG-207, ADR-085, CA-10). The page only forwards `code` + `state` to the
 * authenticated `emailMailbox.oauthComplete`; the server checks the state
 * (hashed, single use, bound to this user and tenant) and the PKCE verifier.
 * A ref keeps StrictMode's double effect from completing twice. Messages are
 * fixed text: nothing from the query is rendered.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { oauthProviderKey } from '../oauth-session';

const SETTINGS_PATH = '/email/email-settings';
const RETURN_NAME = { GMAIL: 'google', MICROSOFT: 'microsoft' } as const;

type Provider = keyof typeof RETURN_NAME;

function isProvider(value: string | null): value is Provider {
  return value === 'GMAIL' || value === 'MICROSOFT';
}

export default function OAuthCallbackContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const params = useSearchParams();
  const router = useRouter();
  const complete = trpc.emailMailbox.oauthComplete.useMutation();
  const started = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated || started.current) return;
    started.current = true;

    const code = params.get('code');
    const state = params.get('state');
    if (params.get('error')) {
      router.replace(`${SETTINGS_PATH}?error=denied`);
      return;
    }
    if (!code || !state) {
      setFailure('This sign-in link is incomplete.');
      return;
    }
    const provider = sessionStorage.getItem(oauthProviderKey(state));
    if (!isProvider(provider)) {
      setFailure('Start the sign-in again from Email Settings.');
      return;
    }
    complete
      .mutateAsync({ provider, code, state })
      .then(() => {
        sessionStorage.removeItem(oauthProviderKey(state));
        router.replace(`${SETTINGS_PATH}?connected=${RETURN_NAME[provider]}`);
      })
      .catch(() => {
        setFailure(
          'The mailbox could not be connected. The sign-in may have expired or already been used.'
        );
      });
  }, [authLoading, isAuthenticated, params, router, complete]);

  useEffect(() => {
    if (failure) alertRef.current?.focus();
  }, [failure]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-lg p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Connecting your mailbox</h1>
        {failure ? (
          <div
            ref={alertRef}
            role="alert"
            tabIndex={-1}
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100 space-y-2"
          >
            <p>{failure}</p>
            <Link href={SETTINGS_PATH} className="font-medium underline underline-offset-4">
              Back to Email Settings
            </Link>
          </div>
        ) : (
          <output className="block text-sm text-muted-foreground">Finishing the sign-in…</output>
        )}
      </div>
    </div>
  );
}
