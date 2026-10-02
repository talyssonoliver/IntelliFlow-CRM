'use client';

/**
 * OAuth Callback Component
 *
 * Handles OAuth provider callbacks after successful authentication.
 *
 * IMPLEMENTS: PG-024 (SSO Callback)
 *
 * Features:
 * - Extracts and validates OAuth params from URL
 * - Exchanges authorization code for session
 * - Stores session tokens and fingerprint
 * - Displays loading/success/error states
 * - Provides retry and back-to-login actions
 *
 * Flow:
 * 1. User clicks SSO button on login page
 * 2. Redirected to OAuth provider (Google/Microsoft)
 * 3. Provider redirects back here with code in URL
 * 4. Component extracts params, validates, exchanges for session
 * 5. On success: stores session, redirects to dashboard
 * 6. On error: displays error with retry option
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, cn } from '@intelliflow/ui';
import { getSupabaseBrowserClient, clearSupabaseLocalStorage } from '@/lib/supabase-browser';
import { storeSessionFingerprint } from '@/lib/shared/login-security';
import {
  storeSessionTokens,
  clearSessionTokens,
  getStoredAccessToken,
} from '@/lib/shared/token-exchange';
import {
  syncTokenToCookie,
  clearTokenCookie,
  recordAuthBreadcrumb,
} from '@/lib/shared/session-cleanup';
import { safeNextPath } from '@/lib/shared/safe-next-path';
import { clearActiveTenant, isValidTenantId, setActiveTenantId } from '@/lib/tenant/active-tenant';
import { claimLoginGrant, ClaimLoginGrantError } from '@/lib/tenant/claim-grant';

// ============================================
// Types
// ============================================

export type OAuthCallbackStatus = 'loading' | 'exchanging' | 'confirm' | 'success' | 'error';

export interface OAuthCallbackProps {
  /** Callback when authentication succeeds */
  onSuccess?: (user: { id: string; email?: string }, session: { accessToken: string }) => void;
  /** Callback when authentication fails */
  onError?: (error: string) => void;
  /** URL to redirect to after success (default: /dashboard) */
  redirectUrl?: string;
  /** Additional CSS classes */
  className?: string;
}

interface StatusConfig {
  icon: string;
  title: string;
  description: string;
  iconColor: string;
  bgColor: string;
  animate?: boolean;
}

/** Best-effort email of the current local session, read from the stored access token. */
function currentSessionEmail(): string | null {
  try {
    const token = getStoredAccessToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/** Ceiling for any single awaited network step (signOut, verifyOtp, grant claim, getSession). */
const STEP_TIMEOUT_MS = 10_000;
/** Ceiling for the whole callback while it shows a spinner: the page may never hang silently. */
const FLOW_TIMEOUT_MS = 30_000;

/** Reject with `TIMEOUT` if `promise` has not settled within `ms`; the timer never leaks. */
function withTimeout<T>(promise: Promise<T>, ms: number = STEP_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Breadcrumb labels are fixed literals. Never build one from component state or refs (the same
 * hooks hold the magic-link token): the trace is written to sessionStorage and must stay
 * free of anything derived from a credential.
 */
const BREADCRUMBS = {
  oauth: {
    established: 'oauth:session-established',
    cookie: 'oauth:cookie-synced',
    error: 'oauth:error',
  },
  magiclink: {
    established: 'magiclink:session-established',
    cookie: 'magiclink:cookie-synced',
    error: 'magiclink:error',
  },
} as const;

interface PendingMagicLink {
  tokenHash: string;
  next: string;
  /** ADR-071 `tenant` hint, validated on arrival. */
  tenantHint: string | null;
  /** ADR-071 `grant` to claim with the new session's token. */
  grant: string | null;
}

// ============================================
// Component
// ============================================

export function OAuthCallback({
  onSuccess,
  onError,
  redirectUrl = '/dashboard',
  className,
}: Readonly<OAuthCallbackProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<OAuthCallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const hasCalledRef = useRef(false);
  // The magic-link token lives only in memory: it is stripped from the address bar on arrival
  // and never re-read from the URL, so it cannot be replayed from history or a stale render.
  const pendingLinkRef = useRef<PendingMagicLink | null>(null);
  const pendingNextRef = useRef<string | null>(null);
  const flowRef = useRef<'oauth' | 'magiclink'>('oauth');
  const backToLoginRef = useRef<HTMLButtonElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const abortedRef = useRef(false);

  // Shared post-login steps for the OAuth and magic-link paths.
  const finishSignIn = useCallback(
    (
      session: { access_token: string; refresh_token?: string },
      user: { id: string; email?: string } | undefined,
      flow: 'oauth' | 'magiclink',
      activeTenantId: string | null = null
    ) => {
      // The watchdog already showed the error state: a step that finally resolved must not
      // sign the user in behind a screen that said it failed.
      if (abortedRef.current) return;
      setStatus('success');
      recordAuthBreadcrumb(BREADCRUMBS[flow].established);

      // ADR-071: a fresh sign-in starts from a known tenant. A magic link names the tenant it
      // was minted for (the client CRM the Portal opened); every other sign-in starts in the
      // user's home tenant. A selection left over from a previous session is never reused.
      if (activeTenantId) {
        setActiveTenantId(activeTenantId);
      } else {
        clearActiveTenant();
      }

      // Store tokens for API calls (our custom token management)
      storeSessionTokens(session.access_token, session.refresh_token);

      // Sync the access token to the `accessToken` cookie so Next.js SSR server
      // components (which read the cookie, not localStorage) see the session
      // immediately on the post-login redirect — otherwise the first server
      // render of /dashboard misses auth and flashes the unauthenticated view.
      syncTokenToCookie(session.access_token);
      recordAuthBreadcrumb(BREADCRUMBS[flow].cookie);

      // Store device fingerprint for session verification
      storeSessionFingerprint();

      // Set login success flag for AuthContext grace window (SF-002: use timestamp)
      sessionStorage.setItem('oauth_login_success', Date.now().toString());

      // Clean up Supabase localStorage keys so the SDK doesn't auto-recover
      // a stale session on subsequent page loads (we manage tokens ourselves).
      clearSupabaseLocalStorage();

      // Call success callback or redirect
      if (onSuccess) {
        onSuccess(
          { id: user?.id ?? '', email: user?.email },
          { accessToken: session.access_token }
        );
        return;
      }

      // Redirect after brief success state (300ms per NF-004)
      const target = flow === 'magiclink' ? (pendingNextRef.current ?? '/dashboard') : redirectUrl;
      setTimeout(() => {
        router.push(target);
      }, 300);
    },
    [onSuccess, router, redirectUrl]
  );

  const reportError = useCallback(
    (err: unknown) => {
      if (err instanceof Error && err.message === 'TIMEOUT') abortedRef.current = true;
      setStatus('error');
      recordAuthBreadcrumb(BREADCRUMBS[flowRef.current].error);
      let errorMsg: string;
      if (err instanceof Error) {
        errorMsg =
          err.message === 'TIMEOUT'
            ? 'Authentication is taking too long. Please try again.'
            : err.message;
      } else {
        errorMsg = 'An unexpected error occurred';
      }
      setErrorMessage(errorMsg);
      onError?.(errorMsg);
    },
    [onError]
  );

  // Exchange the in-memory hashed OTP. Any existing local session is signed out FIRST so a
  // different user's session can never win. Only ever reached automatically when there is no
  // session, or after the user explicitly confirmed the account switch.
  const exchangeMagicLink = useCallback(async () => {
    const pending = pendingLinkRef.current;
    pendingLinkRef.current = null; // single use
    if (!pending) throw new Error('This sign-in link has already been used.');
    setStatus('exchanging');

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error('Failed to initialize authentication client');
    }

    try {
      await withTimeout(supabase.auth.signOut({ scope: 'local' }));
    } catch {
      // Nothing to sign out, the call failed, or it hung on the auth lock: our own token
      // cleanup below still applies.
    }
    clearSessionTokens();
    clearTokenCookie();
    clearSupabaseLocalStorage();

    const { data, error } = await withTimeout(
      supabase.auth.verifyOtp({ type: 'magiclink', token_hash: pending.tokenHash })
    );

    if (error || !data?.session) {
      throw new Error(
        'This sign-in link is invalid or has expired. Please go back to sign in and try again.'
      );
    }

    // ADR-071: the link carries `tenant` and `grant` as HINTS. The grant is claimed FIRST, with
    // the new session's token: for a pinned (agency staff) link this is what binds the session
    // to the client tenant, and until it is claimed the API refuses everything else. The
    // tenant the server returns wins over the `tenant` hint. A failed claim fails CLOSED:
    // the session is dropped rather than left half signed in.
    let activeTenantId = pending.tenantHint;
    if (pending.grant) {
      try {
        const claim = await withTimeout(claimLoginGrant(data.session.access_token, pending.grant));
        activeTenantId = claim.tenantId;
      } catch (claimError) {
        try {
          await withTimeout(supabase.auth.signOut({ scope: 'local' }));
        } catch {
          // The local cleanup below still applies.
        }
        clearSessionTokens();
        clearTokenCookie();
        clearSupabaseLocalStorage();
        throw claimError instanceof ClaimLoginGrantError ||
          (claimError instanceof Error && claimError.message === 'TIMEOUT')
          ? claimError
          : new Error(
              'This sign-in link is invalid or has expired. Please go back to sign in and try again.'
            );
      }
    }

    pendingNextRef.current = pending.next;
    finishSignIn(data.session, data.user ?? undefined, 'magiclink', activeTenantId);
  }, [finishSignIn]);

  // Magic-link flow (partner Portal -> CRM): /auth/callback?token_hash=...&type=magiclink&next=...
  //
  // Anyone can mint a link for their own account and send it to a signed-in victim (login CSRF),
  // so when a local session already exists we do NOT swap accounts silently: the user must
  // confirm on an interstitial. With no session the exchange runs automatically.
  const handleMagicLink = useCallback(
    async (tokenHash: string, linkType: string | null) => {
      // Capture every link parameter BEFORE the URL is stripped below.
      const rawNext = searchParams.get('next');
      const tenantParam = searchParams.get('tenant');
      const grant = searchParams.get('grant');
      flowRef.current = 'magiclink';
      // Keep the token out of the address bar / history before anything is rendered.
      try {
        globalThis.history.replaceState(null, '', globalThis.location.pathname);
      } catch {
        // History API unavailable: the token is still only used from memory below.
      }
      if (linkType !== 'magiclink') {
        throw new Error('This sign-in link is not valid. Please request a new one.');
      }
      pendingLinkRef.current = {
        tokenHash,
        next: safeNextPath(rawNext),
        tenantHint: isValidTenantId(tenantParam) ? tenantParam : null,
        grant,
      };

      if (getStoredAccessToken()) {
        setCurrentEmail(currentSessionEmail());
        setStatus('confirm');
        return;
      }
      await exchangeMagicLink();
    },
    [exchangeMagicLink, searchParams]
  );

  // Handle the OAuth callback flow.
  //
  // With detectSessionInUrl: true, the Supabase SDK's _initialize() method
  // detects the ?code= parameter, reads the PKCE code_verifier from
  // PkceAwareStorage (localStorage), and exchanges the code for a session
  // automatically. We just need to wait for initialization to finish, then
  // read the session via getSession().
  const handleCallback = useCallback(async () => {
    try {
      const tokenHash = searchParams.get('token_hash');
      if (tokenHash) {
        await handleMagicLink(tokenHash, searchParams.get('type'));
        return;
      }

      // Bookmarked URL detection: no params at all → redirect to login
      const hasCode = searchParams.get('code');
      const hasError = searchParams.get('error');
      if (!hasCode && !hasError) {
        setStatus('error');
        const errorMsg =
          'No authentication data found. Please start the sign-in process from the login page.';
        setErrorMessage(errorMsg);
        onError?.(errorMsg);
        return;
      }

      // Provider-side error (e.g. user denied consent)
      if (hasError) {
        const desc = searchParams.get('error_description') || hasError;
        setStatus('error');
        setErrorMessage(desc);
        onError?.(desc);
        return;
      }

      // Verify session nonce end-to-end (SF-001: CSRF prevention)
      // The nonce was generated before redirect and embedded in the redirectTo URL.
      // Compare the returned nonce query param against the stored nonce.
      const storedNonce = sessionStorage.getItem('intelliflow_oauth_nonce');
      const returnedNonce = searchParams.get('nonce');
      sessionStorage.removeItem('intelliflow_oauth_nonce');
      if (!storedNonce || storedNonce !== returnedNonce) {
        setStatus('error');
        setErrorMessage('Security verification failed. Please try signing in again.');
        onError?.('csrf');
        globalThis.location.href = '/login?error=csrf';
        return;
      }

      // Update status to exchanging
      setStatus('exchanging');

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error('Failed to initialize authentication client');
      }

      // getSession() awaits initializePromise internally, so by the time it
      // returns the SDK has already performed the PKCE code exchange (if the
      // code_verifier was found in PkceAwareStorage / localStorage).
      // 10-second timeout to handle network issues.
      const { data, error: sessionError } = await withTimeout(supabase.auth.getSession());

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      if (!data.session) {
        throw new Error(
          'Authentication session could not be established. ' +
            'Please try signing in again from the login page.'
        );
      }

      const { session } = data;
      const { data: userData } = await withTimeout(supabase.auth.getUser(session.access_token));
      finishSignIn(session, userData?.user ?? undefined, 'oauth');
    } catch (err) {
      reportError(err);
    }
  }, [searchParams, handleMagicLink, finishSignIn, onError, reportError]);

  // Run callback on mount — hasCalledRef prevents double-execution in StrictMode
  // (PKCE authorization codes are single-use)
  useEffect(() => {
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;
    handleCallback();
  }, [handleCallback]);

  // Watchdog: whatever step is awaited, a spinner never outlives FLOW_TIMEOUT_MS. The visible
  // error offers "Back to Sign In" instead of leaving the user on "Signing you in...".
  const isBusy = status === 'loading' || status === 'exchanging';
  useEffect(() => {
    if (!isBusy) return;
    const timer = setTimeout(() => reportError(new Error('TIMEOUT')), FLOW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isBusy, reportError]);

  // The account-switch prompt is a native modal <dialog>: opened last, it sits on the top layer
  // above every other overlay (onboarding modal included) and makes the rest of the page inert,
  // so its buttons cannot be covered or shadowed. jsdom has no showModal: fall back to `open`.
  useEffect(() => {
    const el = confirmDialogRef.current;
    if (status !== 'confirm' || !el || el.open) return;
    try {
      el.showModal();
    } catch {
      el.setAttribute('open', '');
    }
  }, [status]);

  // Focus management: move focus to primary action on error state (NF-007)
  useEffect(() => {
    if (status === 'error' && backToLoginRef.current) {
      backToLoginRef.current.focus();
    }
  }, [status]);

  // ==========================================
  // Status Configurations
  // ==========================================

  const signedInAs = currentEmail ? 'You are signed in as ' + currentEmail : 'You are signed in';
  // A magic link carries only an opaque token, never the identity it signs in. So the copy
  // must not claim the account differs: it states what the link does and asks.
  const statusConfig: Record<OAuthCallbackStatus, StatusConfig> = {
    loading: {
      icon: 'progress_activity',
      title: 'Signing you in...',
      description: 'Please wait while we authenticate your account',
      iconColor: 'text-[#7cc4ff]',
      bgColor: 'bg-[#137fec]/20',
      animate: true,
    },
    exchanging: {
      icon: 'sync',
      title: 'Authenticating...',
      description: 'Verifying your credentials with the provider',
      iconColor: 'text-[#7cc4ff]',
      bgColor: 'bg-[#137fec]/20',
      animate: true,
    },
    confirm: {
      icon: 'swap_horiz',
      title: 'Switch account?',
      description: `${signedInAs}. This link signs you in through the Leangency Portal. Continue and switch?`,
      iconColor: 'text-amber-300',
      bgColor: 'bg-amber-500/20',
    },
    success: {
      icon: 'check_circle',
      title: 'Welcome!',
      description: 'You have been successfully signed in. Redirecting...',
      iconColor: 'text-green-400',
      bgColor: 'bg-green-500/20',
    },
    error: {
      icon: 'error',
      title: 'Authentication Failed',
      description: errorMessage || 'Something went wrong. Please try again.',
      iconColor: 'text-red-400',
      bgColor: 'bg-red-500/20',
    },
  };

  const config = statusConfig[status];

  // ==========================================
  // Handlers
  // ==========================================

  const handleConfirmSwitch = () => {
    exchangeMagicLink().catch(reportError);
  };

  const handleStaySignedIn = () => {
    pendingLinkRef.current = null;
    router.push('/dashboard');
  };

  const handleBackToLogin = () => {
    router.push('/login');
  };

  const handleRetry = () => {
    router.push('/login');
  };

  // ==========================================
  // Render
  // ==========================================

  return (
    <main
      className={cn('relative flex items-center justify-center py-12 px-4', className)}
      data-testid="oauth-callback"
      aria-busy={status === 'loading' || status === 'exchanging'}
    >
      {/* Callback status card */}
      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Card className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl rounded-2xl">
          {/* Card gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-[#137fec]/[0.03]" />

          {}
          <output className="relative p-8 text-center space-y-6 block" aria-live="assertive">
            {/* Status icon */}
            <div
              className={cn(
                'inline-flex items-center justify-center w-20 h-20 rounded-full',
                config.bgColor
              )}
            >
              <span
                className={cn(
                  'material-symbols-outlined text-5xl',
                  config.iconColor,
                  config.animate && 'animate-spin'
                )}
                aria-hidden="true"
              >
                {config.icon}
              </span>
            </div>

            {/* Status text (the confirm state renders its own copy inside the dialog below) */}
            {status !== 'confirm' && (
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-white">{config.title}</h1>
                <p className="text-sm text-slate-300">{config.description}</p>
              </div>
            )}

            {/* Error actions */}
            {status === 'error' && (
              <div className="pt-4 space-y-3">
                <button
                  ref={backToLoginRef}
                  data-testid="callback-back-to-login"
                  onClick={handleBackToLogin}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] shadow-lg shadow-[#137fec]/20"
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    arrow_back
                  </span>{' '}
                  Back to Sign In
                </button>
                <button
                  onClick={handleRetry}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 font-medium hover:bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]"
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    refresh
                  </span>{' '}
                  Try Again
                </button>
              </div>
            )}

            {/* Account-switch confirmation (magic link while already signed in) */}
            {status === 'confirm' && (
              <dialog
                ref={confirmDialogRef}
                data-testid="switch-account-dialog"
                aria-labelledby="switch-account-title"
                aria-describedby="switch-account-description"
                onCancel={(e) => e.preventDefault()}
                className="static m-0 w-full max-w-none border-0 bg-transparent p-0 text-center text-inherit backdrop:bg-black/60 [&:not([open])]:hidden"
              >
                <div className="space-y-2">
                  <h1 id="switch-account-title" className="text-2xl font-bold text-white">
                    {config.title}
                  </h1>
                  <p id="switch-account-description" className="text-sm text-slate-300">
                    {config.description}
                  </p>
                </div>
                <div className="pt-4 space-y-3">
                  <button
                    type="button"
                    data-testid="switch-account-continue"
                    onClick={handleConfirmSwitch}
                    className="w-full px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    data-testid="switch-account-stay"
                    onClick={handleStaySignedIn}
                    className="w-full px-6 py-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 font-medium hover:bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]"
                  >
                    Stay signed in
                  </button>
                </div>
              </dialog>
            )}

            {/* Loading indicator */}
            {(status === 'loading' || status === 'exchanging') && (
              <div className="pt-2">
                <div className="flex justify-center gap-1">
                  <div
                    className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            )}

            {/* Success indicator */}
            {status === 'success' && (
              <div className="pt-2">
                <p className="text-xs text-slate-400">Redirecting to dashboard in a moment...</p>
              </div>
            )}
          </output>

          {/* Security badge */}
          <div className="bg-white/[0.03] border-t border-white/10 px-8 py-4">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <span
                className="material-symbols-outlined text-base text-[#7cc4ff]"
                aria-hidden="true"
              >
                verified_user
              </span>
              <span>Secure authentication via OAuth 2.0</span>
            </div>
          </div>
        </Card>

        {/* Trust indicators */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-[#7cc4ff]" aria-hidden="true">
              lock
            </span>{' '}
            Secure
          </div>
          <div className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-[#7cc4ff]" aria-hidden="true">
              shield_check
            </span>{' '}
            Encrypted
          </div>
          <div className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-[#7cc4ff]" aria-hidden="true">
              policy
            </span>{' '}
            Protected
          </div>
        </div>
      </div>
    </main>
  );
}
