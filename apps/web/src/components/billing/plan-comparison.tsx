'use client';

/**
 * Plan Comparison Component
 *
 * Plan selection grid with billing toggle, comparison table, and FAQ.
 * Links to /billing/upgrade for plan change confirmation.
 * Uses shared PlanCard and PlanComparisonTable components.
 *
 * @implements PG-172 (Billing Ghost Pages — Plans)
 */

import * as React from 'react';
import { cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  PLANS,
  getPlanByPriceId,
  getAnnualSavingsPercent,
} from '@/lib/billing/stripe-portal';
import {
  getPlanPriceForInterval,
  getPlanChangeDirection,
  getPlanChangeDirectionDisplay,
  canChangeToPlan,
} from '@/lib/billing/plan-changes';
import pricingData from '@/data/pricing-data.json';
import { PlanCard } from './plan-card';
import { PlanComparisonTable, PlanFaq } from './plan-comparison-table';
import { ErrorState, CardSkeleton } from './billing-shared';

export function PlanComparison() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [interval, setInterval] = React.useState<'monthly' | 'annual'>('annual');

  const {
    data: subscription,
    isLoading,
    error,
  } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading || authLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CardSkeleton rows={4} />
        <CardSkeleton rows={4} />
        <CardSkeleton rows={4} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load subscription data. Please try again later." />;
  }

  const currentPlan = subscription ? getPlanByPriceId(subscription.priceId) : null;
  const currentPlanId = currentPlan?.id ?? null;

  return (
    <div className="space-y-8">
      {/* Billing interval toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setInterval('monthly')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              interval === 'monthly'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval('annual')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
              interval === 'annual'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            Annual{' '}
            <span className="text-xs bg-[#10b981] text-white px-2 py-0.5 rounded">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Plan cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const direction = getPlanChangeDirection(currentPlanId, plan.id);
          const directionDisplay = getPlanChangeDirectionDisplay(direction);
          const priceInfo = getPlanPriceForInterval(plan, interval);
          const savings = getAnnualSavingsPercent(plan);
          const changeCheck = canChangeToPlan(
            currentPlanId,
            plan.id,
            subscription?.quantity ?? 0
          );

          return (
            <PlanCard
              key={plan.id}
              variant="billing"
              id={plan.id}
              name={plan.name}
              description={plan.description}
              priceFormatted={priceInfo.formattedPerMonth}
              priceSubtext={interval === 'annual' ? priceInfo.formatted : undefined}
              savingsBadge={
                interval === 'annual' && priceInfo.savings ? priceInfo.savings : undefined
              }
              savingsPercent={interval === 'annual' ? savings : undefined}
              features={plan.features}
              isPopular={plan.popular}
              isCurrent={isCurrent}
              direction={direction}
              directionLabel={directionDisplay.label}
              directionIcon={directionDisplay.icon}
              changeAllowed={changeCheck.allowed}
              changeBlockedReason={changeCheck.reason}
              href={`/billing/upgrade?plan=${plan.id}`}
              compact
            />
          );
        })}

        {/* Custom tier (from pricing-data.json, not in PLANS) */}
        {(() => {
          const customTier = pricingData.tiers.find((t) => t.id === 'custom');
          if (!customTier) return null;
          return (
            <PlanCard
              key="custom"
              variant="billing"
              id="custom"
              name={customTier.name}
              description={customTier.description}
              priceFormatted="Contact Sales"
              priceSubtext={
                interval === 'annual'
                  ? 'Volume discounts on annual contracts'
                  : undefined
              }
              savingsBadge={interval === 'annual' ? 'Custom annual pricing' : undefined}
              features={[]}
              isCurrent={false}
              compact
              direction="upgrade"
              directionLabel="Contact Sales"
              directionIcon="handshake"
              changeAllowed={true}
              href="/contact?plan=custom"
            />
          );
        })()}
      </div>

      {/* Comparison table + FAQ */}
      <PlanComparisonTable className="pt-4" />
      <PlanFaq className="pt-4" />
    </div>
  );
}
