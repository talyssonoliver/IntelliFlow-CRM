'use client';

/**
 * Upgrade Flow Component
 *
 * Two modes:
 * 1. No ?plan= param → shows full plan cards (non-compact, with features) for selection
 * 2. ?plan=X param → shows confirmation with proration preview
 *
 * @implements PG-172 (Billing Ghost Pages — Upgrade)
 */

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  PLANS,
  getPlanById,
  getPlanByPriceId,
  getAnnualSavingsPercent,
  formatCurrency,
  type Plan,
} from '@/lib/billing/stripe-portal';
import {
  comparePlans,
  estimateProration,
  getDaysRemainingInPeriod,
  getPlanChangeDirection,
  getPlanChangeDirectionDisplay,
  getPlanPriceForInterval,
  canChangeToPlan,
  getFeatureChangeBadge,
  formatPriceDifference,
} from '@/lib/billing/plan-changes';
import pricingData from '@/data/pricing-data.json';
import { PlanCard } from './plan-card';
import { ErrorState, CardSkeleton } from './billing-shared';

// =============================================
// Helpers
// =============================================

function directionBannerClass(variant: string): string {
  if (variant === 'success') {
    return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
  }
  if (variant === 'warning') {
    return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  }
  return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
}

function priceDiffClass(isIncrease: boolean, isDecrease: boolean): string {
  if (isIncrease) return 'font-medium text-amber-600';
  if (isDecrease) return 'font-medium text-green-600';
  return 'font-medium';
}

// =============================================
// Mode 1: Plan selection view
// =============================================

interface PlanSelectionViewProps {
  currentPlanId: string | null;
  subscriptionQuantity: number;
}

function PlanSelectionView({ currentPlanId, subscriptionQuantity }: Readonly<PlanSelectionViewProps>) {
  const [interval, setInterval] = React.useState<'monthly' | 'annual'>('annual');

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
            <span className="text-xs bg-[#10b981] text-white px-2 py-0.5 rounded">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Full plan cards (non-compact — with features) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const direction = getPlanChangeDirection(currentPlanId, plan.id);
          const directionDisplay = getPlanChangeDirectionDisplay(direction);
          const priceInfo = getPlanPriceForInterval(plan, interval);
          const savings = getAnnualSavingsPercent(plan);
          const changeCheck = canChangeToPlan(currentPlanId, plan.id, subscriptionQuantity);

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
            />
          );
        })}

        {/* Custom tier */}
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
                interval === 'annual' ? 'Volume discounts on annual contracts' : undefined
              }
              savingsBadge={interval === 'annual' ? 'Custom annual pricing' : undefined}
              features={customTier.features.map((f) => ({ name: f, included: true }))}
              isCurrent={false}
              direction="upgrade"
              directionLabel="Contact Sales"
              directionIcon="handshake"
              changeAllowed={true}
              href="/contact?plan=custom"
            />
          );
        })()}
      </div>
    </div>
  );
}

// =============================================
// Mode 2: Confirmation view
// =============================================

interface ConfirmViewProps {
  targetPlan: Plan;
  currentPlan: Plan | null;
  currentPlanId: string | null;
  periodEnd: Date | null;
  onConfirm: () => void;
  isPending: boolean;
}

function ConfirmView({
  targetPlan,
  currentPlan,
  currentPlanId,
  periodEnd,
  onConfirm,
  isPending,
}: Readonly<ConfirmViewProps>) {
  const isSamePlan = targetPlan.id === currentPlanId;
  const isNewSubscription = !currentPlan && !periodEnd;
  const comparison =
    !isNewSubscription && currentPlanId && !isSamePlan
      ? comparePlans(currentPlanId, targetPlan.id)
      : null;
  const daysRemaining = periodEnd ? getDaysRemainingInPeriod(periodEnd) : 0;
  const prorationAmount =
    currentPlan && !isSamePlan
      ? estimateProration(currentPlan, targetPlan, daysRemaining, 30)
      : 0;
  const priceDiff = comparison
    ? formatPriceDifference(comparison.priceDifference, currentPlan?.currency ?? 'GBP')
    : null;
  const dirDisplay = comparison ? getPlanChangeDirectionDisplay(comparison.direction) : null;

  let confirmLabel: string;
  if (isPending) {
    confirmLabel = 'Processing...';
  } else if (isNewSubscription) {
    confirmLabel = `Subscribe to ${targetPlan.name}`;
  } else {
    confirmLabel = `Confirm ${dirDisplay?.label ?? 'Change'}`;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Direction indicator (plan change only) */}
      {dirDisplay && comparison && (
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-lg border',
            directionBannerClass(dirDisplay.variant)
          )}
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            {dirDisplay.icon}
          </span>
          <div>
            <p className="font-semibold">{dirDisplay.label}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{dirDisplay.description}</p>
          </div>
        </div>
      )}

      {/* Current plan (only when switching) */}
      {currentPlan && !isSamePlan && (
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-lg">{currentPlan.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {formatCurrency(currentPlan.priceMonthly, currentPlan.currency)}{' '}
                  <span className="text-slate-400">/mo</span>
                </p>
              </div>
              <Badge variant="outline">{currentPlan.name}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New plan details */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {isNewSubscription ? 'Selected Plan' : 'New Plan'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-lg">{targetPlan.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {targetPlan.description}
              </p>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(targetPlan.priceMonthly, targetPlan.currency)}{' '}
              <span className="text-sm font-normal text-slate-500">/mo</span>
            </p>
          </div>

          <ul className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            {targetPlan.features
              .filter((f) => f.included)
              .map((feature) => (
                <li key={feature.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="material-symbols-outlined text-green-600 dark:text-green-400 text-lg"
                    aria-hidden="true"
                  >
                    check_circle
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{feature.name}</span>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>

      {/* Proration preview (plan change only) */}
      {!isNewSubscription && !isSamePlan && (
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Estimated Cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">
                New plan ({targetPlan.name})
              </span>
              <span className="font-medium">
                {formatCurrency(targetPlan.priceMonthly, targetPlan.currency)}{' '}
                <span>/mo</span>
              </span>
            </div>
            {priceDiff && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Price difference</span>
                <span className={priceDiffClass(priceDiff.isIncrease, priceDiff.isDecrease)}>
                  {priceDiff.formatted}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-3 border-slate-200 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-400">
                Estimated prorated charge
              </span>
              <span className="font-semibold">
                {formatCurrency(Math.abs(prorationAmount), currentPlan?.currency ?? 'GBP')}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feature comparison (plan change only) */}
      {comparison && (
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Feature Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {comparison.featureChanges
                .filter((f) => f.change !== 'unchanged')
                .map((feature) => {
                  const badge = getFeatureChangeBadge(feature.change);
                  return (
                    <li
                      key={feature.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{feature.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          badge.variant === 'success' && 'text-green-700 border-green-300',
                          badge.variant === 'warning' && 'text-amber-700 border-amber-300'
                        )}
                      >
                        <span
                          className="material-symbols-outlined text-sm mr-1"
                          aria-hidden="true"
                        >
                          {badge.icon}
                        </span>{' '}
                        {badge.label}
                      </Badge>
                    </li>
                  );
                })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
        Estimated amount — final charge calculated by payment provider.
      </p>

      {/* Confirm buttons */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" asChild>
          <Link href="/billing/plans">Cancel</Link>
        </Button>
        <Button
          className="flex-1"
          onClick={onConfirm}
          disabled={isPending}
          aria-label="Confirm plan change"
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

// =============================================
// Main export
// =============================================

export function UpgradeFlow() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const planId = searchParams.get('plan');

  const {
    data: subscription,
    isLoading,
    error,
  } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const updateMutation = trpc.billing.updateSubscription.useMutation({
    onSuccess: () => {
      router.push('/billing');
    },
  });

  if (isLoading || authLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <CardSkeleton rows={6} />
        <CardSkeleton rows={6} />
        <CardSkeleton rows={6} />
        <CardSkeleton rows={6} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load subscription data. Please try again later." />;
  }

  const currentPlan = subscription ? getPlanByPriceId(subscription.priceId) : null;
  const currentPlanId = currentPlan?.id ?? null;
  const targetPlan = planId ? getPlanById(planId) : null;

  // MODE 1: No ?plan= param → full plan selection
  if (!planId || !targetPlan) {
    return (
      <PlanSelectionView
        currentPlanId={currentPlanId}
        subscriptionQuantity={subscription?.quantity ?? 0}
      />
    );
  }

  // MODE 2: ?plan=X → confirmation with proration
  function handleConfirm() {
    updateMutation.mutate({
      planId,
      billingCycle: 'monthly',
    } as Record<string, unknown>);
  }

  return (
    <ConfirmView
      targetPlan={targetPlan}
      currentPlan={currentPlan ?? null}
      currentPlanId={currentPlanId}
      periodEnd={subscription ? new Date(subscription.currentPeriodEnd) : null}
      onConfirm={handleConfirm}
      isPending={updateMutation.isPending}
    />
  );
}
