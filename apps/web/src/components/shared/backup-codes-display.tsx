'use client';

/**
 * Backup Codes Display Component
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * Displays MFA backup codes in a grid with:
 * - Numbered codes in 2-column layout
 * - Warning banner about one-time use
 * - Copy All / Download / Print buttons
 * - Acknowledgment checkbox before proceeding
 */

import { useState, useCallback } from 'react';
import { cn } from '@intelliflow/ui';
import {
  formatBackupCodesForDisplay,
  copyBackupCodesToClipboard,
  downloadBackupCodes,
  printBackupCodes,
} from '@/lib/shared/backup-codes';

// ============================================
// Types
// ============================================

export interface BackupCodesDisplayProps {
  /** Array of raw backup codes */
  codes: string[];
  /** User's email address */
  email: string;
  /** When the codes were generated */
  generatedAt: Date;
  /** Callback when user acknowledges saving the codes */
  onAcknowledge: () => void;
  /** Optional custom class name */
  className?: string;
}

// ============================================
// Sub-components
// ============================================

interface ActionButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  success?: boolean;
  'aria-label': string;
}

function ActionButton({ icon, label, onClick, success, 'aria-label': ariaLabel }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex flex-col items-center gap-1 px-4 py-2 rounded-lg',
        'text-xs font-medium transition-colors',
        success
          ? 'bg-green-500/20 text-green-400'
          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
      )}
    >
      <span className="material-symbols-outlined text-lg" aria-hidden="true">
        {success ? 'check' : icon}
      </span>
      {success ? 'Done!' : label}
    </button>
  );
}

// ============================================
// Main Component
// ============================================

export function BackupCodesDisplay({
  codes,
  email,
  generatedAt,
  onAcknowledge,
  className,
}: BackupCodesDisplayProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const formattedCodes = formatBackupCodesForDisplay(codes);

  // Split codes into two columns
  const midpoint = Math.ceil(formattedCodes.length / 2);
  const leftColumn = formattedCodes.slice(0, midpoint);
  const rightColumn = formattedCodes.slice(midpoint);

  const handleCopy = useCallback(async () => {
    const success = await copyBackupCodesToClipboard(codes);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [codes]);

  const handleDownload = useCallback(() => {
    downloadBackupCodes(codes, email, generatedAt);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }, [codes, email, generatedAt]);

  const handlePrint = useCallback(() => {
    printBackupCodes(codes, email, generatedAt);
  }, [codes, email, generatedAt]);

  const handleAcknowledge = useCallback(() => {
    if (acknowledged) {
      onAcknowledge();
    }
  }, [acknowledged, onAcknowledge]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Warning Banner */}
      <div
        className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4"
        role="alert"
      >
        <div className="flex gap-3">
          <span
            className="material-symbols-outlined text-amber-400 text-xl flex-shrink-0"
            aria-hidden="true"
          >
            warning
          </span>
          <div className="space-y-1">
            <h4 className="font-medium text-amber-300 text-sm">
              Save your backup codes
            </h4>
            <p className="text-xs text-amber-200/80">
              These codes are the only way to access your account if you lose your
              authenticator device. Each code can only be used <strong>once</strong>.
              Store them in a secure location.
            </p>
          </div>
        </div>
      </div>

      {/* Backup Codes Grid */}
      <div className="bg-slate-800/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-slate-300">
            Your backup codes
          </h4>
          <span className="text-xs text-slate-500">
            Generated {generatedAt.toLocaleDateString()}
          </span>
        </div>

        <div
          className="grid grid-cols-2 gap-x-6 gap-y-2 bg-slate-900/50 rounded-lg p-4"
          aria-label="Backup codes list"
        >
          {/* Left Column */}
          <div className="space-y-2">
            {leftColumn.map(({ index, code }) => (
              <div
                key={index}
                className="flex items-center gap-3 font-mono text-sm"
              >
                <span className="text-slate-500 w-4 text-right">{index}.</span>
                <span className="text-[#7cc4ff]">{code}</span>
              </div>
            ))}
          </div>

          {/* Right Column */}
          <div className="space-y-2">
            {rightColumn.map(({ index, code }) => (
              <div
                key={index}
                className="flex items-center gap-3 font-mono text-sm"
              >
                <span className="text-slate-500 w-4 text-right">{index}.</span>
                <span className="text-[#7cc4ff]">{code}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        <ActionButton
          icon="content_copy"
          label="Copy All"
          onClick={handleCopy}
          success={copied}
          aria-label="Copy all backup codes to clipboard"
        />
        <ActionButton
          icon="download"
          label="Download"
          onClick={handleDownload}
          success={downloaded}
          aria-label="Download backup codes as text file"
        />
        <ActionButton
          icon="print"
          label="Print"
          onClick={handlePrint}
          aria-label="Print backup codes"
        />
      </div>

      {/* Acknowledgment Checkbox */}
      <div className="border-t border-slate-700 pt-4">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className={cn(
              'mt-0.5 w-5 h-5 rounded border-2 border-slate-600',
              'bg-slate-700 text-[#137fec]',
              'focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900',
              'checked:bg-[#137fec] checked:border-[#137fec]'
            )}
            aria-describedby="acknowledge-description"
          />
          <span id="acknowledge-description" className="text-sm text-slate-300">
            I have saved my backup codes in a secure location. I understand that
            I won&apos;t be able to see these codes again.
          </span>
        </label>
      </div>

      {/* Continue Button */}
      <button
        type="button"
        onClick={handleAcknowledge}
        disabled={!acknowledged}
        className={cn(
          'w-full py-3 px-4 rounded-lg font-medium transition-colors',
          'flex items-center justify-center gap-2',
          acknowledged
            ? 'bg-[var(--color-primary,#137fec)] text-white hover:bg-[var(--color-primary-hover,#0d6ecc)]'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-slate-900'
        )}
        aria-label="Continue after saving backup codes"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          arrow_forward
        </span>
        Continue
      </button>
    </div>
  );
}

export default BackupCodesDisplay;
