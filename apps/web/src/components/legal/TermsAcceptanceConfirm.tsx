'use client';

/**
 * TermsAcceptanceConfirm — IFC-309
 *
 * Embedded in the /terms RSC page for authenticated users.
 * Renders null for unauthenticated/loading users or when already accepted (AC-008, AC-009).
 *
 * Uses tRPC to persist an immutable server-side acceptance record.
 * termsVersion is passed as a prop from the RSC parent — the server module
 * (getTermsOfService) is server-only and never imported here (AC-010).
 */

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';

interface TermsAcceptanceConfirmProps {
  /** Terms version string from the RSC parent (e.g. "v1.0"). 1-32 chars. */
  termsVersion: string;
}

export function TermsAcceptanceConfirm({ termsVersion }: TermsAcceptanceConfirmProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [locallyAccepted, setLocallyAccepted] = useState(false);

  const { data, isLoading: queryLoading } = trpc.termsAcceptance.getAcceptance.useQuery(
    { termsVersion },
    { enabled: isAuthenticated && !isLoading }
  );

  const mutation = trpc.termsAcceptance.accept.useMutation({
    onSuccess: () => setLocallyAccepted(true),
  });

  // AC-008: hide for unauthenticated users or while auth / query is loading
  if (!isAuthenticated || isLoading || queryLoading) return null;

  // AC-009: hide if already accepted server-side or locally (optimistic)
  if (data?.accepted || locallyAccepted) return null;

  const handleSubmit = () => {
    if (!agreed || mutation.isPending) return;
    mutation.mutate({
      termsVersion,
      route: '/terms',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
  };

  return (
    <section
      aria-labelledby="terms-accept-heading"
      className="mt-8 rounded-lg border border-[#137fec]/30 bg-[#137fec]/5 p-6"
    >
      <h2
        id="terms-accept-heading"
        className="text-lg font-semibold text-slate-900 dark:text-white"
      >
        Confirm Terms Acceptance
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Please confirm that you have read and agree to these Terms of Service (version{' '}
        {termsVersion}).
      </p>

      <div className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          id="terms-accept-checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          aria-required="true"
          className="mt-1 h-4 w-4 cursor-pointer accent-[#137fec]"
        />
        <label
          htmlFor="terms-accept-checkbox"
          className="cursor-pointer text-sm text-slate-700 dark:text-slate-300"
        >
          I have read and agree to the Terms of Service version {termsVersion}.
        </label>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!agreed || mutation.isPending}
        aria-disabled={!agreed || mutation.isPending}
        className="mt-4 rounded-md bg-[#137fec] px-4 py-2 text-sm font-medium text-white
                   disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#0f6fd0]
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-[#137fec] transition-colors"
      >
        {mutation.isPending ? 'Saving...' : 'I Agree'}
      </button>

      {mutation.isError && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          Something went wrong. Please try again.
        </p>
      )}
    </section>
  );
}
