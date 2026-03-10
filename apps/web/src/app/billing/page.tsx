'use client';

/**
 * Billing Portal Page
 *
 * Main billing management page with subscription overview,
 * payment methods, billing information, and billing history.
 *
 * @implements PG-025 (Billing Portal)
 */

import { PageHeader } from '@/components/shared/page-header';
import { BillingPortal } from '@/components/billing';

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Billing Portal' }]}
        title="Billing Portal"
        description="Manage your enterprise plan, payment methods, and invoice history."
        actions={[
          {
            label: 'Compare Plans',
            icon: 'compare',
            variant: 'secondary',
            href: '/upgrade',
          },
        ]}
      />
      <BillingPortal />
    </div>
  );
}
