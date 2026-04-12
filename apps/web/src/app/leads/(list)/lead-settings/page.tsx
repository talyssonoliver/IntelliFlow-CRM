import { Suspense } from 'react';
import LeadSettingsContent from '@/app/settings/leads/LeadSettingsContent';
import { LeadSettingsLoading } from '@/app/settings/leads/LeadSettingsLoading';

export default function LeadSettingsPage() {
  return (
    <Suspense fallback={<LeadSettingsLoading />}>
      <LeadSettingsContent />
    </Suspense>
  );
}
