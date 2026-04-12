/**
 * MFA Management Dashboard
 * PG-125: AC-001, AC-002, AC-004, AC-010, AC-011, AC-012
 *
 * Server Component shell — streams MfaLoading skeleton immediately,
 * then hydrates MfaContent (client component) via Suspense.
 */

import { Suspense } from 'react';
import MfaContent from './MfaContent';
import { MfaLoading } from './MfaLoading';

export default function MfaManagementPage() {
  return (
    <Suspense fallback={<MfaLoading />}>
      <MfaContent />
    </Suspense>
  );
}
