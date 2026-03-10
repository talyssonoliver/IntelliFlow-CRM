'use client';

import { PageHeader } from '@/components/shared/page-header';
import { CancelFlow } from '@/components/billing/cancel-flow';

export default function BillingCancelPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Cancel Subscription' }]}
        title="Cancel Subscription"
        description="We're sorry to see you go."
      />
      <CancelFlow />
    </>
  );
}
