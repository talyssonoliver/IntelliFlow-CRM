'use client';

import Link from 'next/link';
import { EmptyState } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import {
  DASHBOARD_REFETCH_INTERVAL_MS,
  computePipelineStagePercent,
  formatGBP,
} from '@/lib/dashboard/kpi-calculator';
import {
  hasOpenDeals,
  leadCountLabel,
  leadFunnel,
  type LeadStatsLike,
} from '@/lib/dashboard/pipeline-summary';
import { ChartUnavailable } from '@/components/shared/ChartEmptyState';
import type { WidgetProps } from './index';

const STAGE_COLORS: Record<string, string> = {
  QUALIFICATION: 'bg-stage-qualification',
  NEEDS_ANALYSIS: 'bg-stage-needs-analysis',
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

function SectionHeading({ title, detail }: Readonly<{ title: string; detail?: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

function SectionRows({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex-1 flex flex-col justify-between gap-3">{children}</div>;
}

function LoadingRows({ count }: Readonly<{ count: number }>) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
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

interface PartState {
  loading: boolean;
  failed: boolean;
  retry: () => void;
}

/** Where the workspace's leads stand; adds up to the Total Leads card. */
function LeadsSection({
  stats,
  state,
}: Readonly<{ stats: LeadStatsLike | undefined; state: PartState }>) {
  if (state.failed) {
    // Never draw a funnel of made-up zeros when the counts did not load.
    return (
      <section aria-label="Leads" className="flex flex-col">
        <SectionHeading title="Leads" />
        <ChartUnavailable message="Couldn't load your leads." onRetry={state.retry} />
      </section>
    );
  }
  if (state.loading) {
    return (
      <section aria-label="Leads" className="flex flex-col">
        <SectionHeading title="Leads" />
        <LoadingRows count={5} />
      </section>
    );
  }
  const { rows, other, total } = leadFunnel(stats);
  return (
    <section aria-label="Leads" className="flex flex-col">
      <SectionHeading title="Leads" detail={leadCountLabel(total)} />
      <SectionRows>
        {[...rows, ...(other ? [other] : [])].map((row) => (
          <Row
            key={row.status}
            label={row.label}
            detail={leadCountLabel(row.count)}
            percent={row.percent}
            color={row.status === 'OTHER' ? 'bg-muted-foreground/40' : 'bg-primary'}
          />
        ))}
      </SectionRows>
    </section>
  );
}

/** The workspace's open deals by stage, as they are created. */
function DealsSection({ stages, state }: Readonly<{ stages: PipelineStage[]; state: PartState }>) {
  if (state.failed) {
    return (
      <section aria-label="Deals" className="flex flex-col">
        <SectionHeading title="Deals" />
        <ChartUnavailable message="Couldn't load the pipeline." onRetry={state.retry} />
      </section>
    );
  }
  if (state.loading) {
    return (
      <section aria-label="Deals" className="flex flex-col">
        <SectionHeading title="Deals" />
        <LoadingRows count={3} />
      </section>
    );
  }
  if (!hasOpenDeals(stages)) {
    return (
      <section aria-label="Deals" className="flex flex-col">
        <SectionHeading title="Deals" />
        {/* Read-only here: the create action is on the leads (convert a qualified lead). */}
        {/* This part counts open deals only, so it never says "No deals yet" to a workspace that
            has won some: its title and text say "open". */}
        <EmptyState
          entity="deals"
          showCta={false}
          title="No open deals"
          description="Deals appear here, by stage, as you convert leads."
          className="flex-1 justify-center py-2"
        />
      </section>
    );
  }
  // Denominator = sum of the DISPLAYED (open) stages, not the API's `totalPipelineValue`,
  // which includes closed-won/lost and would understate every open-stage share.
  const displayedTotal = stages.reduce((sum, st) => sum + Number(st.totalValue), 0);
  const dealCount = stages.reduce((sum, st) => sum + st.count, 0);
  return (
    <section aria-label="Deals" className="flex flex-col">
      <SectionHeading
        title="Deals"
        detail={`${formatGBP(displayedTotal)} open across ${dealCount} ${dealCount === 1 ? 'deal' : 'deals'}`}
      />
      <SectionRows>
        {stages.map((stage) => (
          <Row
            key={stage.stageKey}
            label={stage.displayName}
            detail={`${formatGBP(stage.totalValue)} (${stage.count} ${stage.count === 1 ? 'Deal' : 'Deals'})`}
            percent={computePipelineStagePercent(stage.totalValue, displayedTotal)}
            color={STAGE_COLORS[stage.stageKey] || 'bg-primary'}
          />
        ))}
      </SectionRows>
    </section>
  );
}

/** The one next step: convert a qualified lead, qualify one, or open the board. */
function NextStep({ qualified, hasDeals }: Readonly<{ qualified: number; hasDeals: boolean }>) {
  const boardNext = qualified === 0 && hasDeals;
  let summary = 'Qualify a lead to convert it to a deal';
  if (qualified > 0) summary = `${leadCountLabel(qualified)} qualified, ready to convert to a deal`;
  else if (hasDeals) summary = 'Open the board to move your deals on';
  return (
    <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{summary}</span>
      <Link
        href={boardNext ? '/deals?view=pipeline' : '/leads'}
        className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
      >
        {boardNext ? 'Open the board' : 'Go to leads'}
      </Link>
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
  const {
    data: leadStats,
    isLoading: leadsLoading,
    isError: leadsFailed,
    refetch: refetchLeads,
  } = trpc.lead.stats.useQuery(undefined, {
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  // A failed background refresh keeps the figures already loaded (React Query keeps
  // `data`); "Couldn't load" is only for a request that never produced any.
  // A failed background refresh keeps the figures already loaded (React Query keeps `data`);
  // "Couldn't load" is only for a request that never produced any.
  const stages = (data?.stages ?? []) as PipelineStage[];
  const dealsState: PartState = {
    loading: isLoading,
    failed: requestFailed && !data,
    retry: () => void refetch(),
  };
  const leadsState: PartState = {
    loading: leadsLoading,
    failed: leadsFailed && !leadStats,
    retry: () => void refetchLeads(),
  };
  const qualified = leadStats?.byStatus?.QUALIFIED ?? 0;
  // The next step needs the lead counts; without the deals it can still say "convert a qualified
  // lead", but must not guess "qualify a lead" while it is unknown whether deals exist.
  const dealsKnown = !dealsState.loading && !dealsState.failed;
  const showNextStep = !leadsState.loading && !leadsState.failed && (qualified > 0 || dealsKnown);

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
      {/* Side by side once the card itself is wide enough, stacked below that. */}
      <div className="@container flex-1 flex flex-col">
        <div className="grid flex-1 grid-cols-1 gap-6 @xl:grid-cols-2 @xl:gap-8">
          <LeadsSection stats={leadStats} state={leadsState} />
          <DealsSection stages={stages} state={dealsState} />
        </div>
      </div>
      {showNextStep && <NextStep qualified={qualified} hasDeals={hasOpenDeals(stages)} />}
    </div>
  );
}
