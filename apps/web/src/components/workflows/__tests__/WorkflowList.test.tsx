/**
 * WorkflowList Component Tests — IFC-031
 *
 * Tests for the paginated list of workflow definitions with name/category/status.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// API mock — must include useUtils
// ---------------------------------------------------------------------------

const mockListQuery = vi.fn();
const mockDeleteMutate = vi.fn();
const mockSetActiveMutate = vi.fn();
const mockInvalidate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      workflow: {
        list: { invalidate: mockInvalidate },
      },
    }),
    workflow: {
      list: {
        useQuery: (...args: unknown[]) => mockListQuery(...args),
      },
      delete: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            mockDeleteMutate(input);
            onSuccess?.();
          },
          isPending: false,
        }),
      },
      setActive: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            mockSetActiveMutate(input);
            onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

// Mock shared components
vi.mock('@/components/shared/search-filter-bar', () => ({
  SearchFilterBar: ({
    searchValue,
    onSearchChange,
    placeholder,
    filters,
  }: {
    searchValue: string;
    onSearchChange: (v: string) => void;
    placeholder?: string;
    filters?: Array<{
      id: string;
      label: string;
      options: Array<{ value: string; label: string }>;
      value: string;
      onChange: (v: string) => void;
    }>;
  }) => (
    <div data-testid="search-filter-bar">
      <input
        data-testid="search-input"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder ?? 'Search'}
      />
      {filters?.map((f) => (
        <select
          key={f.id}
          data-testid={`filter-${f.id}`}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          aria-label={f.label}
        >
          {f.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}
    </div>
  ),
}));

vi.mock('@intelliflow/ui', () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`status-badge-${status}`}>{status}</span>
  ),
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
  Switch: ({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    'aria-label'?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
  Button: ({ children, onClick, 'aria-label': ariaLabel, variant: _variant, size: _size }: {
    children?: React.ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} aria-label={ariaLabel}>{children}</button>
  ),
  AlertDialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-root">{children}</div>
  ),
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="alertdialog">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button onClick={onClick} aria-label="cancel">
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button onClick={onClick} aria-label="confirm">
      {children}
    </button>
  ),
}));

const { WorkflowList } = await import('../WorkflowList');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const activeWorkflow = {
  id: 'wf-1',
  name: 'Lead Escalation',
  category: 'lead',
  isActive: true,
  triggerType: 'event',
  version: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const inactiveWorkflow = {
  id: 'wf-2',
  name: 'Ticket Routing',
  category: 'support',
  isActive: false,
  triggerType: 'schedule',
  version: 2,
  createdAt: new Date('2026-01-02'),
  updatedAt: new Date('2026-01-02'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowList', () => {
  beforeEach(() => {
    mockDeleteMutate.mockClear();
    mockSetActiveMutate.mockClear();
    mockInvalidate.mockClear();
  });

  it('renders skeleton placeholder while api.workflow.list query is loading', () => {
    mockListQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<WorkflowList onEdit={vi.fn()} />);
    expect(screen.getByTestId('workflow-list-skeleton')).toBeInTheDocument();
  });

  it('renders workflow rows with name, category, status badge, and created date when data loads', () => {
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow, inactiveWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);
    expect(screen.getByText('Lead Escalation')).toBeInTheDocument();
    expect(screen.getByText('Ticket Routing')).toBeInTheDocument();
    // Category and created date in the same subtitle line
    expect(screen.getAllByText(/lead/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/support/i).length).toBeGreaterThanOrEqual(1);
    // Created dates are rendered as <time> elements (no implicit ARIA role)
    const times = document.querySelectorAll('time');
    expect(times.length).toBeGreaterThanOrEqual(2);
  });

  it('renders EmptyState component when list is empty', () => {
    mockListQuery.mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('calls api.workflow.delete() after AlertDialog confirm click', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);

    // Open delete dialog
    const deleteBtn = screen.getByRole('button', { name: /delete lead escalation/i });
    fireEvent.click(deleteBtn);

    // Confirm deletion
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 'wf-1' });
    });
  });

  it('does NOT call delete when AlertDialog is dismissed', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);

    const deleteBtn = screen.getByRole('button', { name: /delete lead escalation/i });
    fireEvent.click(deleteBtn);

    // Cancel deletion
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });
  });

  it('calls api.workflow.setActive with toggled isActive when toggle clicked', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);

    const toggle = screen.getByRole('switch', { name: /toggle lead escalation active/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockSetActiveMutate).toHaveBeenCalledWith({ id: 'wf-1', isActive: false });
    });
  });

  it('SearchFilterBar input filters visible rows by workflow name', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow, inactiveWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'Lead' } });

    await waitFor(() => {
      expect(screen.getByText('Lead Escalation')).toBeInTheDocument();
      expect(screen.queryByText('Ticket Routing')).not.toBeInTheDocument();
    });
  });

  it('SearchFilterBar input also filters by category text (AC-001)', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow, inactiveWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'support' } });

    await waitFor(() => {
      expect(screen.queryByText('Lead Escalation')).not.toBeInTheDocument();
      expect(screen.getByText('Ticket Routing')).toBeInTheDocument();
    });
  });

  it('Category dropdown filters visible rows by selected category', async () => {
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow, inactiveWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);

    const categoryDropdown = screen.getByTestId('filter-category');
    fireEvent.change(categoryDropdown, { target: { value: 'lead' } });

    await waitFor(() => {
      expect(screen.getByText('Lead Escalation')).toBeInTheDocument();
      expect(screen.queryByText('Ticket Routing')).not.toBeInTheDocument();
    });
  });

  it('shows active workflows with green StatusBadge, inactive with gray', () => {
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow, inactiveWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} />);
    expect(screen.getByTestId('status-badge-active')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge-inactive')).toBeInTheDocument();
  });

  it('calls onEdit with workflow id when Edit button is clicked', () => {
    const mockOnEdit = vi.fn();
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={mockOnEdit} />);
    const editBtn = screen.getByRole('button', { name: /edit lead escalation/i });
    fireEvent.click(editBtn);
    expect(mockOnEdit).toHaveBeenCalledWith('wf-1');
  });

  it('renders + Create Workflow button and calls onCreateNew when provided', () => {
    const mockCreateNew = vi.fn();
    mockListQuery.mockReturnValue({
      data: { items: [activeWorkflow] },
      isLoading: false,
    });
    render(<WorkflowList onEdit={vi.fn()} onCreateNew={mockCreateNew} />);
    const createBtn = screen.getByRole('button', { name: /create workflow/i });
    fireEvent.click(createBtn);
    expect(mockCreateNew).toHaveBeenCalled();
  });
});
