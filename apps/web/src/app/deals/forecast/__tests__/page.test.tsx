/**
 * @vitest-environment jsdom
 * Deal Forecast Overview Page Tests (PG-131)
 * AC-001: Portfolio page renders with real data (no hardcoded arrays)
 * NF-003, NF-004, NF-005, NF-006
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, within } from '@testing-library/react';

// ─── Mock State ─────────────────────────────────────────────────────────────

let mockQueryState = {
  data: undefined as Record<string, unknown> | undefined,
  isLoading: false,
  error: null as { message: string; data?: { code: string } } | null,
};

let mockAuthState = {
  isLoading: false,
  isAuthenticated: true,
};

const mockPush = vi.fn();
const mockReplace = vi.fn();

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/trpc', () => ({
  trpc: {
    opportunity: {
      forecast: {
        useQuery: vi.fn((_input: unknown, _opts: unknown) => mockQueryState),
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(() => mockAuthState),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: Readonly<{ children: React.ReactNode; href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: (_importFn: () => Promise<unknown>, _opts?: Record<string, unknown>) => {
    const Comp = (props: Record<string, unknown>) => (
      <div data-testid="dynamic-chart" {...props}>
        Chart
      </div>
    );
    Comp.displayName = 'DynamicChart';
    return Comp;
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, ...props }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  Button: ({
    children,
    onClick,
    ...props
  }: Readonly<{
    children: React.ReactNode;
    onClick?: () => void;
  }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Skeleton: ({ className, ...props }: Readonly<{ className?: string }>) => (
    <div data-testid="skeleton" className={className} {...props} />
  ),
  Badge: ({ children, ...props }: Readonly<{ children: React.ReactNode }>) => (
    <span {...props}>{children}</span>
  ),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
  toast: vi.fn(),
  EmptyState: ({ title, description }: Readonly<{ title?: string; description?: string }>) => (
    <div data-testid="empty-state">
      {title} {description}
    </div>
  ),
}));

// Owner 23/11: the shared page hero.
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({
    title,
    description,
    actions = [],
  }: Readonly<{ title: string; description?: string; actions?: { label: string }[] }>) => (
    <div data-testid="page-header">
      <h1 data-testid="page-title">{title}</h1>
      <p data-testid="page-description">{description}</p>
      {actions.map((a) => (
        <button key={a.label}>{a.label}</button>
      ))}
    </div>
  ),
}));

// Import after mocks
import DealForecastPage from '../page';
import { formatCloseDate } from '@/lib/deals/close-date';

// ─── Test Data ──────────────────────────────────────────────────────────────

const mockForecastData = {
  totalOpportunities: 12,
  weightedValue: '225000',
  totalPipelineValue: 450000,
  forecastAccuracy: { accuracy: 88, target: 85, isAtRisk: false },
  winRate: 35,
  avgDealSize: 50000,
  avgSalesCycle: 45,
  wonDealsCount: 7,
  lostDealsCount: 13,
  stageBreakdown: [
    { stage: 'PROPOSAL', count: 3, totalValue: 200000, weightedValue: 120000, percentage: 44 },
  ],
  deals: [
    {
      id: '1',
      name: 'Test Deal',
      stage: 'PROPOSAL',
      value: 100000,
      probability: 60,
      expectedCloseDate: '2026-03-15',
      owner: { name: 'Jane', avatar: 'J' },
      riskLevel: 'medium',
    },
  ],
  // Two months of won revenue: enough history for the accuracy figure.
  monthlyRevenue: [
    { month: 'Sept', actual: 40000, projected: null },
    { month: 'Oct', actual: 60000, projected: null },
  ],
  winRateTrend: [],
};

describe('DealForecastPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryState = {
      data: undefined,
      isLoading: false,
      error: null,
    };
    mockAuthState = { isLoading: false, isAuthenticated: true };
  });

  it('renders loading skeletons while query is loading', () => {
    mockQueryState.isLoading = true;
    render(<DealForecastPage />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders error state with retry option on query error', () => {
    mockQueryState.error = { message: 'Network error' };
    render(<DealForecastPage />);

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('redirects to login when auth fails (401)', () => {
    mockQueryState.error = {
      message: 'Unauthorized',
      data: { code: 'UNAUTHORIZED' },
    };
    render(<DealForecastPage />);

    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('renders the shared page hero with "Deal Forecast" and the open deal count', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);

    expect(screen.getByTestId('page-title')).toHaveTextContent('Deal Forecast');
    expect(screen.getByTestId('page-description')).toHaveTextContent('12 open deals');
    // The page's own buttons stay (owner 23/11: never remove a control).
    expect(screen.getByText('This Quarter')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('shows no trend figure typed into the code', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);

    expect(document.body.textContent).not.toMatch(/vs last month/);
  });

  it('lists all five open stages, empty ones included', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);

    for (const stage of [
      'Prospecting',
      'Qualification',
      'Needs Analysis',
      'Proposal',
      'Negotiation',
    ]) {
      expect(screen.getAllByText(stage).length).toBeGreaterThan(0);
    }
  });

  it('says there is not enough history instead of a 0% accuracy', () => {
    mockQueryState.data = { ...mockForecastData, monthlyRevenue: [] };
    render(<DealForecastPage />);

    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });

  it('treats the old API shape (rate filled in for empty months) as no history', () => {
    mockQueryState.data = {
      ...mockForecastData,
      winRateTrend: [
        { month: 'May', rate: 35, isProjected: true },
        { month: 'Jun', rate: 35, isProjected: true },
      ],
    };
    render(<DealForecastPage />);
    expect(screen.getByText(/No deals closed in the last six months/)).toBeInTheDocument();
  });

  // Codex review 26/11: a YYYY-MM-DD close date is a calendar date, never shifted a day.
  it('formats a close date as the calendar day, whatever the timezone', () => {
    expect(formatCloseDate('2026-03-15', { day: 'numeric', month: 'short', year: 'numeric' })).toBe(
      '15 Mar 2026'
    );
    expect(formatCloseDate('')).toBe('');
    expect(formatCloseDate(null)).toBe('');
    expect(formatCloseDate('not a date')).toBe('');
  });

  it('lists the at-risk deals as rows on phones, linking to each deal', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);
    const list = screen.getByRole('list', { name: 'Opportunities at risk' });
    expect(within(list).getByRole('link', { name: /Test Deal/ })).toHaveAttribute(
      'href',
      '/deals/1'
    );
  });

  it('shows the shared empty state when no deals closed in six months', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);

    expect(screen.getByText(/No deals closed in the last six months/)).toBeInTheDocument();
  });

  it('renders KPI cards with real forecast data', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);

    // Forecast accuracy
    expect(screen.getByText('88%')).toBeInTheDocument();
    // Pipeline value (en-GB GBP: £450,000).
    expect(screen.getByText('£450,000')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('$');
  });

  it('renders auth loading skeleton', () => {
    mockAuthState.isLoading = true;
    render(<DealForecastPage />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('uses Skeleton for loading states (NF-004)', () => {
    mockQueryState.isLoading = true;
    render(<DealForecastPage />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });
});

vi.mock('@/lib/format/useTenantCurrency', () => ({ useTenantCurrency: () => 'GBP' }));
