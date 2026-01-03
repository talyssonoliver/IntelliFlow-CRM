'use client';

/**
 * Billing Portal Page
 *
 * Main billing management page with subscription overview,
 * payment methods, invoice history, and usage metrics.
 *
 * @implements PG-025 (Billing Portal)
 */

import { PageHeader } from '@/components/shared/page-header';
import { BillingPortal } from '@/components/billing/billing-portal';

export default function BillingPage() {
  return (
    <div className="billing-page">
      <PageHeader
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Billing' },
        ]}
        title="Billing & Subscription"
        description="Manage your subscription, payment methods, and view invoices"
        actions={[
          {
            label: 'Compare Plans',
            icon: 'compare',
            variant: 'secondary',
            href: '/billing/plans',
          },
        ]}
      />
      <BillingPortal />
    </div>
  );
}
