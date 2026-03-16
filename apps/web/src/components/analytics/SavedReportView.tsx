'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card, MetricCard, EmptyState } from '@intelliflow/ui';
import type { MetricChange } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAnalyticsDateRange, type PeriodKey } from '@/hooks/useAnalyticsDateRange';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { downloadCSV } from '@/lib/export/csv';
import { exportToPDF } from '@/lib/export/pdf';
import type { ReportSection, PDFExportOptions } from '@/lib/export/pdf';

// ============================================
// Types
// ============================================

export interface SavedReportConfig {
  reportType: 'weekly' | 'monthly' | 'quarterly';
  defaultPeriod: PeriodKey;
  title: string;
  description: string;
  breadcrumbLabel: string;
}

export interface SavedReportViewProps {
  config: SavedReportConfig;
}

// ============================================
// Constants
// ============================================

const PERIOD_OPTIONS: Record<SavedReportConfig['reportType'], { value: PeriodKey; label: string }[]> = {
  weekly: [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
  ],
  monthly: [
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
  ],
  quarterly: [
    { value: '90d', label: 'Last 90 days' },
    { value: 'ytd', label: 'Year to date' },
  ],
};

const EXPORT_TYPE_MAP: Record<SavedReportConfig['reportType'], 'overview' | 'sales' | 'timeseries'> = {
  weekly: 'overview',
  monthly: 'sales',
  quarterly: 'timeseries',
};

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
];

// ============================================
// Helpers
// ============================================

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toLocaleString('en-US')}`;
}

function toMetricChange(delta: number, label = 'vs prev period'): MetricChange {
  return {
    value: Math.abs(delta),
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral',
    label,
  };
}

// ============================================
// Component
// ============================================

export default function SavedReportView({ config }: Readonly<SavedReportViewProps>) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>(config.defaultPeriod);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const dateRange = useAnalyticsDateRange(selectedPeriod);
  const { formatDate } = useTimezoneContext();
  const enabled = isAuthenticated && !authLoading;

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

  // --- tRPC queries ---
  const { data: overview, isLoading: overviewLoading } = trpc.analytics.getOverview.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled },
  );

  const { data: timeSeries, isLoading: timeSeriesLoading } =
    trpc.analytics.getTimeSeriesData.useQuery(
      {
        metric: 'revenue',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        granularity: config.reportType === 'weekly' ? 'day' : 'week',
      },
      { enabled: enabled && (config.reportType === 'weekly' || config.reportType === 'monthly') },
    );

  const { data: salesMetrics } = trpc.analytics.getSalesMetrics.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: enabled && (config.reportType === 'monthly' || config.reportType === 'quarterly') },
  );

  const { data: _funnel } = trpc.analytics.getConversionFunnel.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate, includeLeads: true },
    { enabled: enabled && (config.reportType === 'weekly' || config.reportType === 'quarterly') },
  );

  const { data: growthData, isLoading: growthLoading } = trpc.analytics.growthTrends.useQuery(
    { metric: 'revenue', months: 12 },
    { enabled: enabled && config.reportType === 'quarterly' },
  );

  const { data: trafficSources } = trpc.analytics.trafficSources.useQuery(undefined, {
    enabled: enabled && config.reportType === 'monthly',
  });

  const utils = trpc.useUtils();

  // --- Export handlers ---
  const handleCSVExport = useCallback(async () => {
    setExportMenuOpen(false);
    try {
      const result = await utils.analytics.exportReport.fetch({
        format: 'csv',
        reportType: EXPORT_TYPE_MAP[config.reportType],
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      if (result && typeof result.data === 'string') {
        downloadCSV(result.data, result.filename);
      }
    } catch {
      // Silent fallback if export unavailable
    }
  }, [config.reportType, dateRange, utils]);

  const handlePDFExport = useCallback(() => {
    setExportMenuOpen(false);
    const sections: ReportSection[] = [];

    if (overview) {
      sections.push({
        title: 'Key Metrics',
        type: 'metrics',
        data: getMetricsForExport(config.reportType, overview, salesMetrics),
      });
    }

    if (config.reportType === 'monthly' && trafficSources) {
      sections.push({
        title: 'Lead Sources',
        type: 'table',
        data: trafficSources.map((s) => ({
          Source: s.name,
          Percentage: `${s.percentage}%`,
        })),
      });
    }

    if (config.reportType === 'quarterly' && growthData) {
      sections.push({
        title: 'Growth Trend',
        type: 'table',
        data: growthData.map((p) => ({
          Month: p.month,
          Revenue: formatCurrency(p.value),
        })),
      });
    }

    const options: PDFExportOptions = {
      title: `${config.title} Report`,
      subtitle: `Period: ${selectedPeriod}`,
    };

    exportToPDF(sections, options);
  }, [config, overview, salesMetrics, trafficSources, growthData, selectedPeriod]);

  // --- Metric cards per report type ---
  const metricCards = getMetricCards(config.reportType, overview, salesMetrics);
  const isLoading = overviewLoading || authLoading;
  const hasNoData = !isLoading && !overview;
  const chartLoading = config.reportType === 'quarterly' ? growthLoading : timeSeriesLoading;

  return (
    <>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/dashboard" className="hover:text-primary">
          Dashboard
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/analytics" className="hover:text-primary">
          Analytics
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium" aria-current="page">
          {config.breadcrumbLabel}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
            {config.title}
          </h1>
          <p className="text-muted-foreground text-base">{config.description}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as PeriodKey)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Select time period"
          >
            {PERIOD_OPTIONS[config.reportType].map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Export Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 group"
            >
              <span className="material-symbols-outlined text-lg transition-transform group-hover:scale-110" aria-hidden="true">
                download
              </span>
              Export
              <span
                className={`material-symbols-outlined text-sm transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>

            {exportMenuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden">
                <div className="py-1">
                  <button
                    role="menuitem"
                    onClick={handleCSVExport}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-muted-foreground" aria-hidden="true">
                      table_chart
                    </span>
                    Export CSV
                  </button>
                  <button
                    role="menuitem"
                    onClick={handlePDFExport}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg text-muted-foreground" aria-hidden="true">
                      picture_as_pdf
                    </span>
                    Export PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <section aria-label="Key Metrics" className="mb-6">
        {hasNoData ? (
          <EmptyState
            icon="bar_chart"
            title="No data available"
            description={`No analytics data found for the selected ${selectedPeriod} period.`}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {metricCards.map((mc) => (
              <MetricCard
                key={mc.title}
                title={mc.title}
                value={mc.value}
                format={mc.format}
                icon={mc.icon}
                change={mc.change}
                isLoading={isLoading}
              />
            ))}
          </div>
        )}
      </section>

      {/* Charts */}
      <section aria-label="Charts" className="grid gap-6 lg:grid-cols-2">
        {config.reportType === 'weekly' && (
          <Card className="p-6 bg-card border-border lg:col-span-2">
            <h2 className="text-lg font-semibold text-foreground mb-4">Daily Revenue</h2>
            <RevenueBarChart data={timeSeries} loading={chartLoading} formatDate={formatDate} />
          </Card>
        )}

        {config.reportType === 'monthly' && (
          <>
            <Card className="p-6 bg-card border-border">
              <h2 className="text-lg font-semibold text-foreground mb-4">Weekly Revenue Trend</h2>
              <RevenueBarChart data={timeSeries} loading={chartLoading} formatDate={formatDate} />
            </Card>
            <Card className="p-6 bg-card border-border">
              <h2 className="text-lg font-semibold text-foreground mb-4">Lead Sources</h2>
              <LeadSourceChart data={trafficSources} loading={!trafficSources && enabled} />
            </Card>
          </>
        )}

        {config.reportType === 'quarterly' && (
          <Card className="p-6 bg-card border-border lg:col-span-2">
            <h2 className="text-lg font-semibold text-foreground mb-4">12-Month Revenue Trend</h2>
            <GrowthTrendChart data={growthData} loading={chartLoading} formatDate={formatDate} />
          </Card>
        )}
      </section>
    </>
  );
}

// ============================================
// Metric Card Configurations
// ============================================

interface MetricCardConfig {
  title: string;
  value: string | number;
  format?: 'number' | 'currency' | 'percentage' | 'compact';
  icon: string;
  change?: MetricChange;
}

function getMetricCards(
  reportType: SavedReportConfig['reportType'],
  overview: { totalLeads: number; leadDelta: number; totalRevenue: number; revenueDelta: number; openOpportunities: number; openOpportunitiesDelta: number; winRate: number; winRateDelta: number } | undefined | null,
  salesMetrics: { pipelineValue: number; winRate: number; avgDealSize: number; totalRevenue: number } | undefined | null,
): MetricCardConfig[] {
  if (!overview) {
    return reportType === 'weekly'
      ? [
          { title: 'Revenue', value: 0, format: 'currency', icon: 'attach_money' },
          { title: 'Leads', value: 0, format: 'number', icon: 'people' },
          { title: 'Open Opportunities', value: 0, format: 'number', icon: 'handshake' },
          { title: 'Win Rate', value: 0, format: 'percentage', icon: 'emoji_events' },
        ]
      : reportType === 'monthly'
        ? [
            { title: 'Total Revenue', value: 0, format: 'currency', icon: 'attach_money' },
            { title: 'Pipeline Value', value: 0, format: 'currency', icon: 'trending_up' },
            { title: 'Win Rate', value: 0, format: 'percentage', icon: 'emoji_events' },
            { title: 'Avg Deal Size', value: 0, format: 'currency', icon: 'paid' },
          ]
        : [
            { title: 'Revenue', value: 0, format: 'currency', icon: 'attach_money' },
            { title: 'Win Rate', value: 0, format: 'percentage', icon: 'emoji_events' },
            { title: 'Pipeline Value', value: 0, format: 'currency', icon: 'trending_up' },
            { title: 'Deals Closed', value: 0, format: 'number', icon: 'handshake' },
          ];
  }

  switch (reportType) {
    case 'weekly':
      return [
        { title: 'Revenue', value: overview.totalRevenue, format: 'currency', icon: 'attach_money', change: toMetricChange(overview.revenueDelta) },
        { title: 'Leads', value: overview.totalLeads, format: 'number', icon: 'people', change: toMetricChange(overview.leadDelta) },
        { title: 'Open Opportunities', value: overview.openOpportunities, format: 'number', icon: 'handshake', change: toMetricChange(overview.openOpportunitiesDelta) },
        { title: 'Win Rate', value: overview.winRate, format: 'percentage', icon: 'emoji_events', change: toMetricChange(overview.winRateDelta, 'pp vs prev period') },
      ];
    case 'monthly':
      return [
        { title: 'Total Revenue', value: salesMetrics?.totalRevenue ?? overview.totalRevenue, format: 'currency', icon: 'attach_money', change: toMetricChange(overview.revenueDelta) },
        { title: 'Pipeline Value', value: salesMetrics?.pipelineValue ?? 0, format: 'currency', icon: 'trending_up' },
        { title: 'Win Rate', value: salesMetrics?.winRate ?? overview.winRate, format: 'percentage', icon: 'emoji_events', change: toMetricChange(overview.winRateDelta, 'pp vs prev period') },
        { title: 'Avg Deal Size', value: salesMetrics?.avgDealSize ?? 0, format: 'currency', icon: 'paid' },
      ];
    case 'quarterly':
      return [
        { title: 'Revenue', value: salesMetrics?.totalRevenue ?? overview.totalRevenue, format: 'currency', icon: 'attach_money', change: toMetricChange(overview.revenueDelta) },
        { title: 'Win Rate', value: salesMetrics?.winRate ?? overview.winRate, format: 'percentage', icon: 'emoji_events', change: toMetricChange(overview.winRateDelta, 'pp vs prev period') },
        { title: 'Pipeline Value', value: salesMetrics?.pipelineValue ?? 0, format: 'currency', icon: 'trending_up' },
        { title: 'Deals Closed', value: (salesMetrics as Record<string, unknown>)?.closedWonCount as number ?? 0, format: 'number', icon: 'handshake' },
      ];
  }
}

function getMetricsForExport(
  reportType: SavedReportConfig['reportType'],
  overview: Record<string, unknown>,
  salesMetrics?: Record<string, unknown> | null,
): Array<{ name: string; value: string | number; trend?: string }> {
  const cards = getMetricCards(
    reportType,
    overview as Parameters<typeof getMetricCards>[1],
    salesMetrics as Parameters<typeof getMetricCards>[2],
  );
  return cards.map((c) => ({
    name: c.title,
    value: c.value,
    trend: c.change ? `${c.change.direction === 'up' ? '+' : c.change.direction === 'down' ? '-' : ''}${c.change.value}%` : undefined,
  }));
}

// ============================================
// Chart Sub-components
// ============================================

interface TimeSeriesPoint {
  period: string;
  periodLabel: string;
  value: number;
}

function RevenueBarChart({
  data,
  loading,
  formatDate: _formatDate,
}: Readonly<{
  data: TimeSeriesPoint[] | undefined | null;
  loading: boolean;
  formatDate: (input: string | Date | number, options?: Record<string, unknown>) => string;
}>) {
  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon="bar_chart"
        title="No revenue data"
        description="No revenue data available for this period."
      />
    );
  }
  return (
    <div className="h-64" role="img" aria-label="Revenue bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="periodLabel" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)}
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
}

function GrowthTrendChart({
  data,
  loading,
  formatDate: _formatDate,
}: Readonly<{
  data: Array<{ month: string; value: number; yoyChange?: number }> | undefined | null;
  loading: boolean;
  formatDate: (input: string | Date | number, options?: Record<string, unknown>) => string;
}>) {
  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon="show_chart"
        title="No growth data"
        description="No growth trend data available."
      />
    );
  }
  return (
    <div className="h-64" role="img" aria-label="12-month revenue trend line chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              color: 'hsl(var(--foreground))',
            }}
          />
          <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LeadSourceChart({
  data,
  loading,
}: Readonly<{
  data: Array<{ name: string; percentage: number; color: string }> | undefined | null;
  loading: boolean;
}>) {
  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon="pie_chart"
        title="No source data"
        description="No lead source data available."
      />
    );
  }
  return (
    <div className="h-64" role="img" aria-label="Lead source distribution chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="percentage" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}%`}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              color: 'hsl(var(--foreground))',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
