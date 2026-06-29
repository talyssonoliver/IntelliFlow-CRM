/**
 * ReportTemplatesContent Tests — PG-200
 * Tests: render list, empty state, create dialog, delete confirmation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

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
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
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

function setup({
  listData = [],
  isLoading = false,
  createPending = false,
  updatePending = false,
  deletePending = false,
}: {
  listData?: (typeof mockTemplate)[];
  isLoading?: boolean;
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
    error: null,
    refetch: vi.fn(),
  });
  mockCreateMutation.mockImplementation((_opts: unknown) => ({
    mutateAsync: mutateCreate,
    isPending: createPending,
  }));
  mockUpdateMutation.mockImplementation((_opts: unknown) => ({
    mutateAsync: mutateUpdate,
    isPending: updatePending,
  }));
  mockDeleteMutation.mockImplementation((_opts: unknown) => ({
    mutateAsync: mutateDelete,
    isPending: deletePending,
  }));

  return { mutateCreate, mutateUpdate, mutateDelete };
}

beforeEach(() => {
  vi.clearAllMocks();
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
