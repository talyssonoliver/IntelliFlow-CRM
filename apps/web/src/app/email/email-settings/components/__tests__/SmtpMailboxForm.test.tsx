/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import type { MailboxDto } from '@intelliflow/validators';

const save = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/lib/trpc', () => ({
  trpc: { emailMailbox: { saveSmtp: { useMutation: () => save } } },
}));

import { SmtpMailboxForm } from '../SmtpMailboxForm';

const HOST = 'smtp.mail.example.invalid';
// Runtime-built placeholder: never a real credential.
const PASSWORD = 'p'.repeat(12);

const smtpMailbox = (over: Partial<MailboxDto> = {}): MailboxDto => ({
  id: 'mb1',
  scope: 'USER',
  kind: 'SMTP',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: 'me@mail.example.invalid',
  fromName: 'Me',
  smtpHost: HOST,
  smtpPort: 465,
  smtpSecurity: 'SSL',
  smtpUsername: 'me@mail.example.invalid',
  hasSmtpPassword: true,
  imapHost: null,
  imapPort: null,
  imapUsername: null,
  hasImapPassword: false,
  bounceReadingEnabled: false,
  accountAddress: null,
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...over,
});

function chooseOption(name: string | RegExp) {
  const option = screen.getByRole('option', { name, hidden: true }) as HTMLOptionElement;
  fireEvent.change(option.closest('select') as HTMLSelectElement, {
    target: { value: option.value },
  });
}

function renderForm(mailbox: MailboxDto | null = null, scope: 'USER' | 'TENANT' = 'USER') {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <SmtpMailboxForm scope={scope} mailbox={mailbox} onSaved={onSaved} onCancel={onCancel} />
  );
  return { onSaved, onCancel, ...utils };
}

function fillNew() {
  fireEvent.change(screen.getByLabelText('SMTP server'), { target: { value: HOST } });
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'me@mail.example.invalid' },
  });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
  fireEvent.change(screen.getByLabelText('From address'), {
    target: { value: 'Me@Mail.example.invalid' },
  });
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save Mailbox' }));

beforeEach(() => {
  vi.clearAllMocks();
  save.isPending = false;
  save.mutateAsync.mockImplementation(async (input: any) =>
    smtpMailbox({ smtpHost: input.smtpHost })
  );
});

describe('SmtpMailboxForm', () => {
  it('saves a new SMTP mailbox with the exact payload', async () => {
    const { onSaved } = renderForm();
    fillNew();
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save.mutateAsync).toHaveBeenCalledWith({
      scope: 'USER',
      smtpHost: HOST,
      smtpPort: 587,
      smtpSecurity: 'STARTTLS',
      smtpUsername: 'me@mail.example.invalid',
      smtpPassword: PASSWORD,
      fromAddress: 'me@mail.example.invalid',
      fromName: null,
      imapHost: null,
      imapPort: null,
      imapUsername: null,
      imapPassword: undefined,
    });
  });

  it('fills the Gmail preset and explains that an app password is needed', () => {
    renderForm();
    chooseOption('Gmail');
    expect(screen.getByLabelText('SMTP server')).toHaveValue('smtp.gmail.com');
    expect(screen.getByText(/Gmail needs an app password/)).toBeInTheDocument();
    chooseOption('Outlook / Microsoft 365');
    expect(screen.getByLabelText('SMTP server')).toHaveValue('smtp.office365.com');
    expect(screen.getByText(/Microsoft 365 needs an app password/)).toBeInTheDocument();
  });

  it('marks invalid fields, moves focus to the first one and sends nothing', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('SMTP server'), { target: { value: '127.0.0.1' } });
    submit();
    const host = screen.getByLabelText('SMTP server');
    await waitFor(() => expect(document.activeElement).toBe(host));
    expect(host).toHaveAttribute('aria-invalid', 'true');
    expect(host).toHaveAccessibleDescription(/hostname/i);
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('keeps a stored password by sending no password at all', async () => {
    const { onSaved } = renderForm(smtpMailbox());
    expect(screen.getByLabelText('SMTP server')).toHaveValue(HOST);
    fireEvent.change(screen.getByLabelText('Display name (optional)'), {
      target: { value: 'Me Too' },
    });
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const input = save.mutateAsync.mock.calls[0][0];
    expect(input.smtpPassword).toBeUndefined();
    expect(input).toMatchObject({ smtpPort: 465, smtpSecurity: 'SSL', fromName: 'Me Too' });
  });

  it('asks for the password again when the server changes', async () => {
    renderForm(smtpMailbox());
    fireEvent.change(screen.getByLabelText('SMTP server'), {
      target: { value: 'smtp.other.example.invalid' },
    });
    submit();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Replace password' })).toHaveAccessibleDescription(
        /Re-enter the password/
      )
    );
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('collects IMAP details for bounce reading on port 993', async () => {
    const { onSaved } = renderForm();
    fillNew();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Read bounce reports (IMAP)' }));
    expect(screen.getByText('Port 993 (SSL/TLS)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('IMAP server'), {
      target: { value: 'imap.mail.example.invalid' },
    });
    fireEvent.change(screen.getByLabelText('IMAP username'), {
      target: { value: 'me@mail.example.invalid' },
    });
    fireEvent.change(screen.getByLabelText('IMAP password'), { target: { value: PASSWORD } });
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save.mutateAsync.mock.calls[0][0]).toMatchObject({
      imapHost: 'imap.mail.example.invalid',
      imapPort: 993,
      imapUsername: 'me@mail.example.invalid',
      imapPassword: PASSWORD,
    });
  });

  it('shows the server error and keeps the form', async () => {
    save.mutateAsync.mockRejectedValue(new Error('Enter the mailbox password.'));
    const { onSaved } = renderForm();
    fillNew();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the mailbox password.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('SMTP server')).toHaveValue(HOST);
  });

  it('uses ids per scope so the personal and company forms can coexist', () => {
    renderForm(null, 'TENANT');
    expect(screen.getByLabelText('SMTP server')).toHaveAttribute('id', 'company-smtp-host');
  });

  it('cancels', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = renderForm(smtpMailbox());
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
