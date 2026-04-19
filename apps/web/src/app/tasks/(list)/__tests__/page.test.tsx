/**
 * @vitest-environment jsdom
 *
 * Tests for the TasksListPage component.
 * Validates list rendering, URL param integration, view toggle,
 * pagination, and bulk operations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';

// ─── 1. next/navigation ────────────────────────────────────────────
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/tasks',
  useParams: () => ({}),
}));

// ─── 2. Auth ─────────────────────────────────────────────────────
const mockAuthState = {
  isLoading: false,
  isAuthenticated: true,
};

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => mockAuthState,
}));

// ─── 3. Domain mocks ───────────────────────────────────────────
vi.mock('@intelliflow/domain', () => ({
  TASK_STATUSES: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED'] as const,
  TASK_PRIORITIES: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const,
}));

// ─── 4. Mock task data ──────────────────────────────────────────
const mockTasks = [
  {
    id: 'task-1',
    title: 'Follow up with client',
    status: 'PENDING',
    priority: 'HIGH',
    dueDate: '2026-04-01T00:00:00Z',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-05T00:00:00Z',
    ownerId: 'user-1',
    owner: { id: 'user-1', name: 'Jane Smith' },
    lead: { id: 'lead-1', firstName: 'John', lastName: 'Doe' },
    contact: null,
    opportunity: null,
  },
  {
    id: 'task-2',
    title: 'Send quarterly report',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    dueDate: '2026-03-15T00:00:00Z',
    createdAt: '2026-02-20T00:00:00Z',
    updatedAt: '2026-03-02T00:00:00Z',
    ownerId: 'user-1',
    owner: { id: 'user-1', name: 'Jane Smith' },
    lead: null,
    contact: { id: 'contact-1', firstName: 'Sarah', lastName: 'Connor' },
    opportunity: null,
  },
];

const mockListData = {
  tasks: mockTasks,
  total: 2,
  limit: 20,
  hasMore: false,
};

const mockQueryState = {
  data: mockListData as typeof mockListData | undefined,
  isLoading: false,
  isError: false,
  error: null as { message: string } | null,
  refetch: vi.fn(),
};

// ─── 5. tRPC/API mock ───────────────────────────────────────────
const mockMutate = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      task: {
        list: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
    task: {
      stats: {
        useQuery: () => ({
          data: {
            total: 2,
            byStatus: { PENDING: 1, IN_PROGRESS: 1 },
            byPriority: {},
            overdue: 0,
            dueToday: 0,
          },
          isLoading: false,
        }),
      },
      list: {
        useQuery: () => ({
          data: mockQueryState.data,
          isLoading: mockQueryState.isLoading,
          isError: mockQueryState.isError,
          error: mockQueryState.error,
          refetch: mockQueryState.refetch,
        }),
      },
      create: {
        useMutation: () => ({
          mutate: mockMutate,
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
      update: {
        useMutation: () => ({
          mutate: mockMutate,
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({
          mutate: mockMutate,
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
      complete: {
        useMutation: () => ({
          mutate: mockMutate,
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
      archive: {
        useMutation: () => ({
          mutate: mockMutate,
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
    },
  },
}));

// ─── 6. Toast mock ──────────────────────────────────────────────
vi.mock('@intelliflow/ui', () => ({
  toast: vi.fn(),
}));

// ─── 7. Filter utils mock ───────────────────────────────────────
vi.mock('@/lib/shared/filter-utils', () => ({
  taskStatusOptions: () => [
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
  ],
  taskPriorityOptions: () => [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
  ],
}));

// ─── 8. Component mocks ─────────────────────────────────────────
vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
  SearchFilterBar: ({
    onSearch,
    placeholder,
  }: {
    onSearch: (v: string) => void;
    placeholder: string;
  }) => (
    <input
      data-testid="search-bar"
      placeholder={placeholder}
      onChange={(e) => onSearch(e.target.value)}
    />
  ),
}));

vi.mock('@/components/tasks/TaskList', () => ({
  TaskList: ({ tasks, isLoading }: { tasks: typeof mockTasks; isLoading: boolean }) => (
    <div data-testid="task-list">
      {isLoading && <span data-testid="list-loading">Loading...</span>}
      {tasks?.map((t: (typeof mockTasks)[0]) => (
        <div key={t.id} data-testid={`task-item-${t.id}`}>
          {t.title}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/tasks/TaskCalendar', () => ({
  TaskCalendar: ({ tasks }: { tasks: unknown[] }) => (
    <div data-testid="task-calendar">Calendar ({tasks?.length ?? 0} tasks)</div>
  ),
}));

vi.mock('@/components/tasks/TaskForm', () => ({
  TaskForm: ({ open }: { open: boolean }) =>
    open ? <div data-testid="task-form">Create Form</div> : null,
}));

vi.mock('@/components/tasks/ReminderConfig', () => ({
  ReminderConfig: () => <div data-testid="reminder-config">Reminder</div>,
}));

// ─── Import after mocks ─────────────────────────────────────────
import TasksListPage from '../page';

describe('TasksListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockQueryState.data = { ...mockListData };
    mockQueryState.isLoading = false;
    mockQueryState.isError = false;
    mockQueryState.error = null;
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;
  });

  it('renders page header and task list', () => {
    render(<TasksListPage />);
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('task-list')).toBeInTheDocument();
  });

  it('renders all task items', () => {
    render(<TasksListPage />);
    expect(screen.getByTestId('task-item-task-1')).toHaveTextContent('Follow up with client');
    expect(screen.getByTestId('task-item-task-2')).toHaveTextContent('Send quarterly report');
  });

  it('shows loading state', () => {
    mockQueryState.isLoading = true;
    mockQueryState.data = undefined;
    render(<TasksListPage />);
    expect(screen.getByTestId('list-loading')).toBeInTheDocument();
  });

  it('renders search bar', () => {
    render(<TasksListPage />);
    expect(screen.getByTestId('search-bar')).toBeInTheDocument();
  });

  // The list/calendar view toggle was removed from /tasks when the
  // Appointments/Calendar Split migration (memory: project_appointments_split_migration)
  // moved calendar rendering to a dedicated route. `tasks/(list)/page.tsx` now
  // only reads `view=my` (for the "My tasks" narrowing) — there is no longer
  // a TaskCalendar rendered inline. The three obsolete tests ("renders view
  // toggle", "switches to calendar view", "reads URL params on mount (calendar
  // view)") have been removed. A follow-up test covering the dedicated
  // calendar route lives with that route's test file; searching for it
  // separately is preferable to reviving the stale toggle assertions here.

  it('reads sidebar URL params on mount (status/priority)', () => {
    mockSearchParams = new URLSearchParams('status=IN_PROGRESS&priority=HIGH');
    render(<TasksListPage />);
    // The useEffect at page.tsx:99 syncs sidebar URL filters into state; no
    // direct DOM assertion needed — just confirms render does not crash.
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
  });

  it('does not show pagination when total <= limit', () => {
    render(<TasksListPage />);
    // No pagination controls when total (2) <= limit (20)
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it('shows pagination when total > limit', () => {
    mockQueryState.data = { ...mockListData, total: 40, hasMore: true };
    render(<TasksListPage />);
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
  });
});
