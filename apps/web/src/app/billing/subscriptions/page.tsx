'use client';

/**
 * Subscriptions Page
 *
 * Manage subscription plans - upgrade, downgrade, or cancel.
 *
 * @implements PG-030 (Subscriptions)
 */

import { PageHeader } from '@/components/shared/page-header';
import { SubscriptionManager } from '@/components/billing/subscription-manager';

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Subscriptions' }]}
        title="Manage Subscription"
        description="View your current plan and explore upgrade options."
      />

      <SubscriptionManager />
    </div>
  );
}
