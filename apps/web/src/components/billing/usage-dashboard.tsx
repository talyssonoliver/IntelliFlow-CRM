'use client';

/**
 * Usage Dashboard Component
 *
 * Comprehensive usage overview showing:
 * - Plan limits with progress bars (Users, Contacts, AI Predictions, Storage)
 * - CRM data totals (Leads, Contacts, Accounts, Deals, Tasks, Tickets, Cases)
 * - Activity this period (AI Predictions, Conversations, Audit Logs, Notifications)
 * - Content totals (Documents, Calendar Events)
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
import { ErrorState, CardSkeleton } from './billing-shared';

const UNLIMITED = -1;

function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED;
}

function getProgressColor(current: number, limit: number): string {
  if (isUnlimited(limit)) return 'text-green-600 dark:text-green-400';
  if (isAtUsageLimit(current, limit)) return 'text-red-600 dark:text-red-400';
  if (isNearUsageLimit(current, limit)) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function getProgressBarClass(current: number, limit: number): string {
  if (isUnlimited(limit)) return '[&>div]:bg-green-500';
  if (isAtUsageLimit(current, limit)) return '[&>div]:bg-red-500';
  if (isNearUsageLimit(current, limit)) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-green-500';
}

function getStatusIcon(current: number, limit: number): string {
  if (isUnlimited(limit)) return 'all_inclusive';
  if (isAtUsageLimit(current, limit)) return 'error';
  if (isNearUsageLimit(current, limit)) return 'warning';
  return 'check_circle';
}

// ============================================
// Plan Limit Card (with progress bar)
// ============================================

interface LimitCardProps {
  title: string;
  icon: string;
  current: number;
  limit: number;
  formatValue?: (val: number) => string;
}

function LimitCard({ title, icon, current, limit, formatValue }: Readonly<LimitCardProps>) {
  const unlimited = isUnlimited(limit);
  const percentage = unlimited ? Math.min(current, 100) : getUsagePercentage(current, limit);
  const colorClass = getProgressColor(current, limit);
  const barClass = getProgressBarClass(current, limit);
  const statusIcon = getStatusIcon(current, limit);

  return (
    <Card className="border border-slate-200 dark:border-slate-800">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-lg text-slate-500 dark:text-slate-400"
              aria-hidden="true"
            >
              {icon}
            </span>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</h3>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={cn('material-symbols-outlined text-lg', colorClass)}
              aria-hidden="true"
            >
              {statusIcon}
            </span>
            {unlimited ? (
              <span className={cn('text-sm font-semibold', colorClass)}>Unlimited</span>
            ) : (
              <span className={cn('text-sm font-semibold', colorClass)}>{percentage}%</span>
            )}
          </div>
        </div>
        {!unlimited && <Progress value={percentage} className={cn('h-2 mb-2', barClass)} />}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatValue ? formatValue(current) : current.toLocaleString('en-GB')}
          {unlimited
            ? ' used'
            : ` of ${formatValue ? formatValue(limit) : limit.toLocaleString('en-GB')} used`}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================
// Stat Card (simple count)
// ============================================

interface StatCardProps {
  title: string;
  icon: string;
  value: number;
  href?: string;
}

function StatCard({ title, icon, value, href }: Readonly<StatCardProps>) {
  const content = (
    <Card
      className={cn(
        'border border-slate-200 dark:border-slate-800',
        href && 'hover:border-primary/50 transition-colors cursor-pointer'
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <span
              className="material-symbols-outlined text-xl text-slate-600 dark:text-slate-400"
              aria-hidden="true"
            >
              {icon}
            </span>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {value.toLocaleString('en-GB')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

// ============================================
// Dashboard
// ============================================

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton rows={1} />
          <CardSkeleton rows={1} />
          <CardSkeleton rows={1} />
          <CardSkeleton rows={1} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <CardSkeleton rows={1} />
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

  if (!usage) {
    return <ErrorState message="Unable to load usage data. Please try again later." />;
  }

  const plan = subscription ? getPlanByPriceId(subscription.priceId) : null;
  const planName = plan?.name ?? 'Free';
  const { planLimits, crm, ai, activity, content } = usage;

  const isMetricNearLimit = (current: number, limit: number) =>
    !isUnlimited(limit) && isNearUsageLimit(current, limit);

  const nearAnyLimit =
    isMetricNearLimit(planLimits.activeUsers.current, planLimits.activeUsers.limit) ||
    isMetricNearLimit(planLimits.contacts.current, planLimits.contacts.limit) ||
    isMetricNearLimit(planLimits.aiPredictions.current, planLimits.aiPredictions.limit) ||
    isMetricNearLimit(planLimits.storage.current, planLimits.storage.limit);

  return (
    <div className="space-y-8">
      {/* Plan context */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">
                insights
              </span>{' '}
              Usage Overview
            </CardTitle>
            <Badge variant="outline">{planName}</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Plan limits (with progress bars) */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          Plan Limits
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <LimitCard
            title="Active Users"
            icon="group"
            current={planLimits.activeUsers.current}
            limit={planLimits.activeUsers.limit}
          />
          <LimitCard
            title="Contacts"
            icon="contacts"
            current={planLimits.contacts.current}
            limit={planLimits.contacts.limit}
          />
          <LimitCard
            title="AI Predictions"
            icon="psychology"
            current={planLimits.aiPredictions.current}
            limit={planLimits.aiPredictions.limit}
          />
          <LimitCard
            title="Storage"
            icon="cloud"
            current={planLimits.storage.current}
            limit={planLimits.storage.limit}
            formatValue={formatStorageSize}
          />
        </div>
      </div>

      {/* Upgrade CTA */}
      {nearAnyLimit && (
        <Card className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="material-symbols-outlined text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              >
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
              </span>{' '}
              Upgrade Plan
            </Link>
          </CardContent>
        </Card>
      )}

      {/* CRM Data */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          CRM Data
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatCard title="Leads" icon="person_search" value={crm.leads} href="/leads" />
          <StatCard title="Contacts" icon="contacts" value={crm.contacts} href="/contacts" />
          <StatCard title="Accounts" icon="business" value={crm.accounts} href="/accounts" />
          <StatCard title="Deals" icon="handshake" value={crm.deals} href="/deals" />
          <StatCard title="Tasks" icon="task_alt" value={crm.tasks} href="/tasks" />
          <StatCard title="Tickets" icon="confirmation_number" value={crm.tickets} href="/tickets" />
          <StatCard title="Cases" icon="gavel" value={crm.cases} />
        </div>
      </div>

      {/* AI & Intelligence */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          AI & Intelligence
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard title="AI Scores (total)" icon="psychology" value={ai.scores} />
          <StatCard title="Scores This Month" icon="trending_up" value={ai.scoresThisPeriod} />
          <StatCard title="Conversations" icon="chat" value={ai.conversations} />
          <StatCard title="Messages" icon="forum" value={ai.messages} />
          <StatCard title="Tool Calls" icon="build" value={ai.toolCalls} />
          <StatCard title="AI Insights" icon="lightbulb" value={ai.insights} />
          <StatCard title="Lead Insights" icon="person_search" value={ai.leadInsights} />
          <StatCard title="Contact Insights" icon="contacts" value={ai.contactInsights} />
          <StatCard title="Output Reviews" icon="rate_review" value={ai.outputReviews} />
          <StatCard title="Monitoring Events" icon="monitoring" value={ai.monitoringEvents} />
          <StatCard title="Agent Actions" icon="smart_toy" value={ai.agentActions} />
          <StatCard title="Chain Versions" icon="account_tree" value={ai.chainVersions} />
          <StatCard title="Experiments" icon="science" value={ai.experiments} />
        </div>
      </div>

      {/* Activity & Content */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          Activity & Content
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Audit Logs" icon="history" value={activity.auditLogs} />
          <StatCard title="Notifications" icon="notifications" value={activity.notifications} />
          <StatCard title="Documents" icon="description" value={content.documents} />
          <StatCard
            title="Calendar Events"
            icon="calendar_month"
            value={content.calendarEvents}
            href="/calendar"
          />
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
        Usage data updates periodically. AI Predictions and activity counts reset monthly.
      </p>
    </div>
  );
}
