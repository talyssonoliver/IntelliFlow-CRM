'use client';

/**
 * Upgrade Page
 *
 * Conversion-focused page for plan upgrades. Can be accessed directly
 * or via paywall redirect with a ?module= query parameter to highlight
 * which module triggered the upgrade.
 *
 * Data sources (real only — no fake data):
 * - Module metadata from MODULE_METADATA
 * - Plan → module mapping from trpc.moduleAccess.getPlans
 * - Pricing tiers from pricing-data.json
 * - Current plan from useEnabledModules()
 * - User role from useAuth()
 */

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Card, cn, Skeleton } from '@intelliflow/ui';
import {
  MODULE_METADATA,
  getMinimumPlanForModule,
  type ModuleId,
  CRM_MODULES,
} from '@intelliflow/domain';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { PublicFooter } from '@/components/public/PublicFooter';
import pricingData from '@/data/pricing-data.json';

/** Plan tier display labels */
const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
  CUSTOM: 'Custom',
};

/** Map domain tier names to pricing-data.json tier IDs */
const _TIER_TO_PRICING_ID: Record<string, string> = {
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
  CUSTOM: 'custom',
};

function UpgradePageContent() {
  const searchParams = useSearchParams();
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const { user } = useAuth();
  const { plan: currentPlan } = useEnabledModules();

  // Optional module context from paywall redirect
  const moduleParam = searchParams.get('module') as ModuleId | null;
  const targetModule =
    moduleParam && CRM_MODULES.includes(moduleParam as ModuleId)
      ? MODULE_METADATA[moduleParam]
      : null;
  const requiredPlan = moduleParam ? getMinimumPlanForModule(moduleParam as ModuleId) : null;

  // Real plan data from module-access API
  const { data: planModuleData } = trpc.moduleAccess.getPlans.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');

  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const currentPlanLabel = currentPlan ? (PLAN_LABELS[currentPlan] ?? currentPlan) : null;

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="container mx-auto max-w-6xl px-4 py-12 lg:py-16">
          <div className="text-center max-w-2xl mx-auto">
            {targetModule ? (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    lock
                  </span>
                  {targetModule.label} requires an upgrade
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
                  Unlock {targetModule.label}
                </h1>
                <p className="text-base text-slate-600 dark:text-slate-400">
                  {targetModule.description}. Upgrade to{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {requiredPlan ? (PLAN_LABELS[requiredPlan] ?? requiredPlan) : 'a higher plan'}
                  </span>{' '}
                  to get started.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
                  Upgrade Your Plan
                </h1>
                <p className="text-base text-slate-600 dark:text-slate-400">
                  Get more from IntelliFlow CRM with advanced features, AI intelligence, and
                  dedicated support.
                </p>
              </>
            )}

            {currentPlanLabel && (
              <div className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  info
                </span>
                You&apos;re currently on the{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {currentPlanLabel}
                </span>{' '}
                plan
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="container mx-auto max-w-6xl px-4 py-12">
        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              className={cn(
                'px-4 py-2 rounded-md transition-all font-medium text-sm',
                billing === 'monthly'
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              )}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              className={cn(
                'px-4 py-2 rounded-md transition-all font-medium text-sm flex items-center gap-2',
                billing === 'annual'
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              )}
              onClick={() => setBilling('annual')}
            >
              Annual{' '}
              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pricingData.tiers.map((tier) => {
            const isCurrentPlan =
              currentPlan?.toLowerCase() === tier.id.toLowerCase();
            const tierKey = tier.id.toUpperCase();
            const isRequired = requiredPlan === tierKey;
            const meetsRequirement =
              requiredPlan && planMeetsOrExceeds(tierKey, requiredPlan);

            // Module inclusion data from real API
            const tierModuleData = planModuleData?.find(
              (p) => p.tier.toLowerCase() === tier.id.toLowerCase()
            );
            const includesTargetModule =
              moduleParam && tierModuleData?.modules.includes(moduleParam as ModuleId);

            return (
              <Card
                key={tier.id}
                className={cn(
                  'relative p-6 flex flex-col transition-all',
                  isRequired
                    ? 'border-2 border-primary shadow-lg ring-2 ring-primary/10'
                    : isCurrentPlan
                      ? 'border-2 border-slate-300 dark:border-slate-600'
                      : 'border hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
                )}
              >
                {/* Badges */}
                {isRequired && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                      Recommended
                    </span>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute right-3 top-3">
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full text-xs font-medium">
                      Current
                    </span>
                  </div>
                )}

                {/* Tier icon + name */}
                <div className="mb-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                    <span
                      className="material-symbols-outlined text-xl text-primary"
                      aria-hidden="true"
                    >
                      {tier.icon}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                    {tier.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {tier.description}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-5">
                  {tier.price.custom ? (
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      {tier.price.label}
                    </span>
                  ) : (
                    <div>
                      <span className="text-3xl font-bold text-slate-900 dark:text-white">
                        £{billing === 'monthly' ? tier.price.monthly : tier.price.annual}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        /user/mo
                      </span>
                      {billing === 'annual' && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Billed annually
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Module availability indicator */}
                {moduleParam && (
                  <div
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-4',
                      includesTargetModule
                        ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500'
                    )}
                  >
                    <span
                      className={cn(
                        'material-symbols-outlined text-base',
                        includesTargetModule ? 'text-green-600' : 'text-slate-400'
                      )}
                      aria-hidden="true"
                    >
                      {includesTargetModule ? 'check_circle' : 'cancel'}
                    </span>
                    {includesTargetModule
                      ? `Includes ${targetModule?.label ?? moduleParam}`
                      : `No ${targetModule?.label ?? moduleParam}`}
                  </div>
                )}

                {/* Features */}
                <ul className="space-y-2 mb-6 flex-1">
                  {tier.features.slice(0, 6).map((feature, i) => (
                    <li
                      key={i} // NOSONAR typescript:S6479
                      className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
                    >
                      <span
                        className="material-symbols-outlined text-primary text-sm mt-0.5 flex-shrink-0"
                        aria-hidden="true"
                      >
                        check
                      </span>
                      {feature}
                    </li>
                  ))}
                  {tier.features.length > 6 && (
                    <li className="text-xs text-slate-400 dark:text-slate-500 pl-5">
                      +{tier.features.length - 6} more features
                    </li>
                  )}
                </ul>

                {/* CTA */}
                {isCurrentPlan ? (
                  <Button variant="outline" disabled className="w-full">
                    Current Plan
                  </Button>
                ) : isAdmin ? (
                  <Button
                    asChild
                    className={cn(
                      'w-full',
                      (isRequired || (meetsRequirement && !isCurrentPlan))
                        ? 'bg-primary hover:bg-primary/90'
                        : ''
                    )}
                    variant={isRequired || meetsRequirement ? 'default' : 'outline'}
                  >
                    <Link href="/billing/subscriptions">
                      {isRequired ? 'Upgrade Now' : `Select ${tier.name}`}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    className="w-full"
                    variant={isRequired || meetsRequirement ? 'default' : 'outline'}
                  >
                    <Link href="/billing/subscriptions">
                      View Plan
                    </Link>
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        {/* Module inclusion grid — only when module context is present */}
        {moduleParam && planModuleData && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Module Availability by Plan
            </h2>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">
                        Module
                      </th>
                      {planModuleData.map((p) => (
                        <th
                          key={p.tier}
                          className={cn(
                            'text-center p-3 font-medium',
                            p.tier === requiredPlan
                              ? 'text-primary'
                              : 'text-slate-600 dark:text-slate-400'
                          )}
                        >
                          {p.label}
                          {p.tier === currentPlan && (
                            <span className="block text-xs text-slate-400 font-normal">
                              Current
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CRM_MODULES.filter((m) => m !== 'CORE_CRM').map((moduleId) => {
                      const meta = MODULE_METADATA[moduleId];
                      const isTarget = moduleId === moduleParam;
                      return (
                        <tr
                          key={moduleId}
                          className={cn(
                            'border-b border-slate-100 dark:border-slate-800',
                            isTarget && 'bg-primary/5'
                          )}
                        >
                          <td className="p-3">
                            <span
                              className={cn(
                                'font-medium',
                                isTarget
                                  ? 'text-primary'
                                  : 'text-slate-700 dark:text-slate-300'
                              )}
                            >
                              {meta.label}
                            </span>
                          </td>
                          {planModuleData.map((p) => (
                            <td key={p.tier} className="text-center p-3">
                              {p.modules.includes(moduleId) ? (
                                <span
                                  className="material-symbols-outlined text-green-600 text-base"
                                  aria-hidden="true"
                                >
                                  check_circle
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Bottom actions */}
        <div className="mt-12 text-center space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isAdmin && (
              <Button asChild variant="outline">
                <Link href="/billing/subscriptions">
                  <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
                    credit_card
                  </span>
                  Manage Subscription
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/pricing">
                <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
                  compare
                </span>
                Full Plan Comparison
              </Link>
            </Button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Questions?{' '}
            <Link href="/support" className="text-primary hover:underline">
              Contact our team
            </Link>{' '}
            for help choosing the right plan.
          </p>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}

/**
 * Check if a plan tier meets or exceeds the required tier.
 * Tier order: STARTER < PROFESSIONAL < ENTERPRISE < CUSTOM
 */
function planMeetsOrExceeds(planTier: string, requiredTier: string): boolean {
  const order = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'];
  const planIndex = order.indexOf(planTier);
  const requiredIndex = order.indexOf(requiredTier);
  if (planIndex === -1 || requiredIndex === -1) return false;
  return planIndex >= requiredIndex;
}

function UpgradeLoadingFallback() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="text-center mb-12">
          <Skeleton className="h-10 w-64 mx-auto mb-4" />
          <Skeleton className="h-5 w-96 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<UpgradeLoadingFallback />}>
      <UpgradePageContent />
    </Suspense>
  );
}
