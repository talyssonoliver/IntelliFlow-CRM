'use client';

/**
 * Payment Methods Page
 *
 * Route page for managing payment methods.
 *
 * @implements PG-029 (Payment Methods)
 */

import { PaymentMethods } from '@/components/billing/payment-methods';
import { PageHeader } from '@/components/shared/page-header';

export default function PaymentMethodsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Billing', href: '/billing' }, { label: 'Payment Methods' }]}
        title="Payment Methods"
        description="Manage your saved payment methods and set your default card."
      />
      <PaymentMethods />
    </div>
  );
}
