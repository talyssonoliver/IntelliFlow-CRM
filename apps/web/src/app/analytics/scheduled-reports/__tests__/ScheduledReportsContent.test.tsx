/**
 * ScheduledReportsContent Tests — PG-201
 * Real-data list, canonical empty state, manager-only CTAs, toggle/delete wiring,
 * TagsTab ref wiring, dialog submit, honest delivery-status card.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ─── tRPC mock ─────────────────────────────────────────────────────────────
const queries = {
  list: vi.fn(),
  tags: vi.fn(),
  templates: vi.fn(),
};
const mutationOpts: Record<
  string,
  { onSuccess?: () => unknown; onError?: (e: { message: string }) => void }
> = {};
const mutations: Record<
  string,
  {
    mutate: ReturnType<typeof vi.fn>;
    mutateAsync: ReturnType<typeof vi.fn>;
    isPending: boolean;
    variables?: unknown;
  }
> = {};
const invalidate = { list: vi.fn(), tags: vi.fn() };

function mutationHook(name: string) {
  return (opts: (typeof mutationOpts)[string]) => {
    mutationOpts[name] = opts;
    return mutations[name];
  };
}

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      analytics: {
        scheduledReports: {
          list: { invalidate: invalidate.list },
          tags: { list: { invalidate: invalidate.tags } },
        },
      },
    }),
    analytics: {
      reportTemplates: { list: { useQuery: (...a: unknown[]) => queries.templates(...a) } },
      scheduledReports: {
        list: { useQuery: (...a: unknown[]) => queries.list(...a) },
        create: { useMutation: mutationHook('create') },
        update: { useMutation: mutationHook('update') },
        setActive: { useMutation: mutationHook('setActive') },
        delete: { useMutation: mutationHook('delete') },
        tags: {
          list: { useQuery: (...a: unknown[]) => queries.tags(...a) },
          create: { useMutation: mutationHook('tagCreate') },
          update: { useMutation: mutationHook('tagUpdate') },
          delete: { useMutation: mutationHook('tagDelete') },
        },
      },
    },
  },
}));

let role = 'ADMIN';
let authLoading = false;
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: authLoading,
    isAuthenticated: true,
    user: { id: 'u1', email: 'u1@example.invalid', role },
  }),
}));

const toast = vi.fn();
vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
  toast: (...args: unknown[]) => toast(...args),
}));

vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: ({ id, value }: { id?: string; value: string }) => (
    <select id={id} value={value} onChange={() => undefined}>
      <option value={value}>{value}</option>
    </select>
  ),
}));

import ScheduledReportsContent from '../ScheduledReportsContent';

const TEMPLATE_ID = 'clh3x2k8a0000qz8l1v2r3s4t';

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Weekly pipeline',
    description: null,
    templateId: TEMPLATE_ID,
    templateName: 'Pipeline',
    templateHidden: false,
    reportId: null,
    cadence: 'weekly',
    dayOfWeek: 1,
    dayOfMonth: null,
    timeOfDay: '09:00',
    cronExpression: '0 9 * * 1',
    timezone: 'Europe/London',
    recipients: ['lead@example.invalid'],
    format: 'pdf',
    colorToken: 'blue',
    tags: [],
    isActive: true,
    lastRunAt: null,
    nextRunAt: '2026-10-19T08:00:00.000Z',
    createdBy: 'u1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup({
  list = [schedule()],
  listLoading = false,
  listError,
  tags = [],
}: {
  list?: unknown[];
  listLoading?: boolean;
  listError?: { message: string };
  tags?: unknown[];
} = {}) {
  queries.list.mockReturnValue({ data: list, isLoading: listLoading, error: listError });
  queries.tags.mockReturnValue({ data: tags, isLoading: false });
  queries.templates.mockReturnValue({ data: [{ id: TEMPLATE_ID, name: 'Pipeline' }] });
  for (const name of [
    'create',
    'update',
    'setActive',
    'delete',
    'tagCreate',
    'tagUpdate',
    'tagDelete',
  ]) {
    mutations[name] = {
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    };
  }
}

beforeEach(() => {
  role = 'ADMIN';
  authLoading = false;
  toast.mockReset();
  invalidate.list.mockReset();
  invalidate.tags.mockReset();
});

describe('ScheduledReportsContent', () => {
  it('shows the bento skeleton while loading', () => {
    setup({ listLoading: true });
    render(<ScheduledReportsContent />);
    expect(screen.getByLabelText('Loading scheduled reports')).toBeInTheDocument();
  });

  it('shows the skeleton while auth resolves', () => {
    setup();
    authLoading = true;
    render(<ScheduledReportsContent />);
    expect(screen.getByLabelText('Loading scheduled reports')).toBeInTheDocument();
  });

  it('renders PageHeader with breadcrumbs and a single primary New Schedule action', () => {
    setup();
    render(<ScheduledReportsContent />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Scheduled Reports' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New Schedule' })).toHaveLength(1);
  });

  it('renders real rows from the API', () => {
    setup();
    render(<ScheduledReportsContent />);
    expect(screen.getByTestId('schedule-row-s1')).toHaveTextContent('Weekly pipeline');
  });

  it('renders the canonical empty state with no button inside the schedules card', () => {
    setup({ list: [] });
    render(<ScheduledReportsContent />);
    const card = screen.getByRole('heading', { name: 'Schedules' }).closest('[aria-labelledby]');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('No scheduled reports yet')).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('shows an error when the list fails', () => {
    setup({ listError: { message: 'boom' } });
    render(<ScheduledReportsContent />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load scheduled reports. boom');
  });

  it('states plainly that delivery is not running yet', () => {
    setup();
    render(<ScheduledReportsContent />);
    expect(screen.getByTestId('delivery-status')).toHaveTextContent(/not enabled yet/i);
  });

  it('is read-only for a regular user', () => {
    role = 'USER';
    setup();
    render(<ScheduledReportsContent />);
    expect(screen.getByRole('button', { name: 'New Schedule' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'New Tag' })).toBeNull();
    expect(
      screen.getByText('Only admins and managers can change scheduled reports.')
    ).toBeInTheDocument();
  });

  it('toggles a schedule through setActive', () => {
    setup();
    render(<ScheduledReportsContent />);
    fireEvent.click(screen.getByRole('switch', { name: 'Active: Weekly pipeline' }));
    expect(mutations.setActive.mutate).toHaveBeenCalledWith({ id: 's1', isActive: false });
  });

  it('marks only the row whose toggle is pending as busy', () => {
    setup();
    mutations.setActive.isPending = true;
    mutations.setActive.variables = { id: 's1', isActive: false };
    render(<ScheduledReportsContent />);
    expect(screen.getByRole('switch', { name: 'Active: Weekly pipeline' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it('labels each card as a region', () => {
    setup();
    render(<ScheduledReportsContent />);
    expect(screen.getByRole('region', { name: 'Schedules' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Delivery status' })).toBeInTheDocument();
  });

  it('deletes a schedule after confirmation and reports success', async () => {
    setup();
    render(<ScheduledReportsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Weekly pipeline' }));
    expect(
      await screen.findByText('Delete "Weekly pipeline"? This cannot be undone.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mutations.delete.mutate).toHaveBeenCalled());
    const [vars, opts] = mutations.delete.mutate.mock.calls[0];
    expect(vars).toEqual({ id: 's1' });
    opts.onSuccess();
    expect(toast).toHaveBeenCalledWith({ title: 'Schedule deleted' });
    // Focus stays in the card instead of falling to <body>.
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Schedules' }));
  });

  it('deletes a tag after confirmation', async () => {
    setup({
      tags: [
        {
          id: 't1',
          name: 'Finance',
          colorToken: 'blue',
          description: null,
          sortOrder: 0,
          isActive: true,
        },
      ],
    });
    render(<ScheduledReportsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete tag Finance' }));
    expect(
      await screen.findByText(/It is removed from every schedule that uses it/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mutations.tagDelete.mutate).toHaveBeenCalled());
    mutations.tagDelete.mutate.mock.calls[0][1].onSuccess();
    expect(toast).toHaveBeenCalledWith({ title: 'Tag deleted' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Tags' }));
  });

  it('opens the tag dialog from the SectionHeader through the TagsTab ref and creates a tag', async () => {
    setup();
    render(<ScheduledReportsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Tag' }));
    expect(await screen.findByRole('heading', { name: 'New Tag' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ops' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(mutations.tagCreate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ops' })
      )
    );
  });

  it('updates a tag through the tag dialog', async () => {
    setup({
      tags: [
        {
          id: 't1',
          name: 'Finance',
          colorToken: 'blue',
          description: null,
          sortOrder: 0,
          isActive: true,
        },
      ],
    });
    render(<ScheduledReportsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit tag Finance' }));
    fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Money' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mutations.tagUpdate.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 't1', name: 'Money' })
      )
    );
  });

  it('creates a schedule from the dialog, then toasts and closes it', async () => {
    setup({ list: [] });
    render(<ScheduledReportsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Schedule' }));
    expect(
      await screen.findByRole('heading', { name: 'New Scheduled Report' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Weekly pipeline' } });
    fireEvent.change(screen.getByLabelText(/^Report template/), { target: { value: TEMPLATE_ID } });
    fireEvent.change(screen.getByLabelText(/^Recipients/), {
      target: { value: 'lead@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() => expect(mutations.create.mutateAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Schedule created' }))
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New Scheduled Report' })).toBeNull()
    );
  });

  it('saves an edited schedule through update', async () => {
    setup();
    render(<ScheduledReportsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Weekly pipeline' }));
    expect(
      await screen.findByRole('heading', { name: 'Edit Scheduled Report' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's1' })
      )
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Schedule saved' }))
    );
  });

  it('refreshes lists on success and toasts API errors', () => {
    setup();
    render(<ScheduledReportsContent />);
    mutationOpts.create.onSuccess?.();
    expect(invalidate.list).toHaveBeenCalled();
    mutationOpts.tagCreate.onSuccess?.();
    expect(invalidate.tags).toHaveBeenCalled();
    mutationOpts.update.onError?.({ message: 'Name taken' });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Name taken', variant: 'destructive' })
    );
  });
});
