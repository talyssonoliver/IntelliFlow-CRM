/**
 * @vitest-environment jsdom
 *
 * Tests for the Deals Pipeline page (PG-135 — refactored).
 * The page delegates to extracted components in @/components/deals/*.
 * These tests verify data flow, auth, error handling, and composition.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';

// CRITICAL: All vi.mock calls are hoisted before any imports
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams('view=pipeline'),
  usePathname: () => '/deals',
  useParams: () => ({}),
}));

// Mock @intelliflow/domain
vi.mock('@intelliflow/domain', () => ({
  OPPORTUNITY_STAGES: [
    'PROSPECTING',
    'QUALIFICATION',
    'NEEDS_ANALYSIS',
    'PROPOSAL',
    'NEGOTIATION',
    'CLOSED_WON',
    'CLOSED_LOST',
  ] as const,
}));

// Mock auth
const mockAuthState = {
  isLoading: false,
  isAuthenticated: true,
};

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => mockAuthState,
}));

// Mock the dynamic owner-filter hook (IFC-287 F-12)
const mockOwnerOptions = [
  { value: '11111111-1111-4111-8111-111111111111', label: 'Jane Smith (3)' },
  { value: '22222222-2222-4222-8222-222222222222', label: 'Bob Wilson (1)' },
];
vi.mock('@/hooks/use-dynamic-filters', () => ({
  useDealFilterOptions: () => ({ ownerOptions: mockOwnerOptions, isLoading: false, error: null }),
}));

// Mock trpc with configurable state
const mockRefetch = vi.fn();
const mockMutate = vi.fn();
const mockMoveStage = vi.fn();
let capturedMoveStageConfig: Record<string, (...args: unknown[]) => unknown> = {};
const mockOpportunityData = {
  opportunities: [
    {
      id: '1',
      name: 'Enterprise License - Acme Corp',
      value: 75000,
      stage: 'QUALIFICATION',
      probability: 40,
      expectedCloseDate: '2025-03-15',
      account: { name: 'Acme Corporation' },
      contact: { firstName: 'John', lastName: 'Doe' },
      ownerId: 'user-1',
      owner: { name: 'Jane Smith', email: 'jane@example.com' },
      createdAt: '2025-01-15',
    },
    {
      id: '2',
      name: 'Cloud Migration - TechStart',
      value: 125000,
      stage: 'PROPOSAL',
      probability: 60,
      expectedCloseDate: '2025-04-01',
      account: { name: 'TechStart Inc' },
      contact: { firstName: 'Sarah', lastName: 'Connor' },
      ownerId: 'user-2',
      owner: { name: 'Bob Wilson', email: 'bob@example.com' },
      createdAt: '2025-01-10',
    },
    {
      id: '3',
      name: 'Annual Support - GlobalCorp',
      value: 50000,
      stage: 'CLOSED_WON',
      probability: 100,
      expectedCloseDate: '2025-02-28',
      account: { name: 'GlobalCorp' },
      contact: { firstName: 'Mike', lastName: 'Johnson' },
      ownerId: 'user-1',
      owner: { name: 'Jane Smith', email: 'jane@example.com' },
      createdAt: '2025-01-05',
    },
  ],
};

const mockQueryState = {
  data: mockOpportunityData as typeof mockOpportunityData | undefined,
  isLoading: false,
  isError: false,
  error: null as { message: string; data?: { code: string } } | null,
};

// Captures the input passed to opportunity.list.useQuery so tests can assert
// that filter selections are wired into the query (IFC-287 F-10).
let capturedListInput: Record<string, unknown> | undefined;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      opportunity: {
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
    opportunity: {
      list: {
        useQuery: (input: Record<string, unknown>) => {
          capturedListInput = input;
          return {
            data: mockQueryState.data,
            isLoading: mockQueryState.isLoading,
            isError: mockQueryState.isError,
            error: mockQueryState.error,
            refetch: mockRefetch,
          };
        },
      },
      update: {
        useMutation: () => ({
          mutate: mockMutate,
          isPending: false,
        }),
      },
      moveStage: {
        useMutation: (config?: Record<string, (...args: unknown[]) => unknown>) => {
          if (config) capturedMoveStageConfig = config;
          return { mutate: mockMoveStage, isPending: false };
        },
      },
    },
  },
}));

// Mock @intelliflow/ui
const mockToast = vi.fn();
vi.mock('@intelliflow/ui', () => ({
  Card: ({
    children,
    className,
    ...rest
  }: Readonly<{
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }>) => (
    <div data-testid="card" className={className} {...rest}>
      {children}
    </div>
  ),
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div data-testid="skeleton" className={className} />
  ),
  toast: (...args: unknown[]) => mockToast(...args),
  Dialog: ({ children, open }: Readonly<{ children: React.ReactNode; open: boolean }>) =>
    open ? <div data-testid="loss-reason-dialog">{children}</div> : null,
  DialogContent: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  DialogHeader: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  DialogTitle: ({ children }: Readonly<{ children: React.ReactNode }>) => <h2>{children}</h2>,
  DialogDescription: ({ children }: Readonly<{ children: React.ReactNode }>) => <p>{children}</p>,
  DialogFooter: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
}));

// Mock @/components/shared
vi.mock('@/components/shared', () => ({
  PageHeader: ({ title, description }: Readonly<{ title: string; description?: string }>) => (
    <header data-testid="page-header">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  ),
}));

// Mock extracted deal components — render minimal stubs that prove props flow through
vi.mock('@/components/deals', () => ({
  DealListView: () => <div data-testid="deal-list-view">Deal List View</div>,
  LossReasonModal: ({
    open,
    onConfirm,
    onCancel,
    dealName,
  }: Readonly<{
    open: boolean;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
    dealName: string;
  }>) =>
    open ? (
      <div data-testid="loss-reason-modal" data-deal-name={dealName}>
        <button
          data-testid="confirm-loss"
          onClick={() => onConfirm('Budget constraints prevented the deal')}
        >
          Confirm
        </button>
        <button data-testid="cancel-loss" onClick={() => onCancel()}>
          Cancel
        </button>
      </div>
    ) : null,
  PipelineBoard: ({
    deals,
    onStageChange,
    onDealNavigate,
    pendingDealId,
  }: Readonly<{
    deals: Array<{ id: string; name: string; stage: string }>;
    onStageChange: (id: string, stage: string) => void;
    onDealNavigate: (id: string) => void;
    pendingDealId?: string | null;
  }>) => (
    <div
      data-testid="pipeline-board"
      data-deal-count={deals.length}
      data-pending-deal={pendingDealId ?? ''}
    >
      {deals.map((d) => (
        <button
          key={d.id}
          data-testid={`deal-${d.id}`}
          data-stage={d.stage}
          onClick={() => onDealNavigate(d.id)}
        >
          {d.name}
        </button>
      ))}
      {/* Expose onStageChange for testing */}
      <button
        data-testid="trigger-stage-change"
        onClick={() => {
          if (deals.length > 0) {
            onStageChange(deals[0].id, 'PROPOSAL');
          }
        }}
      >
        Trigger Stage Change
      </button>
      <button
        data-testid="trigger-closed-lost"
        onClick={() => {
          if (deals.length > 0) {
            onStageChange(deals[0].id, 'CLOSED_LOST');
          }
        }}
      >
        Trigger Closed Lost
      </button>
    </div>
  ),
  ValueSummary: ({
    stats,
  }: Readonly<{
    stats: { totalDeals: number; totalValue: number; weightedValue: number; wonValue: number };
  }>) => (
    <div data-testid="value-summary">
      <span data-testid="total-deals">{stats.totalDeals}</span>
      <span data-testid="total-value">{stats.totalValue}</span>
      <span data-testid="weighted-value">{stats.weightedValue}</span>
      <span data-testid="won-value">{stats.wonValue}</span>
    </div>
  ),
  DealFilters: ({
    value,
    onChange,
    owners,
  }: Readonly<{
    value: Record<string, unknown>;
    onChange: (v: Record<string, unknown>) => void;
    owners?: ReadonlyArray<{ value: string; label: string }>;
  }>) => (
    <div data-testid="deal-filters" data-owner-count={owners?.length ?? 0}>
      <button
        data-testid="set-filter"
        onClick={() => onChange({ ...value, ownerId: '11111111-1111-4111-8111-111111111111' })}
      >
        Set Filter
      </button>
      <button
        data-testid="set-date-filter"
        onClick={() => onChange({ ...value, dateRange: 'this_month' })}
      >
        Set Date Filter
      </button>
    </div>
  ),
}));

// The page imports its deal components from their own modules (NOT the barrel) so
// @dnd-kit stays out of the deals route's initial compile graph (PERF-05). The
// barrel stub above defines all the component stubs in one place; mirror each
// direct module path here so the page's direct imports resolve to those same stubs
// instead of the real components.
vi.mock('@/components/deals/PipelineBoard', async () => {
  const barrel = (await import('@/components/deals')) as { PipelineBoard: unknown };
  return { PipelineBoard: barrel.PipelineBoard };
});
vi.mock('@/components/deals/ValueSummary', async () => {
  const barrel = (await import('@/components/deals')) as { ValueSummary: unknown };
  return { ValueSummary: barrel.ValueSummary };
});
vi.mock('@/components/deals/DealFilters', async () => {
  const barrel = (await import('@/components/deals')) as { DealFilters: unknown };
  return { DealFilters: barrel.DealFilters };
});
vi.mock('@/components/deals/DealListView', async () => {
  const barrel = (await import('@/components/deals')) as { DealListView: unknown };
  return { DealListView: barrel.DealListView };
});
vi.mock('@/components/deals/LossReasonModal', async () => {
  const barrel = (await import('@/components/deals')) as { LossReasonModal: unknown };
  return { LossReasonModal: barrel.LossReasonModal };
});

// Mock next/dynamic — prevent stale mock leak from other test files
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
    const LazyComponent = React.lazy(loader);
    function DynamicMock(props: Record<string, unknown>) {
      return (
        <React.Suspense fallback={null}>
          <LazyComponent {...props} />
        </React.Suspense>
      );
    }
    DynamicMock.displayName = 'DynamicMock';
    return DynamicMock;
  },
}));

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  BarChart: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

// NOW import after all mocks
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DealsPage from '../page';

describe('DealsPage', { timeout: 10000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryState.data = mockOpportunityData;
    mockQueryState.isLoading = false;
    mockQueryState.isError = false;
    mockQueryState.error = null;
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;
    capturedMoveStageConfig = {};
    capturedListInput = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering & Composition', () => {
    it('renders the page header with correct title', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByTestId('page-header')).toBeInTheDocument();
      expect(screen.getByText('Deals Pipeline')).toBeInTheDocument();
    });

    it('renders DealFilters component', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByTestId('deal-filters')).toBeInTheDocument();
    });

    it('renders ValueSummary with computed stats', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      const summary = screen.getByTestId('value-summary');
      expect(summary).toBeInTheDocument();

      // 2 active deals (QUALIFICATION + PROPOSAL), 1 CLOSED_WON
      expect(screen.getByTestId('total-deals')).toHaveTextContent('2');

      // Active pipeline value: 75000 + 125000 = 200000
      expect(screen.getByTestId('total-value')).toHaveTextContent('200000');

      // Won value: 50000
      expect(screen.getByTestId('won-value')).toHaveTextContent('50000');
    });

    it('renders PipelineBoard with transformed deals', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      const board = await screen.findByTestId('pipeline-board');
      expect(board).toBeInTheDocument();
      expect(board).toHaveAttribute('data-deal-count', '3');
    });

    it('renders charts', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      // DealsCharts is lazy-loaded via next/dynamic (React.lazy under the hood).
      // waitFor flushes the async import Promise and waits for the Suspense boundary to resolve.
      await waitFor(() => {
        expect(screen.getByText('Deals by Stage')).toBeInTheDocument();
      });
      expect(screen.getByText('Revenue by Stage')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('renders SR-only data tables for chart accessibility (AC-23)', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      const tables = screen.getAllByRole('table');
      expect(tables.length).toBe(2);
      expect(screen.getByLabelText('Deals by Stage data')).toBeInTheDocument();
      expect(screen.getByLabelText('Revenue by Stage data')).toBeInTheDocument();
    });
  });

  describe('Data Flow', () => {
    it('passes correct stats when deals have zero values', async () => {
      mockQueryState.data = {
        opportunities: [],
      };

      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByTestId('total-deals')).toHaveTextContent('0');
      expect(screen.getByTestId('total-value')).toHaveTextContent('0');
    });

    it('passes base query params (limit/sort) to opportunity.list (IFC-287)', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      expect(capturedListInput).toMatchObject({
        limit: 100,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    });

    it('wires an owner filter selection into the list query input (IFC-287 F-10)', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<DealsPage />);
      });

      // Initially no owner filter
      expect(capturedListInput?.ownerId).toBeUndefined();

      await user.click(screen.getByTestId('set-filter'));

      expect(capturedListInput?.ownerId).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('wires a date-range selection into dateFrom/dateTo (IFC-287 F-10)', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<DealsPage />);
      });

      expect(capturedListInput?.dateFrom).toBeUndefined();

      await user.click(screen.getByTestId('set-date-filter'));

      expect(capturedListInput?.dateFrom).toBeInstanceOf(Date);
      expect(capturedListInput?.dateTo).toBeInstanceOf(Date);
    });

    it('passes real owner options to DealFilters (IFC-287 F-12)', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByTestId('deal-filters')).toHaveAttribute('data-owner-count', '2');
    });

    it('navigates to deal detail on PipelineBoard deal click', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<DealsPage />);
      });

      const dealBtn = await screen.findByTestId('deal-1');
      await user.click(dealBtn);

      expect(mockPush).toHaveBeenCalledWith('/deals/1');
    });

    it('stage change calls moveStage.mutate (IFC-064 AC-001)', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<DealsPage />);
      });

      const triggerBtn = await screen.findByTestId('trigger-stage-change');
      await user.click(triggerBtn);

      expect(mockMoveStage).toHaveBeenCalledWith(
        { id: '1', targetStage: 'PROPOSAL' },
        expect.objectContaining({ onSettled: expect.any(Function) })
      );
    });
  });

  describe('IFC-064: Drag-Drop Persistence', () => {
    it('optimistic update moves deal to new stage before mutation resolves (AC-002)', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      await screen.findByTestId('pipeline-board');

      // Trigger optimistic update via onMutate callback
      expect(capturedMoveStageConfig.onMutate).toBeDefined();
      await act(async () => {
        await capturedMoveStageConfig.onMutate({ id: '1', targetStage: 'PROPOSAL' });
      });

      // Deal should now show PROPOSAL stage in the board
      const deal1 = screen.getByTestId('deal-1');
      expect(deal1.getAttribute('data-stage')).toBe('PROPOSAL');
    });

    it('error rollback reverts deal to original stage (AC-004)', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      await screen.findByTestId('pipeline-board');

      // Trigger optimistic update
      let rollbackContext: unknown;
      await act(async () => {
        rollbackContext = await capturedMoveStageConfig.onMutate({
          id: '1',
          targetStage: 'PROPOSAL',
        });
      });

      // Verify optimistic update applied
      expect(screen.getByTestId('deal-1').getAttribute('data-stage')).toBe('PROPOSAL');

      // Simulate error — onError should rollback
      await act(async () => {
        capturedMoveStageConfig.onError(
          { message: 'Server error' },
          { id: '1', targetStage: 'PROPOSAL' },
          rollbackContext
        );
      });

      // Deal should revert to original stage
      const deal1 = screen.getByTestId('deal-1');
      expect(deal1.getAttribute('data-stage')).toBe('QUALIFICATION');
    });

    it('CLOSED_LOST drag opens LossReasonModal (AC-005)', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<DealsPage />);
      });

      // Modal should not be visible initially
      expect(screen.queryByTestId('loss-reason-modal')).not.toBeInTheDocument();

      // Trigger CLOSED_LOST stage change
      const closedLostBtn = await screen.findByTestId('trigger-closed-lost');
      await user.click(closedLostBtn);

      // Modal should now be visible
      expect(screen.getByTestId('loss-reason-modal')).toBeInTheDocument();
      expect(screen.getByTestId('loss-reason-modal').getAttribute('data-deal-name')).toBe(
        'Enterprise License - Acme Corp'
      );
    });

    it('successful stage change shows success toast (AC-008)', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      // Trigger onSuccess callback
      await act(async () => {
        capturedMoveStageConfig.onSuccess();
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Deal stage updated successfully' })
      );
    });

    it('failed stage change shows error toast (AC-009)', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      // Trigger onError callback with generic error
      await act(async () => {
        capturedMoveStageConfig.onError(
          { message: 'Network error' },
          { id: '1', targetStage: 'PROPOSAL' },
          { previousDeals: [] }
        );
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to update deal stage. Please try again.',
          variant: 'destructive',
        })
      );
    });

    it('OpportunityAlreadyClosedError shows distinct error message (AC-009)', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      await act(async () => {
        capturedMoveStageConfig.onError(
          { message: 'OpportunityAlreadyClosedError' },
          { id: '1', targetStage: 'CLOSED_LOST' },
          { previousDeals: [] }
        );
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'This deal has already been closed by another user',
          variant: 'destructive',
        })
      );
    });
  });

  describe('Loading State', () => {
    it('renders skeleton UI when data is loading', async () => {
      mockQueryState.data = undefined;
      mockQueryState.isLoading = true;

      await act(async () => {
        render(<DealsPage />);
      });

      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders skeleton when auth is loading', async () => {
      mockAuthState.isLoading = true;

      await act(async () => {
        render(<DealsPage />);
      });

      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not render deal components when loading', async () => {
      mockQueryState.data = undefined;
      mockQueryState.isLoading = true;

      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.queryByTestId('pipeline-board')).not.toBeInTheDocument();
      expect(screen.queryByTestId('value-summary')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('renders error message when query fails', async () => {
      mockQueryState.data = undefined;
      mockQueryState.isLoading = false;
      mockQueryState.isError = true;
      mockQueryState.error = { message: 'Failed to fetch opportunities' };

      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByText('Failed to load deals')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch opportunities')).toBeInTheDocument();
    });

    it('renders retry button in error state', async () => {
      mockQueryState.data = undefined;
      mockQueryState.isLoading = false;
      mockQueryState.isError = true;
      mockQueryState.error = { message: 'Network error' };

      await act(async () => {
        render(<DealsPage />);
      });

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('calls refetch when retry button is clicked', async () => {
      const user = userEvent.setup();

      mockQueryState.data = undefined;
      mockQueryState.isLoading = false;
      mockQueryState.isError = true;
      mockQueryState.error = { message: 'Network error' };

      await act(async () => {
        render(<DealsPage />);
      });

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('shows redirect message for auth errors', async () => {
      mockQueryState.data = undefined;
      mockQueryState.isLoading = false;
      mockQueryState.isError = true;
      mockQueryState.error = { message: 'Unauthorized', data: { code: 'UNAUTHORIZED' } };

      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();
    });
  });
});
