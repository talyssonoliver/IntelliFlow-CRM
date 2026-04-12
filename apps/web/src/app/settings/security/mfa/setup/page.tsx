'use client';

/**
 * MFA Setup Page
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * Multi-step wizard for setting up multi-factor authentication:
 * 1. Method selection (TOTP, SMS, Email)
 * 2. Method setup (QR code, phone input, email confirm)
 * 3. Code verification
 * 4. Backup codes display
 * 5. Success confirmation
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn, Card, Button, Input, Label, Badge } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { MfaQrGenerator } from '@/components/shared/mfa-qr-generator';
import { BackupCodesDisplay } from '@/components/shared/backup-codes-display';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';

// ============================================
// Types & Constants
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

const STEPS: WizardStep[] = ['method', 'setup', 'verify', 'backup', 'complete'];

const MFA_METHODS = [
  {
    id: 'totp' as MfaMethod,
    name: 'Authenticator App',
    description: 'Use Google Authenticator, Authy, or 1Password to generate codes',
    icon: 'key',
    recommended: true,
  },
  {
    id: 'sms' as MfaMethod,
    name: 'SMS Code',
    description: 'Receive a verification code via text message',
    icon: 'sms',
  },
  {
    id: 'email' as MfaMethod,
    name: 'Email Code',
    description: 'Receive a verification code via email',
    icon: 'email',
  },
];

// ============================================
// Step Progress Indicator
// ============================================

function StepProgress({ currentStep }: Readonly<{ currentStep: WizardStep }>) {
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((s, i) => {
        const isPast = currentIndex > i;
        const isCurrent = currentStep === s;
        return (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                isPast && 'bg-emerald-500 text-white',
                isCurrent && 'bg-primary text-primary-foreground',
                !isPast && !isCurrent && 'bg-slate-100 dark:bg-slate-800 text-muted-foreground'
              )}
            >
              {isPast ? (
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">check</span>
              ) : (
                i + 1
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('w-8 lg:w-14 h-0.5 mx-1', isPast ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Method Selection Card
// ============================================

function MethodCard({
  method,
  selected,
  onSelect,
}: Readonly<{
  method: (typeof MFA_METHODS)[number];
  selected: boolean;
  onSelect: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-lg border-2 text-left transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        selected
          ? 'border-primary bg-primary/5 dark:bg-primary/10'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', selected ? 'bg-primary' : 'bg-slate-100 dark:bg-slate-800')}>
          <span className={cn('material-symbols-outlined text-[20px]', selected ? 'text-primary-foreground' : 'text-slate-500 dark:text-slate-400')} aria-hidden="true">
            {method.icon}
          </span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{method.name}</span>
            {method.recommended && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                Recommended
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{method.description}</p>
        </div>
        <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5', selected ? 'border-primary bg-primary' : 'border-slate-300 dark:border-slate-600')}>
          {selected && <span className="material-symbols-outlined text-[12px] text-primary-foreground" aria-hidden="true">check</span>}
        </div>
      </div>
    </button>
  );
}

// ============================================
// Verification Input
// ============================================

function VerificationInput({
  value,
  onChange,
  onSubmit,
  error,
  loading,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error?: string;
  loading?: boolean;
}>) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="verification-code">Verification Code</Label>
        <Input
          id="verification-code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replaceAll(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.length === 6) onSubmit(); }}
          placeholder="000000"
          className={cn('text-center text-2xl font-mono tracking-[0.5em] h-14', error && 'border-destructive')}
          aria-describedby={error ? 'verification-error' : undefined}
          aria-invalid={!!error}
        />
        {error && (
          <p id="verification-error" className="text-sm text-destructive flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">error</span>
            {error}
          </p>
        )}
      </div>
      <Button onClick={onSubmit} disabled={value.length !== 6 || loading} className="w-full h-12">
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">progress_activity</span>
            Verifying...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">verified</span>
            Verify Code
          </span>
        )}
      </Button>
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

  const userEmail = user?.email || 'user@example.com';

  const setupMfaMutation = trpc.auth.setupMfa.useMutation();
  const confirmMfaMutation = trpc.auth.confirmMfa.useMutation();
  const getBackupCodesMutation = trpc.auth.getBackupCodes.useMutation();

  const handleMethodSelect = useCallback(async () => {
    try {
      const result = await setupMfaMutation.mutateAsync({
        method: selectedMethod,
        phone: selectedMethod === 'sms' ? phoneNumber : undefined,
      });
      if (result.success) {
        const data: SetupData = { method: selectedMethod };
        if (result.method === 'totp') {
          data.secret = result.secret;
          data.qrCodeUrl = result.qrCodeUrl;
        } else if (result.method === 'sms' || result.method === 'email') {
          data.email = result.codeSentTo;
        }
        setSetupData(data);
        setStep('setup');
      }
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Failed to initiate MFA setup');
    }
  }, [selectedMethod, phoneNumber, setupMfaMutation]);

  const handleSetupComplete = useCallback(() => setStep('verify'), []);

  const handleVerification = useCallback(async () => {
    setVerificationError('');
    try {
      const result = await confirmMfaMutation.mutateAsync({ method: selectedMethod, code: verificationCode });
      if (result.success) {
        const backupResult = await getBackupCodesMutation.mutateAsync();
        setBackupCodes(backupResult.codes);
        setBackupCodesGeneratedAt(new Date(backupResult.generatedAt));
        setStep('backup');
      }
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : 'Invalid verification code. Please try again.');
    }
  }, [verificationCode, selectedMethod, confirmMfaMutation, getBackupCodesMutation]);

  const handleBackupAcknowledge = useCallback(() => setStep('complete'), []);
  const handleComplete = useCallback(() => router.push('/settings/account'), [router]);

  const getStepInfo = () => {
    switch (step) {
      case 'method': return { title: 'Choose Authentication Method', description: 'Select how you want to receive verification codes', icon: 'key' };
      case 'setup': return {
        title: selectedMethod === 'totp' ? 'Set Up Authenticator App' : selectedMethod === 'sms' ? 'Set Up SMS Verification' : 'Set Up Email Verification',
        description: 'Follow the instructions below to complete setup', icon: 'qr_code_scanner',
      };
      case 'verify': return { title: 'Verify Your Setup', description: 'Enter the 6-digit code to confirm everything is working', icon: 'verified' };
      case 'backup': return { title: 'Save Backup Codes', description: 'These codes will help you access your account if you lose your device', icon: 'vpn_key' };
      case 'complete': return { title: 'Setup Complete!', description: 'Two-factor authentication is now enabled on your account', icon: 'check_circle' };
    }
  };

  const stepInfo = getStepInfo();

  return (
    <div className="pb-10">
      <PageHeader
        title="Set Up Two-Factor Authentication"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Security', href: '/settings/security/mfa' },
          { label: 'MFA Setup' },
        ]}
        className="mb-6"
      />

      <StepProgress currentStep={step} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ─── Main Step Content ──────────────────────────────────────── */}
        <Card className="lg:col-span-8 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">{stepInfo.icon}</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{stepInfo.title}</h3>
              <p className="text-sm text-muted-foreground">{stepInfo.description}</p>
            </div>
          </div>

          {/* Method Selection */}
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

              {selectedMethod === 'sms' && (
                <div className="space-y-2">
                  <Label htmlFor="phone-number">Phone Number</Label>
                  <Input
                    id="phone-number"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Add your phone number"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">Enter in E.164 format (e.g., +14155551234)</p>
                </div>
              )}

              {verificationError && step === 'method' && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">error</span>
                    {verificationError}
                  </p>
                </div>
              )}

              <Button
                onClick={handleMethodSelect}
                disabled={setupMfaMutation.isPending || (selectedMethod === 'sms' && !phoneNumber)}
                className="w-full h-12"
              >
                {setupMfaMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">progress_activity</span>
                    Setting up...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_forward</span>
                    Continue with {MFA_METHODS.find((m) => m.id === selectedMethod)?.name}
                  </span>
                )}
              </Button>
            </div>
          )}

          {/* TOTP Setup */}
          {step === 'setup' && setupData?.method === 'totp' && setupData.qrCodeUrl && setupData.secret && (
            <MfaQrGenerator
              otpauthUrl={setupData.qrCodeUrl}
              secret={setupData.secret}
              accountName={userEmail}
              onConfirm={handleSetupComplete}
            />
          )}

          {/* SMS/Email Setup */}
          {step === 'setup' && (setupData?.method === 'sms' || setupData?.method === 'email') && (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                {setupData.method === 'sms'
                  ? 'Enter your phone number to receive verification codes.'
                  : 'We will send verification codes to your email.'}
              </p>
              {setupData.method === 'sms' && (
                <Input type="tel" placeholder="Add your phone number" className="h-11" />
              )}
              <Button onClick={handleSetupComplete} className="w-full h-12">
                <span className="material-symbols-outlined text-lg mr-1.5" aria-hidden="true">send</span>
                Send Code
              </Button>
            </div>
          )}

          {/* Verification */}
          {step === 'verify' && (
            <VerificationInput
              value={verificationCode}
              onChange={setVerificationCode}
              onSubmit={handleVerification}
              error={verificationError}
              loading={confirmMfaMutation.isPending || getBackupCodesMutation.isPending}
            />
          )}

          {/* Backup Codes */}
          {step === 'backup' && backupCodes.length > 0 && (
            <BackupCodesDisplay
              codes={backupCodes}
              email={userEmail}
              generatedAt={backupCodesGeneratedAt}
              onAcknowledge={handleBackupAcknowledge}
            />
          )}

          {/* Complete */}
          {step === 'complete' && (
            <div className="text-center space-y-6 py-4">
              <div className="w-16 h-16 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-emerald-600 dark:text-emerald-400" aria-hidden="true">
                  verified_user
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Two-Factor Authentication Enabled</h3>
                <p className="text-muted-foreground mt-2">
                  Your account is now protected with an additional layer of security.
                </p>
              </div>
              <Button onClick={handleComplete} className="w-full h-12">
                <span className="material-symbols-outlined text-lg mr-1.5" aria-hidden="true">arrow_back</span>
                Return to Account Settings
              </Button>
            </div>
          )}
        </Card>

        {/* ─── Sidebar Help Card ─────────────────────────────────────── */}
        <Card className="lg:col-span-4 p-6 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px]">help</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Help</h3>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium text-foreground mb-1">What is 2FA?</p>
              <p className="text-muted-foreground text-xs">
                Two-factor authentication adds a second verification step when signing in, keeping your account secure even if your password is compromised.
              </p>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <p className="font-medium text-foreground mb-1">Recommended apps</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">check</span>
                  Google Authenticator
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">check</span>
                  Authy
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">check</span>
                  1Password
                </li>
              </ul>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <Link href="/settings/security/mfa" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_back</span>
                <span className="underline-offset-4 hover:underline">Back to security settings</span>
              </Link>
            </div>
          </div>
        </Card>

        {/* ─── Cancel Link (not on complete step) ────────────────────── */}
        {step !== 'complete' && (
          <div className="lg:col-span-12 pt-2 border-t border-slate-200 dark:border-slate-700 mt-1">
            <Link href="/settings/account" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>
              <span>Cancel and return to settings</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
