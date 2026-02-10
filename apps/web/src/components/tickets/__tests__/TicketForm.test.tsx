/**
 * TicketForm Component Tests (PG-137)
 *
 * Tests for create/edit ticket form with validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TicketForm } from '../TicketForm';

describe('TicketForm', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all form fields', () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contact name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contact email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/channel/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
  });

  it('renders in create mode with empty fields', () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    const subjectInput = screen.getByLabelText(/subject/i) as HTMLInputElement;
    expect(subjectInput.value).toBe('');
  });

  it('renders in edit mode with initial data', () => {
    const initialData = {
      subject: 'Test Ticket',
      contactName: 'John Doe',
      contactEmail: 'john@example.com',
      priority: 'HIGH' as const,
    };

    render(
      <TicketForm
        initialData={initialData}
        onSubmit={onSubmit}
        onCancel={onCancel}
        isSubmitting={false}
        mode="edit"
      />
    );

    const subjectInput = screen.getByLabelText(/subject/i) as HTMLInputElement;
    expect(subjectInput.value).toBe(initialData.subject);

    const contactNameInput = screen.getByLabelText(/contact name/i) as HTMLInputElement;
    expect(contactNameInput.value).toBe(initialData.contactName);
  });

  it('shows error when subject is empty on submit', async () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    const submitButton = screen.getByRole('button', { name: /create ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/subject is required/i)).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows error when contact name is empty', async () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    const subjectInput = screen.getByLabelText(/subject/i);
    fireEvent.change(subjectInput, { target: { value: 'Test Subject' } });

    const submitButton = screen.getByRole('button', { name: /create ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/contact name is required/i)).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows error when email format is invalid', async () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    const emailInput = screen.getByLabelText(/contact email/i);
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

    const submitButton = screen.getByRole('button', { name: /create ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates and calls onSubmit with valid data', async () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    fireEvent.change(screen.getByLabelText(/subject/i), {
      target: { value: 'Test Ticket' },
    });
    fireEvent.change(screen.getByLabelText(/contact name/i), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: 'john@example.com' },
    });

    const submitButton = screen.getByRole('button', { name: /create ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Test Ticket',
          contactName: 'John Doe',
          contactEmail: 'john@example.com',
        })
      );
    });
  });

  it('disables submit button when isSubmitting=true', () => {
    render(
      <TicketForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        isSubmitting={true}
        mode="create"
      />
    );

    const submitButton = screen.getByRole('button', { name: /create ticket/i });
    expect(submitButton).toBeDisabled();
  });

  it('calls onCancel when cancel clicked', () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('has aria-invalid on error fields', async () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    const submitButton = screen.getByRole('button', { name: /create ticket/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const subjectInput = screen.getByLabelText(/subject/i);
      expect(subjectInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('allows selecting priority from dropdown', () => {
    render(<TicketForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={false} mode="create" />);

    const prioritySelect = screen.getByLabelText(/priority/i);
    fireEvent.change(prioritySelect, { target: { value: 'HIGH' } });

    expect((prioritySelect as HTMLSelectElement).value).toBe('HIGH');
  });
});
