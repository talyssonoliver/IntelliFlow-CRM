'use client';

import { PageHeader } from '@/components/shared/page-header';
import { UsageDashboard } from '@/components/billing/usage-dashboard';

export default function BillingUsagePage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Usage' }]}
        title="Usage"
        description="Monitor your usage metrics against plan limits."
      />
      <UsageDashboard />
    </>
  );
}
