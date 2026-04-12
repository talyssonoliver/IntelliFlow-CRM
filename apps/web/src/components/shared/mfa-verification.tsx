'use client';

/**
 * MFA Verification Component
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * A wrapper component for MFA verification that integrates with:
 * - Existing MfaChallenge component
 * - tRPC auth.verifyMfa endpoint
 * - URL params for standalone usage
 * - Success redirect logic
 *
 * Used by both standalone /mfa/verify page and inline MFA flow.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { MfaChallenge, type MfaMethod } from '@/components/auth/mfa-challenge';
import { trpc } from '@/lib/trpc';
import { sanitizeCode, isValidTotpCode, isValidBackupCode } from '@/lib/shared/code-validator';

// ============================================
// Helpers
// ============================================

function resolveVerifyErrorMessage(message: string, setIsExpired: (v: boolean) => void): string {
  if (message.includes('expired')) {
    setIsExpired(true);
    return 'This verification code has expired. Please request a new one.';
  }
  if (message.includes('invalid') || message.includes('incorrect')) {
    return 'Invalid verification code. Please check and try again.';
  }
  if (message.includes('attempts')) {
    return 'Too many failed attempts. Please wait and try again.';
  }
  return message;
}

// ============================================
// Types
// ============================================

export interface MfaVerificationProps {
  /**
   * Challenge ID from URL or direct prop
   */
  challengeId?: string;
  /**
   * User email for display
   */
  email?: string;
  /**
   * Pre-selected MFA method
   */
  method?: MfaMethod;
  /**
   * Available methods for this user
   */
  availableMethods?: MfaMethod[];
  /**
   * Called after successful verification
   */
  onSuccess: () => void;
  /**
   * Called when user cancels verification
   */
  onCancel?: () => void;
  /**
   * URL to redirect to after success
   */
  redirectUrl?: string;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Masked phone number for SMS display
   */
  maskedPhone?: string;
  /**
   * Masked email for display
   */
  maskedEmail?: string;
}

interface ChallengeData {
  challengeId: string;
  method: MfaMethod;
  email?: string;
  expiresAt: string;
  availableMethods?: MfaMethod[];
  maskedPhone?: string;
  maskedEmail?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Stable default for availableMethods. Defined at module level so React's
 * referential equality check sees the same array reference on every render,
 * eliminating spurious useEffect re-runs caused by inline array literals.
 */
const DEFAULT_AVAILABLE_METHODS: MfaMethod[] = ['totp', 'sms', 'email', 'backup'];

// ============================================
// Component
// ============================================

export function MfaVerification({
  challengeId: propChallengeId,
  email,
  method: propMethod = 'totp',
  availableMethods = DEFAULT_AVAILABLE_METHODS,
  onSuccess,
  onCancel,
  redirectUrl,
  className,
  maskedPhone,
  maskedEmail,
}: Readonly<MfaVerificationProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get challenge ID from props or URL
  const challengeId = propChallengeId || searchParams.get('challenge') || undefined;
  const urlRedirect = searchParams.get('redirect') || redirectUrl;

  // State
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isInvalidChallenge, setIsInvalidChallenge] = useState(false);
  const [challengeData, setChallengeData] = useState<ChallengeData | null>(null);

  // tRPC mutations
  const verifyMfaMutation = trpc.auth.verifyMfa.useMutation();
  const resendMfaCodeMutation = trpc.auth.resendMfaCode.useMutation();

  // Check if we have a valid challenge
  useEffect(() => {
    // If we have a challengeId, validate and fetch challenge data
    if (challengeId) {
      // Simulate challenge validation
      // In production, this would call auth.getMfaChallenge
      // and handle invalid/expired challenges appropriately
      try {
        // Basic validation: challengeId should be non-empty and have valid format
        if (challengeId.length < 3 || challengeId === 'invalid') {
          setIsInvalidChallenge(true);
          return;
        }

        setChallengeData({
          challengeId,
          method: propMethod,
          email,
          expiresAt: new Date(Date.now() + 300000).toISOString(), // 5 minutes
          availableMethods,
          maskedPhone,
          maskedEmail,
        });
      } catch {
        // Challenge validation failed
        setIsInvalidChallenge(true);
      }
    }
  }, [availableMethods, challengeId, email, maskedEmail, maskedPhone, propMethod]);

  // Check expiration
  useEffect(() => {
    if (challengeData?.expiresAt) {
      const expiresAt = new Date(challengeData.expiresAt);
      if (expiresAt < new Date()) {
        setIsExpired(true);
        setError('This verification link has expired. Please request a new one.');
      }
    }
  }, [challengeData]);

  /**
   * Handle code verification
   */
  const handleVerify = useCallback(
    async (code: string, method: MfaMethod): Promise<boolean> => {
      setError(null);

      const sanitized = sanitizeCode(code);
      const isValidCode =
        method === 'backup' ? isValidBackupCode(code) : isValidTotpCode(sanitized);
      const invalidMsg =
        method === 'backup' ? 'Invalid backup code format' : 'Please enter a valid 6-digit code';

      if (!isValidCode) {
        setError(invalidMsg);
        return false;
      }

      try {
        const result = await verifyMfaMutation.mutateAsync({
          code: method === 'backup' ? code : sanitized,
          method,
          challengeId: challengeId || 'inline',
        });

        if (result.success) {
          onSuccess();
          if (urlRedirect) router.push(urlRedirect);
          return true;
        }

        setError('Verification failed. Please try again.');
        return false;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Verification failed';
        setError(resolveVerifyErrorMessage(message, setIsExpired));
        return false;
      }
    },
    [challengeId, onSuccess, router, urlRedirect, verifyMfaMutation]
  );

  /**
   * Handle resend code request
   *
   * Calls auth.resendMfaCode tRPC mutation to trigger a real code delivery.
   * Returns true on success so MfaChallenge can start the cooldown timer.
   */
  const handleResend = useCallback(
    async (method: 'sms' | 'email'): Promise<boolean> => {
      try {
        const result = await resendMfaCodeMutation.mutateAsync({
          method,
          challengeId: challengeId,
        });
        return result.success;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to resend code. Please try again.';
        setError(message);
        return false;
      }
    },
    [challengeId, resendMfaCodeMutation]
  );

  // Render expired state
  if (isExpired) {
    return (
      <div className={cn('text-center py-8', className)}>
        <span className="material-symbols-outlined text-6xl text-amber-500 mb-4" aria-hidden="true">
          schedule
        </span>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Verification Expired
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          This verification link has expired or is no longer valid.
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900"
            aria-label="Return to login"
          >
            Return to Login
          </button>
        )}
      </div>
    );
  }

  // Render invalid challenge state
  if (isInvalidChallenge) {
    return (
      <div className={cn('text-center py-8', className)}>
        <span
          className="material-symbols-outlined text-6xl text-destructive mb-4"
          aria-hidden="true"
        >
          error
        </span>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Invalid Verification Link
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          This verification link is not valid or has already been used.
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900"
            aria-label="Return to login"
          >
            Return to Login
          </button>
        )}
      </div>
    );
  }

  // Get effective values from challenge data or props
  const effectiveEmail = challengeData?.email || email;
  const effectiveMethods = challengeData?.availableMethods || availableMethods;
  const effectiveMethod = challengeData?.method || propMethod;
  const effectiveMaskedPhone = challengeData?.maskedPhone || maskedPhone;
  const effectiveMaskedEmail = challengeData?.maskedEmail || maskedEmail;

  return (
    <div className={cn('w-full', className)} data-testid="mfa-verification">
      {/* Email display */}
      {effectiveEmail && (
        <div className="mb-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">Verifying for</p>
          <p className="font-medium text-slate-900 dark:text-white">{effectiveEmail}</p>
        </div>
      )}

      {/* Loading indicator (for test) */}
      {verifyMfaMutation.isPending && (
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- indeterminate loading overlay with spinner icon; <progress> cannot contain child elements
        <div
          data-testid="loading-indicator"
          className="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10"
          role="progressbar" // NOSONAR typescript:S6819
          aria-label="Verifying code"
        >
          <span className="material-symbols-outlined animate-spin text-3xl text-primary">
            progress_activity
          </span>
        </div>
      )}

      {/* MFA Challenge Component */}
      <MfaChallenge
        availableMethods={effectiveMethods}
        defaultMethod={effectiveMethod}
        onVerify={handleVerify}
        onResend={handleResend}
        onCancel={onCancel}
        error={error}
        isLoading={verifyMfaMutation.isPending}
        maskedPhone={effectiveMaskedPhone}
        maskedEmail={effectiveMaskedEmail}
      />
    </div>
  );
}
