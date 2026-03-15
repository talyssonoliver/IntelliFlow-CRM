'use client';

import dynamic from 'next/dynamic';
import { LeadSettingsLoading } from '@/app/settings/leads/LeadSettingsLoading';

const LeadSettingsContent = dynamic(
  () => import('@/app/settings/leads/LeadSettingsContent'),
  { ssr: false, loading: () => <LeadSettingsLoading /> }
);

export default function LeadSettingsPage() {
  return <LeadSettingsContent />;
}
