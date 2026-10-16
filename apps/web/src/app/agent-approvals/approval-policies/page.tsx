/**
 * Approval Policies Page - PG-198
 *
 * Server Component shell: streams the skeleton immediately, then hydrates
 * ApprovalPoliciesContent (client component) via Suspense. Same pattern as the
 * PG-196/PG-197 module-settings pages.
 */

import { Suspense } from 'react';
import ApprovalPoliciesContent from './ApprovalPoliciesContent';
import { ApprovalPoliciesLoading } from './ApprovalPoliciesLoading';

export default function ApprovalPoliciesPage() {
  return (
    <Suspense fallback={<ApprovalPoliciesLoading />}>
      <ApprovalPoliciesContent />
    </Suspense>
  );
}
