'use client';

/**
 * VerifyEmailBanner
 *
 * Persistent global banner prompting unverified users to confirm their email.
 * Mounted in the root layout between <Navigation/> and <RouteAccessGate>.
 *
 * Behaviour:
 * - Renders ONLY when isAuthenticated && emailVerified === false.
 * - Hidden for Google/OAuth users (they arrive with emailVerified=true).
 * - Hidden on public/auth routes; only shows inside the authenticated shell.
 * - "Resend email" calls trpc.auth.resendVerification and shows a sent state.
 *   TOO_MANY_REQUESTS is handled gracefully.
 * - Dismiss (X) hides banner for the current browser session via sessionStorage.
 *   Re-appears next session until the user verifies.
 *
 * Accessibility:
 * - Uses <output> for live messaging (not role="status" — sonar-guard a11y rule).
 * - Keyboard-operable dismiss button with aria-label.
 * - Material Symbols Outlined icons (ADR-046 / PG-195 — no lucide-react).
 */

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { isProtectedAppRoute } from '@/lib/auth/route-protection';
import { cn } from '@intelliflow/ui';

// sessionStorage key used to track dismiss-for-session
const DISMISSED_STORAGE_ID = 'intelliflow_verify_banner_dismissed';

function isBannerDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(DISMISSED_STORAGE_ID) === '1';
}

function dismissBanner(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(DISMISSED_STORAGE_ID, '1');
}

// ============================================
// VerifyEmailBanner
// ============================================

export function VerifyEmailBanner() {
  const { isAuthenticated, emailVerified, user } = useAuth();
  const pathname = usePathname() ?? '/';
  const [dismissed, setDismissed] = useState(() => isBannerDismissed());
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'rate-limited'>('idle');

  const resendMutation = trpc.auth.resendVerification.useMutation();

  const handleResend = useCallback(async () => {
    if (sendState === 'sending' || sendState === 'sent') return;
    if (!user?.email) return;
    setSendState('sending');
    try {
      await resendMutation.mutateAsync({ email: user.email });
      setSendState('sent');
    } catch (err: unknown) {
      const trpcError = err as { data?: { code?: string } };
      if (trpcError.data?.code === 'TOO_MANY_REQUESTS') {
        setSendState('rate-limited');
      } else {
        // Treat other errors as a transient failure — reset to idle so the
        // user can retry rather than seeing a permanent error state.
        setSendState('idle');
      }
    }
  }, [sendState, resendMutation, user]);

  const handleDismiss = useCallback(() => {
    dismissBanner();
    setDismissed(true);
  }, []);

  // Only render on protected (authenticated-shell) routes
  if (!isProtectedAppRoute(pathname)) return null;
  // Only render when auth is settled, user is authenticated, and email is unverified
  if (!isAuthenticated || emailVerified !== false) return null;
  // Respect session dismiss
  if (dismissed) return null;

  return (
    <section
      aria-label="Email verification required"
      className={cn(
        'relative flex items-center justify-between gap-3 px-4 py-2.5',
        'bg-amber-50 border-b border-amber-200 text-amber-900',
        'dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100'
      )}
      data-testid="verify-email-banner"
    >
      {/* Left: icon + headline */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="material-symbols-outlined text-amber-500 flex-shrink-0 text-[20px]"
          aria-hidden="true"
        >
          mark_email_unread
        </span>
        <p className="text-sm font-medium truncate">
          Verify your email to unlock sending, invites and billing.
        </p>
      </div>

      {/* Right: resend button + live status + dismiss */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {sendState !== 'sent' && sendState !== 'rate-limited' && (
          <button
            type="button"
            onClick={handleResend}
            disabled={sendState === 'sending'}
            aria-label="Resend verification email"
            className={cn(
              'text-sm font-medium underline underline-offset-2',
              'text-amber-700 hover:text-amber-900',
              'dark:text-amber-300 dark:hover:text-amber-100',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {sendState === 'sending' ? (
              <span className="flex items-center gap-1">
                <span
                  className="material-symbols-outlined text-[16px] animate-spin"
                  aria-hidden="true"
                >
                  sync
                </span>
                <span>Sending&hellip;</span>
              </span>
            ) : (
              'Resend email'
            )}
          </button>
        )}

        {/* Live region for send feedback — <output> per sonar-guard a11y rule */}
        {(sendState === 'sent' || sendState === 'rate-limited') && (
          <output
            aria-live="polite"
            className={cn(
              'text-sm',
              sendState === 'sent'
                ? 'text-green-700 dark:text-green-400'
                : 'text-red-700 dark:text-red-400'
            )}
          >
            {sendState === 'sent'
              ? 'Verification email sent.'
              : 'Too many requests. Please try again later.'}
          </output>
        )}

        {/* Dismiss for session */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss email verification banner"
          className={cn(
            'ml-1 p-0.5 rounded-sm',
            'text-amber-600 hover:text-amber-900',
            'dark:text-amber-400 dark:hover:text-amber-100',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500'
          )}
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            close
          </span>
        </button>
      </div>
    </section>
  );
}
