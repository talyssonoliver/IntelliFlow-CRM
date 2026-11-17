// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const openStages = [
  { stageKey: 'QUALIFICATION', displayName: 'Qualification', count: 5, totalValue: 10000 },
  { stageKey: 'PROPOSAL', displayName: 'Proposal', count: 3, totalValue: 20000 },
  { stageKey: 'NEGOTIATION', displayName: 'Negotiation', count: 2, totalValue: 15000 },
  { stageKey: 'CLOSED_WON', displayName: 'Closed Won', count: 1, totalValue: 5000 },
  // Empty stage: exercises the 0% (no phantom bar) branch.
  { stageKey: 'DISCOVERY', displayName: 'Discovery', count: 0, totalValue: 0 },
];
const emptyStages = openStages.map((s) => ({ ...s, count: 0, totalValue: 0 }));

type Query = {
  data?: unknown;
  isLoading: boolean;
  isError?: boolean;
  refetch?: () => void;
};
let pipeline: Query;
let leads: Query;

const pipelineQuery = vi.fn((..._args: unknown[]) => pipeline);
const leadStatsQuery = vi.fn((..._args: unknown[]) => leads);

vi.mock('@/lib/trpc', () => ({
  trpc: {
    opportunity: { getPipeline: { useQuery: (...args: unknown[]) => pipelineQuery(...args) } },
    lead: { stats: { useQuery: (...args: unknown[]) => leadStatsQuery(...args) } },
  },
}));

import { PipelineSummaryWidget } from '../PipelineSummaryWidget';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/lib/dashboard/kpi-calculator';

const leadsSection = () => screen.getByRole('region', { name: 'Leads' });
const dealsSection = () => screen.getByRole('region', { name: 'Deals' });

beforeEach(() => {
  pipeline = { data: { stages: openStages, totalPipelineValue: 50000 }, isLoading: false };
  leads = {
    data: { total: 7, byStatus: { NEW: 4, CONTACTED: 2, QUALIFIED: 1 } },
    isLoading: false,
  };
});

describe('PipelineSummaryWidget: one funnel, leads then deals', () => {
  it('shows where the leads stand and the open deals together', () => {
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('Pipeline Summary')).toBeInTheDocument();
    // Leads first...
    expect(within(leadsSection()).getByText('New')).toBeInTheDocument();
    expect(within(leadsSection()).getByText('4 leads')).toBeInTheDocument();
    // ...then the deals, in the same card: the leads do not vanish once a deal exists.
    expect(within(dealsSection()).getByText('Qualification')).toBeInTheDocument();
    expect(within(dealsSection()).getByText('Proposal')).toBeInTheDocument();
    expect(
      Boolean(
        leadsSection().compareDocumentPosition(dealsSection()) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  });

  it('formats stage values as GBP via the calculator', () => {
    render(<PipelineSummaryWidget />);
    // formatGBP(10000) → '£10,000'; the row reads '£10,000 (5 Deals)'.
    expect(screen.getByText(/£10,000 \(5 Deals\)/)).toBeInTheDocument();
    expect(screen.getByText(/£20,000 \(3 Deals\)/)).toBeInTheDocument();
    // Empty stage formats as £0 (no placeholder) and renders a 0% (no phantom) bar.
    expect(screen.getByText(/£0 \(0 Deals\)/)).toBeInTheDocument();
  });

  it('says "1 Deal", not "1 Deals"', () => {
    pipeline = {
      data: {
        stages: [{ stageKey: 'PROPOSAL', displayName: 'Proposal', count: 1, totalValue: 120000 }],
      },
      isLoading: false,
    };
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('£120,000 (1 Deal)')).toBeInTheDocument();
  });

  it('sums the open stages in the deals heading', () => {
    render(<PipelineSummaryWidget />);
    expect(within(dealsSection()).getByText('£50,000 open across 11 deals')).toBeInTheDocument();
  });

  it('polls opportunity.getPipeline and lead.stats on the shared dashboard refetch interval', () => {
    render(<PipelineSummaryWidget />);
    expect(pipelineQuery).toHaveBeenCalledWith(
      { includeClosedStages: false },
      expect.objectContaining({ refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS })
    );
    expect(leadStatsQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS })
    );
  });
});

describe('PipelineSummaryWidget leads add up', () => {
  it("counts every lead: the owner's 121 leads, 15 of them lost or unqualified", () => {
    leads = {
      data: { total: 121, byStatus: { NEW: 1, CONTACTED: 105, LOST: 9, UNQUALIFIED: 6 } },
      isLoading: false,
    };
    render(<PipelineSummaryWidget />);

    const section = leadsSection();
    expect(within(section).getByText('121 leads')).toBeInTheDocument();
    expect(within(section).getByText('1 lead')).toBeInTheDocument();
    expect(within(section).getByText('105 leads')).toBeInTheDocument();
    expect(within(section).getByText('Lost or unqualified')).toBeInTheDocument();
    expect(within(section).getByText('15 leads')).toBeInTheDocument();
  });

  it('has no "Lost or unqualified" line when every lead is in the funnel', () => {
    render(<PipelineSummaryWidget />);
    expect(screen.queryByText('Lost or unqualified')).not.toBeInTheDocument();
  });
});

describe('PipelineSummaryWidget with no open deals', () => {
  beforeEach(() => {
    pipeline = { data: { stages: emptyStages, totalPipelineValue: 0 }, isLoading: false };
  });

  it('keeps the lead funnel and explains the empty deals, instead of rows of £0 (0 Deals)', () => {
    render(<PipelineSummaryWidget />);

    expect(within(leadsSection()).getByText('4 leads')).toBeInTheDocument();
    expect(screen.queryByText(/\(0 Deals\)/)).not.toBeInTheDocument();
    // The shared deals empty state fills that half of the card, instead of one line.
    expect(within(dealsSection()).getByText('No deals yet')).toBeInTheDocument();
  });

  it('points at the qualified leads ready to convert', () => {
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('1 lead qualified, ready to convert to a deal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to leads' })).toHaveAttribute('href', '/leads');
  });

  it('asks to qualify a lead when none is qualified yet', () => {
    leads = { data: { total: 3, byStatus: { NEW: 3 } }, isLoading: false };
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('Qualify a lead to convert it to a deal')).toBeInTheDocument();
  });
});

describe('PipelineSummaryWidget next step with open deals', () => {
  it('still points at qualified leads first', () => {
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('1 lead qualified, ready to convert to a deal')).toBeInTheDocument();
  });

  it('points at the board when no lead is waiting to convert', () => {
    leads = { data: { total: 3, byStatus: { NEW: 3 } }, isLoading: false };
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('Open the board to move your deals on')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the board' })).toHaveAttribute(
      'href',
      '/deals?view=pipeline'
    );
  });
});

describe('PipelineSummaryWidget loading and errors', () => {
  it('shows loading rows for the part that is still loading, and the other part as loaded', () => {
    leads = { data: undefined, isLoading: true };
    const { container } = render(<PipelineSummaryWidget />);

    expect(container.querySelectorAll('.animate-pulse').length).toBe(5);
    expect(within(dealsSection()).getByText('Qualification')).toBeInTheDocument();
    expect(screen.queryByText(/ready to convert|Qualify a lead/)).not.toBeInTheDocument();
  });

  it("shows Couldn't load your leads, not a funnel of zeros, and keeps the deals", () => {
    const retry = vi.fn();
    leads = { data: undefined, isLoading: false, isError: true, refetch: retry };
    render(<PipelineSummaryWidget />);

    expect(within(leadsSection()).getByText("Couldn't load your leads.")).toBeInTheDocument();
    expect(screen.queryByText('0 leads')).not.toBeInTheDocument();
    // The deals still show: one failed request does not blank the whole card.
    expect(within(dealsSection()).getByText('Proposal')).toBeInTheDocument();
    fireEvent.click(within(leadsSection()).getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("shows Couldn't load the pipeline and keeps the leads when the deals request fails", () => {
    const retry = vi.fn();
    pipeline = { data: undefined, isLoading: false, isError: true, refetch: retry };
    render(<PipelineSummaryWidget />);

    expect(within(dealsSection()).getByText("Couldn't load the pipeline.")).toBeInTheDocument();
    expect(within(leadsSection()).getByText('4 leads')).toBeInTheDocument();
    fireEvent.click(within(dealsSection()).getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });

  it('keeps the last lead counts when only a background refresh failed', () => {
    leads = { data: { total: 4, byStatus: { NEW: 4 } }, isLoading: false, isError: true };
    render(<PipelineSummaryWidget />);
    // The heading (total) and the New row both read "4 leads"; the counts are still there.
    expect(within(leadsSection()).getAllByText('4 leads')).toHaveLength(2);
    expect(screen.queryByText("Couldn't load your leads.")).not.toBeInTheDocument();
  });
});
