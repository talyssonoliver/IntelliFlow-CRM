'use client';

import { useEffect, useState } from 'react';
import {
  getStoredAcceptanceRecord,
  recordTermsAcceptance,
} from '@/lib/legal/acceptance-tracker.client';

interface TermsAcceptanceBannerProps {
  currentVersion: string;
}

type BannerState = 'loading' | 'accepted' | 'pending' | 'updated';

export function TermsAcceptanceBanner({ currentVersion }: TermsAcceptanceBannerProps) {
  const [state, setState] = useState<BannerState>('loading');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const record = getStoredAcceptanceRecord();
    if (!record) {
      setState('pending');
    } else if (record.termsVersion !== currentVersion) {
      setState('updated');
    } else {
      setState('accepted');
    }
  }, [currentVersion]);

  function handleConfirm() {
    if (!checked) return;
    recordTermsAcceptance(currentVersion);
    setState('accepted');
  }

  // SSR-safe: return null during loading (prevents hydration mismatch, NF-002)
  if (state === 'loading' || state === 'accepted') {
    return null;
  }

  if (state === 'updated') {
    return (
      <div
        role="status"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-200 bg-amber-50 px-4 py-4 shadow-lg dark:border-amber-800 dark:bg-amber-950"
      >
        <div className="container mx-auto max-w-6xl flex items-start gap-4">
          <span
            className="material-symbols-outlined mt-0.5 text-xl text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          >
            info
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Terms of Service updated ({currentVersion})
            </p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              Our Terms of Service have been updated. Please review the changes above and
              re-accept to continue using IntelliFlow CRM.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-amber-900 dark:text-amber-100">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="h-4 w-4 rounded border-amber-400 accent-[#137fec]"
              />
              I have read and accept the Terms of Service
            </label>
            <button
              onClick={handleConfirm}
              disabled={!checked}
              className="rounded-lg bg-[#137fec] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0d6ecc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // state === 'pending'
  return (
    <div
      role="status"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#137fec]/20 bg-white px-4 py-4 shadow-lg dark:border-[#137fec]/30 dark:bg-[#162231]"
    >
      <div className="container mx-auto max-w-6xl flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            By using IntelliFlow CRM, you agree to our Terms of Service ({currentVersion}).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-[#137fec]"
            />
            I have read and accept the Terms of Service
          </label>
          <button
            onClick={handleConfirm}
            disabled={!checked}
            className="rounded-lg bg-[#137fec] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0d6ecc] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
