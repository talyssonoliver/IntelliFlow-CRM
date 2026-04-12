'use client';

import { useEffect, useState } from 'react';
import {
  getStoredDpaSignature,
  hasSigned,
  recordDpaSignature,
} from '@/lib/legal/signature-handler.client';

interface DpaSignaturePanelProps {
  currentVersion: string;
  downloadPath: string;
}

type PanelState = 'loading' | 'pending' | 'signed' | 'updated';

export function DpaSignaturePanel({ currentVersion, downloadPath }: DpaSignaturePanelProps) {
  const [state, setState] = useState<PanelState>('loading');
  const [signatoryName, setSignatoryName] = useState('');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (hasSigned(currentVersion)) {
      setState('signed');
    } else {
      const stored = getStoredDpaSignature();
      if (stored) {
        setState('updated');
      } else {
        setState('pending');
      }
    }
  }, [currentVersion]);

  function handleExecute() {
    if (!signatoryName.trim() || !checked) return;
    recordDpaSignature(currentVersion, signatoryName.trim());
    setState('signed');
  }

  // SSR-safe: return null during loading and signed states (NF-002)
  if (state === 'loading' || state === 'signed') {
    return null;
  }

  const disclaimer = (
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
      This acknowledgment is stored locally in your browser. For a countersigned DPA for enterprise
      records, contact{' '}
      <a href="mailto:legal@intelliflow-crm.com" className="underline">
        legal@intelliflow-crm.com
      </a>
      .
    </p>
  );

  const inputs = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="dpa-signatory-name"
          className="text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          Full name
        </label>
        <input
          id="dpa-signatory-name"
          type="text"
          required
          placeholder="Your full legal name"
          value={signatoryName}
          onChange={(e) => setSignatoryName(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[#137fec] focus:outline-none focus:ring-2 focus:ring-[#137fec]/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>
      {/* TODO: Replace placeholder PDF with legal-reviewed DPA template before production deploy */}
      <a
        href={downloadPath}
        download
        className="inline-flex items-center gap-1 rounded-lg border border-[#137fec] px-3 py-2 text-sm font-medium text-[#137fec] transition-colors hover:bg-[#137fec]/10"
      >
        Download DPA Template
      </a>
    </div>
  );

  const checkboxAndButton = (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 accent-[#137fec]"
        />
        I have read and I agree to the Data Processing Addendum
      </label>
      <button
        onClick={handleExecute}
        disabled={!signatoryName.trim() || !checked}
        className="rounded-lg bg-[#137fec] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0d6ecc] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Execute DPA
      </button>
    </div>
  );

  if (state === 'updated') {
    return (
      <div
        role="status"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-200 bg-amber-50 px-4 py-4 shadow-lg dark:border-amber-800 dark:bg-amber-950"
      >
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-start gap-4">
            <span
              className="material-symbols-outlined mt-0.5 text-xl text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            >
              info
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                DPA updated — Re-acknowledge required ({currentVersion})
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                Our Data Processing Addendum has been updated. Please review the changes and
                re-acknowledge to confirm your continued agreement.
              </p>
              <div className="mt-3">
                {inputs}
                <div className="mt-3">{checkboxAndButton}</div>
                {disclaimer}
              </div>
            </div>
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
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Data Processing Addendum ({currentVersion})
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              As a data controller using IntelliFlow CRM, please execute this DPA to formalise our
              GDPR Article 28 data processor relationship.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {inputs}
            {checkboxAndButton}
            {disclaimer}
          </div>
        </div>
      </div>
    </div>
  );
}
