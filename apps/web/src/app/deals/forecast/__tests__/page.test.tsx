/**
 * @vitest-environment jsdom
 * Deal Forecast Overview Page Tests (PG-131)
 * AC-001: Portfolio page renders with real data (no hardcoded arrays)
 * NF-003, NF-004, NF-005, NF-006
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';

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
  default: ({ children, href, ...props }: Readonly<{ children: React.ReactNode; href: string }>) => (
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
}));

vi.mock('@/components/shared', () => ({
  EntityHeader: ({ title, ...props }: Readonly<{ title: string }>) => (
    <div data-testid="entity-header" {...props}>
      <span data-testid="entity-title">{title}</span>
    </div>
  ),
}));

// Import after mocks
import DealForecastPage from '../page';

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
  monthlyRevenue: [],
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

  it('renders EntityHeader with "Deal Forecast" title', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);

    expect(screen.getByTestId('entity-title')).toHaveTextContent('Deal Forecast');
  });

  it('renders live data indicator with opportunity count', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);

    expect(screen.getByText(/12 active opportunities/)).toBeInTheDocument();
  });

  it('renders KPI cards with real forecast data', () => {
    mockQueryState.data = mockForecastData;
    render(<DealForecastPage />);

    // Forecast accuracy
    expect(screen.getByText('88%')).toBeInTheDocument();
    // Pipeline value
    expect(screen.getByText('$450,000')).toBeInTheDocument();
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
