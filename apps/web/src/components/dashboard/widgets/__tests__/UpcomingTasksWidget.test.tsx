// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { UpcomingTasksWidget } from '../UpcomingTasksWidget';

// What lead.list returns for the follow-ups query; each test sets it.
const followUpQuery = vi.hoisted(() => ({
  state: { data: { data: [], total: 0 }, isLoading: false } as {
    data: { data: unknown[]; total: number } | undefined;
    isLoading: boolean;
  },
  lastInput: undefined as Record<string, unknown> | undefined,
}));

// What waiting.list returns for the "Waiting for reply" section (MVP-014); each test sets it.
const waitingQuery = vi.hoisted(() => ({
  state: { data: { items: [], total: 0 }, isLoading: false } as {
    data: { items: unknown[]; total: number; leadTotal?: number } | undefined;
    isLoading: boolean;
  },
  lastInput: undefined as Record<string, unknown> | undefined,
}));

// Mock TaskCreateSheet to avoid deep tRPC dependency chain
vi.mock('@/components/tasks/TaskCreateSheet', () => ({
  TaskCreateSheet: () => null,
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));

// Mock the tRPC API
vi.mock('@/lib/api', () => ({
  api: {
    task: {
      list: {
        useQuery: vi.fn(() => ({
          data: { tasks: [] },
          isLoading: false,
        })),
      },
      complete: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
        })),
      },
      create: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
          isPending: false,
        })),
      },
    },
    lead: {
      list: {
        useQuery: vi.fn((input: Record<string, unknown>) => {
          followUpQuery.lastInput = input;
          return followUpQuery.state;
        }),
      },
    },
    waiting: {
      list: {
        useQuery: vi.fn((input: Record<string, unknown>) => {
          waitingQuery.lastInput = input;
          return waitingQuery.state;
        }),
      },
    },
    useUtils: vi.fn(() => ({
      task: {
        list: {
          invalidate: vi.fn(),
        },
        getReminders: {
          invalidate: vi.fn(),
        },
      },
    })),
  },
}));

const lead = (over: Record<string, unknown>) => ({
  id: 'lead-1',
  firstName: 'Jane',
  lastName: 'Example',
  company: 'Example Corp',
  email: 'jane@example.invalid',
  lastContactedAt: '2020-01-01T10:00:00.000Z',
  ...over,
});

describe('UpcomingTasksWidget', () => {
  beforeEach(() => {
    followUpQuery.state = { data: { data: [], total: 0 }, isLoading: false };
    followUpQuery.lastInput = undefined;
    waitingQuery.state = { data: { items: [], total: 0 }, isLoading: false };
    waitingQuery.lastInput = undefined;
  });

  it('lists who is waiting for a reply, oldest first, instead of the empty state', () => {
    const since = new Date(Date.now() - 2 * 86_400_000 - 3_600_000).toISOString();
    waitingQuery.state = {
      data: {
        items: [
          { kind: 'lead', id: 'lead-9', name: 'Jane Example', company: null, since, subject: 'Hi' },
        ],
        total: 4,
        leadTotal: 3,
      },
      isLoading: false,
    };
    render(<UpcomingTasksWidget />);

    expect(waitingQuery.lastInput).toEqual({ limit: 3 });
    const section = within(screen.getByTestId('waiting-for-reply'));
    expect(
      within(screen.getByTestId('waiting-for-reply')).getByText('4 waiting for a reply')
    ).toBeInTheDocument();
    expect(section.getByText('waiting 2 days')).toBeInTheDocument();
    expect(screen.queryByText('No tasks yet')).toBeNull();
  });

  it('shows no waiting section when nobody is waiting', () => {
    render(<UpcomingTasksWidget />);
    expect(screen.queryByTestId('waiting-for-reply')).toBeNull();
  });

  it('renders widget title and view all link', () => {
    render(<UpcomingTasksWidget />);

    expect(screen.getByText('Upcoming Tasks')).toBeInTheDocument();
    expect(screen.getByText('View All')).toHaveAttribute('href', '/tasks');
  });

  it('offers one create-task action when there are no tasks', () => {
    render(<UpcomingTasksWidget />);

    // The empty state shows no button of its own; the header's (+) "Add task" is the only one.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Add task');
  });

  it('with nothing due shows the empty state and no follow-ups section', () => {
    render(<UpcomingTasksWidget />);

    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(screen.queryByTestId('follow-ups-due')).toBeNull();
  });

  it('asks for contacted leads, newest due first, and nothing else (#46)', () => {
    render(<UpcomingTasksWidget />);

    // Newest due first: today's follow-ups lead, then the most recently overdue (#46). The card
    // reads the Tasks page's 25 rows (one shared query) and lists 3.
    expect(followUpQuery.lastInput).toMatchObject({
      status: ['CONTACTED'],
      sortBy: 'lastContactedAt',
      sortOrder: 'desc',
      limit: 25,
      page: 1,
    });
    expect(followUpQuery.lastInput?.lastContactedBefore).toBeInstanceOf(Date);
  });

  it('lists due follow-ups when there are no tasks, instead of the empty state', () => {
    followUpQuery.state = {
      data: {
        data: [lead({}), lead({ id: 'lead-2', firstName: 'Bob', lastName: 'Stone' })],
        total: 5,
      },
      isLoading: false,
    };
    render(<UpcomingTasksWidget />);

    const section = within(screen.getByTestId('follow-ups-due'));
    expect(within(screen.getByTestId('follow-ups-due')).getByText(/5 overdue/)).toBeInTheDocument();
    // The row names the lead; the block heading already says these are follow-ups (owner 21/11).
    expect(section.getByRole('link', { name: /^Jane Example/ })).toBeInTheDocument();
    expect(section.getByRole('link', { name: /Bob Stone/ })).toHaveAttribute(
      'href',
      '/leads/lead-2'
    );
    expect(screen.queryByText('No tasks yet')).toBeNull();
    // Still one create action.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('does not show the empty state while the follow-ups are still loading', () => {
    followUpQuery.state = { data: undefined, isLoading: true };
    render(<UpcomingTasksWidget />);

    expect(screen.queryByText('No tasks yet')).toBeNull();
  });
});
