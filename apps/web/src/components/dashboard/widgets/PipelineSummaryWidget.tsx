'use client';

import { useId, useState } from 'react';
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
import { NO_DEAL_VALUE_LABEL } from '@/components/deals/types';
import type { WidgetProps } from './index';
import { WidgetHeader } from '../WidgetHeader';

const STAGE_COLORS: Record<string, string> = {
  QUALIFICATION: 'bg-stage-qualification',
  NEEDS_ANALYSIS: 'bg-stage-needs-analysis',
  PROPOSAL: 'bg-stage-proposal',
  NEGOTIATION: 'bg-stage-negotiation',
  CLOSED_WON: 'bg-stage-won',
  DISCOVERY: 'bg-blue-400',
  DEMO: 'bg-indigo-400',
};

/**
 * #48: a stage holding deals with no value says so, as the deal cards do ("No value set"),
 * instead of a real-looking £0. An empty stage keeps "£0 (0 Deals)".
 */
export function stageValueLabel(totalValue: number | string, count: number): string {
  const deals = `${count} ${count === 1 ? 'Deal' : 'Deals'}`;
  const value = Number(totalValue);
  return count > 0 && !value
    ? `${NO_DEAL_VALUE_LABEL} (${deals})`
    : `${formatGBP(value)} (${deals})`;
}

/** The Deals heading total; "1 open deal · no value set" when the open deals carry no value. */
export function dealsTotalLabel(total: number, dealCount: number): string {
  const deals = `${dealCount} ${dealCount === 1 ? 'deal' : 'deals'}`;
  return dealCount > 0 && !total
    ? `${dealCount} open ${dealCount === 1 ? 'deal' : 'deals'} · no value set`
    : `${formatGBP(total)} open across ${deals}`;
}

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

function SectionHeading({
  title,
  detail,
  className = '',
}: Readonly<{ title: string; detail?: string; className?: string }>) {
  return (
    <div className={`flex items-baseline justify-between gap-3 mb-3 ${className}`}>
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

/**
 * A Leads or Deals section. Owner 20/11, on the phone: a divider above each section, and each
 * section folded to its one heading row ("LEADS · 155 leads"), tapping the row opens its stages.
 * That applies while the card is stacked (narrower than `@xl`); once the two sections sit side by
 * side the divider and the toggle are hidden and the stages always show, as before.
 * The heading is rendered once: the toggle is a separate button stretched over the heading row,
 * centred on it (the heading has no margin inside the wrapper, so the chevron never moves).
 * Loading folds too, so the card does not open and then jump shut when the counts arrive; an
 * error or the no-open-deals message stays visible, since it is the one thing to read there.
 */
function Section({
  title,
  detail,
  children,
  foldable = false,
}: Readonly<{ title: string; detail?: string; children: React.ReactNode; foldable?: boolean }>) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <section
      aria-label={title}
      className="flex flex-col border-t border-border pt-4 @xl:border-t-0 @xl:pt-0"
    >
      {foldable ? (
        <>
          <div className="relative">
            <SectionHeading title={title} detail={detail} className="mb-0 @max-xl:pr-8" />
            {/* 44px tap target over the whole heading row; the chevron sits at its right end. */}
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={`${title} by stage`}
              onClick={() => setOpen((o) => !o)}
              className="@xl:hidden absolute inset-x-0 top-1/2 -translate-y-1/2 h-11 flex items-center justify-end rounded-md cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`pipeline-${title.toLowerCase()}-toggle`}
            >
              <span
                className={`material-symbols-outlined text-xl motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>
          </div>
          <div
            id={bodyId}
            className={`flex flex-1 flex-col mt-3 @max-xl:mt-4 ${open ? '' : '@max-xl:hidden'}`}
          >
            {children}
          </div>
        </>
      ) : (
        <>
          <SectionHeading title={title} detail={detail} />
          {children}
        </>
      )}
    </section>
  );
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
      <Section title="Leads">
        <ChartUnavailable message="Couldn't load your leads." onRetry={state.retry} />
      </Section>
    );
  }
  if (state.loading) {
    return (
      <Section title="Leads" foldable>
        <LoadingRows count={5} />
      </Section>
    );
  }
  const { rows, other, total } = leadFunnel(stats);
  return (
    <Section title="Leads" detail={leadCountLabel(total)} foldable>
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
    </Section>
  );
}

/** The workspace's open deals by stage, as they are created. */
function DealsSection({ stages, state }: Readonly<{ stages: PipelineStage[]; state: PartState }>) {
  if (state.failed) {
    return (
      <Section title="Deals">
        <ChartUnavailable message="Couldn't load the pipeline." onRetry={state.retry} />
      </Section>
    );
  }
  if (state.loading) {
    return (
      <Section title="Deals" foldable>
        <LoadingRows count={3} />
      </Section>
    );
  }
  if (!hasOpenDeals(stages)) {
    return (
      <Section title="Deals">
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
      </Section>
    );
  }
  // Denominator = sum of the DISPLAYED (open) stages, not the API's `totalPipelineValue`,
  // which includes closed-won/lost and would understate every open-stage share.
  const displayedTotal = stages.reduce((sum, st) => sum + Number(st.totalValue), 0);
  const dealCount = stages.reduce((sum, st) => sum + st.count, 0);
  return (
    <Section title="Deals" detail={dealsTotalLabel(displayedTotal, dealCount)} foldable>
      <SectionRows>
        {stages.map((stage) => (
          <Row
            key={stage.stageKey}
            label={stage.displayName}
            detail={stageValueLabel(stage.totalValue, stage.count)}
            percent={computePipelineStagePercent(stage.totalValue, displayedTotal)}
            color={STAGE_COLORS[stage.stageKey] || 'bg-primary'}
          />
        ))}
      </SectionRows>
    </Section>
  );
}

/** The one next step: convert a qualified lead, qualify one, or open the board. */
function NextStep({ qualified, hasDeals }: Readonly<{ qualified: number; hasDeals: boolean }>) {
  const boardNext = qualified === 0 && hasDeals;
  let summary = 'Qualify a lead to convert it to a deal';
  if (qualified > 0) summary = `${leadCountLabel(qualified)} qualified, ready to convert to a deal`;
  else if (hasDeals) summary = 'Open the board to move your deals on';
  return (
    // Phone (owner 21/11): the message and the link stack with room between them, and the link is
    // a full 44px tap target; side by side from sm.
    <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{summary}</span>
      <Link
        href={boardNext ? '/deals?view=pipeline' : '/leads'}
        className="inline-flex min-h-11 items-center self-start sm:self-auto text-sm font-medium text-primary hover:underline whitespace-nowrap"
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
      <WidgetHeader
        title="Pipeline Summary"
        actions={
          /* #1225 UI-012: was an options button with no handler; it now opens the board. */
          <Link
            href="/deals?view=pipeline"
            aria-label="Open the pipeline board"
            title="Open the pipeline board"
            className="inline-flex size-11 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              open_in_new
            </span>
          </Link>
        }
      />
      {/* Side by side once the card itself is wide enough, stacked below that. */}
      <div className="@container flex-1 flex flex-col">
        <div className="grid flex-1 grid-cols-1 content-start gap-4 @xl:grid-cols-2 @xl:content-stretch @xl:gap-8">
          <LeadsSection stats={leadStats} state={leadsState} />
          <DealsSection stages={stages} state={dealsState} />
        </div>
      </div>
      {showNextStep && <NextStep qualified={qualified} hasDeals={hasOpenDeals(stages)} />}
    </div>
  );
}
