'use client';

import { PageHeader } from '@/components/shared/page-header';
import { SLAPolicyManager } from '@/components/tickets/SLAPolicyManager';

export default function SLAPoliciesPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'SLA Policies' },
        ]}
        title="SLA Policies"
        description="Manage SLA response and resolution time targets."
      />
      <SLAPolicyManager />
    </>
  );
}
