import { Suspense } from 'react';
import CaseSettingsContent from './CaseSettingsContent';
import { CaseSettingsLoading } from './CaseSettingsLoading';

export default function CaseSettingsPage() {
  return (
    <Suspense fallback={<CaseSettingsLoading />}>
      <CaseSettingsContent />
    </Suspense>
  );
}
