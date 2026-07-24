/**
 * StoragePoliciesContent Tests — PG-206
 * Tests: loading, error, list render, dirty-tracked save, reset flow, toasts.
 * Wires the real RetentionPoliciesTab (DRY reuse) over a mocked
 * documentSettings.retentionPolicies sub-router.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';

// ─── tRPC mock ─────────────────────────────────────────────────────────────
const mockGetAllQuery = vi.fn();
const mockUpdateMutation = vi.fn();
const mockResetMutation = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      documentSettings: {
        retentionPolicies: {
          getAll: { invalidate: mockInvalidate },
        },
      },
    }),
    documentSettings: {
      retentionPolicies: {
        getAll: { useQuery: (...args: unknown[]) => mockGetAllQuery(...args) },
        updateAll: { useMutation: (opts: unknown) => mockUpdateMutation(opts) },
        resetToDefaults: { useMutation: (opts: unknown) => mockResetMutation(opts) },
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
  }),
}));

vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    toast: vi.fn(),
  };
});

import StoragePoliciesContent from '../StoragePoliciesContent';

const mockPolicy = {
  id: 'cjld2cjxh0000qzrmn831i7rn',
  tenantId: 'tenant-1',
  categoryKey: 'contracts',
  retentionDays: 730,
  autoArchive: true,
  legalHoldOverride: false,
  createdAt: new Date('2026-06-29'),
  updatedAt: new Date('2026-06-29'),
};

let capturedUpdateOpts: Record<string, (arg?: unknown) => void> = {};
let capturedResetOpts: Record<string, (arg?: unknown) => void> = {};

function setup({
  data = [mockPolicy] as (typeof mockPolicy)[],
  isLoading = false,
  error = null as Error | null,
  updatePending = false,
  resetPending = false,
}: {
  data?: (typeof mockPolicy)[];
  isLoading?: boolean;
  error?: Error | null;
  updatePending?: boolean;
  resetPending?: boolean;
} = {}) {
  const mutateUpdate = vi.fn().mockResolvedValue({});
  const mutateReset = vi.fn().mockResolvedValue({});

  mockGetAllQuery.mockReturnValue({ data, isLoading, error, refetch: vi.fn() });
  mockUpdateMutation.mockImplementation((opts: Record<string, (arg?: unknown) => void>) => {
    capturedUpdateOpts = opts ?? {};
    return { mutateAsync: mutateUpdate, isPending: updatePending };
  });
  mockResetMutation.mockImplementation((opts: Record<string, (arg?: unknown) => void>) => {
    capturedResetOpts = opts ?? {};
    return { mutateAsync: mutateReset, isPending: resetPending };
  });

  return { mutateUpdate, mutateReset };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedUpdateOpts = {};
  capturedResetOpts = {};
});

describe('StoragePoliciesContent', () => {
  describe('page header', () => {
    it('renders "Storage Policies" heading', () => {
      setup();
      render(<StoragePoliciesContent />);
      expect(screen.getByRole('heading', { name: /storage policies/i })).toBeInTheDocument();
    });

    it('renders Save and Reset actions', () => {
      setup();
      render(<StoragePoliciesContent />);
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeInTheDocument();
    });

    it('disables Save when there are no unsaved changes', () => {
      setup();
      render(<StoragePoliciesContent />);
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    });
  });

  describe('loading state', () => {
    it('shows skeleton while the query is loading', () => {
      setup({ isLoading: true });
      render(<StoragePoliciesContent />);
      expect(document.querySelector('[aria-busy="true"], .animate-pulse')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows an alert and no policy table when the query fails', () => {
      setup({ error: new Error('FORBIDDEN') });
      render(<StoragePoliciesContent />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/failed to load storage policies/i)).toBeInTheDocument();
      expect(screen.queryByText('contracts')).not.toBeInTheDocument();
    });
  });

  describe('policy list', () => {
    it('renders an existing policy row', async () => {
      setup({ data: [mockPolicy] });
      render(<StoragePoliciesContent />);
      await waitFor(() => expect(screen.getByText('contracts')).toBeInTheDocument());
    });

    it('shows the Add Policy control', () => {
      setup({ data: [mockPolicy] });
      render(<StoragePoliciesContent />);
      expect(screen.getByRole('button', { name: /add policy/i })).toBeInTheDocument();
    });
  });

  describe('save flow', () => {
    it('enables Save after a change and calls updateAll with the mapped policies', async () => {
      const { mutateUpdate } = setup({ data: [mockPolicy] });
      render(<StoragePoliciesContent />);

      await waitFor(() => screen.getByText('contracts'));

      // Add a second policy through the reused RetentionPoliciesTab dialog.
      fireEvent.click(screen.getByRole('button', { name: /add policy/i }));
      await waitFor(() => screen.getByRole('dialog'));

      fireEvent.change(screen.getByLabelText(/category key/i), { target: { value: 'invoices' } });
      fireEvent.change(screen.getByLabelText(/retention days/i), { target: { value: '365' } });

      const dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));

      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      await waitFor(() => expect(saveBtn).toBeEnabled());

      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mutateUpdate).toHaveBeenCalledWith({
          policies: [
            {
              categoryKey: 'contracts',
              retentionDays: 730,
              autoArchive: true,
              legalHoldOverride: false,
            },
            {
              categoryKey: 'invoices',
              retentionDays: 365,
              autoArchive: false,
              legalHoldOverride: false,
            },
          ],
        });
      });
    });

    it('update onSuccess: invalidates + toasts success', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ data: [mockPolicy] });
      render(<StoragePoliciesContent />);

      await act(async () => {
        capturedUpdateOpts.onSuccess?.();
      });

      expect(mockInvalidate).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Storage policies saved' })
      );
    });

    it('update onError: toasts a destructive error', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ data: [mockPolicy] });
      render(<StoragePoliciesContent />);

      await act(async () => {
        capturedUpdateOpts.onError?.({ message: 'Duplicate categoryKey' });
      });

      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' })
      );
    });
  });

  describe('reset flow', () => {
    it('opens a confirmation dialog and calls resetToDefaults on confirm', async () => {
      const { mutateReset } = setup({ data: [mockPolicy] });
      render(<StoragePoliciesContent />);

      fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
      await waitFor(() => screen.getByRole('alertdialog'));

      const confirmBtn = within(screen.getByRole('alertdialog')).getByRole('button', {
        name: /^reset$/i,
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(mutateReset).toHaveBeenCalled());
    });

    it('reset onSuccess: invalidates + toasts success', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ data: [mockPolicy] });
      render(<StoragePoliciesContent />);

      await act(async () => {
        capturedResetOpts.onSuccess?.();
      });

      expect(mockInvalidate).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Storage policies reset' })
      );
    });

    it('reset onError: toasts a destructive error', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ data: [mockPolicy] });
      render(<StoragePoliciesContent />);

      await act(async () => {
        capturedResetOpts.onError?.({ message: 'boom' });
      });

      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' })
      );
    });
  });
});
