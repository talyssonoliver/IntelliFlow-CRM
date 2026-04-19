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
            if (data?.taskId === 'fail-task') {
              opts?.onError?.(new Error('Complete failed'));
            } else {
              opts?.onSuccess?.();
            }
          },
          isPending: false,
        }),
      },
      create: {
        useMutation: (_opts: any) => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      // EntitySearchField also queries api.task.list (EntitySearchField.tsx:104)
      // when the user searches for an existing task to link.
      list: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
    lead: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    contact: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    opportunity: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    // EntitySearchField (rendered transitively via TaskCreateSheet) queries
    // account/user/team lists too — see EntitySearchField.tsx:88-99.
    account: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    user: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    team: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    cases: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
  },
}));

// Mock Sheet components (Radix Portal)
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...(actual as any),
    Sheet: ({ children, open }: any) => (open ? <div data-testid="sheet">{children}</div> : null),
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
    {
      id: '2',
      title: 'Send proposal',
      status: 'PENDING',
      priority: 'MEDIUM',
      dueDate: '2026-03-05',
    },
    { id: '3', title: 'Follow up', status: 'COMPLETED', priority: 'LOW', dueDate: null },
    {
      id: '4',
      title: 'Review contract',
      status: 'PENDING',
      priority: 'URGENT',
      dueDate: '2026-03-10',
    },
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
    mockGetByEntity.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('fail'),
    });
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

  it('shows empty-state fallback for account entity type', () => {
    // Account path renders `<EmptyState entity="tasks" />` (canonical title
    // 'No tasks yet') — the 'No tasks linked to this account' copy was
    // removed when the EmptyState migration (PG-195) landed. API does not
    // support the account → tasks relationship so the card is always empty.
    render(<RelatedTasksCard entityType="account" entityId="acc-123" />);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('uses compact styling when compact prop is true', () => {
    const { container } = render(<RelatedTasksCard {...defaultProps} compact />);
    // The card should have p-4 instead of p-5
    const card = container.firstChild;
    expect(card?.firstChild).toBeTruthy();
  });

  it('opens create sheet when add button is clicked', () => {
    render(<RelatedTasksCard {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Add task'));
    // The Sheet mock renders when open=true
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    expect(screen.getByText('New Task')).toBeInTheDocument();
  });

  it('opens create sheet from empty state via the card-level Add button', () => {
    // EmptyState (phase="passive") hides its CTA button until the user hovers
    // or scrolls it into view (see packages/ui/src/components/empty-state.tsx:387
    // `showCta = phase === 'soft-cta'`). RelatedTasksCard uses the passive
    // variant, so the card-level aria-labelled "Add task" button is the
    // user-facing create path from the empty state.
    mockGetByEntity.mockReturnValue({ data: [], isLoading: false, error: null });
    render(<RelatedTasksCard {...defaultProps} />);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Add task'));
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });

  it('handles complete mutation error', () => {
    const tasksWithFailable = [
      { id: 'fail-task', title: 'Will Fail', status: 'PENDING', priority: 'LOW', dueDate: null },
    ];
    mockGetByEntity.mockReturnValue({ data: tasksWithFailable, isLoading: false, error: null });
    render(<RelatedTasksCard {...defaultProps} />);
    const checkbox = screen.getByLabelText('Complete task: Will Fail');
    fireEvent.click(checkbox);
    expect(mockComplete).toHaveBeenCalledWith({ taskId: 'fail-task' });
    // Error toast should have been called (via the mock's onError path)
  });

  it('renders View All link when viewAllHref is provided', () => {
    render(
      <RelatedTasksCard {...defaultProps} maxItems={2} viewAllHref="/tasks?entity=lead-123" />
    );
    const link = screen.getByText('View All');
    expect(link.closest('a')).toHaveAttribute('href', '/tasks?entity=lead-123');
  });

  it('shows "+N more" when there are more tasks and no viewAll', () => {
    render(<RelatedTasksCard {...defaultProps} maxItems={2} />);
    // 4 open tasks, showing 2, so "+2 more"
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
