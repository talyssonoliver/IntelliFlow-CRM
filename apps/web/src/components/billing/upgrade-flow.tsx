'use client';

/**
 * Upgrade Flow Component
 *
 * Plan change confirmation with proration preview.
 * Shows plan selection when no plan is pre-selected via ?plan= param.
 * When no subscription exists, shows plans with "Get Started" CTAs.
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
  formatCurrency,
} from '@/lib/billing/stripe-portal';
import {
  comparePlans,
  estimateProration,
  getDaysRemainingInPeriod,
  getPlanChangeDirection,
  getPlanChangeDirectionDisplay,
  getFeatureChangeBadge,
  formatPriceDifference,
  canChangeToPlan,
  getPlanPriceForInterval,
} from '@/lib/billing/plan-changes';
import { PlanCard } from './plan-card';
import { ErrorState, CardSkeleton } from './billing-shared';

export function UpgradeFlow() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedPlanId = searchParams.get('plan');
  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(preselectedPlanId);

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
      <div className="max-w-2xl mx-auto space-y-6">
        <CardSkeleton rows={3} />
        <CardSkeleton rows={2} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load subscription data. Please try again later." />;
  }

  // No subscription — show plan grid with "Get Started" CTAs
  if (!subscription) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const priceInfo = getPlanPriceForInterval(plan, 'monthly');
            return (
              <PlanCard
                key={plan.id}
                variant="billing"
                id={plan.id}
                name={plan.name}
                description={plan.description}
                priceFormatted={priceInfo.formattedPerMonth}
                features={plan.features}
                isPopular={plan.popular}
                isCurrent={false}
                direction="upgrade"
                directionLabel="Get Started"
                directionIcon="arrow_forward"
                changeAllowed={true}
                href={`/billing/checkout?plan=${plan.id}`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const currentPlan = getPlanByPriceId(subscription.priceId);
  const currentPlanId = currentPlan?.id ?? null;
  const targetPlan = selectedPlanId ? getPlanById(selectedPlanId) : null;
  const comparison =
    targetPlan && currentPlanId ? comparePlans(currentPlanId, targetPlan.id) : null;

  // Proration estimate
  const daysRemaining = getDaysRemainingInPeriod(new Date(subscription.currentPeriodEnd));
  const prorationAmount =
    currentPlan && targetPlan
      ? estimateProration(currentPlan, targetPlan, daysRemaining, 30)
      : 0;
  const priceDiff = comparison
    ? formatPriceDifference(comparison.priceDifference, currentPlan?.currency ?? 'GBP')
    : null;
  const dirDisplay = comparison ? getPlanChangeDirectionDisplay(comparison.direction) : null;

  function handleConfirm() {
    if (!selectedPlanId) return;
    updateMutation.mutate({
      planId: selectedPlanId,
      billingCycle: 'monthly',
    } as Record<string, unknown>);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Direction indicator */}
      {dirDisplay && comparison && (
        <div
          className={cn(
            'flex items-center gap-3 p-4 rounded-lg border',
            dirDisplay.variant === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : dirDisplay.variant === 'warning'
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
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

      {/* Current plan */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-lg">{currentPlan?.name ?? 'Unknown'}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {currentPlan
                  ? formatCurrency(currentPlan.priceMonthly, currentPlan.currency) + '/mo'
                  : '--'}
              </p>
            </div>
            <Badge variant="outline">{currentPlan?.name ?? 'Unknown'}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Target plan selection (when no ?plan= param) */}
      {!selectedPlanId && (
        <Card className="border border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Select a Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {PLANS.filter((p) => p.id !== currentPlanId).map((plan) => {
              const direction = getPlanChangeDirection(currentPlanId, plan.id);
              const directionDisplay = getPlanChangeDirectionDisplay(direction);
              const changeCheck = canChangeToPlan(
                currentPlanId,
                plan.id,
                subscription?.quantity ?? 0
              );

              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => changeCheck.allowed && setSelectedPlanId(plan.id)}
                  disabled={!changeCheck.allowed}
                  title={changeCheck.reason}
                  className={cn(
                    'w-full p-4 text-left border rounded-lg transition-colors flex items-center justify-between',
                    changeCheck.allowed
                      ? 'border-slate-200 dark:border-slate-700 hover:border-primary cursor-pointer'
                      : 'border-slate-100 dark:border-slate-800 opacity-50 cursor-not-allowed'
                  )}
                >
                  <div>
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {formatCurrency(plan.priceMonthly, plan.currency)}/mo
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      direction === 'upgrade' && 'text-green-700 border-green-300',
                      direction === 'downgrade' && 'text-amber-700 border-amber-300'
                    )}
                  >
                    <span
                      className="material-symbols-outlined text-sm mr-1"
                      aria-hidden="true"
                    >
                      {directionDisplay.icon}
                    </span>
                    {directionDisplay.label}
                  </Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Proration preview */}
      {targetPlan && (
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
                {formatCurrency(targetPlan.priceMonthly, targetPlan.currency)}/mo
              </span>
            </div>
            {priceDiff && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Price difference</span>
                <span
                  className={cn(
                    'font-medium',
                    priceDiff.isIncrease
                      ? 'text-amber-600'
                      : priceDiff.isDecrease
                        ? 'text-green-600'
                        : ''
                  )}
                >
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

      {/* Feature comparison */}
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
                        </span>
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

      {/* Confirm button */}
      {targetPlan && (
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" asChild>
            <Link href="/billing/plans">Cancel</Link>
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={updateMutation.isPending}
            aria-label="Confirm plan change"
          >
            {updateMutation.isPending
              ? 'Processing...'
              : `Confirm ${dirDisplay?.label ?? 'Change'}`}
          </Button>
        </div>
      )}
    </div>
  );
}
