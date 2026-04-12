'use client';

/**
 * Legacy Email Verification Page — Backward Compatibility (NF-005)
 *
 * Old-style /verify-email/[token] URLs are no longer valid.
 * Supabase redirects to /verify-email/callback?token_hash=...&type=email
 * Show "invalid link" with option to resend verification.
 *
 * URL: /verify-email/{token}?email={email}&redirect={redirect}
 */

import { Suspense, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { AuthBackground, AuthCard } from '@/components/shared';
import { trpc } from '@/lib/trpc';

// ============================================
// Inner Content (requires Suspense for useSearchParams)
// ============================================

function LegacyVerifyContent() {
  useRedirectIfAuthenticated('/dashboard');

  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const resendMutation = trpc.auth.resendVerification.useMutation();

  const handleResend = useCallback(async () => {
    if (!email) return;
    try {
      await resendMutation.mutateAsync({ email });
      setResendMessage('A new verification link has been sent to your email.');
    } catch {
      setResendMessage('Failed to resend. Please try again.');
    }
  }, [email, resendMutation]);

  return (
    <AuthBackground>
      <AuthCard badge="INTELLIFLOW" badgeIcon="mark_email_read" title="Invalid Verification Link">
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-3xl text-amber-400" aria-hidden="true">
              schedule
            </span>
          </div>
          <p className="text-slate-300 text-sm">
            This verification link format is no longer supported. Please request a new verification
            email.
          </p>

          {email && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resendMutation.isPending}
              className={cn(
                'inline-flex items-center gap-2 px-6 py-3 rounded-lg',
                'bg-[#137fec] text-white font-medium',
                'hover:bg-[#137fec]/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {resendMutation.isPending ? 'Sending...' : 'Resend Verification Email'}
            </button>
          )}

          {resendMessage && (
            <output
              className={cn(
                'text-sm',
                resendMessage.includes('sent') ? 'text-green-400' : 'text-amber-400'
              )}
            >
              {resendMessage}
            </output>
          )}

          <Link
            href="/login"
            className="inline-block text-sm text-[#137fec] hover:text-[#7cc4ff] transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    </AuthBackground>
  );
}

// ============================================
// Page Component
// ============================================

export default function LegacyEmailVerifyPage() {
  return (
    <Suspense
      fallback={
        <AuthBackground>
          <div className="flex items-center justify-center min-h-screen">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </AuthBackground>
      }
    >
      <LegacyVerifyContent />
    </Suspense>
  );
}
