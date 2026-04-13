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
import { storeSessionTokens } from '@/lib/shared/token-exchange';

// ============================================
// Types
// ============================================

export type OAuthCallbackStatus = 'loading' | 'exchanging' | 'success' | 'error';

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
  const hasCalledRef = useRef(false);
  const backToLoginRef = useRef<HTMLButtonElement>(null);

  // Handle the OAuth callback flow.
  //
  // With detectSessionInUrl: true, the Supabase SDK's _initialize() method
  // detects the ?code= parameter, reads the PKCE code_verifier from
  // PkceAwareStorage (localStorage), and exchanges the code for a session
  // automatically. We just need to wait for initialization to finish, then
  // read the session via getSession().
  const handleCallback = useCallback(async () => {
    try {
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
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), 10_000);
      });

      const sessionPromise = supabase.auth.getSession();
      const { data, error: sessionError } = await Promise.race([sessionPromise, timeoutPromise]);

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
      const { data: userData } = await supabase.auth.getUser(session.access_token);
      const user = userData?.user;

      setStatus('success');

      // Store tokens for API calls (our custom token management)
      storeSessionTokens(session.access_token, session.refresh_token);

      // Store device fingerprint for session verification
      storeSessionFingerprint();

      // Set OAuth login success flag for AuthContext grace window (SF-002: use timestamp)
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

      // Redirect to dashboard after brief success state (300ms per NF-004)
      setTimeout(() => {
        router.push(redirectUrl);
      }, 300);
    } catch (err) {
      setStatus('error');
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
    }
  }, [searchParams, router, redirectUrl, onSuccess, onError]);

  // Run callback on mount — hasCalledRef prevents double-execution in StrictMode
  // (PKCE authorization codes are single-use)
  useEffect(() => {
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;
    handleCallback();
  }, [handleCallback]);

  // Focus management: move focus to primary action on error state (NF-007)
  useEffect(() => {
    if (status === 'error' && backToLoginRef.current) {
      backToLoginRef.current.focus();
    }
  }, [status]);

  // ==========================================
  // Status Configurations
  // ==========================================

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

          { }
          <div
            className="relative p-8 text-center space-y-6"
            role="status" // NOSONAR typescript:S6819
            aria-live="assertive"
          >
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

            {/* Status text */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">{config.title}</h1>
              <p className="text-sm text-slate-300">{config.description}</p>
            </div>

            {/* Error actions */}
            {status === 'error' && (
              <div className="pt-4 space-y-3">
                <button
                  ref={backToLoginRef}
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
          </div>

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
