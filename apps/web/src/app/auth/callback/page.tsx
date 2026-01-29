'use client';

/**
 * OAuth Callback Page
 *
 * Handles OAuth provider callbacks after successful authentication.
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Flow:
 * 1. User clicks SSO button on login page
 * 2. Redirected to OAuth provider (Google/Microsoft)
 * 3. Provider redirects back here with code in URL
 * 4. We exchange code for session
 * 5. Store session and redirect to dashboard
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { storeSessionFingerprint } from '@/lib/shared/login-security';

// ============================================
// Types
// ============================================

type CallbackStatus = 'loading' | 'success' | 'error';

interface StatusConfig {
  icon: string;
  title: string;
  description: string;
  iconColor: string;
  animate?: boolean;
}

// ============================================
// Component
// ============================================

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // tRPC mutation for OAuth callback
  const oauthCallback = trpc.auth.oauthCallback.useMutation();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get OAuth parameters from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        const provider = searchParams.get('provider') as 'google' | 'azure' | null;

        // Handle OAuth errors from provider
        if (error) {
          setStatus('error');
          setErrorMessage(errorDescription || `OAuth error: ${error}`);
          return;
        }

        // Validate required parameters
        if (!code) {
          setStatus('error');
          setErrorMessage('No authorization code received');
          return;
        }

        // Exchange code for session
        const result = await oauthCallback.mutateAsync({
          code,
          state: state || undefined,
          provider: provider || undefined,
        });

        if (result.success && result.session) {
          setStatus('success');

          // Store access token for client-side auth
          if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', result.session.accessToken);
          }

          // Store device fingerprint for session verification
          storeSessionFingerprint();

          // Redirect to dashboard after brief success state
          setTimeout(() => {
            router.push('/dashboard');
          }, 1500);
        } else {
          setStatus('error');
          setErrorMessage('Authentication failed');
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'An unexpected error occurred'
        );
      }
    };

    handleCallback();
  }, [searchParams, oauthCallback, router]);

  // ==========================================
  // Status Configurations
  // ==========================================

  const statusConfig: Record<CallbackStatus, StatusConfig> = {
    loading: {
      icon: 'progress_activity',
      title: 'Signing you in...',
      description: 'Please wait while we complete your authentication',
      iconColor: 'text-[#7cc4ff]',
      animate: true,
    },
    success: {
      icon: 'check_circle',
      title: 'Welcome!',
      description: 'You have been successfully signed in. Redirecting...',
      iconColor: 'text-green-400',
    },
    error: {
      icon: 'error',
      title: 'Authentication Failed',
      description: errorMessage || 'Something went wrong. Please try again.',
      iconColor: 'text-red-400',
    },
  };

  const config = statusConfig[status];

  // ==========================================
  // Render
  // ==========================================

  return (
    <main className="relative min-h-screen bg-[#0f172a] flex items-center justify-center overflow-hidden py-12 px-4">
      {/* Animated background gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37]" />
      <div
        className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-[#137fec]/20 blur-3xl opacity-50 animate-pulse"
        style={{ animationDuration: '4s' }}
      />
      <div
        className="absolute right-0 bottom-0 h-[500px] w-[500px] rounded-full bg-indigo-500/20 blur-3xl opacity-40 animate-pulse"
        style={{ animationDuration: '6s', animationDelay: '1s' }}
      />

      {/* Subtle grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />

      {/* Callback status card */}
      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Card className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl rounded-2xl">
          {/* Card gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-[#137fec]/[0.03]" />

          <div className="relative p-8 text-center space-y-6">
            {/* Status icon */}
            <div
              className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${
                status === 'success'
                  ? 'bg-green-500/20'
                  : status === 'error'
                    ? 'bg-red-500/20'
                    : 'bg-[#137fec]/20'
              }`}
            >
              <span
                className={`material-symbols-outlined text-5xl ${config.iconColor} ${
                  config.animate ? 'animate-spin' : ''
                }`}
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
                  onClick={() => router.push('/login')}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] shadow-lg shadow-[#137fec]/20"
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    arrow_back
                  </span>
                  Back to Sign In
                </button>
                <button
                  onClick={() => window.location.reload()}
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
            {status === 'loading' && (
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
