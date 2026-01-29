'use client';

/**
 * MFA Challenge Component
 *
 * Multi-factor authentication verification interface.
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Features:
 * - 6-digit TOTP input with auto-focus and auto-advance
 * - Toggle between TOTP, SMS, Email, and Backup code methods
 * - Resend code functionality for SMS/Email
 * - Countdown timer for resend
 * - Loading and error states
 * - Keyboard navigation and accessibility
 */

import { useState, useRef, useEffect, useCallback, KeyboardEvent, ClipboardEvent } from 'react';
import { Card } from '@intelliflow/ui';

// ============================================
// Types
// ============================================

export type MfaMethod = 'totp' | 'sms' | 'email' | 'backup';

export interface MfaChallengeProps {
  /**
   * Available MFA methods for the user
   */
  availableMethods: MfaMethod[];
  /**
   * The default method to show
   */
  defaultMethod?: MfaMethod;
  /**
   * Called when user submits a code
   */
  onVerify: (code: string, method: MfaMethod) => Promise<boolean>;
  /**
   * Called when user requests code resend (SMS/Email only)
   */
  onResend?: (method: 'sms' | 'email') => Promise<boolean>;
  /**
   * Called when user wants to cancel MFA
   */
  onCancel?: () => void;
  /**
   * Error message to display
   */
  error?: string | null;
  /**
   * Whether verification is in progress
   */
  isLoading?: boolean;
  /**
   * Masked phone number for SMS display (e.g., "***-***-1234")
   */
  maskedPhone?: string;
  /**
   * Masked email for display (e.g., "t***@example.com")
   */
  maskedEmail?: string;
}

// ============================================
// Constants
// ============================================

const CODE_LENGTH = 6;
const BACKUP_CODE_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 60;

const METHOD_CONFIG = {
  totp: {
    title: 'Authenticator App',
    description: 'Enter the 6-digit code from your authenticator app',
    icon: 'security',
    codeLength: CODE_LENGTH,
    supportsResend: false,
  },
  sms: {
    title: 'Text Message',
    description: 'Enter the code sent to your phone',
    icon: 'sms',
    codeLength: CODE_LENGTH,
    supportsResend: true,
  },
  email: {
    title: 'Email',
    description: 'Enter the code sent to your email',
    icon: 'mail',
    codeLength: CODE_LENGTH,
    supportsResend: true,
  },
  backup: {
    title: 'Backup Code',
    description: 'Enter one of your backup codes',
    icon: 'key',
    codeLength: BACKUP_CODE_LENGTH,
    supportsResend: false,
  },
};

// ============================================
// Component
// ============================================

export function MfaChallenge({
  availableMethods,
  defaultMethod,
  onVerify,
  onResend,
  onCancel,
  error,
  isLoading = false,
  maskedPhone,
  maskedEmail,
}: MfaChallengeProps) {
  // State
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod>(
    defaultMethod || availableMethods[0] || 'totp'
  );
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [backupCode, setBackupCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Refs
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Config for current method
  const currentConfig = METHOD_CONFIG[selectedMethod];

  // ==========================================
  // Effects
  // ==========================================

  // Focus first input on mount and method change
  useEffect(() => {
    if (selectedMethod !== 'backup') {
      inputRefs.current[0]?.focus();
    }
  }, [selectedMethod]);

  // Clear code when method changes
  useEffect(() => {
    setCode(Array(CODE_LENGTH).fill(''));
    setBackupCode('');
    setLocalError(null);
  }, [selectedMethod]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ==========================================
  // Handlers
  // ==========================================

  const handleCodeChange = useCallback(
    (index: number, value: string) => {
      // Only allow digits
      if (value && !/^\d$/.test(value)) return;

      const newCode = [...code];
      newCode[index] = value;
      setCode(newCode);
      setLocalError(null);

      // Auto-advance to next input
      if (value && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      // Auto-submit when complete
      if (value && index === CODE_LENGTH - 1 && newCode.every((c) => c)) {
        handleSubmit(newCode.join(''));
      }
    },
    [code]
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      // Handle backspace - move to previous input
      if (e.key === 'Backspace' && !code[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      // Handle arrow keys
      else if (e.key === 'ArrowLeft' && index > 0) {
        inputRefs.current[index - 1]?.focus();
      } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [code]
  );

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');

    if (pastedData.length === 0) return;

    const newCode = [...code];
    for (let i = 0; i < Math.min(pastedData.length, CODE_LENGTH); i++) {
      newCode[i] = pastedData[i];
    }
    setCode(newCode);

    // Focus last filled input or last input
    const lastFilledIndex = Math.min(pastedData.length, CODE_LENGTH) - 1;
    inputRefs.current[lastFilledIndex]?.focus();

    // Auto-submit if complete
    if (pastedData.length >= CODE_LENGTH) {
      handleSubmit(newCode.slice(0, CODE_LENGTH).join(''));
    }
  }, [code]);

  const handleSubmit = useCallback(
    async (submittedCode?: string) => {
      const codeToVerify = submittedCode || (selectedMethod === 'backup' ? backupCode : code.join(''));

      if (!codeToVerify || codeToVerify.length < (selectedMethod === 'backup' ? BACKUP_CODE_LENGTH : CODE_LENGTH)) {
        setLocalError('Please enter the complete code');
        return;
      }

      setIsVerifying(true);
      setLocalError(null);

      try {
        const success = await onVerify(codeToVerify, selectedMethod);
        if (!success) {
          setLocalError('Invalid code. Please try again.');
          // Clear the code on failure
          if (selectedMethod === 'backup') {
            setBackupCode('');
          } else {
            setCode(Array(CODE_LENGTH).fill(''));
            inputRefs.current[0]?.focus();
          }
        }
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setIsVerifying(false);
      }
    },
    [selectedMethod, code, backupCode, onVerify]
  );

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || !onResend) return;

    try {
      const success = await onResend(selectedMethod as 'sms' | 'email');
      if (success) {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        setLocalError(null);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to resend code');
    }
  }, [resendCooldown, onResend, selectedMethod]);

  // ==========================================
  // Render
  // ==========================================

  const displayError = error || localError;
  const isButtonLoading = isLoading || isVerifying;

  return (
    <Card className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl rounded-2xl">
      {/* Card gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-[#137fec]/[0.03]" />

      <div className="relative p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#137fec]/20 mb-4">
            <span className="material-symbols-outlined text-3xl text-[#7cc4ff]" aria-hidden="true">
              {currentConfig.icon}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white">Two-Factor Authentication</h2>
          <p className="text-sm text-slate-300">{currentConfig.description}</p>
          {selectedMethod === 'sms' && maskedPhone && (
            <p className="text-sm text-[#7cc4ff]">{maskedPhone}</p>
          )}
          {selectedMethod === 'email' && maskedEmail && (
            <p className="text-sm text-[#7cc4ff]">{maskedEmail}</p>
          )}
        </div>

        {/* Method selector (if multiple methods available) */}
        {availableMethods.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2">
            {availableMethods.map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setSelectedMethod(method)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedMethod === method
                    ? 'bg-[#137fec] text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {METHOD_CONFIG[method].title}
              </button>
            ))}
          </div>
        )}

        {/* Code input */}
        {selectedMethod === 'backup' ? (
          // Backup code input (single text field)
          <div className="space-y-2">
            <input
              type="text"
              value={backupCode}
              onChange={(e) => {
                setBackupCode(e.target.value.toUpperCase());
                setLocalError(null);
              }}
              placeholder="Enter backup code"
              maxLength={BACKUP_CODE_LENGTH}
              className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white text-center text-lg tracking-widest font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:border-transparent"
              disabled={isButtonLoading}
              autoComplete="one-time-code"
            />
          </div>
        ) : (
          // 6-digit code input
          <div className="flex justify-center gap-2">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                className={`w-12 h-14 text-center text-2xl font-bold rounded-lg border bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:border-transparent transition-all ${
                  displayError ? 'border-red-500/50' : 'border-white/10 hover:border-white/20'
                }`}
                disabled={isButtonLoading}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
              />
            ))}
          </div>
        )}

        {/* Error message */}
        {displayError && (
          <p className="text-sm text-red-400 text-center flex items-center justify-center gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              error
            </span>
            {displayError}
          </p>
        )}

        {/* Resend code button (for SMS/Email) */}
        {currentConfig.supportsResend && onResend && (
          <div className="text-center">
            {resendCooldown > 0 ? (
              <p className="text-sm text-slate-400">
                Resend code in {resendCooldown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="text-sm text-[#7cc4ff] hover:text-[#5ab3ff] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] rounded px-2 py-1"
                disabled={isButtonLoading}
              >
                Didn&apos;t receive a code? Resend
              </button>
            )}
          </div>
        )}

        {/* Verify button */}
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={isButtonLoading}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#137fec]/20 hover:shadow-[#137fec]/30"
          aria-busy={isButtonLoading}
        >
          {isButtonLoading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-xl" aria-hidden="true">
                progress_activity
              </span>
              Verifying...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                verified
              </span>
              Verify
            </>
          )}
        </button>

        {/* Cancel button */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-sm text-slate-400 hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] rounded py-2"
            disabled={isButtonLoading}
          >
            Use a different login method
          </button>
        )}
      </div>
    </Card>
  );
}

// ============================================
// Inline MFA Challenge (for embedding in forms)
// ============================================

export interface InlineMfaChallengeProps extends Omit<MfaChallengeProps, 'onCancel'> {
  /**
   * Called to go back to the login form
   */
  onBack: () => void;
}

/**
 * Inline version of MFA challenge for embedding in login forms
 *
 * Shows just the code input without the card wrapper.
 */
export function InlineMfaChallenge({
  availableMethods,
  defaultMethod,
  onVerify,
  onResend,
  onBack,
  error,
  isLoading = false,
  maskedPhone,
  maskedEmail,
}: InlineMfaChallengeProps) {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          arrow_back
        </span>
        Back to login
      </button>

      {/* MFA Challenge without card wrapper */}
      <MfaChallenge
        availableMethods={availableMethods}
        defaultMethod={defaultMethod}
        onVerify={onVerify}
        onResend={onResend}
        error={error}
        isLoading={isLoading}
        maskedPhone={maskedPhone}
        maskedEmail={maskedEmail}
      />
    </div>
  );
}

export default MfaChallenge;
