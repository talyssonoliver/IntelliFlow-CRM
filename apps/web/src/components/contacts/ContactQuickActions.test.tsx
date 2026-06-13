import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';

const {
  mockMutateAsync,
  mockGetByIdInvalidate,
  mockUnifiedInvalidate,
  mockEntityInvalidate,
  mockToast,
  state,
} = vi.hoisted(() => ({
  mockMutateAsync: vi.fn(),
  mockGetByIdInvalidate: vi.fn(),
  mockUnifiedInvalidate: vi.fn(),
  mockEntityInvalidate: vi.fn(),
  mockToast: vi.fn(),
  state: {
    isPending: false,
    opts: undefined as
      | undefined
      | { onSuccess?: () => void; onError?: (e: { message: string }) => void },
  },
}));

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  toast: mockToast,
}));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      contact: { getById: { invalidate: mockGetByIdInvalidate } },
      activityFeed: {
        getUnifiedFeed: { invalidate: mockUnifiedInvalidate },
        getEntityFeed: { invalidate: mockEntityInvalidate },
      },
    }),
    contact: {
      logActivity: {
        useMutation: (opts: {
          onSuccess?: () => void;
          onError?: (e: { message: string }) => void;
        }) => {
          state.opts = opts;
          return { mutateAsync: mockMutateAsync, isPending: state.isPending };
        },
      },
    },
  },
}));

vi.mock('@/components/email/EmailCompose', () => ({
  EmailCompose: ({
    initialTo,
    onDiscard,
    onSent,
  }: {
    initialTo?: Array<{ name: string; email: string }>;
    onDiscard: () => void;
    onSent?: () => void;
  }) => (
    <div data-testid="email-compose">
      <span data-testid="email-compose-to">{initialTo?.[0]?.email ?? ''}</span>
      <button type="button" onClick={onDiscard}>
        Discard
      </button>
      <button type="button" onClick={() => onSent?.()}>
        Sent
      </button>
    </div>
  ),
}));

import { ContactQuickActions } from './ContactQuickActions';

const baseContact = {
  id: 'contact-1',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
};

function renderActions(email = baseContact.email) {
  render(<ContactQuickActions contact={{ ...baseContact, email }} />);
}

beforeEach(() => {
  state.isPending = false;
  state.opts = undefined;
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue(undefined);
  mockToast.mockClear();
  mockGetByIdInvalidate.mockClear();
  mockUnifiedInvalidate.mockClear();
  mockEntityInvalidate.mockClear();
});

afterEach(() => cleanup());

describe('ContactQuickActions (IFC-257) — Email', () => {
  it('disables the Email button when the contact has no email', () => {
    renderActions('');
    expect(screen.getByRole('button', { name: /Email/i })).toBeDisabled();
  });

  it('opens an EmailCompose sheet with an accessible name and the contact email pre-filled', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Email/i }));
    const dialog = screen.getByRole('dialog', { name: /Email Jane Smith/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByTestId('email-compose-to')).toHaveTextContent('jane@example.com');
  });

  it('closes the email sheet when EmailCompose is discarded', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Email/i }));
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
    expect(screen.queryByRole('dialog', { name: /Email Jane Smith/i })).not.toBeInTheDocument();
  });

  it('closes the email sheet when an email is sent', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Email/i }));
    fireEvent.click(screen.getByRole('button', { name: /Sent/i }));
    expect(screen.queryByRole('dialog', { name: /Email Jane Smith/i })).not.toBeInTheDocument();
  });
});

describe('ContactQuickActions (IFC-257) — Log Call', () => {
  it('opens the Log Call dialog with length-bounded inputs (mirrors logActivitySchema)', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    expect(within(dialog).getByLabelText(/Call Title/i)).toHaveAttribute('maxLength', '200');
    expect(within(dialog).getByLabelText(/Notes/i)).toHaveAttribute('maxLength', '2000');
  });

  it('logs the call with the CALL payload on submit', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    fireEvent.change(within(dialog).getByLabelText(/Call Title/i), {
      target: { value: 'Discovery call' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Notes/i), {
      target: { value: 'Discussed pricing' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Log Call/i }));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      contactId: 'contact-1',
      type: 'CALL',
      title: 'Discovery call',
      description: 'Discussed pricing',
    });
  });

  it('omits an empty description from the payload', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    fireEvent.change(within(dialog).getByLabelText(/Call Title/i), {
      target: { value: 'Quick call' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Log Call/i }));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      contactId: 'contact-1',
      type: 'CALL',
      title: 'Quick call',
      description: undefined,
    });
  });

  it('disables submit (and does not log) when the title is empty', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    const submit = within(dialog).getByRole('button', { name: /Log Call/i });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows a saving state while the mutation is pending', () => {
    state.isPending = true;
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    expect(within(dialog).getByRole('button', { name: /Saving/i })).toBeDisabled();
  });

  it('closes the dialog after a successful log', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    fireEvent.change(within(dialog).getByLabelText(/Call Title/i), {
      target: { value: 'Wrap-up call' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Log Call/i }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Log Call/i })).not.toBeInTheDocument()
    );
  });

  it('keeps the dialog open and preserves input when the mutation fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('network down'));
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    fireEvent.change(within(dialog).getByLabelText(/Call Title/i), {
      target: { value: 'Retry me' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Log Call/i }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const stillOpen = screen.getByRole('dialog', { name: /Log Call/i });
    expect(stillOpen).toBeInTheDocument();
    expect(within(stillOpen).getByLabelText(/Call Title/i)).toHaveValue('Retry me');
  });

  it('closes the dialog without logging when Cancel is clicked', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('dialog', { name: /Log Call/i })).not.toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

describe('ContactQuickActions (IFC-257) — mutation callbacks', () => {
  it('on success: toasts and invalidates the contact + activity feed queries', () => {
    renderActions();
    expect(state.opts?.onSuccess).toBeTypeOf('function');
    state.opts?.onSuccess?.();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Activity logged' }));
    expect(mockGetByIdInvalidate).toHaveBeenCalledWith({ id: 'contact-1' });
    expect(mockUnifiedInvalidate).toHaveBeenCalled();
    expect(mockEntityInvalidate).toHaveBeenCalled();
  });

  it('on error: shows a destructive toast with the error message', () => {
    renderActions();
    state.opts?.onError?.({ message: 'boom' });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', description: 'boom' })
    );
  });
});
