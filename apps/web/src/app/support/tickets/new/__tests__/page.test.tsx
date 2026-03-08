/**
 * Support New Ticket Page Tests (PG-047)
 *
 * Tests for the /support/tickets/new page.
 * Validates breadcrumbs, form rendering, ticket+attachment creation flow,
 * redirect, toast messages, and cancel navigation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}));

// Mock @intelliflow/ui (toast + Card)
const mockToast = vi.fn();
vi.mock('@intelliflow/ui', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
}));

// Mock SupportTicketForm — captures props for assertions
let _capturedFormProps: Record<string, unknown> = {};
vi.mock('@/components/tickets/ticket-form', () => ({
  SupportTicketForm: (props: Record<string, unknown>) => {
    _capturedFormProps = props;
    return (
      <div
        data-testid="support-ticket-form"
        data-is-submitting={String(props.isSubmitting)}
      >
        <button
          data-testid="form-submit"
          onClick={() =>
            (props.onSubmit as (d: Record<string, unknown>, f: File[]) => Promise<void>)(
              { subject: 'Test Ticket', priority: 'HIGH' },
              [],
            )
          }
        >
          Submit
        </button>
        <button
          data-testid="form-submit-with-files"
          onClick={() =>
            (props.onSubmit as (d: Record<string, unknown>, f: File[]) => Promise<void>)(
              { subject: 'Test Ticket' },
              [
                new File(['content1'], 'doc.pdf', { type: 'application/pdf' }),
                new File(['content2'], 'img.png', { type: 'image/png' }),
              ],
            )
          }
        >
          Submit With Files
        </button>
        <button
          data-testid="form-cancel"
          onClick={props.onCancel as () => void}
        >
          Cancel
        </button>
      </div>
    );
  },
}));

// Mock tRPC API
const mockCreateMutateAsync = vi.fn();
const mockAddAttachmentMutateAsync = vi.fn();
let mockCreateIsPending = false;
let mockAddAttachmentIsPending = false;

vi.mock('@/lib/api', () => ({
  api: {
    ticket: {
      create: {
        useMutation: () => ({
          mutateAsync: mockCreateMutateAsync,
          isPending: mockCreateIsPending,
        }),
      },
      addAttachment: {
        useMutation: () => ({
          mutateAsync: mockAddAttachmentMutateAsync,
          isPending: mockAddAttachmentIsPending,
        }),
      },
    },
  },
}));

let SupportNewTicketPage: () => React.JSX.Element;

beforeEach(async () => {
  vi.clearAllMocks();
  _capturedFormProps = {};
  mockCreateIsPending = false;
  mockAddAttachmentIsPending = false;
  mockCreateMutateAsync.mockResolvedValue({ id: 'ticket-abc-123' });
  mockAddAttachmentMutateAsync.mockResolvedValue({ id: 'att-1', name: 'doc.pdf', size: '1 KB' });
  const mod = await import('../page');
  SupportNewTicketPage = mod.default;
});

describe('SupportNewTicketPage', () => {
  it('renders breadcrumbs Support > Tickets > New Ticket', () => {
    render(<SupportNewTicketPage />);
    const breadcrumbs = screen.getByLabelText('Breadcrumb');
    expect(breadcrumbs.textContent).toContain('Support');
    expect(breadcrumbs.textContent).toContain('Tickets');
    expect(breadcrumbs.textContent).toContain('New Ticket');
  });

  it('renders SupportTicketForm component', () => {
    render(<SupportNewTicketPage />);
    expect(screen.getByTestId('support-ticket-form')).toBeInTheDocument();
  });

  it('on successful submit without files: creates ticket, shows toast, redirects', async () => {
    render(<SupportNewTicketPage />);
    await act(async () => {
      screen.getByTestId('form-submit').click();
    });

    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Test Ticket', priority: 'HIGH' }),
    );
    expect(mockAddAttachmentMutateAsync).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Ticket Created' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/support/tickets/ticket-abc-123');
  });

  it('on successful submit with files: creates ticket then uploads attachments', async () => {
    render(<SupportNewTicketPage />);
    await act(async () => {
      screen.getByTestId('form-submit-with-files').click();
    });

    expect(mockCreateMutateAsync).toHaveBeenCalled();
    // fileToBase64 is async (FileReader) — wait for attachment uploads
    await waitFor(() => {
      expect(mockAddAttachmentMutateAsync).toHaveBeenCalledTimes(2);
    });
    expect(mockAddAttachmentMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-abc-123',
        name: 'doc.pdf',
        fileType: 'application/pdf',
      }),
    );
    expect(mockAddAttachmentMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-abc-123',
        name: 'img.png',
        fileType: 'image/png',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/support/tickets/ticket-abc-123');
  });

  it('on ticket creation error: shows destructive toast, does NOT redirect', async () => {
    mockCreateMutateAsync.mockRejectedValue(new Error('Server error'));
    render(<SupportNewTicketPage />);
    await act(async () => {
      screen.getByTestId('form-submit').click();
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Failed to create ticket',
        variant: 'destructive',
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('on attachment upload error: shows partial success warning, still redirects', async () => {
    mockAddAttachmentMutateAsync.mockRejectedValue(new Error('Upload failed'));
    render(<SupportNewTicketPage />);
    await act(async () => {
      screen.getByTestId('form-submit-with-files').click();
    });

    // fileToBase64 is async — wait for the upload attempts + toast
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ticket created with warnings',
          variant: 'destructive',
        }),
      );
    });
    // Still redirects because ticket was created
    expect(mockPush).toHaveBeenCalledWith('/support/tickets/ticket-abc-123');
  });

  it('cancel navigates to /support/tickets', () => {
    render(<SupportNewTicketPage />);
    screen.getByTestId('form-cancel').click();
    expect(mockPush).toHaveBeenCalledWith('/support/tickets');
  });

  it('on successful submit with files and all uploads succeed: shows success toast', async () => {
    render(<SupportNewTicketPage />);
    await act(async () => {
      screen.getByTestId('form-submit-with-files').click();
    });

    // fileToBase64 is async — wait for the upload flow to complete
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ticket Created',
          description: expect.stringContaining('attachments'),
        }),
      );
    });
  });
});
