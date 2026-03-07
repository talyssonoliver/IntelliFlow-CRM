/**
 * @vitest-environment jsdom
 * Deal-Specific Forecast Page Tests (PG-131)
 * AC-002: Deal page reads params.id and fetches dealForecast
 * NF-003, NF-004, NF-005
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { createMockDealForecastResponse } from '@/components/deals/__tests__/deal-test-utils';

// ─── Mock State ─────────────────────────────────────────────────────────────

const mockForecastResponse = createMockDealForecastResponse();

let mockQueryState = {
  data: undefined as typeof mockForecastResponse | undefined,
  isLoading: false,
  error: null as { message: string; data?: { code: string } } | null,
  refetch: vi.fn(),
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
      dealForecast: {
        useQuery: vi.fn((input: { id: string }, _opts?: unknown) => {
          // Capture the input for assertion
          (vi.mocked as any).__lastInput = input; // test-only mock
          return mockQueryState;
        }),
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(() => mockAuthState),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useParams: () => ({ id: 'deal-001' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: Readonly<{ children: React.ReactNode; href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: (_importFn: () => Promise<unknown>) => {
    const Comp = (props: Record<string, unknown>) => (
      <div data-testid="dynamic-chart" data-mode={props.mode as string}>
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
import DealForecastDetailPage from '../page';

describe('DealForecastDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryState = {
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    mockAuthState = { isLoading: false, isAuthenticated: true };
  });

  it('renders loading skeletons while query loads', () => {
    mockQueryState.isLoading = true;
    render(<DealForecastDetailPage />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders error state with retry on query error', () => {
    mockQueryState.error = { message: 'Server error' };
    render(<DealForecastDetailPage />);

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('renders ForecastHeader in deal mode with deal name', () => {
    mockQueryState.data = mockForecastResponse;
    render(<DealForecastDetailPage />);

    expect(screen.getByTestId('forecast-header')).toBeInTheDocument();
  });

  it('renders ProbabilityGauge with deal probability', () => {
    mockQueryState.data = mockForecastResponse;
    render(<DealForecastDetailPage />);

    expect(screen.getByTestId('probability-gauge')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
  });

  it('renders ConfidenceIndicator with composite confidence', () => {
    mockQueryState.data = mockForecastResponse;
    render(<DealForecastDetailPage />);

    expect(screen.getByTestId('confidence-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-value')).toHaveTextContent('75%');
  });

  it('renders RiskFactorsCard with derived risk factors', () => {
    mockQueryState.data = mockForecastResponse;
    render(<DealForecastDetailPage />);

    expect(screen.getByTestId('risk-factors-card')).toBeInTheDocument();
    expect(screen.getByText('Probability below stage default')).toBeInTheDocument();
  });

  it('renders RecommendedActions with business-rule recommendations', () => {
    mockQueryState.data = mockForecastResponse;
    render(<DealForecastDetailPage />);

    expect(screen.getByTestId('recommended-actions')).toBeInTheDocument();
    expect(screen.getByText('Schedule follow-up call')).toBeInTheDocument();
  });

  it('renders ForecastHistory in deal mode', () => {
    mockQueryState.data = mockForecastResponse;
    render(<DealForecastDetailPage />);

    expect(screen.getByTestId('forecast-history')).toBeInTheDocument();
    expect(screen.getByText('Probability History')).toBeInTheDocument();
  });

  it('shows auth loading state', () => {
    mockAuthState.isLoading = true;
    render(<DealForecastDetailPage />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('redirects to login for auth errors', () => {
    mockQueryState.error = {
      message: 'Unauthorized',
      data: { code: 'UNAUTHORIZED' },
    };
    render(<DealForecastDetailPage />);

    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
