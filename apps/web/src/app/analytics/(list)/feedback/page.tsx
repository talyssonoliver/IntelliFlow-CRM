'use client';

/**
 * Feedback Analytics Page - IFC-068
 *
 * Dashboard showing NPS, CSAT, CES metrics with trend charts,
 * sentiment analysis, and export capabilities.
 */

import { Suspense, lazy, useState, useCallback } from 'react';
import { EmptyState } from '@intelliflow/ui';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import { SendSurveyDialog } from '@/components/feedback-analytics/SendSurveyDialog';
import { AutoSurveySettings } from '@/components/feedback-analytics/AutoSurveySettings';
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
    d.setUTCDate(d.getUTCDate() - 7);
    return d;
  },
  '30d': () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d;
  },
  '90d': () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 90);
    return d;
  },
  ytd: () => new Date(new Date().getFullYear(), 0, 1),
};

const PERIOD_LABELS: Record<PeriodKey, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
};

function ChartSkeleton() {
  return <div className="h-64 animate-pulse rounded-lg border bg-muted" />;
}

export default function FeedbackAnalyticsPage() {
  const [period, setPeriod] = useState<PeriodKey>('90d');
  const [surveyTab, setSurveyTab] = useState<SurveyTab>('All');
  const [sendOpen, setSendOpen] = useState(false);

  const filters: FeedbackDashboardFilters = {
    dateFrom: PERIOD_MAP[period](),
    dateTo: new Date(),
    surveyType: surveyTab === 'All' ? undefined : surveyTab,
    granularity: (() => {
      if (period === '7d') return 'day';
      if (period === '30d') return 'week';
      return 'month';
    })() as 'day' | 'week' | 'month',
  };

  const { data, isLoading } = useFeedbackSurveyDashboard(filters);

  const handleExportCSV = useCallback(() => {
    if (!data) return;
    // Dynamic import to avoid bundling export utils unnecessarily
    import('@/lib/export/csv')
      .then(({ exportToCSV }) => {
        const rows = data.trends.map((t) => ({
          Period: t.period,
          NPS: t.nps ?? '',
          CSAT: t.csat ?? '',
          CES: t.ces ?? '',
          Responses: t.responseCount,
        }));
        exportToCSV(rows, { filename: `feedback-analytics-${period}.csv` });
      })
      .catch((error) => {
        console.error('Failed to export feedback analytics CSV:', error);
      });
  }, [data, period]);

  const actions: PageAction[] = [
    { label: 'Send a survey', icon: 'send', variant: 'primary', onClick: () => setSendOpen(true) },
    {
      label: 'Export CSV',
      icon: 'download',
      variant: 'secondary',
      onClick: handleExportCSV,
      disabled: !data?.hasData,
    },
  ];

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Analytics', href: '/analytics' },
      ]}
      title="Feedback Analytics"
      description="NPS, CSAT and customer comments from the surveys you send."
      actions={actions}
    >
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-white/80">
        <span className="sr-only sm:not-sr-only">Period</span>
        <select
          aria-label="Period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white"
        >
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
            <option key={p} value={p} className="text-foreground">
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
    </PageHeader>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <ChartSkeleton />
        <SendSurveyDialog open={sendOpen} onOpenChange={setSendOpen} />
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          entity="insights"
          title="No survey responses yet"
          description="Send a short NPS or CSAT question to a customer. Their answers fill this page."
          ctaLabel="Send a survey"
          onCtaClick={() => setSendOpen(true)}
        />
        <AutoSurveySettings />
        <SendSurveyDialog open={sendOpen} onOpenChange={setSendOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

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

      <AutoSurveySettings />
      <SendSurveyDialog open={sendOpen} onOpenChange={setSendOpen} />
    </div>
  );
}
