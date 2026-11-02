/**
 * Privacy requests page — PG-203 DSAR (Settings, administrators only).
 *
 * Server Component shell: streams the skeleton, then hydrates PrivacyRequestsContent, as the
 * other settings pages do.
 */
import { Suspense } from 'react';
import PrivacyRequestsContent from './PrivacyRequestsContent';
import PrivacyRequestsLoading from './loading';

export default function PrivacyRequestsPage() {
  return (
    <Suspense fallback={<PrivacyRequestsLoading />}>
      <PrivacyRequestsContent />
    </Suspense>
  );
}
