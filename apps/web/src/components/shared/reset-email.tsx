'use client';

/**
 * Reset Email Components
 *
 * Email template and form components for password reset flow.
 *
 * IMPLEMENTS: PG-019 (Forgot Password page)
 *
 * Features:
 * - Email input form with validation
 * - Success confirmation display
 * - Resend functionality
 * - Rate limit display
 * - Accessibility support
 */

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@intelliflow/ui';

// ============================================
// Types
// ============================================

export interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<void>;
  isLoading?: boolean;
  initialEmail?: string;
  className?: string;
}

export interface ResetEmailSentProps {
  email: string;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
  isResending?: boolean;
  resendCooldown?: number;
  className?: string;
}

export interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

// ============================================
// Email Validation
// ============================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim();

  if (!trimmed) {
    return { valid: false, error: 'Email address is required' };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }

  return { valid: true };
}

// ============================================
// Email Input Component
// ============================================

export function EmailInput({
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  autoFocus = false,
  className,
}: EmailInputProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor="reset-email"
        className="block text-sm font-medium text-slate-200"
      >
        Email address
      </label>
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        >
          <span className="material-symbols-outlined text-xl">mail</span>
        </span>
        <input
          id="reset-email"
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!error}
          aria-describedby={error ? 'reset-email-error' : undefined}
          className={cn(
            'w-full pl-10 pr-4 py-3 rounded-lg',
            'bg-slate-800/50 border text-white placeholder-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900',
            'transition-colors',
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-600 focus:border-[#137fec] focus:ring-[#137fec]',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>
      {error && (
        <p id="reset-email-error" className="text-sm text-red-400 flex items-center gap-1">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            error
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================
// Forgot Password Form
// ============================================

export function ForgotPasswordForm({
  onSubmit,
  isLoading = false,
  initialEmail = '',
  className,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);

  // Validate on blur
  const handleBlur = useCallback(() => {
    setTouched(true);
    if (email) {
      const validation = validateEmail(email);
      setError(validation.error);
    }
  }, [email]);

  // Clear error when typing
  useEffect(() => {
    if (touched && email) {
      const validation = validateEmail(email);
      if (validation.valid) {
        setError(undefined);
      }
    }
  }, [email, touched]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);

      const validation = validateEmail(email);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }

      try {
        await onSubmit(email.trim().toLowerCase());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    },
    [email, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      <EmailInput
        value={email}
        onChange={(value) => {
          setEmail(value);
          if (error && value) setError(undefined);
        }}
        onBlur={handleBlur}
        error={touched ? error : undefined}
        disabled={isLoading}
        autoFocus
      />

      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg',
          'bg-[#137fec] text-white font-medium',
          'hover:bg-[#137fec]/90 transition-all',
          'focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 focus:ring-offset-slate-900',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isLoading ? (
          <>
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sending reset link...
          </>
        ) : (
          <>
            Send reset link
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              send
            </span>
          </>
        )}
      </button>
    </form>
  );
}

// ============================================
// Reset Email Sent Confirmation
// ============================================

export function ResetEmailSent({
  email,
  onResend,
  onChangeEmail,
  isResending = false,
  resendCooldown = 0,
  className,
}: ResetEmailSentProps) {
  const [cooldown, setCooldown] = useState(resendCooldown);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  // Reset cooldown when resendCooldown prop changes
  useEffect(() => {
    setCooldown(resendCooldown);
  }, [resendCooldown]);

  // Mask email for display
  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');

  return (
    <div className={cn('space-y-6', className)}>
      {/* Success Icon */}
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-green-400" aria-hidden="true">
            mark_email_read
          </span>
        </div>
      </div>

      {/* Success Message */}
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-white">Check your email</h2>
        <p className="text-slate-300">
          We sent a password reset link to
        </p>
        <p className="text-white font-medium">{maskedEmail}</p>
      </div>

      {/* Instructions */}
      <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[#137fec] flex-shrink-0" aria-hidden="true">
            info
          </span>
          <div className="text-sm text-slate-300">
            <p>The link will expire in <span className="text-white font-medium">1 hour</span>.</p>
            <p className="mt-1">
              If you don&apos;t see the email, check your spam folder.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={onResend}
          disabled={isResending || cooldown > 0}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg',
            'bg-slate-700 text-white font-medium',
            'hover:bg-slate-600 transition-all',
            'focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isResending ? (
            <>
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Resending...
            </>
          ) : cooldown > 0 ? (
            <>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                schedule
              </span>
              Resend in {cooldown}s
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                refresh
              </span>
              Resend email
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onChangeEmail}
          className="w-full text-center text-sm text-slate-400 hover:text-white transition-colors"
        >
          Use a different email address
        </button>
      </div>
    </div>
  );
}

// ============================================
// Email Template Builder (for backend use)
// ============================================

export interface ResetEmailPayload {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  metadata: {
    source: 'password_reset';
    email: string;
    expiresAt: string;
  };
}

/**
 * Build password reset email payload
 */
export function buildResetEmailPayload(options: {
  email: string;
  resetUrl: string;
  expiresAt: Date;
  userName?: string;
}): ResetEmailPayload {
  const { email, resetUrl, expiresAt, userName } = options;
  const name = userName || email.split('@')[0];

  // Escape HTML in user-provided content
  const escapedName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
          <tr>
            <td style="text-align: center;">
              <span style="display: inline-block; padding: 8px 16px; background: linear-gradient(135deg, #137fec 0%, #7cc4ff 100%); border-radius: 8px; color: white; font-size: 14px; font-weight: 600; letter-spacing: 1px;">
                INTELLIFLOW
              </span>
            </td>
          </tr>
        </table>

        <!-- Content -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #1e293b; border-radius: 16px; padding: 32px;">
          <tr>
            <td>
              <h1 style="margin: 0 0 16px 0; color: #ffffff; font-size: 24px; font-weight: 600; text-align: center;">
                Reset Your Password
              </h1>
              <p style="margin: 0 0 24px 0; color: #94a3b8; font-size: 16px; line-height: 1.6; text-align: center;">
                Hi ${escapedName}, we received a request to reset your password.
              </p>

              <!-- Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #137fec; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6; text-align: center;">
                This link will expire in <strong style="color: #94a3b8;">1 hour</strong>.
              </p>

              <hr style="margin: 24px 0; border: none; border-top: 1px solid #334155;">

              <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.
              </p>

              <p style="margin: 16px 0 0 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                Can't click the button? Copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #137fec; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
          <tr>
            <td style="text-align: center; color: #64748b; font-size: 12px;">
              <p style="margin: 0;">
                &copy; ${new Date().getFullYear()} IntelliFlow. All rights reserved.
              </p>
              <p style="margin: 8px 0 0 0;">
                <a href="#" style="color: #94a3b8; text-decoration: underline;">Privacy Policy</a>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <a href="#" style="color: #94a3b8; text-decoration: underline;">Terms of Service</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const textBody = `
Reset Your Password

Hi ${name},

We received a request to reset your password for your IntelliFlow account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.

---
IntelliFlow
  `.trim();

  return {
    to: email,
    from: 'noreply@intelliflow.com',
    replyTo: 'support@intelliflow.com',
    subject: 'Reset your IntelliFlow password',
    htmlBody,
    textBody,
    metadata: {
      source: 'password_reset',
      email,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export default ForgotPasswordForm;
