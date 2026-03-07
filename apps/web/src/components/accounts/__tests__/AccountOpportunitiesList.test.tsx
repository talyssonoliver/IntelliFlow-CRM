// @vitest-environment jsdom
/**
 * AccountOpportunitiesList Tests (PG-134)
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  formatCurrency: (v: number) => `$${v.toLocaleString()}`,
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, ...props }: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
    <button {...props}>{children}</button>
  ),
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div className={`animate-pulse ${className ?? ''}`} />
  ),
  Badge: ({ children, ...props }: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
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
    expect(screen.getByText('No opportunities for this account')).toBeInTheDocument();
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
});
