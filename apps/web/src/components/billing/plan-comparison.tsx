'use client';

/**
 * Plan Comparison Component
 *
 * 3-column plan comparison grid with monthly/annual toggle.
 *
 * @implements PG-172 (Billing Ghost Pages — Plans)
 */

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, Badge, Button, cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { PLANS, getAnnualSavingsPercent, getPlanByPriceId } from '@/lib/billing/stripe-portal';
import {
  getPlanPriceForInterval,
  getPlanChangeDirection,
  getPlanChangeDirectionDisplay,
  canChangeToPlan,
} from '@/lib/billing/plan-changes';
import { ErrorState, CardSkeleton } from './billing-shared';

export function PlanComparison() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [interval, setInterval] = React.useState<'monthly' | 'annual'>('monthly');
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
    <div className="space-y-6">
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
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              interval === 'annual'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            Annual
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const direction = getPlanChangeDirection(currentPlanId, plan.id);
          const dirDisplay = getPlanChangeDirectionDisplay(direction);
          const priceInfo = getPlanPriceForInterval(plan, interval);
          const savings = getAnnualSavingsPercent(plan);
          const changeCheck = canChangeToPlan(currentPlanId, plan.id, subscription?.quantity ?? 0);

          return (
            <Card
              key={plan.id}
              className={cn(
                'border relative flex flex-col',
                isCurrent
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-slate-200 dark:border-slate-800',
                plan.popular && !isCurrent && 'border-blue-300 dark:border-blue-700'
              )}
              aria-current={isCurrent ? 'true' : undefined}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-3">
                  Popular
                </Badge>
              )}
              {isCurrent && (
                <Badge className="absolute -top-3 right-4 bg-primary text-white px-3">
                  Current Plan
                </Badge>
              )}

              <CardHeader className="pt-6 pb-4">
                <CardTitle className="text-xl font-bold text-center">{plan.name}</CardTitle>
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
                  {plan.description}
                </p>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                {/* Price */}
                <div className="text-center">
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">
                    {priceInfo.formattedPerMonth}
                  </p>
                  {interval === 'annual' && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {priceInfo.formatted}
                    </p>
                  )}
                  {interval === 'annual' && priceInfo.savings && (
                    <Badge variant="outline" className="mt-2 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700">
                      {priceInfo.savings}
                    </Badge>
                  )}
                  {interval === 'annual' && savings > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Save {savings}% vs monthly
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                  {plan.features.map((feature) => (
                    <li key={feature.name} className="flex items-start gap-2 text-sm">
                      <span
                        className={cn(
                          'material-symbols-outlined text-lg mt-0.5',
                          feature.included
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-slate-300 dark:text-slate-600'
                        )}
                        aria-hidden="true"
                      >
                        {feature.included ? 'check_circle' : 'cancel'}
                      </span>
                      <span className={cn(
                        feature.included
                          ? 'text-slate-700 dark:text-slate-300'
                          : 'text-slate-400 dark:text-slate-500 line-through'
                      )}>
                        {feature.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-4">
                {isCurrent ? (
                  <Button className="w-full" disabled aria-label="Current Plan">
                    Current Plan
                  </Button>
                ) : changeCheck.allowed ? (
                  <Button className="w-full" variant={direction === 'upgrade' ? 'default' : 'outline'} asChild>
                    <Link href={`/billing/upgrade?plan=${plan.id}`}>
                      <span className="material-symbols-outlined text-lg mr-1" aria-hidden="true">
                        {dirDisplay.icon}
                      </span>
                      {dirDisplay.label}
                    </Link>
                  </Button>
                ) : (
                  <Button className="w-full" disabled title={changeCheck.reason}>
                    {dirDisplay.label}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
