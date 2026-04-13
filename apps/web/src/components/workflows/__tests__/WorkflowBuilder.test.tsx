/**
 * WorkflowBuilder Component Tests — IFC-031
 *
 * Tests for the page-level orchestrator that switches between
 * list view and canvas (editor) view.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock child components — render as simple divs with prop-forwarding buttons
// ---------------------------------------------------------------------------

const mockOnCreateNew = vi.fn();
const mockOnEdit = vi.fn();
const mockOnBack = vi.fn();

vi.mock('../WorkflowList', () => ({
  WorkflowList: ({
    onCreateNew,
    onEdit,
  }: {
    onCreateNew?: () => void;
    onEdit?: (id: string) => void;
  }) => (
    <div data-testid="workflow-list">
      <button onClick={onCreateNew} data-testid="create-btn">
        Create Workflow
      </button>
      <button onClick={() => onEdit?.('wf-42')} data-testid="edit-btn">
        Edit
      </button>
    </div>
  ),
}));

vi.mock('../WorkflowCanvas', () => ({
  WorkflowCanvas: ({
    workflowId,
    onBack,
  }: {
    workflowId?: string | null;
    onBack?: () => void;
  }) => (
    <div data-testid="workflow-canvas" data-workflow-id={workflowId ?? ''}>
      <button onClick={onBack} data-testid="canvas-back-btn">
        Back
      </button>
    </div>
  ),
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

// Mock shared PageHeader so tests depend on title + actions, not on the
// primitive's DOM structure. PageHeader is already covered by its own tests.
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({
    title,
    actions,
  }: {
    title: string;
    breadcrumbs?: unknown;
    description?: string;
    actions?: Array<{ label: string; onClick?: () => void; href?: string }>;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actions?.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          aria-label={a.label}
          data-testid={`page-header-action-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  ),
}));

const { WorkflowBuilder } = await import('../WorkflowBuilder');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowBuilder', () => {
  beforeEach(() => {
    mockOnCreateNew.mockClear();
    mockOnEdit.mockClear();
    mockOnBack.mockClear();
  });

  it('renders WorkflowList in default (list) view', () => {
    render(<WorkflowBuilder />);
    expect(screen.getByTestId('workflow-list')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-canvas')).not.toBeInTheDocument();
  });

  it('switches to canvas view with editingWorkflowId=null when Create is clicked', () => {
    render(<WorkflowBuilder />);
    fireEvent.click(screen.getByTestId('create-btn'));
    expect(screen.getByTestId('workflow-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-canvas').dataset.workflowId).toBe('');
    expect(screen.getByText('New workflow')).toBeInTheDocument();
  });

  it('switches to canvas view with editingWorkflowId set when Edit is called', () => {
    render(<WorkflowBuilder />);
    fireEvent.click(screen.getByTestId('edit-btn'));
    expect(screen.getByTestId('workflow-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-canvas').dataset.workflowId).toBe('wf-42');
    expect(screen.getByText('Edit workflow')).toBeInTheDocument();
  });

  it('back button in canvas view returns to list view and clears editingWorkflowId', () => {
    render(<WorkflowBuilder />);
    // Switch to canvas
    fireEvent.click(screen.getByTestId('edit-btn'));
    expect(screen.getByTestId('workflow-canvas')).toBeInTheDocument();

    // Click the component's own back button (not canvas internal)
    const backButton = screen.getByRole('button', { name: /back to workflows/i });
    fireEvent.click(backButton);

    expect(screen.getByTestId('workflow-list')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-canvas')).not.toBeInTheDocument();
  });

  it('header text shows "New Workflow" when creating, "Edit Workflow" when editing', () => {
    render(<WorkflowBuilder />);

    // Create mode
    fireEvent.click(screen.getByTestId('create-btn'));
    expect(screen.getByText('New workflow')).toBeInTheDocument();
    expect(screen.queryByText('Edit workflow')).not.toBeInTheDocument();

    // Go back
    const backButton = screen.getByRole('button', { name: /back to workflows/i });
    fireEvent.click(backButton);

    // Edit mode
    fireEvent.click(screen.getByTestId('edit-btn'));
    expect(screen.getByText('Edit workflow')).toBeInTheDocument();
    expect(screen.queryByText('New workflow')).not.toBeInTheDocument();
  });
});
