'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import {
  DASHBOARD_REFETCH_INTERVAL_MS,
  computePipelineStagePercent,
  formatGBP,
} from '@/lib/dashboard/kpi-calculator';
import { hasOpenDeals, leadCountLabel, leadFunnelRows } from '@/lib/dashboard/pipeline-summary';
import { ChartUnavailable } from '@/components/shared/ChartEmptyState';
import type { WidgetProps } from './index';

const STAGE_COLORS: Record<string, string> = {
  QUALIFICATION: 'bg-stage-qualification',
  PROPOSAL: 'bg-stage-proposal',
  NEGOTIATION: 'bg-stage-negotiation',
  CLOSED_WON: 'bg-stage-won',
  DISCOVERY: 'bg-blue-400',
  DEMO: 'bg-indigo-400',
};

interface PipelineStage {
  stageKey: string;
  displayName: string;
  count: number;
  totalValue: number | string;
}

function Bar({ percent, color }: Readonly<{ percent: number; color: string }>) {
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full motion-safe:transition-all`}
        // Floor only non-zero shares so truly-empty rows show no bar (no phantom 2% sliver).
        style={{ width: percent > 0 ? `${Math.min(Math.max(percent, 2), 100)}%` : '0%' }}
      />
    </div>
  );
}

function Row({
  label,
  detail,
  percent,
  color,
}: Readonly<{ label: string; detail: string; percent: number; color: string }>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{detail}</span>
      </div>
      <Bar percent={percent} color={color} />
    </div>
  );
}

function Footer({
  summary,
  href,
  action,
}: Readonly<{ summary: string; href: string; action: string }>) {
  return (
    <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{summary}</span>
      <Link
        href={href}
        className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
      >
        {action}
      </Link>
    </div>
  );
}

function DealStages({ stages }: Readonly<{ stages: PipelineStage[] }>) {
  // Denominator = sum of the DISPLAYED (open) stages, not the API's `totalPipelineValue`,
  // which includes closed-won/lost and would understate every open-stage share.
  const displayedTotal = stages.reduce((sum, s) => sum + Number(s.totalValue), 0);
  const dealCount = stages.reduce((sum, s) => sum + s.count, 0);
  return (
    <>
      <div className="flex-1 flex flex-col justify-between gap-4">
        {stages.map((stage) => (
          <Row
            key={stage.stageKey}
            label={stage.displayName}
            detail={`${formatGBP(stage.totalValue)} (${stage.count} Deals)`}
            percent={computePipelineStagePercent(stage.totalValue, displayedTotal)}
            color={STAGE_COLORS[stage.stageKey] || 'bg-primary'}
          />
        ))}
      </div>
      <Footer
        summary={`${formatGBP(displayedTotal)} open across ${dealCount} ${dealCount === 1 ? 'deal' : 'deals'}`}
        href="/deals?view=pipeline"
        action="Open the board"
      />
    </>
  );
}

function LeadFunnel({ byStatus }: Readonly<{ byStatus: Record<string, number> | undefined }>) {
  const rows = leadFunnelRows(byStatus);
  const qualified = rows.find((r) => r.status === 'QUALIFIED')?.count ?? 0;
  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        No open deals yet. Your leads by stage, until the first one converts:
      </p>
      <div className="flex-1 flex flex-col justify-between gap-4">
        {rows.map((row) => (
          <Row
            key={row.status}
            label={row.label}
            detail={leadCountLabel(row.count)}
            percent={row.percent}
            color="bg-primary"
          />
        ))}
      </div>
      <Footer
        summary={
          qualified > 0
            ? `${leadCountLabel(qualified)} qualified, ready to convert to a deal`
            : 'Qualify a lead to convert it to a deal'
        }
        href="/leads"
        action="Go to leads"
      />
    </>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-4 flex-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="flex items-center justify-between mb-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded" />
          </div>
          <div className="w-full h-2 bg-muted rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PipelineSummaryWidget(_props: Readonly<WidgetProps>) {
  const {
    data,
    isLoading,
    isError: requestFailed,
    refetch,
  } = trpc.opportunity.getPipeline.useQuery(
    { includeClosedStages: false },
    { refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS }
  );
  const { data: leadStats, isLoading: leadsLoading } = trpc.lead.stats.useQuery(undefined, {
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  // A failed background refresh keeps the figures already loaded (React Query keeps
  // `data`); "Couldn't load" is only for a request that never produced any.
  const isError = requestFailed && !data;
  const stages = (data?.stages ?? []) as PipelineStage[];
  const showDeals = hasOpenDeals(stages);

  let body: React.ReactNode;
  if (isError) {
    body = (
      <ChartUnavailable message="Couldn't load the pipeline." onRetry={() => void refetch()} />
    );
  } else if (isLoading || (!showDeals && leadsLoading)) {
    body = <LoadingRows />;
  } else if (showDeals) {
    body = <DealStages stages={stages} />;
  } else {
    body = <LeadFunnel byStatus={leadStats?.byStatus} />;
  }

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h3 className="text-lg font-semibold text-foreground">Pipeline Summary</h3>
        {/* #1225 UI-012: was an options button with no handler; it now opens the board. */}
        <Link
          href="/deals?view=pipeline"
          aria-label="Open the pipeline board"
          title="Open the pipeline board"
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            open_in_new
          </span>
        </Link>
      </div>
      {body}
    </div>
  );
}
