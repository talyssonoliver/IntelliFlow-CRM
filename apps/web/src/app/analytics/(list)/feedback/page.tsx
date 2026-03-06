'use client';

/**
 * Feedback Analytics Page - IFC-068
 *
 * Dashboard showing NPS, CSAT, CES metrics with trend charts,
 * sentiment analysis, and export capabilities.
 */

import { Suspense, lazy, useState, useCallback } from 'react';
import { useFeedbackSurveyDashboard } from '@/lib/feedback-survey/hooks';
import type { FeedbackDashboardFilters } from '@/lib/feedback-survey/types';

const NpsGauge = lazy(() => import('@/components/feedback-analytics/NpsGauge'));
const NpsTrendChart = lazy(() => import('@/components/feedback-analytics/NpsTrendChart'));
const SentimentDistributionChart = lazy(
  () => import('@/components/feedback-analytics/SentimentDistributionChart')
);
const NpsBreakdownBar = lazy(() => import('@/components/feedback-analytics/NpsBreakdownBar'));

type PeriodKey = '7d' | '30d' | '90d' | 'ytd';
type SurveyTab = 'All' | 'NPS' | 'CSAT' | 'CES' | 'CUSTOM';

const PERIOD_MAP: Record<PeriodKey, () => Date> = {
  '7d': () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  },
  '30d': () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  },
  '90d': () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
  },
  ytd: () => new Date(new Date().getFullYear(), 0, 1),
};

function ChartSkeleton() {
  return <div className="h-64 animate-pulse rounded-lg border bg-muted" />;
}

export default function FeedbackAnalyticsPage() {
  const [period, setPeriod] = useState<PeriodKey>('90d');
  const [surveyTab, setSurveyTab] = useState<SurveyTab>('All');

  const filters: FeedbackDashboardFilters = {
    dateFrom: PERIOD_MAP[period](),
    dateTo: new Date(),
    surveyType: surveyTab === 'All' ? undefined : surveyTab,
    granularity: period === '7d' ? 'day' : period === '30d' ? 'week' : 'month',
  };

  const { data, isLoading } = useFeedbackSurveyDashboard(filters);

  const handleExportCSV = useCallback(() => {
    if (!data) return;
    // Dynamic import to avoid bundling export utils unnecessarily
    import('@/lib/export/csv').then(({ exportToCSV }) => {
      const rows = data.trends.map((t) => ({
        Period: t.period,
        NPS: t.nps ?? '',
        CSAT: t.csat ?? '',
        CES: t.ces ?? '',
        Responses: t.responseCount,
      }));
      exportToCSV(rows, { filename: `feedback-analytics-${period}.csv` });
    });
  }, [data, period]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Feedback Analytics</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Feedback Analytics</h1>
        <div className="flex h-64 items-center justify-center rounded-lg border bg-card p-6">
          <div className="text-center">
            <p className="text-lg font-medium text-muted-foreground">No responses yet</p>
            <p className="text-sm text-muted-foreground">
              Survey responses will appear here once customers start providing feedback.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Feedback Analytics</h1>
        <button
          onClick={handleExportCSV}
          className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Export CSV
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap gap-2">
        {(['7d', '30d', '90d', 'ytd'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              period === p ? 'bg-primary text-primary-foreground' : 'border bg-card hover:bg-accent'
            }`}
          >
            {p === 'ytd' ? 'YTD' : p}
          </button>
        ))}
      </div>

      {/* Survey Type Tabs */}
      <div className="flex flex-wrap gap-2">
        {(['All', 'NPS', 'CSAT', 'CES', 'CUSTOM'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSurveyTab(tab)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              surveyTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card hover:bg-accent'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Score Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.nps && (
          <Suspense fallback={<ChartSkeleton />}>
            <NpsGauge score={data.nps.score} distribution={data.nps.distribution} />
          </Suspense>
        )}
        {data.csat && (
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-6">
            <h3 className="text-sm font-medium text-muted-foreground">CSAT Score</h3>
            <div className="text-5xl font-bold text-blue-600">{data.csat.score}%</div>
            <div className="text-sm text-muted-foreground">
              {data.csat.totalResponses} responses
            </div>
          </div>
        )}
        {data.ces && (
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-6">
            <h3 className="text-sm font-medium text-muted-foreground">CES Score</h3>
            <div className="text-5xl font-bold text-purple-600">{data.ces.score}</div>
            <div className="text-sm text-muted-foreground">{data.ces.totalResponses} responses</div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<ChartSkeleton />}>
          <NpsTrendChart trends={data.trends} granularity={filters.granularity} />
        </Suspense>
        {data.sentiment && (
          <Suspense fallback={<ChartSkeleton />}>
            <SentimentDistributionChart sentiment={data.sentiment} />
          </Suspense>
        )}
      </div>

      {data.nps && (
        <Suspense fallback={<ChartSkeleton />}>
          <NpsBreakdownBar distribution={data.nps.distribution} />
        </Suspense>
      )}

      {/* Response Rates */}
      {data.responseRates.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">Response Rates</h3>
          <div className="space-y-3">
            {data.responseRates.map((rr) => (
              <div key={rr.type} className="flex items-center justify-between">
                <span className="text-sm font-medium">{rr.type}</span>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-32 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${rr.rate}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground">{rr.rate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
