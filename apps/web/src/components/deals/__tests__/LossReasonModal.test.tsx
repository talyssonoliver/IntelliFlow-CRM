/**
 * @vitest-environment jsdom
 * LossReasonModal Component Tests (IFC-064)
 * AC-005: CLOSED_LOST reason modal requiring >=10 char reason
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LossReasonModal } from '../LossReasonModal';

// Mock @intelliflow/ui Dialog components
let capturedOnOpenChange: ((open: boolean) => void) | undefined;
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange?: (open: boolean) => void }) => {
    capturedOnOpenChange = onOpenChange;
    return open ? <div data-testid="dialog">{children}</div> : null;
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="dialog-description">{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}));

describe('LossReasonModal', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with deal name when open=true', () => {
    render(
      <LossReasonModal
        open={true}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        dealName="Enterprise License"
      />
    );

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Enterprise License/)).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(
      <LossReasonModal
        open={false}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        dealName="Enterprise License"
      />
    );

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('cancel button calls onCancel', async () => {
    const user = userEvent.setup();
    render(
      <LossReasonModal
        open={true}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        dealName="Enterprise License"
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('submit button is disabled when reason is <10 characters', () => {
    render(
      <LossReasonModal
        open={true}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        dealName="Enterprise License"
      />
    );

    const submitBtn = screen.getByRole('button', { name: /confirm/i });
    expect(submitBtn).toBeDisabled();

    // Type a short reason (< 10 chars)
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Too short' } });

    expect(submitBtn).toBeDisabled();
  });

  it('Dialog onOpenChange(false) triggers cancel', () => {
    render(
      <LossReasonModal
        open={true}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        dealName="Enterprise License"
      />
    );

    // Simulate Dialog closing via onOpenChange(false)
    expect(capturedOnOpenChange).toBeDefined();
    capturedOnOpenChange!(false);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('Dialog onOpenChange(true) does NOT trigger cancel', () => {
    render(
      <LossReasonModal
        open={true}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        dealName="Enterprise License"
      />
    );

    // Opening should not trigger cancel
    capturedOnOpenChange!(true);

    expect(mockOnCancel).not.toHaveBeenCalled();
  });

  it('submit button calls onConfirm(reason) with valid reason (>=10 chars)', async () => {
    const user = userEvent.setup();
    render(
      <LossReasonModal
        open={true}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        dealName="Enterprise License"
      />
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Budget constraints prevented the deal from closing');

    const submitBtn = screen.getByRole('button', { name: /confirm/i });
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    expect(mockOnConfirm).toHaveBeenCalledWith('Budget constraints prevented the deal from closing');
  });
});
