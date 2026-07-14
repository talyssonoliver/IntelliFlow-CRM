/**
 * TaskSettingsContent Tests — PG-191
 * Orchestrator: data seeding, dirty tracking, Save/Reset, fallback parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ─── tRPC mock (root-sibling taskSettings) ──────────────────────────────────
const mockGetQuery = vi.fn();
const mockUpdateMutation = vi.fn();
const mockResetMutation = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      taskSettings: { get: { invalidate: mockInvalidate } },
    }),
    taskSettings: {
      get: { useQuery: (...args: unknown[]) => mockGetQuery(...args) },
      update: { useMutation: (opts: unknown) => mockUpdateMutation(opts) },
      resetToDefaults: { useMutation: (opts: unknown) => mockResetMutation(opts) },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));
vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, toast: mockToast };
});

import TaskSettingsContent from '../TaskSettingsContent';

const validData = {
  dueDateOffsetDays: 3,
  reminderDefaults: { enabled: true, minutesBefore: 60 },
  taskTemplates: [],
};

function setup({
  queryData,
  queryError,
  isLoading = false,
  updatePending = false,
  resetPending = false,
  updateRejects = false,
}: {
  queryData?: unknown;
  queryError?: { message: string };
  isLoading?: boolean;
  updatePending?: boolean;
  resetPending?: boolean;
  updateRejects?: boolean;
} = {}) {
  const mutateUpdate = updateRejects
    ? vi.fn().mockRejectedValue(new Error('save boom'))
    : vi.fn().mockResolvedValue({});
  const mutateReset = vi.fn().mockResolvedValue({});

  mockGetQuery.mockReturnValue({
    data: queryData,
    isLoading,
    error: queryError,
    refetch: vi.fn(),
  });
  mockUpdateMutation.mockImplementation(() => ({
    mutateAsync: mutateUpdate,
    isPending: updatePending,
  }));
  mockResetMutation.mockImplementation(() => ({
    mutateAsync: mutateReset,
    isPending: resetPending,
  }));

  return { mutateUpdate, mutateReset };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TaskSettingsContent', () => {
  it('renders PageHeader with breadcrumbs', async () => {
    setup({ queryData: validData });
    render(<TaskSettingsContent />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Task Settings' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument();
  });

  it('renders 3 sections (due-date offset / reminder / templates)', async () => {
    setup({ queryData: validData });
    render(<TaskSettingsContent />);
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: /due-date offset/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('switch', { name: /enable reminders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add template/i })).toBeInTheDocument();
  });

  it('renders skeleton while loading', () => {
    setup({ isLoading: true });
    const { container } = render(<TaskSettingsContent />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders error card when query errors', () => {
    setup({ queryError: { message: 'oops' } });
    render(<TaskSettingsContent />);
    expect(screen.getByText(/failed to load task settings/i)).toBeInTheDocument();
    expect(screen.getByText('oops')).toBeInTheDocument();
  });

  it('falls back to defaults when server returns invalid data', async () => {
    setup({
      queryData: { dueDateOffsetDays: -99, reminderDefaults: 'nope', taskTemplates: 'bad' },
    });
    render(<TaskSettingsContent />);
    await waitFor(() => {
      const offset = screen.getByRole('spinbutton', { name: /due-date offset/i });
      expect(offset).toHaveValue(3); // default fallback, not -99
    });
  });

  it('preserves valid fields when only one server field is corrupt (per-field fallback)', async () => {
    setup({
      queryData: {
        dueDateOffsetDays: -99, // corrupt
        reminderDefaults: { enabled: true, minutesBefore: 30 }, // valid
        taskTemplates: [
          { id: 't1', name: 'Kickoff', defaultPriority: 'HIGH', defaultDueOffsetDays: 1 },
        ], // valid — must NOT be wiped
      },
    });
    render(<TaskSettingsContent />);
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: /due-date offset/i })).toHaveValue(3); // fell back
    });
    // The valid template survived (not clobbered by the bad offset field).
    expect(screen.getByText('Kickoff')).toBeInTheDocument();
  });

  it('Save button disabled when not dirty', async () => {
    setup({ queryData: validData });
    render(<TaskSettingsContent />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    });
  });

  it('Save enables after changing offset and calls update with payload', async () => {
    const { mutateUpdate } = setup({ queryData: validData });
    render(<TaskSettingsContent />);
    const offset = await screen.findByRole('spinbutton', { name: /due-date offset/i });
    fireEvent.change(offset, { target: { value: '10' } });
    const save = screen.getByRole('button', { name: /save changes/i });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    await waitFor(() => expect(mutateUpdate).toHaveBeenCalled());
    expect(mutateUpdate).toHaveBeenCalledWith(expect.objectContaining({ dueDateOffsetDays: 10 }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Settings saved' }))
    );
  });

  it('shows "Saving…" pending text while a mutation is in-flight', async () => {
    setup({ queryData: validData, updatePending: true });
    render(<TaskSettingsContent />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
    });
  });

  it('toasts a destructive error when the update mutation rejects', async () => {
    const { mutateUpdate } = setup({ queryData: validData, updateRejects: true });
    render(<TaskSettingsContent />);
    const offset = await screen.findByRole('spinbutton', { name: /due-date offset/i });
    fireEvent.change(offset, { target: { value: '15' } });
    const save = screen.getByRole('button', { name: /save changes/i });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    await waitFor(() => expect(mutateUpdate).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Save failed', variant: 'destructive' })
      )
    );
  });

  it('Reset opens ConfirmationDialog and confirming calls resetToDefaults', async () => {
    const { mutateReset } = setup({ queryData: validData });
    render(<TaskSettingsContent />);
    await waitFor(() => screen.getByRole('button', { name: /reset to defaults/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    const confirm = await screen.findByRole('button', { name: /^reset$/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(mutateReset).toHaveBeenCalled());
  });
});
