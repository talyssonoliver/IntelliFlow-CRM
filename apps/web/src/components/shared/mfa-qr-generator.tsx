'use client';

/**
 * MFA QR Generator Component
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * Displays a QR code for TOTP authenticator app setup with:
 * - QR code image for scanning
 * - Collapsible manual entry section
 * - Copy secret button
 * - Setup instructions
 * - Confirm button to proceed
 */

import { useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@intelliflow/ui';

// ============================================
// Types
// ============================================

export interface MfaQrGeneratorProps {
  /** The otpauth:// URL for the QR code */
  otpauthUrl: string;
  /** The secret key for manual entry */
  secret: string;
  /** User's email/account name */
  accountName: string;
  /** Callback when user confirms they've scanned the code */
  onConfirm: () => void;
  /** Optional custom class name */
  className?: string;
}

// ============================================
// Sub-components
// ============================================

interface CopyButtonProps {
  text: string;
  'aria-label': string;
}

function CopyButton({ text, 'aria-label': ariaLabel }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded',
        'text-xs font-medium transition-colors',
        copied
          ? 'bg-green-500/20 text-green-400'
          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
      )}
    >
      <span className="material-symbols-outlined text-sm" aria-hidden="true">
        {copied ? 'check' : 'content_copy'}
      </span>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ============================================
// Main Component
// ============================================

export function MfaQrGenerator({
  otpauthUrl,
  secret,
  accountName,
  onConfirm,
  className,
}: MfaQrGeneratorProps) {
  const [showManual, setShowManual] = useState(false);

  // Format secret for display (add spaces every 4 chars)
  const formattedSecret = secret.replace(/(.{4})/g, '$1 ').trim();

  return (
    <div className={cn('space-y-6', className)}>
      {/* QR Code Section */}
      <div className="flex flex-col items-center">
        <div
          className="bg-white p-4 rounded-lg"
          role="img"
          aria-label={`QR code for setting up two-factor authentication for ${accountName}`}
        >
          <QRCodeSVG
            value={otpauthUrl}
            size={200}
            level="M"
            includeMargin={false}
          />
        </div>
        <p className="mt-3 text-sm text-slate-400 text-center max-w-xs">
          Scan this QR code with your authenticator app
          (Google Authenticator, Authy, 1Password, etc.)
        </p>
      </div>

      {/* Manual Entry Toggle */}
      <div className="border-t border-slate-700 pt-4">
        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          aria-expanded={showManual}
          aria-controls="manual-entry-section"
          className={cn(
            'w-full flex items-center justify-between px-3 py-2',
            'text-sm text-slate-400 hover:text-slate-300',
            'rounded-lg hover:bg-slate-700/50 transition-colors'
          )}
        >
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              keyboard
            </span>
            Can&apos;t scan? Enter code manually
          </span>
          <span
            className={cn(
              'material-symbols-outlined text-lg transition-transform',
              showManual && 'rotate-180'
            )}
            aria-hidden="true"
          >
            expand_more
          </span>
        </button>

        {/* Manual Entry Section */}
        {showManual && (
          <div
            id="manual-entry-section"
            className="mt-3 p-4 bg-slate-800/50 rounded-lg space-y-3"
          >
            <div className="space-y-1">
              <label className="text-xs text-slate-500 uppercase tracking-wide">
                Account
              </label>
              <p className="text-sm text-slate-300">{accountName}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-500 uppercase tracking-wide">
                  Secret Key
                </label>
                <CopyButton text={secret} aria-label="Copy secret key" />
              </div>
              <p
                className="font-mono text-[#7cc4ff] text-sm break-all bg-slate-900/50 p-2 rounded"
                aria-label="Secret key for manual entry"
              >
                {formattedSecret}
              </p>
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p>
                <strong>Type:</strong> Time-based (TOTP)
              </p>
              <p>
                <strong>Digits:</strong> 6
              </p>
              <p>
                <strong>Period:</strong> 30 seconds
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Setup Instructions */}
      <div className="bg-slate-800/30 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-[#137fec]" aria-hidden="true">
            info
          </span>
          Setup Instructions
        </h4>
        <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
          <li>Open your authenticator app</li>
          <li>Tap the + button to add a new account</li>
          <li>Scan the QR code or enter the secret key manually</li>
          <li>Click &quot;I&apos;ve scanned it&quot; below to verify</li>
        </ol>
      </div>

      {/* Confirm Button */}
      <button
        type="button"
        onClick={onConfirm}
        className={cn(
          'w-full py-3 px-4 rounded-lg font-medium',
          'bg-[var(--color-primary,#137fec)] text-white',
          'hover:bg-[var(--color-primary-hover,#0d6ecc)]',
          'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900',
          'transition-colors flex items-center justify-center gap-2'
        )}
        aria-label="Confirm you have scanned the QR code"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          check_circle
        </span>
        I&apos;ve scanned it
      </button>
    </div>
  );
}

export default MfaQrGenerator;
