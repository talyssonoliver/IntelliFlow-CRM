'use client';

/**
 * Pipeline Analysis (owner 22/11: "This page sales reports and pipeline analysis is no ops yet,
 * why?"). The nav link used to open the Overview again (`/analytics?view=pipeline`, a parameter no
 * page read). The open pipeline is the Dashboard's own Pipeline Summary, so the two pages never
 * disagree; under it, where the period's leads came from and how many converted
 * (`analytics.getLeadMetrics`).
 */

import { useState } from 'react';
import { Card } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { HeroMenu } from '@/components/shared/hero-menu';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { WidgetHeader } from '@/components/dashboard/WidgetHeader';
import { PipelineSummaryWidget } from '@/components/dashboard/widgets/PipelineSummaryWidget';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAnalyticsDateRange, type PeriodKey } from '@/hooks/useAnalyticsDateRange';
import { PERIOD_ITEMS, ShareBar, useReportExport } from '../analytics-shared';

/** "NEEDS_ANALYSIS" -> "Needs analysis". */
function statusLabel(status: string): string {
  const words = status.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function PipelineAnalysisPage() {
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const dateRange = useAnalyticsDateRange(period);
  const enabled = isAuthenticated && !authLoading;
  const handleExport = useReportExport(dateRange);

  const leads = trpc.analytics.getLeadMetrics.useQuery(
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled }
  );
  const pending = authLoading || leads.isLoading;
  const failed = leads.isError && !leads.data;
  const m = leads.data;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Analytics', href: '/analytics' },
        ]}
        title="Pipeline Analysis"
        description="Your open pipeline, and where this period's leads came from"
        controls={
          <>
            <HeroMenu
              ariaLabel="Period"
              label="Period"
              icon="calendar_month"
              items={PERIOD_ITEMS}
              value={period}
              onSelect={(v) => setPeriod(v as PeriodKey)}
            />
            <HeroMenu
              label="Export"
              icon="download"
              variant="primary"
              heading="CSV export"
              items={[{ value: 'leads', label: 'Lead Metrics', icon: 'table_chart' }]}
              onSelect={() => handleExport('leads')}
            />
          </>
        }
      />

      <Card className="overflow-hidden border-border bg-card p-0">
        <PipelineSummaryWidget />
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <KpiCard
          framed
          label="New leads"
          icon="group"
          value={(m?.total ?? 0).toLocaleString('en-GB')}
          pending={pending}
          failed={failed}
          href="/leads"
        />
        <KpiCard
          framed
          label="Lead conversion"
          icon="conversion_path"
          value={`${m?.conversionRate ?? 0}%`}
          pending={pending}
          failed={failed}
          href="/leads"
          footer={
            <p className="text-xs text-muted-foreground">leads in the period that converted</p>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card p-6">
          <WidgetHeader title="Leads by source" className="mb-6" />
          <Breakdown
            pending={pending}
            rows={(m?.bySource ?? []).map((r) => ({
              key: r.source,
              label: r.name,
              count: r.count,
              percentage: r.percentage,
            }))}
          />
        </Card>
        <Card className="border-border bg-card p-6">
          <WidgetHeader title="Leads by status" className="mb-6" />
          <Breakdown
            pending={pending}
            rows={(m?.byStatus ?? []).map((r) => ({
              key: r.status,
              label: statusLabel(r.status),
              count: r.count,
              percentage: r.percentage,
            }))}
          />
        </Card>
      </div>
    </>
  );
}

function Breakdown({
  pending,
  rows,
}: Readonly<{
  pending: boolean;
  rows: { key: string; label: string; count: number; percentage: number }[];
}>) {
  if (pending) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No leads in this period.</p>;
  }
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <ShareBar key={r.key} label={r.label} count={r.count} percentage={r.percentage} />
      ))}
    </div>
  );
}
