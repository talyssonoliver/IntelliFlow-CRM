// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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

let pipeline: { data?: unknown; isLoading: boolean; isError?: boolean; refetch?: () => void };
let leads: { data?: unknown; isLoading: boolean };

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

beforeEach(() => {
  pipeline = { data: { stages: openStages, totalPipelineValue: 50000 }, isLoading: false };
  leads = { data: { byStatus: { NEW: 4, CONTACTED: 2, QUALIFIED: 1 } }, isLoading: false };
});

describe('PipelineSummaryWidget with open deals', () => {
  it('renders pipeline summary stages', () => {
    render(<PipelineSummaryWidget />);
    expect(screen.getByText('Pipeline Summary')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('Proposal')).toBeInTheDocument();
  });

  it('formats stage values as GBP via the calculator', () => {
    render(<PipelineSummaryWidget />);

    // formatGBP(10000) → '£10,000'; the row reads '£10,000 (5 Deals)'.
    expect(screen.getByText(/£10,000 \(5 Deals\)/)).toBeInTheDocument();
    expect(screen.getByText(/£20,000 \(3 Deals\)/)).toBeInTheDocument();
    // Empty stage formats as £0 (no placeholder) and renders a 0% (no phantom) bar.
    expect(screen.getByText(/£0 \(0 Deals\)/)).toBeInTheDocument();
  });

  it('sums the open stages in the footer and links to the board', () => {
    render(<PipelineSummaryWidget />);

    expect(screen.getByText('£50,000 open across 11 deals')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the board' })).toHaveAttribute(
      'href',
      '/deals?view=pipeline'
    );
    expect(screen.queryByText(/No open deals yet/)).not.toBeInTheDocument();
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

describe('PipelineSummaryWidget with no open deals', () => {
  beforeEach(() => {
    pipeline = { data: { stages: emptyStages, totalPipelineValue: 0 }, isLoading: false };
  });

  it('shows the lead funnel by status instead of rows of £0 (0 Deals)', () => {
    render(<PipelineSummaryWidget />);

    expect(screen.getByText(/No open deals yet/)).toBeInTheDocument();
    expect(screen.queryByText(/\(0 Deals\)/)).not.toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('4 leads')).toBeInTheDocument();
    expect(screen.getByText('Contacted')).toBeInTheDocument();
    expect(screen.getByText('2 leads')).toBeInTheDocument();
    expect(screen.getAllByText('1 lead').length).toBeGreaterThan(0);
  });

  it('points at the qualified leads ready to convert', () => {
    render(<PipelineSummaryWidget />);

    expect(screen.getByText('1 lead qualified, ready to convert to a deal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to leads' })).toHaveAttribute('href', '/leads');
  });

  it('asks to qualify a lead when none is qualified yet', () => {
    leads = { data: { byStatus: { NEW: 3 } }, isLoading: false };
    render(<PipelineSummaryWidget />);

    expect(screen.getByText('Qualify a lead to convert it to a deal')).toBeInTheDocument();
  });

  it('shows loading rows while the lead counts load', () => {
    leads = { data: undefined, isLoading: true };
    const { container } = render(<PipelineSummaryWidget />);

    expect(container.querySelectorAll('.animate-pulse').length).toBe(4);
    expect(screen.queryByText(/No open deals yet/)).not.toBeInTheDocument();
  });
});

describe('PipelineSummaryWidget errors', () => {
  it("shows Couldn't load when the pipeline never loaded", () => {
    pipeline = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    render(<PipelineSummaryWidget />);

    expect(screen.getByText("Couldn't load the pipeline.")).toBeInTheDocument();
  });
});
