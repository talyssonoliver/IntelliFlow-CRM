'use client';

/**
 * Subscriptions Page
 *
 * Manage subscription plans - upgrade, downgrade, or cancel.
 *
 * @implements PG-030 (Subscriptions)
 */

import { SubscriptionManager } from '@/components/billing/subscription-manager';

export default function SubscriptionsPage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#137fec]/10">
            <span className="material-symbols-outlined text-2xl text-[#137fec]">
              subscriptions
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Manage Subscription
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              View your current plan and explore upgrade options
            </p>
          </div>
        </div>
      </header>

      <SubscriptionManager />
    </div>
  );
}
