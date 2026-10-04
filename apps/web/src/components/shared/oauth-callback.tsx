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
import {
  getSupabaseBrowserClient,
  clearSupabaseLocalStorage,
  createIsolatedAuthClient,
} from '@/lib/supabase-browser';
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
  /**
   * @internal Flow watchdog ceiling. Production always uses the 30 s default; tests lower it to
   * reach a watchdog that fires while a step is still inside its own 10 s ceiling.
   */
  flowTimeoutMs?: number;
}

interface StatusConfig {
  icon: string;
  title: string;
  description: string;
  iconColor: string;
  bgColor: string;
  animate?: boolean;
}

/** Best-effort identity (stable id and email) of the current local session, from the stored access token. */
function currentSessionIdentity(): { id: string | null; email: string | null } | null {
  try {
    const token = getStoredAccessToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
    return {
      id: typeof payload.sub === 'string' && payload.sub ? payload.sub : null,
      email: typeof payload.email === 'string' && payload.email ? payload.email : null,
    };
  } catch {
    return null;
  }
}

/**
 * True only when the link's user is provably the user already signed in: by stable user id when
 * both sides carry one, otherwise by case-insensitive email. Anything unproven is a DIFFERENT
 * account, so the switch prompt stays.
 */
function isSameAccount(
  current: { id: string | null; email: string | null } | null,
  linkUser: { id?: string | null; email?: string | null } | null | undefined
): boolean {
  if (!current || !linkUser) return false;
  if (current.id && linkUser.id) return current.id === linkUser.id;
  if (current.email && linkUser.email) {
    return current.email.trim().toLowerCase() === linkUser.email.trim().toLowerCase();
  }
  return false;
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

type BrowserSupabase = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

/**
 * Remove a session this callback produced but will not sign in with. Never throws.
 *
 * The session is revoked on the server (GoTrue `/logout?scope=local` with its own token, the
 * same request `signOut` makes) without waiting for the answer, and its local copies are
 * removed. The SDK holds a session only in localStorage (persistSession, no auto-refresh), so
 * removing its keys removes the session. It deliberately does NOT call `signOut`: that would emit
 * SIGNED_OUT, which AuthContext treats as a sign-out of whatever session the APP holds, and a
 * sign-out that outlived its timeout could still land later. This cleanup can run long after
 * the error screen, when the user may have signed in some other way, so it decides and acts in
 * one synchronous step: the app's tokens are cleared only while no other session holds them.
 *
 * `preexistingAccessToken` is the session the browser held before this callback ran. The OAuth
 * path does not sign out first, so a step may hand back that session rather than a new one; it
 * was never this callback's to remove.
 *
 * `isolated` marks a session verified on the isolated client while another account is signed
 * in: it was never stored, so it is only revoked. Clearing storage here would delete the copy of
 * the session the user kept, and with it that session's refresh.
 */
function dropAbandonedSession(
  supabase: BrowserSupabase,
  abandonedAccessToken: string,
  preexistingAccessToken: string | null = null,
  isolated = false
): void {
  if (abandonedAccessToken === preexistingAccessToken) return;
  if (isolated) {
    revokeSession(supabase, abandonedAccessToken);
    return;
  }
  try {
    // Fire and forget: revocation touches neither the SDK's storage nor its events, so its
    // timing cannot affect any session signed in afterwards.
    supabase.auth.admin.signOut(abandonedAccessToken, 'local').catch(() => undefined);
  } catch {
    // The local cleanup below still applies.
  }
  clearSupabaseLocalStorage();
  const current = getStoredAccessToken();
  if (!current || current === abandonedAccessToken) {
    clearSessionTokens();
    clearTokenCookie();
  }
}

/**
 * Revoke a session server-side without touching the SDK's storage or emitting SIGNED_OUT, so it
 * cannot disturb the session the app holds now. Fire and forget, like dropAbandonedSession.
 */
function revokeSession(supabase: BrowserSupabase, accessToken: string): void {
  try {
    supabase.auth.admin.signOut(accessToken, 'local').catch(() => undefined);
  } catch {
    // Nothing else to clean: this session was never stored by this callback.
  }
}

/**
 * Clear any existing session before the switch. A sign-out that never settled may still finish
 * later and erase the replacement session (it removes the stored session and emits SIGNED_OUT),
 * so a timeout is terminal: verifyOtp must not start. Any other failure has settled and the
 * caller's own token cleanup still applies.
 */
async function signOutBeforeSwitch(supabase: BrowserSupabase): Promise<void> {
  try {
    await withTimeout(supabase.auth.signOut({ scope: 'local' }));
  } catch (signOutError) {
    if (signOutError instanceof Error && signOutError.message === 'TIMEOUT') throw signOutError;
  }
}

/** A failed grant claim keeps its own message; anything unexpected becomes the generic one. */
function normalizeClaimError(claimError: unknown): Error {
  if (claimError instanceof ClaimLoginGrantError) return claimError;
  if (claimError instanceof Error && claimError.message === 'TIMEOUT') return claimError;
  return new Error(
    'This sign-in link is invalid or has expired. Please go back to sign in and try again.'
  );
}

/**
 * An abandoned (timed-out) sign-in request cannot be aborted. If it later yields a session,
 * that session is dropped, so a failure screen is never followed by a silent sign-in.
 */
function discardLateSession(
  supabase: BrowserSupabase,
  pending: Promise<{ data: { session: { access_token: string } | null } | null }>,
  preexistingAccessToken: string | null = null,
  isolated = false
): void {
  pending
    .then((late) => {
      const token = late.data?.session?.access_token;
      if (token) dropAbandonedSession(supabase, token, preexistingAccessToken, isolated);
    })
    .catch(() => undefined);
}

/**
 * The flow watchdog already showed the failure screen. A step that settled after it must not
 * carry the flow on (no grant claim, no sign-in): drop whatever session now exists and stop.
 */
function abandonedByWatchdog(
  aborted: { readonly current: boolean },
  supabase: BrowserSupabase,
  session: { access_token: string } | null | undefined,
  preexistingAccessToken: string | null = null,
  isolated = false
): boolean {
  if (!aborted.current) return false;
  if (session) {
    dropAbandonedSession(supabase, session.access_token, preexistingAccessToken, isolated);
  }
  return true;
}

/** Open the account-switch prompt as a modal; jsdom has no showModal, so fall back to `open`. */
function openModal(el: HTMLDialogElement): void {
  if (el.open) return;
  try {
    el.showModal();
  } catch {
    el.setAttribute('open', '');
  }
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

interface HeldSession {
  /** `expires_at` is in epoch seconds, as Supabase returns it. */
  session: { access_token: string; refresh_token?: string; expires_at?: number };
  user: { id: string; email?: string } | undefined;
  pending: PendingMagicLink;
}

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
  flowTimeoutMs = FLOW_TIMEOUT_MS,
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
  // A verified session for a DIFFERENT account, held in memory (never stored as the app session)
  // until the user confirms the switch.
  const heldSessionRef = useRef<HeldSession | null>(null);
  // Set when the page is gone: a verification that lands afterwards must not hold a session.
  const unmountedRef = useRef(false);
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
      // Once the watchdog has shown its failure, a step that fails afterwards must not replace
      // that screen or report a second error.
      if (abortedRef.current) return;
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

  // ADR-071: the link carries `tenant` and `grant` as HINTS. The grant is claimed FIRST, with
  // the new session's token: for a pinned (agency staff) link this is what binds the session
  // to the client tenant, and until it is claimed the API refuses everything else. The
  // tenant the server returns wins over the `tenant` hint. A failed claim fails CLOSED:
  // the session is dropped rather than left half signed in.
  const completeMagicLink = useCallback(
    async (
      supabase: BrowserSupabase,
      session: { access_token: string; refresh_token?: string },
      user: { id: string; email?: string } | undefined,
      pending: PendingMagicLink,
      previousAccessToken: string | null = null
    ) => {
      // A previous session means the link was verified on the isolated client.
      const isolated = previousAccessToken !== null;
      let activeTenantId = pending.tenantHint;
      if (pending.grant) {
        try {
          const claim = await withTimeout(claimLoginGrant(session.access_token, pending.grant));
          activeTenantId = claim.tenantId;
        } catch (claimError) {
          dropAbandonedSession(supabase, session.access_token, null, isolated);
          throw normalizeClaimError(claimError);
        }
        if (abandonedByWatchdog(abortedRef, supabase, session, null, isolated)) return;
      }

      // The session this link replaces is revoked only once the new one is certain, so a failed
      // claim never leaves the user signed out of both.
      if (previousAccessToken && previousAccessToken !== session.access_token) {
        revokeSession(supabase, previousAccessToken);
      }
      pendingNextRef.current = pending.next;
      finishSignIn(session, user, 'magiclink', activeTenantId);
    },
    [finishSignIn]
  );

  // Exchange the in-memory hashed OTP.
  //
  // No local session: any stale SDK session is signed out FIRST so a different user's session
  // can never win, then the link signs in.
  // A local session exists: the link's identity is only known once the token is verified, so it
  // is verified on an isolated client that persists nothing and emits nothing to AuthContext. The
  // same account continues straight into sign-in; a different account is held in memory only and
  // the user must confirm the switch. Either way the replaced session is revoked once the new
  // one is signed in.
  const exchangeMagicLink = useCallback(async () => {
    const pending = pendingLinkRef.current;
    pendingLinkRef.current = null; // single use
    if (!pending) throw new Error('This sign-in link has already been used.');
    setStatus('exchanging');

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error('Failed to initialize authentication client');
    }

    const preexistingToken = getStoredAccessToken();
    const currentIdentity = preexistingToken ? currentSessionIdentity() : null;
    if (!preexistingToken) {
      await signOutBeforeSwitch(supabase);
      clearSessionTokens();
      clearTokenCookie();
      clearSupabaseLocalStorage();
    }
    if (abortedRef.current) return;

    const isolated = preexistingToken !== null;
    const verifier = isolated ? createIsolatedAuthClient() : supabase;
    const verification = verifier.auth.verifyOtp({
      type: 'magiclink',
      token_hash: pending.tokenHash,
    });
    let result: Awaited<typeof verification>;
    try {
      result = await withTimeout(verification);
    } catch (verifyError) {
      // verifyOtp cannot be cancelled: if it finishes after we showed the error, the SDK would
      // persist and broadcast a session behind the failure screen. Discard it when it lands.
      discardLateSession(supabase, verification, preexistingToken, isolated);
      throw verifyError;
    }
    if (
      abandonedByWatchdog(abortedRef, supabase, result.data?.session, preexistingToken, isolated)
    ) {
      return;
    }
    const { data, error } = result;

    if (error || !data?.session) {
      throw new Error(
        'This sign-in link is invalid or has expired. Please go back to sign in and try again.'
      );
    }

    if (preexistingToken && !isSameAccount(currentIdentity, data.user)) {
      if (unmountedRef.current) {
        revokeSession(supabase, data.session.access_token);
        return;
      }
      heldSessionRef.current = {
        session: data.session,
        user: data.user ?? undefined,
        pending,
      };
      setCurrentEmail(currentIdentity?.email ?? null);
      setStatus('confirm');
      return;
    }

    await completeMagicLink(
      supabase,
      data.session,
      data.user ?? undefined,
      pending,
      preexistingToken
    );
  }, [completeMagicLink]);

  // Magic-link flow (partner Portal -> CRM): /auth/callback?token_hash=...&type=magiclink&next=...
  //
  // Anyone can mint a link for their own account and send it to a signed-in victim (login CSRF),
  // so when a local session already exists for a DIFFERENT account we do NOT swap accounts
  // silently: the user must confirm on an interstitial. With no session, or when the link is for
  // the account already signed in, there is nothing to confirm and sign-in completes directly.
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
      // 10-second timeout to handle network issues. getSession cannot be cancelled: if the
      // exchange lands after the timeout, the session it persisted is discarded.
      const preexistingToken = getStoredAccessToken();
      const sessionRequest = supabase.auth.getSession();
      let sessionResult: Awaited<typeof sessionRequest>;
      try {
        sessionResult = await withTimeout(sessionRequest);
      } catch (sessionTimeout) {
        discardLateSession(supabase, sessionRequest, preexistingToken);
        throw sessionTimeout;
      }
      if (
        abandonedByWatchdog(abortedRef, supabase, sessionResult.data?.session, preexistingToken)
      ) {
        return;
      }
      const { data, error: sessionError } = sessionResult;

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
      let userData: Awaited<ReturnType<typeof supabase.auth.getUser>>['data'];
      try {
        ({ data: userData } = await withTimeout(supabase.auth.getUser(session.access_token)));
      } catch (userError) {
        // The exchanged session is already persisted: never leave it behind a failure screen.
        dropAbandonedSession(supabase, session.access_token, preexistingToken);
        throw userError;
      }
      if (abandonedByWatchdog(abortedRef, supabase, session, preexistingToken)) return;
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
    const timer = setTimeout(() => reportError(new Error('TIMEOUT')), flowTimeoutMs);
    return () => clearTimeout(timer);
  }, [isBusy, reportError, flowTimeoutMs]);

  // The account-switch prompt is a native modal <dialog>: opened last, it sits on the top layer
  // above every other overlay (onboarding modal included) and makes the rest of the page inert,
  // so its buttons cannot be covered or shadowed.
  useEffect(() => {
    const el = confirmDialogRef.current;
    if (status !== 'confirm' || !el) return;
    openModal(el);
  }, [status]);

  // A held session for another account lives only in memory. If the user leaves the prompt
  // without choosing (tab closed, back button, navigation), revoke it so a valid session for an
  // account they never agreed to cannot outlive the page. A page kept in the back/forward cache
  // comes back showing the used-link error rather than a prompt whose session is gone.
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;
  useEffect(() => {
    const revokeHeld = (): boolean => {
      const held = heldSessionRef.current;
      heldSessionRef.current = null;
      const supabase = getSupabaseBrowserClient();
      if (held && supabase) revokeSession(supabase, held.session.access_token);
      return held !== null;
    };
    const onPageHide = (event: PageTransitionEvent) => {
      if (revokeHeld() && event.persisted) {
        reportErrorRef.current(new Error('This sign-in link has already been used.'));
      }
    };
    unmountedRef.current = false;
    globalThis.addEventListener('pagehide', onPageHide);
    return () => {
      unmountedRef.current = true;
      globalThis.removeEventListener('pagehide', onPageHide);
      revokeHeld();
    };
  }, []);

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
    const held = heldSessionRef.current;
    heldSessionRef.current = null; // single use
    const supabase = getSupabaseBrowserClient();
    if (!held || !supabase) {
      reportError(new Error('This sign-in link has already been used.'));
      return;
    }
    // The held session was verified before the user chose; one that has since expired cannot
    // claim a grant or sign in, and the link is already spent.
    if (held.session.expires_at !== undefined && held.session.expires_at * 1000 <= Date.now()) {
      revokeSession(supabase, held.session.access_token);
      reportError(
        new Error(
          'This sign-in link is invalid or has expired. Please go back to sign in and try again.'
        )
      );
      return;
    }
    setStatus('exchanging');
    completeMagicLink(
      supabase,
      held.session,
      held.user,
      held.pending,
      getStoredAccessToken()
    ).catch(reportError);
  };

  const handleStaySignedIn = () => {
    pendingLinkRef.current = null;
    const held = heldSessionRef.current;
    heldSessionRef.current = null;
    const supabase = getSupabaseBrowserClient();
    // The verified session for the other account was never stored: it is only revoked, and the
    // current app session, including the SDK's copy that keeps it refreshed, is untouched.
    if (held && supabase) revokeSession(supabase, held.session.access_token);
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
                // A prevented cancel does not hold for ever: Chromium closes the dialog on a
                // repeated Escape without a cancelable event. The prompt only renders while a
                // choice is pending, so any close without one reopens it.
                onClose={(e) => openModal(e.currentTarget)}
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
