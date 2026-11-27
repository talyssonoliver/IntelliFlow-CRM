import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const m = vi.hoisted(() => ({
  status: vi.fn(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  options: {} as { onSuccess?: () => Promise<void>; onError?: (e: Error) => void },
  isPending: false,
}));

vi.mock('@intelliflow/ui', () => ({ toast: m.toast }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ emailLog: { status: { invalidate: m.invalidate } } }),
    emailLog: {
      status: { useQuery: m.status },
      logToContact: {
        useMutation: (options: typeof m.options) => {
          m.options = options;
          return { mutate: m.mutate, isPending: m.isPending };
        },
      },
    },
  },
}));

import { LogToContactButton } from '../LogToContactButton';

describe('LogToContactButton (#1177)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.isPending = false;
  });

  it('shows nothing until the link state is known', () => {
    m.status.mockReturnValue({ data: undefined });
    const { container } = render(<LogToContactButton emailId="e1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('logs the email to its contact in one click', () => {
    m.status.mockReturnValue({ data: { logged: false, contactId: null, leadId: null } });
    render(<LogToContactButton emailId="e1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Log to contact' }));

    expect(m.status).toHaveBeenCalledWith({ emailId: 'e1' }, { retry: false });
    expect(m.mutate).toHaveBeenCalledWith({ emailId: 'e1' });
  });

  it('confirms and refreshes the link state after logging', async () => {
    m.status.mockReturnValue({ data: { logged: false, contactId: null, leadId: null } });
    render(<LogToContactButton emailId="e1" />);

    await m.options.onSuccess?.();

    expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Logged to contact' }));
    expect(m.invalidate).toHaveBeenCalledWith({ emailId: 'e1' });
  });

  it('says why an email could not be logged', () => {
    m.status.mockReturnValue({ data: { logged: false, contactId: null, leadId: null } });
    render(<LogToContactButton emailId="e1" />);

    m.options.onError?.(new Error('No lead or contact has an address on this email.'));

    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not log this email',
        description: 'No lead or contact has an address on this email.',
        variant: 'destructive',
      })
    );
  });

  it('reads "Logged" once linked, with no button', () => {
    m.status.mockReturnValue({ data: { logged: true, contactId: 'c1', leadId: null } });
    render(<LogToContactButton emailId="e1" />);

    expect(screen.getByText('Logged')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log to contact' })).not.toBeInTheDocument();
  });

  it('cannot be clicked twice while logging', () => {
    m.isPending = true;
    m.status.mockReturnValue({ data: { logged: false, contactId: null, leadId: null } });
    render(<LogToContactButton emailId="e1" />);

    expect(screen.getByRole('button', { name: 'Log to contact' })).toBeDisabled();
  });
});
