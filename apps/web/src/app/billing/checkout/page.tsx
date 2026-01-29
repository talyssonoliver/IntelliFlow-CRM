'use client';

/**
 * Checkout Page
 *
 * Handles subscription checkout with plan selection from URL params.
 *
 * URL: /billing/checkout?plan=professional&cycle=monthly
 *
 * @implements PG-026 (Checkout)
 */

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { CheckoutForm } from '@/components/billing/checkout-form';
import { getPlanById, getAnnualSavingsPercent } from '@/lib/billing/stripe-portal';
import type { BillingCycle } from '@intelliflow/validators';

function CheckoutLoading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <span className="material-symbols-outlined animate-spin text-4xl text-primary" aria-hidden="true">
        progress_activity
      </span>
    </div>
  );
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const planId = searchParams.get('plan') || 'professional';
  const cycle = (searchParams.get('cycle') as BillingCycle) || 'monthly';
  const plan = getPlanById(planId);

  if (!plan) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <span className="material-symbols-outlined text-4xl text-destructive" aria-hidden="true">error</span>
        <h2 className="mt-4 text-xl font-semibold">Plan not found</h2>
        <button onClick={() => router.push('/pricing')} className="mt-4 text-primary hover:underline">
          Back to Plans
        </button>
      </div>
    );
  }

  const annualSavings = getAnnualSavingsPercent(plan);
  const handleSuccess = (subId: string) => router.push(`/billing?subscription=${subId}&success=true`);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Plan Details */}
      <div className="order-1 lg:order-2">
        <div className="sticky top-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Plan Details</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm text-muted-foreground">Plan</span>
                <p className="font-medium">{plan.name}</p>
              </div>
              {plan.popular && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Popular</span>
              )}
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Billing</span>
              <p className="font-medium capitalize">
                {cycle}
                {cycle === 'annual' && annualSavings > 0 && (
                  <span className="ml-2 text-sm text-green-600">Save {annualSavings}%</span>
                )}
              </p>
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <div className="text-right">
                  <span className="text-2xl font-bold">
                    £{((cycle === 'monthly' ? plan.priceMonthly : plan.priceAnnual) / 100).toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">/{cycle === 'monthly' ? 'month' : 'year'}</span>
                </div>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Includes</span>
              <ul className="mt-2 space-y-2">
                {plan.features.filter((f) => f.included).slice(0, 5).map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <span className="material-symbols-outlined text-base text-green-500" aria-hidden="true">check</span>
                    {feature.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <button onClick={() => router.push('/pricing')} className="text-sm text-primary hover:underline">
              Change plan
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Form */}
      <div className="order-2 lg:order-1">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold">Payment Details</h2>
          <CheckoutForm
            planId={plan.id}
            planName={plan.name}
            priceMonthly={plan.priceMonthly}
            priceAnnual={plan.priceAnnual}
            billingCycle={cycle}
            onSuccess={handleSuccess}
          />
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <span className="material-symbols-outlined text-muted-foreground" aria-hidden="true">security</span>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Secure Payment</p>
            <p className="mt-0.5">Your payment is encrypted and secure.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="checkout-page">
      <PageHeader
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Checkout' },
        ]}
        title="Complete Your Purchase"
        description="Enter your payment details to activate your subscription"
      />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Suspense fallback={<CheckoutLoading />}>
          <CheckoutContent />
        </Suspense>
      </div>
    </div>
  );
}
