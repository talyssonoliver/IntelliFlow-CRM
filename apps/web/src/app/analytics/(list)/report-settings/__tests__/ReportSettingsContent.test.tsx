/**
 * ReportSettingsContent Tests — PG-187
 * Orchestrator: data seeding, dirty tracking, Save/Reset, fallback parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ─── tRPC mock ─────────────────────────────────────────────────────────────
const mockGetQuery = vi.fn();
const mockUpdateMutation = vi.fn();
const mockResetMutation = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      analytics: {
        reportSettings: { get: { invalidate: mockInvalidate } },
      },
    }),
    analytics: {
      reportSettings: {
        get: { useQuery: (...args: unknown[]) => mockGetQuery(...args) },
        update: { useMutation: (opts: unknown) => mockUpdateMutation(opts) },
        resetToDefaults: { useMutation: (opts: unknown) => mockResetMutation(opts) },
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    toast: vi.fn(),
  };
});

import ReportSettingsContent from '../ReportSettingsContent';

function setup({
  queryData,
  queryError,
  isLoading = false,
  updatePending = false,
  resetPending = false,
}: {
  queryData?: unknown;
  queryError?: { message: string };
  isLoading?: boolean;
  updatePending?: boolean;
  resetPending?: boolean;
} = {}) {
  const mutateUpdate = vi.fn().mockResolvedValue({});
  const mutateReset = vi.fn().mockResolvedValue({});

  mockGetQuery.mockReturnValue({
    data: queryData,
    isLoading,
    error: queryError,
    refetch: vi.fn(),
  });
  mockUpdateMutation.mockImplementation((_opts) => ({
    mutateAsync: mutateUpdate,
    isPending: updatePending,
  }));
  mockResetMutation.mockImplementation((_opts) => ({
    mutateAsync: mutateReset,
    isPending: resetPending,
  }));

  return { mutateUpdate, mutateReset };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReportSettingsContent', () => {
  it('renders PageHeader with breadcrumbs', async () => {
    setup({
      queryData: {
        defaultRange: '30d',
        currency: 'USD',
        scheduledDelivery: {
          enabled: false,
          frequency: 'weekly',
          dayOfWeek: 1,
          time: '09:00',
          recipients: [],
          format: 'pdf',
        },
      },
    });
    render(<ReportSettingsContent />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Report Settings' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
  });

  it('renders 3 sections (DefaultRange / Currency / ScheduledDelivery)', async () => {
    setup({
      queryData: {
        defaultRange: '30d',
        currency: 'USD',
        scheduledDelivery: {
          enabled: false,
          frequency: 'weekly',
          dayOfWeek: 1,
          time: '09:00',
          recipients: [],
          format: 'pdf',
        },
      },
    });
    render(<ReportSettingsContent />);
    await waitFor(() => {
      expect(
        screen.getByRole('radiogroup', { name: /default report date range/i })
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('combobox', { name: /select display currency/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /enable scheduled delivery/i })).toBeInTheDocument();
  });

  it('renders skeleton while loading', () => {
    setup({ isLoading: true });
    const { container } = render(<ReportSettingsContent />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders error card when query errors', () => {
    setup({ queryError: { message: 'oops' } });
    render(<ReportSettingsContent />);
    expect(screen.getByText(/failed to load report settings/i)).toBeInTheDocument();
    expect(screen.getByText('oops')).toBeInTheDocument();
  });

  it('falls back to defaults when server returns invalid defaultRange', async () => {
    setup({
      queryData: {
        defaultRange: '1y', // invalid
        currency: 'USD',
        scheduledDelivery: {
          enabled: false,
          frequency: 'weekly',
          dayOfWeek: 1,
          time: '09:00',
          recipients: [],
          format: 'pdf',
        },
      },
    });
    render(<ReportSettingsContent />);
    await waitFor(() => {
      // '30d' option should be checked (fallback), not '1y'
      const thirtyDay = screen.getByRole('radio', { name: /30 days/i });
      expect(thirtyDay).toBeChecked();
    });
  });

  it('falls back to defaults when server returns null scheduledDelivery', async () => {
    setup({
      queryData: {
        defaultRange: '30d',
        currency: 'USD',
        scheduledDelivery: null,
      },
    });
    render(<ReportSettingsContent />);
    await waitFor(() => {
      const sw = screen.getByRole('switch', { name: /enable scheduled delivery/i });
      expect(sw).toHaveAttribute('data-state', 'unchecked');
    });
  });

  it('Save button disabled when not dirty', async () => {
    setup({
      queryData: {
        defaultRange: '30d',
        currency: 'USD',
        scheduledDelivery: {
          enabled: false,
          frequency: 'weekly',
          dayOfWeek: 1,
          time: '09:00',
          recipients: [],
          format: 'pdf',
        },
      },
    });
    render(<ReportSettingsContent />);
    await waitFor(() => {
      const save = screen.getByRole('button', { name: /save changes/i });
      expect(save).toBeDisabled();
    });
  });

  it('Save button enables after changing range and calls update mutation', async () => {
    const { mutateUpdate } = setup({
      queryData: {
        defaultRange: '30d',
        currency: 'USD',
        scheduledDelivery: {
          enabled: false,
          frequency: 'weekly',
          dayOfWeek: 1,
          time: '09:00',
          recipients: [],
          format: 'pdf',
        },
      },
    });
    render(<ReportSettingsContent />);
    await waitFor(() => screen.getByRole('radio', { name: /7 days/i }));
    fireEvent.click(screen.getByRole('radio', { name: /7 days/i }));
    const save = screen.getByRole('button', { name: /save changes/i });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    await waitFor(() => expect(mutateUpdate).toHaveBeenCalled());
    expect(mutateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ defaultRange: '7d', currency: 'USD' })
    );
  });

  it('Reset opens ConfirmationDialog and confirming calls resetToDefaults', async () => {
    const { mutateReset } = setup({
      queryData: {
        defaultRange: '30d',
        currency: 'USD',
        scheduledDelivery: {
          enabled: false,
          frequency: 'weekly',
          dayOfWeek: 1,
          time: '09:00',
          recipients: [],
          format: 'pdf',
        },
      },
    });
    render(<ReportSettingsContent />);
    await waitFor(() => screen.getByRole('button', { name: /reset to defaults/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    // ConfirmationDialog renders its own "Reset" confirm button
    const confirm = await screen.findByRole('button', { name: /^reset$/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(mutateReset).toHaveBeenCalled());
  });

  it('orchestrator does not import ModuleSettingsLayout (source-level grep)', async () => {
    // Static proof via readFileSync inside the test: the orchestrator does NOT
    // reference the deprecated layout component.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'ReportSettingsContent.tsx'), 'utf8');
    expect(src).not.toMatch(/ModuleSettingsLayout/);
    expect(src).not.toMatch(/type DefaultRangeValue/);
  });
});
