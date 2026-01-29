'use client';

/**
 * Payment Methods Page
 *
 * Route page for managing payment methods.
 *
 * @implements PG-029 (Payment Methods)
 */

import { PaymentMethods } from '@/components/billing/payment-methods';

export default function PaymentMethodsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Payment Methods
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your saved payment methods and set your default card
        </p>
      </div>

      {/* Main Component */}
      <PaymentMethods />
    </div>
  );
}
