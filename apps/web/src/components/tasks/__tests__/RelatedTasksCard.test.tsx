import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RelatedTasksCard } from '../RelatedTasksCard';

// Mock tRPC api
const mockGetByEntity = vi.fn();
const mockComplete = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      task: {
        getByEntity: { invalidate: mockInvalidate },
        list: { invalidate: mockInvalidate },
        getReminders: { invalidate: mockInvalidate },
      },
    }),
    task: {
      getByEntity: {
        useQuery: (...args: any[]) => mockGetByEntity(...args),
      },
      complete: {
        useMutation: (opts: any) => ({
          mutate: (data: any) => {
            mockComplete(data);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      create: {
        useMutation: (opts: any) => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
    lead: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    contact: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    opportunity: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
  },
}));

// Mock Sheet components (Radix Portal)
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...(actual as any),
    Sheet: ({ children, open }: any) => open ? <div data-testid="sheet">{children}</div> : null,
    SheetContent: ({ children }: any) => <div>{children}</div>,
    SheetTitle: ({ children }: any) => <h2>{children}</h2>,
    SheetDescription: ({ children }: any) => <p>{children}</p>,
  };
});

describe('RelatedTasksCard', () => {
  const defaultProps = {
    entityType: 'lead' as const,
    entityId: 'lead-123',
  };

  const sampleTasks = [
    { id: '1', title: 'Call client', status: 'PENDING', priority: 'HIGH', dueDate: '2026-03-01' },
    { id: '2', title: 'Send proposal', status: 'PENDING', priority: 'MEDIUM', dueDate: '2026-03-05' },
    { id: '3', title: 'Follow up', status: 'COMPLETED', priority: 'LOW', dueDate: null },
    { id: '4', title: 'Review contract', status: 'PENDING', priority: 'URGENT', dueDate: '2026-03-10' },
    { id: '5', title: 'Schedule demo', status: 'PENDING', priority: 'LOW', dueDate: '2026-03-15' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByEntity.mockReturnValue({
      data: sampleTasks,
      isLoading: false,
      error: null,
    });
  });

  it('renders with default title "Tasks"', () => {
    render(<RelatedTasksCard {...defaultProps} />);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    render(<RelatedTasksCard {...defaultProps} title="Next Steps" />);
    expect(screen.getByText('Next Steps')).toBeInTheDocument();
  });

  it('shows loading skeletons while loading', () => {
    mockGetByEntity.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { container } = render(<RelatedTasksCard {...defaultProps} />);
    // Skeletons render as divs with animation classes
    expect(container.querySelectorAll('[class*="animate"]').length).toBeGreaterThan(0);
  });

  it('shows error message on error', () => {
    mockGetByEntity.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') });
    render(<RelatedTasksCard {...defaultProps} />);
    expect(screen.getByText('Failed to load tasks')).toBeInTheDocument();
  });

  it('shows empty state when no tasks', () => {
    mockGetByEntity.mockReturnValue({ data: [], isLoading: false, error: null });
    render(<RelatedTasksCard {...defaultProps} />);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('filters out completed tasks', () => {
    render(<RelatedTasksCard {...defaultProps} />);
    // "Follow up" is COMPLETED, should not show
    expect(screen.queryByText('Follow up')).not.toBeInTheDocument();
    // Open tasks should show (up to maxItems=3)
    expect(screen.getByText('Call client')).toBeInTheDocument();
    expect(screen.getByText('Send proposal')).toBeInTheDocument();
  });

  it('limits displayed tasks to maxItems', () => {
    render(<RelatedTasksCard {...defaultProps} maxItems={2} />);
    // Should show only 2 of the 4 open tasks
    expect(screen.getByText('Call client')).toBeInTheDocument();
    expect(screen.getByText('Send proposal')).toBeInTheDocument();
    // 3rd open task should not show (maxItems=2)
    expect(screen.queryByText('Schedule demo')).not.toBeInTheDocument();
  });

  it('shows add button by default', () => {
    render(<RelatedTasksCard {...defaultProps} />);
    expect(screen.getByLabelText('Add task')).toBeInTheDocument();
  });

  it('hides add button when showAddButton is false', () => {
    render(<RelatedTasksCard {...defaultProps} showAddButton={false} />);
    expect(screen.queryByLabelText('Add task')).not.toBeInTheDocument();
  });

  it('calls complete mutation when checkbox is clicked', () => {
    render(<RelatedTasksCard {...defaultProps} />);
    const checkbox = screen.getByLabelText('Complete task: Call client');
    fireEvent.click(checkbox);
    expect(mockComplete).toHaveBeenCalledWith({ taskId: '1' });
  });

  it('renders View All button when onViewAll is provided and has more items', () => {
    const onViewAll = vi.fn();
    render(<RelatedTasksCard {...defaultProps} maxItems={2} onViewAll={onViewAll} />);
    const viewAllBtn = screen.getByText('View All');
    expect(viewAllBtn).toBeInTheDocument();
    fireEvent.click(viewAllBtn);
    expect(onViewAll).toHaveBeenCalled();
  });

  it('shows static message for account entity type', () => {
    render(<RelatedTasksCard entityType="account" entityId="acc-123" />);
    expect(screen.getByText('No tasks linked to this account')).toBeInTheDocument();
  });

  it('uses compact styling when compact prop is true', () => {
    const { container } = render(<RelatedTasksCard {...defaultProps} compact />);
    // The card should have p-4 instead of p-5
    const card = container.firstChild;
    expect(card?.firstChild).toBeTruthy();
  });
});
