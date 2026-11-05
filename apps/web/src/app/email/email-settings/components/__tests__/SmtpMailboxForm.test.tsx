/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import {
  smtpAccountFields,
  smtpAccountSummary,
  smtpEndpointFields,
  type MailboxDto,
} from '@intelliflow/validators';

const save = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const test_ = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    emailMailbox: {
      saveSmtp: { useMutation: () => save },
      testSmtpSettings: { useMutation: () => test_ },
    },
  },
}));

import { SmtpMailboxForm } from '../SmtpMailboxForm';

const HOST = 'smtp.mail.example.invalid';
const ADDRESS = 'me@mail.example.invalid';
// Runtime-built placeholder: never a real credential.
const PASSWORD = 'p'.repeat(12);

const smtpMailbox = (over: Partial<MailboxDto> = {}): MailboxDto => ({
  id: 'mb1',
  scope: 'USER',
  kind: 'SMTP',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: ADDRESS,
  fromName: 'Me',
  ...smtpEndpointFields(HOST, 465, 'SSL'),
  ...smtpAccountSummary(ADDRESS, true),
  imapHost: null,
  imapPort: null,
  imapUsername: null,
  hasImapPassword: false,
  bounceReadingEnabled: false,
  accountAddress: null,
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...over,
});

function renderForm(mailbox: MailboxDto | null = null, scope: 'USER' | 'TENANT' = 'USER') {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <SmtpMailboxForm scope={scope} mailbox={mailbox} onSaved={onSaved} onCancel={onCancel} />
  );
  return { onSaved, onCancel, ...utils };
}

const choose = (name: RegExp) => fireEvent.click(screen.getByRole('radio', { name }));
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save Mailbox' }));
const testConnection = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));

function fillOwnDomain() {
  choose(/^My own domain/i);
  type('Mail server', HOST);
  type('Email address', 'Me@Mail.example.invalid');
  type('Password', PASSWORD);
}

beforeEach(() => {
  vi.clearAllMocks();
  save.isPending = false;
  test_.isPending = false;
  save.mutateAsync.mockImplementation(async (input: any) =>
    smtpMailbox({ smtpHost: input.smtpHost })
  );
  test_.mutateAsync.mockResolvedValue({ ok: true, code: null });
});

describe('SmtpMailboxForm', () => {
  it('asks who provides the email first, with nothing chosen and no fields yet', () => {
    renderForm();
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole('radio', { name: /^My own domain/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Mailbox' })).not.toBeInTheDocument();
  });

  it('saves a mailbox on the customer own domain with the exact payload', async () => {
    const { onSaved } = renderForm();
    fillOwnDomain();
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save.mutateAsync).toHaveBeenCalledWith({
      scope: 'USER',
      ...smtpEndpointFields(HOST, 587, 'STARTTLS'),
      // The sign-in name keeps the address as typed; From is normalised by the schema.
      ...smtpAccountFields('Me@Mail.example.invalid', PASSWORD),
      fromAddress: ADDRESS,
      fromName: null,
      imapHost: null,
      imapPort: null,
      imapUsername: null,
      imapPassword: undefined,
    });
  });

  it.each([
    [/gmail/i, 'smtp.gmail.com', 587, 'STARTTLS'],
    [/microsoft 365/i, 'smtp.office365.com', 587, 'STARTTLS'],
    [/zoho/i, 'smtppro.zoho.com', 465, 'SSL'],
    [/yahoo/i, 'smtp.mail.yahoo.com', 465, 'SSL'],
    [/icloud/i, 'smtp.mail.me.com', 587, 'STARTTLS'],
    [/ionos/i, 'smtp.ionos.co.uk', 465, 'SSL'],
    [/namecheap/i, 'mail.privateemail.com', 465, 'SSL'],
    [/hostinger/i, 'smtp.hostinger.com', 465, 'SSL'],
    [/resend/i, 'smtp.resend.com', 465, 'SSL'],
  ])('fills the provider settings for %s', async (name, host, port, security) => {
    renderForm();
    choose(name);
    type('Email address', ADDRESS);
    type(/^(App password|Password|API key)$/, 'a'.repeat(16));
    testConnection();
    await waitFor(() => expect(test_.mutateAsync).toHaveBeenCalled());
    expect(test_.mutateAsync.mock.calls[0][0]).toMatchObject(
      smtpEndpointFields(host, port, security as 'SSL' | 'STARTTLS')
    );
  });

  it('gives Gmail its steps, its link and a plain password error', async () => {
    renderForm();
    choose(/gmail/i);
    expect(screen.getByText(/Google needs an app password/)).toBeInTheDocument();
    expect(screen.getByText(/2-Step Verification/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create a google app password/i })).toHaveAttribute(
      'href',
      'https://myaccount.google.com/apppasswords'
    );
    type('Email address', ADDRESS);
    submit();
    await waitFor(() =>
      expect(screen.getByLabelText('App password')).toHaveAccessibleDescription(
        'Enter the app password from Google.'
      )
    );
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('warns that Microsoft 365 needs SMTP AUTH and cannot read mail with a password', () => {
    renderForm();
    choose(/microsoft 365/i);
    expect(screen.getByText(/allow SMTP AUTH/)).toBeInTheDocument();
    expect(screen.getByText(/This only sends mail/)).toBeInTheDocument();
    expect(screen.getByText(/end of December 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('never asks for a password for Outlook, Hotmail or Live', () => {
    renderForm();
    choose(/^Outlook, Hotmail or Live/i);
    expect(screen.getByText(/need Microsoft sign-in/)).toBeInTheDocument();
    expect(screen.getByText(/sign-in isn't available yet/)).toBeInTheDocument();
    expect(screen.getByText(/connect another address/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test Connection' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Mailbox' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it.each(['pat@outlook.com', 'pat@hotmail.co.uk', 'pat@live.com'])(
    'stops %s reaching Microsoft 365 with a password',
    async (address) => {
      renderForm();
      choose(/microsoft 365/i);
      type('Email address', address);
      type('Password', PASSWORD);
      testConnection();
      await waitFor(() =>
        expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
          /need Microsoft sign-in/
        )
      );
      expect(test_.mutateAsync).not.toHaveBeenCalled();
    }
  );

  describe('once a problem is put right', () => {
    const address = () => screen.getByLabelText('Email address');

    async function stoppedOnPersonalAddress() {
      renderForm();
      choose(/microsoft 365/i);
      type('Email address', 'pat@outlook.com');
      type('Password', PASSWORD);
      testConnection();
      await waitFor(() => expect(address()).toHaveAccessibleDescription(/need Microsoft sign-in/));
    }

    it('drops the message when the address is corrected', async () => {
      await stoppedOnPersonalAddress();
      type('Email address', ADDRESS);
      expect(screen.queryByText(/need Microsoft sign-in/)).not.toBeInTheDocument();
      expect(address()).not.toHaveAttribute('aria-invalid');
    });

    it('drops the message when another provider is chosen', async () => {
      await stoppedOnPersonalAddress();
      choose(/resend/i);
      expect(screen.queryByText(/need Microsoft sign-in/)).not.toBeInTheDocument();
    });

    it('keeps the message while the address is still wrong', async () => {
      await stoppedOnPersonalAddress();
      type('Email address', 'pat@live.com');
      expect(address()).toHaveAccessibleDescription(/need Microsoft sign-in/);
    });

    it('does not mark a field that was never checked', async () => {
      await stoppedOnPersonalAddress();
      type('Password', '');
      expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid');
    });

    it('drops a save failure when the form is changed', async () => {
      save.mutateAsync.mockRejectedValue(new Error('The mailbox could not be saved.'));
      renderForm();
      fillOwnDomain();
      submit();
      await screen.findByText('The mailbox could not be saved.');
      type('Email address', ADDRESS);
      expect(screen.queryByText('The mailbox could not be saved.')).not.toBeInTheDocument();
    });
  });

  it('stops a personal Microsoft address on a typed Outlook server too', async () => {
    renderForm();
    choose(/^My own domain/i);
    type('Mail server', 'smtp-mail.outlook.com');
    type('Email address', 'pat@outlook.com');
    type('Password', PASSWORD);
    submit();
    await waitFor(() =>
      expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
        /need Microsoft sign-in/
      )
    );
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('lets a sending service send from any address it has verified', async () => {
    renderForm();
    choose(/resend/i);
    type('Email address', 'pat@live.example.invalid');
    type('API key', 'k'.repeat(20));
    testConnection();
    await waitFor(() => expect(test_.mutateAsync).toHaveBeenCalled());
  });

  it('names the likely cause when Microsoft refuses the password', async () => {
    test_.mutateAsync.mockResolvedValue({ ok: false, code: 'AUTH_FAILED' });
    renderForm();
    choose(/microsoft 365/i);
    type('Email address', ADDRESS);
    type('Password', PASSWORD);
    testConnection();
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Microsoft refused the password/);
    expect(status).toHaveTextContent(/allow SMTP AUTH/);
    expect(status).toHaveTextContent(/Outlook, Hotmail and Live addresses cannot use a password/);
  });

  it('keeps bounce reading visible on a saved Microsoft 365 mailbox that has it on', () => {
    renderForm(
      smtpMailbox({
        ...smtpEndpointFields('smtp.office365.com', 587, 'STARTTLS'),
        imapHost: 'imap.mail.example.invalid',
        imapPort: 993,
        imapUsername: ADDRESS,
      })
    );
    expect(screen.getByRole('checkbox', { name: /read bounce reports/i })).toBeChecked();
  });

  it('says the Zoho free plan cannot connect, and what to do', async () => {
    test_.mutateAsync.mockResolvedValue({ ok: false, code: 'AUTH_FAILED' });
    renderForm();
    choose(/zoho/i);
    expect(screen.getAllByText(/free plan/i).length).toBeGreaterThan(0);
    type('Email address', ADDRESS);
    type('Password', PASSWORD);
    testConnection();
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/free plan/);
    expect(status).toHaveTextContent(/paid Zoho plan/);
    expect(status).toHaveTextContent(/Resend/);
  });

  it('treats Resend as a sending service: API key, its own sign-in name, no IMAP', async () => {
    renderForm();
    choose(/resend/i);
    expect(screen.getByText(/only sends mail/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Resend always uses this name.')).toBeInTheDocument();
    type('Email address', ADDRESS);
    submit();
    await waitFor(() =>
      expect(screen.getByLabelText('API key')).toHaveAccessibleDescription(
        'Enter the API key from Resend.'
      )
    );
    type('API key', 'k'.repeat(20));
    testConnection();
    await waitFor(() => expect(test_.mutateAsync).toHaveBeenCalled());
    expect(test_.mutateAsync.mock.calls[0][0]).toMatchObject({
      ...smtpAccountFields('resend', 'k'.repeat(20)),
      fromAddress: ADDRESS,
      imapHost: null,
    });
  });

  it('types the address once: the sign-in name follows it until changed', () => {
    renderForm();
    choose(/gmail/i);
    type('Email address', ADDRESS);
    expect(screen.getByLabelText('Sign-in name')).toHaveValue(ADDRESS);
    type('Sign-in name', 'someone-else');
    type('Email address', 'other@mail.example.invalid');
    expect(screen.getByLabelText('Sign-in name')).toHaveValue('someone-else');
  });

  it('uses the part before the @ to read iCloud bounce reports', () => {
    renderForm();
    choose(/icloud/i);
    type('Email address', ADDRESS);
    fireEvent.click(screen.getByRole('checkbox', { name: /read bounce reports/i }));
    expect(screen.getByLabelText('Sign-in name for reading')).toHaveValue('me');
    expect(screen.getByLabelText('Sign-in name')).toHaveValue(ADDRESS);
  });

  it('removes the spaces providers show in an app password', async () => {
    renderForm();
    choose(/gmail/i);
    type('Email address', ADDRESS);
    type('App password', 'abcd efgh ijkl mnop');
    testConnection();
    await waitFor(() => expect(test_.mutateAsync).toHaveBeenCalled());
    expect(test_.mutateAsync.mock.calls[0][0]).toMatchObject(
      smtpAccountFields(ADDRESS, 'abcdefghijklmnop')
    );
  });

  it('has plain messages for an empty and a mistyped address', async () => {
    renderForm();
    choose(/gmail/i);
    submit();
    await waitFor(() =>
      expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
        'Enter your email address.'
      )
    );
    type('Email address', 'not-an-address');
    submit();
    await waitFor(() =>
      expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
        "That doesn't look like an email address."
      )
    );
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('marks invalid fields, moves focus to the first one and sends nothing', async () => {
    renderForm();
    choose(/^My own domain/i);
    type('Mail server', '127.0.0.1');
    submit();
    const host = screen.getByLabelText('Mail server');
    await waitFor(() => expect(document.activeElement).toBe(host));
    expect(host).toHaveAttribute('aria-invalid', 'true');
    expect(host).toHaveAccessibleDescription(/hostname/i);
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('opens Advanced when the problem is inside it', async () => {
    const { container } = renderForm();
    choose(/gmail/i);
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    type('Mail server', '127.0.0.1');
    type('Email address', ADDRESS);
    type('App password', PASSWORD);
    submit();
    await waitFor(() => expect(container.querySelector('details')).toHaveAttribute('open'));
    expect(document.activeElement).toBe(screen.getByLabelText('Mail server'));
  });

  it('keeps a stored password by sending no password at all', async () => {
    const { onSaved } = renderForm(smtpMailbox());
    expect(screen.getByLabelText('Mail server')).toHaveValue(HOST);
    expect(screen.getByRole('radio', { name: /^My own domain/i })).toBeChecked();
    type('Your name (optional)', 'Me Too');
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const input = save.mutateAsync.mock.calls[0][0];
    expect(input.smtpPassword).toBeUndefined();
    expect(input).toMatchObject({ smtpPort: 465, smtpSecurity: 'SSL', fromName: 'Me Too' });
  });

  it('recognises the provider of a saved mailbox', () => {
    renderForm(smtpMailbox(smtpEndpointFields('smtp.gmail.com', 587, 'STARTTLS')));
    expect(screen.getByRole('radio', { name: /gmail/i })).toBeChecked();
  });

  it('asks for the password again when the server changes', async () => {
    renderForm(smtpMailbox());
    type('Mail server', 'smtp.other.example.invalid');
    submit();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Replace password' })).toHaveAccessibleDescription(
        /Enter the password again/
      )
    );
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('collects bounce reading details on port 993, reusing the password above', async () => {
    const { onSaved } = renderForm();
    fillOwnDomain();
    fireEvent.click(screen.getByRole('checkbox', { name: /read bounce reports/i }));
    expect(screen.getByText('Port 993 (SSL/TLS)')).toBeInTheDocument();
    type('Server for reading mail (IMAP)', 'imap.mail.example.invalid');
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save.mutateAsync.mock.calls[0][0]).toMatchObject({
      imapHost: 'imap.mail.example.invalid',
      imapPort: 993,
      imapUsername: 'Me@Mail.example.invalid',
      imapPassword: PASSWORD,
    });
  });

  it('says bounce reading is optional, and what is lost without it', () => {
    renderForm();
    choose(/gmail/i);
    const label = screen.getByRole('checkbox', { name: /read bounce reports/i });
    expect(label).toHaveAccessibleDescription(/not taken off your lists automatically/);
  });

  describe('testing before saving', () => {
    it('tests the typed settings without saving them', async () => {
      renderForm();
      fillOwnDomain();
      testConnection();
      expect(await screen.findByRole('status')).toHaveTextContent(/It works/);
      expect(test_.mutateAsync).toHaveBeenCalledTimes(1);
      expect(save.mutateAsync).not.toHaveBeenCalled();
    });

    it('checks the fields first and does not test bad settings', async () => {
      renderForm();
      choose(/gmail/i);
      testConnection();
      await waitFor(() =>
        expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true')
      );
      expect(test_.mutateAsync).not.toHaveBeenCalled();
    });

    it.each([
      ['CONNECT_FAILED', /could not be reached/],
      ['TLS_FAILED', /port 465 goes with SSL\/TLS/i],
      ['TIMEOUT', /did not answer in time/],
    ])('explains %s in plain words', async (code, message) => {
      test_.mutateAsync.mockResolvedValue({ ok: false, code });
      renderForm();
      fillOwnDomain();
      testConnection();
      expect(await screen.findByRole('status')).toHaveTextContent(message);
    });

    it('clears the result when a field changes, and still lets the user save', async () => {
      test_.mutateAsync.mockResolvedValue({ ok: false, code: 'CONNECT_FAILED' });
      const { onSaved } = renderForm();
      fillOwnDomain();
      testConnection();
      await screen.findByRole('status');
      type('Your name (optional)', 'Me');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      testConnection();
      await screen.findByRole('status');
      submit();
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it('shows why a test could not run', async () => {
      test_.mutateAsync.mockRejectedValue(new Error('Too many connection tests.'));
      renderForm();
      fillOwnDomain();
      testConnection();
      expect(await screen.findByRole('alert')).toHaveTextContent('Too many connection tests.');
    });
  });

  it('shows the server error and keeps the form', async () => {
    save.mutateAsync.mockRejectedValue(new Error('Enter the password for this mailbox.'));
    const { onSaved } = renderForm();
    fillOwnDomain();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the password for this mailbox.'
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Mail server')).toHaveValue(HOST);
  });

  it('uses ids per scope so the personal and company forms can coexist', () => {
    renderForm(null, 'TENANT');
    expect(screen.getByRole('radio', { name: /gmail/i })).toHaveAttribute(
      'id',
      'company-provider-google'
    );
    choose(/^My own domain/i);
    expect(screen.getByLabelText('Mail server')).toHaveAttribute('id', 'company-smtp-host');
  });

  it('brings the next step into view when a provider is chosen, and not before', () => {
    renderForm();
    const form = document.querySelector('form') as HTMLFormElement;
    const panel = form.parentElement as HTMLElement;
    const locked = panel.parentElement as HTMLElement;
    panel.style.overflowY = 'auto';
    locked.style.overflowY = 'hidden';
    const rects = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function top(this: Element) {
        const position = this === panel ? 100 : 900;
        return { top: position } as DOMRect;
      });
    expect(panel.scrollTop).toBe(0);
    choose(/gmail/i);
    expect(panel.scrollTop).toBe(640);
    expect(locked.scrollTop).toBe(0);
    rects.mockRestore();
  });

  it('cancels, before and after choosing a provider', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    choose(/gmail/i);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('opens links in a new tab without leaving the form behind', () => {
    renderForm();
    choose(/gmail/i);
    const guide = screen.getByText(/Google needs an app password/).parentElement as HTMLElement;
    for (const link of within(guide).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('has no axe violations', async () => {
    const { container } = renderForm(smtpMailbox());
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
