import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupportTicketForm } from '../ticket-form';

// Mock the composed components
vi.mock('../TicketForm', () => ({
  TicketForm: ({ mode, onSubmit, onCancel, isSubmitting, renderBeforeActions }: Record<string, unknown>) => (
    <div data-testid="ticket-form" data-mode={mode} data-submitting={String(isSubmitting)}>
      <button data-testid="form-submit" onClick={() => (onSubmit as (d: Record<string, unknown>) => void)({ subject: 'Test' })}>
        Submit
      </button>
      <button data-testid="form-cancel" onClick={onCancel as () => void}>
        Cancel
      </button>
      {renderBeforeActions as React.ReactNode}
    </div>
  ),
}));

vi.mock('../file-uploader', () => ({
  FileUploader: ({ files, onChange, disabled }: Record<string, unknown>) => (
    <div
      data-testid="file-uploader"
      data-file-count={(files as File[]).length}
      data-disabled={String(disabled)}
    >
      <button
        data-testid="add-file"
        onClick={() =>
          (onChange as (f: File[]) => void)([
            ...(files as File[]),
            new File(['test'], 'test.pdf', { type: 'application/pdf' }),
          ])
        }
      >
        Add File
      </button>
    </div>
  ),
}));

describe('SupportTicketForm', () => {
  const defaultProps = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    isSubmitting: false,
  };

  it('renders TicketForm in mode="create"', () => {
    render(<SupportTicketForm {...defaultProps} />);
    const form = screen.getByTestId('ticket-form');
    expect(form).toHaveAttribute('data-mode', 'create');
  });

  it('renders FileUploader component below the form', () => {
    render(<SupportTicketForm {...defaultProps} />);
    expect(screen.getByTestId('ticket-form')).toBeInTheDocument();
    expect(screen.getByTestId('file-uploader')).toBeInTheDocument();
  });

  it('calls onSubmit with both form data and staged files', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SupportTicketForm {...defaultProps} onSubmit={onSubmit} />);

    // Submit the form
    const submitBtn = screen.getByTestId('form-submit');
    submitBtn.click();

    // Should have been called with form data and empty files array (no files staged)
    expect(onSubmit).toHaveBeenCalledWith({ subject: 'Test' }, []);
  });

  it('passes isSubmitting to TicketForm and FileUploader', () => {
    render(<SupportTicketForm {...defaultProps} isSubmitting={true} />);
    expect(screen.getByTestId('ticket-form')).toHaveAttribute('data-submitting', 'true');
    expect(screen.getByTestId('file-uploader')).toHaveAttribute('data-disabled', 'true');
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<SupportTicketForm {...defaultProps} onCancel={onCancel} />);
    screen.getByTestId('form-cancel').click();
    expect(onCancel).toHaveBeenCalled();
  });
});
