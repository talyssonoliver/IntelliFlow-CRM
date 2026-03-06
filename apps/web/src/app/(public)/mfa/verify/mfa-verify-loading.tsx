'use client';

/**
 * MfaVerifyLoading — Suspense fallback for MFA Verify page
 *
 * IMPLEMENTS: PG-022 (AC-008)
 *
 * Extracted to separate file because Next.js App Router
 * disallows named exports from page.tsx.
 */

export function MfaVerifyLoading() {
  return (
    <div className="relative z-10 flex flex-col items-center justify-center gap-4 text-white">
      <span className="material-symbols-outlined text-4xl animate-spin" aria-hidden="true">
        progress_activity
      </span>
      <p className="text-slate-300 text-sm">Loading verification...</p>
    </div>
  );
}
