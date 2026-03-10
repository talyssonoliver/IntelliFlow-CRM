'use client';

import { PageHeader } from '@/components/shared/page-header';
import { UpgradeFlow } from '@/components/billing/upgrade-flow';

export default function BillingUpgradePage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Change Plan' }]}
        title="Change Plan"
        description="Preview and confirm your plan change."
      />
      <UpgradeFlow />
    </>
  );
}
