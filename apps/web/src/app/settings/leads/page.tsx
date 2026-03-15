'use client';

/**
 * Lead Settings Page - PG-178
 *
 * Client component wrapper that dynamically loads the content component
 * with SSR disabled to prevent hydration issues with hooks.
 */

import dynamic from 'next/dynamic';
import { LeadSettingsLoading } from './LeadSettingsLoading';

const LeadSettingsContent = dynamic(() => import('./LeadSettingsContent'), {
  ssr: false,
  loading: () => <LeadSettingsLoading />,
});

export default function LeadSettingsPage() {
  return <LeadSettingsContent />;
}
