/**
 * TaskForm Component Tests (PG-136)
 *
 * Tests for create/edit task form Sheet with validation and entity search.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskForm } from '../TaskForm';

// Mock Sheet components to render inline (no portal)
vi.mock('@intelliflow/ui', () => ({
  toast: vi.fn(),
  Sheet: ({ children, open }: any) =>
    open ? <div data-testid="sheet-root">{children}</div> : null,
  SheetContent: ({ children, ...props }: any) => (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={props['aria-label']}
      data-testid="sheet-content"
    >
      {children}
    </div>
  ),
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock('@intelliflow/domain', () => ({
  TASK_STATUSES: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const,
  TASK_PRIORITIES: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const,
}));

// Mock EntitySearchField
vi.mock('../EntitySearchField', () => ({
  EntitySearchField: ({ entityType, value, valueName, onChange }: any) => (
    <div data-testid={`entity-search-${entityType}`}>
      {value ? valueName : `Search ${entityType}`}
    </div>
  ),
}));

describe('TaskForm', () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <TaskForm open={false} onClose={onClose} onSubmit={onSubmit} mode="create" />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders create form when open', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    expect(screen.getByText('New Task')).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it('renders edit form title', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="edit" />);

    expect(screen.getByText('Edit Task')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
  });

  it('shows status field only in edit mode', () => {
    const { rerender } = render(
      <TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />
    );

    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();

    rerender(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="edit" />);

    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
  });

  it('renders entity type radio buttons', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Opportunity')).toBeInTheDocument();
  });

  it('validates required title field', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    const submitBtn = screen.getByText('Create Task');
    fireEvent.click(submitBtn);

    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates title max length', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'a'.repeat(201) } });

    const submitBtn = screen.getByText('Create Task');
    fireEvent.click(submitBtn);

    expect(screen.getByText('Title must be 200 characters or less')).toBeInTheDocument();
  });

  it('calls onSubmit with valid form data', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'New Task' } });

    const submitBtn = screen.getByText('Create Task');
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Task',
        priority: 'MEDIUM',
        status: 'PENDING',
      })
    );
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('populates form with initialData in edit mode', () => {
    render(
      <TaskForm
        open={true}
        onClose={onClose}
        onSubmit={onSubmit}
        mode="edit"
        initialData={{
          title: 'Existing Task',
          description: 'Existing description',
          priority: 'HIGH' as any,
        }}
      />
    );

    expect(screen.getByDisplayValue('Existing Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument();
  });

  it('renders Save Changes button in edit mode', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="edit" />);

    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('has accessible dialog role', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('shows EntitySearchField when entity type is not none', () => {
    render(<TaskForm open={true} onClose={onClose} onSubmit={onSubmit} mode="create" />);

    // Initially "none" is selected, no search field
    expect(screen.queryByTestId('entity-search-lead')).not.toBeInTheDocument();

    // Select "Lead"
    fireEvent.click(screen.getByDisplayValue('lead'));
    expect(screen.getByTestId('entity-search-lead')).toBeInTheDocument();
  });
});
