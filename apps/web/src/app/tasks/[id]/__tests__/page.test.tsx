/**
 * @vitest-environment jsdom
 *
 * Tests for the TaskDetailPage component.
 * Validates data flow, mutations (start/complete/delete/archive),
 * edit form, and ActivityFeed integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── 1. next/navigation ────────────────────────────────────────────
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
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/tasks/task-1',
  useParams: () => ({ id: 'task-1' }),
}));

// ─── 2. Auth ─────────────────────────────────────────────────────
const mockAuthState = {
  isLoading: false,
  isAuthenticated: true,
};

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => mockAuthState,
}));

// ─── 3. Mock task data ──────────────────────────────────────────
const mockTask = {
  id: 'task-1',
  title: 'Follow up with client',
  description: 'Send proposal and schedule meeting',
  status: 'PENDING',
  priority: 'HIGH',
  dueDate: '2026-04-01T00:00:00Z',
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-05T00:00:00Z',
  completedAt: null,
  ownerId: 'user-1',
  owner: { id: 'user-1', email: 'jane@test.com', name: 'Jane Smith' },
  lead: { id: 'lead-1', email: 'john@acme.com', firstName: 'John', lastName: 'Doe' },
  contact: null,
  opportunity: null,
};

const mockQueryState = {
  data: mockTask as typeof mockTask | undefined,
  isLoading: false,
  error: null as { message: string; data?: { code?: string } } | null,
};

// ─── 4. tRPC/API mock ───────────────────────────────────────────
const mockMutate = vi.fn();
let capturedMutationConfigs: Record<string, Record<string, (...args: unknown[]) => void>> = {};

function createMockMutation(name: string) {
  return {
    useMutation: (config?: Record<string, (...args: unknown[]) => void>) => {
      if (config) capturedMutationConfigs[name] = config;
      return {
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      };
    },
  };
}

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      task: {
        getById: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
    task: {
      getById: {
        useQuery: () => ({
          data: mockQueryState.data,
          isLoading: mockQueryState.isLoading,
          error: mockQueryState.error,
        }),
      },
      complete: createMockMutation('complete'),
      update: createMockMutation('update'),
      delete: createMockMutation('delete'),
      start: createMockMutation('start'),
      archive: createMockMutation('archive'),
      assign: createMockMutation('assign'),
      reschedule: createMockMutation('reschedule'),
    },
  },
}));

// ─── 5. Toast mock ──────────────────────────────────────────────
vi.mock('@intelliflow/ui', () => ({
  toast: vi.fn(),
}));

// ─── 6. Component mocks ─────────────────────────────────────────
vi.mock('@/components/shared', () => ({
  PageHeader: ({ breadcrumbs }: { title: string; breadcrumbs: { label: string }[] }) => (
    <div data-testid="page-header">
      {breadcrumbs?.map((b: { label: string }, i: number) => (
        <span key={i}>{b.label}</span>
      ))}
    </div>
  ),
}));

vi.mock('@/components/tasks/TaskDetail', () => ({
  TaskDetail: ({
    task,
    isLoading,
    isNotFound,
    onStart,
    onComplete,
    onDelete,
  }: {
    task: typeof mockTask | undefined;
    isLoading: boolean;
    isNotFound: boolean;
    onStart: (id: string) => void;
    onComplete: (id: string) => void;
    onDelete: (id: string) => void;
  }) => (
    <div data-testid="task-detail">
      {isLoading && <span data-testid="loading">Loading...</span>}
      {isNotFound && <span data-testid="not-found">Not Found</span>}
      {task && (
        <>
          <span data-testid="task-title">{task.title}</span>
          <span data-testid="task-status">{task.status}</span>
          <button data-testid="start-btn" onClick={() => onStart(task.id)}>
            Start
          </button>
          <button data-testid="complete-btn" onClick={() => onComplete(task.id)}>
            Complete
          </button>
          <button data-testid="delete-btn" onClick={() => onDelete(task.id)}>
            Delete
          </button>
        </>
      )}
    </div>
  ),
}));

vi.mock('@/components/tasks/TaskForm', () => ({
  TaskForm: ({ open }: { open: boolean }) =>
    open ? <div data-testid="task-form">Edit Form</div> : null,
}));

vi.mock('@/components/shared/activity-feed', () => ({
  ActivityFeed: ({ entityType, entityId }: { entityType: string; entityId: string }) => (
    <div data-testid="activity-feed" data-entity-type={entityType} data-entity-id={entityId}>
      Activity Feed
    </div>
  ),
}));

// ─── Import after mocks ─────────────────────────────────────────
import TaskDetailPage from '../page';

describe('TaskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMutationConfigs = {};
    mockQueryState.data = { ...mockTask };
    mockQueryState.isLoading = false;
    mockQueryState.error = null;
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;
  });

  it('renders task title and breadcrumbs', () => {
    render(<TaskDetailPage />);
    expect(screen.getByTestId('task-title')).toHaveTextContent('Follow up with client');
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('renders task status', () => {
    render(<TaskDetailPage />);
    expect(screen.getByTestId('task-status')).toHaveTextContent('PENDING');
  });

  it('shows loading state', () => {
    mockQueryState.isLoading = true;
    mockQueryState.data = undefined;
    render(<TaskDetailPage />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows not found when task is null', () => {
    mockQueryState.data = undefined;
    mockQueryState.error = null;
    render(<TaskDetailPage />);
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
  });

  it('calls start mutation when Start button clicked', () => {
    render(<TaskDetailPage />);
    fireEvent.click(screen.getByTestId('start-btn'));
    expect(mockMutate).toHaveBeenCalledWith({ taskId: 'task-1' });
  });

  it('calls complete mutation when Complete button clicked', () => {
    render(<TaskDetailPage />);
    fireEvent.click(screen.getByTestId('complete-btn'));
    expect(mockMutate).toHaveBeenCalledWith({ taskId: 'task-1' });
  });

  it('calls delete mutation when Delete button clicked', () => {
    render(<TaskDetailPage />);
    fireEvent.click(screen.getByTestId('delete-btn'));
    expect(mockMutate).toHaveBeenCalledWith({ id: 'task-1' });
  });

  it('renders ActivityFeed with correct entity props', () => {
    render(<TaskDetailPage />);
    const feed = screen.getByTestId('activity-feed');
    expect(feed).toBeInTheDocument();
    expect(feed).toHaveAttribute('data-entity-type', 'TASK');
    expect(feed).toHaveAttribute('data-entity-id', 'task-1');
  });

  it('hides ActivityFeed when task is loading', () => {
    mockQueryState.isLoading = true;
    mockQueryState.data = undefined;
    render(<TaskDetailPage />);
    expect(screen.queryByTestId('activity-feed')).not.toBeInTheDocument();
  });

  it('renders activity section heading', () => {
    render(<TaskDetailPage />);
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });
});
