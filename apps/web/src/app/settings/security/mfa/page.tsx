'use client';

/**
 * MFA Setup Page
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * Multi-step wizard for setting up multi-factor authentication:
 * 1. Method selection (TOTP, SMS, Email)
 * 2. Method setup (QR code, phone input, email confirm)
 * 3. Code verification
 * 4. Backup codes display
 * 5. Success confirmation
 *
 * Integrates with tRPC endpoints:
 * - auth.setupMfa: Initiates MFA setup (generates secret/QR code)
 * - auth.confirmMfa: Verifies code and enables MFA
 * - auth.getBackupCodes: Generates backup codes
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn, Card } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { MfaQrGenerator } from '@/components/shared/mfa-qr-generator';
import { BackupCodesDisplay } from '@/components/shared/backup-codes-display';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';

// ============================================
// Types
// ============================================

type MfaMethod = 'totp' | 'sms' | 'email';
type WizardStep = 'method' | 'setup' | 'verify' | 'backup' | 'complete';

interface SetupData {
  method: MfaMethod;
  secret?: string;
  qrCodeUrl?: string;
  phone?: string;
  email?: string;
}

interface MethodOption {
  id: MfaMethod;
  name: string;
  description: string;
  icon: string;
  recommended?: boolean;
}

// ============================================
// Constants
// ============================================

const MFA_METHODS: MethodOption[] = [
  {
    id: 'totp',
    name: 'Authenticator App',
    description: 'Use Google Authenticator, Authy, or 1Password to generate codes',
    icon: 'key',
    recommended: true,
  },
  {
    id: 'sms',
    name: 'SMS Code',
    description: 'Receive a verification code via text message',
    icon: 'sms',
  },
  {
    id: 'email',
    name: 'Email Code',
    description: 'Receive a verification code via email',
    icon: 'email',
  },
];

// ============================================
// Sub-components
// ============================================

interface MethodCardProps {
  method: MethodOption;
  selected: boolean;
  onSelect: () => void;
}

function MethodCard({ method, selected, onSelect }: MethodCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-lg border-2 text-left transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900',
        selected
          ? 'border-[#137fec] bg-[#137fec]/10'
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            selected ? 'bg-[#137fec]' : 'bg-slate-700'
          )}
        >
          <span className="material-symbols-outlined text-white" aria-hidden="true">
            {method.icon}
          </span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('font-medium', selected ? 'text-white' : 'text-slate-300')}>
              {method.name}
            </span>
            {method.recommended && (
              <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                Recommended
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">{method.description}</p>
        </div>
        <div
          className={cn(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center',
            selected ? 'border-[#137fec] bg-[#137fec]' : 'border-slate-600'
          )}
        >
          {selected && (
            <span className="material-symbols-outlined text-sm text-white" aria-hidden="true">
              check
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

interface VerificationInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error?: string;
  loading?: boolean;
}

function VerificationInput({ value, onChange, onSubmit, error, loading }: VerificationInputProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="verification-code" className="block text-sm font-medium text-slate-300">
          Verification Code
        </label>
        <input
          id="verification-code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.length === 6) {
              onSubmit();
            }
          }}
          placeholder="000000"
          className={cn(
            'w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em]',
            'bg-slate-700 border-2 rounded-lg',
            'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900',
            error ? 'border-red-500' : 'border-slate-600 focus:border-[#137fec]'
          )}
          aria-describedby={error ? 'verification-error' : undefined}
          aria-invalid={!!error}
        />
        {error && (
          <p id="verification-error" className="text-sm text-red-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              error
            </span>
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={value.length !== 6 || loading}
        className={cn(
          'w-full py-3 px-4 rounded-lg font-medium transition-colors',
          'flex items-center justify-center gap-2',
          value.length === 6 && !loading
            ? 'bg-[var(--color-primary,#137fec)] text-white hover:bg-[var(--color-primary-hover,#0d6ecc)]'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900'
        )}
      >
        {loading ? (
          <>
            <span className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
            Verifying...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              verified
            </span>
            Verify Code
          </>
        )}
      </button>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function MfaSetupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<WizardStep>('method');
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod>('totp');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesGeneratedAt, setBackupCodesGeneratedAt] = useState<Date>(new Date());
  const [phoneNumber, setPhoneNumber] = useState('');

  // User email from auth context
  const userEmail = user?.email || 'user@example.com';

  // tRPC mutations
  const setupMfaMutation = trpc.auth.setupMfa.useMutation();
  const confirmMfaMutation = trpc.auth.confirmMfa.useMutation();
  const getBackupCodesMutation = trpc.auth.getBackupCodes.useMutation();

  // Step 1: Select method and initiate setup
  const handleMethodSelect = useCallback(async () => {
    try {
      const result = await setupMfaMutation.mutateAsync({
        method: selectedMethod,
        phone: selectedMethod === 'sms' ? phoneNumber : undefined,
      });

      if (result.success) {
        // Handle discriminated union response based on method
        const setupDataFromResult: SetupData = {
          method: selectedMethod,
        };

        if (result.method === 'totp') {
          setupDataFromResult.secret = result.secret;
          setupDataFromResult.qrCodeUrl = result.qrCodeUrl;
        } else if (result.method === 'sms' || result.method === 'email') {
          setupDataFromResult.email = result.codeSentTo;
        }

        setSetupData(setupDataFromResult);
        setStep('setup');
      }
    } catch (error) {
      console.error('MFA setup failed:', error);
      setVerificationError(
        error instanceof Error ? error.message : 'Failed to initiate MFA setup'
      );
    }
  }, [selectedMethod, phoneNumber, setupMfaMutation]);

  // Step 2: Complete setup (QR scanned, phone entered, etc.)
  const handleSetupComplete = useCallback(() => {
    setStep('verify');
  }, []);

  // Step 3: Verify code and enable MFA
  const handleVerification = useCallback(async () => {
    setVerificationError('');

    try {
      const result = await confirmMfaMutation.mutateAsync({
        method: selectedMethod,
        code: verificationCode,
      });

      if (result.success) {
        // MFA enabled - now generate backup codes
        const backupResult = await getBackupCodesMutation.mutateAsync();
        setBackupCodes(backupResult.codes);
        setBackupCodesGeneratedAt(new Date(backupResult.generatedAt));
        setStep('backup');
      }
    } catch (error) {
      console.error('MFA verification failed:', error);
      setVerificationError(
        error instanceof Error ? error.message : 'Invalid verification code. Please try again.'
      );
    }
  }, [verificationCode, selectedMethod, confirmMfaMutation, getBackupCodesMutation]);

  // Step 4: Acknowledge backup codes
  const handleBackupAcknowledge = useCallback(() => {
    setStep('complete');
  }, []);

  // Step 5: Complete and return to settings
  const handleComplete = useCallback(() => {
    router.push('/settings/account');
  }, [router]);

  // Check if any mutation is loading (for future UI enhancements)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _isLoading = setupMfaMutation.isPending || confirmMfaMutation.isPending || getBackupCodesMutation.isPending;

  // Get step title and description
  const getStepInfo = () => {
    switch (step) {
      case 'method':
        return {
          title: 'Choose Authentication Method',
          description: 'Select how you want to receive verification codes',
        };
      case 'setup':
        return {
          title:
            selectedMethod === 'totp'
              ? 'Set Up Authenticator App'
              : selectedMethod === 'sms'
                ? 'Set Up SMS Verification'
                : 'Set Up Email Verification',
          description: 'Follow the instructions below to complete setup',
        };
      case 'verify':
        return {
          title: 'Verify Your Setup',
          description: 'Enter the 6-digit code to confirm everything is working',
        };
      case 'backup':
        return {
          title: 'Save Backup Codes',
          description: 'These codes will help you access your account if you lose your device',
        };
      case 'complete':
        return {
          title: 'Setup Complete!',
          description: 'Two-factor authentication is now enabled on your account',
        };
    }
  };

  const stepInfo = getStepInfo();

  return (
    <div className="mfa-setup-page">
      {/* Header */}
      <PageHeader
        title="Set Up Two-Factor Authentication"
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Account', href: '/settings/account' },
          { label: 'MFA Setup' },
        ]}
      />

      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-md">
          {['method', 'setup', 'verify', 'backup', 'complete'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  step === s
                    ? 'bg-[#137fec] text-white'
                    : ['method', 'setup', 'verify', 'backup', 'complete'].indexOf(step) > i
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-700 text-slate-400'
                )}
              >
                {['method', 'setup', 'verify', 'backup', 'complete'].indexOf(step) > i ? (
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    check
                  </span>
                ) : (
                  i + 1
                )}
              </div>
              {i < 4 && (
                <div
                  className={cn(
                    'w-12 h-0.5 mx-1',
                    ['method', 'setup', 'verify', 'backup', 'complete'].indexOf(step) > i
                      ? 'bg-green-500'
                      : 'bg-slate-700'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="max-w-lg p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-100">{stepInfo.title}</h2>
          <p className="text-slate-400 mt-1">{stepInfo.description}</p>
        </div>

        {/* Method Selection Step */}
        {step === 'method' && (
          <div className="space-y-6">
            <div className="space-y-3">
              {MFA_METHODS.map((method) => (
                <MethodCard
                  key={method.id}
                  method={method}
                  selected={selectedMethod === method.id}
                  onSelect={() => setSelectedMethod(method.id)}
                />
              ))}
            </div>

            {/* Phone input for SMS method */}
            {selectedMethod === 'sms' && (
              <div className="space-y-2">
                <label htmlFor="phone-number" className="block text-sm font-medium text-slate-300">
                  Phone Number
                </label>
                <input
                  id="phone-number"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className={cn(
                    'w-full px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg',
                    'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:border-[#137fec]',
                    'text-slate-100 placeholder:text-slate-500'
                  )}
                />
                <p className="text-xs text-slate-500">
                  Enter your phone number in E.164 format (e.g., +14155551234)
                </p>
              </div>
            )}

            {/* Error display */}
            {verificationError && step === 'method' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    error
                  </span>
                  {verificationError}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleMethodSelect}
              disabled={setupMfaMutation.isPending || (selectedMethod === 'sms' && !phoneNumber)}
              className={cn(
                'w-full py-3 px-4 rounded-lg font-medium',
                'bg-[var(--color-primary,#137fec)] text-white',
                'hover:bg-[var(--color-primary-hover,#0d6ecc)]',
                'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900',
                'transition-colors flex items-center justify-center gap-2',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {setupMfaMutation.isPending ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    arrow_forward
                  </span>
                  Continue with {MFA_METHODS.find((m) => m.id === selectedMethod)?.name}
                </>
              )}
            </button>
          </div>
        )}

        {/* TOTP Setup Step */}
        {step === 'setup' && setupData?.method === 'totp' && setupData.qrCodeUrl && setupData.secret && (
          <MfaQrGenerator
            otpauthUrl={setupData.qrCodeUrl}
            secret={setupData.secret}
            accountName={userEmail}
            onConfirm={handleSetupComplete}
          />
        )}

        {/* SMS/Email Setup Step (placeholder) */}
        {step === 'setup' && (setupData?.method === 'sms' || setupData?.method === 'email') && (
          <div className="space-y-4">
            <p className="text-slate-400">
              {setupData.method === 'sms'
                ? 'Enter your phone number to receive verification codes.'
                : 'We will send verification codes to your email.'}
            </p>
            {setupData.method === 'sms' && (
              <input
                type="tel"
                placeholder="+1 (555) 123-4567"
                className={cn(
                  'w-full px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg',
                  'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:border-[#137fec]'
                )}
              />
            )}
            <button
              type="button"
              onClick={handleSetupComplete}
              className={cn(
                'w-full py-3 px-4 rounded-lg font-medium',
                'bg-[var(--color-primary,#137fec)] text-white',
                'hover:bg-[var(--color-primary-hover,#0d6ecc)]',
                'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900'
              )}
            >
              Send Code
            </button>
          </div>
        )}

        {/* Verification Step */}
        {step === 'verify' && (
          <VerificationInput
            value={verificationCode}
            onChange={setVerificationCode}
            onSubmit={handleVerification}
            error={verificationError}
            loading={confirmMfaMutation.isPending || getBackupCodesMutation.isPending}
          />
        )}

        {/* Backup Codes Step */}
        {step === 'backup' && backupCodes.length > 0 && (
          <BackupCodesDisplay
            codes={backupCodes}
            email={userEmail}
            generatedAt={backupCodesGeneratedAt}
            onAcknowledge={handleBackupAcknowledge}
          />
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-green-400" aria-hidden="true">
                verified_user
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">
                Two-Factor Authentication Enabled
              </h3>
              <p className="text-slate-400 mt-2">
                Your account is now protected with an additional layer of security.
                You will need to enter a verification code when signing in.
              </p>
            </div>
            <button
              type="button"
              onClick={handleComplete}
              className={cn(
                'w-full py-3 px-4 rounded-lg font-medium',
                'bg-[var(--color-primary,#137fec)] text-white',
                'hover:bg-[var(--color-primary-hover,#0d6ecc)]',
                'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900',
                'transition-colors flex items-center justify-center gap-2'
              )}
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                arrow_back
              </span>
              Return to Account Settings
            </button>
          </div>
        )}
      </Card>

      {/* Cancel Link */}
      {step !== 'complete' && (
        <div className="mt-4 text-center">
          <Link
            href="/settings/account"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel and return to settings
          </Link>
        </div>
      )}
    </div>
  );
}
