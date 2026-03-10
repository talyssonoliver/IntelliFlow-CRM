'use client';

/**
 * Module Paywall Component
 * IFC-210: Dynamic Module Registry
 *
 * Displayed when a user navigates to a module that is not enabled
 * for their tenant's current plan. Shows plan-aware upgrade CTAs
 * using real module/plan sources only — no fake data.
 *
 * Primary CTA: /upgrade?module=X — plan comparison focused on the locked module
 * Admin shortcut: /billing/subscriptions — direct subscription management
 */

import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { MODULE_METADATA, getMinimumPlanForModule, type ModuleId } from '@intelliflow/domain';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEnabledModules } from '@/hooks/useEnabledModules';

interface ModulePaywallProps {
  moduleId: ModuleId;
  className?: string;
  /** Whether the paywall is shown due to an access-resolution error */
  accessError?: boolean;
}

/** Plan tier display names */
const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
  CUSTOM: 'Custom',
};

export function ModulePaywall({ moduleId, className, accessError }: Readonly<ModulePaywallProps>) {
  const meta = MODULE_METADATA[moduleId];
  const minPlan = getMinimumPlanForModule(moduleId);
  const { user } = useAuth();
  const { plan: currentPlan } = useEnabledModules();

  // Fetch plan comparison from real source
  const { data: plans } = trpc.moduleAccess.getPlans.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isAdmin = !!user?.role && ['ADMIN', 'admin', 'SUPER_ADMIN', 'owner'].includes(user.role);
  const currentPlanLabel = currentPlan ? (PLAN_LABELS[currentPlan] ?? currentPlan) : 'Unknown';
  const requiredPlanLabel = minPlan ? (PLAN_LABELS[minPlan] ?? minPlan) : null;

  // Find which plans include this module
  const plansWithModule = plans?.filter((p) =>
    p.modules.includes(moduleId)
  ) ?? [];

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[60vh] px-4 ${className ?? ''}`}
    >
      <div className="max-w-lg w-full space-y-6">
        {/* Lock header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl text-slate-400 dark:text-slate-500" aria-hidden="true">
              lock
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {meta?.label ?? moduleId} Module
            </h1>
            <p className="text-sm text-muted-foreground">
              {meta?.description ?? 'This module is not included in your current plan.'}
            </p>
          </div>
        </div>

        {/* Access error banner */}
        {accessError && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
            <span className="material-symbols-outlined text-lg text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true">
              warning
            </span>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Unable to verify module access
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Access status is pending. Please try again later or contact your administrator.
              </p>
            </div>
          </div>
        )}

        {/* Plan status card */}
        <Card className="p-5 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Your Plan
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {currentPlanLabel}
              </span>
            </div>

            {requiredPlanLabel && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  Required Plan
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    upgrade
                  </span>
                  {requiredPlanLabel}+
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Plan inclusion comparison */}
        {plansWithModule.length > 0 && (
          <Card className="p-5 rounded-xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-3">
              Available on
            </h2>
            <div className="space-y-2">
              {plansWithModule.map((p) => {
                const isCurrent = p.tier === currentPlan;
                return (
                  <div
                    key={p.tier}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg text-sm ${
                      isCurrent
                        ? 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'
                        : ''
                    }`}
                  >
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {p.label}
                    </span>
                    {isCurrent ? (
                      <span className="text-xs text-muted-foreground">Current plan</span>
                    ) : (
                      <span className="material-symbols-outlined text-base text-green-600" aria-hidden="true">
                        check_circle
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* CTAs */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* Primary CTA: Upgrade page with module context */}
            <Link
              href={`/upgrade?module=${moduleId}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                upgrade
              </span>
              Upgrade Plan
            </Link>

            {/* Admin shortcut: direct to subscription management */}
            {isAdmin ? (
              <Link
                href="/billing/subscriptions"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  credit_card
                </span>
                Manage Subscription
              </Link>
            ) : (
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                Compare Plans
              </Link>
            )}
          </div>

          <div className="text-center">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
