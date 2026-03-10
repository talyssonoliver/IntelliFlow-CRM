'use client';

import { PageHeader } from '@/components/shared/page-header';
import { PlanComparison } from '@/components/billing/plan-comparison';

export default function BillingPlansPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Compare Plans' }]}
        title="Compare Plans"
        description="Compare features and pricing across plans."
      />
      <PlanComparison />
    </>
  );
}
