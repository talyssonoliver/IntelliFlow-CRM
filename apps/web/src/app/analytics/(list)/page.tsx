'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, EmptyState } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { downloadCSV } from '@/lib/export/csv';
import { useAnalyticsDateRange, type PeriodKey } from '@/hooks/useAnalyticsDateRange';
import { refreshAnalyticsCache } from '@/app/analytics/actions';

export default function AnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('30d');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const dateRange = useAnalyticsDateRange(selectedPeriod);
  const enabled = isAuthenticated && !authLoading;

  // --- tRPC queries ---
  const { data: overview, isLoading: overviewLoading } = trpc.analytics.getOverview.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled }
  );

  const { data: funnel, isLoading: funnelLoading } = trpc.analytics.getConversionFunnel.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate, includeLeads: true },
    { enabled }
  );

  const { data: timeSeries, isLoading: timeSeriesLoading } =
    trpc.analytics.getTimeSeriesData.useQuery(
      {
        metric: 'revenue',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        granularity: selectedPeriod === '7d' ? 'day' : 'month',
      },
      { enabled }
    );

  const { data: leadStats } = trpc.analytics.leadStats.useQuery(undefined, { enabled });

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: Readonly<MouseEvent>) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const utils = trpc.useUtils();

  const handleServerExport = useCallback(
    async (reportType: 'overview' | 'funnel' | 'sales') => {
      setExportMenuOpen(false);
      try {
        const result = await utils.analytics.exportReport.fetch({
          format: 'csv',
          reportType,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        });
        if (result && typeof result.data === 'string') {
          downloadCSV(result.data, result.filename);
        }
      } catch {
        // Fallback: if server export not available, silently fail
      }
    },
    [dateRange, utils]
  );

  const handleRefreshAnalytics = useCallback(() => {
    if (user?.id) refreshAnalyticsCache(user.id).catch(() => {});
  }, [user]);

  const isLoading = overviewLoading || authLoading;

  return (
    <>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/dashboard" className="hover:text-primary">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Analytics</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            Analytics
          </h1>
          <p className="text-muted-foreground text-base">
            AI-powered insights and sales pipeline analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as PeriodKey)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="ytd">Year to date</option>
          </select>

          {/* Analytics cache refresh */}
          <button
            onClick={handleRefreshAnalytics}
            className="inline-flex items-center gap-2 border border-border hover:bg-muted text-foreground font-medium py-2.5 px-4 rounded-lg transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label="Refresh analytics data"
          >
            <span className="material-symbols-outlined text-lg">refresh</span> Refresh
          </button>

          {/* Export Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 group"
            >
              <span className="material-symbols-outlined text-lg transition-transform group-hover:scale-110">
                download
              </span>{' '}
              Export
              <span
                className={`material-symbols-outlined text-sm transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`}
              >
                expand_more
              </span>
            </button>

            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden">
                <div className="py-1">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                    CSV Export
                  </div>
                  <button
                    onClick={() => handleServerExport('overview')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-muted-foreground">
                      table_chart
                    </span>{' '}
                    Overview Metrics
                  </button>
                  <button
                    onClick={() => handleServerExport('funnel')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-muted-foreground">
                      waterfall_chart
                    </span>{' '}
                    Pipeline Funnel
                  </button>
                  <button
                    onClick={() => handleServerExport('sales')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-muted-foreground">
                      download
                    </span>{' '}
                    Sales Metrics
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {isLoading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard
              title="Total Leads"
              value={overview?.totalLeads ?? 0}
              delta={overview?.leadDelta ?? 0}
              icon="people"
              formatValue={String}
              badge={leadStats ? `${leadStats.newThisMonth} new this month` : undefined}
            />
            <MetricCard
              title="Revenue"
              value={overview?.totalRevenue ?? 0}
              delta={overview?.revenueDelta ?? 0}
              icon="attach_money"
              formatValue={formatCurrency}
            />
            <MetricCard
              title="Open Opportunities"
              value={overview?.openOpportunities ?? 0}
              delta={overview?.openOpportunitiesDelta ?? 0}
              icon="handshake"
              formatValue={String}
            />
            <MetricCard
              title="Win Rate"
              value={overview?.winRate ?? 0}
              delta={overview?.winRateDelta ?? 0}
              icon="emoji_events"
              formatValue={(v) => `${v}%`}
              suffix="pp"
            />
          </>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        {/* Pipeline Funnel */}
        <Card className="lg:col-span-2 p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Pipeline Funnel</h2>
            {funnel && (
              <span className="text-sm text-muted-foreground">
                {funnel.overallConversionRate}% overall conversion
              </span>
            )}
          </div>

          <PipelineFunnelContent loading={funnelLoading} funnel={funnel} />
        </Card>

        {/* Lead Stats + Quick Info */}
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Lead Overview</h2>
          </div>
          {overview ? (
            <div className="space-y-4">
              <QuickStat
                label="New Contacts"
                value={overview.newContacts}
                delta={overview.newContactsDelta}
              />
              <QuickStat
                label="Win Rate"
                value={`${overview.winRate}%`}
                delta={overview.winRateDelta}
                suffix="pp"
              />
              {leadStats && (
                <>
                  <QuickStat label="Total Leads (all time)" value={leadStats.total} />
                  <QuickStat label="New This Month" value={leadStats.newThisMonth} />
                </>
              )}
              {funnel && <QuickStat label="Total Leads (period)" value={funnel.totalLeads} />}
            </div>
          ) : (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-10 bg-muted rounded" />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Trend Chart */}
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Revenue Trend</h2>
          </div>
          <RevenueTrendContent loading={timeSeriesLoading} timeSeries={timeSeries} />
        </Card>

        {/* Recent Activity */}
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
          </div>

          <RecentActivityContent loading={overviewLoading} overview={overview} />
        </Card>
      </div>
    </>
  );
}

// --- Constants ---

const STAGE_COLORS: Record<string, string> = {
  PROSPECTING: 'bg-blue-400',
  QUALIFICATION: 'bg-primary',
  NEEDS_ANALYSIS: 'bg-indigo-500',
  PROPOSAL: 'bg-violet-500',
  NEGOTIATION: 'bg-warning',
  CLOSED_WON: 'bg-success',
};

// --- Helpers ---

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toLocaleString('en-GB')}`;
}

function formatRelativeTime(date: Date | string, timezone: string = 'Europe/London'): string {
  const now = new Date();
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: timezone });
}

// --- Sub-components ---

function MetricCard({
  title,
  value,
  delta,
  icon,
  formatValue,
  suffix,
  badge,
}: Readonly<{
  title: string;
  value: number;
  delta: number;
  icon: string;
  formatValue: (v: number) => string;
  suffix?: string;
  badge?: string;
}>) {
  const isPositive = delta >= 0;

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary">{icon}</span>
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground mb-1">{formatValue(value)}</p>
      <div className="flex items-center gap-1">
        <span
          className={`inline-flex items-center text-sm font-medium ${
            isPositive ? 'text-success' : 'text-destructive'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {isPositive ? 'trending_up' : 'trending_down'}
          </span>{' '}
          {isPositive ? '+' : ''}
          {delta}
          {suffix ? ` ${suffix}` : ''}
        </span>
        <span className="text-sm text-muted-foreground">vs prev period</span>
      </div>
      {badge && <p className="text-xs text-muted-foreground mt-1">{badge}</p>}
    </Card>
  );
}

function MetricCardSkeleton() {
  return (
    <Card className="p-6 bg-card border-border animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="w-10 h-10 rounded-lg bg-muted" />
      </div>
      <div className="h-8 w-20 bg-muted rounded mb-1" />
      <div className="h-4 w-32 bg-muted rounded" />
    </Card>
  );
}

function PipelineStageBar({
  name,
  value,
  deals,
  percentage,
  color,
}: Readonly<{
  name: string;
  value: string;
  deals: number;
  percentage: number;
  color: string;
}>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">{name}</span>
        <span className="text-sm text-muted-foreground">
          {value} ({deals} {deals === 1 ? 'Deal' : 'Deals'})
        </span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function ActivityItem({
  icon,
  actorName,
  description,
  createdAt,
}: Readonly<{
  icon: string;
  actorName: string | null;
  description: string;
  createdAt: Date | string;
}>) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-sm text-primary">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          {actorName && <span className="font-medium">{actorName} — </span>}
          {description}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(createdAt)}</p>
      </div>
    </div>
  );
}

function QuickStat({
  label,
  value,
  delta,
  suffix,
}: Readonly<{
  label: string;
  value: string | number;
  delta?: number;
  suffix?: string;
}>) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{value}</span>
        {delta !== undefined && (
          <span
            className={`text-xs font-medium ${delta >= 0 ? 'text-success' : 'text-destructive'}`}
          >
            {delta >= 0 ? '+' : ''}
            {delta}
            {suffix ? ` ${suffix}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

interface FunnelStage {
  stage: string;
  label: string;
  value: number;
  count: number;
}

interface FunnelData {
  overallConversionRate: number;
  totalLeads: number;
  stages: FunnelStage[];
}

function PipelineFunnelContent({
  loading,
  funnel,
}: Readonly<{ loading: boolean; funnel: FunnelData | undefined | null }>) {
  if (loading)
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 w-32 bg-muted rounded mb-2" />
            <div className="h-2 bg-muted rounded-full" />
          </div>
        ))}
      </div>
    );
  if (funnel && funnel.stages.length > 0) {
    const totalValue = funnel.stages.reduce((sum, s) => sum + s.value, 0);
    return (
      <div className="space-y-4">
        {funnel.stages
          .filter((s) => s.stage !== 'CLOSED_LOST')
          .map((stage) => {
            const percentage = totalValue > 0 ? Math.round((stage.value / totalValue) * 100) : 0;
            return (
              <PipelineStageBar
                key={stage.stage}
                name={stage.label}
                value={formatCurrency(stage.value)}
                deals={stage.count}
                percentage={percentage}
                color={STAGE_COLORS[stage.stage] || 'bg-primary/60'}
              />
            );
          })}
      </div>
    );
  }
  return (
    <EmptyState entity="activity" phase="passive" description="No pipeline data for this period" />
  );
}

interface TimeSeriesEntry {
  periodLabel: string;
  value: number;
}

function RevenueTrendContent({
  loading,
  timeSeries,
}: Readonly<{ loading: boolean; timeSeries: TimeSeriesEntry[] | undefined | null }>) {
  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  if (timeSeries && timeSeries.length > 0)
    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={timeSeries} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis
              dataKey="periodLabel"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value) => {
                const numValue = typeof value === 'number' ? value : 0;
                return formatCurrency(numValue);
              }}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
                color: 'hsl(var(--foreground))',
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} className="fill-primary" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  return (
    <EmptyState entity="activity" phase="passive" description="No revenue data for this period" />
  );
}

interface RecentActivityItem {
  id: string;
  icon: string;
  actorName: string | null;
  description: string;
  createdAt: string;
}

interface OverviewForActivity {
  recentActivity: RecentActivityItem[];
}

function RecentActivityContent({
  loading,
  overview,
}: Readonly<{ loading: boolean; overview: OverviewForActivity | undefined | null }>) {
  if (loading)
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse flex gap-3">
            <div className="w-2 h-2 rounded-full bg-muted mt-2" />
            <div className="flex-1">
              <div className="h-4 w-3/4 bg-muted rounded mb-1" />
              <div className="h-3 w-1/3 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  if (overview && overview.recentActivity.length > 0)
    return (
      <div className="space-y-4">
        {overview.recentActivity.map((activity) => (
          <ActivityItem
            key={activity.id}
            icon={activity.icon}
            actorName={activity.actorName}
            description={activity.description}
            createdAt={activity.createdAt}
          />
        ))}
      </div>
    );
  return <EmptyState entity="activity" phase="passive" description="No recent activity" />;
}
