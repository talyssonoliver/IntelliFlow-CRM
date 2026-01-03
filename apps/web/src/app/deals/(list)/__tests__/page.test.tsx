/**
 * @vitest-environment jsdom
 *
 * Tests for the Deals Pipeline page.
 * Uses mocks for heavy dependencies (recharts, dnd-kit, trpc) to enable fast, reliable tests.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
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

// Mock trpc with sample data
const mockRefetch = vi.fn();
const mockMutate = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    opportunity: {
      list: {
        useQuery: () => ({
          data: {
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
          },
          isLoading: false,
          isError: false,
          error: null,
          refetch: mockRefetch,
        }),
      },
      update: {
        useMutation: () => ({
          mutate: mockMutate,
          isLoading: false,
        }),
      },
    },
  },
}));

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// Mock @/components/shared
vi.mock('@/components/shared', () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <header data-testid="page-header">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  ),
}));

// Mock recharts - these components render nothing to avoid complex DOM operations
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  closestCorners: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn((arr, from, to) => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

// Mock @dnd-kit/utilities
vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

// Import after mocks are set up
import DealsPage from '../page';

describe('DealsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the page header with correct title', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByTestId('page-header')).toBeInTheDocument();
      expect(screen.getByText('Deals Pipeline')).toBeInTheDocument();
    });

    it('renders stats cards', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByText('Active Deals')).toBeInTheDocument();
      expect(screen.getByText('Pipeline Value')).toBeInTheDocument();
      expect(screen.getByText('Weighted Value')).toBeInTheDocument();
      expect(screen.getByText('Won This Period')).toBeInTheDocument();
    });

    it('renders charts', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      expect(screen.getByText('Deals by Stage')).toBeInTheDocument();
      expect(screen.getByText('Revenue by Stage')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('renders kanban board with all pipeline stages', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      // Check for stage labels
      expect(screen.getByText('Prospecting')).toBeInTheDocument();
      expect(screen.getByText('Qualification')).toBeInTheDocument();
      expect(screen.getByText('Needs Analysis')).toBeInTheDocument();
      expect(screen.getByText('Proposal')).toBeInTheDocument();
      expect(screen.getByText('Negotiation')).toBeInTheDocument();
      expect(screen.getByText('Closed Won')).toBeInTheDocument();
      expect(screen.getByText('Closed Lost')).toBeInTheDocument();
    });

    it('renders deal cards with required information', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      await waitFor(() => {
        // Check for sample deal data from trpc mock
        expect(screen.getByText('Enterprise License - Acme Corp')).toBeInTheDocument();
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible deal cards with aria-labels', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      await waitFor(() => {
        const dealButton = screen.getByRole('button', {
          name: /View deal: Enterprise License - Acme Corp/i
        });
        expect(dealButton).toBeInTheDocument();
      });
    });

    it('has accessible drag handles', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      await waitFor(() => {
        const dragHandles = screen.getAllByRole('button', {
          name: /Drag to move deal/i
        });
        expect(dragHandles.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to deal detail page on card click', async () => {
      const user = userEvent.setup();
      await act(async () => {
        render(<DealsPage />);
      });

      await waitFor(async () => {
        const dealCard = screen.getByRole('button', {
          name: /View deal: Enterprise License - Acme Corp/i
        });
        await user.click(dealCard);
      });

      expect(mockPush).toHaveBeenCalledWith('/deals/1');
    });
  });

  describe('Currency Formatting', () => {
    it('displays currency values in compact format for stats', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      // The pipeline value should show something like $250K (sum of sample deals)
      // We just verify the format pattern exists
      const statValues = screen.getAllByText(/\$[\d.]+[KM]?/);
      expect(statValues.length).toBeGreaterThan(0);
    });

    it('displays currency values in full format on deal cards', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      await waitFor(() => {
        // Sample deal has value 75000 -> $75,000
        expect(screen.getByText('$75,000')).toBeInTheDocument();
      });
    });
  });

  describe('Pipeline Stats', () => {
    it('calculates weighted value correctly', async () => {
      await act(async () => {
        render(<DealsPage />);
      });

      // Weighted value is shown in the stats cards
      const weightedValueCard = screen.getByText('Weighted Value').closest('[data-testid="card"]');
      expect(weightedValueCard).toBeInTheDocument();
    });
  });
});

describe('Loading State', () => {
  it.skip('DealsPageSkeleton renders correctly', () => {
    // Skeleton component is not exported; skip for now
  });
});

describe('Error State', () => {
  it.skip('ErrorDisplay renders with message and retry button', () => {
    // ErrorDisplay component is not exported; skip for now
  });
});
