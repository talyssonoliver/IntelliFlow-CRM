import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

import { ContactQuickActions, type ContactLogCallInput } from './ContactQuickActions';

type LogCallHandler = (input: ContactLogCallInput) => void;

// Mock EmailCompose to avoid pulling the trpc/email module graph; assert it
// receives the contact email via initialTo.
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

const baseContact = {
  id: 'contact-1',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
};

function renderActions(overrides?: {
  email?: string;
  onLogCall?: LogCallHandler;
  isLoggingCall?: boolean;
}) {
  const onLogCall = overrides?.onLogCall ?? vi.fn<LogCallHandler>();
  render(
    <ContactQuickActions
      contact={{ ...baseContact, email: overrides?.email ?? baseContact.email }}
      onLogCall={onLogCall}
      isLoggingCall={overrides?.isLoggingCall ?? false}
    />
  );
  return { onLogCall };
}

afterEach(() => cleanup());

describe('ContactQuickActions (IFC-257) — Email', () => {
  it('disables the Email button when the contact has no email', () => {
    renderActions({ email: '' });
    expect(screen.getByRole('button', { name: /Email/i })).toBeDisabled();
  });

  it('opens an EmailCompose sheet with an accessible name and the contact email pre-filled', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Email/i }));
    // NF-002: the sheet exposes an accessible name via SheetTitle.
    const dialog = screen.getByRole('dialog', { name: /Email Jane Smith/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByTestId('email-compose-to')).toHaveTextContent('jane@example.com');
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

  it('calls onLogCall with the CALL payload on submit', () => {
    const onLogCall = vi.fn<LogCallHandler>();
    renderActions({ onLogCall });
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    fireEvent.change(within(dialog).getByLabelText(/Call Title/i), {
      target: { value: 'Discovery call' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Notes/i), {
      target: { value: 'Discussed pricing' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Log Call/i }));
    expect(onLogCall).toHaveBeenCalledWith({
      contactId: 'contact-1',
      type: 'CALL',
      title: 'Discovery call',
      description: 'Discussed pricing',
    });
  });

  it('omits an empty description from the payload', () => {
    const onLogCall = vi.fn<LogCallHandler>();
    renderActions({ onLogCall });
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    fireEvent.change(within(dialog).getByLabelText(/Call Title/i), {
      target: { value: 'Quick call' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Log Call/i }));
    expect(onLogCall).toHaveBeenCalledWith({
      contactId: 'contact-1',
      type: 'CALL',
      title: 'Quick call',
      description: undefined,
    });
  });

  it('disables submit (and does not call onLogCall) when the title is empty', () => {
    const onLogCall = vi.fn<LogCallHandler>();
    renderActions({ onLogCall });
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    const submit = within(dialog).getByRole('button', { name: /Log Call/i });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onLogCall).not.toHaveBeenCalled();
  });

  it('shows a saving state while the mutation is pending', () => {
    renderActions({ isLoggingCall: true });
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    expect(within(dialog).getByRole('button', { name: /Saving/i })).toBeDisabled();
  });

  it('closes the dialog without logging when Cancel is clicked', () => {
    const onLogCall = vi.fn<LogCallHandler>();
    renderActions({ onLogCall });
    fireEvent.click(screen.getByRole('button', { name: /Log Call/i }));
    const dialog = screen.getByRole('dialog', { name: /Log Call/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('dialog', { name: /Log Call/i })).not.toBeInTheDocument();
    expect(onLogCall).not.toHaveBeenCalled();
  });
});

describe('ContactQuickActions (IFC-257) — sheet close handlers', () => {
  it('closes the email sheet when EmailCompose is discarded', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Email/i }));
    expect(screen.getByRole('dialog', { name: /Email Jane Smith/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
    expect(screen.queryByRole('dialog', { name: /Email Jane Smith/i })).not.toBeInTheDocument();
  });

  it('closes the email sheet when an email is sent', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Email/i }));
    expect(screen.getByRole('dialog', { name: /Email Jane Smith/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sent/i }));
    expect(screen.queryByRole('dialog', { name: /Email Jane Smith/i })).not.toBeInTheDocument();
  });
});
