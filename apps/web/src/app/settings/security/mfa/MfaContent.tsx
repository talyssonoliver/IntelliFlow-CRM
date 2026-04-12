'use client';

/**
 * MFA Management Dashboard — Content Component
 * PG-125: AC-001, AC-002, AC-004, AC-010, AC-011, AC-012
 */

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  Badge,
  Button,
  Input,
  Label,
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { useMfaStatus, useDisableMfa, useRegenerateBackupCodes } from '@/lib/security/mfa-service';
import { downloadBackupCodes } from '@/lib/security/backup-codes';
import { MfaLoading } from './MfaLoading';

// ============================================
// Sub-components
// ============================================

function MfaMethodRow({
  name,
  enabled,
  icon,
  comingSoon,
}: Readonly<{
  name: string;
  enabled: boolean;
  icon: string;
  comingSoon?: boolean;
}>) {
  return (
    <div
      className="flex items-center justify-between py-3"
      data-testid={`method-row-${name.toLowerCase()}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[20px]">{icon}</span>
        </div>
        <div>
          <span className="text-sm font-medium text-foreground">{name}</span>
          {comingSoon && (
            <p className="text-xs text-muted-foreground">Coming soon</p>
          )}
        </div>
      </div>
      {comingSoon ? (
        <Badge variant="secondary" className="text-xs">Unavailable</Badge>
      ) : (
        <Badge variant={enabled ? 'default' : 'secondary'}>
          {enabled ? 'Active' : 'Not configured'}
        </Badge>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function MfaContent() {
  const router = useRouter();
  const { data: mfaStatus, isLoading } = useMfaStatus();
  const disableMfa = useDisableMfa();
  const regenerateBackupCodes = useRegenerateBackupCodes();

  // Disable MFA state
  const [disableInput, setDisableInput] = useState({ totpCode: '', password: '' });
  const [disableMethod, setDisableMethod] = useState<'totp' | 'password'>('totp');
  const disableBtnRef = useRef<HTMLButtonElement>(null);

  // Regenerate codes state
  const [regenTotpCode, setRegenTotpCode] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const regenBtnRef = useRef<HTMLButtonElement>(null);

  const isEnabled = mfaStatus?.enabled ?? false;

  const handleDisableMfa = useCallback(async () => {
    try {
      const input =
        disableMethod === 'totp'
          ? { totpCode: disableInput.totpCode }
          : { password: disableInput.password };
      await disableMfa.mutateAsync(input);
      setDisableInput({ totpCode: '', password: '' });
      router.push('/settings/account');
    } catch {
      // Error handled by mutation state
    }
  }, [disableMfa, disableInput, disableMethod, router]);

  const handleRegenerateBackupCodes = useCallback(async () => {
    try {
      const result = await regenerateBackupCodes.mutateAsync({ totpCode: regenTotpCode });
      setNewCodes(result.codes);
      setRegenTotpCode('');
    } catch {
      // Error handled by mutation state
    }
  }, [regenerateBackupCodes, regenTotpCode]);

  if (isLoading) return <MfaLoading />;

  return (
    <div className="pb-10">
      <PageHeader
        title="Two-Factor Authentication"
        description={isEnabled
          ? 'Your account is protected with multi-factor authentication.'
          : 'Add an extra layer of security to your account.'}
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Account', href: '/settings/account' },
          { label: 'Two-Factor Authentication' },
        ]}
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* ─── Status & Methods Card ─────────────────────────────────── */}
        <Card className="lg:col-span-7 p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">security</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Status & Methods</h3>
            </div>
            <Badge data-testid="mfa-status-badge" variant={isEnabled ? 'default' : 'secondary'}>
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            <MfaMethodRow
              name="Authenticator App"
              enabled={mfaStatus?.methods.totp ?? false}
              icon="key"
            />
            <MfaMethodRow name="SMS" enabled={mfaStatus?.methods.sms ?? false} icon="sms" comingSoon />
            <MfaMethodRow name="Email" enabled={mfaStatus?.methods.email ?? false} icon="email" comingSoon />
          </div>

          {/* Add method link */}
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Link
              href="/settings/security/mfa/setup"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add_circle</span>
              <span className="underline-offset-4 hover:underline">
                {isEnabled ? 'Add another method' : 'Get started with setup'}
              </span>
            </Link>
          </div>
        </Card>

        {/* ─── Backup Codes Card ─────────────────────────────────────── */}
        <Card className="lg:col-span-5 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px]">vpn_key</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Backup Codes</h3>
          </div>

          {!isEnabled ? (
            <p className="text-sm text-muted-foreground">
              Enable two-factor authentication to generate backup codes.
            </p>
          ) : newCodes ? (
            <div data-testid="new-backup-codes-display" className="space-y-4">
              <Alert>
                <AlertDescription>
                  Save these codes securely. Your previous codes have been invalidated.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {newCodes.map((code, i) => (
                  <div key={i} className="p-2 bg-muted rounded text-foreground text-center">
                    {code}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBackupCodes(newCodes, '', new Date())}
                className="w-full"
              >
                <span className="material-symbols-outlined text-[16px] mr-1.5" aria-hidden="true">download</span>
                Download codes
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Remaining</span>
                <Badge variant="secondary">{mfaStatus?.backupCodesRemaining ?? 0} codes</Badge>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    ref={regenBtnRef}
                    variant="outline"
                    size="sm"
                    data-testid="regen-backup-btn"
                    className="w-full"
                  >
                    <span className="material-symbols-outlined text-[16px] mr-1.5" aria-hidden="true">refresh</span>
                    Regenerate backup codes
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regenerate Backup Codes</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will invalidate all existing backup codes. Enter your authenticator code to continue.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-4 space-y-2">
                    <Label htmlFor="regen-totp-code">Authenticator Code</Label>
                    <Input
                      id="regen-totp-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={regenTotpCode}
                      onChange={(e) => setRegenTotpCode(e.target.value.replaceAll(/\D/g, ''))}
                      placeholder="000000"
                      data-testid="regen-totp-input"
                    />
                    {regenerateBackupCodes.error && (
                      <p className="text-sm text-destructive">{regenerateBackupCodes.error.message}</p>
                    )}
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setRegenTotpCode(''); regenBtnRef.current?.focus(); }}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRegenerateBackupCodes}
                      disabled={regenTotpCode.length !== 6 || regenerateBackupCodes.isPending}
                    >
                      {regenerateBackupCodes.isPending ? 'Regenerating...' : 'Regenerate'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </Card>

        {/* ─── Setup Prompt Card ─────────────────────────────────────── */}
        <Card className="lg:col-span-6 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[18px]">shield</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {isEnabled ? 'Add Another Method' : 'Set Up Two-Factor Authentication'}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {isEnabled
              ? 'Add additional authentication methods for more security options.'
              : 'Protect your account with an authenticator app, SMS, or email verification.'}
          </p>
          <Button asChild>
            <Link href="/settings/security/mfa/setup">
              <span className="material-symbols-outlined text-[16px] mr-1.5" aria-hidden="true">
                {isEnabled ? 'add' : 'arrow_forward'}
              </span>
              {isEnabled ? 'Add method' : 'Get started'}
            </Link>
          </Button>
        </Card>

        {/* ─── Danger Zone Card ──────────────────────────────────────── */}
        {isEnabled && (
          <Card className="lg:col-span-6 p-6 md:p-8 border-destructive/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-[18px]">warning</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Danger Zone</h3>
            </div>

            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Disabling two-factor authentication will make your account less secure.
              </AlertDescription>
            </Alert>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  ref={disableBtnRef}
                  variant="destructive"
                  size="sm"
                  data-testid="disable-mfa-btn"
                >
                  <span className="material-symbols-outlined text-[16px] mr-1.5" aria-hidden="true">shield_lock</span>
                  Disable two-factor authentication
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="disable-confirm-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>Disable Two-Factor Authentication</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all MFA methods and invalidate your backup codes. Verify your identity to continue.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4 space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={disableMethod === 'totp' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDisableMethod('totp')}
                    >
                      Authenticator
                    </Button>
                    <Button
                      variant={disableMethod === 'password' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDisableMethod('password')}
                    >
                      Password
                    </Button>
                  </div>
                  {disableMethod === 'totp' ? (
                    <div className="space-y-2">
                      <Label htmlFor="disable-totp-code">Authenticator Code</Label>
                      <Input
                        id="disable-totp-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={disableInput.totpCode}
                        onChange={(e) => setDisableInput({ ...disableInput, totpCode: e.target.value.replaceAll(/\D/g, '') })}
                        placeholder="000000"
                        data-testid="disable-totp-input"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="disable-password">Password</Label>
                      <Input
                        id="disable-password"
                        type="password"
                        value={disableInput.password}
                        onChange={(e) => setDisableInput({ ...disableInput, password: e.target.value })}
                        placeholder="Enter your password"
                        data-testid="disable-password-input"
                      />
                    </div>
                  )}
                  {disableMfa.error && (
                    <p className="text-sm text-destructive">{disableMfa.error.message}</p>
                  )}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => { setDisableInput({ totpCode: '', password: '' }); disableBtnRef.current?.focus(); }}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDisableMfa}
                    disabled={
                      (disableMethod === 'totp' && disableInput.totpCode.length !== 6) ||
                      (disableMethod === 'password' && disableInput.password.length < 8) ||
                      disableMfa.isPending
                    }
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {disableMfa.isPending ? 'Disabling...' : 'Disable MFA'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
        )}

        {/* ─── Footer ────────────────────────────────────────────────── */}
        <div className="lg:col-span-12 flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-700 mt-1">
          <div className="flex items-center gap-4">
            <Link href="/settings/account" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">person</span>
              <span className="underline-offset-4 hover:underline">Profile Settings</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <Link href="/notifications/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">notifications</span>
              <span className="underline-offset-4 hover:underline">Notification Preferences</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
