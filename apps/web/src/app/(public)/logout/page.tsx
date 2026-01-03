'use client';

/**
 * Logout Page
 *
 * Handles user logout with session cleanup and redirect.
 *
 * IMPLEMENTS: PG-018 (Logout page)
 *
 * Features:
 * - Automatic session cleanup
 * - Logout confirmation display
 * - Multi-tab logout broadcast
 * - SSO logout support
 * - Countdown redirect to login
 * - Accessibility support
 */

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { useAuth } from '@/lib/auth/AuthContext';
import { AuthBackground } from '@/components/shared';
import { cleanupSession } from '@/lib/shared/session-cleanup';
import {
  parseLogoutReason,
  parseReturnUrl,
  getLogoutMessage,
  performLogoutRedirect,
  type LogoutReason,
} from '@/lib/shared/logout-redirect';

// ============================================
// Types
// ============================================

type LogoutStatus = 'pending' | 'processing' | 'complete' | 'error';

// ============================================
// Countdown Component
// ============================================

interface CountdownProps {
  seconds: number;
  onComplete: () => void;
}

function Countdown({ seconds, onComplete }: CountdownProps) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [remaining, onComplete]);

  return (
    <span className="font-mono text-[#137fec]" aria-live="polite">
      {remaining}s
    </span>
  );
}

// ============================================
// Logout Content Component
// ============================================

function LogoutContent() {
  const searchParams = useSearchParams();
  const auth = useAuth();

  const [status, setStatus] = useState<LogoutStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<LogoutReason | null>(null);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  // Parse URL parameters
  useEffect(() => {
    setReason(parseLogoutReason(searchParams.toString()));
    setReturnUrl(parseReturnUrl(searchParams.toString()));
  }, [searchParams]);

  // Perform logout
  useEffect(() => {
    const performLogout = async () => {
      if (status !== 'pending') return;

      setStatus('processing');

      try {
        // Call auth context logout (clears state, calls API)
        await auth.logout();

        // Perform additional session cleanup
        const cleanupResult = await cleanupSession({
          clearLocalStorage: true,
          clearSessionStorage: true,
          clearCookies: true,
          clearIndexedDB: true,
          broadcastLogout: true,
          preservePreferences: true,
        });

        if (!cleanupResult.success) {
          console.warn('[Logout] Some cleanup operations failed:', cleanupResult.errors);
        }

        setStatus('complete');
      } catch (err) {
        console.error('[Logout] Error during logout:', err);
        setError(err instanceof Error ? err.message : 'An error occurred during logout');
        setStatus('error');

        // Even on error, try to clean up local state
        await cleanupSession({ broadcastLogout: true });
      }
    };

    performLogout();
  }, [status, auth]);

  // Handle redirect
  const handleRedirect = useCallback(() => {
    performLogoutRedirect({
      reason: reason || 'user_initiated',
      returnUrl: returnUrl || undefined,
      showMessage: true,
    });
  }, [reason, returnUrl]);

  // Get message based on status and reason
  const getMessage = () => {
    if (status === 'error') {
      return error || 'An error occurred during logout.';
    }
    if (status === 'processing') {
      return 'Signing you out...';
    }
    return getLogoutMessage(reason);
  };

  return (
    <AuthBackground>
      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        {/* Logout Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
          {/* Header */}
          <div
            className={cn(
              'p-8 text-center border-b',
              status === 'complete'
                ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20'
                : status === 'error'
                  ? 'bg-gradient-to-r from-red-500/10 to-rose-500/10 border-red-500/20'
                  : 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-500/20'
            )}
          >
            {/* Status Icon */}
            <div
              className={cn(
                'inline-flex items-center justify-center w-16 h-16 rounded-full mb-4',
                status === 'complete'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : status === 'error'
                    ? 'bg-red-500/20 border-2 border-red-500'
                    : 'bg-blue-500/20 border-2 border-blue-500'
              )}
            >
              {status === 'processing' ? (
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : status === 'complete' ? (
                <span
                  className="material-symbols-outlined text-3xl text-green-400"
                  aria-hidden="true"
                >
                  check_circle
                </span>
              ) : status === 'error' ? (
                <span
                  className="material-symbols-outlined text-3xl text-red-400"
                  aria-hidden="true"
                >
                  error
                </span>
              ) : (
                <span
                  className="material-symbols-outlined text-3xl text-blue-400"
                  aria-hidden="true"
                >
                  logout
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-white mb-2">
              {status === 'complete'
                ? 'Signed Out'
                : status === 'error'
                  ? 'Logout Error'
                  : status === 'processing'
                    ? 'Signing Out'
                    : 'Logout'}
            </h1>

            {/* Message */}
            <p className="text-slate-300">{getMessage()}</p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Success State */}
            {status === 'complete' && (
              <>
                {/* Security Info */}
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="material-symbols-outlined text-green-400 flex-shrink-0"
                      aria-hidden="true"
                    >
                      verified_user
                    </span>
                    <div>
                      <p className="text-sm text-slate-200 font-medium">
                        Session cleared securely
                      </p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        All session data has been removed from this device.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Redirect Notice */}
                <div className="text-center text-sm text-slate-400">
                  Redirecting to login in{' '}
                  <Countdown seconds={5} onComplete={handleRedirect} />
                </div>

                {/* Manual Redirect Button */}
                <Link
                  href="/login"
                  className={cn(
                    'flex items-center justify-center gap-2 w-full px-6 py-3 rounded-lg',
                    'bg-[#137fec] text-white font-medium',
                    'hover:bg-[#137fec]/90 transition-all',
                    'focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 focus:ring-offset-slate-900'
                  )}
                >
                  Sign in again
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              </>
            )}

            {/* Error State */}
            {status === 'error' && (
              <>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <p className="text-sm text-red-300">
                    There was a problem signing you out. Your local session has been cleared,
                    but the server session may still be active.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStatus('pending')}
                    className={cn(
                      'flex-1 px-4 py-2 rounded-lg',
                      'bg-slate-700 text-white font-medium',
                      'hover:bg-slate-600 transition-all'
                    )}
                  >
                    Try again
                  </button>
                  <Link
                    href="/login"
                    className={cn(
                      'flex-1 px-4 py-2 rounded-lg text-center',
                      'bg-[#137fec] text-white font-medium',
                      'hover:bg-[#137fec]/90 transition-all'
                    )}
                  >
                    Go to login
                  </Link>
                </div>
              </>
            )}

            {/* Processing State */}
            {status === 'processing' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-slate-400">
                  <span className="w-4 h-4 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm">Clearing session data...</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <span className="w-4 h-4 bg-blue-500 rounded-full animate-pulse" />
                  <span className="text-sm">Signing out from server...</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <span className="w-4 h-4 bg-slate-500 rounded-full" />
                  <span className="text-sm">Notifying other tabs...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-sm text-slate-400">
            Need help?{' '}
            <Link
              href="/support"
              className="text-slate-300 hover:text-white underline transition-colors"
            >
              Contact support
            </Link>
          </p>
          <p className="text-sm text-slate-500">
            <Link
              href="/"
              className="hover:text-slate-300 transition-colors"
            >
              Return to home page
            </Link>
          </p>
        </div>
      </div>
    </AuthBackground>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function LogoutPage() {
  return (
    <Suspense
      fallback={
        <AuthBackground>
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#137fec]" />
          </div>
        </AuthBackground>
      }
    >
      <LogoutContent />
    </Suspense>
  );
}
