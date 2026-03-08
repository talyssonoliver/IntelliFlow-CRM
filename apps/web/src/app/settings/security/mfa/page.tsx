'use client';

/**
 * MFA Management Dashboard
 * PG-125: AC-001, AC-002, AC-004, AC-010, AC-011, AC-012
 *
 * Shows MFA status, enrolled methods, and provides management actions:
 * - View status and enrolled methods
 * - Disable MFA (with re-authentication)
 * - Regenerate backup codes
 * - Link to setup wizard for adding new methods
 */

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  Badge,
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
  Skeleton,
} from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { useMfaStatus, useDisableMfa, useRegenerateBackupCodes } from '@/lib/security/mfa-service';
import { downloadBackupCodes } from '@/lib/security/backup-codes';

// ============================================
// Sub-components
// ============================================

function MfaMethodRow({
  name,
  enabled,
  icon,
  comingSoon,
}: {
  name: string;
  enabled: boolean;
  icon: string;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2" data-testid={`method-row-${name.toLowerCase()}`}>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-foreground">{name}</span>
      </div>
      {comingSoon ? (
        <span className="text-xs text-muted-foreground">Coming soon</span>
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

export default function MfaManagementPage() {
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
      const input = disableMethod === 'totp'
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

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Two-Factor Authentication"
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Account', href: '/settings/account' },
          { label: 'Two-Factor Authentication' },
        ]}
      />

      {/* Status Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Status</h2>
          <Badge
            data-testid="mfa-status-badge"
            variant={isEnabled ? 'default' : 'secondary'}
          >
            {isEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <div className="space-y-1">
          <MfaMethodRow name="Authenticator App" enabled={mfaStatus?.methods.totp ?? false} icon="🔑" />
          <MfaMethodRow name="SMS" enabled={mfaStatus?.methods.sms ?? false} icon="📱" comingSoon />
          <MfaMethodRow name="Email" enabled={mfaStatus?.methods.email ?? false} icon="📧" comingSoon />
        </div>
      </Card>

      {/* Backup Codes Card */}
      {isEnabled && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Backup Codes</h2>
            <span className="text-sm text-muted-foreground">
              {mfaStatus?.backupCodesRemaining ?? 0} remaining
            </span>
          </div>

          {newCodes ? (
            <div data-testid="new-backup-codes-display" className="space-y-4">
              <Alert>
                <AlertDescription>
                  Save these codes securely. Your previous codes have been invalidated.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {newCodes.map((code, i) => (
                  <div key={i} className="p-2 bg-muted rounded text-foreground">{code}</div>
                ))}
              </div>
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => downloadBackupCodes(newCodes, '', new Date())}
              >
                Download codes
              </button>
            </div>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  ref={regenBtnRef}
                  data-testid="regen-backup-btn"
                  className="text-sm text-primary font-medium hover:underline"
                >
                  Regenerate backup codes
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regenerate Backup Codes</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will invalidate all existing backup codes. Enter your authenticator code to continue.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <label htmlFor="regen-totp-code" className="text-sm font-medium text-foreground">Authenticator Code</label>
                  <input
                    id="regen-totp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={regenTotpCode}
                    onChange={(e) => setRegenTotpCode(e.target.value.replaceAll(/\D/g, ''))}
                    className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground"
                    placeholder="000000"
                    data-testid="regen-totp-input"
                  />
                  {regenerateBackupCodes.error && (
                    <p className="mt-2 text-sm text-destructive">{regenerateBackupCodes.error.message}</p>
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
          )}
        </Card>
      )}

      {/* Add Method Card */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {isEnabled ? 'Add Another Method' : 'Set Up Two-Factor Authentication'}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {isEnabled
            ? 'Add additional authentication methods for more security options.'
            : 'Protect your account with an authenticator app, SMS, or email verification.'}
        </p>
        <Link
          href="/settings/security/mfa/setup"
          className="inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          {isEnabled ? 'Add method' : 'Get started'} →
        </Link>
      </Card>

      {/* Disable MFA Card */}
      {isEnabled && (
        <Card className="p-6 border-destructive/50">
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              Disabling two-factor authentication will make your account less secure.
            </AlertDescription>
          </Alert>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                ref={disableBtnRef}
                data-testid="disable-mfa-btn"
                className="text-sm font-medium text-destructive hover:underline"
              >
                Disable two-factor authentication
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid="disable-confirm-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>Disable Two-Factor Authentication</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all MFA methods and invalidate your backup codes.
                  Verify your identity to continue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4 space-y-4">
                <div className="flex gap-4">
                  <button
                    className={`text-sm font-medium px-3 py-1 rounded ${disableMethod === 'totp' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
                    onClick={() => setDisableMethod('totp')}
                  >
                    Authenticator
                  </button>
                  <button
                    className={`text-sm font-medium px-3 py-1 rounded ${disableMethod === 'password' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
                    onClick={() => setDisableMethod('password')}
                  >
                    Password
                  </button>
                </div>
                {disableMethod === 'totp' ? (
                  <div>
                    <label htmlFor="disable-totp-code" className="text-sm font-medium text-foreground">Authenticator Code</label>
                    <input
                      id="disable-totp-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={disableInput.totpCode}
                      onChange={(e) => setDisableInput({ ...disableInput, totpCode: e.target.value.replaceAll(/\D/g, '') })}
                      className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground"
                      placeholder="000000"
                      data-testid="disable-totp-input"
                    />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="disable-password" className="text-sm font-medium text-foreground">Password</label>
                    <input
                      id="disable-password"
                      type="password"
                      value={disableInput.password}
                      onChange={(e) => setDisableInput({ ...disableInput, password: e.target.value })}
                      className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground"
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
                <AlertDialogCancel onClick={() => {
                  setDisableInput({ totpCode: '', password: '' });
                  disableBtnRef.current?.focus();
                }}>
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
    </div>
  );
}
