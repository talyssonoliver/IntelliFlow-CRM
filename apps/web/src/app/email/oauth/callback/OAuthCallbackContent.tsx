'use client';

/**
 * Where Google / Microsoft / Zoho send the user back after a mailbox sign-in
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
import { oauthProviderKey, oauthSendOnlyKey } from '../oauth-session';
import { PERSONAL_MAILBOX_NOTICE, parsePersonalRefusal } from '../personal-mailbox';

const SETTINGS_PATH = '/email/email-settings';
const RETURN_NAME = { GMAIL: 'google', MICROSOFT: 'microsoft', ZOHO: 'zoho' } as const;

type Provider = keyof typeof RETURN_NAME;

function isProvider(value: string | null): value is Provider {
  return value === 'GMAIL' || value === 'MICROSOFT' || value === 'ZOHO';
}

function headingFor(personal: boolean, failure: string | null): string {
  if (personal) return 'Confirm your mailbox';
  return failure ? 'Mailbox not connected' : 'Connecting your mailbox';
}

export default function OAuthCallbackContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const params = useSearchParams();
  const router = useRouter();
  const complete = trpc.emailMailbox.oauthComplete.useMutation();
  const restart = trpc.emailMailbox.oauthStart.useMutation();
  // A personal mailbox was signed in: ask once, then sign in again with the confirmation given.
  const [personal, setPersonal] = useState<{
    provider: Provider;
    scope: 'USER' | 'TENANT';
    sendOnly: boolean;
  } | null>(null);
  const started = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated || started.current) return;
    started.current = true;

    const code = params.get('code');
    const state = params.get('state');
    if (params.get('error')) {
      // MVP-011: Google refuses reading for a Workspace domain that does not trust Aurora yet.
      const google = state && sessionStorage.getItem(oauthProviderKey(state)) === 'GMAIL';
      router.replace(`${SETTINGS_PATH}?error=${google ? 'google-denied' : 'denied'}`);
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
    // Zoho names the account's data centre; the server accepts only Zoho's own hosts.
    const accountsServer = provider === 'ZOHO' ? params.get('accounts-server') : null;
    complete
      .mutateAsync({ provider, code, state, ...(accountsServer ? { accountsServer } : {}) })
      .then(() => {
        sessionStorage.removeItem(oauthProviderKey(state));
        sessionStorage.removeItem(oauthSendOnlyKey(state));
        router.replace(`${SETTINGS_PATH}?connected=${RETURN_NAME[provider]}`);
      })
      .catch((error: unknown) => {
        // A restart after the confirmation keeps the original choice to sign in for sending only.
        const sendOnly = sessionStorage.getItem(oauthSendOnlyKey(state)) === '1';
        sessionStorage.removeItem(oauthProviderKey(state));
        sessionStorage.removeItem(oauthSendOnlyKey(state));
        const refusal = parsePersonalRefusal((error as { message?: unknown } | null)?.message);
        if (refusal) {
          setPersonal({ provider, scope: refusal.scope, sendOnly });
          return;
        }
        setFailure(
          'The mailbox could not be connected. The sign-in may have expired or already been used.'
        );
      });
  }, [authLoading, isAuthenticated, params, router, complete]);

  const continueWithPersonal = async () => {
    if (!personal) return;
    try {
      const { url } = await restart.mutateAsync({
        provider: personal.provider,
        scope: personal.scope,
        acceptPersonal: true,
        ...(personal.sendOnly ? { sendOnly: true } : {}),
      });
      const state = new URL(url).searchParams.get('state');
      if (state) {
        sessionStorage.setItem(oauthProviderKey(state), personal.provider);
        if (personal.sendOnly) sessionStorage.setItem(oauthSendOnlyKey(state), '1');
      }
      window.location.assign(url);
    } catch {
      setPersonal(null);
      setFailure('The sign-in could not start again. Go back to Email Settings and try again.');
    }
  };

  useEffect(() => {
    if (failure) alertRef.current?.focus();
  }, [failure]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-lg p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">
          {headingFor(personal !== null, failure)}
        </h1>
        {personal && (
          <div
            role="alertdialog"
            aria-labelledby="personal-mailbox-text"
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 space-y-3"
          >
            <p id="personal-mailbox-text">{PERSONAL_MAILBOX_NOTICE}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
                disabled={restart.isPending}
                onClick={() => void continueWithPersonal()}
              >
                Continue
              </button>
              <Link href={SETTINGS_PATH} className="rounded-md border px-3 py-1.5">
                Cancel
              </Link>
            </div>
          </div>
        )}
        {!personal && failure && (
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
        )}
        {!personal && !failure && (
          <output className="block text-sm text-muted-foreground">Finishing the sign-in…</output>
        )}
      </div>
    </div>
  );
}
