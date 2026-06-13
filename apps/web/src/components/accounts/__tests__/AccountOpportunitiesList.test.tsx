// @vitest-environment jsdom
/**
 * AccountOpportunitiesList Tests (PG-134)
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';
import { AccountOpportunitiesList } from '../AccountOpportunitiesList';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const useQueryMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    account: {
      getOpportunities: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

vi.mock('@/lib/pricing/calculator', () => ({
  formatCurrency: (v: number) => `$${v.toLocaleString('en-GB')}`,
}));

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  Button: ({
    children,
    ...props
  }: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
    <button {...props}>{children}</button>
  ),
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div className={`animate-pulse ${className ?? ''}`} />
  ),
  Badge: ({
    children,
    ...props
  }: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
    <span {...props}>{children}</span>
  ),
  Card: ({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) => (
    <div className={className}>{children}</div>
  ),
}));

describe('AccountOpportunitiesList', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    mockPush.mockReset();
  });

  it('shows loading skeletons while fetching', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: true, error: null });
    const { container } = render(
      <AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows error on failure', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error('boom') });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText('Failed to load opportunities')).toBeInTheDocument();
  });

  it('shows empty state when no opportunities', () => {
    useQueryMock.mockReturnValue({
      data: { opportunities: [], total: 0, summary: null, nextCursor: null },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);
    // EmptyState entity="deals" → canonical 'No deals yet'.
    expect(screen.getByText('No deals yet')).toBeInTheDocument();
  });

  it('renders opportunity list with names and values', () => {
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Big Deal', value: 100000, probability: 75, stage: 'PROPOSAL' },
          { id: 'o2', name: 'Small Deal', value: 10000, probability: 50, stage: 'PROSPECTING' },
        ],
        total: 2,
        summary: { totalValue: 110000, weightedValue: 80000 },
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('Big Deal')).toBeInTheDocument();
    expect(screen.getByText('Small Deal')).toBeInTheDocument();
  });

  it('shows summary cards when summary data exists', () => {
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Deal', value: 100000, probability: 80, stage: 'PROPOSAL' },
        ],
        total: 1,
        summary: { totalValue: 100000, weightedValue: 80000 },
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Weighted Value')).toBeInTheDocument();
    expect(screen.getByText('Opportunities')).toBeInTheDocument();
  });

  it('navigates to deal detail when opportunity clicked', () => {
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Navigate Deal', value: 50000, probability: 60, stage: 'NEGOTIATION' },
        ],
        total: 1,
        summary: { totalValue: 50000, weightedValue: 30000 },
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);

    fireEvent.click(screen.getByText('Navigate Deal'));
    expect(mockPush).toHaveBeenCalledWith('/deals/o1');
  });

  it('shows Load More button when nextCursor exists', () => {
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Deal', value: 10000, probability: 50, stage: 'PROPOSAL' },
        ],
        total: 5,
        summary: { totalValue: 50000, weightedValue: 25000 },
        nextCursor: 'cursor-abc',
      },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('Load More')).toBeInTheDocument();
  });

  it('renders stage filter select', () => {
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Deal', value: 10000, probability: 50, stage: 'PROPOSAL' },
        ],
        total: 1,
        summary: { totalValue: 10000, weightedValue: 5000 },
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('All Stages')).toBeInTheDocument();
  });

  // IFC-267: onCreateOpportunity callback wiring
  it('empty-state "Create Opportunity" button calls onCreateOpportunity', () => {
    const onCreateOpportunity = vi.fn();
    useQueryMock.mockReturnValue({
      data: { opportunities: [], total: 0, summary: null, nextCursor: null },
      isLoading: false,
      error: null,
    });
    render(
      <AccountOpportunitiesList
        accountId="00000000-0000-4000-8000-000000000001"
        onCreateOpportunity={onCreateOpportunity}
      />
    );

    fireEvent.click(screen.getByText('Create Opportunity'));
    expect(onCreateOpportunity).toHaveBeenCalledTimes(1);
  });

  it('header "Create Opportunity" button calls onCreateOpportunity', () => {
    const onCreateOpportunity = vi.fn();
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Deal', value: 10000, probability: 50, stage: 'PROPOSAL' },
        ],
        total: 1,
        summary: { totalValue: 10000, weightedValue: 5000 },
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(
      <AccountOpportunitiesList
        accountId="00000000-0000-4000-8000-000000000001"
        onCreateOpportunity={onCreateOpportunity}
      />
    );

    // In the non-empty state, the "Create Opportunity" button is in the header
    const createBtns = screen.getAllByText('Create Opportunity');
    fireEvent.click(createBtns[0]);
    expect(onCreateOpportunity).toHaveBeenCalledTimes(1);
  });

  // IFC-273 (F-12): stage filter options derived from the OpportunityStage domain enum
  it('renders a stage filter option for every OPPORTUNITY_STAGE (incl. NEEDS_ANALYSIS)', () => {
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Deal', value: 10000, probability: 50, stage: 'PROPOSAL' },
        ],
        total: 1,
        summary: { totalValue: 10000, weightedValue: 5000 },
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);

    const options = screen.getAllByRole('option');
    // "All Stages" + one option per OPPORTUNITY_STAGE
    expect(options).toHaveLength(OPPORTUNITY_STAGES.length + 1);
    for (const stage of OPPORTUNITY_STAGES) {
      expect(screen.getByRole('option', { name: formatStageLabel(stage) })).toBeInTheDocument();
    }
    // the stage the hardcoded list omitted
    expect(screen.getByRole('option', { name: 'Needs Analysis' })).toBeInTheDocument();
  });

  it('applies the selected stage to the opportunities query', () => {
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Deal', value: 10000, probability: 50, stage: 'PROPOSAL' },
        ],
        total: 1,
        summary: { totalValue: 10000, weightedValue: 5000 },
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'NEEDS_ANALYSIS' } });

    const lastCall = useQueryMock.mock.calls.at(-1)?.[0] as { stage?: string[] };
    expect(lastCall.stage).toEqual(['NEEDS_ANALYSIS']);
  });

  it('clears the stage filter when All Stages is selected', () => {
    useQueryMock.mockReturnValue({
      data: {
        opportunities: [
          { id: 'o1', name: 'Deal', value: 10000, probability: 50, stage: 'PROPOSAL' },
        ],
        total: 1,
        summary: { totalValue: 10000, weightedValue: 5000 },
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountOpportunitiesList accountId="00000000-0000-4000-8000-000000000001" />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'NEEDS_ANALYSIS' } });
    fireEvent.change(select, { target: { value: '' } });

    const lastCall = useQueryMock.mock.calls.at(-1)?.[0] as { stage?: string[] };
    expect(lastCall.stage).toBeUndefined();
  });
});

// Mirror of the shared formatLabel used by the component (SNAKE_CASE → Title Case)
function formatStageLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
