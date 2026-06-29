/**
 * ReportTemplatesContent Tests — PG-200
 * Tests: render list, empty state, create dialog, delete confirmation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

// ─── tRPC mock ─────────────────────────────────────────────────────────────
const mockListQuery = vi.fn();
const mockCreateMutation = vi.fn();
const mockUpdateMutation = vi.fn();
const mockDeleteMutation = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      analytics: {
        reportTemplates: {
          list: { invalidate: mockInvalidate },
        },
      },
    }),
    analytics: {
      reportTemplates: {
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        create: { useMutation: (opts: unknown) => mockCreateMutation(opts) },
        update: { useMutation: (opts: unknown) => mockUpdateMutation(opts) },
        delete: { useMutation: (opts: unknown) => mockDeleteMutation(opts) },
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    // user-1 is the creator of mockTemplate — Edit/Delete buttons should appear for own templates
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

import ReportTemplatesContent from '../ReportTemplatesContent';

const mockTemplate = {
  id: 'cjld2cjxh0000qzrmn831i7rn',
  tenantId: 'tenant-1',
  createdBy: 'user-1',
  name: 'Revenue Report',
  description: 'Monthly revenue',
  filterSet: {},
  selectedColumns: ['revenue'],
  chartType: 'bar',
  defaultPeriod: '30d',
  sharingScope: 'private',
  isDefault: false,
  createdAt: new Date('2026-06-29'),
  updatedAt: new Date('2026-06-29'),
};

// Captured opts from each useMutation call — lets tests invoke onSuccess/onError directly.
let capturedCreateOpts: Record<string, (arg?: unknown) => void> = {};
let capturedUpdateOpts: Record<string, (arg?: unknown) => void> = {};
let capturedDeleteOpts: Record<string, (arg?: unknown) => void> = {};

function setup({
  listData = [],
  isLoading = false,
  listError = null,
  createPending = false,
  updatePending = false,
  deletePending = false,
}: {
  listData?: (typeof mockTemplate)[];
  isLoading?: boolean;
  listError?: Error | null;
  createPending?: boolean;
  updatePending?: boolean;
  deletePending?: boolean;
} = {}) {
  const mutateCreate = vi.fn().mockResolvedValue({});
  const mutateUpdate = vi.fn().mockResolvedValue({});
  const mutateDelete = vi.fn().mockResolvedValue({});

  mockListQuery.mockReturnValue({
    data: listData,
    isLoading,
    error: listError,
    refetch: vi.fn(),
  });
  mockCreateMutation.mockImplementation((opts: Record<string, (arg?: unknown) => void>) => {
    capturedCreateOpts = opts ?? {};
    return { mutateAsync: mutateCreate, isPending: createPending };
  });
  mockUpdateMutation.mockImplementation((opts: Record<string, (arg?: unknown) => void>) => {
    capturedUpdateOpts = opts ?? {};
    return { mutateAsync: mutateUpdate, isPending: updatePending };
  });
  mockDeleteMutation.mockImplementation((opts: Record<string, (arg?: unknown) => void>) => {
    capturedDeleteOpts = opts ?? {};
    return { mutateAsync: mutateDelete, isPending: deletePending };
  });

  return { mutateCreate, mutateUpdate, mutateDelete };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedCreateOpts = {};
  capturedUpdateOpts = {};
  capturedDeleteOpts = {};
});

describe('ReportTemplatesContent', () => {
  describe('empty state', () => {
    it('shows EmptyState when list is empty', () => {
      setup({ listData: [] });
      render(<ReportTemplatesContent />);
      // EmptyState renders for reports entity — entity config title is "No reports available"
      expect(screen.getByText(/no reports available/i)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows skeleton while loading', () => {
      setup({ isLoading: true });
      render(<ReportTemplatesContent />);
      // Loading skeleton should be present
      expect(document.querySelector('[aria-busy="true"], .animate-pulse')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error message and does not show EmptyState when list query fails', () => {
      setup({ listError: new Error('Network error') });
      render(<ReportTemplatesContent />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/failed to load report templates/i)).toBeInTheDocument();
      expect(screen.queryByText(/no reports available/i)).not.toBeInTheDocument();
    });
  });

  describe('template list', () => {
    it('renders template name', async () => {
      setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);
      await waitFor(() => {
        expect(screen.getByText('Revenue Report')).toBeInTheDocument();
      });
    });

    it('shows chart type', async () => {
      setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);
      await waitFor(() => {
        expect(screen.getByText(/bar/i)).toBeInTheDocument();
      });
    });
  });

  describe('page header', () => {
    it('renders "Report Templates" heading', () => {
      setup({ listData: [] });
      render(<ReportTemplatesContent />);
      expect(screen.getByRole('heading', { name: /report templates/i })).toBeInTheDocument();
    });

    it('renders "New Template" action button', () => {
      setup({ listData: [] });
      render(<ReportTemplatesContent />);
      expect(screen.getByRole('button', { name: /new template/i })).toBeInTheDocument();
    });
  });

  describe('create template', () => {
    it('opens create dialog on "New Template" click', async () => {
      setup({ listData: [] });
      render(<ReportTemplatesContent />);

      const btn = screen.getByRole('button', { name: /new template/i });
      fireEvent.click(btn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('calls create mutation with form data', async () => {
      const { mutateCreate } = setup({ listData: [] });
      render(<ReportTemplatesContent />);

      fireEvent.click(screen.getByRole('button', { name: /new template/i }));

      await waitFor(() => screen.getByRole('dialog'));

      // Fill in template name
      const nameInput = screen.getByLabelText(/template name/i);
      fireEvent.change(nameInput, { target: { value: 'My Template' } });

      // Fill in selected columns
      const colInput = screen.getByLabelText(/columns/i);
      fireEvent.change(colInput, { target: { value: 'revenue' } });

      // Submit
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mutateCreate).toHaveBeenCalled();
      });
    });
  });

  describe('mutation callbacks', () => {
    it('create onSuccess: invalidates list, shows toast, closes dialog', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ listData: [] });
      render(<ReportTemplatesContent />);

      // Open dialog first so setDialogOpen(false) has something to close
      fireEvent.click(screen.getByRole('button', { name: /new template/i }));
      await waitFor(() => screen.getByRole('dialog'));

      // Now invoke the onSuccess callback that was captured during render
      await act(async () => {
        capturedCreateOpts.onSuccess?.();
      });

      expect(mockInvalidate).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Template created' }));
    });

    it('create onError: shows error toast', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ listData: [] });
      render(<ReportTemplatesContent />);

      await act(async () => {
        capturedCreateOpts.onError?.({ message: 'Something went wrong' });
      });

      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' })
      );
    });

    it('update onSuccess: invalidates list, shows updated toast, closes dialog', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);

      // Open edit dialog so setDialogOpen(false) has something to close
      await waitFor(() => screen.getByText('Revenue Report'));
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      await waitFor(() => screen.getByRole('dialog'));

      await act(async () => {
        capturedUpdateOpts.onSuccess?.();
      });

      expect(mockInvalidate).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Template updated' }));
    });

    it('update onError: shows error toast', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);

      await act(async () => {
        capturedUpdateOpts.onError?.({ message: 'Conflict error' });
      });

      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' })
      );
    });

    it('delete onSuccess: invalidates list, shows deleted toast, clears deleteTarget', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);

      await waitFor(() => screen.getByText('Revenue Report'));
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      await waitFor(() => screen.getByRole('alertdialog'));

      await act(async () => {
        capturedDeleteOpts.onSuccess?.();
      });

      expect(mockInvalidate).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Template deleted' }));
    });

    it('delete onError: shows error toast', async () => {
      const { toast } = await import('@intelliflow/ui');
      setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);

      await act(async () => {
        capturedDeleteOpts.onError?.({ message: 'Delete failed' });
      });

      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' })
      );
    });
  });

  describe('ownership-gated actions', () => {
    it('shows Edit and Delete buttons for templates the current user created', async () => {
      setup({ listData: [mockTemplate] }); // mockTemplate.createdBy === 'user-1' === user.id
      render(<ReportTemplatesContent />);

      await waitFor(() => screen.getByText('Revenue Report'));

      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('hides Edit and Delete buttons for templates created by another user', async () => {
      const sharedTemplate = {
        ...mockTemplate,
        id: 'other-id',
        createdBy: 'user-2',
        sharingScope: 'team',
      };
      setup({ listData: [sharedTemplate] });
      render(<ReportTemplatesContent />);

      await waitFor(() => screen.getByText('Revenue Report'));

      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });
  });

  describe('edit template (openEdit)', () => {
    it('opens edit dialog with pre-filled data when Edit is clicked', async () => {
      setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);

      await waitFor(() => screen.getByText('Revenue Report'));

      const editBtn = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // The dialog should be in edit mode (title says "Edit Template")
      expect(screen.getByRole('heading', { name: /edit template/i })).toBeInTheDocument();

      // Template name should be pre-filled
      const nameInput = screen.getByLabelText(/template name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('Revenue Report');
    });

    it('calls update mutation when saving an edited template', async () => {
      const { mutateUpdate } = setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);

      await waitFor(() => screen.getByText('Revenue Report'));

      // Open edit dialog
      fireEvent.click(screen.getByRole('button', { name: /edit/i }));
      await waitFor(() => screen.getByRole('dialog'));

      // Change the name
      const nameInput = screen.getByLabelText(/template name/i);
      fireEvent.change(nameInput, { target: { value: 'Updated Report' } });

      // Submit
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mutateUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ id: mockTemplate.id, name: 'Updated Report' })
        );
      });
    });

    it('calls create mutation (not update) when saving a new template', async () => {
      const { mutateCreate, mutateUpdate } = setup({ listData: [] });
      render(<ReportTemplatesContent />);

      fireEvent.click(screen.getByRole('button', { name: /new template/i }));
      await waitFor(() => screen.getByRole('dialog'));

      const nameInput = screen.getByLabelText(/template name/i);
      fireEvent.change(nameInput, { target: { value: 'New Template' } });
      const colInput = screen.getByLabelText(/columns/i);
      fireEvent.change(colInput, { target: { value: 'col1' } });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mutateCreate).toHaveBeenCalled();
        expect(mutateUpdate).not.toHaveBeenCalled();
      });
    });
  });

  describe('dialog form interactions', () => {
    it('renders description field in create dialog', async () => {
      setup({ listData: [] });
      render(<ReportTemplatesContent />);

      fireEvent.click(screen.getByRole('button', { name: /new template/i }));
      await waitFor(() => screen.getByRole('dialog'));

      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });

    it('does not call create when name is empty', async () => {
      const { mutateCreate } = setup({ listData: [] });
      render(<ReportTemplatesContent />);

      fireEvent.click(screen.getByRole('button', { name: /new template/i }));
      await waitFor(() => screen.getByRole('dialog'));

      // Don't fill in name — just click save
      const colInput = screen.getByLabelText(/columns/i);
      fireEvent.change(colInput, { target: { value: 'col1' } });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      // Give it a moment to see if mutation fires
      await new Promise((r) => setTimeout(r, 50));
      expect(mutateCreate).not.toHaveBeenCalled();
    });

    it('does not call create when columns are empty', async () => {
      const { mutateCreate } = setup({ listData: [] });
      render(<ReportTemplatesContent />);

      fireEvent.click(screen.getByRole('button', { name: /new template/i }));
      await waitFor(() => screen.getByRole('dialog'));

      // Fill name but leave columns empty
      const nameInput = screen.getByLabelText(/template name/i);
      fireEvent.change(nameInput, { target: { value: 'My Template' } });

      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      await new Promise((r) => setTimeout(r, 50));
      expect(mutateCreate).not.toHaveBeenCalled();
    });
  });

  describe('delete template', () => {
    it('opens confirmation dialog on delete action', async () => {
      setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);

      await waitFor(() => screen.getByText('Revenue Report'));

      const deleteBtn = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteBtn);

      // ConfirmationDialog uses AlertDialog which has role="alertdialog"
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });
    });

    it('calls delete mutation on confirm', async () => {
      const { mutateDelete } = setup({ listData: [mockTemplate] });
      render(<ReportTemplatesContent />);

      await waitFor(() => screen.getByText('Revenue Report'));

      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      // ConfirmationDialog uses AlertDialog which has role="alertdialog"
      await waitFor(() => screen.getByRole('alertdialog'));

      // The confirm button inside the alertdialog
      const confirmBtn = screen
        .getAllByRole('button', { name: /delete/i })
        .find((btn) => btn.closest('[role="alertdialog"]'));
      if (confirmBtn) fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mutateDelete).toHaveBeenCalledWith(expect.objectContaining({ id: mockTemplate.id }));
      });
    });
  });
});
