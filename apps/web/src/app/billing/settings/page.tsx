'use client';

import { PageHeader } from '@/components/shared/page-header';
import { BillingSettings } from '@/components/billing/billing-settings';

export default function BillingSettingsPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Billing Settings' }]}
        title="Billing Settings"
        description="Manage your billing information."
      />
      <BillingSettings />
    </>
  );
}
