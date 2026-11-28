// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
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

// The three "done" mutations; each test checks which one a checkbox calls.
const done = vi.hoisted(() => ({
  completeTask: vi.fn(),
  logActivity: vi.fn(),
  dismiss: vi.fn(),
  tasks: [] as unknown[],
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
          data: { tasks: done.tasks },
          isLoading: false,
        })),
      },
      complete: {
        useMutation: vi.fn(() => ({
          mutate: done.completeTask,
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
      logActivity: {
        useMutation: vi.fn(() => ({ mutate: done.logActivity, isPending: false })),
      },
      list: {
        useQuery: vi.fn((input: Record<string, unknown>) => {
          followUpQuery.lastInput = input;
          return followUpQuery.state;
        }),
      },
    },
    waiting: {
      dismiss: {
        useMutation: vi.fn(() => ({ mutate: done.dismiss, isPending: false })),
      },
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
      lead: { list: { invalidate: vi.fn() } },
      waiting: { list: { invalidate: vi.fn() } },
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
    done.tasks = [];
    done.completeTask.mockReset();
    done.logActivity.mockReset();
    done.dismiss.mockReset();
  });

  const allThreeKinds = () => {
    done.tasks = [
      {
        id: 'task-1',
        title: 'Send the proposal',
        priority: 'HIGH',
        dueDate: '2020-01-01T00:00:00.000Z',
      },
    ];
    followUpQuery.state = {
      data: { data: [lead({ lastContactedAt: '2020-01-01T10:00:00.000Z' })], total: 1 },
      isLoading: false,
    };
    waitingQuery.state = {
      data: {
        items: [
          {
            kind: 'contact',
            id: 'c-1',
            name: 'Omar Example',
            company: null,
            since: new Date(Date.now() - 4 * 86_400_000 - 3_600_000).toISOString(),
            subject: 'unsubscribe',
          },
        ],
        total: 1,
        leadTotal: 0,
      },
      isLoading: false,
    };
  };

  it('shows tasks, follow-ups and replies in one row shape: checkbox, title, "Kind · when"', () => {
    allThreeKinds();
    render(<UpcomingTasksWidget />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    const metas = screen.getAllByTestId('todo-meta').map((m) => m.textContent);
    expect(metas[0]).toBe('Task · High · Overdue');
    expect(metas[1]).toMatch(/^Follow-up · Overdue by \d+ days · last contacted 1 Jan$/);
    expect(metas[2]).toBe('Reply · waiting 4 days · Re: unsubscribe');
    // Each row opens its task, lead or person.
    expect(screen.getByRole('link', { name: /Send the proposal/ })).toHaveAttribute(
      'href',
      '/tasks/task-1'
    );
    expect(screen.getByRole('link', { name: /Omar Example/ })).toHaveAttribute(
      'href',
      '/contacts/c-1'
    );
  });

  it('the checkbox means done for every kind, each through its own mutation', () => {
    allThreeKinds();
    render(<UpcomingTasksWidget />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Complete task: Send the proposal' }));
    expect(done.completeTask).toHaveBeenCalledWith({ taskId: 'task-1' });

    fireEvent.click(screen.getByRole('checkbox', { name: /Mark done: Follow up with Jane/ }));
    expect(done.logActivity).toHaveBeenCalledWith({
      leadId: 'lead-1',
      type: 'NOTE',
      title: 'Followed up',
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /handled without a reply: Omar/ }));
    expect(done.dismiss).toHaveBeenCalledWith({ kind: 'contact', id: 'c-1' });

    expect(done.completeTask).toHaveBeenCalledTimes(1);
    expect(done.logActivity).toHaveBeenCalledTimes(1);
    expect(done.dismiss).toHaveBeenCalledTimes(1);
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
    expect(section.getByText(/^waiting 2 days/)).toBeInTheDocument();
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
    // The row says the action and names the lead (owner 21/11: "It isn't showing what is the action").
    expect(section.getByRole('link', { name: /^Follow up with Jane Example/ })).toBeInTheDocument();
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
