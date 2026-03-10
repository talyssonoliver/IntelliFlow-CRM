'use client';

/**
 * Usage Dashboard Component
 *
 * Displays usage metrics vs plan limits with progress bars and color coding.
 *
 * @implements PG-172 (Billing Ghost Pages — Usage)
 */

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Progress, Badge, cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  getUsagePercentage,
  isNearUsageLimit,
  isAtUsageLimit,
  formatStorageSize,
  getPlanByPriceId,
} from '@/lib/billing/stripe-portal';
import { EmptyState, ErrorState, CardSkeleton } from './billing-shared';

function getProgressColor(current: number, limit: number): string {
  if (isAtUsageLimit(current, limit)) return 'text-red-600 dark:text-red-400';
  if (isNearUsageLimit(current, limit)) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function getProgressBarClass(current: number, limit: number): string {
  if (isAtUsageLimit(current, limit)) return '[&>div]:bg-red-500';
  if (isNearUsageLimit(current, limit)) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-green-500';
}

function getStatusIcon(current: number, limit: number): string {
  if (isAtUsageLimit(current, limit)) return 'error';
  if (isNearUsageLimit(current, limit)) return 'warning';
  return 'check_circle';
}

interface MetricCardProps {
  title: string;
  current: number;
  limit: number;
  formatValue?: (val: number) => string;
}

function MetricCard({ title, current, limit, formatValue }: Readonly<MetricCardProps>) {
  const percentage = getUsagePercentage(current, limit);
  const colorClass = getProgressColor(current, limit);
  const barClass = getProgressBarClass(current, limit);
  const icon = getStatusIcon(current, limit);
  const displayCurrent = formatValue ? formatValue(current) : current.toLocaleString();
  const displayLimit = formatValue ? formatValue(limit) : limit.toLocaleString();

  return (
    <Card className="border border-slate-200 dark:border-slate-800">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</h3>
          <div className="flex items-center gap-1">
            <span className={cn('material-symbols-outlined text-lg', colorClass)} aria-hidden="true">
              {icon}
            </span>
            <span className={cn('text-sm font-semibold', colorClass)}>{percentage}%</span>
          </div>
        </div>
        <Progress value={percentage} className={cn('h-2 mb-2', barClass)} />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {displayCurrent} of {displayLimit} used
        </p>
      </CardContent>
    </Card>
  );
}

export function UsageDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data: usage,
    isLoading: usageLoading,
    error: usageError,
  } = trpc.billing.getUsageMetrics.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const {
    data: subscription,
    isLoading: subLoading,
    error: subError,
  } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isLoading = usageLoading || subLoading || authLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardSkeleton rows={1} />
          <CardSkeleton rows={1} />
          <CardSkeleton rows={1} />
        </div>
      </div>
    );
  }

  if (usageError || subError) {
    return <ErrorState message="Failed to load usage metrics. Please try again later." />;
  }

  if (!subscription || !usage) {
    return (
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          <EmptyState icon="credit_card_off" message="No active subscription" />
        </CardContent>
      </Card>
    );
  }

  const plan = getPlanByPriceId(subscription.priceId);
  const planName = plan?.name ?? 'Current Plan';
  const showUpgradeCta =
    isNearUsageLimit(usage.apiCalls.current, usage.apiCalls.limit) ||
    isNearUsageLimit(usage.storage.current, usage.storage.limit) ||
    isNearUsageLimit(usage.activeUsers.current, usage.activeUsers.limit);

  return (
    <div className="space-y-6">
      {/* Plan context */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">
                insights
              </span>
              Usage Overview
            </CardTitle>
            <Badge variant="outline">{planName}</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Usage metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="API Calls"
          current={usage.apiCalls.current}
          limit={usage.apiCalls.limit}
        />
        <MetricCard
          title="Storage"
          current={usage.storage.current}
          limit={usage.storage.limit}
          formatValue={formatStorageSize}
        />
        <MetricCard
          title="Active Users"
          current={usage.activeUsers.current}
          limit={usage.activeUsers.limit}
        />
      </div>

      {/* Upgrade CTA */}
      {showUpgradeCta && (
        <Card className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400" aria-hidden="true">
                trending_up
              </span>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                You&apos;re approaching your plan limits. Consider upgrading for more capacity.
              </p>
            </div>
            <Link
              href="/billing/upgrade"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium text-sm rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                upgrade
              </span>
              Upgrade Plan
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
        Usage data is approximate and updates periodically.
      </p>
    </div>
  );
}
