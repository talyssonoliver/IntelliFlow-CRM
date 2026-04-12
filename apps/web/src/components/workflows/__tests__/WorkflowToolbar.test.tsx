/**
 * WorkflowToolbar Component Tests — IFC-031
 *
 * Tests for the save, undo/redo, and zoom toolbar rendered inside
 * ReactFlowProvider. useReactFlow() is fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockZoomIn = vi.fn().mockResolvedValue(undefined);
const mockZoomOut = vi.fn().mockResolvedValue(undefined);
const mockFitView = vi.fn().mockResolvedValue(undefined);

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
    fitView: mockFitView,
  }),
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
    title,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
    title?: string;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title}>
      {children}
    </button>
  ),
}));

const { WorkflowToolbar } = await import('../WorkflowToolbar');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowToolbar', () => {
  const defaultProps = {
    onSave: vi.fn(),
    isValid: true,
    isSaving: false,
    canUndo: true,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Save button disabled when isValid=false', () => {
    render(<WorkflowToolbar {...defaultProps} isValid={false} />);
    const saveBtn = screen.getByRole('button', { name: /save workflow/i });
    expect(saveBtn).toBeDisabled();
  });

  it('renders Save button enabled when isValid=true and isSaving=false', () => {
    render(<WorkflowToolbar {...defaultProps} isValid={true} isSaving={false} />);
    const saveBtn = screen.getByRole('button', { name: /save workflow/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it('shows "Saving..." text when isSaving=true', () => {
    render(<WorkflowToolbar {...defaultProps} isSaving={true} />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('Undo button disabled when canUndo=false, enabled otherwise', () => {
    const { rerender } = render(<WorkflowToolbar {...defaultProps} canUndo={false} />);
    const undoBtn = screen.getByRole('button', { name: /undo/i });
    expect(undoBtn).toBeDisabled();

    rerender(<WorkflowToolbar {...defaultProps} canUndo={true} />);
    expect(screen.getByRole('button', { name: /undo/i })).not.toBeDisabled();
  });

  it('Redo button disabled when canRedo=false, enabled otherwise', () => {
    const { rerender } = render(<WorkflowToolbar {...defaultProps} canRedo={false} />);
    const redoBtn = screen.getByRole('button', { name: /redo/i });
    expect(redoBtn).toBeDisabled();

    rerender(<WorkflowToolbar {...defaultProps} canRedo={true} />);
    expect(screen.getByRole('button', { name: /redo/i })).not.toBeDisabled();
  });

  it('clicking Save calls onSave prop', () => {
    const onSave = vi.fn();
    render(<WorkflowToolbar {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /save workflow/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('clicking Undo/Redo calls respective props', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<WorkflowToolbar {...defaultProps} onUndo={onUndo} onRedo={onRedo} />);
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    fireEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('zoom controls call useReactFlow methods', () => {
    render(<WorkflowToolbar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }));
    fireEvent.click(screen.getByRole('button', { name: /fit view/i }));
    expect(mockZoomIn).toHaveBeenCalledOnce();
    expect(mockZoomOut).toHaveBeenCalledOnce();
    expect(mockFitView).toHaveBeenCalledOnce();
  });
});
