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

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { storeSessionFingerprint } from '@/lib/shared/login-security';
import {
  extractOAuthParams,
  validateOAuthParams,
  storeSessionTokens,
} from '@/lib/shared/token-exchange';

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
}: OAuthCallbackProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<OAuthCallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // tRPC mutation for OAuth callback
  const oauthCallback = trpc.auth.oauthCallback.useMutation();

  // Handle the OAuth callback flow
  const handleCallback = useCallback(async () => {
    try {
      // Extract OAuth parameters from URL
      const params = extractOAuthParams(searchParams);

      // Validate parameters
      const validation = validateOAuthParams(params);

      if (!validation.ok) {
        setStatus('error');
        setErrorMessage(validation.error.message);
        onError?.(validation.error.message);
        return;
      }

      // Update status to exchanging
      setStatus('exchanging');

      // Build mutation input
      const mutationInput: {
        code: string;
        state?: string;
        provider?: 'google' | 'azure';
      } = {
        code: validation.value.code,
      };

      if (validation.value.state) {
        mutationInput.state = validation.value.state;
      }

      if (validation.value.provider) {
        mutationInput.provider = validation.value.provider;
      }

      // Exchange code for session
      const result = await oauthCallback.mutateAsync(mutationInput);

      if (result.success && result.session) {
        setStatus('success');

        // Store access token
        if (result.session.accessToken) {
          storeSessionTokens(result.session.accessToken, result.session.refreshToken);
        }

        // Store device fingerprint for session verification
        storeSessionFingerprint();

        // Call success callback
        if (onSuccess && result.user) {
          onSuccess(result.user, result.session);
        }

        // Redirect to dashboard after brief success state
        setTimeout(() => {
          router.push(redirectUrl);
        }, 1500);
      } else {
        setStatus('error');
        const errorMsg = 'Authentication failed. Please try again.';
        setErrorMessage(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      setStatus('error');
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setErrorMessage(errorMsg);
      onError?.(errorMsg);
    }
  }, [searchParams, oauthCallback, router, redirectUrl, onSuccess, onError]);

  // Run callback on mount
  useEffect(() => {
    handleCallback();
  }, [handleCallback]);

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
    window.location.reload();
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

          <div className="relative p-8 text-center space-y-6" role="status" aria-live="polite">
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
                  onClick={handleBackToLogin}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] shadow-lg shadow-[#137fec]/20"
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    arrow_back
                  </span>
                  Back to Sign In
                </button>
                <button
                  onClick={handleRetry}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 font-medium hover:bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]"
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    refresh
                  </span>
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
                <p className="text-xs text-slate-400">
                  Redirecting to dashboard in a moment...
                </p>
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
            </span>
            Secure
          </div>
          <div className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-[#7cc4ff]" aria-hidden="true">
              shield_check
            </span>
            Encrypted
          </div>
          <div className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-[#7cc4ff]" aria-hidden="true">
              policy
            </span>
            Protected
          </div>
        </div>
      </div>
    </main>
  );
}

export default OAuthCallback;
