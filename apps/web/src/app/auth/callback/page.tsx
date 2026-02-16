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
 * 3. Provider redirects back here with tokens in URL hash
 * 4. We extract and validate the JWT token directly (no Supabase client)
 * 5. Store the token and redirect to dashboard
 *
 * IMPORTANT: This page deliberately avoids using the Supabase browser client
 * to prevent any automatic session detection or redirect behavior.
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { storeSessionFingerprint } from '@/lib/shared/login-security';
import { syncTokenToCookie } from '@/lib/shared/session-cleanup';

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Ref to track if we've already processed the callback
  // This prevents double-execution in React Strict Mode from clearing tokens
  const isProcessingRef = useRef(false);
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    console.log('[OAuth Callback] ===== useEffect triggered =====');
    console.log(
      '[OAuth Callback] Full URL:',
      typeof window !== 'undefined' ? window.location.href : 'SSR'
    );
    console.log(
      '[OAuth Callback] Hash present:',
      typeof window !== 'undefined' && window.location.hash ? 'YES' : 'NO'
    );

    const handleCallback = async () => {
      // Prevent double-execution in React Strict Mode
      if (isProcessingRef.current || hasProcessedRef.current) {
        console.log('[OAuth Callback] Already processing or processed, skipping...');
        return;
      }
      isProcessingRef.current = true;
      console.log('[OAuth Callback] Starting to process callback...');

      // IMPORTANT: Clear any old tokens immediately to prevent stale token checks
      // This ensures the AuthProvider doesn't use an expired token while we process the new one
      if (typeof window !== 'undefined') {
        console.log('[OAuth Callback] Clearing old tokens to prevent stale auth checks...');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        // Also clear the cookie
        document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }

      try {
        // Parse the hash params
        const hashStr =
          typeof window !== 'undefined' && window.location.hash
            ? window.location.hash.substring(1)
            : '';

        console.log('[OAuth Callback] Hash string length:', hashStr.length);

        if (!hashStr) {
          console.log('[OAuth Callback] No hash found in URL');

          // Check for error in query params
          const queryError = searchParams?.get('error');
          const queryErrorDesc = searchParams?.get('error_description');

          if (queryError) {
            setStatus('error');
            setErrorMessage(queryErrorDesc || `OAuth error: ${queryError}`);
            isProcessingRef.current = false;
            return;
          }

          setStatus('error');
          setErrorMessage('No authentication data received. Please try again.');
          isProcessingRef.current = false;
          return;
        }

        const hashParams = new URLSearchParams(hashStr);

        // Check for error in hash
        const hashError = hashParams.get('error');
        const hashErrorDesc = hashParams.get('error_description');

        if (hashError) {
          console.log('[OAuth Callback] Error in hash:', hashError);
          setStatus('error');
          setErrorMessage(hashErrorDesc || `OAuth error: ${hashError}`);
          isProcessingRef.current = false;
          return;
        }

        // Get tokens from hash
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        console.log('[OAuth Callback] Hash params:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          tokenType: hashParams.get('token_type'),
          expiresIn: hashParams.get('expires_in'),
        });

        if (!accessToken) {
          console.log('[OAuth Callback] No access_token in hash');
          setStatus('error');
          setErrorMessage('No access token received from OAuth provider');
          isProcessingRef.current = false;
          return;
        }

        // Decode and validate the JWT payload
        try {
          const payloadBase64 = accessToken.split('.')[1];
          const payload = JSON.parse(atob(payloadBase64));

          console.log('[OAuth Callback] Token payload:', {
            iss: payload.iss,
            sub: payload.sub,
            email: payload.email,
            aud: payload.aud,
            exp: payload.exp,
          });

          // Verify this is a Supabase token
          if (!payload.iss?.includes('supabase.co')) {
            console.error('[OAuth Callback] Token is not from Supabase:', payload.iss);
            setStatus('error');
            setErrorMessage('Invalid authentication token');
            isProcessingRef.current = false;
            return;
          }

          // Check if token is expired
          if (payload.exp && Date.now() / 1000 > payload.exp) {
            console.error('[OAuth Callback] Token is expired');
            setStatus('error');
            setErrorMessage('Authentication token expired. Please try again.');
            isProcessingRef.current = false;
            return;
          }

          console.log('[OAuth Callback] Valid Supabase token detected!');

          // Store the tokens (old tokens already cleared at start of callback)
          localStorage.setItem('accessToken', accessToken);
          console.log('[OAuth Callback] Token stored in localStorage');

          if (refreshToken) {
            localStorage.setItem('refreshToken', refreshToken);
            console.log('[OAuth Callback] Refresh token stored');
          }

          // Sync token to cookie for proxy access
          console.log('[OAuth Callback] Syncing token to cookie...');
          syncTokenToCookie(accessToken);

          // Verify cookie was set
          const cookieNames = document.cookie.split(';').map((c) => c.trim().split('=')[0]);
          console.log('[OAuth Callback] Current cookies:', cookieNames.join(', '));
          console.log(
            '[OAuth Callback] accessToken cookie set:',
            cookieNames.includes('accessToken')
          );

          // Store device fingerprint
          storeSessionFingerprint();

          // Mark as processed
          hasProcessedRef.current = true;

          // Set a flag indicating OAuth login just succeeded
          // This helps with redirect if somehow user ends up on login page
          sessionStorage.setItem('oauth_login_success', Date.now().toString());

          console.log('[OAuth Callback] SUCCESS! Redirecting to dashboard...');

          // Set success status (for visual feedback while redirecting)
          setStatus('success');

          // Small delay to ensure all storage operations complete
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Use window.location.href for a clean redirect
          window.location.href = '/dashboard';
          return;
        } catch (decodeError) {
          console.error('[OAuth Callback] Failed to decode token:', decodeError);
          setStatus('error');
          setErrorMessage('Failed to process authentication token');
          isProcessingRef.current = false;
          return;
        }
      } catch (err) {
        console.error('[OAuth Callback] Error:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
        isProcessingRef.current = false;
      }
    };

    handleCallback();
  }, [searchParams]);

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
