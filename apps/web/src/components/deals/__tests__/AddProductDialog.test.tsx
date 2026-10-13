/**
 * @vitest-environment jsdom
 * AddProductDialog Component Tests (#421, IFC-280 deferred)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddProductDialog } from '../AddProductDialog';

let capturedOnOpenChange: ((open: boolean) => void) | undefined;
vi.mock('@intelliflow/ui', () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: Readonly<{
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }>) => {
    capturedOnOpenChange = onOpenChange;
    return open ? <div data-testid="dialog">{children}</div> : null;
  },
  DialogContent: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <p data-testid="dialog-description">{children}</p>
  ),
  DialogFooter: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

describe('AddProductDialog', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDialog = (props: Partial<React.ComponentProps<typeof AddProductDialog>> = {}) =>
    render(
      <AddProductDialog open={true} onSubmit={mockOnSubmit} onCancel={mockOnCancel} {...props} />
    );

  it('renders when open=true', () => {
    renderDialog();
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-title').textContent).toBe('Add Product');
  });

  it('does not render when open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('submit is disabled until name, quantity and unitPrice are all valid', () => {
    renderDialog();
    const submitBtn = screen.getByRole('button', { name: /add product/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Widget' } });
    expect(submitBtn).toBeDisabled(); // unitPrice still 0

    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: '10' } });
    expect(submitBtn).not.toBeDisabled();
  });

  it('calls onSubmit with the trimmed form data', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Name'), '  Widget  ');
    await user.type(screen.getByLabelText(/description/i), '  A test widget  ');
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: '19.99' } });

    await user.click(screen.getByRole('button', { name: /add product/i }));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'Widget',
      description: 'A test widget',
      quantity: 3,
      unitPrice: 19.99,
    });
  });

  it('cancel button calls onCancel', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('Dialog onOpenChange(false) triggers cancel', () => {
    renderDialog();
    expect(capturedOnOpenChange).toBeDefined();
    capturedOnOpenChange!(false);
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('shows "Adding…" and disables submit while isSubmitting', () => {
    renderDialog({ isSubmitting: true });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Widget' } });
    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: '10' } });
    const submitBtn = screen.getByRole('button', { name: /adding/i });
    expect(submitBtn).toBeDisabled();
  });

  it('resets the form fields when reopened', () => {
    const { rerender } = renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Widget' } });

    rerender(<AddProductDialog open={false} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
    rerender(<AddProductDialog open={true} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
  });
});
