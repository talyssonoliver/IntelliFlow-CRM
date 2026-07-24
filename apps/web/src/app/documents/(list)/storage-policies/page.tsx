// Storage Policies Page — PG-206
// Server component: metadata + Suspense boundary.
// Content delegated to StoragePoliciesContent (client component).
// Lives under documents/(list)/ so it inherits the Documents settings sidebar
// (isDocumentSettingsPage covers /documents/storage-policies).

import { Suspense } from 'react';
import type { Metadata } from 'next';
import StoragePoliciesContent from './StoragePoliciesContent';
import StoragePoliciesLoading from './loading';

export const metadata: Metadata = {
  title: 'Storage Policies',
  description:
    'Configure per-category document retention periods, auto-archive rules, and legal-hold exceptions.',
};

export default function StoragePoliciesPage() {
  return (
    <Suspense fallback={<StoragePoliciesLoading />}>
      <StoragePoliciesContent />
    </Suspense>
  );
}
